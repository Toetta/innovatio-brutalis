import { json, unauthorized } from "./_lib/resp.js";
import { requireCustomer } from "./_lib/auth.js";
import { assertDb, all } from "./_lib/db.js";

export const onRequestGet = async (context) => {
  const { request, env } = context;
  const auth = await requireCustomer({ request, env });
  if (!auth.ok) return unauthorized();

  const db = assertDb(env);
  const rows = await all(
    db.prepare(
      "SELECT id, order_number, status, currency, total_inc_vat, placed_at FROM orders WHERE customer_id = ? ORDER BY placed_at DESC LIMIT 100"
    ).bind(auth.customer.id).all()
  );
  return json({ ok: true, orders: rows });
};
