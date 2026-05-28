/**
 * Duplicate offer detection utilities.
 * Centralises all dedup constants and logic.
 */

// ── Constants ─────────────────────────────────────────────────────────────────

/** How long (ms) an offer remains in the dedup window. */
export const DEDUP_WINDOW_MS = 48 * 60 * 60_000; // 48 hours

/** Maximum price deviation (fraction) to treat offers as the same. */
export const DEDUP_PRICE_TOLERANCE = 0.05; // ±5 % symmetric

/** Minimum ms a user must wait before confirming the same offer again. */
export const CONFIRM_COOLDOWN_MS = 24 * 60 * 60_000; // 24 hours

/** Points awarded when a user creates a brand-new offer. */
export const POINTS_NEW_OFFER = 10;

/** Points awarded when a user confirms an existing offer. */
export const POINTS_CONFIRMATION = 5;

// ── Normalisation ─────────────────────────────────────────────────────────────

/**
 * Normalise a product name for fuzzy dedup comparison.
 *
 * Steps:
 *  1. Strip diacritics / accents (NFD decomposition)
 *  2. Replace hyphens/underscores with spaces
 *  3. Lower-case
 *  4. Expand / contract common unit abbreviations
 *  5. Collapse repeated whitespace and trim
 *
 * @example
 *   normalizeProductName("Coca-Cola 2 Litros")  // → "coca cola 2l"
 *   normalizeProductName("Arroz 5 Quilogramas")  // → "arroz 5kg"
 *   normalizeProductName("COCA COLA 2L")          // → "coca cola 2l"
 */
export function normalizeProductName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[-_]/g, " ")           // hyphens/underscores → spaces
    .toLowerCase()
    // unit normalisation — number immediately before the unit word
    .replace(/(\d+)\s*litros?\b/g, "$1l")
    .replace(/(\d+)\s*quilogramas?\b/g, "$1kg")
    .replace(/(\d+)\s*quilos?\b/g, "$1kg")
    .replace(/(\d+)\s*gramas?\b/g, "$1g")
    .replace(/(\d+)\s*mililitros?\b/g, "$1ml")
    .replace(/(\d+)\s*unidades?\b/g, "$1un")
    // collapse whitespace
    .replace(/\s+/g, " ")
    .trim();
}

// ── Price helpers ─────────────────────────────────────────────────────────────

/**
 * Returns true when the relative price difference between `a` and `b`
 * is within `tolerance` using the **larger** value as the reference.
 *
 * Using max(a,b) as denominator makes the comparison symmetric:
 *   withinPriceTolerance(9.51, 10.00) === withinPriceTolerance(10.00, 9.51)
 *
 * At 5 % tolerance a R$10 offer matches R$9.50 – R$10.53 (approx).
 */
export function withinPriceTolerance(a: number, b: number, tolerance = DEDUP_PRICE_TOLERANCE): boolean {
  if (a === 0 && b === 0) return true;
  const ref = Math.max(a, b);
  return Math.abs(a - b) / ref <= tolerance;
}
