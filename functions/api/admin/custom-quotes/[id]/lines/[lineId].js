import { badRequest, corsPreflight, forbidden, json, notFound, withCors } from "../../../../_lib/resp.js";
import { requireCustomAdminKey } from "../../../../_lib/auth.js";
import { assertDb, all, exec, one } from "../../../../_lib/db.js";
import { nowIso, uuid } from "../../../../_lib/crypto.js";
import { computeTotals, normalizeLineInput } from "../../../../_lib/custom-quotes.js";

const corsOpts = ({ request, env }) => ({
  request,
  env,
  allowMethods: "PUT, DELETE, OPTIONS",
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

const loadBundle = async (db, quoteId) => {
  const quote = await one(db.prepare("SELECT * FROM custom_quotes WHERE id = ? LIMIT 1").bind(quoteId).all());
  if (!quote) return null;
  const lines = await all(
    db.prepare("SELECT * FROM custom_quote_lines WHERE quote_id = ? ORDER BY sort_order ASC, created_at ASC").bind(quoteId).all()
  );
  const totals = computeTotals(lines);
  return { quote, lines, totals };
};

export const onRequestPut = async (context) => {
  const { request, env, params } = context;
  if (!requireCustomAdminKey({ request, env })) return withCors(forbidden(), corsOpts(context));

  const quoteId = String(params?.id || "").trim();
  const lineId = String(params?.lineId || "").trim();
  if (!quoteId || !lineId) return withCors(notFound(), corsOpts(context));

  const db = assertDb(env);
  const existing = await one(db.prepare("SELECT * FROM custom_quote_lines WHERE id = ? AND quote_id = ? LIMIT 1").bind(lineId, quoteId).all());
  if (!existing) return withCors(notFound(), corsOpts(context));

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return withCors(badRequest("Invalid JSON"), corsOpts(context));
  }

  const input = normalizeLineInput({ ...existing, ...body });
  if (!input.title) return withCors(badRequest("Missing title"), corsOpts(context));

  await exec(
    db,
    "UPDATE custom_quote_lines SET line_type = ?, category = ?, title = ?, description = ?, quantity = ?, unit = ?, unit_price_ex_vat = ?, vat_rate = ?, account_suggestion = ?, sort_order = ? WHERE id = ? AND quote_id = ?",
    [
      input.line_type,
      input.category,
      input.title,
      input.description,
      input.quantity,
      input.unit,
      input.unit_price_ex_vat,
      input.vat_rate,
      input.account_suggestion,
      input.sort_order,
      lineId,
      quoteId,
    ]
  );

  await exec(db, "UPDATE custom_quotes SET updated_at = ? WHERE id = ?", [nowIso(), quoteId]);
  await insertEvent(db, { quote_id: quoteId, event_type: "edited", meta: { by: "admin", action: "line_edit", line_id: lineId } });

  const bundle = await loadBundle(db, quoteId);
  return withCors(json({ ok: true, ...bundle }), corsOpts(context));
};

export const onRequestDelete = async (context) => {
  const { request, env, params } = context;
  if (!requireCustomAdminKey({ request, env })) return withCors(forbidden(), corsOpts(context));

  const quoteId = String(params?.id || "").trim();
  const lineId = String(params?.lineId || "").trim();
  if (!quoteId || !lineId) return withCors(notFound(), corsOpts(context));

  const db = assertDb(env);
  const existing = await one(db.prepare("SELECT id FROM custom_quote_lines WHERE id = ? AND quote_id = ? LIMIT 1").bind(lineId, quoteId).all());
  if (!existing) return withCors(notFound(), corsOpts(context));

  await exec(db, "DELETE FROM custom_quote_lines WHERE id = ? AND quote_id = ?", [lineId, quoteId]);
  await exec(db, "UPDATE custom_quotes SET updated_at = ? WHERE id = ?", [nowIso(), quoteId]);
  await insertEvent(db, { quote_id: quoteId, event_type: "edited", meta: { by: "admin", action: "line_delete", line_id: lineId } });

  const bundle = await loadBundle(db, quoteId);
  return withCors(json({ ok: true, ...bundle }), corsOpts(context));
};

export const onRequestGet = async (context) => withCors(badRequest("Method not allowed"), corsOpts(context));
export const onRequestPost = async (context) => withCors(badRequest("Method not allowed"), corsOpts(context));
