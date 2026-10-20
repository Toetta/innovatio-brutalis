import test from 'node:test';
import assert from 'node:assert/strict';
import { cutoffIso, retentionTargets, previewRetention, applyRetention } from '../functions/api/_lib/retention.js';
import { onRequestGet, onRequestPost } from '../functions/api/admin/retention.js';

const clock = new Date('2026-10-20T12:00:00.000Z');
const mockDb = () => {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      const statement = {
        bind(...params) { calls.push({ sql, params }); return statement; },
        async first() { return { count: 2 }; },
        async run() { return { meta: { changes: 2 } }; },
      };
      return statement;
    },
  };
};

test('30 day UTC cutoff', () => {
  assert.equal(cutoffIso(clock, 30), '2026-09-20T12:00:00.000Z');
  assert.throws(() => cutoffIso('invalid', 30));
});
test('only 3 allowed tables', () => {
  assert.deepEqual(retentionTargets(clock).map(x => x.table), [
    'sessions', 'magic_links', 'custom_quote_rate_limits',
  ]);
});
test('preview is SELECT only; cleanup only allowed transient tables', async () => {
  const db = mockDb();
  const preview = await previewRetention(db, clock);
  assert.equal(preview.sessions.eligible, 2);
  assert.equal(db.calls.length, 3);
  assert(db.calls.every(x => x.sql.startsWith('SELECT COUNT')));
  const removed = await applyRetention(db, clock);
  assert.equal(removed.magic_links, 2);
  assert.equal(db.calls.length, 6);
  assert(db.calls.slice(3).every(x => x.sql.startsWith('DELETE FROM')));
  assert(db.calls.every(x => !/customers|orders|custom_quotes|payment_events|fu_sync_payloads/.test(x.sql)));
});
test('unauthorized endpoints and default POST are blocked before DB access', async () => {
  const db = mockDb();
  const env = { ADMIN_CUSTOM_KEY: 'example-secret', DB: db };
  const anonymous = new Request('https://example.test/api/admin/retention');
  assert.equal((await onRequestGet({ request: anonymous, env })).status, 403);
  const request = new Request('https://example.test/api/admin/retention', {
    method: 'POST', headers: { 'X-Admin-Key': 'example-secret' },
  });
  assert.equal((await onRequestPost({ request, env })).status, 403);
  assert.equal(db.calls.length, 0);
});
test('authorized GET is a read-only preview', async () => {
  const db = mockDb();
  const env = { ADMIN_CUSTOM_KEY: 'example-secret', DB: db };
  const request = new Request('https://example.test/api/admin/retention', {
    headers: { 'X-Admin-Key': 'example-secret' },
  });
  const response = await onRequestGet({ request, env });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.dry_run, true);
  assert.equal(result.targets.magic_links.eligible, 2);
  assert(db.calls.every(x => x.sql.startsWith('SELECT')));
});
test('both flags without confirmation still cannot delete', async () => {
  const db = mockDb();
  const env = { ADMIN_CUSTOM_KEY: 'example-secret', DB: db,
    GDPR_RETENTION_WRITE_ENABLED: 'true', GDPR_RETENTION_PRODUCTION_APPROVED: 'true' };
  const request = new Request('https://example.test/api/admin/retention', {
    method: 'POST', headers: { 'X-Admin-Key': 'example-secret', 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmation: 'NO' }),
  });
  assert.equal((await onRequestPost({ request, env })).status, 400);
  assert.equal(db.calls.length, 0);
});
