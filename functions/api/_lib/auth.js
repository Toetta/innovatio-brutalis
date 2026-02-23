import { getEnv } from "./env.js";
import { assertDb, one, exec, getClientIp } from "./db.js";
import { addSecondsIso, nowIso, randomToken, sha256Hex, uuid } from "./crypto.js";

export const COOKIE_NAME = "ib_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const MAGIC_TTL_SECONDS = 60 * 15; // 15 minutes

export const getCookie = (request, name) => {
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
};

export const setSessionCookie = (token) => {
  // Security: HttpOnly cookie, token never exposed to JS.
  const maxAge = SESSION_TTL_SECONDS;
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`;
};

export const clearSessionCookie = () => {
  return `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`;
};

export const requireCustomer = async ({ request, env }) => {
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
};

export const createSessionForCustomer = async ({ env, customerId }) => {
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
};

export const revokeSessionByCookie = async ({ request, env }) => {
  const db = assertDb(env);
  const token = getCookie(request, COOKIE_NAME);
  if (!token) return;
  const tokenHash = await sha256Hex(token);
  await exec(db, "UPDATE sessions SET revoked_at = ? WHERE session_token_hash = ? AND revoked_at IS NULL", [nowIso(), tokenHash]);
};

export const requestMagicLink = async ({ request, env, email }) => {
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
};

export const canRequestMagicLink = async ({ request, env, email }) => {
  const db = assertDb(env);
  const ip = getClientIp(request);
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();

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
    ipCount,
  };
};

export const consumeMagicLinkAndCreateSession = async ({ env, token }) => {
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

  // Upsert customer by email
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

  // Create session + mark magic link used (best-effort; keep order safe)
  const session = await createSessionForCustomer({ env, customerId: customer.id });
  await exec(db, "UPDATE magic_links SET used_at = ? WHERE id = ?", [nowIso(), link.id]);

  return { ok: true, customer, session };
};

export const requireAdminKey = ({ request, env }) => {
  const { EXPORT_ADMIN_KEY } = getEnv(env);
  if (!EXPORT_ADMIN_KEY) return false;
  const given = request.headers.get("X-Admin-Key") || "";
  return given && given === EXPORT_ADMIN_KEY;
};
