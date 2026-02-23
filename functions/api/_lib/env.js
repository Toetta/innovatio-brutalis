export const getEnv = (env) => {
  const DEV_MODE = String(env?.DEV_MODE || "").toLowerCase() === "true";
  const EMAIL_PROVIDER = String(env?.EMAIL_PROVIDER || "resend").toLowerCase();
  const EMAIL_FROM = String(env?.EMAIL_FROM || "Innovatio Brutalis <info@innovatio-brutalis.se>");

  const TURNSTILE_SECRET = String(env?.TURNSTILE_SECRET || "");
  const RESEND_API_KEY = String(env?.RESEND_API_KEY || "");
  const EXPORT_ADMIN_KEY = String(env?.EXPORT_ADMIN_KEY || "");

  return {
    DEV_MODE,
    EMAIL_PROVIDER,
    EMAIL_FROM,
    TURNSTILE_SECRET,
    RESEND_API_KEY,
    EXPORT_ADMIN_KEY,
  };
};
