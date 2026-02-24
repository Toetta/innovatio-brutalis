import { forbidden, json } from "../_lib/resp.js";
import { assertDb, all, exec } from "../_lib/db.js";
import { nowIso } from "../_lib/crypto.js";
import { requireFuKey } from "../_lib/fu.js";

export const onRequestGet = async (context) => {
  const { request, env } = context;
  if (!requireFuKey({ request, env })) return forbidden();

  const url = new URL(request.url);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") || 20)));
  const db = assertDb(env);

  const rows = await all(
    db.prepare(
      "SELECT id, order_id, kind, payload, created_at FROM fu_sync_payloads WHERE status = 'queued' ORDER BY created_at ASC LIMIT ?"
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
      order_id: r.order_id,
      kind: r.kind,
      created_at: r.created_at,
      payload: obj,
    };
  });

  return json({ ok: true, payloads });
};
