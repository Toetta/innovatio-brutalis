-- Innovatio Brutalis: order fulfillment tracking for FU orderstock

ALTER TABLE orders ADD COLUMN fulfillment_status TEXT NOT NULL DEFAULT 'pending' CHECK(fulfillment_status IN ('pending','fulfilled'));
ALTER TABLE orders ADD COLUMN fulfilled_at TEXT;
ALTER TABLE orders ADD COLUMN fulfilled_by TEXT;
ALTER TABLE orders ADD COLUMN tracking_number TEXT;
ALTER TABLE orders ADD COLUMN tracking_url TEXT;
ALTER TABLE orders ADD COLUMN fulfillment_note TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_status_fulfillment_placed_at ON orders(status, fulfillment_status, placed_at DESC);