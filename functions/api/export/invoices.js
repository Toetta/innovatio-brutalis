import { forbidden, json } from "../_lib/resp.js";
import { requireAdminKey } from "../_lib/auth.js";
import { exportInvoicesSince, markBatchDownloaded } from "../_lib/export.js";

export const onRequestGet = async (context) => {
  const { request, env } = context;
  if (!requireAdminKey({ request, env })) return forbidden();

  const url = new URL(request.url);
  const since = String(url.searchParams.get("since") || "");
  const batch_id = String(url.searchParams.get("batch_id") || "");
  const since_date = since && /^\d{4}-\d{2}-\d{2}$/.test(since) ? since : "";

  const invoiceDrafts = await exportInvoicesSince({ env, since_date });
  if (batch_id) await markBatchDownloaded({ env, batch_id });

  // invoice_external_id: order.id (idempotent FU import key)
  const invoices = invoiceDrafts.map(({ order, lines }) => ({
    invoice_external_id: order.id,
    order_number: order.order_number,
    customer_id: order.customer_id,
    email: order.email,
    currency: order.currency,
    status: order.status,
    placed_at: order.placed_at,
    paid_at: order.paid_at,
    totals: {
      subtotal_ex_vat: order.subtotal_ex_vat,
      vat_total: order.vat_total,
      shipping_ex_vat: order.shipping_ex_vat,
      shipping_vat: order.shipping_vat,
      total_inc_vat: order.total_inc_vat,
    },
    lines,
  }));

  return json({
    schema_version: "1.0",
    generated_at: new Date().toISOString(),
    source: "innovatio-brutalis-webshop",
    batch_id: batch_id || null,
    since_date: since_date || null,
    invoices,
  });
};
