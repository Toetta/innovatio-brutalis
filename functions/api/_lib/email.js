import { getEnv } from "./env.js";

const sendEmail = async ({ env, from, to, subject, text }) => {
  const cfg = getEnv(env);
  const provider = cfg.EMAIL_PROVIDER;

  if (provider === "disabled") {
    return { ok: true, provider: "disabled" };
  }

  if (provider === "resend") {
    if (!cfg.RESEND_API_KEY) throw new Error("Missing RESEND_API_KEY");
    const recipients = Array.isArray(to) ? to : [to];
    const cleanedRecipients = recipients.map((x) => String(x || "").trim()).filter(Boolean);
    if (!cleanedRecipients.length) throw new Error("Missing email recipient");

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${cfg.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: cleanedRecipients,
        subject,
        text,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Resend error: HTTP ${res.status} ${body}`);
    }
    return { ok: true, provider: "resend", to: cleanedRecipients };
  }

  throw new Error(`Unknown EMAIL_PROVIDER: ${provider}`);
};

const parseRecipientList = (value) => String(value || "")
  .split(/[;,\n]/)
  .map((x) => x.trim())
  .filter(Boolean);

export const sendLoginEmail = async ({ env, to, loginUrl }) => {
  const cfg = getEnv(env);

  const from = String(cfg.LOGIN_EMAIL_FROM || cfg.EMAIL_FROM || "").trim();
  if (!from) throw new Error("Missing EMAIL_FROM");

  const subject = "Your Innovatio Brutalis login link";
  const text = `Use this link to sign in:\n\n${loginUrl}\n\nThis link expires in 15 minutes.`;

  return await sendEmail({ env, from, to, subject, text });
};

export const sendPaymentNotificationEmail = async ({ env, subject, text }) => {
  const cfg = getEnv(env);
  const to = parseRecipientList(cfg.PAYMENT_NOTIFY_TO);
  if (!to.length) return { ok: true, skipped: true, reason: "PAYMENT_NOTIFY_TO not configured" };

  const from = String(cfg.PAYMENT_NOTIFY_FROM || cfg.ORDER_EMAIL_FROM || cfg.EMAIL_FROM || "").trim();
  if (!from) throw new Error("Missing PAYMENT_NOTIFY_FROM/ORDER_EMAIL_FROM/EMAIL_FROM");

  return await sendEmail({ env, from, to, subject, text });
};
