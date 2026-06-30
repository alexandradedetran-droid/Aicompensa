// @ts-nocheck
/**
 * Intelligent search for the offer feed.
 *
 * SQL conditions built (all via OR):
 *   1. produto ILIKE '%term%'            — product name (canonical + raw)
 *   2. produtoNormalizado ILIKE '%term%' — accent-stripped DB column
 *   3. marca ILIKE '%term%'              — brand name
 *   4. categoria = alias                 — ONLY when the user typed a category name
 *      (e.g. "bebidas", "carnes", "hortifruti") — never expanded from product keywords
 *   5. synonym extras from slang expansion (e.g. "breja" → "cerveja")
 *   6. semantic synonyms (e.g. "proteína" → searches frango, carne…)
 *   7. community dictionary (learned category terms)
 *
 * REMOVED: CATEGORY_KEYWORDS expansion.
 * Searching "açaí" used to expand to the entire "Congelados" category
 * (which includes Lasanha, Pizza, etc.) — this was the source of false positives.
 * Category expansion now only fires when the user's term IS a category alias.
 *
 * Post-fetch filtering (scoreSearchResult):
 * After rows are fetched, every item is scored 0-100.
 * Items below MIN_SEARCH_SCORE are removed before the response.
 */

import { db, ofertasTable, produtoDicionarioTable } from "@workspace/db";
import { or, ilike, SQL } from "drizzle-orm";
import { logger } from "./logger";
import { expandQuery, getAllSearchTerms, norm } from "@workspace/synonyms";

/** Escape SQL LIKE wildcards in user input */
function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, (c) => `\\${c}`);
}

// ── Category aliases ──────────────────────────────────────────────────────────
// Fires ONLY when the user explicitly types a category name / alias.
// Keys: pre-normalized (no accents, lowercase).
const CATEGORY_ALIASES: Record<string, string> = {
  // Carnes / Açougue
  carne:    "Carnes",
  carnes:   "Carnes",
  acougue:  "Carnes",
  // Bebidas
  bebida:  "Bebidas",
  bebidas: "Bebidas",
  // Limpeza
  limpeza: "Limpeza",
  // Higiene
  higiene: "Higiene",
  // Hortifruti
  hortifruti: "Hortifruti",
  fruta:      "Hortifruti",
  frutas:     "Hortifruti",
  verdura:    "Hortifruti",
  verduras:   "Hortifruti",
  legume:     "Hortifruti",
  legumes:    "Hortifruti",
  // Laticínios
  laticinios: "Laticínios",
  laticionio: "Laticínios",
  // Padaria
  padaria: "Padaria",
  // Congelados
  congelado:  "Congelados",
  congelados: "Congelados",
  // Bebê
  bebe:     "Bebê",
  infantil: "Bebê",
  // Pet
  pet:    "Pet",
  animal: "Pet",
  racao:  "Pet",
  // Alimentos / Mercearia
  alimento:  "Alimentos",
  alimentos: "Alimentos",
  mercearia: "Alimentos",
};

// ── Semantic synonyms ─────────────────────────────────────────────────────────
// Conceptual/contextual terms → specific product words searched in the
// produto column only (never triggers category expansion).
const SEMANTIC_TERMS: Record<string, string[]> = {
  proteina:        ["frango", "carne", "peixe", "ovo", "atum", "sardinha", "queijo"],
  churrasco:       ["picanha", "costela", "linguica", "frango", "alcatra"],
  "cafe da manha": ["pao", "leite", "cafe", "manteiga", "iogurte", "cereal"],
  lanche:          ["pao", "presunto", "queijo", "manteiga", "bisnaga"],
  sobremesa:       ["sorvete", "bolo", "chocolate"],
  hidratacao:      ["agua", "coco", "isotonico", "suco"],
  snack:           ["biscoito", "bolacha", "salgadinho"],
  fitness:         ["whey", "barra", "amendoim", "ovo"],
};

// ── DB dictionary cache (5-min TTL) ──────────────────────────────────────────
interface DictCacheEntry { terms: string[]; at: number }
const dictCache = new Map<string, DictCacheEntry>();
const DICT_TTL_MS = 5 * 60_000;

