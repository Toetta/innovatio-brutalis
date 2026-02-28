import { badRequest, forbidden, json, notFound } from "../../../_lib/resp.js";
import { requireAdminKey } from "../../../_lib/auth.js";
import { assertDb, exec, one } from "../../../_lib/db.js";
import { nowIso } from "../../../_lib/crypto.js";
import { queueFuPayloadForOrder } from "../../../_lib/fu.js";

export const onRequestPost = async (context) => {
  const { request, env, params } = context;
  if (!requireAdminKey({ request, env })) return forbidden();

  const id = String(params?.id || "");
  if (!id) return notFound();

  const db = assertDb(env);
  const order = await one(db.prepare("SELECT id, status FROM orders WHERE id = ? LIMIT 1").bind(id).all());
  if (!order) return notFound();

  let kind = "";
  if (order.status === "paid") kind = "sale";
  if (order.status === "refunded") kind = "refund";
  if (!kind) return badRequest("Order not in paid/refunded");

  const existing = await one(
    db.prepare("SELECT id FROM fu_sync_payloads WHERE entity_type = 'order' AND entity_id = ? AND kind = ? LIMIT 1").bind(id, kind).all()
  );

  if (existing?.id) {
    const ts = nowIso();
    await exec(
      db,
      "UPDATE fu_sync_payloads SET status = 'queued', sent_at = NULL, acked_at = NULL, voucher_id = NULL, error = NULL WHERE id = ?",
      [existing.id]
    );
    await exec(db, "UPDATE orders SET fu_sync_status = 'queued', fu_sync_error = NULL, updated_at = ? WHERE id = ?", [ts, id]);
    return json({ ok: true, requeued: true, payload_id: existing.id });
  }

  const res = await queueFuPayloadForOrder({ env, orderId: id, kind });
  if (!res.ok) return badRequest(res.error || "Could not queue");
  return json({ ok: true, queued: true, payload_id: res.id });
};
