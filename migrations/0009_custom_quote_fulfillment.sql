PRAGMA foreign_keys = ON;

ALTER TABLE custom_quotes ADD COLUMN fulfillment_status TEXT NOT NULL DEFAULT 'pending' CHECK(fulfillment_status IN ('pending','partial','fulfilled'));
ALTER TABLE custom_quotes ADD COLUMN fulfilled_at TEXT;
ALTER TABLE custom_quotes ADD COLUMN fulfilled_by TEXT;
ALTER TABLE custom_quotes ADD COLUMN tracking_number TEXT;
ALTER TABLE custom_quotes ADD COLUMN tracking_url TEXT;
ALTER TABLE custom_quotes ADD COLUMN fulfillment_note TEXT;

ALTER TABLE custom_quote_lines ADD COLUMN fulfilled_quantity REAL NOT NULL DEFAULT 0;