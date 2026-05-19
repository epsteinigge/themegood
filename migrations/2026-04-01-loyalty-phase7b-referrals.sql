BEGIN;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS referral_code VARCHAR(32);

ALTER TABLE users
ADD COLUMN IF NOT EXISTS referred_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS referral_applied_at TIMESTAMP NULL;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS referral_reward_granted_at TIMESTAMP NULL;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS referral_reward_reversed_at TIMESTAMP NULL;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS referral_reward_order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_users_referral_code_upper
ON users (UPPER(referral_code))
WHERE referral_code IS NOT NULL AND referral_code <> '';

UPDATE users
SET referral_code = CONCAT(
  'TG',
  UPPER(to_hex(id)),
  UPPER(SUBSTRING(md5(id::text), 1, 4))
)
WHERE referral_code IS NULL OR referral_code = '';

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS referral_bonus_granted_at TIMESTAMP NULL;

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS referral_bonus_reversed_at TIMESTAMP NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_loyalty_txn_order_referral_bonus_referrer_type
ON loyalty_points_transactions(order_id, type)
WHERE order_id IS NOT NULL AND type = 'referral_bonus_referrer';

CREATE UNIQUE INDEX IF NOT EXISTS ux_loyalty_txn_order_referral_bonus_referred_type
ON loyalty_points_transactions(order_id, type)
WHERE order_id IS NOT NULL AND type = 'referral_bonus_referred';

CREATE UNIQUE INDEX IF NOT EXISTS ux_loyalty_txn_order_referral_bonus_referrer_reversal_type
ON loyalty_points_transactions(order_id, type)
WHERE order_id IS NOT NULL AND type = 'referral_bonus_referrer_reversal';

CREATE UNIQUE INDEX IF NOT EXISTS ux_loyalty_txn_order_referral_bonus_referred_reversal_type
ON loyalty_points_transactions(order_id, type)
WHERE order_id IS NOT NULL AND type = 'referral_bonus_referred_reversal';

COMMIT;
