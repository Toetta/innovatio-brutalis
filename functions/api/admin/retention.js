import { assertDb } from '../_lib/db.js';
import { requireCustomAdminKey } from '../_lib/auth.js';
import { json, forbidden } from '../_lib/resp.js';
import { previewRetention, applyRetention, RETENTION_DAYS } from '../_lib/retention.js';

// This endpoint is private and always requires the existing admin API key.
export const onRequestGet = async ({ request, env }) => {
  if (!requireCustomAdminKey({ request, env })) return forbidden();
  try {
    const targets = await previewRetention(assertDb(env));
    return json({ ok: true, dry_run: true, retention_days: RETENTION_DAYS, targets });
  } catch {
    return json({ ok: false, error: 'Retention preview failed' }, { status: 500 });
  }
};

// POST is intentionally locked behind TWO production flags and exact JSON
// confirmation; neither flag should be configured before separate approval.
export const onRequestPost = async ({ request, env }) => {
  if (!requireCustomAdminKey({ request, env })) return forbidden();
  if (env?.GDPR_RETENTION_WRITE_ENABLED !== 'true' ||
      env?.GDPR_RETENTION_PRODUCTION_APPROVED !== 'true') {
    return forbidden('Retention writes are disabled');
  }
  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }
  if (body?.confirmation !== 'DELETE_EXPIRED_AUTH_DATA') {
    return json({ ok: false, error: 'Exact confirmation required' }, { status: 400 });
  }
  try {
    const db = assertDb(env);
    const before = await previewRetention(db);
    const removed = await applyRetention(db);
    return json({ ok: true, dry_run: false, before, removed });
  } catch {
    return json({ ok: false, error: 'Retention execution failed; inspect counts before retry' }, { status: 500 });
  }
};
