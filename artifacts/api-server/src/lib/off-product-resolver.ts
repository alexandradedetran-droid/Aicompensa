// @ts-nocheck
/**
 * Product Resolver — 8-step cascade pipeline.
 * Uses pool.query() directly (not Drizzle) to use pg_trgm % operator and tsvector @@.
 * Logs every resolution to product_resolution_logs.
 */

import { pool } from "@workspace/db";
import { normalizeText, normalizeForMatch, extractBrandHint } from "./off-normalize.js";

export type ConfidenceLabel = "exact" | "high" | "medium" | "low" | "not_found";
export type ResolutionStep =
  | "barcode" | "exact_name" | "fulltext" | "alias"
  | "fuzzy" | "brand_category" | "fallback" | "not_found";

export interface ResolverInput {
  rawName?: string;
  barcode?: string;
  marketId?: string;
  source?: "ocr" | "manual" | "receipt" | "flyer" | "list";
  sessionId?: string;
  userId?: string;
}

export interface ResolverResult {
  productId: string | null;
  canonicalName: string;
  brand: string | null;
  quantity: string | null;
  category: string | null;
  imageUrl: string | null;
  confidence: number;
  matchType: string;
  needsReview: boolean;
  // Internal fields (not sent to client)
  _confidenceLabel?: ConfidenceLabel;
  _step?: ResolutionStep;
  _similarity?: number;
}

const CONFIDENCE_SCORES: Record<ConfidenceLabel, number> = {
  exact:     1.00,
  high:      0.85,
  medium:    0.65,
  low:       0.35,
  not_found: 0.00,
};

function toResult(
  row: Record<string, unknown> | null,
  label: ConfidenceLabel,
  step: ResolutionStep,
  similarity?: number,
): ResolverResult {
  if (!row) {
    return {
      productId: null,
      canonicalName: "Produto não identificado",
      brand: null,
      quantity: null,
      category: null,
      imageUrl: null,
      confidence: 0,
      matchType: "not_found",
      needsReview: false,
      _confidenceLabel: "not_found",
      _step: "not_found",
    };
  }

  const confidence = CONFIDENCE_SCORES[label] ?? 0;
  return {
    productId:     (row.barcode as string) ?? null,
    canonicalName: (row.name as string) ?? "Produto",
    brand:         (row.brand as string) ?? null,
    quantity:      (row.quantity as string) ?? null,
    category:      (row.category as string) ?? null,
    imageUrl:      (row.image_url as string) ?? null,
    confidence,
    matchType:     step,
    needsReview:   confidence < 0.70 || step === "fuzzy" || step === "fallback",
    _confidenceLabel: label,
    _step: step,
    _similarity: similarity,
  };
}

/**
 * Resolves any product input (barcode / raw name) to a canonical product record.
 * Pipeline: barcode → exact_name → fulltext → alias → fuzzy → brand_category → fallback → not_found
 */
export async function resolveProduct(input: ResolverInput): Promise<ResolverResult> {
  const start = Date.now();
  let result: ResolverResult;

  try {
    result = await runPipeline(input);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // If tables don't exist yet, return not_found gracefully
    if (msg.includes("does not exist") || msg.includes("42P01")) {
      return {
        productId: null, canonicalName: "Produto não identificado", brand: null,
        quantity: null, category: null, imageUrl: null,
        confidence: 0, matchType: "not_found", needsReview: false,
        _step: "not_found",
      };
    }
    throw err;
  }

  const latencyMs = Date.now() - start;

  // Log asynchronously (non-blocking — don't await)
  logResolution(input, result, latencyMs).catch(() => {});

  return result;
}

