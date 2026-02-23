import { redirect } from "../_lib/resp.js";
import { consumeMagicLinkAndCreateSession, setSessionCookie } from "../_lib/auth.js";

export const onRequestGet = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const token = String(url.searchParams.get("token") || "");
  if (!token) return redirect("/login/", 302);

  const res = await consumeMagicLinkAndCreateSession({ env, token }).catch((err) => {
    console.error("verify_error", err);
    return { ok: false };
  });

  if (!res.ok) return redirect("/login/", 302);

  return redirect("/account/", 302, {
    "set-cookie": setSessionCookie(res.session.token),
  });
};
