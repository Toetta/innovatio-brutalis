import { badRequest, json, unauthorized } from "./_lib/resp.js";
import { requireCustomer } from "./_lib/auth.js";
import { assertDb, all, exec, one } from "./_lib/db.js";
import { getEnv } from "./_lib/env.js";
import { nowIso, uuid, sha256Hex, randomToken } from "./_lib/crypto.js";
import { createStripePaymentIntent } from "./_lib/stripe.js";
import { createKlarnaPaymentsSession } from "./_lib/klarna.js";
import { decideVatForOrder } from "./_lib/vat.js";
import { loadProducts } from "./_lib/catalog.js";
import { calculatePostNordShipping, getShippingZone, sumCartWeightGrams } from "./_lib/shipping/postnord-tiers.js";

const getOrdersSchemaInfo = async (db) => {
  const rows = await all(db.prepare("PRAGMA table_info(orders)").all());
  const cols = new Set(rows.map((r) => String(r?.name || "")).filter(Boolean));
  const v2 = cols.has("customer_country") && cols.has("payment_provider") && cols.has("public_token_hash") && cols.has("subtotal_minor");

  const v3 = v2 &&
    cols.has("delivery_method") &&
    cols.has("shipping_provider") &&
    cols.has("shipping_code") &&
    cols.has("fu_payload_json") &&
    cols.has("exported_to_fu") &&
    cols.has("exported_to_fu_at");

  let supportsNeedsShippingQuoteStatus = false;
  try {
    const row = await one(db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'orders' LIMIT 1").all());
    const sql = String(row?.sql || "").toLowerCase();
    supportsNeedsShippingQuoteStatus = sql.includes("needs_shipping_quote");
  } catch (_) {
    supportsNeedsShippingQuoteStatus = false;
  }

  return { v2, v3, supportsNeedsShippingQuoteStatus, cols: Array.from(cols).sort((a, b) => a.localeCompare(b)) };
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

const normalizeStr = (v, maxLen = 200) => {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.length > maxLen ? s.slice(0, maxLen) : s;
};

const normalizeCountry = (cc) => {
  const c = String(cc || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(c) ? c : "";
};

const normalizeAddress = (raw) => {
  const obj = (raw && typeof raw === "object" && !Array.isArray(raw)) ? raw : null;
  if (!obj) return null;
  const line1 = normalizeStr(obj.line1, 200);
  const line2 = normalizeStr(obj.line2, 200);
  const postal_code = normalizeStr(obj.postal_code, 32);
  const city = normalizeStr(obj.city, 100);
  const country = normalizeCountry(obj.country);
  return { line1, line2: line2 || null, postal_code, city, country };
};

const requireAddressFields = (addr) => {
  if (!addr) return "Missing shipping_address";
  if (!addr.line1) return "Missing shipping_address.line1";
  if (!addr.postal_code) return "Missing shipping_address.postal_code";
  if (!addr.city) return "Missing shipping_address.city";
  if (!addr.country) return "Missing shipping_address.country";
  return "";
};

const buildFuInvoicePayloadV1 = ({
  order_id,
  created_at,
  currency,
  customer,
  delivery,
  product_lines,
  shipping_line,
  totals,
}) => {
  const lines = [];
  for (const l of product_lines) {
    lines.push({
      type: "product",
      name: l.title,
      sku: l.sku,
      quantity: l.qty,
      unit_price: l.unit_price_inc_vat,
      vat_rate: l.vat_rate,
      total: l.line_total_inc_vat,
      account_suggestion: 3011,
    });
  }

  if (shipping_line && Number(shipping_line.unit_price) > 0) {
    lines.push({
      type: "shipping",
      name: shipping_line.name,
      sku: "SHIPPING",
      quantity: 1,
      unit_price: shipping_line.unit_price,
      vat_rate: shipping_line.vat_rate,
      total: shipping_line.total,
      account_suggestion: 3520,
    });
  }

  return {
    schema_version: "1.0",
    source: "innovatio-brutalis-webshop",
    order_id,
    created_at,
    currency,
    customer,
    delivery,
    lines,
    totals,
  };
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
    const schema = await getOrdersSchemaInfo(db).catch(() => ({ v2: false, v3: false, cols: [] }));
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

    if (!schema.v3) {
      const cfg = getEnv(env);
      const details = cfg.DEV_MODE ? ` Existing columns: ${schema.cols.join(", ")}` : "";
      return json(
        {
          ok: false,
          error: "Database schema is outdated (shipping/FU fields). Apply migrations/0003_add_shipping_fields.sql to your D1 database." + details,
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

  const full_name = normalizeStr(body?.full_name, 200);
  if (!full_name) return badRequest("Missing full_name");

  const phone = normalizeStr(body?.phone, 64);
  if (!phone) return badRequest("Missing phone");

  const delivery_method = String(body?.delivery_method || "pickup").trim().toLowerCase();
  if (!delivery_method || !["pickup", "postnord"].includes(delivery_method)) return badRequest("Unsupported delivery_method");

  const customer_country = String(body?.customer_country || "SE").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(customer_country)) return badRequest("Invalid customer_country");

  const shippingZone = getShippingZone(customer_country);
  if (shippingZone === "OTHER" && !schema.supportsNeedsShippingQuoteStatus) {
    const cfg = getEnv(env);
    const details = cfg.DEV_MODE ? ` Existing columns: ${schema.cols.join(", ")}` : "";
    return json(
      {
        ok: false,
        error: "Database schema is outdated (orders status constraint). Apply migrations/0004_add_needs_shipping_quote_status.sql to your D1 database." + details,
      },
      { status: 500 }
    );
  }
  if (shippingZone !== "SE" && delivery_method === "pickup") return badRequest("Pickup only available in Sweden");

  const vat_number = body?.vat_number != null ? String(body.vat_number || "").trim() : "";
  if (vat_number && vat_number.length > 32) return badRequest("Invalid vat_number");

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

  const vatDecision = await decideVatForOrder({
    homeCountry: "SE",
    homeVatRate: 0.25,
    customerCountry: customer_country,
    vatNumberRaw: vat_number,
    validateVatId: true,
  }).catch(() => ({ ok: true, vat_rate: customer_country === "SE" ? 0.25 : 0.0, tax_mode: customer_country === "SE" ? "domestic" : "export", vat_number: null, vies: null }));

  const vatRate = Number(vatDecision?.vat_rate) || 0;
  const tax_mode = String(vatDecision?.tax_mode || "");

  const HOME_VAT_RATE = 0.25;
  const zeroVatRemovesHomeVat = tax_mode === "reverse_charge" || tax_mode === "export";

  const lines = [];
  for (const ci of cartItems) {
    const p = products.get(ci.slug);
    if (!p || p.published === false) return badRequest(`Unknown product: ${ci.slug}`);
    const title = String(p?.title || ci.slug);
    const sku = String(p?.sku || p?.slug || ci.slug);
    const priceIncVat = Number(p?.price_sek);
    if (!Number.isFinite(priceIncVat) || priceIncVat < 0) return badRequest(`Invalid price: ${ci.slug}`);

    const shippingExempt = p?.shipping_exempt === true;
    const w = Number(p?.weight_grams);
    if (!shippingExempt) {
      if (!Number.isFinite(w) || Math.trunc(w) !== w || w <= 0) return badRequest(`Product missing weight_grams: ${ci.slug}`);
    }

    // Pricing model:
    // - Stored prices are assumed to be VAT-inclusive for the home market (SE).
    // - For export / reverse charge, we remove home VAT so the customer pays net.
    const storedNet = priceIncVat / (1 + HOME_VAT_RATE);
    const grossForCustomer = (vatRate === 0 && zeroVatRemovesHomeVat) ? storedNet : priceIncVat;

    const unitEx = vatRate > 0 ? (grossForCustomer / (1 + vatRate)) : grossForCustomer;
    const lineEx = unitEx * ci.qty;
    const lineVat = lineEx * vatRate;
    const lineInc = lineEx + lineVat;

    const unitInc = unitEx * (1 + vatRate);

    lines.push({
      product_id: null,
      sku,
      title,
      qty: ci.qty,
      unit_price_ex_vat: to2(unitEx),
      unit_price_inc_vat: to2(unitInc),
      vat_rate: vatRate,
      line_total_ex_vat: to2(lineEx),
      line_vat: to2(lineVat),
      line_total_inc_vat: to2(lineInc),
    });
  }

  // Shipping
  const total_weight_grams = sumCartWeightGrams({ cartItems, productsBySlug: products });

  let shippingProvider = null;
  let shippingCode = null;
  let shippingInc = 0;
  let shippingTier = null;

  if (delivery_method === "postnord") {
    const addr = normalizeAddress(body?.shipping_address);
    const addrErr = requireAddressFields(addr);
    if (addrErr) return badRequest(addrErr);
    if (addr && addr.country && addr.country !== customer_country) {
      return badRequest("shipping_address.country must match customer_country");
    }

    if (shippingZone === "OTHER") {
      shippingProvider = null;
      shippingCode = null;
      shippingTier = null;
      shippingInc = 0;
    } else {
      const q = await calculatePostNordShipping({ totalWeightGrams: total_weight_grams, request, countryCode: customer_country });
      shippingProvider = q.provider;
      shippingCode = q.code;
      shippingTier = q.tier;
      shippingInc = Number(q.amount_sek) || 0;
    }
  }

  const SHIPPING_VAT_RATE = 0.25;
  const shipping_ex_vat = shippingInc > 0 ? to2(shippingInc / (1 + SHIPPING_VAT_RATE)) : 0;
  const shipping_vat = shippingInc > 0 ? to2(shippingInc - shipping_ex_vat) : 0;

  const goods_subtotal_ex_vat = to2(lines.reduce((s, l) => s + l.line_total_ex_vat, 0));
  const goods_vat_total = to2(lines.reduce((s, l) => s + l.line_vat, 0));
  const goods_total_inc_vat = to2(lines.reduce((s, l) => s + l.line_total_inc_vat, 0));

  const subtotal_ex_vat = goods_subtotal_ex_vat;
  const vat_total = to2(goods_vat_total + shipping_vat);
  const total_inc_vat = to2(goods_total_inc_vat + shippingInc);
  const subtotal_minor = toMinor(subtotal_ex_vat);
  const vat_total_minor = toMinor(vat_total);
  const shipping_minor = toMinor(shippingInc);
  const total_minor = toMinor(total_inc_vat);

  const currency = "SEK";

  // OTHER: manual shipping quote => no payment session/intent created.
  const isManualShippingQuote = shippingZone === "OTHER" && delivery_method === "postnord";

  // Klarna guard (SE + <= KLARNA_MAX_SEK)
  if (!isManualShippingQuote && payment_provider === "klarna") {
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

  let metadataObj = null;
  if (body?.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)) {
    metadataObj = { ...body.metadata };
  }
  if (!metadataObj) metadataObj = {};
  metadataObj.tax = {
    mode: tax_mode || null,
    vat_rate: Number.isFinite(Number(vatRate)) ? Number(vatRate) : 0,
    customer_country,
    vat_number: vatDecision?.vat_number || null,
    vies: vatDecision?.vies || null,
  };

  const shipping_address = normalizeAddress(body?.shipping_address);
  const billing_address = normalizeAddress(body?.billing_address) || shipping_address;

  metadataObj.customer = {
    full_name,
    phone,
  };
  metadataObj.delivery = {
    method: delivery_method,
    provider: shippingProvider,
    code: shippingCode,
    tier: shippingTier,
    total_weight_grams,
    shipping_address: delivery_method === "postnord" ? shipping_address : null,
  };

  // FU invoice payload (deterministic) - stored for downstream integration.
  const fuPayloadObj = buildFuInvoicePayloadV1({
    order_id: id,
    created_at,
    currency,
    customer: {
      full_name,
      email,
      phone,
      billing_address,
      shipping_address: delivery_method === "postnord" ? shipping_address : null,
    },
    delivery: {
      delivery_method,
      provider: shippingProvider,
      shipping_code: shippingCode,
    },
    product_lines: lines.map((l) => ({
      sku: l.sku,
      title: l.title,
      qty: l.qty,
      unit_price_inc_vat: l.unit_price_inc_vat,
      vat_rate: l.vat_rate,
      line_total_inc_vat: l.line_total_inc_vat,
    })),
    shipping_line: delivery_method === "postnord" ? {
      name: "Frakt (PostNord)",
      unit_price: to2(shippingInc),
      vat_rate: SHIPPING_VAT_RATE,
      total: to2(shippingInc),
    } : null,
    totals: {
      subtotal: goods_total_inc_vat,
      shipping: to2(shippingInc),
      vat_total,
      grand_total: total_inc_vat,
    },
  });

  const fu_payload_json = JSON.stringify(fuPayloadObj);
  metadataObj.fu_payload_schema = "1.0";

  const metadata = JSON.stringify(metadataObj);

  const initialStatus = isManualShippingQuote ? "needs_shipping_quote" : "pending_payment";
  const payment_provider_db = isManualShippingQuote ? null : (payment_provider === "swish_manual" ? "swish" : payment_provider);
  const payment_method_db = isManualShippingQuote ? null : payment_provider;

  await exec(
    db,
    "INSERT INTO orders (id, order_number, customer_id, email, customer_country, currency, status, payment_provider, payment_reference, payment_method, subtotal_ex_vat, vat_total, shipping_ex_vat, shipping_vat, total_inc_vat, subtotal_minor, vat_total_minor, shipping_minor, total_minor, placed_at, paid_at, refunded_at, failed_at, created_at, updated_at, public_token_hash, fu_voucher_id, fu_sync_status, fu_sync_error, metadata, delivery_method, shipping_provider, shipping_code, fu_payload_json, exported_to_fu, exported_to_fu_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    [
      id,
      order_number,
      customer_id,
      email,
      customer_country,
      currency,
      initialStatus,
      payment_provider_db,
      null,
      payment_method_db,
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
      delivery_method,
      shippingProvider,
      shippingCode,
      fu_payload_json,
      0,
      null,
    ]
  );

  for (const l of lines) {
    await exec(
      db,
      "INSERT INTO order_lines (id, order_id, product_id, sku, title, qty, unit_price_ex_vat, vat_rate, line_total_ex_vat, line_vat, line_total_inc_vat) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      [uuid(), id, l.product_id, l.sku, l.title, l.qty, l.unit_price_ex_vat, l.vat_rate, l.line_total_ex_vat, l.line_vat, l.line_total_inc_vat]
    );
  }

  if (delivery_method === "postnord" && shippingInc > 0) {
    await exec(
      db,
      "INSERT INTO order_lines (id, order_id, product_id, sku, title, qty, unit_price_ex_vat, vat_rate, line_total_ex_vat, line_vat, line_total_inc_vat) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      [
        uuid(),
        id,
        null,
        "SHIPPING",
        "Frakt (PostNord)",
        1,
        shipping_ex_vat,
        SHIPPING_VAT_RATE,
        shipping_ex_vat,
        shipping_vat,
        to2(shippingInc),
      ]
    );
  }

  if (isManualShippingQuote) {
    return json({
      ok: true,
      order: {
        id,
        order_number,
        currency,
        status: "needs_shipping_quote",
        customer_country,
        delivery_method,
        shipping_provider: shippingProvider,
        shipping_code: shippingCode,
        tax_mode,
        vies_status: vatDecision?.vies?.status || null,
        vat_rate: vatRate,
        subtotal_ex_vat,
        vat_total,
        shipping_ex_vat,
        shipping_vat,
        total_inc_vat,
        placed_at,
      },
      public_token,
      contact: {
        mode: "manual_shipping_quote",
      },
    });
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
        delivery_method,
        shipping_provider: shippingProvider,
        shipping_code: shippingCode,
        tax_mode,
        vies_status: vatDecision?.vies?.status || null,
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
    const klarnaLines = lines.map((l) => {
      const unit_price = toMinor(l.unit_price_inc_vat);
      const total_amount = unit_price * l.qty;
      const total_tax_amount = Math.round((total_amount * (l.vat_rate / (1 + l.vat_rate))) || 0);
      return {
        name: l.title,
        quantity: l.qty,
        unit_price,
        tax_rate: Math.round(l.vat_rate * 10000),
        total_amount,
        total_tax_amount,
      };
    });

    if (delivery_method === "postnord" && shippingInc > 0) {
      const unit_price = toMinor(shippingInc);
      const total_amount = unit_price;
      const total_tax_amount = Math.round((total_amount * (SHIPPING_VAT_RATE / (1 + SHIPPING_VAT_RATE))) || 0);
      klarnaLines.push({
        name: "Frakt (PostNord)",
        quantity: 1,
        unit_price,
        tax_rate: Math.round(SHIPPING_VAT_RATE * 10000),
        total_amount,
        total_tax_amount,
      });
    }

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
        delivery_method,
        shipping_provider: shippingProvider,
        shipping_code: shippingCode,
        tax_mode,
        vies_status: vatDecision?.vies?.status || null,
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
        delivery_method,
        shipping_provider: shippingProvider,
        shipping_code: shippingCode,
        tax_mode,
        vies_status: vatDecision?.vies?.status || null,
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
