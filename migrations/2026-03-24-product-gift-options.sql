CREATE TABLE IF NOT EXISTS product_gift_options (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  offer_name VARCHAR(100) NOT NULL,
  gift_product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  min_units INTEGER NOT NULL DEFAULT 1,
  gift_quantity INTEGER NOT NULL DEFAULT 1,
  extra_price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_product_gift_options_product_id
  ON product_gift_options(product_id, sort_order, id);

CREATE INDEX IF NOT EXISTS idx_product_gift_options_gift_product_id
  ON product_gift_options(gift_product_id);
