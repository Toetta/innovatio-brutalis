import { json } from "../_lib/resp.js";
import { clearSessionCookie, revokeSessionByCookie } from "../_lib/auth.js";

export const onRequestPost = async (context) => {
  const { request, env } = context;
  try {
    await revokeSessionByCookie({ request, env });
  } catch (err) {
    console.error("logout_error", err);
  }
  return json({ ok: true }, { headers: { "set-cookie": clearSessionCookie() } });
};
