import { badRequest, json, notFound } from "../../_lib/resp.js";
import { assertDb, exec, one } from "../../_lib/db.js";
import { nowIso, uuid } from "../../_lib/crypto.js";
import { createKlarnaPaymentsOrder } from "../../_lib/klarna.js";
// NOTE: Do not mark paid here; use /api/payments/klarna/verify which queries Klarna Order Management.

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
  const authorization_token = String(body?.authorization_token || "");
  if (!order_id) return badRequest("Missing order_id");
  if (!authorization_token) return badRequest("Missing authorization_token");

  const order = await one(db.prepare("SELECT * FROM orders WHERE id = ? LIMIT 1").bind(order_id).all());
  if (!order) return notFound("Order not found");
  if (String(order.payment_provider || "").toLowerCase() !== "klarna") return badRequest("Order not Klarna");
  if (!['pending_payment','awaiting_action','failed'].includes(String(order.status))) return badRequest("Order not completable");

  // Build Klarna order lines from stored order_lines
  const lines = await (async () => {
    const res = await db.prepare("SELECT title, qty, line_total_inc_vat, line_vat, vat_rate FROM order_lines WHERE order_id = ? ORDER BY id").bind(order_id).all();
    return Array.isArray(res?.results) ? res.results : [];
  })();

  const klarnaLines = lines.map((l) => {
    const qty = Math.max(1, Math.floor(Number(l.qty) || 1));
    const total_amount = Math.round(Number(l.line_total_inc_vat) * 100);
    const total_tax_amount = Math.round(Number(l.line_vat) * 100);
    const unit_price = Math.round(total_amount / qty);
    const vatRate = Number(l.vat_rate) || 0;
    return {
      name: String(l.title || "Item"),
      quantity: qty,
      unit_price,
      tax_rate: Math.round(vatRate * 10000),
      total_amount,
      total_tax_amount,
    };
  });

  const total_minor = order.total_minor != null ? Number(order.total_minor) : Math.round(Number(order.total_inc_vat) * 100);
  const vat_total_minor = order.vat_total_minor != null ? Number(order.vat_total_minor) : Math.round(Number(order.vat_total) * 100);

  const klarnaOrder = await createKlarnaPaymentsOrder({
    env,
    authorization_token,
    purchase_country: "SE",
    purchase_currency: "SEK",
    locale: "sv-SE",
    order_amount: Math.max(0, Math.floor(total_minor || 0)),
    order_tax_amount: Math.max(0, Math.floor(vat_total_minor || 0)),
    order_lines: klarnaLines,
    merchant_reference1: String(order.order_number || ""),
    merchant_reference2: String(order.id || ""),
  });

  const ts = nowIso();
  const klarnaOrderId = String(klarnaOrder?.order_id || "");
  if (!klarnaOrderId) return badRequest("Klarna did not return order_id");

  // Idempotency: record event (best-effort)
  try {
    await exec(
      db,
      "INSERT INTO payment_events (id, provider, event_id, type, order_id, created_at, payload) VALUES (?,?,?,?,?,?,?)",
      [uuid(), "klarna", klarnaOrderId, "order.created", order_id, ts, JSON.stringify(klarnaOrder)]
    );
  } catch (_) {}

  await exec(
    db,
    "UPDATE orders SET status = 'awaiting_action', payment_reference = ?, updated_at = ? WHERE id = ?",
    [klarnaOrderId, ts, order_id]
  );

  return json({ ok: true, klarna_order_id: klarnaOrderId });
};
