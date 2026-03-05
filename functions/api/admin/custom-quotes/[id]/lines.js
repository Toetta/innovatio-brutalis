import { badRequest, corsPreflight, forbidden, json, notFound, withCors } from "../../../_lib/resp.js";
import { requireCustomAdminKey } from "../../../_lib/auth.js";
import { assertDb, all, exec, one } from "../../../_lib/db.js";
import { nowIso, uuid } from "../../../_lib/crypto.js";
import { computeTotals, normalizeLineInput } from "../../../_lib/custom-quotes.js";

const corsOpts = ({ request, env }) => ({
  request,
  env,
  allowMethods: "POST, OPTIONS",
  allowHeaders: "content-type, x-admin-key",
});

export const onRequestOptions = async (context) => {
  return corsPreflight(context, corsOpts(context));
};

const insertEvent = async (db, { quote_id, event_type, meta }) => {
  await exec(
    db,
    "INSERT INTO custom_quote_events (id, quote_id, event_type, meta_json, created_at) VALUES (?,?,?,?,?)",
    [uuid(), quote_id, String(event_type || ""), meta != null ? JSON.stringify(meta) : null, nowIso()]
  );
};

const loadBundle = async (db, id) => {
  const quote = await one(db.prepare("SELECT * FROM custom_quotes WHERE id = ? LIMIT 1").bind(id).all());
  if (!quote) return null;
  const lines = await all(
    db.prepare("SELECT * FROM custom_quote_lines WHERE quote_id = ? ORDER BY sort_order ASC, created_at ASC").bind(id).all()
  );
  const totals = computeTotals(lines);
  return { quote, lines, totals };
};

export const onRequestPost = async (context) => {
  const { request, env, params } = context;
  if (!requireCustomAdminKey({ request, env })) return withCors(forbidden(), corsOpts(context));

  const quoteId = String(params?.id || "").trim();
  if (!quoteId) return withCors(notFound(), corsOpts(context));

  const db = assertDb(env);
  const existing = await one(db.prepare("SELECT id FROM custom_quotes WHERE id = ? LIMIT 1").bind(quoteId).all());
  if (!existing) return withCors(notFound(), corsOpts(context));

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return withCors(badRequest("Invalid JSON"), corsOpts(context));
  }

  const line = normalizeLineInput(body);
  if (!line.title) return withCors(badRequest("Missing title"), corsOpts(context));

  const lineId = uuid();
  await exec(
    db,
    "INSERT INTO custom_quote_lines (id, quote_id, line_type, category, title, description, quantity, unit, unit_price_ex_vat, vat_rate, account_suggestion, sort_order, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
    [
      lineId,
      quoteId,
      line.line_type,
      line.category,
      line.title,
      line.description,
      line.quantity,
      line.unit,
      line.unit_price_ex_vat,
      line.vat_rate,
      line.account_suggestion,
      line.sort_order,
      line.created_at,
    ]
  );

  await exec(db, "UPDATE custom_quotes SET updated_at = ? WHERE id = ?", [nowIso(), quoteId]);
  await insertEvent(db, { quote_id: quoteId, event_type: "edited", meta: { by: "admin", action: "line_add", line_id: lineId } });

  const bundle = await loadBundle(db, quoteId);
  return withCors(json({ ok: true, ...bundle }), corsOpts(context));
};

export const onRequestGet = async (context) => withCors(badRequest("Method not allowed"), corsOpts(context));
export const onRequestPut = async (context) => withCors(badRequest("Method not allowed"), corsOpts(context));
export const onRequestDelete = async (context) => withCors(badRequest("Method not allowed"), corsOpts(context));
