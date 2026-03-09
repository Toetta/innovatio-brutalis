import { json, badRequest, text } from "../_lib/resp.js";
import { assertDb, exec, one } from "../_lib/db.js";
import { nowIso, uuid } from "../_lib/crypto.js";
import { verifyStripeWebhook } from "../_lib/stripe.js";
import { stripeBalanceTotalsForPayout } from "../_lib/stripe.js";
import { queueFuPayloadForCustomQuoteSale, queueFuPayloadForOrder, queueFuPayloadForStripePayout } from "../_lib/fu.js";
import { sendPaymentNotificationEmail } from "../_lib/email.js";

const markCustomQuotePaid = async ({ db, quote_id, token, meta }) => {
  const qid = String(quote_id || "").trim();
  const t = String(token || "").trim();
  if (!qid && !t) return { ok: false, error: "Missing quote id/token" };

  const quote = qid
    ? await one(db.prepare("SELECT id, status, paid_at FROM custom_quotes WHERE id = ? LIMIT 1").bind(qid).all())
    : await one(db.prepare("SELECT id, status, paid_at FROM custom_quotes WHERE token = ? LIMIT 1").bind(t).all());

  if (!quote?.id) return { ok: false, error: "Quote not found" };
  const alreadyPaid = String(quote?.status || "") === "paid" || !!quote?.paid_at;

  const ts = nowIso();
  await exec(
    db,
    "UPDATE custom_quotes SET status = 'paid', paid_at = COALESCE(paid_at, ?), updated_at = ? WHERE id = ? AND status IN ('draft','sent','paid')",
    [ts, ts, quote.id]
  );
  await exec(
    db,
    "INSERT INTO custom_quote_events (id, quote_id, event_type, meta_json, created_at) VALUES (?,?,?,?,?)",
    [uuid(), quote.id, "paid", JSON.stringify({ by: "stripe", ...(meta || {}) }), ts]
  );

  return { ok: true, id: quote.id, newlyPaid: !alreadyPaid };
};

const formatMoney = (amount, currency = "SEK") => {
  const value = Number(amount || 0);
  const curr = String(currency || "SEK").trim() || "SEK";
  try {
    return new Intl.NumberFormat("sv-SE", { style: "currency", currency: curr }).format(value);
  } catch (_) {
    return `${value.toFixed(2)} ${curr}`;
  }
};

const parseMetaJson = (raw) => {
  try {
    const parsed = JSON.parse(String(raw || "{}"));
    return (parsed && typeof parsed === "object" && !Array.isArray(parsed)) ? parsed : {};
  } catch (_) {
    return {};
  }
};

const sendOrderPaidNotification = async ({ env, db, orderId, paymentIntentId }) => {
  const row = await one(
    db.prepare(
      "SELECT id, order_number, email, currency, total_inc_vat, paid_at, payment_provider, payment_reference, metadata FROM orders WHERE id = ? LIMIT 1"
    ).bind(String(orderId || "")).all()
  );
  if (!row?.id) return { ok: false, error: "Order not found" };

  const meta = parseMetaJson(row.metadata);
  const fullName = String(meta?.customer?.full_name || "").trim();
  const phone = String(meta?.customer?.phone || "").trim();
  const subject = `Stripe-betalning registrerad: ${String(row.order_number || row.id)}`;
  const text = [
    "En Stripe-betalning har registrerats.",
    "",
    `Ordernummer: ${String(row.order_number || row.id)}`,
    `Order-ID: ${String(row.id)}`,
    `Belopp: ${formatMoney(row.total_inc_vat, row.currency)}`,
    `Valuta: ${String(row.currency || "SEK")}`,
    `Kund: ${fullName || "-"}`,
    `E-post: ${String(row.email || "-")}`,
    `Telefon: ${phone || "-"}`,
    `Betald: ${String(row.paid_at || "")}`,
    `Betalningsmetod: ${String(row.payment_provider || "stripe")}`,
    `Stripe payment_intent: ${String(paymentIntentId || row.payment_reference || "-")}`,
  ].join("\n");

  return await sendPaymentNotificationEmail({ env, subject, text });
};

const sendCustomQuotePaidNotification = async ({ env, db, quoteId, paymentIntentId, sessionId }) => {
  const row = await one(
    db.prepare(
      "SELECT id, customer_email, customer_name, customer_phone, company_name, currency, paid_at FROM custom_quotes WHERE id = ? LIMIT 1"
    ).bind(String(quoteId || "")).all()
  );
  if (!row?.id) return { ok: false, error: "Custom quote not found" };

  const subject = `Stripe-betalning registrerad: offert ${String(row.id)}`;
  const text = [
    "En Stripe-betalning för en privat betalningslänk/offert har registrerats.",
    "",
    `Offert-ID: ${String(row.id)}`,
    `Företag: ${String(row.company_name || "-")}`,
    `Kund: ${String(row.customer_name || "-")}`,
    `E-post: ${String(row.customer_email || "-")}`,
    `Telefon: ${String(row.customer_phone || "-")}`,
    `Valuta: ${String(row.currency || "SEK")}`,
    `Betald: ${String(row.paid_at || "")}`,
    `Stripe payment_intent: ${String(paymentIntentId || "-")}`,
    `Stripe session: ${String(sessionId || "-")}`,
  ].join("\n");

  return await sendPaymentNotificationEmail({ env, subject, text });
};

