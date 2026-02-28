import { getEnv } from "./env.js";
import { assertDb, exec, one } from "./db.js";
import { nowIso, uuid } from "./crypto.js";
import { getShippingZone } from "./shipping/postnord-tiers.js";

export const requireFuKey = ({ request, env }) => {
  const provided = (request.headers.get("X-FU-Key") ?? "").trim();

  // Cloudflare Pages Functions secrets are exposed on `context.env`.
  // Support both underscore and hyphen variants; keep backward-compat.
  const expected = String(env?.FU_KEY || env?.["FU-KEY"] || env?.FU_SYNC_KEY || "").trim();

  if (!expected) return false;
  if (!provided) return false;
  return provided === expected;
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

const fromMinorToAmount2 = (minor) => {
  const n = Number(minor);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n / 100) * 100) / 100;
};

const unixToIsoDate = (sec) => {
  const s = Number(sec);
  if (!Number.isFinite(s) || s <= 0) return nowIso().slice(0, 10);
  try {
    return new Date(s * 1000).toISOString().slice(0, 10);
  } catch (_) {
    return nowIso().slice(0, 10);
  }
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
      shipping_zone: getShippingZone(order.customer_country || "") || null,
      delivery_method: order.delivery_method || null,
      shipping_provider: order.shipping_provider || null,
      shipping_code: order.shipping_code || null,
      tax_mode: tax?.mode || null,
      vat_rate: tax?.vat_rate != null ? tax.vat_rate : null,
      vat_number: tax?.vat_number || null,
      vies_status: tax?.vies?.status || null,
    },
  };
};

export const buildFuStripePayoutPayload = ({ env, payout, totals }) => {
  const { FU_BANK_ACCOUNT, FU_STRIPE_CLEARING_ACCOUNT, FU_STRIPE_FEE_ACCOUNT } = getEnv(env);

  const payoutId = String(payout?.id || "");
  const currency = String(payout?.currency || "SEK").toUpperCase();
  const date = unixToIsoDate(payout?.arrival_date || payout?.created);

  const amount = fromMinorToAmount2(totals?.amount_minor);
  const fee = fromMinorToAmount2(totals?.fee_minor);
  const net = fromMinorToAmount2(totals?.net_minor);

  const text = `Stripe payout ${payoutId}`;

  // Bookkeeping logic:
  // - Credit clearing (1580) with gross (amount)
  // - Debit bank (1930) with net
  // - Debit fees (6570) with fee
  // This matches: net = amount - fee.
  const lines = [
    { account: Number(FU_BANK_ACCOUNT || 1930), debit: net > 0 ? net : 0, credit: net < 0 ? Math.abs(net) : 0, text },
    { account: Number(FU_STRIPE_FEE_ACCOUNT || 6570), debit: fee > 0 ? fee : 0, credit: fee < 0 ? Math.abs(fee) : 0, text },
    { account: Number(FU_STRIPE_CLEARING_ACCOUNT || 1580), debit: amount < 0 ? Math.abs(amount) : 0, credit: amount > 0 ? amount : 0, text },
  ];

  return {
    schema_version: "1.0",
    source: "innovatio-brutalis-webshop",
    kind: "payout",
    currency,
    date,
    lines,
    meta: {
      payout_id: payoutId || null,
      stripe_status: payout?.status || null,
      arrival_date: payout?.arrival_date || null,
      totals_minor: {
        amount: Number(totals?.amount_minor || 0) || 0,
        fee: Number(totals?.fee_minor || 0) || 0,
        net: Number(totals?.net_minor || 0) || 0,
      },
      balance_tx_count: Number(totals?.count || 0) || 0,
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
      "INSERT INTO fu_sync_payloads (id, entity_type, entity_id, kind, status, payload, created_at, sent_at, acked_at, voucher_id, error) VALUES (?,?,?, ?, 'queued', ?, ?, NULL, NULL, NULL, NULL)",
      [id, "order", order.id, k, payload, created_at]
    );
  } catch (e) {
    // Likely UNIQUE(entity_type, entity_id, kind) violated.
    return { ok: false, error: "FU payload already queued" };
  }

  await exec(db, "UPDATE orders SET fu_sync_status = 'queued', fu_sync_error = NULL, updated_at = ? WHERE id = ?", [nowIso(), order.id]);
  return { ok: true, id };
};

export const queueFuPayloadForStripePayout = async ({ env, payout, totals }) => {
  const payoutId = String(payout?.id || "").trim();
  if (!payoutId) return { ok: false, error: "Missing payout id" };

  const db = assertDb(env);
  const payloadObj = buildFuStripePayoutPayload({ env, payout, totals });
  const payload = JSON.stringify(payloadObj);

  const id = uuid();
  const created_at = nowIso();
  try {
    await exec(
      db,
      "INSERT INTO fu_sync_payloads (id, entity_type, entity_id, kind, status, payload, created_at, sent_at, acked_at, voucher_id, error) VALUES (?,?,?, 'payout', 'queued', ?, ?, NULL, NULL, NULL, NULL)",
      [id, "payout", payoutId, payload, created_at]
    );
  } catch (_) {
    return { ok: false, error: "FU payout payload already queued" };
  }

  return { ok: true, id };
};
