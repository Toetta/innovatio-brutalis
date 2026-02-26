import { badRequest, forbidden, json } from "../_lib/resp.js";
import { assertDb, all, exec } from "../_lib/db.js";
import { nowIso } from "../_lib/crypto.js";
import { requireFuKey } from "../_lib/fu.js";

export const onRequestGet = async (context) => {
  const { request, env } = context;
  if (!requireFuKey({ request, env })) return forbidden();

  const url = new URL(request.url);
  const status = String(url.searchParams.get("status") || "ready").trim().toLowerCase();
  if (status !== "ready") return badRequest("Unsupported status");

  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") || 20)));

  const db = assertDb(env);
  const rows = await all(
    db
      .prepare(
        "SELECT id, order_number, placed_at, status, exported_to_fu, fu_payload_json FROM orders WHERE status = 'paid' AND exported_to_fu = 0 AND fu_payload_json IS NOT NULL ORDER BY placed_at ASC LIMIT ?"
      )
      .bind(limit)
      .all()
  );

  const orders = rows.map((r) => {
    let payload = null;
    try {
      payload = r.fu_payload_json ? JSON.parse(String(r.fu_payload_json)) : null;
    } catch (_) {
      payload = null;
    }
    return {
      id: r.id,
      order_number: r.order_number,
      placed_at: r.placed_at,
      payload,
    };
  });

  return json({ ok: true, orders });
};

// FU acknowledges successful import so we can mark exported_to_fu.
export const onRequestPost = async (context) => {
  const { request, env } = context;
  if (!requireFuKey({ request, env })) return forbidden();

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return badRequest("Invalid JSON");
  }

  const idsRaw = body?.order_ids;
  const ids = Array.isArray(idsRaw) ? idsRaw.map((x) => String(x || "").trim()).filter(Boolean) : [];
  if (!ids.length) return badRequest("Missing order_ids");
  if (ids.length > 50) return badRequest("Too many order_ids");

  const ok = Boolean(body?.ok);
  if (!ok) return badRequest("ok=false not supported");

  const db = assertDb(env);
  const ts = nowIso();
  for (const id of ids) {
    await exec(db, "UPDATE orders SET exported_to_fu = 1, exported_to_fu_at = COALESCE(exported_to_fu_at, ?), updated_at = ? WHERE id = ?", [ts, ts, id]);
  }

  return json({ ok: true, updated: ids.length });
};
