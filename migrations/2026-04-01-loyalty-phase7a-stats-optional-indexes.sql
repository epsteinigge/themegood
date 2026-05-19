-- Optional indexes for faster loyalty stats/reporting aggregation.
CREATE INDEX IF NOT EXISTS idx_loyalty_txn_type_created_at
ON loyalty_points_transactions(type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_users_loyalty_points_desc
ON users(loyalty_points DESC);