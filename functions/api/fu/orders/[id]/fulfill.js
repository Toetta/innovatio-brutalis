import { badRequest, corsPreflight, forbidden, json, notFound, withCors } from "../../../_lib/resp.js";
import { assertDb, exec, one } from "../../../_lib/db.js";
import { nowIso } from "../../../_lib/crypto.js";
import { requireFuKey } from "../../../_lib/fu.js";

const corsOpts = ({ request, env }) => ({
  request,
  env,
  allowMethods: "POST, OPTIONS",
  allowHeaders: "content-type, x-fu-key",
});

export const onRequestOptions = async (context) => corsPreflight(context, corsOpts(context));

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

  const db = assertDb(env);
  const order = await one(
    db.prepare("SELECT id, status FROM orders WHERE id = ? LIMIT 1").bind(id).all()
  );
  if (!order?.id) return withCors(notFound("Order not found"), corsOpts(context));
  if (String(order.status || "") !== "paid") {
    return withCors(badRequest("Only paid orders can be marked fulfilled"), corsOpts(context));
  }

  const ts = nowIso();
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

  return withCors(json({ ok: true, id, fulfillment_status: fulfilled ? "fulfilled" : "pending", fulfilled_at: fulfilled ? ts : null }), corsOpts(context));
};