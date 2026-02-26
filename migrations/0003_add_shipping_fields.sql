-- Innovatio Brutalis: Shipping fields + FU invoice payload export (D1)

PRAGMA foreign_keys = ON;

-- Delivery/shipping metadata (kept denormalized for easy export)
ALTER TABLE orders ADD COLUMN delivery_method TEXT NOT NULL DEFAULT 'pickup';
ALTER TABLE orders ADD COLUMN shipping_provider TEXT;
ALTER TABLE orders ADD COLUMN shipping_code TEXT;

-- Deterministic FU invoice payload (separate from voucher payload queue)
ALTER TABLE orders ADD COLUMN fu_payload_json TEXT;
ALTER TABLE orders ADD COLUMN exported_to_fu INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN exported_to_fu_at TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_exported_to_fu ON orders(exported_to_fu, placed_at);
