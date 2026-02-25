import { badRequest, json, notFound, unauthorized } from "../_lib/resp.js";
import { assertDb, one } from "../_lib/db.js";
import { sha256Hex } from "../_lib/crypto.js";

export const onRequestGet = async (context) => {
  const { request, env, params } = context;
  const id = String(params?.id || "");
  if (!id) return notFound();

  const url = new URL(request.url);
  const token = String(url.searchParams.get("token") || "");
  if (!token) return unauthorized("Missing token");

  const tokenHash = await sha256Hex(token);
  const db = assertDb(env);
  const order = await one(
    db.prepare(
      "SELECT id, order_number, status, customer_country, currency, subtotal_ex_vat, vat_total, shipping_ex_vat, shipping_vat, total_inc_vat, placed_at, paid_at, refunded_at, metadata FROM orders WHERE id = ? AND public_token_hash = ? LIMIT 1"
    ).bind(id, tokenHash).all()
  );
  if (!order) return notFound();

  // VAT rate is stored on order_lines.
  const vatRow = await one(db.prepare("SELECT vat_rate FROM order_lines WHERE order_id = ? ORDER BY id LIMIT 1").bind(id).all()).catch(() => null);
  const vat_rate = vatRow && vatRow.vat_rate != null ? Number(vatRow.vat_rate) : null;

  let tax_mode = null;
  let vies_status = null;
  try {
    const meta = order.metadata ? JSON.parse(String(order.metadata)) : null;
    tax_mode = meta?.tax?.mode != null ? String(meta.tax.mode) : null;
    vies_status = meta?.tax?.vies?.status != null ? String(meta.tax.vies.status) : null;
  } catch (_) {
    tax_mode = null;
    vies_status = null;
  }

  delete order.metadata;

  return json({ ok: true, order: { ...order, vat_rate, tax_mode, vies_status } });
};

export const onRequestPost = async () => badRequest("Method not allowed");
