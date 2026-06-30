/**
 * Phase 1 — Rule Score Engine
 *
 * Scores each candidate image from 0–100 using deterministic rules.
 * No AI, no image download required for metadata-only scoring.
 * Visual analysis bonuses/penalties are applied when `analysis.visual` is present.
 *
 * Score breakdown (max 100):
 *   Source trust     0–12
 *   Image type       0–25
 *   Language match   0–10
 *   Resolution       0–20
 *   Aspect ratio     0–10
 *   Revision quality 0–10
 *   Visual bonuses   0–13  (white background +8, package centered +5)
 *   Visual penalties  −n   (shelf photo −30, pricetag −25, watermark −20, …)
 */

import type { ImageAnalysis, RuleScoreResult, ImageSource, ImageType } from "./types.js";
import { IMAGE_SCORE_CONFIG as CFG } from "./image-score-config.js";

export const MIN_USEFUL_SCORE = CFG.thresholds.minUsefulScore;

const SOURCE_SCORES: Record<ImageSource, number> = {
  off:          CFG.source.off,
  manual:       CFG.source.manual,
  user_upload:  CFG.source.user_upload,
  unknown:      CFG.source.unknown,
};

const TYPE_SCORES: Record<ImageType, number> = {
  front:        CFG.imageType.front,
  packaging:    CFG.imageType.packaging,
  ingredients:  CFG.imageType.ingredients,
  nutrition:    CFG.imageType.nutrition,
  other:        CFG.imageType.other,
};

export function scoreImage(analysis: ImageAnalysis): RuleScoreResult {
  const { candidate, visual } = analysis;
  const reasons: string[] = [];
  const penalties: string[] = [];
  let raw = 0;

  // ── Source trust ──────────────────────────────────────────────────────────
  const srcPts = SOURCE_SCORES[candidate.source] ?? 0;
  if (srcPts > 0) {
    raw += srcPts;
    reasons.push(`source:${candidate.source}(+${srcPts})`);
  }

  // ── Image type ────────────────────────────────────────────────────────────
  const typePts = TYPE_SCORES[candidate.imageType] ?? 0;
  if (typePts > 0) {
    raw += typePts;
    reasons.push(`type:${candidate.imageType}(+${typePts})`);
  }

  // ── Language match ────────────────────────────────────────────────────────
  const lang = candidate.language;
  const langPts =
    lang === "pt" ? CFG.language.pt :
    lang === "es" ? CFG.language.es :
    lang          ? CFG.language.other : 0;
  if (langPts > 0) {
    raw += langPts;
    reasons.push(`lang:${lang}(+${langPts})`);
  }

  // ── Resolution ────────────────────────────────────────────────────────────
  const px = candidate.widthPx ?? candidate.heightPx;
  if (px !== undefined) {
    const { highPx, highScore, goodPx, goodScore, okPx, okScore, lowPenalty } = CFG.resolution;
    if (px >= highPx)     { raw += highScore; reasons.push(`resolution:${px}px(+${highScore})`); }
    else if (px >= goodPx){ raw += goodScore; reasons.push(`resolution:${px}px(+${goodScore})`); }
    else if (px >= okPx)  { raw += okScore;   reasons.push(`resolution:${px}px(+${okScore})`); }
    else                  { raw += lowPenalty; penalties.push(`low_resolution:${px}px(${lowPenalty})`); }
  }

  // ── Aspect ratio ──────────────────────────────────────────────────────────
  if (candidate.widthPx && candidate.heightPx) {
    const ratio = candidate.widthPx / candidate.heightPx;
    const { squareMin, squareMax, squareScore, portraitMin, portraitMax, portraitScore, extremePenalty } = CFG.aspectRatio;
    if (ratio >= squareMin && ratio <= squareMax)     { raw += squareScore;  reasons.push(`aspect_ratio:square(+${squareScore})`); }
    else if (ratio >= portraitMin && ratio <= portraitMax) { raw += portraitScore; reasons.push(`aspect_ratio:portrait(+${portraitScore})`); }
    else                                               { raw += extremePenalty; penalties.push(`aspect_ratio:extreme(${extremePenalty})`); }
  }

  // ── Revision quality ──────────────────────────────────────────────────────
  const rev = candidate.revisionNumber ?? 0;
  const { highThreshold, highScore, mediumThreshold, mediumScore, lowThreshold, lowScore, minScore } = CFG.revision;
  if      (rev > highThreshold)   { raw += highScore;   reasons.push(`revision:${rev}(+${highScore})`); }
  else if (rev > mediumThreshold) { raw += mediumScore;  reasons.push(`revision:${rev}(+${mediumScore})`); }
  else if (rev > lowThreshold)    { raw += lowScore;     reasons.push(`revision:${rev}(+${lowScore})`); }
  else if (rev > 0)               { raw += minScore;     reasons.push(`revision:${rev}(+${minScore})`); }

  // ── Visual analysis ───────────────────────────────────────────────────────
  if (visual) {
    const { bonuses, penalties: pen, blurThreshold } = CFG.visual;

    if (visual.hasWhiteBackground) { raw += bonuses.whiteBackground; reasons.push(`white_background(+${bonuses.whiteBackground})`); }
    if (visual.packageCentered)    { raw += bonuses.packageCentered; reasons.push(`package_centered(+${bonuses.packageCentered})`); }

    if (visual.isPlaceholder)       { raw += pen.placeholder;      penalties.push(`placeholder(${pen.placeholder})`); }
    if (visual.isShelfPhoto)        { raw += pen.shelfPhoto;       penalties.push(`shelf_photo(${pen.shelfPhoto})`); }
    if (visual.isPricetag)          { raw += pen.pricetag;         penalties.push(`pricetag(${pen.pricetag})`); }
    if (visual.hasWatermark)        { raw += pen.watermark;        penalties.push(`watermark(${pen.watermark})`); }
    if (visual.isLogoOnly)          { raw += pen.logoOnly;         penalties.push(`logo_only(${pen.logoOnly})`); }
    if (visual.isCropped)           { raw += pen.cropped;          penalties.push(`cropped(${pen.cropped})`); }
    if (visual.hasMultipleProducts) { raw += pen.multipleProducts; penalties.push(`multiple_products(${pen.multipleProducts})`); }
    if (visual.blurScore !== undefined && visual.blurScore < blurThreshold) {
      raw += pen.blurry;
      penalties.push(`blurry:score=${visual.blurScore}(${pen.blurry})`);
    }
  }

  const score = Math.max(0, Math.min(100, raw));
  return { score, reasons, penalties, passed: score >= MIN_USEFUL_SCORE };
}

/** Scores all candidates in a batch, sorted by score descending. */
export function scoreAll(
  analyses: ImageAnalysis[],
): Array<{ analysis: ImageAnalysis; result: RuleScoreResult }> {
  return analyses
    .map((analysis) => ({ analysis, result: scoreImage(analysis) }))
    .sort((a, b) => b.result.score - a.result.score);
}
