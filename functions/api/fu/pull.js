import { corsPreflight, forbidden, json, withCors } from "../_lib/resp.js";
import { assertDb, all, exec } from "../_lib/db.js";
import { nowIso } from "../_lib/crypto.js";
import { requireFuKey } from "../_lib/fu.js";

const corsOpts = ({ request, env }) => ({
  request,
  env,
  allowMethods: "GET, OPTIONS",
  allowHeaders: "content-type, x-fu-key",
});

export const onRequestOptions = async (context) => {
  return corsPreflight(context, corsOpts(context));
};

export const onRequestGet = async (context) => {
  const { request, env } = context;
  if (!requireFuKey({ request, env })) return withCors(forbidden(), corsOpts(context));

  const url = new URL(request.url);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") || 20)));
  const db = assertDb(env);

  const rows = await all(
    db.prepare(
      "SELECT id, entity_type, entity_id, kind, payload, created_at FROM fu_sync_payloads WHERE status = 'queued' ORDER BY created_at ASC LIMIT ?"
    ).bind(limit).all()
  );

  const sent_at = nowIso();
  for (const r of rows) {
    await exec(db, "UPDATE fu_sync_payloads SET status = 'sent', sent_at = ? WHERE id = ? AND status = 'queued'", [sent_at, r.id]);
  }

  const payloads = rows.map((r) => {
    let obj = null;
    try { obj = JSON.parse(String(r.payload || "null")); } catch (_) { obj = null; }
    return {
      id: r.id,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      order_id: r.entity_type === "order" ? r.entity_id : null,
      kind: r.kind,
      created_at: r.created_at,
      payload: obj,
    };
  });

  return withCors(json({ ok: true, payloads }), corsOpts(context));
};
