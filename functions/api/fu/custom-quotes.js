import { badRequest, forbidden, json } from "../_lib/resp.js";
import { requireCustomAdminKey } from "../_lib/auth.js";
import { assertDb, all } from "../_lib/db.js";
import { computeTotals, buildFuCustomQuotePayload, safeJsonParse } from "../_lib/custom-quotes.js";

const parseSince = (value) => {
  const s = String(value || "").trim();
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return `${s}T00:00:00.000Z`;
};

export const onRequestGet = async (context) => {
  const { request, env } = context;
  if (!requireCustomAdminKey({ request, env })) return forbidden();

  const url = new URL(request.url);
  const status = String(url.searchParams.get("status") || "paid").trim().toLowerCase();
  if (status !== "paid") return badRequest("Unsupported status");

  const since = parseSince(url.searchParams.get("since") || "");

  const db = assertDb(env);
  const quotes = await all(
    db
      .prepare(
        "SELECT * FROM custom_quotes WHERE status = 'paid' " + (since ? "AND paid_at >= ? " : "") + "ORDER BY paid_at ASC LIMIT 200"
      )
      .bind(...(since ? [since] : []))
      .all()
  );

  const payloads = [];
  for (const q of quotes) {
    const lines = await all(
      db.prepare("SELECT * FROM custom_quote_lines WHERE quote_id = ? ORDER BY sort_order ASC, created_at ASC").bind(q.id).all()
    );

    const totals = computeTotals(lines);

    // Attach parsed billing/shipping for export convenience.
    const enrichedQuote = {
      ...q,
      billing_address_json: q.billing_address_json,
      shipping_address_json: q.shipping_address_json,
      billing_address: safeJsonParse(q.billing_address_json) || null,
      shipping_address: safeJsonParse(q.shipping_address_json) || null,
    };

    payloads.push(buildFuCustomQuotePayload({ quote: enrichedQuote, lines, totals }));
  }

  return json({ ok: true, payloads });
};

export const onRequestPost = async () => badRequest("Method not allowed");
