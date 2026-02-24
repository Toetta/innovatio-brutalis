import { badRequest, json, notFound, unauthorized } from "../../_lib/resp.js";
import { assertDb, exec, one } from "../../_lib/db.js";
import { nowIso, uuid, sha256Hex } from "../../_lib/crypto.js";
import { getKlarnaOrder } from "../../_lib/klarna.js";
import { queueFuPayloadForOrder } from "../../_lib/fu.js";

const normalizeStatus = (klarnaOrder) => {
  const s = String(klarnaOrder?.status || "").toUpperCase();
  // Klarna OM statuses vary by product/version. Treat these as paid-enough for our purposes.
  if (s === "AUTHORIZED" || s === "CAPTURED" || s === "PART_CAPTURED") return "paid";
  if (s === "CANCELLED" || s === "CANCELED") return "cancelled";
  return "unknown";
};

export const onRequestPost = async (context) => {
  const { request, env } = context;
  const db = assertDb(env);

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return badRequest("Invalid JSON");
  }

  const order_id = String(body?.order_id || "");
  const token = String(body?.token || "");
  if (!order_id) return badRequest("Missing order_id");
  if (!token) return unauthorized("Missing token");

  const tokenHash = await sha256Hex(token);
  const order = await one(db.prepare("SELECT * FROM orders WHERE id = ? AND public_token_hash = ? LIMIT 1").bind(order_id, tokenHash).all());
  if (!order) return notFound("Order not found");

  if (String(order.payment_provider || "").toLowerCase() !== "klarna") {
    return badRequest("Order not Klarna");
  }

  // Idempotent: if already paid/refunded/cancelled, just return.
  if (["paid", "refunded", "cancelled"].includes(String(order.status))) {
    return json({ ok: true, status: String(order.status) });
  }

  const klarnaOrderId = String(order.payment_reference || "");
  if (!klarnaOrderId) return badRequest("Missing Klarna order id");

  const klarnaOrder = await getKlarnaOrder({ env, order_id: klarnaOrderId });
  const mapped = normalizeStatus(klarnaOrder);

  const ts = nowIso();
  // Best-effort audit; unique key is provider+event_id
  try {
    await exec(
      db,
      "INSERT INTO payment_events (id, provider, event_id, type, order_id, created_at, payload) VALUES (?,?,?,?,?,?,?)",
      [uuid(), "klarna", `${klarnaOrderId}:verify`, "order.verified", order_id, ts, JSON.stringify(klarnaOrder)]
    );
  } catch (_) {}

  if (mapped === "paid") {
    await exec(
      db,
      "UPDATE orders SET status = 'paid', paid_at = COALESCE(paid_at, ?), updated_at = ? WHERE id = ?",
      [ts, ts, order_id]
    );
    await queueFuPayloadForOrder({ env, orderId: order_id, kind: "sale" }).catch(() => null);
    return json({ ok: true, status: "paid" });
  }

  if (mapped === "cancelled") {
    await exec(db, "UPDATE orders SET status = 'cancelled', updated_at = ? WHERE id = ?", [ts, order_id]);
    return json({ ok: true, status: "cancelled" });
  }

  // Unknown / still pending
  return json({ ok: true, status: String(order.status || "awaiting_action"), klarna_status: String(klarnaOrder?.status || "") });
};
