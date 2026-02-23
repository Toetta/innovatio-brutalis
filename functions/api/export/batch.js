import { badRequest, forbidden, json } from "../_lib/resp.js";
import { requireAdminKey } from "../_lib/auth.js";
import { createExportBatch } from "../_lib/export.js";

export const onRequestPost = async (context) => {
  const { request, env } = context;
  if (!requireAdminKey({ request, env })) return forbidden();

  let body = null;
  try {
    body = await request.json();
  } catch (_) {
    return badRequest("Invalid JSON");
  }

  const type = String(body?.type || "");
  const since_date = body?.since_date ? String(body.since_date) : "";
  const note = body?.note ? String(body.note) : "";
  if (!['customers','invoices','all'].includes(type)) return badRequest("Invalid type");
  if (since_date && !/^\d{4}-\d{2}-\d{2}$/.test(since_date)) return badRequest("Invalid since_date");

  const batch = await createExportBatch({ env, type, since_date, note, created_by: "api" });
  const base = new URL(request.url).origin;
  return json({
    ok: true,
    batch_id: batch.batch_id,
    urls: {
      customers: `${base}/api/export/customers?since=${encodeURIComponent(since_date || '')}&batch_id=${encodeURIComponent(batch.batch_id)}`,
      invoices: `${base}/api/export/invoices?since=${encodeURIComponent(since_date || '')}&batch_id=${encodeURIComponent(batch.batch_id)}`,
    },
  });
};
