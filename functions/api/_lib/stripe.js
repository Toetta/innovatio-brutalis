import { getEnv } from "./env.js";

const hex = (buf) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
};

const hmacSha256Hex = async (secret, message) => {
  const keyData = new TextEncoder().encode(String(secret));
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(String(message)));
  return hex(sig);
};

const safeEqualHex = (a, b) => {
  const aa = String(a || "").toLowerCase();
  const bb = String(b || "").toLowerCase();
  if (aa.length !== bb.length) return false;
  let out = 0;
  for (let i = 0; i < aa.length; i++) out |= aa.charCodeAt(i) ^ bb.charCodeAt(i);
  return out === 0;
};

export const verifyStripeWebhook = async ({ request, env, toleranceSeconds = 5 * 60 }) => {
  const { STRIPE_WEBHOOK_SECRET } = getEnv(env);
  if (!STRIPE_WEBHOOK_SECRET) return { ok: false, error: "Stripe webhook secret not configured" };

  const sig = request.headers.get("stripe-signature") || "";
  const parts = sig.split(",").map((p) => p.trim());
  const tPart = parts.find((p) => p.startsWith("t=")) || "";
  const v1Part = parts.find((p) => p.startsWith("v1=")) || "";
  const t = Number((tPart.split("=")[1] || "").trim());
  const v1 = String((v1Part.split("=")[1] || "").trim());

  if (!t || !Number.isFinite(t) || !v1) return { ok: false, error: "Missing Stripe signature" };

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - t) > Number(toleranceSeconds || 0)) return { ok: false, error: "Stripe signature timestamp out of tolerance" };

  const rawBody = await request.text();
  const signedPayload = `${t}.${rawBody}`;
  const expected = await hmacSha256Hex(STRIPE_WEBHOOK_SECRET, signedPayload);
  if (!safeEqualHex(expected, v1)) return { ok: false, error: "Invalid Stripe signature" };

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch (_) {
    return { ok: false, error: "Invalid JSON" };
  }

  return { ok: true, event, rawBody };
};

export const createStripePaymentIntent = async ({ env, amount_minor, currency = "sek", orderId, orderNumber, customerEmail }) => {
  const { STRIPE_SECRET_KEY } = getEnv(env);
  if (!STRIPE_SECRET_KEY) throw new Error("Stripe secret key not configured");

  const form = new URLSearchParams();
  form.set("amount", String(Math.max(0, Math.floor(Number(amount_minor) || 0))));
  form.set("currency", String(currency || "sek").toLowerCase());
  form.set("automatic_payment_methods[enabled]", "true");
  if (orderId) form.set("metadata[order_id]", String(orderId));
  if (orderNumber) form.set("metadata[order_number]", String(orderNumber));
  if (customerEmail) form.set("receipt_email", String(customerEmail));
  form.set("description", orderNumber ? `Order ${orderNumber}` : "Innovatio Brutalis order");

  const res = await fetch("https://api.stripe.com/v1/payment_intents", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${STRIPE_SECRET_KEY}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.error?.message || "Stripe error";
    const err = new Error(msg);
    err.data = data;
    err.status = res.status;
    throw err;
  }

  return data;
};

export const stripeBalanceTotalsForPayout = async ({ env, payoutId }) => {
  const { STRIPE_SECRET_KEY } = getEnv(env);
  if (!STRIPE_SECRET_KEY) throw new Error("Stripe secret key not configured");

  const pid = String(payoutId || "").trim();
  if (!pid) throw new Error("Missing payoutId");

  let amount_minor = 0;
  let fee_minor = 0;
  let net_minor = 0;
  let count = 0;

  let starting_after = "";
  for (let page = 0; page < 50; page++) {
    const url = new URL("https://api.stripe.com/v1/balance_transactions");
    url.searchParams.set("payout", pid);
    url.searchParams.set("limit", "100");
    if (starting_after) url.searchParams.set("starting_after", starting_after);

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "authorization": `Bearer ${STRIPE_SECRET_KEY}`,
      },
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = data?.error?.message || "Stripe error";
      const err = new Error(msg);
      err.data = data;
      err.status = res.status;
      throw err;
    }

    const list = Array.isArray(data?.data) ? data.data : [];
    for (const bt of list) {
      amount_minor += Number(bt?.amount || 0) || 0;
      fee_minor += Number(bt?.fee || 0) || 0;
      net_minor += Number(bt?.net || 0) || 0;
      count++;
    }

    if (!data?.has_more) break;
    const last = list[list.length - 1];
    starting_after = String(last?.id || "");
    if (!starting_after) break;
  }

  return { payoutId: pid, amount_minor, fee_minor, net_minor, count };
};
