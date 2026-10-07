BEGIN;

-- Matcha uses its standalone price in bundles until a promotion is configured.
-- A placeholder stock keeps it available while inventory counts are not managed.
INSERT INTO products (
  name, description, price, image_url, stock, sold, product_type,
  is_active, sort_order, is_featured, featured_order,
  size_price_small, size_price_medium, size_price_large, size_options
)
SELECT 'Matcha Soy Collagen',
       'A blend of soy, oat, matcha and collagen powder. Available in 300g and 800g.',
       79, '/uploads/matcha-800g.webp', 9999, 0, 'single',
       true, 6, true, 6, 79, NULL, 148, 'small,large'
WHERE NOT EXISTS (
  SELECT 1 FROM products WHERE LOWER(name) = 'matcha soy collagen'
);

INSERT INTO product_variants (
  product_id, name, units, price, stock, image_url,
  is_active, sort_order, bundle_extra_price
)
SELECT p.id, v.name, 1, v.price, 9999, v.image_url, true, v.sort_order, v.extra
FROM products p
CROSS JOIN (VALUES
  ('300g', 79, '/uploads/matcha-300g.webp', 0, 51),
  ('800g', 148, '/uploads/matcha-800g.webp', 2, 40)
) AS v(name, price, image_url, sort_order, extra)
WHERE LOWER(p.name) = 'matcha soy collagen'
  AND NOT EXISTS (
    SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND pv.name = v.name
  );

INSERT INTO product_images (product_id, image_url, sort_order, is_primary)
SELECT p.id, img.image_url, img.sort_order, img.is_primary
FROM products p
CROSS JOIN (VALUES
  ('/uploads/matcha-800g.webp', 0, true),
  ('/uploads/matcha-300g.webp', 1, false)
) AS img(image_url, sort_order, is_primary)
WHERE LOWER(p.name) = 'matcha soy collagen'
  AND NOT EXISTS (
    SELECT 1 FROM product_images pi WHERE pi.product_id = p.id AND pi.image_url = img.image_url
  );

COMMIT;
