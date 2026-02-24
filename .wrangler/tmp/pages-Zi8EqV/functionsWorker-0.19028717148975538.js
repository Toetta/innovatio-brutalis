var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// api/_lib/resp.js
var jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};
var json = /* @__PURE__ */ __name((data, init = {}) => {
  const status = init.status || 200;
  const headers = { ...jsonHeaders, ...init.headers || {} };
  return new Response(JSON.stringify(data ?? null), { status, headers });
}, "json");
var badRequest = /* @__PURE__ */ __name((message = "Bad request") => json({ ok: false, error: message }, { status: 400 }), "badRequest");
var unauthorized = /* @__PURE__ */ __name((message = "Unauthorized") => json({ ok: false, error: message }, { status: 401 }), "unauthorized");
var forbidden = /* @__PURE__ */ __name((message = "Forbidden") => json({ ok: false, error: message }, { status: 403 }), "forbidden");
var notFound = /* @__PURE__ */ __name((message = "Not found") => json({ ok: false, error: message }, { status: 404 }), "notFound");
var redirect = /* @__PURE__ */ __name((url, status = 302, headers = {}) => {
  const h = { location: url, "cache-control": "no-store", ...headers };
  return new Response(null, { status, headers: h });
}, "redirect");

// api/_lib/env.js
var getEnv = /* @__PURE__ */ __name((env) => {
  const DEV_MODE = String(env?.DEV_MODE || "").toLowerCase() === "true";
  const EMAIL_PROVIDER = String(env?.EMAIL_PROVIDER || "resend").toLowerCase();
  const EMAIL_FROM = String(env?.EMAIL_FROM || "Innovatio Brutalis <info@innovatio-brutalis.se>");
  const LOGIN_EMAIL_FROM = String(env?.LOGIN_EMAIL_FROM || "");
  const ORDER_EMAIL_FROM = String(env?.ORDER_EMAIL_FROM || "");
  const TURNSTILE_SECRET = String(env?.TURNSTILE_SECRET || "");
  const RESEND_API_KEY = String(env?.RESEND_API_KEY || "");
  const EXPORT_ADMIN_KEY = String(env?.EXPORT_ADMIN_KEY || "");
  return {
    DEV_MODE,
    EMAIL_PROVIDER,
    EMAIL_FROM,
    LOGIN_EMAIL_FROM,
    ORDER_EMAIL_FROM,
    TURNSTILE_SECRET,
    RESEND_API_KEY,
    EXPORT_ADMIN_KEY
  };
}, "getEnv");

// api/_lib/crypto.js
var b64url = /* @__PURE__ */ __name((buf) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}, "b64url");
var randomToken = /* @__PURE__ */ __name(async (bytes = 32) => {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return b64url(arr);
}, "randomToken");
var sha256Hex = /* @__PURE__ */ __name(async (text) => {
  const data = new TextEncoder().encode(String(text ?? ""));
  const digest = await crypto.subtle.digest("SHA-256", data);
  const hex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex;
}, "sha256Hex");
var uuid = /* @__PURE__ */ __name(() => {
  return crypto.randomUUID();
}, "uuid");
var nowIso = /* @__PURE__ */ __name(() => (/* @__PURE__ */ new Date()).toISOString(), "nowIso");
var addSecondsIso = /* @__PURE__ */ __name((seconds) => {
  const d = /* @__PURE__ */ new Date();
  d.setSeconds(d.getSeconds() + Number(seconds || 0));
  return d.toISOString();
}, "addSecondsIso");

// api/_lib/db.js
var assertDb = /* @__PURE__ */ __name((env) => {
  if (!env?.DB) throw new Error("Missing D1 binding: env.DB");
  return env.DB;
}, "assertDb");
var one = /* @__PURE__ */ __name(async (stmtPromise) => {
  const res = await stmtPromise;
  return res?.results && res.results[0] ? res.results[0] : null;
}, "one");
var all = /* @__PURE__ */ __name(async (stmtPromise) => {
  const res = await stmtPromise;
  return Array.isArray(res?.results) ? res.results : [];
}, "all");
var exec = /* @__PURE__ */ __name(async (db, sql, params = []) => {
  return await db.prepare(sql).bind(...params).run();
}, "exec");
var getClientIp = /* @__PURE__ */ __name((request) => {
  return request.headers.get("CF-Connecting-IP") || request.headers.get("x-forwarded-for") || "";
}, "getClientIp");

