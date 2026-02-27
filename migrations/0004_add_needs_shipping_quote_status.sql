-- Innovatio Brutalis: Add needs_shipping_quote order status (D1)

PRAGMA foreign_keys = OFF;

-- Rebuild orders so we can update the status CHECK constraint safely.
ALTER TABLE orders RENAME TO orders_old;

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  order_number TEXT UNIQUE NOT NULL,
  customer_id TEXT,
  email TEXT NOT NULL,
  customer_country TEXT NOT NULL DEFAULT 'SE',
  currency TEXT NOT NULL DEFAULT 'SEK',

  -- Canonical status model
  status TEXT NOT NULL CHECK(status IN (
    'needs_shipping_quote',
    'pending_payment',
    'awaiting_action',
    'paid',
    'refunded',
    'cancelled',
    'failed'
  )),

  -- Payment
  payment_provider TEXT,
  payment_reference TEXT,
  payment_method TEXT,

  -- Totals (legacy REAL columns kept for backwards compat)
  subtotal_ex_vat REAL NOT NULL DEFAULT 0,
  vat_total REAL NOT NULL DEFAULT 0,
  shipping_ex_vat REAL NOT NULL DEFAULT 0,
  shipping_vat REAL NOT NULL DEFAULT 0,
  total_inc_vat REAL NOT NULL DEFAULT 0,

  -- Totals (minor units; best-effort populated for new orders)
  subtotal_minor INTEGER,
  vat_total_minor INTEGER,
  shipping_minor INTEGER,
  total_minor INTEGER,

  -- Timestamps
  placed_at TEXT NOT NULL,
  paid_at TEXT,
  refunded_at TEXT,
  failed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  -- Public order lookup (guest checkout)
  public_token_hash TEXT,

  -- FU pull/ack sync
  fu_voucher_id TEXT,
  fu_sync_status TEXT NOT NULL DEFAULT 'not_required' CHECK(fu_sync_status IN ('not_required','queued','sent','acked','error')),
  fu_sync_error TEXT,

  metadata TEXT,

  -- Delivery/shipping metadata (kept denormalized for easy export)
  delivery_method TEXT NOT NULL DEFAULT 'pickup',
  shipping_provider TEXT,
  shipping_code TEXT,

  -- Deterministic FU invoice payload (separate from voucher payload queue)
  fu_payload_json TEXT,
  exported_to_fu INTEGER NOT NULL DEFAULT 0,
  exported_to_fu_at TEXT,

  FOREIGN KEY(customer_id) REFERENCES customers(id)
);

INSERT INTO orders (
  id,
  order_number,
  customer_id,
  email,
  customer_country,
  currency,
  status,
  payment_provider,
  payment_reference,
  payment_method,
  subtotal_ex_vat,
  vat_total,
  shipping_ex_vat,
  shipping_vat,
  total_inc_vat,
  subtotal_minor,
  vat_total_minor,
  shipping_minor,
  total_minor,
  placed_at,
  paid_at,
  refunded_at,
  failed_at,
  created_at,
  updated_at,
  public_token_hash,
  fu_voucher_id,
  fu_sync_status,
  fu_sync_error,
  metadata,
  delivery_method,
  shipping_provider,
  shipping_code,
  fu_payload_json,
  exported_to_fu,
  exported_to_fu_at
)
SELECT
  id,
  order_number,
  customer_id,
  email,
  customer_country,
  currency,
  status,
  payment_provider,
  payment_reference,
  payment_method,
  subtotal_ex_vat,
  vat_total,
  shipping_ex_vat,
  shipping_vat,
  total_inc_vat,
  subtotal_minor,
  vat_total_minor,
  shipping_minor,
  total_minor,
  placed_at,
  paid_at,
  refunded_at,
  failed_at,
  created_at,
  updated_at,
  public_token_hash,
  fu_voucher_id,
  fu_sync_status,
  fu_sync_error,
  metadata,
  delivery_method,
  shipping_provider,
  shipping_code,
  fu_payload_json,
  exported_to_fu,
  exported_to_fu_at
FROM orders_old;

DROP TABLE orders_old;

CREATE INDEX IF NOT EXISTS idx_orders_customer_id_placed_at ON orders(customer_id, placed_at);
CREATE INDEX IF NOT EXISTS idx_orders_exported_to_fu ON orders(exported_to_fu, placed_at);

PRAGMA foreign_keys = ON;
