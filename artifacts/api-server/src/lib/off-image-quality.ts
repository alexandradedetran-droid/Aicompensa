// @ts-nocheck
/**
 * Image Quality Selector — Stage 1: Metadata Scoring (no download required).
 * Stage 2 (visual analysis) is deferred until `sharp` is added as a dependency.
 *
 * Score: 0–70 from metadata. Final score reaches 0–100 after Stage 2.
 * Status thresholds (metadata-only): ≥ 56 → auto_approved, < 56 → pending_review.
 */

export type ImageType = "front" | "ingredients" | "nutrition" | "packaging" | "other";
export type ImageStatus = "pending_review" | "approved" | "rejected" | "auto_approved";
export type RejectionReason =
  | "blurry" | "cropped" | "nutrition_table" | "ingredients_table"
  | "barcode_only" | "duplicate" | "low_resolution" | "wrong_product"
  | "poor_lighting" | "not_front_image";

export interface ImageCandidate {
  offImageKey: string;         // e.g. "front_pt"
  offImageUrl: string;         // full URL on OFF CDN
  offRevision: number;
  offUploadedT?: number;
  widthPx?: number;            // from OFF JSON sizes dict (if available)
}

export interface ScoredImage {
  candidate: ImageCandidate;
  imageType: ImageType;
  language: string | null;
  qualityScore: number;        // 0–70 (metadata), 0–100 (after Stage 2)
  qualityBreakdown: Record<string, number>;
  status: ImageStatus;
  rejectionReason: RejectionReason | null;
}

/** Parses OFF image key like "front_pt" → { type, language }. */
export function parseImageKey(key: string): { imageType: ImageType; language: string | null } {
  if (!key) return { imageType: "other", language: null };

  const parts = key.split("_");
  const typeRaw = parts[0];
  const lang = parts[1] ?? null;

  let imageType: ImageType = "other";
  if (typeRaw === "front")        imageType = "front";
  else if (typeRaw === "ingredients") imageType = "ingredients";
  else if (typeRaw === "nutrition")   imageType = "nutrition";
  else if (typeRaw === "packaging")   imageType = "packaging";
  // numeric keys ("1", "2", ...) → "other"

  return { imageType, language: lang };
}

/**
 * Builds the OFF CDN URL for a given product barcode + image spec.
 * Format: .../products/{b0-2}/{b3-5}/{b6-8}/{b9+}/{key}.{rev}.{size}.jpg
 */
export function buildOffImageUrl(
  barcode: string,
  imageKey: string,
  revision: number,
  sizePx: number = 400,
): string {
  const b = barcode.padStart(13, "0");
  const path = `${b.slice(0, 3)}/${b.slice(3, 6)}/${b.slice(6, 9)}/${b.slice(9)}`;
  return `https://images.openfoodfacts.org/images/products/${path}/${imageKey}.${revision}.${sizePx}.jpg`;
}

/**
 * Stage 1: scores an image candidate using only OFF metadata.
 * Maximum possible score: 70. (Stage 2 adds up to 30 more after download.)
 */
export function scoreImageMetadata(candidate: ImageCandidate): ScoredImage {
  const { imageType, language } = parseImageKey(candidate.offImageKey);
  const breakdown: Record<string, number> = {};

  // ── Type score (max 35) ───────────────────────────────────────────────────
  const typeScores: Record<ImageType, number> = {
    front:       35,
    packaging:   20,
    ingredients: 10,
    nutrition:    5,
    other:        0,
  };
  const typeScore = typeScores[imageType];
  breakdown.type = typeScore;

  // ── Language score (max 15) ───────────────────────────────────────────────
  const langScore = language === "pt" ? 15 : language === "es" ? 8 : language ? 5 : 2;
  breakdown.language = langScore;

  // ── Revision score (max 10) ───────────────────────────────────────────────
  const rev = candidate.offRevision ?? 0;
  const revScore = rev > 20 ? 10 : rev > 10 ? 7 : rev > 4 ? 5 : rev > 0 ? 3 : 0;
  breakdown.revision = revScore;

  // ── Dimension score (max 7) ───────────────────────────────────────────────
  const w = candidate.widthPx;
  const dimScore = !w ? 4 : w >= 350 ? 7 : w >= 200 ? 4 : w >= 100 ? 2 : 0;
  breakdown.dimensions = dimScore;

  // ── Selected image bonus (max 3) ──────────────────────────────────────────
  // We treat every candidate passed to this function as "selected" since
  // we only score images that appeared in selected_images dict.
  breakdown.selected = 3;

  const qualityScore = typeScore + langScore + revScore + dimScore + 3;

  // ── Auto-approval threshold (metadata only, max 70) ───────────────────────
  // front+pt at revision > 4 with dimensions → 35+15+5+7+3 = 65 → auto_approved
  // front (unknown lang) at any revision     → 35+2+... ≥ 40 → pending_review
  const AUTO_THRESHOLD = 56; // ~80% of max metadata score
  const status: ImageStatus = qualityScore >= AUTO_THRESHOLD ? "auto_approved" : "pending_review";

  return {
    candidate,
    imageType,
    language,
    qualityScore,
    qualityBreakdown: breakdown,
    status,
    rejectionReason: null,
  };
}

/**
 * Given a list of image candidates for a product, scores all and returns
 * the best one (highest quality_score, tiebreak: higher revision).
 */
export function selectBestImage(candidates: ImageCandidate[]): ScoredImage | null {
  if (!candidates.length) return null;

  const scored = candidates.map((c) => scoreImageMetadata(c));

  scored.sort((a, b) => {
    if (b.qualityScore !== a.qualityScore) return b.qualityScore - a.qualityScore;
    return (b.candidate.offRevision ?? 0) - (a.candidate.offRevision ?? 0);
  });

  return scored[0] ?? null;
}

/**
 * Converts an OFF `selected_images` dict (from JSONL or API response) into
 * a flat array of ImageCandidates ready for scoring.
 *
 * selected_images format:
 * {
 *   "front_pt": { imgid: "1", rev: "18", sizes: { "400": { w: 400, h: 400 } } },
 *   ...
 * }
 */
export function extractCandidatesFromSelectedImages(
  barcode: string,
  selectedImages: Record<string, unknown> | null | undefined,
  imageFrontUrl?: string | null,
): ImageCandidate[] {
  const candidates: ImageCandidate[] = [];

  if (selectedImages && typeof selectedImages === "object") {
    for (const [key, val] of Object.entries(selectedImages)) {
      if (!val || typeof val !== "object") continue;
      const v = val as Record<string, unknown>;
      const rev = parseInt(String(v.rev ?? "0"), 10);
      const sizes = v.sizes as Record<string, { w?: number; h?: number }> | undefined;
      const widthPx = sizes?.["400"]?.w ?? sizes?.["200"]?.w ?? undefined;
      const offImageUrl = buildOffImageUrl(barcode, key, rev, 400);

      candidates.push({
        offImageKey: key,
        offImageUrl,
        offRevision: rev,
        offUploadedT: v.uploaded_t ? Number(v.uploaded_t) : undefined,
        widthPx,
      });
    }
  } else if (imageFrontUrl) {
    // Fallback: use image_front_url if selected_images is not available
    const revMatch = imageFrontUrl.match(/\.(\d+)\.400\.jpg$/);
    const rev = revMatch ? parseInt(revMatch[1], 10) : 1;
    candidates.push({
      offImageKey: "front_pt",
      offImageUrl: imageFrontUrl,
      offRevision: rev,
      widthPx: 400,
    });
  }

  return candidates;
}