// api/_lib/auth.js
var COOKIE_NAME = "ib_session";
var SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
var MAGIC_TTL_SECONDS = 60 * 15;
var getCookie = /* @__PURE__ */ __name((request, name) => {
  const raw = request.headers.get("cookie") || "";
  const parts = raw.split(";").map((p) => p.trim());
  for (const p of parts) {
    if (!p) continue;
    const idx = p.indexOf("=");
    if (idx === -1) continue;
    const k = p.slice(0, idx).trim();
    if (k !== name) continue;
    return decodeURIComponent(p.slice(idx + 1));
  }
  return "";
}, "getCookie");
var setSessionCookie = /* @__PURE__ */ __name((token) => {
  const maxAge = SESSION_TTL_SECONDS;
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}, "setSessionCookie");
var clearSessionCookie = /* @__PURE__ */ __name(() => {
  return `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`;
}, "clearSessionCookie");
var requireCustomer = /* @__PURE__ */ __name(async ({ request, env }) => {
  const db = assertDb(env);
  const token = getCookie(request, COOKIE_NAME);
  if (!token) return { ok: false };
  const tokenHash = await sha256Hex(token);
  const session = await one(
    db.prepare(
      "SELECT id, customer_id, expires_at, revoked_at FROM sessions WHERE session_token_hash = ? LIMIT 1"
    ).bind(tokenHash).all()
  );
  if (!session) return { ok: false };
  if (session.revoked_at) return { ok: false };
  if (String(session.expires_at) <= nowIso()) return { ok: false };
  const customer = await one(
    db.prepare(
      "SELECT id, email, full_name, phone, company_name, orgnr, vat_id, marketing_opt_in, created_at, updated_at, last_login_at FROM customers WHERE id = ? LIMIT 1"
    ).bind(session.customer_id).all()
  );
  if (!customer) return { ok: false };
  return { ok: true, customer, session };
}, "requireCustomer");
var createSessionForCustomer = /* @__PURE__ */ __name(async ({ env, customerId }) => {
  const db = assertDb(env);
  const token = await randomToken(32);
  const tokenHash = await sha256Hex(token);
  const id = uuid();
  const created_at = nowIso();
  const expires_at = addSecondsIso(SESSION_TTL_SECONDS);
  await exec(
    db,
    "INSERT INTO sessions (id, customer_id, session_token_hash, created_at, expires_at, revoked_at) VALUES (?,?,?,?,?,NULL)",
    [id, customerId, tokenHash, created_at, expires_at]
  );
  return { token, id, created_at, expires_at };
}, "createSessionForCustomer");
var revokeSessionByCookie = /* @__PURE__ */ __name(async ({ request, env }) => {
  const db = assertDb(env);
  const token = getCookie(request, COOKIE_NAME);
  if (!token) return;
  const tokenHash = await sha256Hex(token);
  await exec(db, "UPDATE sessions SET revoked_at = ? WHERE session_token_hash = ? AND revoked_at IS NULL", [nowIso(), tokenHash]);
}, "revokeSessionByCookie");
var requestMagicLink = /* @__PURE__ */ __name(async ({ request, env, email }) => {
  const db = assertDb(env);
  const ip = getClientIp(request);
  const ua = request.headers.get("user-agent") || "";
  const created_at = nowIso();
  const expires_at = addSecondsIso(MAGIC_TTL_SECONDS);
  const token = await randomToken(32);
  const tokenHash = await sha256Hex(token);
  const id = uuid();
  await exec(
    db,
    "INSERT INTO magic_links (id, email, token_hash, created_at, expires_at, used_at, ip, user_agent) VALUES (?,?,?,?,?,NULL,?,?)",
    [id, email, tokenHash, created_at, expires_at, ip, ua]
  );
  return { token, id, created_at, expires_at };
}, "requestMagicLink");
var canRequestMagicLink = /* @__PURE__ */ __name(async ({ request, env, email }) => {
  const db = assertDb(env);
  const ip = getClientIp(request);
  const since = new Date(Date.now() - 60 * 60 * 1e3).toISOString();
  const byEmail = await one(
    db.prepare("SELECT COUNT(1) as c FROM magic_links WHERE email = ? AND created_at >= ?").bind(email, since).all()
  );
  const byIp = await one(
    db.prepare("SELECT COUNT(1) as c FROM magic_links WHERE ip = ? AND created_at >= ?").bind(ip, since).all()
  );
  const emailCount = Number(byEmail?.c || 0);
  const ipCount = Number(byIp?.c || 0);
  return {
    ok: emailCount < 5 && ipCount < 20,
    emailCount,
    ipCount
  };
}, "canRequestMagicLink");
var consumeMagicLinkAndCreateSession = /* @__PURE__ */ __name(async ({ env, token }) => {
  const db = assertDb(env);
  const tokenHash = await sha256Hex(token);
  const link = await one(
    db.prepare(
      "SELECT id, email, expires_at, used_at FROM magic_links WHERE token_hash = ? LIMIT 1"
    ).bind(tokenHash).all()
  );
  if (!link) return { ok: false };
  if (link.used_at) return { ok: false };
  if (String(link.expires_at) <= nowIso()) return { ok: false };
  const email = String(link.email).toLowerCase();
  let customer = await one(db.prepare("SELECT * FROM customers WHERE email = ? LIMIT 1").bind(email).all());
  const ts = nowIso();
  if (!customer) {
    const customerId = uuid();
    await exec(
      db,
      "INSERT INTO customers (id, email, full_name, phone, company_name, orgnr, vat_id, marketing_opt_in, created_at, updated_at, last_login_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      [customerId, email, null, null, null, null, null, 0, ts, ts, ts]
    );
    customer = await one(db.prepare("SELECT * FROM customers WHERE id = ? LIMIT 1").bind(customerId).all());
  } else {
    await exec(db, "UPDATE customers SET last_login_at = ?, updated_at = ? WHERE id = ?", [ts, ts, customer.id]);
  }
  const session = await createSessionForCustomer({ env, customerId: customer.id });
  await exec(db, "UPDATE magic_links SET used_at = ? WHERE id = ?", [nowIso(), link.id]);
  return { ok: true, customer, session };
}, "consumeMagicLinkAndCreateSession");
var requireAdminKey = /* @__PURE__ */ __name(({ request, env }) => {
  const { EXPORT_ADMIN_KEY } = getEnv(env);
  if (!EXPORT_ADMIN_KEY) return false;
  const given = request.headers.get("X-Admin-Key") || "";
  return given && given === EXPORT_ADMIN_KEY;
}, "requireAdminKey");

