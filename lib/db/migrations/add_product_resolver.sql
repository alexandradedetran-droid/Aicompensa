-- Migration: Product Resolver Foundation
-- 2026-06-20 — AíCompensa
-- Creates: off_products, off_product_aliases, off_product_images, product_resolution_logs
-- Run once against the target PostgreSQL database (Railway or local).

-- ── Extensions ─────────────────────────────────────────────────────────────────
-- Both require superuser or the extension must be pre-installed by the DB provider.
-- Railway PostgreSQL and Supabase have both pre-installed.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- ── Helper functions ───────────────────────────────────────────────────────────

-- normalize_text: lowercase + strip accents + collapse whitespace
-- Used by GENERATED ALWAYS AS columns in off_products and off_product_aliases.
CREATE OR REPLACE FUNCTION normalize_text(t TEXT) RETURNS TEXT AS $$
  SELECT lower(regexp_replace(unaccent(trim(t)), '\s+', ' ', 'g'))
$$ LANGUAGE SQL IMMUTABLE;

-- extract_quantity_g: "350g" → 350.0 · "1 kg" → 1000.0 · "500 mL" → 500.0
-- Returns NULL if format is not recognised.
CREATE OR REPLACE FUNCTION extract_quantity_g(quantity_text TEXT) RETURNS FLOAT AS $$
DECLARE
  m    TEXT[];
  num  FLOAT;
  unit TEXT;
BEGIN
  m := regexp_match(lower(quantity_text), '(\d+[,.]?\d*)\s*(g|kg|ml|l|cl|oz|lb)');
  IF m IS NULL THEN RETURN NULL; END IF;
  num  := replace(m[1], ',', '.')::float;
  unit := m[2];
  RETURN CASE
    WHEN unit = 'kg' THEN num * 1000
    WHEN unit = 'l'  THEN num * 1000
    WHEN unit = 'cl' THEN num * 10
    WHEN unit = 'oz' THEN num * 28.35
    WHEN unit = 'lb' THEN num * 453.6
    ELSE num
  END;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- off_set_updated_at: trigger function to keep updated_at current.
