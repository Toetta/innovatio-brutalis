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

  return {
    DEV_MODE,
    EMAIL_PROVIDER,
    EMAIL_FROM,
    LOGIN_EMAIL_FROM,
    ORDER_EMAIL_FROM,
    TURNSTILE_SECRET,
    RESEND_API_KEY,
    EXPORT_ADMIN_KEY,
  };
};
