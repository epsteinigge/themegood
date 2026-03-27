ALTER TABLE products
ADD COLUMN IF NOT EXISTS size_price_small NUMERIC(10, 2);

ALTER TABLE products
ADD COLUMN IF NOT EXISTS size_price_medium NUMERIC(10, 2);

ALTER TABLE products
ADD COLUMN IF NOT EXISTS size_price_large NUMERIC(10, 2);
