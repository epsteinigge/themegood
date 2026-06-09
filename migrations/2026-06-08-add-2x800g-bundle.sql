WITH source_bundle AS (
  SELECT *
  FROM products
  WHERE id = 7
),
shifted_orders AS (
  UPDATE products
  SET sort_order = CASE WHEN sort_order >= 6 THEN sort_order + 1 ELSE sort_order END,
      featured_order = CASE WHEN featured_order >= 6 THEN featured_order + 1 ELSE featured_order END
  WHERE NOT EXISTS (
    SELECT 1 FROM products WHERE name = '2x 800g' AND product_type = 'bundle'
  )
  RETURNING id
),
inserted_product AS (
  INSERT INTO products (
    name,
    description,
    price,
    image_url,
    stock,
    sold,
    product_type,
    is_active,
    sort_order,
    is_featured,
    featured_order,
    size_price_small,
    size_price_medium,
    size_price_large,
    free_gift_enabled,
    free_gift_product_id,
    free_gift_min_quantity,
    free_gift_quantity,
    size_options
  )
  SELECT
    '2x 800g',
    'Custom bundle with 2 selectable 800g slots.',
    216.00,
    '/uploads/2x-800g-bilberry-pomegranate.webp',
    stock,
    0,
    'bundle',
    COALESCE(is_active, true),
    6,
    COALESCE(is_featured, true),
    6,
    NULL,
    NULL,
    NULL,
    COALESCE(free_gift_enabled, false),
    free_gift_product_id,
    COALESCE(free_gift_min_quantity, 1),
    COALESCE(free_gift_quantity, 1),
    ''
  FROM source_bundle
  WHERE NOT EXISTS (
    SELECT 1 FROM products WHERE name = '2x 800g' AND product_type = 'bundle'
  )
  RETURNING id
)
INSERT INTO bundle_slots (bundle_product_id, slot_label, required_size, sort_order)
SELECT inserted_product.id, slot.slot_label, slot.required_size, slot.sort_order
FROM inserted_product
CROSS JOIN (
  VALUES
    ('800g', '800g', 0),
    ('800g', '800g', 1)
) AS slot(slot_label, required_size, sort_order);

WITH inserted_product AS (
  SELECT id
  FROM products
  WHERE name = '2x 800g' AND product_type = 'bundle'
)
INSERT INTO bundle_pricing_rules (bundle_product_id, pricing_type, amount, cocoa_extra_amount)
SELECT inserted_product.id, 'sum', 0.00, 0.00
FROM inserted_product
WHERE NOT EXISTS (
  SELECT 1 FROM bundle_pricing_rules WHERE bundle_product_id = inserted_product.id
);

WITH inserted_product AS (
  SELECT id
  FROM products
  WHERE name = '2x 800g' AND product_type = 'bundle'
)
INSERT INTO product_images (product_id, image_url, sort_order, is_primary)
SELECT inserted_product.id, '/uploads/2x-800g-bilberry-pomegranate.webp', 0, true
FROM inserted_product
WHERE NOT EXISTS (
  SELECT 1 FROM product_images WHERE product_id = inserted_product.id
);
