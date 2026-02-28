-- Innovatio Brutalis: FU sync payloads for multiple entity types (orders + Stripe payouts)

PRAGMA foreign_keys = OFF;

ALTER TABLE fu_sync_payloads RENAME TO fu_sync_payloads_old;

CREATE TABLE IF NOT EXISTS fu_sync_payloads (
  id TEXT PRIMARY KEY,

  entity_type TEXT NOT NULL CHECK(entity_type IN ('order','payout')),
  entity_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('sale','refund','payout')),

  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sent','acked','error')),
  payload TEXT NOT NULL,

  created_at TEXT NOT NULL,
  sent_at TEXT,
  acked_at TEXT,
  voucher_id TEXT,
  error TEXT,

  UNIQUE(entity_type, entity_id, kind)
);

INSERT INTO fu_sync_payloads (
  id,
  entity_type,
  entity_id,
  kind,
  status,
  payload,
  created_at,
  sent_at,
  acked_at,
  voucher_id,
  error
)
SELECT
  id,
  'order' AS entity_type,
  order_id AS entity_id,
  kind,
  status,
  payload,
  created_at,
  sent_at,
  acked_at,
  voucher_id,
  error
FROM fu_sync_payloads_old;

DROP TABLE fu_sync_payloads_old;

CREATE INDEX IF NOT EXISTS idx_fu_sync_payloads_status_created_at ON fu_sync_payloads(status, created_at);

PRAGMA foreign_keys = ON;
