import { json, notFound, unauthorized } from "../_lib/resp.js";
import { requireCustomer } from "../_lib/auth.js";
import { assertDb, one, all } from "../_lib/db.js";

export const onRequestGet = async (context) => {
  const { request, env, params } = context;
  const auth = await requireCustomer({ request, env });
  if (!auth.ok) return unauthorized();

  const id = String(params?.id || "");
  if (!id) return notFound();

  const db = assertDb(env);
  const order = await one(
    db.prepare(
      "SELECT * FROM orders WHERE id = ? AND customer_id = ? LIMIT 1"
    ).bind(id, auth.customer.id).all()
  );
  if (!order) return notFound();

  const lines = await all(
    db.prepare(
      "SELECT id, product_id, sku, title, qty, unit_price_ex_vat, vat_rate, line_total_ex_vat, line_vat, line_total_inc_vat FROM order_lines WHERE order_id = ? ORDER BY id"
    ).bind(order.id).all()
  );
  return json({ ok: true, order, lines });
};
