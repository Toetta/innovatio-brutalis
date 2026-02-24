export const getEnv = (env) => {
  const DEV_MODE = String(env?.DEV_MODE || "").toLowerCase() === "true";
  const EMAIL_PROVIDER = String(env?.EMAIL_PROVIDER || "resend").toLowerCase();
  // Backward-compat default sender (also useful as a general support sender).
  const EMAIL_FROM = String(env?.EMAIL_FROM || "Innovatio Brutalis <info@innovatio-brutalis.se>");
  // Optional specialized senders.
  const LOGIN_EMAIL_FROM = String(env?.LOGIN_EMAIL_FROM || "");
  const ORDER_EMAIL_FROM = String(env?.ORDER_EMAIL_FROM || "");

  const TURNSTILE_SECRET = String(env?.TURNSTILE_SECRET || "");
  const RESEND_API_KEY = String(env?.RESEND_API_KEY || "");
  const EXPORT_ADMIN_KEY = String(env?.EXPORT_ADMIN_KEY || "");

  // Payments
  const STRIPE_SECRET_KEY = String(env?.STRIPE_SECRET_KEY || "");
  const STRIPE_PUBLISHABLE_KEY = String(env?.STRIPE_PUBLISHABLE_KEY || "");
  const STRIPE_WEBHOOK_SECRET = String(env?.STRIPE_WEBHOOK_SECRET || "");

  // FU pull/ack sync
  const FU_SYNC_KEY = String(env?.FU_SYNC_KEY || "");

  // Klarna/Swish guards (MVP defaults)
  const KLARNA_MAX_SEK = Number(env?.KLARNA_MAX_SEK || 500) || 500;
  const KLARNA_USERNAME = String(env?.KLARNA_USERNAME || "");
  const KLARNA_PASSWORD = String(env?.KLARNA_PASSWORD || "");
  const KLARNA_REGION = String(env?.KLARNA_REGION || "eu").toLowerCase();
  const KLARNA_TEST_MODE = String(env?.KLARNA_TEST_MODE || "").toLowerCase() === "true";

  const SWISH_PAYEE_ALIAS = String(env?.SWISH_PAYEE_ALIAS || "");

  return {
    DEV_MODE,
    EMAIL_PROVIDER,
    EMAIL_FROM,
    LOGIN_EMAIL_FROM,
    ORDER_EMAIL_FROM,
    TURNSTILE_SECRET,
    RESEND_API_KEY,
    EXPORT_ADMIN_KEY,

    STRIPE_SECRET_KEY,
    STRIPE_PUBLISHABLE_KEY,
    STRIPE_WEBHOOK_SECRET,

    FU_SYNC_KEY,
    KLARNA_MAX_SEK,
    KLARNA_USERNAME,
    KLARNA_PASSWORD,
    KLARNA_REGION,
    KLARNA_TEST_MODE,
    SWISH_PAYEE_ALIAS,
  };
};
