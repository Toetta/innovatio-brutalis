import { json } from "./_lib/resp.js";
import { getEnv } from "./_lib/env.js";

export const onRequestGet = async (context) => {
  const hasD1 = Boolean(context?.env?.DB);
  const cfg = getEnv(context?.env);
  const pagesCommit = String(context?.env?.CF_PAGES_COMMIT_SHA || "").trim();
  const pagesBranch = String(context?.env?.CF_PAGES_BRANCH || "").trim();
  const pagesProject = String(context?.env?.CF_PAGES_PROJECT_NAME || "").trim();
  const pagesEnv = String(context?.env?.CF_PAGES_ENVIRONMENT || "").trim();

  const fuExpected = String(context?.env?.FU_KEY || context?.env?.["FU-KEY"] || context?.env?.FU_SYNC_KEY || "").trim();
  const hasFuKeySecret = Boolean(fuExpected);
  const hasTurnstileSecret = Boolean(String(cfg.TURNSTILE_SECRET || "").trim());
  const supportFrom = String(cfg.EMAIL_FROM || "").trim();
  const loginFrom = String(cfg.LOGIN_EMAIL_FROM || "").trim();
  const effectiveLoginFrom = (loginFrom || supportFrom).trim();
  const hasResendKey = Boolean(String(cfg.RESEND_API_KEY || "").trim());

  const hasStripeSecretKey = Boolean(String(cfg.STRIPE_SECRET_KEY || "").trim());
  const hasStripePublishableKey = Boolean(String(cfg.STRIPE_PUBLISHABLE_KEY || "").trim());
  const hasStripeWebhookSecret = Boolean(String(cfg.STRIPE_WEBHOOK_SECRET || "").trim());

  const turnstileReady = hasTurnstileSecret;
  const emailReady =
    cfg.EMAIL_PROVIDER === "disabled" ? true :
    cfg.EMAIL_PROVIDER === "resend" ? (Boolean(effectiveLoginFrom) && hasResendKey) :
    false;

  const base = {
    ok: true,
    hasD1,
    ts: new Date().toISOString(),
    build: {
      commit: pagesCommit || null,
      branch: pagesBranch || null,
      project: pagesProject || null,
      environment: pagesEnv || null,
    },
    devMode: Boolean(cfg.DEV_MODE),
    fu: {
      hasKeySecret: hasFuKeySecret,
    },
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
    stripe: {
      hasSecretKey: hasStripeSecretKey,
      hasPublishableKey: hasStripePublishableKey,
      hasWebhookSecret: hasStripeWebhookSecret,
      checkoutReady: hasStripeSecretKey && hasStripePublishableKey,
      webhookReady: hasStripeWebhookSecret,
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
