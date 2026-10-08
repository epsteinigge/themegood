BEGIN;

UPDATE products
SET size_price_large = 168.00
WHERE LOWER(name) = 'matcha soy collagen';

UPDATE product_variants pv
SET price = 168.00, bundle_extra_price = 60.00
FROM products p
WHERE pv.product_id = p.id
  AND LOWER(p.name) = 'matcha soy collagen'
  AND LOWER(REPLACE(pv.name, ' ', '')) = '800g';

COMMIT;
