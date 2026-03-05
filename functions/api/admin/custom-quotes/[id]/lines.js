import { badRequest, forbidden, json, notFound } from "../../../_lib/resp.js";
import { requireCustomAdminKey } from "../../../_lib/auth.js";
import { assertDb, all, exec, one } from "../../../_lib/db.js";
import { nowIso, uuid } from "../../../_lib/crypto.js";
import { computeTotals, normalizeLineInput } from "../../../_lib/custom-quotes.js";

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
  if (!requireCustomAdminKey({ request, env })) return forbidden();

  const quoteId = String(params?.id || "").trim();
  if (!quoteId) return notFound();

  const db = assertDb(env);
  const existing = await one(db.prepare("SELECT id FROM custom_quotes WHERE id = ? LIMIT 1").bind(quoteId).all());
  if (!existing) return notFound();

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return badRequest("Invalid JSON");
  }

  const line = normalizeLineInput(body);
  if (!line.title) return badRequest("Missing title");

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
  return json({ ok: true, ...bundle });
};

export const onRequestGet = async () => badRequest("Method not allowed");
export const onRequestPut = async () => badRequest("Method not allowed");
export const onRequestDelete = async () => badRequest("Method not allowed");