const recordEvent = async ({ db, event, rawBody, order_id }) => {
  try {
    await exec(
      db,
      "INSERT INTO payment_events (id, provider, event_id, type, order_id, created_at, payload) VALUES (?,?,?,?,?,?,?)",
      [uuid(), "stripe", String(event.id || ""), String(event.type || ""), order_id || null, nowIso(), rawBody || null]
    );
    return { ok: true, inserted: true };
  } catch (_) {
    // UNIQUE(provider,event_id) => already processed
    return { ok: true, inserted: false };
  }
};

export const onRequestPost = async (context) => {
  const { request, env } = context;
  const db = assertDb(env);

  const verified = await verifyStripeWebhook({ request, env });
  if (!verified.ok) return badRequest(verified.error || "Invalid webhook");

  const { event, rawBody } = verified;
  const type = String(event?.type || "");

  // Resolve order_id when possible.
  const obj = event?.data?.object || {};
  let order_id = "";

  if (type.startsWith("payment_intent.")) {
    order_id = String(obj?.metadata?.order_id || "");
    if (!order_id && obj?.id) {
      const found = await one(db.prepare("SELECT id FROM orders WHERE payment_reference = ? LIMIT 1").bind(String(obj.id)).all());
      if (found?.id) order_id = String(found.id);
    }
  } else if (type === "charge.refunded") {
    const pi = String(obj?.payment_intent || "");
    if (pi) {
      const found = await one(db.prepare("SELECT id FROM orders WHERE payment_reference = ? LIMIT 1").bind(pi).all());
      if (found?.id) order_id = String(found.id);
    }
  }

  const rec = await recordEvent({ db, event, rawBody, order_id: order_id || null });
  if (!rec.inserted) {
    // Already handled.
    return text("ok", { status: 200 });
  }

  const ts = nowIso();

  if (type === "checkout.session.completed") {
    const quote_id = String(obj?.metadata?.quote_id || "").trim();
    const token = String(obj?.metadata?.quote_token || "").trim();
    if (quote_id || token) {
      const paid = await markCustomQuotePaid({
        db,
        quote_id,
        token,
        meta: { session_id: String(obj?.id || ""), payment_intent: String(obj?.payment_intent || "") },
      }).catch(() => null);

      if (paid?.ok && paid?.id) {
        await queueFuPayloadForCustomQuoteSale({ env, quoteId: paid.id }).catch(() => null);
        if (paid.newlyPaid) {
          await sendCustomQuotePaidNotification({
            env,
            db,
            quoteId: paid.id,
            paymentIntentId: String(obj?.payment_intent || ""),
            sessionId: String(obj?.id || ""),
          }).catch(() => null);
        }
      }
    }
    return text("ok", { status: 200 });
  }

  if (type === "payment_intent.succeeded") {
    const piId = String(obj?.id || "");

    // Custom quotes: payment intent metadata may contain quote reference.
    const qid = String(obj?.metadata?.quote_id || "").trim();
    const qtok = String(obj?.metadata?.quote_token || "").trim();
    if (qid || qtok) {
      const paid = await markCustomQuotePaid({ db, quote_id: qid, token: qtok, meta: { payment_intent: piId } }).catch(() => null);
      if (paid?.ok && paid?.id) {
        await queueFuPayloadForCustomQuoteSale({ env, quoteId: paid.id }).catch(() => null);
        if (paid.newlyPaid) {
          await sendCustomQuotePaidNotification({ env, db, quoteId: paid.id, paymentIntentId: piId, sessionId: "" }).catch(() => null);
        }
      }
    }

    if (order_id) {
      const before = await one(db.prepare("SELECT status FROM orders WHERE id = ? LIMIT 1").bind(order_id).all()).catch(() => null);
      await exec(
        db,
        "UPDATE orders SET status = 'paid', paid_at = COALESCE(paid_at, ?), payment_provider = 'stripe', payment_reference = COALESCE(payment_reference, ?), updated_at = ? WHERE id = ? AND status IN ('pending_payment','awaiting_action','failed')",
        [ts, piId || null, ts, order_id]
      );
      await queueFuPayloadForOrder({ env, orderId: order_id, kind: "sale" }).catch(() => null);
      if (String(before?.status || "") !== "paid") {
        await sendOrderPaidNotification({ env, db, orderId: order_id, paymentIntentId: piId }).catch(() => null);
      }
    }
    return text("ok", { status: 200 });
  }

  if (type === "payment_intent.payment_failed") {
    if (order_id) {
      await exec(
        db,
        "UPDATE orders SET status = 'failed', failed_at = COALESCE(failed_at, ?), updated_at = ? WHERE id = ? AND status IN ('pending_payment','awaiting_action')",
        [ts, ts, order_id]
      );
    }
    return text("ok", { status: 200 });
  }

  if (type === "charge.refunded") {
    if (order_id) {
      await exec(
        db,
        "UPDATE orders SET status = 'refunded', refunded_at = COALESCE(refunded_at, ?), updated_at = ? WHERE id = ? AND status IN ('paid','refunded')",
        [ts, ts, order_id]
      );
      await queueFuPayloadForOrder({ env, orderId: order_id, kind: "refund" }).catch(() => null);
    }
    return text("ok", { status: 200 });
  }

  // Queue Stripe payout voucher (bank settlement + fees)
  if (type === "payout.paid") {
    const payoutId = String(obj?.id || "");
    if (payoutId) {
      try {
        const totals = await stripeBalanceTotalsForPayout({ env, payoutId });
        await queueFuPayloadForStripePayout({ env, payout: obj, totals }).catch(() => null);
      } catch (_) {
        // Non-fatal: still accept webhook
      }
    }
    return text("ok", { status: 200 });
  }

  // Ignore other event types.
  return text("ok", { status: 200 });
};

export const onRequestGet = async () => json({ ok: true, message: "Use POST" }, { status: 200 });
