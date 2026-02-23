-- Innovatio Brutalis: Customer accounts + orders + FU export (D1)

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  phone TEXT,
  company_name TEXT,
  orgnr TEXT,
  vat_id TEXT,
  marketing_opt_in INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS addresses (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('billing','shipping')),
  line1 TEXT,
  line2 TEXT,
  postal_code TEXT,
  city TEXT,
  region TEXT,
  country TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  session_token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY(customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS magic_links (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  ip TEXT,
  user_agent TEXT
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  order_number TEXT UNIQUE NOT NULL,
  customer_id TEXT,
  email TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'SEK',
  status TEXT NOT NULL CHECK(status IN ('pending','paid','cancelled','refunded')),
  payment_method TEXT,
  payment_reference TEXT,
  subtotal_ex_vat REAL NOT NULL DEFAULT 0,
  vat_total REAL NOT NULL DEFAULT 0,
  shipping_ex_vat REAL NOT NULL DEFAULT 0,
  shipping_vat REAL NOT NULL DEFAULT 0,
  total_inc_vat REAL NOT NULL DEFAULT 0,
  placed_at TEXT NOT NULL,
  paid_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS order_lines (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  product_id TEXT,
  sku TEXT,
  title TEXT NOT NULL,
  qty REAL NOT NULL,
  unit_price_ex_vat REAL NOT NULL,
  vat_rate REAL NOT NULL,
  line_total_ex_vat REAL NOT NULL,
  line_vat REAL NOT NULL,
  line_total_inc_vat REAL NOT NULL,
  FOREIGN KEY(order_id) REFERENCES orders(id)
);

CREATE TABLE IF NOT EXISTS export_batches (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('customers','invoices','all')),
  created_at TEXT NOT NULL,
  created_by TEXT,
  since_date TEXT,
  status TEXT NOT NULL CHECK(status IN ('created','downloaded','imported','cancelled')),
  note TEXT
);

CREATE TABLE IF NOT EXISTS export_items (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('customer','invoice')),
  entity_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(batch_id) REFERENCES export_batches(id)
);

CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_magic_links_email_created_at ON magic_links(email, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id_placed_at ON orders(customer_id, placed_at);
CREATE INDEX IF NOT EXISTS idx_order_lines_order_id ON order_lines(order_id);
