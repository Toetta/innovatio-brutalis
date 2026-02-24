import { json } from "./_lib/resp.js";
import { getEnv } from "./_lib/env.js";

export const onRequestGet = async (context) => {
  const hasD1 = Boolean(context?.env?.DB);
  const cfg = getEnv(context?.env);
  const hasTurnstileSecret = Boolean(String(cfg.TURNSTILE_SECRET || "").trim());
  const emailFrom = String(cfg.EMAIL_FROM || "").trim();

  const base = {
    ok: true,
    hasD1,
    ts: new Date().toISOString(),
    devMode: Boolean(cfg.DEV_MODE),
    turnstile: {
      hasSecret: hasTurnstileSecret,
    },
    email: {
      provider: cfg.EMAIL_PROVIDER,
      fromSet: Boolean(emailFrom),
      hasResendKey: Boolean(String(cfg.RESEND_API_KEY || "").trim()),
    },
  };

  if (cfg.DEV_MODE) {
    base.email.from = emailFrom;
  }

  return json(base);
};
