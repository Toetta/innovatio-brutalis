import { badRequest, json, unauthorized } from "./_lib/resp.js";
import { requireCustomer } from "./_lib/auth.js";
import { assertDb, all, exec } from "./_lib/db.js";
import { getEnv } from "./_lib/env.js";
import { nowIso, uuid, sha256Hex, randomToken } from "./_lib/crypto.js";
import { createStripePaymentIntent } from "./_lib/stripe.js";
import { createKlarnaPaymentsSession } from "./_lib/klarna.js";

const getOrdersSchemaInfo = async (db) => {
  const rows = await all(db.prepare("PRAGMA table_info(orders)").all());
  const cols = new Set(rows.map((r) => String(r?.name || "")).filter(Boolean));
  const v2 = cols.has("customer_country") && cols.has("payment_provider") && cols.has("public_token_hash") && cols.has("subtotal_minor");
  return { v2, cols: Array.from(cols).sort((a, b) => a.localeCompare(b)) };
};

const to2 = (n) => {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
};

const toMinor = (n) => {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100);
};

const genOrderNumber = async () => {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const rand = (await randomToken(6)).toUpperCase().slice(0, 6);
  return `IB-${y}${m}${day}-${rand}`;
};

const loadProducts = async ({ request, slugs = [] }) => {
  const wanted = Array.isArray(slugs) ? slugs.map((s) => String(s || "").trim()).filter(Boolean) : [];

  const map = new Map();

  // Fast path: aggregated file (may be stale in some deploy setups)
  try {
    const url = new URL("/content/products.json", request.url);
    const res = await fetch(url.toString(), { headers: { accept: "application/json" }, cache: "no-store" });
    if (res.ok) {
      const data = await res.json().catch(() => null);
      const products = Array.isArray(data?.products) ? data.products : [];
      for (const p of products) {
        const slug = String(p?.slug || "").trim();
        if (!slug) continue;
        if (!map.has(slug)) map.set(slug, p);
      }
    }
  } catch (_) {
    // ignore
  }

  // Fallback: load missing products directly from folder-based JSON files
  const missing = wanted.length ? wanted.filter((s) => !map.has(s)) : [];
  if (missing.length) {
    const base = new URL("/content/products/", request.url);
    const docs = await Promise.all(
      missing.map(async (slug) => {
        try {
          const url = new URL(`${encodeURIComponent(slug)}.json`, base);
          const res = await fetch(url.toString(), { headers: { accept: "application/json" }, cache: "no-store" });
          if (!res.ok) return null;
          return await res.json();
        } catch (_) {
          return null;
        }
      })
    );
    for (const p of docs) {
      const slug = String(p?.slug || "").trim();
      if (!slug) continue;
      if (!map.has(slug)) map.set(slug, p);
    }
  }

  if (!map.size) throw new Error("Could not load products");
  return map;
};

export const onRequestGet = async (context) => {
  const { request, env } = context;
  const auth = await requireCustomer({ request, env });
  if (!auth.ok) return unauthorized();

  const db = assertDb(env);
  const rows = await all(
    db.prepare(
      "SELECT id, order_number, status, currency, total_inc_vat, placed_at FROM orders WHERE customer_id = ? ORDER BY placed_at DESC LIMIT 100"
    ).bind(auth.customer.id).all()
  );
  return json({ ok: true, orders: rows });
};

