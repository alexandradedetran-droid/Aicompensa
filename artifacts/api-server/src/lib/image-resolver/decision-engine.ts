/**
 * Phase 3 — Decision Engine
 *
 * Takes the cluster representatives (one per visual-similarity group) and
 * their rule scores, then decides what to do with the best candidate.
 *
 * Decision rules (thresholds from IMAGE_SCORE_CONFIG):
 *
 *   topScore >= autoApproveScore AND delta >= autoApproveDelta  →  auto_approve
 *   topScore >= minAcceptableScore AND delta < autoApproveDelta →  ai_required
 *   topScore in [minAcceptableScore, autoApproveScore)          →  ai_required
 *   topScore < minAcceptableScore                               →  review_required
 *
 * Edge cases:
 *   Only one candidate: delta = null, treated as infinite.
 *   No candidates:      review_required, selected = null.
 */

import type { DecisionResult, ImageCandidate } from "./types.js";
import { IMAGE_SCORE_CONFIG as CFG } from "./image-score-config.js";

export interface RankedCandidate {
  candidate: ImageCandidate;
  score: number;
}

/**
 * Makes a selection decision for a product given scored cluster representatives.
 * Input must already be sorted by score descending (highest first).
 */
export function decide(ranked: RankedCandidate[]): DecisionResult {
  const { autoApproveScore, autoApproveDelta, minAcceptableScore } = CFG.thresholds;

  if (ranked.length === 0) {
    return {
      selected:       null,
      aiRequired:     false,
      reviewRequired: true,
      reason:         "no_candidates",
      topScore:       0,
      secondScore:    null,
      scoreDelta:     null,
    };
  }

  const top    = ranked[0]!;
  const second = ranked[1] ?? null;

  const topScore    = top.score;
  const secondScore = second?.score ?? null;
  const scoreDelta  = secondScore !== null ? topScore - secondScore : null;
  const effectiveDelta = scoreDelta ?? Number.POSITIVE_INFINITY;

  let aiRequired:     boolean = false;
  let reviewRequired: boolean = false;
  let reason:         string;

  if (topScore < minAcceptableScore) {
    reviewRequired = true;
    reason = `top_score_too_low:${topScore}<${minAcceptableScore}`;
  } else if (topScore >= autoApproveScore && effectiveDelta >= autoApproveDelta) {
    reason = `auto_approved:score=${topScore},delta=${scoreDelta ?? "∞"}`;
  } else {
    aiRequired = true;
    reason = topScore >= autoApproveScore
      ? `ai_required:high_score_narrow_delta:${topScore},delta=${scoreDelta}`
      : `ai_required:score_in_gray_zone:${topScore}`;
  }

  return {
    selected: top.candidate,
    aiRequired,
    reviewRequired,
    reason,
    topScore,
    secondScore,
    scoreDelta,
  };
}

/** Convenience wrapper: sorts before deciding. */
export function decideFromUnsorted(candidates: RankedCandidate[]): DecisionResult {
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  return decide(sorted);
}
