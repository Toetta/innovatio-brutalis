-- Innovatio Brutalis: Custom payment links (private quotes)

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS custom_quotes (
  id TEXT PRIMARY KEY,
  token TEXT UNIQUE NOT NULL,

  status TEXT NOT NULL CHECK(status IN ('draft','sent','paid','expired','cancelled')),

  customer_email TEXT NOT NULL,
  customer_name TEXT,
  customer_phone TEXT,
  company_name TEXT,
  orgnr TEXT,
  vat_id TEXT,

  billing_address_json TEXT,
  shipping_address_json TEXT,

  currency TEXT NOT NULL DEFAULT 'SEK',
  vat_scheme TEXT NOT NULL DEFAULT 'SE_VAT',

  notes TEXT,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT,
  paid_at TEXT,
  fu_exported_at TEXT
);

CREATE TABLE IF NOT EXISTS custom_quote_lines (
  id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL REFERENCES custom_quotes(id) ON DELETE CASCADE,

  line_type TEXT NOT NULL CHECK(line_type IN ('service_hourly','service_fixed','product','shipping','discount')),
  category TEXT NOT NULL,

  title TEXT NOT NULL,
  description TEXT,

  quantity REAL NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'st',
  unit_price_ex_vat REAL NOT NULL DEFAULT 0,
  vat_rate REAL NOT NULL DEFAULT 0.25,

  account_suggestion TEXT,

  sort_order INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS custom_quote_events (
  id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL REFERENCES custom_quotes(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  meta_json TEXT,
  created_at TEXT NOT NULL
);

-- Best-effort rate limiting (per token + IP hash + minute bucket)
CREATE TABLE IF NOT EXISTS custom_quote_rate_limits (
  id TEXT PRIMARY KEY,
  ip_hash TEXT NOT NULL,
  token TEXT NOT NULL,
  bucket TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE(ip_hash, token, bucket)
);

CREATE INDEX IF NOT EXISTS idx_custom_quotes_token ON custom_quotes(token);
CREATE INDEX IF NOT EXISTS idx_custom_quotes_customer_email ON custom_quotes(customer_email);
CREATE INDEX IF NOT EXISTS idx_custom_quote_lines_quote_id ON custom_quote_lines(quote_id);
CREATE INDEX IF NOT EXISTS idx_custom_quote_events_quote_id ON custom_quote_events(quote_id, created_at);
