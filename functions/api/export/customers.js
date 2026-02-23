import { forbidden, json } from "../_lib/resp.js";
import { requireAdminKey } from "../_lib/auth.js";
import { exportCustomersSince, markBatchDownloaded } from "../_lib/export.js";

export const onRequestGet = async (context) => {
  const { request, env } = context;
  if (!requireAdminKey({ request, env })) return forbidden();

  const url = new URL(request.url);
  const since = String(url.searchParams.get("since") || "");
  const batch_id = String(url.searchParams.get("batch_id") || "");
  const since_date = since && /^\d{4}-\d{2}-\d{2}$/.test(since) ? since : "";

  const customers = await exportCustomersSince({ env, since_date });
  if (batch_id) await markBatchDownloaded({ env, batch_id });

  return json({
    schema_version: "1.0",
    generated_at: new Date().toISOString(),
    source: "innovatio-brutalis-webshop",
    batch_id: batch_id || null,
    since_date: since_date || null,
    customers,
  });
};
