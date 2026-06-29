-- Sprint 19.5: prevent duplicate referral records for the same invited user.
-- Guarantees idempotency: if registration is retried, the second insert is a no-op.

-- 1. Keep only the earliest record per invited_user_id (in case duplicates already exist).
DELETE FROM referrals
WHERE id NOT IN (
  SELECT MIN(id) FROM referrals GROUP BY invited_user_id
);

-- 2. Add unique constraint.
ALTER TABLE referrals
  ADD CONSTRAINT referrals_invited_user_id_unique UNIQUE (invited_user_id);
