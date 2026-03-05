import { badRequest, forbidden, json } from "../_lib/resp.js";
import { requireCustomAdminKey } from "../_lib/auth.js";
import { assertDb, all, exec, one } from "../_lib/db.js";
import { nowIso, randomToken, uuid } from "../_lib/crypto.js";
import { normalizeQuoteInput } from "../_lib/custom-quotes.js";

const isEmailLike = (email) => {
  const s = String(email || "").trim();
  return s.includes("@") && s.length >= 3;
};

const insertEvent = async (db, { quote_id, event_type, meta }) => {
  await exec(
    db,
    "INSERT INTO custom_quote_events (id, quote_id, event_type, meta_json, created_at) VALUES (?,?,?,?,?)",
    [uuid(), quote_id, String(event_type || ""), meta != null ? JSON.stringify(meta) : null, nowIso()]
  );
};

const createUniqueToken = async (db) => {
  for (let i = 0; i < 8; i++) {
    const token = await randomToken(24); // ~32 chars base64url
    const existing = await one(db.prepare("SELECT id FROM custom_quotes WHERE token = ? LIMIT 1").bind(token).all());
    if (!existing) return token;
  }
  throw new Error("Failed to generate unique token");
};

export const onRequestGet = async (context) => {
  const { request, env } = context;
  if (!requireCustomAdminKey({ request, env })) return forbidden();

  const url = new URL(request.url);
  const status = String(url.searchParams.get("status") || "").trim().toLowerCase();
  const q = String(url.searchParams.get("q") || "").trim();

  const where = [];
  const params = [];

  if (status) {
    where.push("status = ?");
    params.push(status);
  }

  if (q) {
    const like = `%${q}%`;
    where.push("(customer_email LIKE ? OR customer_name LIKE ? OR company_name LIKE ? OR token LIKE ? OR id LIKE ?)");
    params.push(like, like, like, like, like);
  }

  const sql =
    "SELECT id, token, status, customer_email, customer_name, company_name, currency, created_at, updated_at, expires_at, paid_at, fu_exported_at " +
    "FROM custom_quotes " +
    (where.length ? `WHERE ${where.join(" AND ")} ` : "") +
    "ORDER BY created_at DESC LIMIT 200";

  const db = assertDb(env);
  const rows = await all(db.prepare(sql).bind(...params).all());

  return json({ ok: true, quotes: rows });
};

export const onRequestPost = async (context) => {
  const { request, env } = context;
  if (!requireCustomAdminKey({ request, env })) return forbidden();

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return badRequest("Invalid JSON");
  }

  const input = normalizeQuoteInput(body);
  if (!isEmailLike(input.customer_email)) return badRequest("Invalid customer_email");

  const db = assertDb(env);

  const id = uuid();
  const token = await createUniqueToken(db);
  const ts = nowIso();

  await exec(
    db,
    "INSERT INTO custom_quotes (id, token, status, customer_email, customer_name, customer_phone, company_name, orgnr, vat_id, billing_address_json, shipping_address_json, currency, vat_scheme, notes, created_at, updated_at, expires_at, paid_at, fu_exported_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    [
      id,
      token,
      "draft",
      input.customer_email,
      input.customer_name,
      input.customer_phone,
      input.company_name,
      input.orgnr,
      input.vat_id,
      input.billing_address_json,
      input.shipping_address_json,
      input.currency,
      input.vat_scheme,
      input.notes,
      ts,
      ts,
      input.expires_at,
      null,
      null,
    ]
  );

  await insertEvent(db, { quote_id: id, event_type: "created", meta: { by: "admin" } });

  const quote = await one(db.prepare("SELECT * FROM custom_quotes WHERE id = ? LIMIT 1").bind(id).all());
  return json({ ok: true, quote });
};