async function lookupDictionary(catAlias: string | null, normalizedTerm: string): Promise<string[]> {
  const cacheKey = `${catAlias ?? ""}|${normalizedTerm}`;
  const cached = dictCache.get(cacheKey);
  if (cached && Date.now() - cached.at < DICT_TTL_MS) return cached.terms;

  try {
    const rows = await db
      .select({ termo: produtoDicionarioTable.termo })
      .from(produtoDicionarioTable)
      .where(
        catAlias
          ? ilike(produtoDicionarioTable.categoria, catAlias)
          : ilike(produtoDicionarioTable.tags, `%${escapeLike(normalizedTerm)}%`),
      )
      .limit(30);

    const terms = rows.map((r) => r.termo).filter(Boolean) as string[];
    dictCache.set(cacheKey, { terms, at: Date.now() });
    return terms;
  } catch {
    return [];
  }
}

// ── Main export ───────────────────────────────────────────────────────────────
/**
 * Build an expanded OR condition for the feed SQL query.
 * Returns null when the term is blank (caller skips the condition).
 */
export async function buildSearchConditions(rawTerm: string): Promise<SQL | null> {
  const normalized = norm(rawTerm);
  if (!normalized) return null;

  const { canonical, extras: synonymExtras, wasSlang } = expandQuery(rawTerm);
  const primaryTerm = wasSlang ? canonical : normalized;
  const safePrimary = escapeLike(primaryTerm);
  const safeRaw     = escapeLike(rawTerm);
  const safeNorm    = escapeLike(normalized);

  const conditions: SQL[] = [];
  const addedCategories = new Set<string>();

  const addCat = (cat: string) => {
    if (addedCategories.has(cat)) return;
    addedCategories.add(cat);
    conditions.push(ilike(ofertasTable.categoria, cat));
  };

  // 1. Canonical product name — highest priority
  conditions.push(ilike(ofertasTable.produto, `%${safePrimary}%`));

  // 2. produtoNormalizado (accent-stripped DB column) — ALWAYS added.
  // PostgreSQL ILIKE is case-insensitive but NOT accent-insensitive, so
  // "Açaí Original Pote" ILIKE '%acai%' returns false in standard PostgreSQL.
  // produtoNormalizado stores the accent-stripped version ("acai original pote"),
  // making this condition the only reliable path to find "Açaí" when searching "acai".
  conditions.push(ilike(ofertasTable.produtoNormalizado, `%${safePrimary}%`));

  // 3. Raw term (if slang and different from canonical)
  if (wasSlang && safeRaw !== safePrimary) {
    conditions.push(ilike(ofertasTable.produto, `%${safeRaw}%`));
  }

  // 4. Accent-normalized original (only when different from primary to avoid duplicate)
  if (safeNorm !== safePrimary) {
    conditions.push(ilike(ofertasTable.produtoNormalizado, `%${safeNorm}%`));
  }

  // 5. Brand (marca)
  conditions.push(ilike(ofertasTable.marca, `%${safePrimary}%`));
  if (wasSlang && safeRaw !== safePrimary) {
    conditions.push(ilike(ofertasTable.marca, `%${safeRaw}%`));
  }

  // 6. Synonym extras (e.g. "moça" → extras=["moca", "nestlé"])
  for (const extra of synonymExtras) {
    conditions.push(ilike(ofertasTable.produto, `%${escapeLike(extra)}%`));
  }

  // 7. Category alias — ONLY when user typed a category name (e.g. "bebidas", "carnes").
  //    Intentionally NOT expanded from product keywords (that caused false positives).
  const catAlias = wasSlang
    ? null
    : (CATEGORY_ALIASES[canonical] ?? CATEGORY_ALIASES[normalized] ?? null);
  if (catAlias) addCat(catAlias);

  // 8. Semantic synonyms — product-name search only (never category expansion)
  const semanticHits = SEMANTIC_TERMS[canonical] ?? SEMANTIC_TERMS[normalized] ?? [];
  for (const syn of semanticHits) {
    conditions.push(ilike(ofertasTable.produto, `%${escapeLike(syn)}%`));
  }

  // 9. Community dictionary — cached async lookup
  const dictTerms = await lookupDictionary(catAlias, canonical);
  for (const termo of dictTerms) {
    conditions.push(ilike(ofertasTable.produtoNormalizado, `%${escapeLike(termo)}%`));
  }

  logger.debug({
    searchTerm: rawTerm,
    normalized,
    canonical,
    wasSlang,
    synonymExtras,
    catAlias,
    categoriesExpanded: [...addedCategories],
    semanticHits,
    dictTerms,
    conditionCount: conditions.length,
  }, "search-expand: conditions built");

  return or(...conditions) as SQL;
}

