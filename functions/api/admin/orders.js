import { forbidden, json } from "../_lib/resp.js";
import { requireAdminKey } from "../_lib/auth.js";
import { assertDb, all } from "../_lib/db.js";

export const onRequestGet = async (context) => {
  const { request, env } = context;
  if (!requireAdminKey({ request, env })) return forbidden();

  const db = assertDb(env);
  const rows = await all(
    db.prepare(
      "SELECT id, order_number, email, customer_country, currency, status, payment_provider, payment_reference, total_inc_vat, placed_at, paid_at, refunded_at, fu_voucher_id, fu_sync_status, fu_sync_error FROM orders ORDER BY placed_at DESC LIMIT 200"
    ).all()
  );

  return json({ ok: true, orders: rows });
};
