import { getEnv } from "./env.js";

export const sendLoginEmail = async ({ env, to, loginUrl }) => {
  const cfg = getEnv(env);
  const provider = cfg.EMAIL_PROVIDER;

  const from = String(cfg.LOGIN_EMAIL_FROM || cfg.EMAIL_FROM || "").trim();
  if (!from) throw new Error("Missing EMAIL_FROM");

  const subject = "Your Innovatio Brutalis login link";
  const text = `Use this link to sign in:\n\n${loginUrl}\n\nThis link expires in 15 minutes.`;

  if (provider === "disabled") {
    return { ok: true, provider: "disabled" };
  }

  if (provider === "resend") {
    if (!cfg.RESEND_API_KEY) throw new Error("Missing RESEND_API_KEY");
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${cfg.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        text,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Resend error: HTTP ${res.status} ${body}`);
    }
    return { ok: true, provider: "resend" };
  }

  throw new Error(`Unknown EMAIL_PROVIDER: ${provider}`);
};