// api/auth/logout.js
var onRequestPost = /* @__PURE__ */ __name(async (context) => {
  const { request, env } = context;
  try {
    await revokeSessionByCookie({ request, env });
  } catch (err) {
    console.error("logout_error", err);
  }
  return json({ ok: true }, { headers: { "set-cookie": clearSessionCookie() } });
}, "onRequestPost");

// api/_lib/turnstile.js
var verifyTurnstile = /* @__PURE__ */ __name(async ({ env, token, remoteip }) => {
  const { TURNSTILE_SECRET } = getEnv(env);
  if (!TURNSTILE_SECRET) {
    const dev = String(env?.DEV_MODE || "").toLowerCase() === "true";
    return dev;
  }
  if (!token) return false;
  const body = new URLSearchParams();
  body.set("secret", TURNSTILE_SECRET);
  body.set("response", token);
  if (remoteip) body.set("remoteip", remoteip);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  const data = await res.json().catch(() => null);
  return Boolean(data && data.success);
}, "verifyTurnstile");

// api/_lib/email.js
var sendLoginEmail = /* @__PURE__ */ __name(async ({ env, to, loginUrl }) => {
  const cfg = getEnv(env);
  const provider = cfg.EMAIL_PROVIDER;
  const from = String(cfg.LOGIN_EMAIL_FROM || cfg.EMAIL_FROM || "").trim();
  if (!from) throw new Error("Missing EMAIL_FROM");
  const subject = "Your Innovatio Brutalis login link";
  const text = `Use this link to sign in:

${loginUrl}

This link expires in 15 minutes.`;
  if (provider === "disabled") {
    return { ok: true, provider: "disabled" };
  }
  if (provider === "resend") {
    if (!cfg.RESEND_API_KEY) throw new Error("Missing RESEND_API_KEY");
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${cfg.RESEND_API_KEY}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        text
      })
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Resend error: HTTP ${res.status} ${body}`);
    }
    return { ok: true, provider: "resend" };
  }
  throw new Error(`Unknown EMAIL_PROVIDER: ${provider}`);
}, "sendLoginEmail");

// api/auth/request-link.js
var isEmail = /* @__PURE__ */ __name((s) => {
  const t = String(s || "").trim().toLowerCase();
  if (!t || t.length > 320) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}, "isEmail");
var canonicalOrigin = /* @__PURE__ */ __name((origin) => {
  try {
    const u = new URL(origin);
    if (u.hostname === "innovatio-brutalis.se") u.hostname = "www.innovatio-brutalis.se";
    u.protocol = "https:";
    return u.origin;
  } catch (_) {
    return "https://www.innovatio-brutalis.se";
  }
}, "canonicalOrigin");
var safeReturnPath = /* @__PURE__ */ __name((raw) => {
  try {
    const p = String(raw || "").trim();
    if (!p) return "";
    if (!p.startsWith("/")) return "";
    if (p.startsWith("//")) return "";
    if (p.includes("://")) return "";
    return p;
  } catch (_) {
    return "";
  }
}, "safeReturnPath");
var onRequestPost2 = /* @__PURE__ */ __name(async (context) => {
  const { request, env } = context;
  const cfg = getEnv(env);
  let body = null;
  try {
    body = await request.json();
  } catch (_) {
    return json({ ok: true });
  }
  const email = String(body?.email || "").trim().toLowerCase();
  const turnstileToken = String(body?.turnstileToken || "");
  const returnPath = safeReturnPath(body?.returnPath);
  if (!isEmail(email)) return json({ ok: true });
  const ip = getClientIp(request);
  const turnOk = await verifyTurnstile({ env, token: turnstileToken, remoteip: ip }).catch((err) => {
    console.error("turnstile_verify_error", err);
    return false;
  });
  if (!turnOk) {
    console.warn("turnstile_not_ok", {
      has_token: Boolean(turnstileToken),
      token_len: String(turnstileToken || "").length,
      has_ip: Boolean(ip)
    });
    return json({ ok: true });
  }
  const allowed = await canRequestMagicLink({ request, env, email }).catch((err) => {
    console.error("rate_limit_error", err);
    return { ok: false };
  });
  if (!allowed.ok) return json({ ok: true });
  const payload = { ok: true };
  try {
    const link = await requestMagicLink({ request, env, email });
    const origin = canonicalOrigin(new URL(request.url).origin);
    const verifyUrl = `${origin}/api/auth/verify?token=${encodeURIComponent(link.token)}${returnPath ? `&return=${encodeURIComponent(returnPath)}` : ""}`;
    if (cfg.DEV_MODE) payload.debug_link = verifyUrl;
    if (cfg.EMAIL_PROVIDER === "disabled") {
      return json(payload);
    }
    await sendLoginEmail({ env, to: email, loginUrl: verifyUrl });
    console.info("request_link_email_sent", { provider: cfg.EMAIL_PROVIDER });
  } catch (err) {
    console.error("request_link_error", {
      message: String(err?.message || err),
      email_provider: cfg.EMAIL_PROVIDER,
      has_resend_key: Boolean(cfg.RESEND_API_KEY),
      email_from: cfg.EMAIL_FROM,
      dev_mode: cfg.DEV_MODE
    });
  }
  return json(payload);
}, "onRequestPost");

// api/auth/verify.js
var safeReturnPath2 = /* @__PURE__ */ __name((raw) => {
  try {
    const p = String(raw || "").trim();
    if (!p) return "";
    if (!p.startsWith("/")) return "";
    if (p.startsWith("//")) return "";
    if (p.includes("://")) return "";
    return p;
  } catch (_) {
    return "";
  }
}, "safeReturnPath");
var onRequestGet = /* @__PURE__ */ __name(async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const token = String(url.searchParams.get("token") || "");
  const returnPath = safeReturnPath2(url.searchParams.get("return"));
  if (!token) return redirect("/login/", 302);
  const res = await consumeMagicLinkAndCreateSession({ env, token }).catch((err) => {
    console.error("verify_error", err);
    return { ok: false };
  });
  if (!res.ok) return redirect("/login/", 302);
  return redirect(returnPath || "/account/", 302, {
    "set-cookie": setSessionCookie(res.session.token)
  });
}, "onRequestGet");

// api/_lib/export.js
var createExportBatch = /* @__PURE__ */ __name(async ({ env, type, since_date, note, created_by }) => {
  const db = assertDb(env);
  const id = uuid();
  const created_at = nowIso();
  await exec(
    db,
    "INSERT INTO export_batches (id, type, created_at, created_by, since_date, status, note) VALUES (?,?,?,?,?, 'created', ?)",
    [id, type, created_at, created_by || null, since_date || null, note || null]
  );
  const ts = nowIso();
  const sinceIso = since_date ? `${since_date}T00:00:00.000Z` : "1970-01-01T00:00:00.000Z";
  if (type === "customers" || type === "all") {
    const customers = await all(
      db.prepare("SELECT id FROM customers WHERE created_at >= ? OR updated_at >= ?").bind(sinceIso, sinceIso).all()
    );
    for (const c of customers) {
      await exec(db, "INSERT INTO export_items (id, batch_id, entity_type, entity_id, created_at) VALUES (?,?,?,?,?)", [uuid(), id, "customer", c.id, ts]);
    }
  }
  if (type === "invoices" || type === "all") {
    const orders = await all(
      db.prepare("SELECT id FROM orders WHERE placed_at >= ?").bind(sinceIso).all()
    );
    for (const o of orders) {
      await exec(db, "INSERT INTO export_items (id, batch_id, entity_type, entity_id, created_at) VALUES (?,?,?,?,?)", [uuid(), id, "invoice", o.id, ts]);
    }
  }
  return { batch_id: id, created_at };
}, "createExportBatch");
var markBatchDownloaded = /* @__PURE__ */ __name(async ({ env, batch_id }) => {
  const db = assertDb(env);
  await exec(db, "UPDATE export_batches SET status = 'downloaded' WHERE id = ? AND status = 'created'", [batch_id]);
}, "markBatchDownloaded");
var exportCustomersSince = /* @__PURE__ */ __name(async ({ env, since_date }) => {
  const db = assertDb(env);
  const sinceIso = since_date ? `${since_date}T00:00:00.000Z` : "1970-01-01T00:00:00.000Z";
  const rows = await all(
    db.prepare(
      "SELECT id, email, full_name, phone, company_name, orgnr, vat_id, marketing_opt_in, created_at, updated_at FROM customers WHERE created_at >= ? OR updated_at >= ? ORDER BY updated_at DESC"
    ).bind(sinceIso, sinceIso).all()
  );
  return rows;
}, "exportCustomersSince");
var exportInvoicesSince = /* @__PURE__ */ __name(async ({ env, since_date }) => {
  const db = assertDb(env);
  const sinceIso = since_date ? `${since_date}T00:00:00.000Z` : "1970-01-01T00:00:00.000Z";
  const orders = await all(
    db.prepare(
      "SELECT id, order_number, customer_id, email, currency, status, subtotal_ex_vat, vat_total, shipping_ex_vat, shipping_vat, total_inc_vat, placed_at, paid_at FROM orders WHERE placed_at >= ? ORDER BY placed_at DESC"
    ).bind(sinceIso).all()
  );
  const invoices = [];
  for (const o of orders) {
    const lines = await all(
      db.prepare(
        "SELECT id, product_id, sku, title, qty, unit_price_ex_vat, vat_rate, line_total_ex_vat, line_vat, line_total_inc_vat FROM order_lines WHERE order_id = ? ORDER BY id"
      ).bind(o.id).all()
    );
    invoices.push({ order: o, lines });
  }
  return invoices;
}, "exportInvoicesSince");

// api/export/batch.js
var onRequestPost3 = /* @__PURE__ */ __name(async (context) => {
  const { request, env } = context;
  if (!requireAdminKey({ request, env })) return forbidden();
  let body = null;
  try {
    body = await request.json();
  } catch (_) {
    return badRequest("Invalid JSON");
  }
  const type = String(body?.type || "");
  const since_date = body?.since_date ? String(body.since_date) : "";
  const note = body?.note ? String(body.note) : "";
  if (!["customers", "invoices", "all"].includes(type)) return badRequest("Invalid type");
  if (since_date && !/^\d{4}-\d{2}-\d{2}$/.test(since_date)) return badRequest("Invalid since_date");
  const batch = await createExportBatch({ env, type, since_date, note, created_by: "api" });
  const base = new URL(request.url).origin;
  return json({
    ok: true,
    batch_id: batch.batch_id,
    urls: {
      customers: `${base}/api/export/customers?since=${encodeURIComponent(since_date || "")}&batch_id=${encodeURIComponent(batch.batch_id)}`,
      invoices: `${base}/api/export/invoices?since=${encodeURIComponent(since_date || "")}&batch_id=${encodeURIComponent(batch.batch_id)}`
    }
  });
}, "onRequestPost");

// api/export/customers.js
var onRequestGet2 = /* @__PURE__ */ __name(async (context) => {
  const { request, env } = context;
  if (!requireAdminKey({ request, env })) return forbidden();
  const url = new URL(request.url);
  const since = String(url.searchParams.get("since") || "");
  const batch_id = String(url.searchParams.get("batch_id") || "");
  const since_date = since && /^\d{4}-\d{2}-\d{2}$/.test(since) ? since : "";
  const customers = await exportCustomersSince({ env, since_date });
  if (batch_id) await markBatchDownloaded({ env, batch_id });
  return json({
    schema_version: "1.0",
    generated_at: (/* @__PURE__ */ new Date()).toISOString(),
    source: "innovatio-brutalis-webshop",
    batch_id: batch_id || null,
    since_date: since_date || null,
    customers
  });
}, "onRequestGet");

// api/export/invoices.js
var onRequestGet3 = /* @__PURE__ */ __name(async (context) => {
  const { request, env } = context;
  if (!requireAdminKey({ request, env })) return forbidden();
  const url = new URL(request.url);
  const since = String(url.searchParams.get("since") || "");
  const batch_id = String(url.searchParams.get("batch_id") || "");
  const since_date = since && /^\d{4}-\d{2}-\d{2}$/.test(since) ? since : "";
  const invoiceDrafts = await exportInvoicesSince({ env, since_date });
  if (batch_id) await markBatchDownloaded({ env, batch_id });
  const invoices = invoiceDrafts.map(({ order, lines }) => ({
    invoice_external_id: order.id,
    order_number: order.order_number,
    customer_id: order.customer_id,
    email: order.email,
    currency: order.currency,
    status: order.status,
    placed_at: order.placed_at,
    paid_at: order.paid_at,
    totals: {
      subtotal_ex_vat: order.subtotal_ex_vat,
      vat_total: order.vat_total,
      shipping_ex_vat: order.shipping_ex_vat,
      shipping_vat: order.shipping_vat,
      total_inc_vat: order.total_inc_vat
    },
    lines
  }));
  return json({
    schema_version: "1.0",
    generated_at: (/* @__PURE__ */ new Date()).toISOString(),
    source: "innovatio-brutalis-webshop",
    batch_id: batch_id || null,
    since_date: since_date || null,
    invoices
  });
}, "onRequestGet");

// api/orders/[id].js
var onRequestGet4 = /* @__PURE__ */ __name(async (context) => {
  const { request, env, params } = context;
  const auth = await requireCustomer({ request, env });
  if (!auth.ok) return unauthorized();
  const id = String(params?.id || "");
  if (!id) return notFound();
  const db = assertDb(env);
  const order = await one(
    db.prepare(
      "SELECT * FROM orders WHERE id = ? AND customer_id = ? LIMIT 1"
    ).bind(id, auth.customer.id).all()
  );
  if (!order) return notFound();
  const lines = await all(
    db.prepare(
      "SELECT id, product_id, sku, title, qty, unit_price_ex_vat, vat_rate, line_total_ex_vat, line_vat, line_total_inc_vat FROM order_lines WHERE order_id = ? ORDER BY id"
    ).bind(order.id).all()
  );
  return json({ ok: true, order, lines });
}, "onRequestGet");

// api/health.js
var onRequestGet5 = /* @__PURE__ */ __name(async (context) => {
  const hasD1 = Boolean(context?.env?.DB);
  const cfg = getEnv(context?.env);
  const hasTurnstileSecret = Boolean(String(cfg.TURNSTILE_SECRET || "").trim());
  const supportFrom = String(cfg.EMAIL_FROM || "").trim();
  const loginFrom = String(cfg.LOGIN_EMAIL_FROM || "").trim();
  const effectiveLoginFrom = (loginFrom || supportFrom).trim();
  const hasResendKey = Boolean(String(cfg.RESEND_API_KEY || "").trim());
  const turnstileReady = hasTurnstileSecret;
  const emailReady = cfg.EMAIL_PROVIDER === "disabled" ? true : cfg.EMAIL_PROVIDER === "resend" ? Boolean(effectiveLoginFrom) && hasResendKey : false;
  const base = {
    ok: true,
    hasD1,
    ts: (/* @__PURE__ */ new Date()).toISOString(),
    devMode: Boolean(cfg.DEV_MODE),
    turnstile: {
      hasSecret: hasTurnstileSecret,
      ready: turnstileReady
    },
    email: {
      provider: cfg.EMAIL_PROVIDER,
      fromSet: Boolean(supportFrom),
      loginFromSet: Boolean(loginFrom),
      hasResendKey,
      ready: emailReady
    }
  };
  if (cfg.DEV_MODE) {
    base.email.from = supportFrom;
    base.email.loginFrom = effectiveLoginFrom;
  }
  return json(base);
}, "onRequestGet");

// api/me.js
var onRequestGet6 = /* @__PURE__ */ __name(async (context) => {
  const { request, env } = context;
  const auth = await requireCustomer({ request, env });
  if (!auth.ok) return unauthorized();
  const db = assertDb(env);
  const addresses = await all(
    db.prepare(
      "SELECT id, type, line1, line2, postal_code, city, region, country, created_at, updated_at FROM addresses WHERE customer_id = ? ORDER BY type"
    ).bind(auth.customer.id).all()
  );
  return json({
    ok: true,
    customer: auth.customer,
    addresses
  });
}, "onRequestGet");
var onRequestPut = /* @__PURE__ */ __name(async (context) => {
  const { request, env } = context;
  const auth = await requireCustomer({ request, env });
  if (!auth.ok) return unauthorized();
  let body = null;
  try {
    body = await request.json();
  } catch (_) {
    return badRequest("Invalid JSON");
  }
  const patch = {
    full_name: "full_name" in body ? String(body.full_name || "").trim() : void 0,
    phone: "phone" in body ? String(body.phone || "").trim() : void 0,
    company_name: "company_name" in body ? String(body.company_name || "").trim() : void 0,
    orgnr: "orgnr" in body ? String(body.orgnr || "").trim() : void 0,
    vat_id: "vat_id" in body ? String(body.vat_id || "").trim() : void 0,
    marketing_opt_in: "marketing_opt_in" in body ? body.marketing_opt_in ? 1 : 0 : void 0
  };
  const allowedKeys = Object.keys(patch).filter((k) => patch[k] !== void 0);
  if (!allowedKeys.length) return json({ ok: true });
  const db = assertDb(env);
  const sets = [];
  const params = [];
  for (const k of allowedKeys) {
    sets.push(`${k} = ?`);
    params.push(patch[k]);
  }
  sets.push("updated_at = ?");
  params.push(nowIso());
  params.push(auth.customer.id);
  await exec(db, `UPDATE customers SET ${sets.join(", ")} WHERE id = ?`, params);
  const customer = await all(db.prepare("SELECT id, email, full_name, phone, company_name, orgnr, vat_id, marketing_opt_in, created_at, updated_at, last_login_at FROM customers WHERE id = ? LIMIT 1").bind(auth.customer.id).all());
  return json({ ok: true, customer: customer[0] || auth.customer });
}, "onRequestPut");

// api/me-addresses.js
var normAddr = /* @__PURE__ */ __name((a) => {
  if (!a || typeof a !== "object") return null;
  const pick = /* @__PURE__ */ __name((k) => k in a ? String(a[k] || "").trim() : null, "pick");
  return {
    line1: pick("line1"),
    line2: pick("line2"),
    postal_code: pick("postal_code"),
    city: pick("city"),
    region: pick("region"),
    country: pick("country")
  };
}, "normAddr");
var upsert = /* @__PURE__ */ __name(async ({ db, customerId, type, addr }) => {
  const existing = await one(db.prepare("SELECT id FROM addresses WHERE customer_id = ? AND type = ? LIMIT 1").bind(customerId, type).all());
  const ts = nowIso();
  if (existing) {
    await exec(
      db,
      "UPDATE addresses SET line1 = ?, line2 = ?, postal_code = ?, city = ?, region = ?, country = ?, updated_at = ? WHERE id = ?",
      [addr.line1, addr.line2, addr.postal_code, addr.city, addr.region, addr.country, ts, existing.id]
    );
    return existing.id;
  }
  const id = uuid();
  await exec(
    db,
    "INSERT INTO addresses (id, customer_id, type, line1, line2, postal_code, city, region, country, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    [id, customerId, type, addr.line1, addr.line2, addr.postal_code, addr.city, addr.region, addr.country, ts, ts]
  );
  return id;
}, "upsert");
var onRequestPut2 = /* @__PURE__ */ __name(async (context) => {
  const { request, env } = context;
  const auth = await requireCustomer({ request, env });
  if (!auth.ok) return unauthorized();
  let body = null;
  try {
    body = await request.json();
  } catch (_) {
    return badRequest("Invalid JSON");
  }
  const billing = normAddr(body?.billing);
  const shipping = normAddr(body?.shipping);
  if (!billing && !shipping) return badRequest("Missing billing/shipping");
  const db = assertDb(env);
  if (billing) await upsert({ db, customerId: auth.customer.id, type: "billing", addr: billing });
  if (shipping) await upsert({ db, customerId: auth.customer.id, type: "shipping", addr: shipping });
  return json({ ok: true });
}, "onRequestPut");

// api/orders.js
var onRequestGet7 = /* @__PURE__ */ __name(async (context) => {
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
}, "onRequestGet");

// ../.wrangler/tmp/pages-Zi8EqV/functionsRoutes-0.6724169018043069.mjs
var routes = [
  {
    routePath: "/api/auth/logout",
    mountPath: "/api/auth",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost]
  },
  {
    routePath: "/api/auth/request-link",
    mountPath: "/api/auth",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost2]
  },
  {
    routePath: "/api/auth/verify",
    mountPath: "/api/auth",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet]
  },
  {
    routePath: "/api/export/batch",
    mountPath: "/api/export",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost3]
  },
  {
    routePath: "/api/export/customers",
    mountPath: "/api/export",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet2]
  },
  {
    routePath: "/api/export/invoices",
    mountPath: "/api/export",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet3]
  },
  {
    routePath: "/api/orders/:id",
    mountPath: "/api/orders",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet4]
  },
  {
    routePath: "/api/health",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet5]
  },
  {
    routePath: "/api/me",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet6]
  },
  {
    routePath: "/api/me",
    mountPath: "/api",
    method: "PUT",
    middlewares: [],
    modules: [onRequestPut]
  },
  {
    routePath: "/api/me-addresses",
    mountPath: "/api",
    method: "PUT",
    middlewares: [],
    modules: [onRequestPut2]
  },
  {
    routePath: "/api/orders",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet7]
  }
];

// ../../../../AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/path-to-regexp/dist.es2015/index.js
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");

// ../../../../AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/pages-template-worker.ts
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");
export {
  pages_template_worker_default as default
};
