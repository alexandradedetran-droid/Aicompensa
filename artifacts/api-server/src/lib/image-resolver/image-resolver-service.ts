/**
 * ImageResolverService — orchestrator for the full image pipeline.
 *
 * Flow per product:
 *   1. Score all candidates with RuleScoreEngine.
 *   2. Optionally enrich candidates with pHashes (downloads images).
 *   3. Cluster visually similar images with DuplicateDetector.
 *   4. Score the cluster representative for each cluster.
 *   5. Run DecisionEngine on the cluster representatives.
 *   6. Compute selectionMethod and decisionMeta.
 *   7. Return ImageResolverOutput.
 *
 * pHash enrichment is opt-in via `options.computePhashes`.
 * When disabled, each candidate is its own singleton cluster (no dedup step).
 * This allows fast metadata-only runs during bulk import.
 *
 * Concurrency: `phashConcurrency` controls how many images are downloaded in
 * parallel during pHash enrichment. Default 3 is safe for CDN rate limits.
 * If not implemented, pHash runs sequentially (concurrency=1 has same behaviour).
 */

import { scoreAll }                           from "./rule-score-engine.js";
import { enrichWithPhashes, clusterByPhash }  from "./duplicate-detector.js";
import { decideFromUnsorted }                 from "./decision-engine.js";
import type {
  ImageCandidate,
  ImageAnalysis,
  ImageResolverOutput,
  ScoredCandidate,
  DedupCluster,
  SelectionMethod,
  DecisionMeta,
  CatalogImageSource,
} from "./types.js";

export interface ResolverOptions {
  /**
   * When true, downloads each image to compute pHash for duplicate detection.
   * Adds ~200–800ms per image depending on CDN latency.
   * Default: false (metadata-only mode).
   */
  computePhashes?: boolean;
  /**
   * Maximum concurrent image downloads during pHash enrichment.
   * Default: 3. Has no effect when computePhashes is false.
   */
  phashConcurrency?: number;
  /**
   * Optional visual analysis data keyed by candidate URL.
   * Populated by a future visual analysis step (Stage 2).
   */
  visualAnalyses?: Map<string, import("./types.js").VisualAnalysis>;
}

export class ImageResolverService {
  async resolve(
    barcode: string,
    candidates: ImageCandidate[],
    options: ResolverOptions = {},
  ): Promise<ImageResolverOutput> {
    const t0 = Date.now();
    const { computePhashes = false, phashConcurrency = 3, visualAnalyses } = options;

    // ── Step 0: Catalog priority — ADMIN/CATALOG images bypass the pipeline ───
    // If an already-selected official image is in the candidate list, return it
    // directly. This prevents the rule scorer from demoting trusted images.
    const OFFICIAL_SOURCES: CatalogImageSource[] = ["ADMIN", "ADMIN_UPLOAD", "CATALOG"];
    const officialCandidate = candidates.find(
      (c) => c.catalogSource && OFFICIAL_SOURCES.includes(c.catalogSource) && c.imageStatus === "selected",
    );
    if (officialCandidate) {
      const officialSource = officialCandidate.catalogSource as CatalogImageSource;
      return {
        barcode,
        scored: [],
        clusters: [],
        clusterRepresentatives: [],
        decision: {
          selected:       officialCandidate,
          aiRequired:     false,
          reviewRequired: false,
          reason:         `official_source:${officialSource}`,
          topScore:       100,
          secondScore:    null,
          scoreDelta:     null,
        },
        selectionMethod: "ADMIN",
        decisionMeta: {
          reason:              `official_source:${officialSource}`,
          topScore:            100,
          secondScore:         null,
          delta:               null,
          duplicatesRemoved:   0,
          clustersCount:       1,
          candidatesCount:     candidates.length,
          representativeCount: 1,
        },
        servedFromOfficial: true,
        officialSource,
        latencyMs: Date.now() - t0,
      };
    }

    // ── Step 1: Score all candidates ─────────────────────────────────────────
    const analyses: ImageAnalysis[] = candidates.map((c) => ({
      candidate: c,
      visual: visualAnalyses?.get(c.url),
    }));

    const scoredAll = scoreAll(analyses);
    const scored: ScoredCandidate[] = scoredAll.map(({ analysis, result }) => ({
      candidate: analysis.candidate,
      score: result,
    }));

    // ── Step 2: pHash enrichment (optional) ──────────────────────────────────
    let enrichedCandidates: ImageCandidate[];
    if (computePhashes) {
      enrichedCandidates = await enrichWithPhashes(candidates, phashConcurrency);
    } else {
      enrichedCandidates = candidates;
    }

    // ── Step 3: Cluster visually similar images ───────────────────────────────
    const scoreByUrl = new Map<string, number>(
      scoredAll.map(({ analysis, result }) => [analysis.candidate.url, result.score]),
    );

    const clusteringInputs = enrichedCandidates.map((c) => ({
      candidate: c,
      score: scoreByUrl.get(c.url) ?? 0,
    }));

    const clusters: DedupCluster[] = clusterByPhash(clusteringInputs);
    const duplicatesRemoved = candidates.length - clusters.length;

    // ── Step 4: Score cluster representatives ─────────────────────────────────
    const repAnalyses: ImageAnalysis[] = clusters.map((cl) => ({
      candidate: cl.representative,
      visual: visualAnalyses?.get(cl.representative.url),
    }));

    const repScored = scoreAll(repAnalyses);
    const clusterRepresentatives: ScoredCandidate[] = repScored.map(({ analysis, result }) => ({
      candidate: analysis.candidate,
      score: result,
    }));

    // ── Step 5: Decision ──────────────────────────────────────────────────────
    const ranked = clusterRepresentatives.map((sc) => ({
      candidate: sc.candidate,
      score: sc.score.score,
    }));

    const decision = decideFromUnsorted(ranked);

    // ── Step 6: Selection method ──────────────────────────────────────────────
    let selectionMethod: SelectionMethod;
    if (!decision.selected) {
      selectionMethod = "NONE";
    } else if (computePhashes && duplicatesRemoved > 0) {
      selectionMethod = "RULE_PHASH";
    } else {
      selectionMethod = "RULE";
    }

    // ── Step 7: Decision metadata ─────────────────────────────────────────────
    const decisionMeta: DecisionMeta = {
      reason:              decision.reason,
      topScore:            decision.topScore,
      secondScore:         decision.secondScore,
      delta:               decision.scoreDelta,
      duplicatesRemoved,
      clustersCount:       clusters.length,
      candidatesCount:     candidates.length,
      representativeCount: clusterRepresentatives.length,
    };

    return {
      barcode,
      scored,
      clusters,
      clusterRepresentatives,
      decision,
      selectionMethod,
      decisionMeta,
      latencyMs: Date.now() - t0,
    };
  }
}

/** Singleton instance for use throughout the server. */
export const imageResolver = new ImageResolverService();