async function runPipeline(input: ResolverInput): Promise<ResolverResult> {
  // ── [1] Barcode lookup ────────────────────────────────────────────────────
  if (input.barcode) {
    const { rows } = await pool.query<Record<string, unknown>>(
      `SELECT barcode, name, brand, quantity, category, image_url
       FROM off_products
       WHERE barcode = $1 AND is_deleted = FALSE
       LIMIT 1`,
      [input.barcode],
    );
    if (rows[0]) return toResult(rows[0], "exact", "barcode");
  }

  if (!input.rawName) {
    return toResult(null, "not_found", "not_found");
  }

  const raw = input.rawName.trim();
  const norm = normalizeForMatch(raw);
  const brandHint = extractBrandHint(raw);

  // ── [3] Exact normalized name match ──────────────────────────────────────
  {
    const { rows } = await pool.query<Record<string, unknown>>(
      `SELECT barcode, name, brand, quantity, category, image_url
       FROM off_products
       WHERE name_normalized = $1 AND is_deleted = FALSE
       LIMIT 1`,
      [normalizeText(raw)],
    );
    if (rows[0]) return toResult(rows[0], "high", "exact_name");
  }

  // ── [4] Full-text search (tsvector + Portuguese) ──────────────────────────
  {
    const { rows } = await pool.query<Record<string, unknown>>(
      `SELECT p.barcode, p.name, p.brand, p.quantity, p.category, p.image_url,
              ts_rank(p.name_tsv, query) AS rank
       FROM off_products p,
            plainto_tsquery('portuguese', $1) query
       WHERE p.name_tsv @@ query AND p.is_deleted = FALSE
       ORDER BY rank DESC
       LIMIT 5`,
      [raw],
    );
    const hit = rows[0];
    if (hit && (hit.rank as number) > 0.03) {
      return toResult(hit, "high", "fulltext", hit.rank as number);
    }
  }

  // ── [5] Alias lookup ──────────────────────────────────────────────────────
  {
    const { rows } = await pool.query<Record<string, unknown>>(
      `SELECT p.barcode, p.name, p.brand, p.quantity, p.category, p.image_url
       FROM off_products p
       JOIN off_product_aliases a ON a.barcode = p.barcode
       WHERE a.alias_normalized = $1 AND p.is_deleted = FALSE
       LIMIT 1`,
      [norm],
    );
    if (rows[0]) {
      // Increment usage_count async
      pool.query(
        `UPDATE off_product_aliases SET usage_count = usage_count + 1, last_used_at = NOW()
         WHERE alias_normalized = $1 AND barcode = $2`,
        [norm, rows[0].barcode],
      ).catch(() => {});
      return toResult(rows[0], "high", "alias");
    }
  }

  // ── [6] Trigram fuzzy match (pg_trgm) ────────────────────────────────────
  {
    const { rows } = await pool.query<Record<string, unknown>>(
      `SELECT barcode, name, brand, quantity, category, image_url,
              similarity(name_normalized, $1) AS sim
       FROM off_products
       WHERE name_normalized % $1 AND is_deleted = FALSE
       ORDER BY sim DESC
       LIMIT 5`,
      [norm],
    );
    const hit = rows[0];
    if (hit) {
      const sim = hit.sim as number;
      if (sim >= 0.6) return toResult(hit, "high",   "fuzzy", sim);
      if (sim >= 0.4) return toResult(hit, "medium", "fuzzy", sim);
    }
  }

  // ── [7] Brand + category filter ───────────────────────────────────────────
  if (brandHint) {
    const { rows } = await pool.query<Record<string, unknown>>(
      `SELECT barcode, name, brand, quantity, category, image_url
       FROM off_products
       WHERE brand_normalized ILIKE '%' || $1 || '%' AND is_deleted = FALSE
       LIMIT 1`,
      [normalizeText(brandHint)],
    );
    if (rows[0]) return toResult(rows[0], "medium", "brand_category");
  }

  // ── [8] Category fallback ─────────────────────────────────────────────────
  return {
    productId:     null,
    canonicalName: raw,
    brand:         null,
    quantity:      null,
    category:      null,
    imageUrl:      null,
    confidence:    CONFIDENCE_SCORES.low,
    matchType:     "fallback",
    needsReview:   true,
    _confidenceLabel: "low",
    _step:         "fallback",
  };
}

async function logResolution(
  input: ResolverInput,
  result: ResolverResult,
  latencyMs: number,
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO product_resolution_logs
         (input_text, input_barcode, input_brand_hint, resolved_barcode, resolved_name,
          confidence, resolution_step, similarity_score, latency_ms, session_id, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        input.rawName ?? null,
        input.barcode ?? null,
        null,
        result.productId ?? null,
        result.canonicalName,
        result._confidenceLabel ?? "not_found",
        result._step ?? "not_found",
        result._similarity ? Math.round(result._similarity * 100) : null,
        latencyMs,
        input.sessionId ?? null,
        input.userId ?? null,
      ],
    );
  } catch {
    // Logging failure must not affect resolver response
  }
}
