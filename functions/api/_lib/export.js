import { assertDb, all, exec } from "./db.js";
import { nowIso, uuid } from "./crypto.js";

export const createExportBatch = async ({ env, type, since_date, note, created_by }) => {
  const db = assertDb(env);
  const id = uuid();
  const created_at = nowIso();
  await exec(
    db,
    "INSERT INTO export_batches (id, type, created_at, created_by, since_date, status, note) VALUES (?,?,?,?,?, 'created', ?)",
    [id, type, created_at, created_by || null, since_date || null, note || null]
  );

  // Precompute export items for idempotency/auditability.
  const ts = nowIso();
  const sinceIso = since_date ? `${since_date}T00:00:00.000Z` : "1970-01-01T00:00:00.000Z";

  if (type === "customers" || type === "all") {
    const customers = await all(
      db.prepare("SELECT id FROM customers WHERE created_at >= ? OR updated_at >= ?").bind(sinceIso, sinceIso).all()
    );
    for (const c of customers) {
      await exec(db, "INSERT INTO export_items (id, batch_id, entity_type, entity_id, created_at) VALUES (?,?,?,?,?)", [uuid(), id, "customer", c.id, ts]);
    }
  }

  if (type === "invoices" || type === "all") {
    const orders = await all(
      db.prepare("SELECT id FROM orders WHERE placed_at >= ?").bind(sinceIso).all()
    );
    for (const o of orders) {
      await exec(db, "INSERT INTO export_items (id, batch_id, entity_type, entity_id, created_at) VALUES (?,?,?,?,?)", [uuid(), id, "invoice", o.id, ts]);
    }
  }

  return { batch_id: id, created_at };
};

export const markBatchDownloaded = async ({ env, batch_id }) => {
  const db = assertDb(env);
  await exec(db, "UPDATE export_batches SET status = 'downloaded' WHERE id = ? AND status = 'created'", [batch_id]);
};

export const exportCustomersSince = async ({ env, since_date }) => {
  const db = assertDb(env);
  const sinceIso = since_date ? `${since_date}T00:00:00.000Z` : "1970-01-01T00:00:00.000Z";
  const rows = await all(
    db.prepare(
      "SELECT id, email, full_name, phone, company_name, orgnr, vat_id, marketing_opt_in, created_at, updated_at FROM customers WHERE created_at >= ? OR updated_at >= ? ORDER BY updated_at DESC"
    ).bind(sinceIso, sinceIso).all()
  );
  return rows;
};

export const exportInvoicesSince = async ({ env, since_date }) => {
  const db = assertDb(env);
  const sinceIso = since_date ? `${since_date}T00:00:00.000Z` : "1970-01-01T00:00:00.000Z";
  const orders = await all(
    db.prepare(
      "SELECT id, order_number, customer_id, email, currency, status, subtotal_ex_vat, vat_total, shipping_ex_vat, shipping_vat, total_inc_vat, placed_at, paid_at FROM orders WHERE placed_at >= ? ORDER BY placed_at DESC"
    ).bind(sinceIso).all()
  );

  const invoices = [];
  for (const o of orders) {
    const lines = await all(
      db.prepare(
        "SELECT id, product_id, sku, title, qty, unit_price_ex_vat, vat_rate, line_total_ex_vat, line_vat, line_total_inc_vat FROM order_lines WHERE order_id = ? ORDER BY id"
      ).bind(o.id).all()
    );
    invoices.push({ order: o, lines });
  }
  return invoices;
};
