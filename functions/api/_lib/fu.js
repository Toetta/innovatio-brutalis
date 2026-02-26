import { getEnv } from "./env.js";
import { assertDb, exec, one } from "./db.js";
import { nowIso, uuid } from "./crypto.js";

export const requireFuKey = ({ request, env }) => {
  const { FU_SYNC_KEY } = getEnv(env);
  if (!FU_SYNC_KEY) return false;
  const given = request.headers.get("X-FU-Key") || "";
  return given && given === FU_SYNC_KEY;
};

const toAmount2 = (n) => {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
};

const clearingAccountForProvider = (provider) => {
  const p = String(provider || "").toLowerCase();
  if (p === "stripe") return 1580;
  if (p === "klarna") return 1581;
  if (p === "swish") return 1930;
  return 1580;
};

export const buildFuVoucherPayload = ({ order, kind }) => {
  const total = toAmount2(order.total_inc_vat);
  const vat = toAmount2(order.vat_total);
  const goodsExVat = toAmount2(order.subtotal_ex_vat);
  const shippingExVat = toAmount2(order.shipping_ex_vat);
  const clearing = clearingAccountForProvider(order.payment_provider);

  let tax = null;
  try {
    const meta = order.metadata ? JSON.parse(String(order.metadata)) : null;
    tax = meta && meta.tax && typeof meta.tax === "object" ? meta.tax : null;
  } catch (_) {
    tax = null;
  }

  const sign = kind === "refund" ? -1 : 1;
  const text = kind === "refund" ? `Refund ${order.order_number}` : `Order ${order.order_number}`;

  const hasShipping = Number.isFinite(Number(shippingExVat)) && Number(shippingExVat) > 0;

  const voucherLines = [
    // Clearing account: money in (sale) / money out (refund)
    {
      account: clearing,
      debit: sign === 1 ? total : 0,
      credit: sign === 1 ? 0 : total,
      text,
    },
    // Goods sales
    {
      account: 3011,
      debit: sign === 1 ? 0 : goodsExVat,
      credit: sign === 1 ? goodsExVat : 0,
      text,
    },
  ];

  if (hasShipping) {
    voucherLines.push({
      account: 3520,
      debit: sign === 1 ? 0 : shippingExVat,
      credit: sign === 1 ? shippingExVat : 0,
      text,
    });
  }

  voucherLines.push({
    // VAT
    account: 2611,
    debit: sign === 1 ? 0 : vat,
    credit: sign === 1 ? vat : 0,
    text,
  });

  return {
    schema_version: "1.0",
    source: "innovatio-brutalis-webshop",
    kind,
    order_id: order.id,
    order_number: order.order_number,
    currency: order.currency,
    date: (order.paid_at || order.placed_at || nowIso()).slice(0, 10),
    lines: voucherLines,
    meta: {
      payment_provider: order.payment_provider || null,
      payment_reference: order.payment_reference || null,
      email: order.email || null,
      customer_country: order.customer_country || null,
      tax_mode: tax?.mode || null,
      vat_rate: tax?.vat_rate != null ? tax.vat_rate : null,
      vat_number: tax?.vat_number || null,
      vies_status: tax?.vies?.status || null,
    },
  };
};

export const queueFuPayloadForOrder = async ({ env, orderId, kind }) => {
  const db = assertDb(env);
  const order = await one(db.prepare("SELECT * FROM orders WHERE id = ? LIMIT 1").bind(orderId).all());
  if (!order) return { ok: false, error: "Order not found" };

  const k = kind === "refund" ? "refund" : "sale";
  if (k === "sale" && order.status !== "paid") return { ok: false, error: "Order is not paid" };
  if (k === "refund" && order.status !== "refunded") return { ok: false, error: "Order is not refunded" };

  const payloadObj = buildFuVoucherPayload({ order, kind: k });
  const payload = JSON.stringify(payloadObj);

  const id = uuid();
  const created_at = nowIso();
  try {
    await exec(
      db,
      "INSERT INTO fu_sync_payloads (id, order_id, kind, status, payload, created_at, sent_at, acked_at, voucher_id, error) VALUES (?,?,?, 'queued', ?, ?, NULL, NULL, NULL, NULL)",
      [id, order.id, k, payload, created_at]
    );
  } catch (e) {
    // Likely UNIQUE(order_id, kind) violated.
    return { ok: false, error: "FU payload already queued" };
  }

  await exec(db, "UPDATE orders SET fu_sync_status = 'queued', fu_sync_error = NULL, updated_at = ? WHERE id = ?", [nowIso(), order.id]);
  return { ok: true, id };
};
