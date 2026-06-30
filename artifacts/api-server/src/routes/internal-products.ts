// @ts-nocheck
import { Router, type Request, type Response } from "express";
import { resolveProduct } from "../lib/off-product-resolver.js";
import { imageResolver } from "../lib/image-resolver/image-resolver-service.js";
import type { ImageCandidate } from "../lib/image-resolver/types.js";
import { logger } from "../lib/logger.js";

const router = Router();

const INTERNAL_API_KEY = process.env["INTERNAL_API_KEY"];
const IS_PROD = process.env["NODE_ENV"] === "production";

/**
 * Guards the internal endpoints.
 * In production: requires x-internal-key header matching INTERNAL_API_KEY.
 * In development: allows all requests (INTERNAL_API_KEY not required).
 */
function requireInternalKey(req: Request, res: Response, next: () => void): void {
  if (!IS_PROD && !INTERNAL_API_KEY) {
    next();
    return;
  }
  const key = req.headers["x-internal-key"];
  if (!INTERNAL_API_KEY || key !== INTERNAL_API_KEY) {
    res.status(401).json({ error: "Acesso não autorizado." });
    return;
  }
  next();
}

// ── POST /api/internal/products/resolve ───────────────────────────────────────
/**
 * Resolves a product name or barcode to a canonical product record.
 *
 * Body:
 *   rawName?: string        — free-text product name (OCR, manual, etc.)
 *   barcode?: string        — EAN-13 / EAN-8
 *   marketId?: string       — (unused in MVP, reserved for market-specific catalog)
 *   source?: "ocr" | "manual" | "receipt" | "flyer" | "list"
 *
 * Response:
 *   productId: string | null
 *   canonicalName: string
 *   brand: string | null
 *   quantity: string | null
 *   category: string | null
 *   imageUrl: string | null
 *   confidence: number       — 0.0 to 1.0
 *   matchType: string        — which step resolved it
 *   needsReview: boolean     — true if confidence < 0.70 or step is fuzzy/fallback
 */
router.post("/internal/products/resolve", requireInternalKey, async (req: Request, res: Response) => {
  const { rawName, barcode, marketId, source } = req.body ?? {};

  if (!rawName && !barcode) {
    return res.status(400).json({ error: "Informe rawName ou barcode." });
  }

  const sessionId = req.headers["x-session-id"] as string | undefined;
  const userId    = req.session?.userId ? String(req.session.userId) : undefined;

  try {
    const result = await resolveProduct({
      rawName: typeof rawName === "string" ? rawName.trim() : undefined,
      barcode: typeof barcode === "string" ? barcode.trim() : undefined,
      marketId,
      source,
      sessionId,
      userId,
    });

    // Strip internal fields before sending to client
    const { _confidenceLabel, _step, _similarity, ...clientResult } = result;

    res.json(clientResult);
  } catch (err) {
    logger.error({ err }, "POST /internal/products/resolve failed");
    res.status(500).json({ error: "Erro ao resolver produto." });
  }
});

// ── POST /api/internal/images/resolve ────────────────────────────────────────
/**
 * Runs the full Image Resolver pipeline for a set of candidate images.
 * Used for testing the pipeline without triggering a full product import.
 *
 * Body:
 *   barcode:        string
 *   candidates:     ImageCandidate[]
 *   computePhashes: boolean  (default false — enables image download + pHash)
 *
 * Response: ImageResolverOutput
 */
router.post("/internal/images/resolve", requireInternalKey, async (req: Request, res: Response) => {
  const { barcode, candidates, computePhashes = false, phashConcurrency = 3 } = req.body ?? {};

  if (!barcode || typeof barcode !== "string") {
    return res.status(400).json({ error: "Informe barcode." });
  }
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return res.status(400).json({ error: "Informe ao menos um candidate." });
  }

  // Coerce and validate candidates minimally
  const typed: ImageCandidate[] = (candidates as any[]).map((c, i) => ({
    id:             c.id,
    url:            String(c.url ?? ""),
    barcode:        String(c.barcode ?? barcode),
    imageType:      c.imageType ?? "other",
    language:       c.language ?? null,
    revisionNumber: typeof c.revisionNumber === "number" ? c.revisionNumber : undefined,
    widthPx:        typeof c.widthPx === "number" ? c.widthPx : undefined,
    heightPx:       typeof c.heightPx === "number" ? c.heightPx : undefined,
    fileSizeBytes:  typeof c.fileSizeBytes === "number" ? c.fileSizeBytes : undefined,
    source:         c.source ?? "unknown",
    phash:          c.phash ?? undefined,
    catalogSource:  c.catalogSource ?? undefined,
    imageStatus:    c.imageStatus ?? undefined,
  }));

  try {
    const output = await imageResolver.resolve(barcode, typed, {
      computePhashes:   Boolean(computePhashes),
      phashConcurrency: typeof phashConcurrency === "number" ? phashConcurrency : 3,
    });
    res.json(output);
  } catch (err) {
    logger.error({ err }, "POST /internal/images/resolve failed");
    res.status(500).json({ error: "Erro ao resolver imagens." });
  }
});

export default router;
