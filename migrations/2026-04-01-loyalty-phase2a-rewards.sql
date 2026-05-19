CREATE TABLE IF NOT EXISTS loyalty_rewards (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  reward_type VARCHAR(50) NOT NULL CHECK (reward_type IN ('fixed_discount', 'free_gift')),
  points_required INT NOT NULL CHECK (points_required > 0),
  discount_value NUMERIC(10,2) NULL,
  gift_product_id INT NULL REFERENCES products(id) ON DELETE RESTRICT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_loyalty_rewards_value_combo CHECK (
    (reward_type = 'fixed_discount' AND discount_value IS NOT NULL AND discount_value > 0 AND gift_product_id IS NULL)
    OR
    (reward_type = 'free_gift' AND gift_product_id IS NOT NULL AND discount_value IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_loyalty_rewards_active_sort
  ON loyalty_rewards(is_active, sort_order, points_required, id);

ALTER TABLE loyalty_rewards
DROP CONSTRAINT IF EXISTS loyalty_rewards_gift_product_id_fkey;

ALTER TABLE loyalty_rewards
ADD CONSTRAINT loyalty_rewards_gift_product_id_fkey
FOREIGN KEY (gift_product_id) REFERENCES products(id) ON DELETE RESTRICT;
