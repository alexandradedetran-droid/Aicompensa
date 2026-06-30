/**
 * Shared types for the Image Resolver pipeline.
 *
 * Pipeline order:
 *   RuleScoreEngine → DuplicateDetector → DecisionEngine → ImageResolverService
 */

// ── Candidate ──────────────────────────────────────────────────────────────────

export type ImageSource = "off" | "manual" | "user_upload" | "unknown";
export type ImageType   = "front" | "ingredients" | "nutrition" | "packaging" | "other";

/** How the final image was selected. */
export type SelectionMethod = "RULE" | "RULE_PHASH" | "AI" | "ADMIN" | "NONE";

/**
 * Catalog-level image source (stored in off_product_images.image_source).
 * Uppercase to distinguish from the pipeline-internal ImageSource type.
 */
export type CatalogImageSource = "OFF" | "USER" | "ADMIN" | "ADMIN_UPLOAD" | "AI" | "BRAND" | "CATALOG";

/**
 * Coarse lifecycle state of a candidate (stored in off_product_images.image_status).
 * candidate → selected | rejected | review
 */
export type ImageStatus = "candidate" | "selected" | "rejected" | "review";

/** All knowable facts about one candidate image. */
export interface ImageCandidate {
  /** DB id in off_product_images (undefined for in-memory candidates). */
  id?: string | number;
  url: string;
  barcode: string;
  imageType: ImageType;
  /** BCP-47 language tag or OFF lang suffix ("pt", "es", "en", …). */
  language?: string | null;
  /** OFF revision counter — higher means more community edits. */
  revisionNumber?: number;
  widthPx?: number;
  heightPx?: number;
  fileSizeBytes?: number;
  source: ImageSource;
  /** 16-char hex pHash. undefined = not yet computed; null = computed but unavailable. */
  phash?: string | null;
  /** DB-level catalog source (off_product_images.image_source). */
  catalogSource?: CatalogImageSource;
  /** DB-level lifecycle status (off_product_images.image_status). */
  imageStatus?: ImageStatus;
}

// ── Phase 1 — Rule Score Engine ───────────────────────────────────────────────

/** Optional visual analysis results. Populated after image download + analysis. */
export interface VisualAnalysis {
  /** 0–100 sharpness estimate. Low (<20) triggers blurry penalty. */
  blurScore?: number;
  hasWhiteBackground?: boolean;
  packageCentered?: boolean;
  isCropped?: boolean;
  hasWatermark?: boolean;
  hasMultipleProducts?: boolean;
  isPricetag?: boolean;
  isPlaceholder?: boolean;
  isShelfPhoto?: boolean;
  isLogoOnly?: boolean;
}

/** Input to RuleScoreEngine — metadata + optional visual data. */
export interface ImageAnalysis {
  candidate: ImageCandidate;
  /** Visual data. Omitted when image has not been downloaded yet. */
  visual?: VisualAnalysis;
}

/** Output of RuleScoreEngine for one candidate. */
export interface RuleScoreResult {
  /** 0–100 composite score. */
  score: number;
  /** Human-readable positive factors applied. */
  reasons: string[];
  /** Human-readable negative factors applied. */
  penalties: string[];
  /** True when score >= thresholds.minUsefulScore. */
  passed: boolean;
}

// ── Phase 2 — Duplicate Detector ─────────────────────────────────────────────

export type HammingBand = "duplicate" | "near_identical" | "possible_variation" | "different";

export interface HashComparison {
  a: ImageCandidate;
  b: ImageCandidate;
  hammingDistance: number;
  band: HammingBand;
}

/** A cluster of visually similar images. Representative is the highest-scored member. */
export interface DedupCluster {
  representative: ImageCandidate;
  /** All other members that were merged into this cluster. */
  duplicates: ImageCandidate[];
}

// ── Phase 3 — Decision Engine ─────────────────────────────────────────────────

/** Final decision for a product's image selection. */
export interface DecisionResult {
  /** The winning candidate, or null when no candidate passed the minimum threshold. */
  selected: ImageCandidate | null;
  /** True → hand off to AI visual verification step. */
  aiRequired: boolean;
  /** True → route to human review queue. */
  reviewRequired: boolean;
  /** Explains why this decision was made. */
  reason: string;
  topScore: number;
  secondScore: number | null;
  /** topScore − secondScore, null when only one candidate exists. */
  scoreDelta: number | null;
}

// ── Service output ────────────────────────────────────────────────────────────

export interface ScoredCandidate {
  candidate: ImageCandidate;
  score: RuleScoreResult;
}

/** Audit metadata computed by the service layer. */
export interface DecisionMeta {
  reason: string;
  topScore: number | null;
  secondScore: number | null;
  delta: number | null;
  /** Candidates removed by pHash deduplication. */
  duplicatesRemoved: number;
  clustersCount: number;
  candidatesCount: number;
  representativeCount: number;
}

/** Full pipeline output for one product. */
export interface ImageResolverOutput {
  barcode: string;
  /** All candidates with their individual rule scores. */
  scored: ScoredCandidate[];
  /** Clusters produced by duplicate detection. */
  clusters: DedupCluster[];
  /** One candidate per cluster (best member of each), with scores. */
  clusterRepresentatives: ScoredCandidate[];
  /** Final selection decision. */
  decision: DecisionResult;
  /** How the final image was selected. */
  selectionMethod: SelectionMethod;
  /** Audit data for debugging and analytics. */
  decisionMeta: DecisionMeta;
  /** Wall-clock ms for the full pipeline run. */
  latencyMs: number;
  /**
   * True when an ADMIN or CATALOG image was found in the candidate list
   * with imageStatus='selected', and the resolver short-circuited without scoring.
   */
  servedFromOfficial?: boolean;
  /** Catalog source of the official image when servedFromOfficial is true. */
  officialSource?: CatalogImageSource;
}