CREATE OR REPLACE FUNCTION off_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- off_products_tsv_update: trigger function to keep name_tsv current.
CREATE OR REPLACE FUNCTION off_products_tsv_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.name_tsv = to_tsvector(
    'portuguese',
    COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.brand, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── Table: off_products ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS off_products (
  -- Primary key: EAN-13 / EAN-8 barcode
  barcode              TEXT PRIMARY KEY,
  off_code             TEXT,

  -- Product data
  name                 TEXT NOT NULL,
  name_normalized      TEXT GENERATED ALWAYS AS (normalize_text(name)) STORED,
  name_tsv             TSVECTOR,
  brand                TEXT,
  brand_normalized     TEXT GENERATED ALWAYS AS (normalize_text(COALESCE(brand, ''))) STORED,
  quantity             TEXT,
  quantity_g           FLOAT,
  category             TEXT,
  categories           TEXT[],

  -- Primary image (FK set after image review)
  primary_image_id     INT,
  image_url            TEXT,
  image_thumb_url      TEXT,

  -- OFF sync metadata
  off_last_modified    BIGINT,
  off_updated_at       TIMESTAMPTZ,
  is_deleted           BOOLEAN NOT NULL DEFAULT FALSE,

  -- Data quality
  data_quality_score   SMALLINT DEFAULT 0,
  has_image            BOOLEAN NOT NULL DEFAULT FALSE,
  source               TEXT NOT NULL DEFAULT 'off',

  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Table: off_product_aliases ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS off_product_aliases (
  id               SERIAL PRIMARY KEY,
  alias            TEXT NOT NULL,
  alias_normalized TEXT GENERATED ALWAYS AS (normalize_text(alias)) STORED,
  barcode          TEXT REFERENCES off_products(barcode) ON DELETE SET NULL,
  alias_type       TEXT NOT NULL CHECK (alias_type IN (
    'brand_name', 'common_name', 'abbreviation', 'regional', 'ocr_variant', 'typo', 'learned'
  )),
  confidence       TEXT NOT NULL DEFAULT 'high' CHECK (confidence IN ('high', 'medium', 'low')),
  usage_count      INT NOT NULL DEFAULT 0,
  last_used_at     TIMESTAMPTZ,
  created_by       TEXT NOT NULL DEFAULT 'system',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Table: off_product_images ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS off_product_images (
  id                   SERIAL PRIMARY KEY,
  barcode              TEXT NOT NULL REFERENCES off_products(barcode) ON DELETE CASCADE,

  -- OFF origin
  off_image_key        TEXT,
  off_image_url        TEXT NOT NULL,
  off_imgid            TEXT,
  off_revision         INT,
  off_uploaded_t       BIGINT,

  -- Our storage (Cloudflare R2 or Supabase)
  r2_key               TEXT,
  r2_url               TEXT,

  -- Classification
  image_type           TEXT NOT NULL DEFAULT 'other' CHECK (image_type IN (
    'front', 'ingredients', 'nutrition', 'packaging', 'other'
  )),
  language             TEXT,

  -- Dimensions (filled after download)
  width_px             INT,
  height_px            INT,
  file_size_bytes      INT,

  -- Quality scoring
  quality_score        SMALLINT CHECK (quality_score BETWEEN 0 AND 100),
  quality_breakdown    JSONB,

  -- Review status
  status               TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN (
    'pending_review', 'approved', 'rejected', 'auto_approved'
  )),
  rejection_reason     TEXT CHECK (rejection_reason IN (
    'blurry', 'cropped', 'nutrition_table', 'ingredients_table',
    'barcode_only', 'duplicate', 'low_resolution', 'wrong_product',
    'poor_lighting', 'not_front_image'
  )),

  -- Human review
  reviewed_by          TEXT,
  reviewed_at          TIMESTAMPTZ,
  review_notes         TEXT,

  -- Flags
  is_primary           BOOLEAN NOT NULL DEFAULT FALSE,
  is_mirrored          BOOLEAN NOT NULL DEFAULT FALSE,
  source               TEXT NOT NULL DEFAULT 'off' CHECK (source IN (
    'off', 'user_upload', 'scraper'
  )),

  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Table: product_resolution_logs ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_resolution_logs (
  id                   BIGSERIAL PRIMARY KEY,
  input_text           TEXT,
  input_barcode        TEXT,
  input_brand_hint     TEXT,
  input_category_hint  TEXT,
  resolved_barcode     TEXT,
  resolved_name        TEXT,
  confidence           TEXT CHECK (confidence IN ('exact', 'high', 'medium', 'low', 'not_found')),
  resolution_step      TEXT CHECK (resolution_step IN (
    'barcode', 'exact_name', 'fulltext', 'alias', 'fuzzy',
    'brand_category', 'fallback', 'not_found'
  )),
  similarity_score     FLOAT,
  latency_ms           INT,
  session_id           TEXT,
  user_id              TEXT,
  feedback             TEXT CHECK (feedback IN ('correct', 'incorrect', 'ignored')),
  feedback_barcode     TEXT,
  feedback_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes: off_products ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS off_products_name_trgm
  ON off_products USING GIN (name_normalized gin_trgm_ops);

CREATE INDEX IF NOT EXISTS off_products_name_tsv
  ON off_products USING GIN (name_tsv);

CREATE INDEX IF NOT EXISTS off_products_brand
  ON off_products (brand_normalized)
  WHERE brand_normalized <> '';

CREATE INDEX IF NOT EXISTS off_products_category
  ON off_products (category)
  WHERE category IS NOT NULL;

CREATE INDEX IF NOT EXISTS off_products_has_image
  ON off_products (has_image)
  WHERE has_image = TRUE;

-- ── Indexes: off_product_aliases ───────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS off_aliases_normalized_barcode
  ON off_product_aliases (alias_normalized, COALESCE(barcode, ''));

CREATE INDEX IF NOT EXISTS off_aliases_barcode
  ON off_product_aliases (barcode);

-- ── Indexes: off_product_images ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS off_images_barcode
  ON off_product_images (barcode);

CREATE INDEX IF NOT EXISTS off_images_status
  ON off_product_images (status);

CREATE INDEX IF NOT EXISTS off_images_primary
  ON off_product_images (barcode)
  WHERE is_primary = TRUE;

CREATE INDEX IF NOT EXISTS off_images_score
  ON off_product_images (quality_score DESC)
  WHERE status <> 'rejected';

-- ── Indexes: product_resolution_logs ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS resolution_logs_created
  ON product_resolution_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS resolution_logs_step
  ON product_resolution_logs (resolution_step);

CREATE INDEX IF NOT EXISTS resolution_logs_not_found
  ON product_resolution_logs (input_text)
  WHERE resolution_step = 'not_found';

-- ── Triggers: off_products ─────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS off_products_tsv_trigger ON off_products;
CREATE TRIGGER off_products_tsv_trigger
  BEFORE INSERT OR UPDATE ON off_products
  FOR EACH ROW EXECUTE FUNCTION off_products_tsv_update();

DROP TRIGGER IF EXISTS off_products_updated_at ON off_products;
CREATE TRIGGER off_products_updated_at
  BEFORE UPDATE ON off_products
  FOR EACH ROW EXECUTE FUNCTION off_set_updated_at();

-- ── Triggers: off_product_images ───────────────────────────────────────────────
DROP TRIGGER IF EXISTS off_product_images_updated_at ON off_product_images;
CREATE TRIGGER off_product_images_updated_at
  BEFORE UPDATE ON off_product_images
  FOR EACH ROW EXECUTE FUNCTION off_set_updated_at();
