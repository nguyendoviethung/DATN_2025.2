-- ==============================
-- MIGRATION: Add last_renewed_at to borrows table
-- Note: renew_count and renew_limit already exist in schema.sql
-- ==============================

-- Add last_renewed_at column if not exists
ALTER TABLE borrows
  ADD COLUMN IF NOT EXISTS last_renewed_at TIMESTAMP DEFAULT NULL;

-- Ensure renew_count default is correct (already exists)
-- ALTER TABLE borrows ALTER COLUMN renew_count SET DEFAULT 0;
-- ALTER TABLE borrows ALTER COLUMN renew_limit SET DEFAULT 2;

COMMENT ON COLUMN borrows.renew_count      IS 'Number of times this borrow has been renewed';
COMMENT ON COLUMN borrows.renew_limit      IS 'Maximum renewals allowed for this borrow (default 2)';
COMMENT ON COLUMN borrows.last_renewed_at  IS 'Timestamp of most recent renewal';

-- Index to speed up reader renewal eligibility checks
CREATE INDEX IF NOT EXISTS idx_borrows_renew
  ON borrows(user_id, status, due_date)
  WHERE status = 'borrowing';