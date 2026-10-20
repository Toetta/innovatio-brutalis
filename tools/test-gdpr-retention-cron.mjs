import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { RETENTION_CRON } from '../workers/retention-cron.js';

function mockDb() {
  const sqls = [];
  return {
    sqls,
    prepare(sql) {
      sqls.push(sql);
      const statement = {
        bind() { return statement; },
        async first() { return { count: 1 }; },
        async run() { return { meta: { changes: 1 } }; },
      };
      return statement;
    },
  };
}
const controller = { cron: RETENTION_CRON, scheduledTime: Date.parse('2026-10-20T03:00:00.000Z') };

test('scheduled endpoint has no public API', async () => {
  assert.equal((await worker.fetch()).status, 404);
});
test('cron disabled by default: no DB reads or writes', async () => {
  const db = mockDb();
  await worker.scheduled(controller, { DB: db });
  assert.equal(db.sqls.length, 0);
});
test('both explicit flags required before any DB operations', async () => {
  for (const vars of [
    { GDPR_RETENTION_CRON_ENABLED: 'true' },
    { GDPR_RETENTION_PRODUCTION_APPROVED: 'true' },
  ]) {
    const db = mockDb();
    await worker.scheduled(controller, { DB: db, ...vars });
    assert.equal(db.sqls.length, 0);
  }
});
test('only scheduled cron is accepted', async () => {
  const db = mockDb();
  await assert.rejects(() => worker.scheduled({ ...controller, cron: '* * * * *' }, {
    DB: db, GDPR_RETENTION_CRON_ENABLED: 'true', GDPR_RETENTION_PRODUCTION_APPROVED: 'true'
  }));
  assert.equal(db.sqls.length, 0);
});
test('enabled daily run deletes only 3 transient tables', async () => {
  const db = mockDb();
  await worker.scheduled(controller, {
    DB: db, GDPR_RETENTION_CRON_ENABLED: 'true', GDPR_RETENTION_PRODUCTION_APPROVED: 'true'
  });
  assert.equal(db.sqls.length, 6);
  assert(db.sqls.slice(0, 3).every(sql => sql.startsWith('SELECT COUNT')));
  assert.deepEqual(db.sqls.slice(3), [
    'DELETE FROM sessions WHERE expires_at < ?',
    'DELETE FROM magic_links WHERE expires_at < ?',
    'DELETE FROM custom_quote_rate_limits WHERE created_at < ?',
  ]);
  assert(db.sqls.every(sql => !/customers|orders|payment_events|fu_sync_payloads|custom_quotes/.test(sql)));
});
