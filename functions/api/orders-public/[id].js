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
      "SELECT id, order_number, status, customer_country, currency, subtotal_ex_vat, vat_total, shipping_ex_vat, shipping_vat, total_inc_vat, placed_at, paid_at, refunded_at FROM orders WHERE id = ? AND public_token_hash = ? LIMIT 1"
    ).bind(id, tokenHash).all()
  );
  if (!order) return notFound();

  return json({ ok: true, order });
};

export const onRequestPost = async () => badRequest("Method not allowed");
