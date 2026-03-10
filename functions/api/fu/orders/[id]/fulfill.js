import { badRequest, corsPreflight, forbidden, json, notFound, withCors } from "../../../_lib/resp.js";
import { assertDb, all, exec, one } from "../../../_lib/db.js";
import { nowIso, uuid } from "../../../_lib/crypto.js";
import { requireFuKey } from "../../../_lib/fu.js";

const corsOpts = ({ request, env }) => ({
  request,
  env,
  allowMethods: "POST, OPTIONS",
  allowHeaders: "content-type, x-fu-key",
});

export const onRequestOptions = async (context) => corsPreflight(context, corsOpts(context));

const toNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const round2 = (value) => Math.round(toNumber(value, 0) * 100) / 100;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const summarizeCustomQuoteLines = (lines) => {
  const normalized = (Array.isArray(lines) ? lines : []).map((line) => {
    const quantity = Math.max(0, toNumber(line?.quantity, 0));
    const fulfilledQuantity = round2(clamp(toNumber(line?.fulfilled_quantity, 0), 0, quantity));
    return {
      id: String(line?.id || ""),
      quantity,
      fulfilled_quantity: fulfilledQuantity,
    };
  });
  const hasDelivered = normalized.some((line) => line.fulfilled_quantity > 0);
  const allDelivered = normalized.length > 0 && normalized.every((line) => Math.abs(line.quantity - line.fulfilled_quantity) <= 0.0001);
  return {
    lines: normalized,
    status: allDelivered ? "fulfilled" : (hasDelivered ? "partial" : "pending"),
  };
};

export const onRequestPost = async (context) => {
  const { request, env, params } = context;
  if (!requireFuKey({ request, env })) return withCors(forbidden(), corsOpts(context));

  const id = String(params?.id || "").trim();
  if (!id) return withCors(notFound(), corsOpts(context));

  let body = {};
  try {
    body = await request.json();
  } catch (_) {
    return withCors(badRequest("Invalid JSON"), corsOpts(context));
  }

  const fulfilled = !!body?.fulfilled;
  const fulfilledBy = String(body?.fulfilled_by || "FU-Bookkeeping").trim() || "FU-Bookkeeping";
  const trackingNumber = body?.tracking_number != null ? String(body.tracking_number || "").trim() : null;
  const trackingUrl = body?.tracking_url != null ? String(body.tracking_url || "").trim() : null;
  const fulfillmentNote = body?.note != null ? String(body.note || "").trim() : null;
  const entityType = String(body?.entity_type || "").trim().toLowerCase();
  const lineFulfillments = Array.isArray(body?.line_fulfillments) ? body.line_fulfillments : [];

  const db = assertDb(env);
  const ts = nowIso();

  const updateCustomQuote = async (quote) => {
    if (String(quote.status || "") !== "paid") {
      return withCors(badRequest("Only paid custom quotes can be marked fulfilled"), corsOpts(context));
    }

    const quoteLines = await all(
      db.prepare("SELECT id, quantity, fulfilled_quantity FROM custom_quote_lines WHERE quote_id = ? ORDER BY sort_order, created_at").bind(id).all()
    ).catch(() => []);
    const requestedById = new Map();
    for (const item of lineFulfillments) {
      const lineId = String(item?.line_id || "").trim();
      if (!lineId) continue;
      requestedById.set(lineId, toNumber(item?.fulfilled_quantity, 0));
    }

    for (const line of Array.isArray(quoteLines) ? quoteLines : []) {
      const lineId = String(line.id || "");
      const quantity = Math.max(0, toNumber(line.quantity, 0));
      const desiredQuantity = requestedById.has(lineId)
        ? requestedById.get(lineId)
        : (lineFulfillments.length ? toNumber(line.fulfilled_quantity, 0) : (fulfilled ? quantity : 0));
      await exec(db, "UPDATE custom_quote_lines SET fulfilled_quantity = ? WHERE id = ?", [round2(clamp(desiredQuantity, 0, quantity)), lineId]);
    }

    const updatedLines = await all(
      db.prepare("SELECT id, quantity, fulfilled_quantity FROM custom_quote_lines WHERE quote_id = ? ORDER BY sort_order, created_at").bind(id).all()
    ).catch(() => []);
    const summary = summarizeCustomQuoteLines(updatedLines);
    const fulfilledAt = summary.status === "fulfilled" ? ts : null;
    const fulfilledByValue = summary.status === "pending" ? null : fulfilledBy;

    await exec(
      db,
      `UPDATE custom_quotes
       SET fulfillment_status = ?,
           fulfilled_at = ?,
           fulfilled_by = ?,
           tracking_number = ?,
           tracking_url = ?,
           fulfillment_note = ?,
           updated_at = ?
       WHERE id = ?`,
      [summary.status, fulfilledAt, fulfilledByValue, trackingNumber, trackingUrl, fulfillmentNote, ts, id]
    );

    await exec(
      db,
      "INSERT INTO custom_quote_events (id, quote_id, event_type, meta_json, created_at) VALUES (?,?,?,?,?)",
      [uuid(), id, "fulfillment.updated", JSON.stringify({ fulfillment_status: summary.status, line_fulfillments: summary.lines, fulfilled_by: fulfilledByValue }), ts]
    ).catch(() => null);

    return withCors(json({ ok: true, id, entry_type: "custom_quote", fulfillment_status: summary.status, fulfilled_at: fulfilledAt, line_fulfillments: summary.lines }), corsOpts(context));
  };

  if (entityType === "custom_quote") {
    const quote = await one(
      db.prepare("SELECT id, status FROM custom_quotes WHERE id = ? LIMIT 1").bind(id).all()
    ).catch(() => null);
    if (!quote?.id) return withCors(notFound("Custom quote not found"), corsOpts(context));
    return await updateCustomQuote(quote);
  }

  const order = await one(
    db.prepare("SELECT id, status FROM orders WHERE id = ? LIMIT 1").bind(id).all()
  );
  if (!order?.id) {
    const quote = await one(
      db.prepare("SELECT id, status FROM custom_quotes WHERE id = ? LIMIT 1").bind(id).all()
    ).catch(() => null);
    if (!quote?.id) return withCors(notFound("Order not found"), corsOpts(context));
    return await updateCustomQuote(quote);
  }
  if (String(order.status || "") !== "paid") {
    return withCors(badRequest("Only paid orders can be marked fulfilled"), corsOpts(context));
  }

  await exec(
    db,
    `UPDATE orders
     SET fulfillment_status = ?,
         fulfilled_at = ?,
         fulfilled_by = ?,
         tracking_number = ?,
         tracking_url = ?,
         fulfillment_note = ?,
         updated_at = ?
     WHERE id = ?`,
    [
      fulfilled ? "fulfilled" : "pending",
      fulfilled ? ts : null,
      fulfilled ? fulfilledBy : null,
      trackingNumber,
      trackingUrl,
      fulfillmentNote,
      ts,
      id,
    ]
  );

  return withCors(json({ ok: true, id, entry_type: "order", fulfillment_status: fulfilled ? "fulfilled" : "pending", fulfilled_at: fulfilled ? ts : null }), corsOpts(context));
};