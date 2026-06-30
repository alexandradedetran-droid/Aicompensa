-- Ensures off_image_url is unique across the table.
-- Run _dedup-images.mjs first if duplicates exist.
CREATE UNIQUE INDEX IF NOT EXISTS off_images_url_unique
  ON off_product_images (off_image_url);
