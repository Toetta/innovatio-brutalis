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

  let body = {};
  try {
    body = await request.json();
  } catch (_) {
    body = {};
  }

  const provider = String(body?.payment_provider || "swish").trim().toLowerCase();
  const reference = body?.payment_reference != null ? String(body.payment_reference) : null;

  const db = assertDb(env);
  const order = await one(db.prepare("SELECT id, status FROM orders WHERE id = ? LIMIT 1").bind(id).all());
  if (!order) return notFound("Order not found");

  if (!["pending_payment", "awaiting_action", "failed"].includes(String(order.status))) {
    return badRequest("Order not in a payable state");
  }

  const ts = nowIso();
  await exec(
    db,
    "UPDATE orders SET status = 'paid', paid_at = COALESCE(paid_at, ?), payment_provider = ?, payment_reference = COALESCE(payment_reference, ?), updated_at = ? WHERE id = ?",
    [ts, provider, reference, ts, id]
  );

  await queueFuPayloadForOrder({ env, orderId: id, kind: "sale" }).catch(() => null);
  return json({ ok: true });
};
