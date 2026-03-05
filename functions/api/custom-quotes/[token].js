import { badRequest, json, notFound } from "../_lib/resp.js";
import { assertDb, all, exec, getClientIp, one } from "../_lib/db.js";
import { nowIso, sha256Hex, uuid } from "../_lib/crypto.js";
import { computeTotals, safeJsonParse } from "../_lib/custom-quotes.js";

const RATE_LIMIT_PER_MINUTE = 30;

const insertEvent = async (db, { quote_id, event_type, meta }) => {
  await exec(
    db,
    "INSERT INTO custom_quote_events (id, quote_id, event_type, meta_json, created_at) VALUES (?,?,?,?,?)",
    [uuid(), quote_id, String(event_type || ""), meta != null ? JSON.stringify(meta) : null, nowIso()]
  );
};

const rateLimitOrThrow = async (db, { request, token }) => {
  const ip = getClientIp(request);
  const ipHash = await sha256Hex(ip || "");
  const bucket = nowIso().slice(0, 16); // YYYY-MM-DDTHH:MM
  const ts = nowIso();

  await exec(
    db,
    "INSERT INTO custom_quote_rate_limits (id, ip_hash, token, bucket, count, created_at) VALUES (?,?,?,?,1,?) ON CONFLICT(ip_hash, token, bucket) DO UPDATE SET count = count + 1",
    [uuid(), ipHash, token, bucket, ts]
  );

  const row = await one(
    db.prepare("SELECT count FROM custom_quote_rate_limits WHERE ip_hash = ? AND token = ? AND bucket = ? LIMIT 1").bind(ipHash, token, bucket).all()
  );

  const count = Number(row?.count || 0);
  if (count > RATE_LIMIT_PER_MINUTE) {
    return { ok: false, count, bucket };
  }

  return { ok: true, count, bucket };
};

const maybeExpireQuote = async (db, quote) => {
  const status = String(quote?.status || "");
  const expires_at = quote?.expires_at ? String(quote.expires_at) : "";
  if (!expires_at) return quote;

  const ts = nowIso();
  if ((status === "draft" || status === "sent") && expires_at <= ts) {
    await exec(db, "UPDATE custom_quotes SET status = 'expired', updated_at = ? WHERE id = ? AND status IN ('draft','sent')", [ts, quote.id]);
    await insertEvent(db, { quote_id: quote.id, event_type: "expired", meta: { by: "system" } });
    return { ...quote, status: "expired", updated_at: ts };
  }
  return quote;
};

export const onRequestGet = async (context) => {
  const { request, env, params } = context;
  const token = String(params?.token || "").trim();
  if (!token) return notFound();

  const db = assertDb(env);

  const rl = await rateLimitOrThrow(db, { request, token });
  if (!rl.ok) {
    return json({ ok: false, error: "Too many requests" }, { status: 429 });
  }

  let quote = await one(db.prepare("SELECT * FROM custom_quotes WHERE token = ? LIMIT 1").bind(token).all());
  if (!quote) return notFound();

  quote = await maybeExpireQuote(db, quote);

  const lines = await all(
    db.prepare("SELECT * FROM custom_quote_lines WHERE quote_id = ? ORDER BY sort_order ASC, created_at ASC").bind(quote.id).all()
  );

  const totals = computeTotals(lines);

  // Public-safe shape (exclude internal export timestamps).
  const publicQuote = {
    token: quote.token,
    status: quote.status,
    customer_email: quote.customer_email,
    customer_name: quote.customer_name,
    customer_phone: quote.customer_phone,
    company_name: quote.company_name,
    orgnr: quote.orgnr,
    vat_id: quote.vat_id,
    billing_address: safeJsonParse(quote.billing_address_json) || null,
    shipping_address: safeJsonParse(quote.shipping_address_json) || null,
    currency: quote.currency,
    vat_scheme: quote.vat_scheme,
    notes: quote.notes,
    created_at: quote.created_at,
    updated_at: quote.updated_at,
    expires_at: quote.expires_at,
    paid_at: quote.paid_at,
  };

  return json({ ok: true, quote: publicQuote, lines, totals });
};

export const onRequestPost = async () => badRequest("Method not allowed");
