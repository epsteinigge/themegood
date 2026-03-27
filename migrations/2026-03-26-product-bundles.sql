ALTER TABLE products
ADD COLUMN IF NOT EXISTS product_type TEXT DEFAULT 'single';

CREATE TABLE IF NOT EXISTS bundle_slots (
  id SERIAL PRIMARY KEY,
  bundle_product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  slot_label VARCHAR(100) NOT NULL,
  required_size VARCHAR(50) NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bundle_pricing_rules (
  id SERIAL PRIMARY KEY,
  bundle_product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  pricing_type TEXT NOT NULL DEFAULT 'sum',
  amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bundle_slots_product
ON bundle_slots(bundle_product_id);

CREATE INDEX IF NOT EXISTS idx_bundle_pricing_rules_product
ON bundle_pricing_rules(bundle_product_id);