export const onRequestPost = async (context) => {
  try {
    const { request, env } = context;
    const db = assertDb(env);
    // Guard against outdated schema (migration 0002 not applied)
    const schema = await getOrdersSchemaInfo(db).catch(() => ({ v2: false, cols: [] }));
    if (!schema.v2) {
      const cfg = getEnv(env);
      const details = cfg.DEV_MODE ? ` Existing columns: ${schema.cols.join(", ")}` : "";
      return json(
        {
          ok: false,
          error: "Database schema is outdated (orders table). Apply migrations/0002_payments_and_fu.sql to your D1 database." + details,
        },
        { status: 500 }
      );
    }
    const auth = await requireCustomer({ request, env }).catch(() => ({ ok: false }));

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return badRequest("Invalid JSON");
  }

  const email = String(body?.email || (auth.ok ? auth.customer.email : "")).trim().toLowerCase();
  if (!email || !email.includes("@")) return badRequest("Missing email");

  const customer_country = String(body?.customer_country || "SE").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(customer_country)) return badRequest("Invalid customer_country");

  const payment_provider = String(body?.payment_provider || "stripe").trim().toLowerCase();
  if (!payment_provider || !["stripe", "swish_manual", "klarna"].includes(payment_provider)) {
    return badRequest("Unsupported payment_provider");
  }

  const itemsRaw = body?.items;
  const itemsObj = (itemsRaw && typeof itemsRaw === "object" && !Array.isArray(itemsRaw)) ? itemsRaw : null;
  if (!itemsObj) return badRequest("Missing items");

  const cartItems = Object.entries(itemsObj)
    .map(([slug, qty]) => ({ slug: String(slug || "").trim(), qty: Math.max(0, Math.floor(Number(qty) || 0)) }))
    .filter((x) => x.slug && x.qty > 0);

  if (!cartItems.length) return badRequest("Cart is empty");
  if (cartItems.length > 50) return badRequest("Too many items");

  let products;
  try {
    products = await loadProducts({ request, slugs: cartItems.map((x) => x.slug) });
  } catch (_) {
    return badRequest("Could not load catalog");
  }

  const vatRate = customer_country === "SE" ? 0.25 : 0.0;
  const lines = [];
  for (const ci of cartItems) {
    const p = products.get(ci.slug);
    if (!p || p.published === false) return badRequest(`Unknown product: ${ci.slug}`);
    const title = String(p?.title || ci.slug);
    const sku = String(p?.sku || p?.slug || ci.slug);
    const priceIncVat = Number(p?.price_sek);
    if (!Number.isFinite(priceIncVat) || priceIncVat < 0) return badRequest(`Invalid price: ${ci.slug}`);

    const unitEx = vatRate > 0 ? (priceIncVat / (1 + vatRate)) : priceIncVat;
    const lineEx = unitEx * ci.qty;
    const lineVat = lineEx * vatRate;
    const lineInc = lineEx + lineVat;

    lines.push({
      product_id: null,
      sku,
      title,
      qty: ci.qty,
      unit_price_ex_vat: to2(unitEx),
      vat_rate: vatRate,
      line_total_ex_vat: to2(lineEx),
      line_vat: to2(lineVat),
      line_total_inc_vat: to2(lineInc),
    });
  }

  const subtotal_ex_vat = to2(lines.reduce((s, l) => s + l.line_total_ex_vat, 0));
  const vat_total = to2(lines.reduce((s, l) => s + l.line_vat, 0));
  const shipping_ex_vat = 0;
  const shipping_vat = 0;
  const total_inc_vat = to2(lines.reduce((s, l) => s + l.line_total_inc_vat, 0));
  const subtotal_minor = toMinor(subtotal_ex_vat);
  const vat_total_minor = toMinor(vat_total);
  const shipping_minor = 0;
  const total_minor = toMinor(total_inc_vat);

  const currency = "SEK";

  // Klarna guard (SE + <= KLARNA_MAX_SEK)
  if (payment_provider === "klarna") {
    const { KLARNA_MAX_SEK, KLARNA_USERNAME, KLARNA_PASSWORD } = getEnv(env);
    if (String(customer_country) !== "SE") return badRequest("Klarna only available for SE");
    if (Number(total_inc_vat) > Number(KLARNA_MAX_SEK || 0)) return badRequest(`Klarna max ${Number(KLARNA_MAX_SEK || 0)} SEK`);
    if (!KLARNA_USERNAME || !KLARNA_PASSWORD) return badRequest("Klarna not configured");
  }

  const id = uuid();
  const order_number = await genOrderNumber();
  const ts = nowIso();
  const placed_at = ts;
  const created_at = ts;
  const updated_at = ts;
  const customer_id = auth.ok ? auth.customer.id : null;

  const public_token = await randomToken(24);
  const public_token_hash = await sha256Hex(public_token);

  const metadata = body?.metadata && typeof body.metadata === "object" ? JSON.stringify(body.metadata) : null;

  await exec(
    db,
    "INSERT INTO orders (id, order_number, customer_id, email, customer_country, currency, status, payment_provider, payment_reference, payment_method, subtotal_ex_vat, vat_total, shipping_ex_vat, shipping_vat, total_inc_vat, subtotal_minor, vat_total_minor, shipping_minor, total_minor, placed_at, paid_at, refunded_at, failed_at, created_at, updated_at, public_token_hash, fu_voucher_id, fu_sync_status, fu_sync_error, metadata) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    [
      id,
      order_number,
      customer_id,
      email,
      customer_country,
      currency,
      "pending_payment",
      payment_provider === "swish_manual" ? "swish" : payment_provider,
      null,
      payment_provider,
      subtotal_ex_vat,
      vat_total,
      shipping_ex_vat,
      shipping_vat,
      total_inc_vat,
      subtotal_minor,
      vat_total_minor,
      shipping_minor,
      total_minor,
      placed_at,
      null,
      null,
      null,
      created_at,
      updated_at,
      public_token_hash,
      null,
      "not_required",
      null,
      metadata,
    ]
  );

  for (const l of lines) {
    await exec(
      db,
      "INSERT INTO order_lines (id, order_id, product_id, sku, title, qty, unit_price_ex_vat, vat_rate, line_total_ex_vat, line_vat, line_total_inc_vat) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      [uuid(), id, l.product_id, l.sku, l.title, l.qty, l.unit_price_ex_vat, l.vat_rate, l.line_total_ex_vat, l.line_vat, l.line_total_inc_vat]
    );
  }

  if (payment_provider === "swish_manual") {
    const { SWISH_PAYEE_ALIAS } = getEnv(env);
    await exec(
      db,
      "UPDATE orders SET payment_provider = 'swish', payment_reference = ?, payment_method = 'swish_manual', updated_at = ? WHERE id = ?",
      [order_number, nowIso(), id]
    );
    return json({
      ok: true,
      order: {
        id,
        order_number,
        currency,
        status: "pending_payment",
        customer_country,
        vat_rate: vatRate,
        subtotal_ex_vat,
        vat_total,
        shipping_ex_vat,
        shipping_vat,
        total_inc_vat,
        placed_at,
      },
      public_token,
      swish: {
        mode: "manual",
        payee_alias: SWISH_PAYEE_ALIAS || null,
        reference: order_number,
        amount_sek: total_inc_vat,
      },
    });
  }

  if (payment_provider === "klarna") {
    // Build Klarna order lines (minor units, inc VAT)
    const klarnaLines = cartItems.map((ci) => {
      const p = products.get(ci.slug);
      const title = String(p?.title || ci.slug);
      const priceIncVat = Number(p?.price_sek);
      const unit_price = toMinor(priceIncVat);
      const total_amount = unit_price * ci.qty;
      const total_tax_amount = Math.round((total_amount * (vatRate / (1 + vatRate))) || 0);
      return {
        name: title,
        quantity: ci.qty,
        unit_price,
        tax_rate: Math.round(vatRate * 10000),
        total_amount,
        total_tax_amount,
      };
    });

    const session = await createKlarnaPaymentsSession({
      env,
      purchase_country: "SE",
      purchase_currency: "SEK",
      locale: "sv-SE",
      order_amount: total_minor,
      order_tax_amount: vat_total_minor,
      order_lines: klarnaLines,
      merchant_reference1: order_number,
      merchant_reference2: id,
    });

    await exec(
      db,
      "UPDATE orders SET payment_provider = 'klarna', payment_reference = ?, status = 'awaiting_action', updated_at = ? WHERE id = ?",
      [String(session?.session_id || ""), nowIso(), id]
    );

    return json({
      ok: true,
      order: {
        id,
        order_number,
        currency,
        status: "awaiting_action",
        customer_country,
        vat_rate: vatRate,
        subtotal_ex_vat,
        vat_total,
        shipping_ex_vat,
        shipping_vat,
        total_inc_vat,
        placed_at,
      },
      public_token,
      klarna: {
        mode: "test",
        session_id: String(session?.session_id || ""),
        client_token: String(session?.client_token || ""),
      },
    });
  }

    // Stripe
    const { STRIPE_PUBLISHABLE_KEY } = getEnv(env);
    if (!STRIPE_PUBLISHABLE_KEY) return badRequest("Stripe not configured");

    let pi;
    try {
      pi = await createStripePaymentIntent({
        env,
        amount_minor: total_minor,
        currency: "sek",
        orderId: id,
        orderNumber: order_number,
        customerEmail: email,
      });
    } catch (err) {
      const msg = String(err?.message || "Stripe error");
      return badRequest(msg);
    }

    await exec(db, "UPDATE orders SET payment_provider = 'stripe', payment_reference = ?, status = 'awaiting_action', updated_at = ? WHERE id = ?", [String(pi.id || ""), nowIso(), id]);

    return json({
      ok: true,
      order: {
        id,
        order_number,
        currency,
        status: "awaiting_action",
        customer_country,
        vat_rate: vatRate,
        subtotal_ex_vat,
        vat_total,
        shipping_ex_vat,
        shipping_vat,
        total_inc_vat,
        placed_at,
      },
      public_token,
      stripe: {
        publishable_key: STRIPE_PUBLISHABLE_KEY,
        client_secret: String(pi.client_secret || ""),
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("/api/orders failed", err);
    const msg = String(err?.message || "Internal error");
    return json({ ok: false, error: msg }, { status: 500 });
  }
};
