ALTER TABLE loyalty_rewards
DROP CONSTRAINT IF EXISTS loyalty_rewards_gift_product_id_fkey;

ALTER TABLE loyalty_rewards
ADD CONSTRAINT loyalty_rewards_gift_product_id_fkey
FOREIGN KEY (gift_product_id) REFERENCES products(id) ON DELETE RESTRICT;
