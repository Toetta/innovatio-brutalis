import { nowIso } from "./crypto.js";

export const assertDb = (env) => {
  if (!env?.DB) throw new Error("Missing D1 binding: env.DB");
  return env.DB;
};

export const one = async (stmtPromise) => {
  const res = await stmtPromise;
  return (res?.results && res.results[0]) ? res.results[0] : null;
};

export const all = async (stmtPromise) => {
  const res = await stmtPromise;
  return Array.isArray(res?.results) ? res.results : [];
};

export const exec = async (db, sql, params = []) => {
  return await db.prepare(sql).bind(...params).run();
};

export const getClientIp = (request) => {
  // Best-effort. Cloudflare sets CF-Connecting-IP.
  return request.headers.get("CF-Connecting-IP") || request.headers.get("x-forwarded-for") || "";
};

export const touchTimestamps = (existing) => {
  const ts = nowIso();
  if (existing) return { updated_at: ts };
  return { created_at: ts, updated_at: ts };
};
