ALTER TABLE orders
ADD COLUMN IF NOT EXISTS loyalty_earn_reversed_at TIMESTAMP NULL;

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS loyalty_redeem_restored_at TIMESTAMP NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_loyalty_txn_order_earn_reversal_type
ON loyalty_points_transactions(order_id, type)
WHERE order_id IS NOT NULL AND type = 'earn_reversal';

CREATE UNIQUE INDEX IF NOT EXISTS ux_loyalty_txn_order_redeem_restore_type
ON loyalty_points_transactions(order_id, type)
WHERE order_id IS NOT NULL AND type = 'redeem_restore';