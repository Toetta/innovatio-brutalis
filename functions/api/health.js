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

  if (hasD1) {
    try {
      const rows = await context.env.DB.prepare("PRAGMA table_info(orders)").all();
      const list = Array.isArray(rows?.results) ? rows.results : [];
      const cols = new Set(list.map((r) => String(r?.name || "")).filter(Boolean));
      const ordersSchemaV2 = cols.has("customer_country") && cols.has("payment_provider") && cols.has("public_token_hash") && cols.has("subtotal_minor");
      base.d1 = {
        ordersSchemaV2,
      };
      if (cfg.DEV_MODE) base.d1.ordersColumns = Array.from(cols).sort((a, b) => a.localeCompare(b));
    } catch (_) {
      base.d1 = { ordersSchemaV2: false };
    }
  }

  if (cfg.DEV_MODE) {
    base.email.from = supportFrom;
    base.email.loginFrom = effectiveLoginFrom;
  }

  return json(base);
};
