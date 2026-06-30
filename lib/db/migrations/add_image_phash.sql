-- Migration: Image pHash column
-- 2026-06-20 — AíCompensa
-- Adds perceptual hash column to off_product_images for duplicate detection.
-- Safe to re-run (IF NOT EXISTS / IF NOT EXISTS on index).

ALTER TABLE off_product_images
  ADD COLUMN IF NOT EXISTS phash TEXT;

-- Index used by duplicate-detector clustering queries
CREATE INDEX IF NOT EXISTS off_images_phash_idx
  ON off_product_images (phash)
  WHERE phash IS NOT NULL;

-- Tag images that still need pHash computation so we can queue them
CREATE INDEX IF NOT EXISTS off_images_needs_phash_idx
  ON off_product_images (id)
  WHERE phash IS NULL AND status != 'rejected';
