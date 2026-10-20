import { assertDb } from '../_lib/db.js';
import { requireCustomAdminKey } from '../_lib/auth.js';
import { json, forbidden, withCors, corsPreflight } from '../_lib/resp.js';
import { previewRetention, applyRetention, RETENTION_DAYS } from '../_lib/retention.js';

const corsOptions = { allowMethods: 'GET,POST,OPTIONS', allowHeaders: 'content-type, x-admin-key' };
const respond = (result, context) => withCors(result, { ...context, ...corsOptions });

export const onRequestOptions = (context) => corsPreflight(context, corsOptions);

// This endpoint is private and always requires the existing admin API key.
export const onRequestGet = async (context) => {
  const { request, env } = context;
  if (!requireCustomAdminKey({ request, env })) return respond(forbidden(), context);
  try {
    const targets = await previewRetention(assertDb(env));
    return respond(json({ ok: true, dry_run: true, retention_days: RETENTION_DAYS, targets }), context);
  } catch {
    return respond(json({ ok: false, error: 'Retention preview failed' }, { status: 500 }), context);
  }
};

// POST is intentionally locked behind TWO production flags and exact JSON
// confirmation; neither flag should be configured before separate approval.
export const onRequestPost = async (context) => {
  const { request, env } = context;
  if (!requireCustomAdminKey({ request, env })) return respond(forbidden(), context);
  if (env?.GDPR_RETENTION_WRITE_ENABLED !== 'true' ||
      env?.GDPR_RETENTION_PRODUCTION_APPROVED !== 'true') {
    return respond(forbidden('Retention writes are disabled'), context);
  }
  let body;
  try { body = await request.json(); }
  catch { return respond(json({ ok: false, error: 'Invalid JSON' }, { status: 400 }), context); }
  if (body?.confirmation !== 'DELETE_EXPIRED_AUTH_DATA') {
    return respond(json({ ok: false, error: 'Exact confirmation required' }, { status: 400 }), context);
  }
  try {
    const db = assertDb(env);
    const before = await previewRetention(db);
    const removed = await applyRetention(db);
    return respond(json({ ok: true, dry_run: false, before, removed }), context);
  } catch {
    return respond(json({ ok: false, error: 'Retention execution failed; inspect counts before retry' }, { status: 500 }), context);
  }
};
