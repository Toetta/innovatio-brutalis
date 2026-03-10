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

const buildWhere = (view) => {
  if (view === "fulfilled") return ["WHERE o.status = 'paid' AND COALESCE(o.fulfillment_status, 'pending') = 'fulfilled'", []];
  if (view === "all") return ["WHERE o.status IN ('paid','refunded','pending_payment','awaiting_action','failed')", []];
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
  const orders = await all(
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

  const orderRows = Array.isArray(orders) ? orders : [];
  const ids = orderRows.map((row) => String(row.id || "")).filter(Boolean);

      customer_country: String(row.customer_country || ""),
        const db = assertDb(env);
        const orders = await all(
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
      lines: linesByOrderId.get(String(row.id || "")) || [],
    };
  });

  return withCors(json({ ok: true, view, orders: out }), corsOpts(context));
};import { badRequest, forbidden, json } from "../_lib/resp.js";
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
