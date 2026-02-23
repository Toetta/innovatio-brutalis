import { badRequest, json, unauthorized } from "./_lib/resp.js";
import { requireCustomer } from "./_lib/auth.js";
import { assertDb, all, exec } from "./_lib/db.js";
import { nowIso } from "./_lib/crypto.js";

export const onRequestGet = async (context) => {
  const { request, env } = context;
  const auth = await requireCustomer({ request, env });
  if (!auth.ok) return unauthorized();

  const db = assertDb(env);
  const addresses = await all(
    db.prepare(
      "SELECT id, type, line1, line2, postal_code, city, region, country, created_at, updated_at FROM addresses WHERE customer_id = ? ORDER BY type"
    ).bind(auth.customer.id).all()
  );

  return json({
    ok: true,
    customer: auth.customer,
    addresses,
  });
};

export const onRequestPut = async (context) => {
  const { request, env } = context;
  const auth = await requireCustomer({ request, env });
  if (!auth.ok) return unauthorized();

  let body = null;
  try {
    body = await request.json();
  } catch (_) {
    return badRequest("Invalid JSON");
  }

  const patch = {
    full_name: ("full_name" in body) ? String(body.full_name || "").trim() : undefined,
    phone: ("phone" in body) ? String(body.phone || "").trim() : undefined,
    company_name: ("company_name" in body) ? String(body.company_name || "").trim() : undefined,
    orgnr: ("orgnr" in body) ? String(body.orgnr || "").trim() : undefined,
    vat_id: ("vat_id" in body) ? String(body.vat_id || "").trim() : undefined,
    marketing_opt_in: ("marketing_opt_in" in body) ? (body.marketing_opt_in ? 1 : 0) : undefined,
  };

  const allowedKeys = Object.keys(patch).filter((k) => patch[k] !== undefined);
  if (!allowedKeys.length) return json({ ok: true });

  const db = assertDb(env);
  const sets = [];
  const params = [];
  for (const k of allowedKeys) {
    sets.push(`${k} = ?`);
    params.push(patch[k]);
  }
  sets.push("updated_at = ?");
  params.push(nowIso());
  params.push(auth.customer.id);

  await exec(db, `UPDATE customers SET ${sets.join(", ")} WHERE id = ?`, params);

  // Return fresh view
  const customer = await all(db.prepare("SELECT id, email, full_name, phone, company_name, orgnr, vat_id, marketing_opt_in, created_at, updated_at, last_login_at FROM customers WHERE id = ? LIMIT 1").bind(auth.customer.id).all());
  return json({ ok: true, customer: customer[0] || auth.customer });
};
