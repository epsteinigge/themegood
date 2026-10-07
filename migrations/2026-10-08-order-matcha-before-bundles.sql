BEGIN;

-- Make room after Cocoa so Matcha does not tie with the first bundle.
DO $$
DECLARE
  matcha_id INTEGER;
  next_sort INTEGER;
  next_featured INTEGER;
BEGIN
  SELECT id INTO matcha_id FROM products WHERE LOWER(name) = 'matcha soy collagen';
  SELECT COALESCE(sort_order, 0) + 1, COALESCE(featured_order, 0) + 1
  INTO next_sort, next_featured
  FROM products WHERE LOWER(name) = 'cocoa multigrain';

  IF matcha_id IS NULL OR next_sort IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM products WHERE id <> matcha_id AND sort_order = next_sort) THEN
    UPDATE products SET sort_order = sort_order + 1
    WHERE id <> matcha_id AND sort_order >= next_sort;
  END IF;

  IF EXISTS (SELECT 1 FROM products WHERE id <> matcha_id AND featured_order = next_featured) THEN
    UPDATE products SET featured_order = featured_order + 1
    WHERE id <> matcha_id AND featured_order >= next_featured;
  END IF;

  UPDATE products SET sort_order = next_sort, featured_order = next_featured
  WHERE id = matcha_id;
END $$;

COMMIT;
