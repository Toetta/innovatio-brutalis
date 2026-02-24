import { redirect } from "../_lib/resp.js";
import { consumeMagicLinkAndCreateSession, setSessionCookie } from "../_lib/auth.js";

const safeReturnPath = (raw) => {
  try {
    const p = String(raw || "").trim();
    if (!p) return "";
    if (!p.startsWith("/")) return "";
    if (p.startsWith("//")) return "";
    if (p.includes("://")) return "";
    return p;
  } catch (_) {
    return "";
  }
};

export const onRequestGet = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const token = String(url.searchParams.get("token") || "");
  const returnPath = safeReturnPath(url.searchParams.get("return"));
  if (!token) return redirect("/login/", 302);

  const res = await consumeMagicLinkAndCreateSession({ env, token }).catch((err) => {
    console.error("verify_error", err);
    return { ok: false };
  });

  if (!res.ok) return redirect("/login/", 302);

  return redirect(returnPath || "/account/", 302, {
    "set-cookie": setSessionCookie(res.session.token),
  });
};
