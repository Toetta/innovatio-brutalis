import { badRequest, json, notFound } from "../../_lib/resp.js";
import { assertDb, all, exec, one } from "../../_lib/db.js";
import { nowIso, uuid } from "../../_lib/crypto.js";
import { computeTotals } from "../../_lib/custom-quotes.js";
import { createStripeCheckoutSession } from "../../_lib/stripe.js";

const maybeExpireQuote = async (db, quote) => {
  const status = String(quote?.status || "");
  const expires_at = quote?.expires_at ? String(quote.expires_at) : "";
  if (!expires_at) return quote;

  const ts = nowIso();
  if ((status === "draft" || status === "sent") && expires_at <= ts) {
    await exec(db, "UPDATE custom_quotes SET status = 'expired', updated_at = ? WHERE id = ? AND status IN ('draft','sent')", [ts, quote.id]);
    await exec(
      db,
      "INSERT INTO custom_quote_events (id, quote_id, event_type, meta_json, created_at) VALUES (?,?,?,?,?)",
      [uuid(), quote.id, "expired", JSON.stringify({ by: "system" }), ts]
    );
    return { ...quote, status: "expired", updated_at: ts };
  }

  return quote;
};

const toMinor = (amountMajor, currency) => {
  // Currently only SEK is expected. Keep generic 2-decimal conversion.
  const c = String(currency || "sek").toLowerCase();
  const factor = c === "jpy" ? 1 : 100;
  return Math.round(Number(amountMajor || 0) * factor);
};

export const onRequestPost = async (context) => {
  const { request, env, params } = context;
  const token = String(params?.token || "").trim();
  if (!token) return notFound();

  const db = assertDb(env);

  let quote = await one(db.prepare("SELECT * FROM custom_quotes WHERE token = ? LIMIT 1").bind(token).all());
  if (!quote) return notFound();

  quote = await maybeExpireQuote(db, quote);
  const status = String(quote?.status || "");

  if (status === "paid") return badRequest("Already paid");
  if (status === "expired" || status === "cancelled") return badRequest("Link not valid");
  if (status !== "draft" && status !== "sent") return badRequest("Not payable");

  const lines = await all(
    db.prepare("SELECT * FROM custom_quote_lines WHERE quote_id = ? ORDER BY sort_order ASC, created_at ASC").bind(quote.id).all()
  );
  const totals = computeTotals(lines);

  const amount_minor = toMinor(totals?.total_inc_vat, quote.currency);
  if (!amount_minor || amount_minor < 50) {
    // Stripe minimum for SEK is typically 50 öre (0.50 SEK). Keep a simple guard.
    return badRequest("Amount too small");
  }

  const origin = new URL(request.url).origin;
  const payUrl = `${origin}/pay/${encodeURIComponent(token)}`;

  try {
    const session = await createStripeCheckoutSession({
      env,
      amount_minor,
      currency: String(quote.currency || "SEK").toLowerCase(),
      success_url: `${payUrl}?paid=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${payUrl}?canceled=1`,
      customer_email: quote.customer_email || "",
      name: "Innovatio Brutalis – Betalning",
      description: `Custom quote ${quote.id}`,
      metadata: {
        quote_id: String(quote.id || ""),
        quote_token: String(token),
        kind: "custom_quote",
      },
    });

    const url = String(session?.url || "");
    if (!url) return badRequest("Stripe session missing url");

    await exec(
      db,
      "INSERT INTO custom_quote_events (id, quote_id, event_type, meta_json, created_at) VALUES (?,?,?,?,?)",
      [uuid(), quote.id, "stripe_checkout_created", JSON.stringify({ session_id: session?.id || null }), nowIso()]
    );

    return json({ ok: true, url });
  } catch (e) {
    const msg = e?.message || "Stripe error";
    return json({ ok: false, error: msg }, { status: 400 });
  }
};

export const onRequestGet = async () => badRequest("Method not allowed");
