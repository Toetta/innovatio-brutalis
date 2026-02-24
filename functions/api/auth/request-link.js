import { json } from "../_lib/resp.js";
import { verifyTurnstile } from "../_lib/turnstile.js";
import { canRequestMagicLink, requestMagicLink } from "../_lib/auth.js";
import { getClientIp } from "../_lib/db.js";
import { getEnv } from "../_lib/env.js";
import { sendLoginEmail } from "../_lib/email.js";

const isEmail = (s) => {
  const t = String(s || "").trim().toLowerCase();
  if (!t || t.length > 320) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
};

const canonicalOrigin = (origin) => {
  try {
    const u = new URL(origin);
    if (u.hostname === "innovatio-brutalis.se") u.hostname = "www.innovatio-brutalis.se";
    u.protocol = "https:";
    return u.origin;
  } catch (_) {
    return "https://www.innovatio-brutalis.se";
  }
};

const safeReturnPath = (raw) => {
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
};

export const onRequestPost = async (context) => {
  const { request, env } = context;
  const cfg = getEnv(env);

  let body = null;
  try {
    body = await request.json();
  } catch (_) {
    // Generic success (no signal to clients)
    return json({ ok: true });
  }

  const email = String(body?.email || "").trim().toLowerCase();
  const turnstileToken = String(body?.turnstileToken || "");
  const returnPath = safeReturnPath(body?.returnPath);

  if (!isEmail(email)) return json({ ok: true });

  // Verify Turnstile (best-effort). If it can't run client-side, we still allow
  // requesting a magic link but enforce tighter rate limits.
  const ip = getClientIp(request);
  let turnOk = null;
  if (turnstileToken) {
    turnOk = await verifyTurnstile({ env, token: turnstileToken, remoteip: ip }).catch((err) => {
      console.error("turnstile_verify_error", err);
      return false;
    });
  }

  if (turnOk === false) {
    console.warn("turnstile_not_ok", {
      has_token: true,
      token_len: String(turnstileToken || "").length,
      has_ip: Boolean(ip),
    });
  }

  // Rate limit (generic success always).
  const allowed = await canRequestMagicLink({ request, env, email }).catch((err) => {
    console.error("rate_limit_error", err);
    return { ok: false };
  });
  if (!allowed.ok) return json({ ok: true });

  // If Turnstile was not verified (missing token or failed), apply stricter limits.
  // This keeps login usable while still protecting the endpoint.
  const unverified = turnOk !== true;
  if (unverified) {
    if (Number(allowed.emailCount || 0) >= 2) return json({ ok: true });
    if (Number(allowed.ipCount || 0) >= 5) return json({ ok: true });
  }

  const payload = { ok: true };

  try {
    const link = await requestMagicLink({ request, env, email });
    const origin = canonicalOrigin(new URL(request.url).origin);
    const verifyUrl = `${origin}/api/auth/verify?token=${encodeURIComponent(link.token)}${returnPath ? `&return=${encodeURIComponent(returnPath)}` : ""}`;

    // In DEV, always return a debug link so the flow can be tested even if email isn't configured.
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
      dev_mode: cfg.DEV_MODE,
    });
    // Still return generic success.
  }

  return json(payload);
};
