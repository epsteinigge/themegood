-- PostgreSQL / Neon
CREATE TABLE IF NOT EXISTS product_images (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_product_images_product_id
  ON product_images(product_id);

CREATE INDEX IF NOT EXISTS idx_product_images_primary_sort
  ON product_images(product_id, is_primary, sort_order, id);

CREATE TABLE IF NOT EXISTS product_variants (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  units INTEGER NOT NULL DEFAULT 1,
  discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_product_variants_product_id
  ON product_variants(product_id);

CREATE INDEX IF NOT EXISTS idx_product_variants_active_sort
  ON product_variants(product_id, is_active, sort_order, id);

INSERT INTO product_images (product_id, image_url, sort_order, is_primary)
SELECT p.id, p.image_url, 0, TRUE
FROM products p
WHERE COALESCE(TRIM(p.image_url), '') <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM product_images pi
    WHERE pi.product_id = p.id
  );

-- MySQL-compatible reference
-- CREATE TABLE product_images (
--   id INT AUTO_INCREMENT PRIMARY KEY,
--   product_id INT NOT NULL,
--   image_url TEXT NOT NULL,
--   sort_order INT NOT NULL DEFAULT 0,
--   is_primary BOOLEAN NOT NULL DEFAULT FALSE,
--   created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
--   CONSTRAINT fk_product_images_product
--     FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
--   INDEX idx_product_images_product_id (product_id),
--   INDEX idx_product_images_primary_sort (product_id, is_primary, sort_order, id)
-- );
--
-- CREATE TABLE product_variants (
--   id INT AUTO_INCREMENT PRIMARY KEY,
--   product_id INT NOT NULL,
--   name VARCHAR(100) NOT NULL,
--   units INT NOT NULL DEFAULT 1,
--   discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
--   is_active BOOLEAN NOT NULL DEFAULT TRUE,
--   sort_order INT NOT NULL DEFAULT 0,
--   created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
--   CONSTRAINT fk_product_variants_product
--     FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
--   INDEX idx_product_variants_product_id (product_id),
--   INDEX idx_product_variants_active_sort (product_id, is_active, sort_order, id)
-- );
