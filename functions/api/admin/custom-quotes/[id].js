import { badRequest, corsPreflight, forbidden, json, notFound, withCors } from "../../_lib/resp.js";
import { requireCustomAdminKey } from "../../_lib/auth.js";
import { assertDb, all, exec, one } from "../../_lib/db.js";
import { nowIso, uuid } from "../../_lib/crypto.js";
import { computeTotals, normalizeQuoteInput } from "../../_lib/custom-quotes.js";

const corsOpts = ({ request, env }) => ({
  request,
  env,
  allowMethods: "GET, PUT, OPTIONS",
  allowHeaders: "content-type, x-admin-key",
});

export const onRequestOptions = async (context) => {
  return corsPreflight(context, corsOpts(context));
};

const allowedStatus = new Set(["draft", "sent", "paid", "expired", "cancelled"]);

const insertEvent = async (db, { quote_id, event_type, meta }) => {
  await exec(
    db,
    "INSERT INTO custom_quote_events (id, quote_id, event_type, meta_json, created_at) VALUES (?,?,?,?,?)",
    [uuid(), quote_id, String(event_type || ""), meta != null ? JSON.stringify(meta) : null, nowIso()]
  );
};

const loadQuoteBundle = async (db, id) => {
  const quote = await one(db.prepare("SELECT * FROM custom_quotes WHERE id = ? LIMIT 1").bind(id).all());
  if (!quote) return null;
  const lines = await all(
    db.prepare("SELECT * FROM custom_quote_lines WHERE quote_id = ? ORDER BY sort_order ASC, created_at ASC").bind(id).all()
  );
  const totals = computeTotals(lines);
  return { quote, lines, totals };
};

export const onRequestGet = async (context) => {
  const { request, env, params } = context;
  if (!requireCustomAdminKey({ request, env })) return withCors(forbidden(), corsOpts(context));

  const id = String(params?.id || "").trim();
  if (!id) return withCors(notFound(), corsOpts(context));

  const db = assertDb(env);
  const bundle = await loadQuoteBundle(db, id);
  if (!bundle) return withCors(notFound(), corsOpts(context));

  return withCors(json({ ok: true, ...bundle }), corsOpts(context));
};

export const onRequestPut = async (context) => {
  const { request, env, params } = context;
  if (!requireCustomAdminKey({ request, env })) return withCors(forbidden(), corsOpts(context));

  const id = String(params?.id || "").trim();
  if (!id) return withCors(notFound(), corsOpts(context));

  const db = assertDb(env);
  const existing = await one(db.prepare("SELECT * FROM custom_quotes WHERE id = ? LIMIT 1").bind(id).all());
  if (!existing) return withCors(notFound(), corsOpts(context));

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return withCors(badRequest("Invalid JSON"), corsOpts(context));
  }

  const has = (k) => Object.prototype.hasOwnProperty.call(body || {}, k);

  const input = normalizeQuoteInput(body);

  const nextStatus = has("status") ? String(body.status).trim().toLowerCase() : String(existing.status);
  if (nextStatus && !allowedStatus.has(nextStatus)) return withCors(badRequest("Invalid status"), corsOpts(context));

  if (has("status") && nextStatus === "paid" && String(existing.status) !== "paid") {
    return withCors(badRequest("Status 'paid' is set by Stripe only"), corsOpts(context));
  }

  const customer_email = has("customer_email") && input.customer_email ? input.customer_email : String(existing.customer_email);
  const customer_name = has("customer_name") ? input.customer_name : existing.customer_name;
  const customer_phone = has("customer_phone") ? input.customer_phone : existing.customer_phone;
  const company_name = has("company_name") ? input.company_name : existing.company_name;
  const orgnr = has("orgnr") ? input.orgnr : existing.orgnr;
  const vat_id = has("vat_id") ? input.vat_id : existing.vat_id;
  const billing_address_json = has("billing_address") ? input.billing_address_json : existing.billing_address_json;
  const shipping_address_json = has("shipping_address") ? input.shipping_address_json : existing.shipping_address_json;
  const currency = has("currency") ? input.currency : String(existing.currency);
  const vat_scheme = has("vat_scheme") ? input.vat_scheme : String(existing.vat_scheme);
  const notes = has("notes") ? input.notes : existing.notes;
  const expires_at = has("expires_at") ? input.expires_at : existing.expires_at;

  const ts = nowIso();

  // Update core fields.
  await exec(
    db,
    "UPDATE custom_quotes SET status = ?, customer_email = ?, customer_name = ?, customer_phone = ?, company_name = ?, orgnr = ?, vat_id = ?, billing_address_json = ?, shipping_address_json = ?, currency = ?, vat_scheme = ?, notes = ?, updated_at = ?, expires_at = ?, paid_at = CASE WHEN ? = 'paid' THEN COALESCE(paid_at, ?) ELSE paid_at END WHERE id = ?",
    [
      nextStatus,
      customer_email,
      customer_name,
      customer_phone,
      company_name,
      orgnr,
      vat_id,
      billing_address_json,
      shipping_address_json,
      currency,
      vat_scheme,
      notes,
      ts,
      expires_at,
      nextStatus,
      ts,
      id,
    ]
  );

  await insertEvent(db, { quote_id: id, event_type: "edited", meta: { by: "admin" } });

  if (String(existing.status) !== nextStatus) {
    if (nextStatus === "sent") await insertEvent(db, { quote_id: id, event_type: "sent", meta: { by: "admin" } });
    if (nextStatus === "paid") await insertEvent(db, { quote_id: id, event_type: "paid", meta: { by: "admin", mode: "manual" } });
    if (nextStatus === "expired") await insertEvent(db, { quote_id: id, event_type: "expired", meta: { by: "admin" } });
  }

  const bundle = await loadQuoteBundle(db, id);
  return withCors(json({ ok: true, ...bundle }), corsOpts(context));
};

export const onRequestPost = async () => badRequest("Method not allowed");
