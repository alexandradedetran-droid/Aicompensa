/**
 * visual-priority.ts
 *
 * Determines whether to show MARCA or PRODUTO as the primary headline
 * in offer cards, modals and feed sections.
 *
 * Rules (in order of precedence):
 *  1. No brand present → produto only
 *  2. Brand is already contained in produto → produto only (anti-dup)
 *  3. Brand is a well-known household name → marca first
 *  4. Category is "product-first" (Açougue, Hortifruti, Padaria, Congelados) → produto first
 *  5. Category is "brand-first" (Bebidas, Limpeza, Higiene, Laticínios) → marca first
 *  6. Fallback → marca first (brand adds value when present)
 */

export type VisualPriority = "marca" | "produto";

export interface ProductDisplay {
  primary: string;
  secondary: string | null;
  priority: VisualPriority;
}

// ── Categories where the product description matters more than the brand ───────
const PRODUCT_FIRST_CATEGORIES = new Set([
  "Carnes",
  "Açougue",
  "Hortifruti",
  "Padaria",
  "Congelados",
  "Frios",
]);

// ── Categories where brand recognition drives the purchase decision ────────────
const BRAND_FIRST_CATEGORIES = new Set([
  "Bebidas",
  "Limpeza",
  "Higiene",
  "Laticínios",
  "Pet",
]);

// ── Well-known household brands — always headline regardless of category ───────
const STRONG_BRANDS: string[] = [
  // Bebidas
  "coca-cola", "coca cola", "cocacola",
  "pepsi", "skol", "heineken", "brahma", "antarctica", "bohemia",
  "sprite", "fanta", "kuat", "guaraná antarctica", "guarana antarctica",
  "schweppes", "red bull", "monster", "corona", "budweiser",
  "devassa", "itaipava", "crystal", "eisenbahn",
  // Cervejas especiais
  "stella artois", "becks", "miller", "desperados",
  // Sucos / águas
  "natural one", "do bem", "maguary", "del valle", "minute maid",
  "crystal water", "bonafont", "minalba", "são lourenço",
  // Alimentos / laticínios
  "nestlé", "nestle", "nescau", "toddy", "nescafé", "nescafe",
  "danone", "activia", "vigor", "piracanjuba", "italac", "parmalat",
  "yopro", "batavo",
  // Carnes processadas
  "sadia", "perdigão", "perdigao", "seara", "aurora",
  "swift", "qualy", "doriana",
  // Mercearia
  "liza", "mazola", "soya", "bunge", "cargill",
  "quaker", "kellogg", "kellogs", "neston", "mucilon",
  "maisena", "maizena", "knorr", "maggi", "ajinomoto",
  "hellmanns", "hellmann's", "heinz", "kitano",
  // Limpeza / higiene
  "ypê", "ype", "veja", "ariel", "omo", "ace", "bold",
  "brilhante", "tixan", "minuano", "limpol",
  "downy", "comfort", "ala",
  "gillette", "pantene", "head & shoulders", "head and shoulders",
  "dove", "rexona", "axe", "nivea",
  "colgate", "oral-b", "oral b", "listerine",
  "sempre livre", "intimus", "kotex",
  // Biscoitos / chocolates
  "oreo", "lacta", "bis", "toblerone", "ferrero",
  "bauducco", "piraque", "triunfo", "nabisco",
  "negresco", "recheado", "passatempo",
  // Massas / farinhas
  "barilla", "adria", "renata", "ana maria",
  // Fast consumer
  "pampers", "huggies", "johnsons", "johnson's",
];

// Normalized for fast lookup
const STRONG_BRANDS_LOWER = STRONG_BRANDS.map((b) => b.toLowerCase());

function isStrongBrand(marca: string): boolean {
  const m = marca.toLowerCase().trim();
  return STRONG_BRANDS_LOWER.some(
    (b) =>
      m === b ||
      m.startsWith(b + " ") ||
      m.startsWith(b + "-") ||
      b.startsWith(m + " ") ||
      b.startsWith(m + "-"),
  );
}

// ── Core priority resolver ─────────────────────────────────────────────────────

export function getVisualPriority(
  categoria: string | null | undefined,
  marca: string | null | undefined,
): VisualPriority {
  if (!marca?.trim()) return "produto";
  if (isStrongBrand(marca)) return "marca";
  const cat = categoria ?? "";
  if (PRODUCT_FIRST_CATEGORIES.has(cat)) return "produto";
  if (BRAND_FIRST_CATEGORIES.has(cat)) return "marca";
  return "marca";
}

// ── Combined display helper ────────────────────────────────────────────────────
// Returns what should go on line 1 (primary / big) and line 2 (secondary / small).
// If the brand is already embedded in the product name, secondary is null (no dup).

export function getProductDisplay(
  produto: string,
  marca: string | null | undefined,
  categoria: string | null | undefined,
): ProductDisplay {
  const hasBrand =
    !!marca?.trim() &&
    !produto.toLowerCase().includes(marca.toLowerCase().trim());

  if (!hasBrand) {
    return { primary: produto, secondary: null, priority: "produto" };
  }

  const priority = getVisualPriority(categoria, marca);

  return priority === "marca"
    ? { primary: marca!, secondary: produto, priority: "marca" }
    : { primary: produto, secondary: marca!, priority: "produto" };
}
