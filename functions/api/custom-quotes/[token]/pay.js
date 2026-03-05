import { badRequest, forbidden, json, notFound } from "../../_lib/resp.js";
import { requireCustomAdminKey } from "../../_lib/auth.js";
import { assertDb, exec, one } from "../../_lib/db.js";
import { nowIso, uuid } from "../../_lib/crypto.js";
import { getEnv } from "../../_lib/env.js";

export const onRequestPost = async (context) => {
  const { request, env, params } = context;
  const token = String(params?.token || "").trim();
  if (!token) return notFound();

  if (!getEnv(env).DEV_MODE) return forbidden("Manual pay is disabled (Stripe-only)");

  if (!requireCustomAdminKey({ request, env })) return forbidden();

  const db = assertDb(env);
  const quote = await one(db.prepare("SELECT id, status, paid_at FROM custom_quotes WHERE token = ? LIMIT 1").bind(token).all());
  if (!quote) return notFound();

  const ts = nowIso();

  await exec(
    db,
    "UPDATE custom_quotes SET status = 'paid', paid_at = COALESCE(paid_at, ?), updated_at = ? WHERE id = ?",
    [ts, ts, quote.id]
  );

  await exec(
    db,
    "INSERT INTO custom_quote_events (id, quote_id, event_type, meta_json, created_at) VALUES (?,?,?,?,?)",
    [uuid(), quote.id, "paid", JSON.stringify({ by: "admin", mode: "manual" }), ts]
  );

  return json({ ok: true });
};

export const onRequestGet = async () => badRequest("Method not allowed");
