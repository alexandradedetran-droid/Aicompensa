-- Migration: Admin Image Upload Source
-- Sprint 4.2.3 — AíCompensa
-- Adds ADMIN_UPLOAD to image_source, adds phash column, updates catalog priority index.
-- Idempotent: safe to run multiple times.

-- ── 1. Expand image_source CHECK to include ADMIN_UPLOAD ─────────────────────

-- Drop the auto-named constraint so we can re-create it with the new value.
DO $$
DECLARE
  v_constraint TEXT;
BEGIN
  SELECT conname INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'off_product_images'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%image_source%';

  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE off_product_images DROP CONSTRAINT %I', v_constraint);
  END IF;
END $$;

-- Add the named constraint so future migrations can reference it by name.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'off_product_images'::regclass
      AND conname  = 'off_images_source_check'
  ) THEN
    ALTER TABLE off_product_images
      ADD CONSTRAINT off_images_source_check
      CHECK (image_source IN ('OFF','USER','ADMIN','ADMIN_UPLOAD','AI','BRAND','CATALOG'));
  END IF;
END $$;

-- ── 2. Add phash column (64-bit DCT perceptual hash, 16-char hex) ─────────────
ALTER TABLE off_product_images
  ADD COLUMN IF NOT EXISTS phash TEXT;

-- ── 3. Update catalog priority index to include ADMIN_UPLOAD ─────────────────
-- Must drop and recreate because partial-index WHERE clause cannot be altered.
DROP INDEX IF EXISTS off_images_official;

CREATE INDEX off_images_official
  ON off_product_images (barcode)
  WHERE image_source IN ('ADMIN', 'ADMIN_UPLOAD', 'CATALOG')
    AND image_status = 'selected';
