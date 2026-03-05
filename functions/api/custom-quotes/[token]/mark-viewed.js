import { badRequest, json, notFound } from "../../_lib/resp.js";
import { assertDb, exec, getClientIp, one } from "../../_lib/db.js";
import { nowIso, sha256Hex, uuid } from "../../_lib/crypto.js";

const RATE_LIMIT_PER_MINUTE = 30;

const rateLimitOk = async (db, { request, token }) => {
  const ip = getClientIp(request);
  const ipHash = await sha256Hex(ip || "");
  const bucket = nowIso().slice(0, 16);
  const ts = nowIso();

  await exec(
    db,
    "INSERT INTO custom_quote_rate_limits (id, ip_hash, token, bucket, count, created_at) VALUES (?,?,?,?,1,?) ON CONFLICT(ip_hash, token, bucket) DO UPDATE SET count = count + 1",
    [uuid(), ipHash, token, bucket, ts]
  );

  const row = await one(
    db.prepare("SELECT count FROM custom_quote_rate_limits WHERE ip_hash = ? AND token = ? AND bucket = ? LIMIT 1").bind(ipHash, token, bucket).all()
  );

  return Number(row?.count || 0) <= RATE_LIMIT_PER_MINUTE;
};

export const onRequestPost = async (context) => {
  const { request, env, params } = context;
  const token = String(params?.token || "").trim();
  if (!token) return notFound();

  const db = assertDb(env);
  const ok = await rateLimitOk(db, { request, token });
  if (!ok) return json({ ok: false, error: "Too many requests" }, { status: 429 });

  const quote = await one(db.prepare("SELECT id FROM custom_quotes WHERE token = ? LIMIT 1").bind(token).all());
  if (!quote) return notFound();

  const ip = getClientIp(request);
  const ipHash = await sha256Hex(ip || "");

  await exec(
    db,
    "INSERT INTO custom_quote_events (id, quote_id, event_type, meta_json, created_at) VALUES (?,?,?,?,?)",
    [uuid(), quote.id, "viewed", JSON.stringify({ ip_hash: ipHash }), nowIso()]
  );

  return json({ ok: true });
};

export const onRequestGet = async () => badRequest("Method not allowed");