// ── Relevance scoring ─────────────────────────────────────────────────────────

/**
 * Normalize text for relevance comparison.
 * Strips accents, lowercases, trims, and collapses internal whitespace.
 */
function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export interface SearchScore {
  score: number;
  /** Human-readable reason for the best match (for logging). */
  reason: string;
}

/**
 * Score a single offer against a search term.
 *
 * Scoring (higher = better match, threshold = 50):
 *   100 — Exact product name match
 *    80 — Product name starts with term (first word or prefix)
 *    50 — Product name contains term (whole word or substring)
 *    30 — Brand name contains term          ← below threshold, never shown alone
 *    15 — Category name contains term       ← below threshold, never shown alone
 *     5 — Market name contains term         ← below threshold, never shown alone
 *     0 — No match anywhere → filtered out
 *
 * IMPORTANT: Only the direct normalized term and its canonical expansion are
 * checked. Synonym extras are intentionally excluded from scoring to prevent
 * false positives (e.g. "camil" extras=["arroz","feijao"] must not inflate
 * the score of a Dog Chow offer when the user searched "arroz").
 *
 * The caller applies MIN_SEARCH_SCORE (= 50) to filter results.
 */
export function scoreSearchResult(
  produto: string,
  marca: string | null | undefined,
  categoria: string | null | undefined,
  mercado: string | null | undefined,
  rawTerm: string,
): SearchScore {
  const termNorm = normalizeText(rawTerm);
  if (!termNorm) return { score: 100, reason: "empty-term" };

  const { canonical } = expandQuery(rawTerm);

  // Only direct + canonical — NEVER synonym extras (they cause false positives).
  const terms = [...new Set([termNorm, canonical].filter(Boolean))];

  const prodNorm    = normalizeText(produto);
  const marcaNorm   = normalizeText(marca ?? "");
  const catNorm     = normalizeText(categoria ?? "");
  const mercadoNorm = normalizeText(mercado ?? "");

  let bestScore  = 0;
  let bestReason = "no-match";

  for (const t of terms) {
    if (!t) continue;

    // +100: exact product name
    if (prodNorm === t) return { score: 100, reason: "exact" };

    // +80: product name starts with term (first word or prefix with separator)
    const prodWords = prodNorm.split(/[\s\-\/]+/);
    const firstWord = prodWords[0] ?? "";
    if (
      firstWord === t ||
      prodNorm.startsWith(t + " ") ||
      prodNorm.startsWith(t + "-")
    ) {
      if (bestScore < 80) { bestScore = 80; bestReason = "starts-with"; }
      continue;
    }

    // +50: product name contains term (whole word or substring)
    if (prodWords.includes(t) || prodNorm.includes(t)) {
      if (bestScore < 50) { bestScore = 50; bestReason = "contains"; }
      continue;
    }

    // +30: brand name contains term
    if (marcaNorm && marcaNorm.includes(t)) {
      if (bestScore < 30) { bestScore = 30; bestReason = "marca"; }
      continue;
    }

    // +15: category contains term
    if (catNorm && catNorm.includes(t)) {
      if (bestScore < 15) { bestScore = 15; bestReason = "categoria"; }
      continue;
    }

    // +5: market contains term
    if (mercadoNorm && mercadoNorm.includes(t)) {
      if (bestScore < 5) { bestScore = 5; bestReason = "mercado"; }
    }
  }

  // Cross-category penalty: Pet products must not appear for food/grocery searches.
  // Example: "Ração Frango e Arroz" (Pet) must not appear when searching "Arroz".
  // Score 50 (contains) passes the threshold but the category context is wrong.
  const PET_SEARCH_TERMS = new Set([
    "racao", "pet", "cachorro", "gato", "cao", "felino", "hamster",
    "passaro", "dog", "cat", "puppy", "kitten", "osso", "coleira", "vermifugo",
  ]);
  const isPetSearch = terms.some(t => PET_SEARCH_TERMS.has(t));
  if (catNorm === "pet" && !isPetSearch && bestScore <= 50) {
    return { score: 0, reason: "cross-category-pet-penalty" };
  }

  return { score: bestScore, reason: bestReason };
}

/**
 * Minimum relevance score for a result to appear in the search feed.
 * Score 50 = product name must contain the search term.
 * Brand-only (30), category-only (15), market-only (5) are always blocked.
 */
export const MIN_SEARCH_SCORE = 50;

export { getAllSearchTerms } from "@workspace/synonyms";
