// @ts-nocheck
/**
 * Bootstrap the Product Resolver schema on startup.
 * Runs CREATE TABLE IF NOT EXISTS (idempotent) for all four Product Resolver tables.
 * The full migration (extensions + GENERATED columns + GIN indexes + triggers) is in
 * lib/db/migrations/add_product_resolver.sql — that must be run once by a DB admin.
 *
 * This bootstrap only creates the tables if they do not exist, so it is safe to
 * call on every startup. It is intentionally a subset of the full migration.
 */

import { pool } from "@workspace/db";
import { logger } from "./logger.js";

export async function ensureOffProductsSchema(): Promise<void> {
  try {
    // Check if the tables already exist (fast path)
    const { rows } = await pool.query(`
      SELECT COUNT(*) AS cnt FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (
          'off_products', 'off_product_aliases',
          'off_product_images', 'product_resolution_logs'
        )
    `);
    const existingCount = parseInt(rows[0]?.cnt ?? "0", 10);
    if (existingCount === 4) {
      logger.info("[off-bootstrap] Product Resolver tables already exist — skipping bootstrap");
      return;
    }

    logger.info("[off-bootstrap] Creating Product Resolver tables...");

    // Install extensions (safe to run even if already installed)
    await pool.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`).catch(() => {
      logger.warn("[off-bootstrap] pg_trgm extension not available — fuzzy search disabled");
    });
    await pool.query(`CREATE EXTENSION IF NOT EXISTS unaccent`).catch(() => {
      logger.warn("[off-bootstrap] unaccent extension not available — accent normalization limited");
    });

    // normalize_text helper (needed for GENERATED columns below)
    await pool.query(`
      CREATE OR REPLACE FUNCTION normalize_text(t TEXT) RETURNS TEXT AS $$
        SELECT lower(regexp_replace(unaccent(trim(t)), '\\s+', ' ', 'g'))
      $$ LANGUAGE SQL IMMUTABLE
    `).catch(() => {
      // unaccent not available — use simpler fallback
      return pool.query(`
        CREATE OR REPLACE FUNCTION normalize_text(t TEXT) RETURNS TEXT AS $$
          SELECT lower(regexp_replace(trim(t), '\\s+', ' ', 'g'))
        $$ LANGUAGE SQL IMMUTABLE
      `);
    });

    // off_set_updated_at trigger function
    await pool.query(`
      CREATE OR REPLACE FUNCTION off_set_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    // off_products_tsv_update trigger function
    await pool.query(`
      CREATE OR REPLACE FUNCTION off_products_tsv_update()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.name_tsv = to_tsvector(
          'portuguese',
          COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.brand, '')
        );
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    // off_products
    await pool.query(`
      CREATE TABLE IF NOT EXISTS off_products (
        barcode              TEXT PRIMARY KEY,
        off_code             TEXT,
        name                 TEXT NOT NULL,
        name_normalized      TEXT GENERATED ALWAYS AS (normalize_text(name)) STORED,
        name_tsv             TSVECTOR,
        brand                TEXT,
        brand_normalized     TEXT GENERATED ALWAYS AS (normalize_text(COALESCE(brand, ''))) STORED,
        quantity             TEXT,
        quantity_g           FLOAT,
        category             TEXT,
        categories           TEXT[],
        primary_image_id     INT,
        image_url            TEXT,
        image_thumb_url      TEXT,
        off_last_modified    BIGINT,
        off_updated_at       TIMESTAMPTZ,
        is_deleted           BOOLEAN NOT NULL DEFAULT FALSE,
        data_quality_score   SMALLINT DEFAULT 0,
        has_image            BOOLEAN NOT NULL DEFAULT FALSE,
        source               TEXT NOT NULL DEFAULT 'off',
        created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // off_product_aliases
    await pool.query(`
      CREATE TABLE IF NOT EXISTS off_product_aliases (
        id               SERIAL PRIMARY KEY,
        alias            TEXT NOT NULL,
        alias_normalized TEXT GENERATED ALWAYS AS (normalize_text(alias)) STORED,
        barcode          TEXT REFERENCES off_products(barcode) ON DELETE SET NULL,
        alias_type       TEXT NOT NULL,
        confidence       TEXT NOT NULL DEFAULT 'high',
        usage_count      INT NOT NULL DEFAULT 0,
        last_used_at     TIMESTAMPTZ,
        created_by       TEXT NOT NULL DEFAULT 'system',
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // off_product_images
    await pool.query(`
      CREATE TABLE IF NOT EXISTS off_product_images (
        id                   SERIAL PRIMARY KEY,
        barcode              TEXT NOT NULL REFERENCES off_products(barcode) ON DELETE CASCADE,
        off_image_key        TEXT,
        off_image_url        TEXT NOT NULL,
        off_imgid            TEXT,
        off_revision         INT,
        off_uploaded_t       BIGINT,
        r2_key               TEXT,
        r2_url               TEXT,
        image_type           TEXT NOT NULL DEFAULT 'other',
        language             TEXT,
        width_px             INT,
        height_px            INT,
        file_size_bytes      INT,
        quality_score        SMALLINT,
        quality_breakdown    JSONB,
        status               TEXT NOT NULL DEFAULT 'pending_review',
        rejection_reason     TEXT,
        reviewed_by          TEXT,
        reviewed_at          TIMESTAMPTZ,
        review_notes         TEXT,
        is_primary           BOOLEAN NOT NULL DEFAULT FALSE,
        is_mirrored          BOOLEAN NOT NULL DEFAULT FALSE,
        source               TEXT NOT NULL DEFAULT 'off',
        created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // product_resolution_logs
    await pool.query(`
      CREATE TABLE IF NOT EXISTS product_resolution_logs (
        id                   BIGSERIAL PRIMARY KEY,
        input_text           TEXT,
        input_barcode        TEXT,
        input_brand_hint     TEXT,
        input_category_hint  TEXT,
        resolved_barcode     TEXT,
        resolved_name        TEXT,
        confidence           TEXT,
        resolution_step      TEXT,
        similarity_score     FLOAT,
        latency_ms           INT,
        session_id           TEXT,
        user_id              TEXT,
        feedback             TEXT,
        feedback_barcode     TEXT,
        feedback_at          TIMESTAMPTZ,
        created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Basic indexes (GIN trigram indexes require pg_trgm — done in full migration)
    await pool.query(`
      CREATE INDEX IF NOT EXISTS off_products_category_idx ON off_products (category) WHERE category IS NOT NULL
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS off_aliases_barcode_idx ON off_product_aliases (barcode)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS off_images_barcode_idx ON off_product_images (barcode)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS resolution_logs_created_idx ON product_resolution_logs (created_at DESC)
    `);

    // Triggers
    await pool.query(`
      DROP TRIGGER IF EXISTS off_products_tsv_trigger ON off_products;
      CREATE TRIGGER off_products_tsv_trigger
        BEFORE INSERT OR UPDATE ON off_products
        FOR EACH ROW EXECUTE FUNCTION off_products_tsv_update()
    `);
    await pool.query(`
      DROP TRIGGER IF EXISTS off_products_updated_at ON off_products;
      CREATE TRIGGER off_products_updated_at
        BEFORE UPDATE ON off_products
        FOR EACH ROW EXECUTE FUNCTION off_set_updated_at()
    `);
    await pool.query(`
      DROP TRIGGER IF EXISTS off_product_images_updated_at ON off_product_images;
      CREATE TRIGGER off_product_images_updated_at
        BEFORE UPDATE ON off_product_images
        FOR EACH ROW EXECUTE FUNCTION off_set_updated_at()
    `);

    logger.info("[off-bootstrap] Product Resolver tables created successfully");
  } catch (err) {
    logger.error({ err }, "[off-bootstrap] Failed to create Product Resolver tables");
    // Non-fatal: server continues, resolver returns not_found until tables exist
  }
}
