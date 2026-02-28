import { badRequest, corsPreflight, forbidden, json, notFound, withCors } from "../_lib/resp.js";
import { assertDb, exec, one } from "../_lib/db.js";
import { nowIso } from "../_lib/crypto.js";
import { requireFuKey } from "../_lib/fu.js";

const corsOpts = ({ request, env }) => ({
  request,
  env,
  allowMethods: "POST, OPTIONS",
  allowHeaders: "content-type, x-fu-key",
});

export const onRequestOptions = async (context) => {
  return corsPreflight(context, corsOpts(context));
};

export const onRequestPost = async (context) => {
  const { request, env } = context;
  if (!requireFuKey({ request, env })) return withCors(forbidden(), corsOpts(context));

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return withCors(badRequest("Invalid JSON"), corsOpts(context));
  }

  const id = String(body?.id || "");
  if (!id) return withCors(badRequest("Missing id"), corsOpts(context));

  const ok = Boolean(body?.ok);
  const voucher_id = body?.voucher_id != null ? String(body.voucher_id) : null;
  const error = body?.error != null ? String(body.error) : null;

  const db = assertDb(env);
  const row = await one(db.prepare("SELECT id, entity_type, entity_id FROM fu_sync_payloads WHERE id = ? LIMIT 1").bind(id).all());
  if (!row) return withCors(notFound("Payload not found"), corsOpts(context));

  const ts = nowIso();

  if (ok) {
    await exec(
      db,
      "UPDATE fu_sync_payloads SET status = 'acked', acked_at = ?, voucher_id = ?, error = NULL WHERE id = ?",
      [ts, voucher_id, id]
    );

    if (row.entity_type === "order") {
      await exec(
        db,
        "UPDATE orders SET fu_voucher_id = COALESCE(fu_voucher_id, ?), fu_sync_status = 'acked', fu_sync_error = NULL, updated_at = ? WHERE id = ?",
        [voucher_id, ts, row.entity_id]
      );
    }
    return withCors(json({ ok: true }), corsOpts(context));
  }

  await exec(
    db,
    "UPDATE fu_sync_payloads SET status = 'error', acked_at = ?, error = ? WHERE id = ?",
    [ts, error || "Unknown error", id]
  );

  if (row.entity_type === "order") {
    await exec(
      db,
      "UPDATE orders SET fu_sync_status = 'error', fu_sync_error = ?, updated_at = ? WHERE id = ?",
      [error || "Unknown error", ts, row.entity_id]
    );
  }

  return withCors(json({ ok: true }), corsOpts(context));
};
