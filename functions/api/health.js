import { json } from "./_lib/resp.js";
import { getEnv } from "./_lib/env.js";

export const onRequestGet = async (context) => {
  const hasD1 = Boolean(context?.env?.DB);
  const cfg = getEnv(context?.env);
  const hasTurnstileSecret = Boolean(String(cfg.TURNSTILE_SECRET || "").trim());
  const supportFrom = String(cfg.EMAIL_FROM || "").trim();
  const loginFrom = String(cfg.LOGIN_EMAIL_FROM || "").trim();
  const effectiveLoginFrom = (loginFrom || supportFrom).trim();
  const hasResendKey = Boolean(String(cfg.RESEND_API_KEY || "").trim());

  const turnstileReady = hasTurnstileSecret;
  const emailReady =
    cfg.EMAIL_PROVIDER === "disabled" ? true :
    cfg.EMAIL_PROVIDER === "resend" ? (Boolean(effectiveLoginFrom) && hasResendKey) :
    false;

  const base = {
    ok: true,
    hasD1,
    ts: new Date().toISOString(),
    devMode: Boolean(cfg.DEV_MODE),
    turnstile: {
      hasSecret: hasTurnstileSecret,
      ready: turnstileReady,
    },
    email: {
      provider: cfg.EMAIL_PROVIDER,
      fromSet: Boolean(supportFrom),
      loginFromSet: Boolean(loginFrom),
      hasResendKey,
      ready: emailReady,
    },
  };

  if (cfg.DEV_MODE) {
    base.email.from = supportFrom;
    base.email.loginFrom = effectiveLoginFrom;
  }

  return json(base);
};
