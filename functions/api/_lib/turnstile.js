import { getEnv } from "./env.js";

export const verifyTurnstile = async ({ env, token, remoteip }) => {
  const { TURNSTILE_SECRET } = getEnv(env);
  if (!TURNSTILE_SECRET) {
    // Fail closed in prod; allow bypass in DEV_MODE only.
    const dev = String(env?.DEV_MODE || "").toLowerCase() === "true";
    return dev;
  }
  if (!token) return false;

  const body = new URLSearchParams();
  body.set("secret", TURNSTILE_SECRET);
  body.set("response", token);
  if (remoteip) body.set("remoteip", remoteip);

  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = await res.json().catch(() => null);
  return Boolean(data && data.success);
};
