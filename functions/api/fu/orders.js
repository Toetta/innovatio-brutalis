import { corsPreflight, forbidden, json, withCors } from "../_lib/resp.js";
import { assertDb, all } from "../_lib/db.js";
import { requireFuKey } from "../_lib/fu.js";

const corsOpts = ({ request, env }) => ({
  request,
  env,
  allowMethods: "GET, OPTIONS",
  allowHeaders: "content-type, x-fu-key",
});

const parseMeta = (raw) => {
  try {
    const obj = JSON.parse(String(raw || "null"));
    return (obj && typeof obj === "object" && !Array.isArray(obj)) ? obj : {};
  } catch (_) {
    return {};
  }
};

const toNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const round2 = (value) => Math.round(toNumber(value, 0) * 100) / 100;

const normalizeVatPercent = (value) => {
  const n = toNumber(value, 0);
  return n <= 1 ? round2(n * 100) : round2(n);
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const summarizeCustomQuoteFulfillment = (lines, storedStatus) => {
  const normalized = (Array.isArray(lines) ? lines : []).map((line) => {
    const qty = Math.max(0, toNumber(line?.qty, 0));
    const fulfilledQuantity = round2(clamp(toNumber(line?.fulfilled_quantity, 0), 0, qty));
    return {
      ...line,
      qty,
      fulfilled_quantity: fulfilledQuantity,
      remaining_quantity: round2(Math.max(0, qty - fulfilledQuantity)),
    };
  });
  const hasDelivered = normalized.some((line) => line.fulfilled_quantity > 0);
  const allDelivered = normalized.length > 0 && normalized.every((line) => line.remaining_quantity <= 0.0001);
  const status = allDelivered ? "fulfilled" : (hasDelivered ? "partial" : (String(storedStatus || "pending") === "fulfilled" ? "fulfilled" : "pending"));
  return {
    status,
    total_quantity: round2(normalized.reduce((sum, line) => sum + toNumber(line.qty, 0), 0)),
    fulfilled_quantity: round2(normalized.reduce((sum, line) => sum + toNumber(line.fulfilled_quantity, 0), 0)),
    lines: normalized,
  };
};

const buildWhere = (view) => {
  if (view === "fulfilled") {
    return ["WHERE o.status = 'paid' AND COALESCE(o.fulfillment_status, 'pending') = 'fulfilled'", []];
  }
  if (view === "all") {
    return ["WHERE o.status = 'paid'", []];
  }
  return ["WHERE o.status = 'paid' AND COALESCE(o.fulfillment_status, 'pending') != 'fulfilled'", []];
};

export const onRequestOptions = async (context) => corsPreflight(context, corsOpts(context));

export const onRequestGet = async (context) => {
  const { request, env } = context;
  if (!requireFuKey({ request, env })) return withCors(forbidden(), corsOpts(context));

  const url = new URL(request.url);
  const view = String(url.searchParams.get("view") || "open").trim().toLowerCase();
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") || 100)));
  const [whereSql, params] = buildWhere(view);

  const db = assertDb(env);
  const orderRows = await all(
    db.prepare(
      `SELECT
        o.id,
        o.order_number,
        o.email,
        o.customer_country,
        o.currency,
        o.status,
        o.payment_provider,
        o.payment_reference,
        o.total_inc_vat,
        o.placed_at,
        o.paid_at,
        o.refunded_at,
        o.fu_voucher_id,
        o.fu_sync_status,
        o.fu_sync_error,
        o.delivery_method,
        o.shipping_provider,
        o.shipping_code,
        o.fulfillment_status,
        o.fulfilled_at,
        o.fulfilled_by,
        o.tracking_number,
        o.tracking_url,
        o.fulfillment_note,
        o.metadata
      FROM orders o
      ${whereSql}
      ORDER BY COALESCE(o.paid_at, o.placed_at) DESC
      LIMIT ?`
    ).bind(...params, limit).all()
  );

  const rows = Array.isArray(orderRows) ? orderRows : [];
  const ids = rows.map((row) => String(row.id || "")).filter(Boolean);
  const linesByOrderId = new Map();

  if (ids.length) {
    const placeholders = ids.map(() => "?").join(",");
    const lineRows = await all(
      db.prepare(
        `SELECT order_id, sku, title, qty, unit_price_ex_vat, vat_rate, line_total_inc_vat
         FROM order_lines
         WHERE order_id IN (${placeholders})
         ORDER BY order_id, id`
      ).bind(...ids).all()
    );

    for (const line of Array.isArray(lineRows) ? lineRows : []) {
      const orderId = String(line.order_id || "");
      if (!orderId) continue;
      if (!linesByOrderId.has(orderId)) linesByOrderId.set(orderId, []);
      linesByOrderId.get(orderId).push({
        sku: line.sku != null ? String(line.sku) : null,
        title: String(line.title || ""),
        qty: Number(line.qty || 0) || 0,
        unit_price_ex_vat: Number(line.unit_price_ex_vat || 0) || 0,
        vat_rate: Number(line.vat_rate || 0) || 0,
        line_total_inc_vat: Number(line.line_total_inc_vat || 0) || 0,
      });
    }
  }

  const customQuoteRows = await all(
    db.prepare(
      `SELECT
        q.id,
        q.token,
        q.customer_email,
        q.customer_name,
        q.customer_phone,
        q.company_name,
        q.currency,
        q.status,
        q.created_at,
        q.paid_at,
        q.fu_exported_at,
        q.fulfillment_status,
        q.fulfilled_at,
        q.fulfilled_by,
        q.tracking_number,
        q.tracking_url,
        q.fulfillment_note
      FROM custom_quotes q
      WHERE q.status = 'paid'
      ORDER BY COALESCE(q.paid_at, q.created_at) DESC
      LIMIT ?`
    ).bind(limit).all()
  ).catch(() => []);

  const customQuoteIds = (Array.isArray(customQuoteRows) ? customQuoteRows : []).map((row) => String(row.id || "")).filter(Boolean);
  const customQuoteLinesById = new Map();

  if (customQuoteIds.length) {
    const placeholders = customQuoteIds.map(() => "?").join(",");
    const customLineRows = await all(
      db.prepare(
        `SELECT id, quote_id, line_type, unit, title, quantity, fulfilled_quantity, vat_rate, unit_price_ex_vat
         FROM custom_quote_lines
         WHERE quote_id IN (${placeholders})
         ORDER BY quote_id, sort_order, created_at`
      ).bind(...customQuoteIds).all()
    ).catch(() => []);

    for (const line of Array.isArray(customLineRows) ? customLineRows : []) {
      const quoteId = String(line.quote_id || "");
      if (!quoteId) continue;
      if (!customQuoteLinesById.has(quoteId)) customQuoteLinesById.set(quoteId, []);
      const qty = toNumber(line.quantity, 0);
      const unitPrice = toNumber(line.unit_price_ex_vat, 0);
      const vatRate = toNumber(line.vat_rate, 0);
      customQuoteLinesById.get(quoteId).push({
        id: String(line.id || ""),
        line_type: String(line.line_type || "service_fixed"),
        unit: String(line.unit || "st"),
        sku: null,
        title: String(line.title || "Rad"),
        qty,
        fulfilled_quantity: round2(clamp(toNumber(line.fulfilled_quantity, 0), 0, qty)),
        unit_price_ex_vat: round2(unitPrice),
        vat_rate: normalizeVatPercent(vatRate),
        line_total_inc_vat: round2((qty * unitPrice) * (1 + vatRate)),
      });
    }
  }

  const orders = rows.map((row) => {
    const meta = parseMeta(row.metadata);
    const customer = meta.customer && typeof meta.customer === "object" ? meta.customer : {};
    const delivery = meta.delivery && typeof meta.delivery === "object" ? meta.delivery : {};
    return {
      id: String(row.id || ""),
      order_number: String(row.order_number || ""),
      email: String(row.email || ""),
      customer_country: String(row.customer_country || ""),
      currency: String(row.currency || "SEK"),
      status: String(row.status || ""),
      payment_provider: row.payment_provider != null ? String(row.payment_provider) : null,
      payment_reference: row.payment_reference != null ? String(row.payment_reference) : null,
      total_inc_vat: Number(row.total_inc_vat || 0) || 0,
      placed_at: row.placed_at ? String(row.placed_at) : null,
      paid_at: row.paid_at ? String(row.paid_at) : null,
      refunded_at: row.refunded_at ? String(row.refunded_at) : null,
      fu_voucher_id: row.fu_voucher_id != null ? String(row.fu_voucher_id) : null,
      fu_sync_status: row.fu_sync_status != null ? String(row.fu_sync_status) : null,
      fu_sync_error: row.fu_sync_error != null ? String(row.fu_sync_error) : null,
      delivery_method: row.delivery_method != null ? String(row.delivery_method) : null,
      shipping_provider: row.shipping_provider != null ? String(row.shipping_provider) : null,
      shipping_code: row.shipping_code != null ? String(row.shipping_code) : null,
      fulfillment_status: String(row.fulfillment_status || "pending"),
      fulfilled_at: row.fulfilled_at ? String(row.fulfilled_at) : null,
      fulfilled_by: row.fulfilled_by != null ? String(row.fulfilled_by) : null,
      tracking_number: row.tracking_number != null ? String(row.tracking_number) : null,
      tracking_url: row.tracking_url != null ? String(row.tracking_url) : null,
      fulfillment_note: row.fulfillment_note != null ? String(row.fulfillment_note) : null,
      customer: {
        full_name: customer.full_name != null ? String(customer.full_name) : null,
        phone: customer.phone != null ? String(customer.phone) : null,
      },
      delivery: {
        method: delivery.method != null ? String(delivery.method) : null,
        provider: delivery.provider != null ? String(delivery.provider) : null,
        code: delivery.code != null ? String(delivery.code) : null,
        shipping_address: delivery.shipping_address ?? null,
      },
      lines: (linesByOrderId.get(String(row.id || "")) || []).map((line) => ({
        ...line,
        vat_rate: normalizeVatPercent(line.vat_rate),
      })),
      entry_type: "order",
      fulfillable: true,
    };
  });

  const customQuotes = (Array.isArray(customQuoteRows) ? customQuoteRows : []).map((row) => {
    const quoteId = String(row.id || "");
    const summary = summarizeCustomQuoteFulfillment(customQuoteLinesById.get(quoteId) || [], row.fulfillment_status);
    const lines = summary.lines;
    const totalIncVat = round2(lines.reduce((sum, line) => sum + toNumber(line.line_total_inc_vat, 0), 0));
    return {
      id: quoteId,
      order_number: `Custom quote ${quoteId}`,
      email: String(row.customer_email || ""),
      customer_country: "",
      currency: String(row.currency || "SEK"),
      status: String(row.status || "paid"),
      payment_provider: null,
      payment_reference: row.token != null ? String(row.token) : null,
      total_inc_vat: totalIncVat,
      placed_at: row.created_at ? String(row.created_at) : null,
      paid_at: row.paid_at ? String(row.paid_at) : null,
      refunded_at: null,
      fu_voucher_id: null,
      fu_sync_status: row.fu_exported_at ? "acked" : null,
      fu_sync_error: null,
      delivery_method: null,
      shipping_provider: null,
      shipping_code: null,
      fulfillment_status: summary.status,
      fulfilled_at: row.fulfilled_at ? String(row.fulfilled_at) : null,
      fulfilled_by: row.fulfilled_by != null ? String(row.fulfilled_by) : null,
      tracking_number: row.tracking_number != null ? String(row.tracking_number) : null,
      tracking_url: row.tracking_url != null ? String(row.tracking_url) : null,
      fulfillment_note: row.fulfillment_note != null ? String(row.fulfillment_note) : null,
      customer: {
        full_name: row.customer_name != null ? String(row.customer_name) : (row.company_name != null ? String(row.company_name) : null),
        phone: row.customer_phone != null ? String(row.customer_phone) : null,
      },
      delivery: {
        method: null,
        provider: null,
        code: null,
        shipping_address: null,
      },
      lines,
      entry_type: "custom_quote",
      fulfillable: true,
      fulfillment_summary: {
        total_quantity: summary.total_quantity,
        fulfilled_quantity: summary.fulfilled_quantity,
        remaining_quantity: round2(Math.max(0, summary.total_quantity - summary.fulfilled_quantity)),
      },
    };
  });

  const filteredCustomQuotes = customQuotes.filter((quote) => {
    const fulfillmentStatus = String(quote.fulfillment_status || "pending");
    if (view === "fulfilled") return fulfillmentStatus === "fulfilled";
    if (view === "open") return fulfillmentStatus !== "fulfilled";
    return true;
  });

  const combined = [...orders, ...filteredCustomQuotes]
    .sort((a, b) => String(b.paid_at || b.placed_at || "").localeCompare(String(a.paid_at || a.placed_at || "")))
    .slice(0, limit);

  return withCors(json({ ok: true, view, orders: combined }), corsOpts(context));
};
