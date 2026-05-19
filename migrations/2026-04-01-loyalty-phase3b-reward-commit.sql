ALTER TABLE orders
ADD COLUMN IF NOT EXISTS loyalty_reward_id INTEGER NULL;

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS loyalty_reward_type VARCHAR(50) NULL;

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS loyalty_points_redeemed INTEGER NOT NULL DEFAULT 0;

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS loyalty_discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0;

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS loyalty_free_gift_product_id INTEGER NULL;

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS loyalty_redeemed_at TIMESTAMP NULL;

ALTER TABLE orders
DROP CONSTRAINT IF EXISTS orders_loyalty_reward_id_fkey;

ALTER TABLE orders
ADD CONSTRAINT orders_loyalty_reward_id_fkey
FOREIGN KEY (loyalty_reward_id) REFERENCES loyalty_rewards(id) ON DELETE SET NULL;

ALTER TABLE orders
DROP CONSTRAINT IF EXISTS orders_loyalty_free_gift_product_id_fkey;

ALTER TABLE orders
ADD CONSTRAINT orders_loyalty_free_gift_product_id_fkey
FOREIGN KEY (loyalty_free_gift_product_id) REFERENCES products(id) ON DELETE SET NULL;

ALTER TABLE orders
DROP CONSTRAINT IF EXISTS ck_orders_loyalty_points_nonnegative;

ALTER TABLE orders
ADD CONSTRAINT ck_orders_loyalty_points_nonnegative
CHECK (COALESCE(loyalty_points_redeemed, 0) >= 0);

CREATE INDEX IF NOT EXISTS idx_orders_loyalty_reward_id
ON orders(loyalty_reward_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_loyalty_txn_order_redeem_type
ON loyalty_points_transactions(order_id, type)
WHERE order_id IS NOT NULL AND type = 'redeem';