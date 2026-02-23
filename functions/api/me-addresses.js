import { badRequest, json, unauthorized } from "./_lib/resp.js";
import { requireCustomer } from "./_lib/auth.js";
import { assertDb, one, exec } from "./_lib/db.js";
import { nowIso, uuid } from "./_lib/crypto.js";

const normAddr = (a) => {
  if (!a || typeof a !== "object") return null;
  const pick = (k) => (k in a ? String(a[k] || "").trim() : null);
  return {
    line1: pick("line1"),
    line2: pick("line2"),
    postal_code: pick("postal_code"),
    city: pick("city"),
    region: pick("region"),
    country: pick("country"),
  };
};

const upsert = async ({ db, customerId, type, addr }) => {
  const existing = await one(db.prepare("SELECT id FROM addresses WHERE customer_id = ? AND type = ? LIMIT 1").bind(customerId, type).all());
  const ts = nowIso();
  if (existing) {
    await exec(
      db,
      "UPDATE addresses SET line1 = ?, line2 = ?, postal_code = ?, city = ?, region = ?, country = ?, updated_at = ? WHERE id = ?",
      [addr.line1, addr.line2, addr.postal_code, addr.city, addr.region, addr.country, ts, existing.id]
    );
    return existing.id;
  }

  const id = uuid();
  await exec(
    db,
    "INSERT INTO addresses (id, customer_id, type, line1, line2, postal_code, city, region, country, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    [id, customerId, type, addr.line1, addr.line2, addr.postal_code, addr.city, addr.region, addr.country, ts, ts]
  );
  return id;
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

  const billing = normAddr(body?.billing);
  const shipping = normAddr(body?.shipping);
  if (!billing && !shipping) return badRequest("Missing billing/shipping");

  const db = assertDb(env);
  if (billing) await upsert({ db, customerId: auth.customer.id, type: "billing", addr: billing });
  if (shipping) await upsert({ db, customerId: auth.customer.id, type: "shipping", addr: shipping });

  return json({ ok: true });
};
