// @ts-nocheck
/**
 * Text normalization utilities for the OFF Product Resolver.
 * Must match exactly what PostgreSQL's normalize_text() function produces.
 */

const STOPWORDS = new Set([
  "de", "do", "da", "dos", "das", "com", "para", "em", "no", "na",
  "nos", "nas", "o", "a", "os", "as", "e", "ou", "ao", "aos", "um",
  "uma", "uns", "umas", "por", "pelo", "pela", "pelos", "pelas",
]);

const UNIT_RE = /\b\d+[,.]?\d*\s*(kg|g|ml|l|cl|oz|lb|un|pç|ct|pack|caixa|cx|lata|garrafa|pote|sache)\b/gi;

/** Mirrors PostgreSQL normalize_text(): unaccent + lowercase + collapse spaces. */
export function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Strips units and stopwords for resolver matching (more aggressive than normalizeText). */
export function normalizeForMatch(text: string): string {
  return normalizeText(text)
    .replace(UNIT_RE, "")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .join(" ")
    .trim();
}

/** Parses "350g", "1 kg", "500 mL" → grams (null if unrecognised). */
export function extractQuantityG(quantityText: string | null | undefined): number | null {
  if (!quantityText) return null;
  const m = quantityText.toLowerCase().match(/(\d+[,.]?\d*)\s*(g|kg|ml|l|cl|oz|lb)/);
  if (!m) return null;
  const num = parseFloat(m[1].replace(",", "."));
  switch (m[2]) {
    case "kg": return num * 1000;
    case "l":  return num * 1000;
    case "cl": return num * 10;
    case "oz": return num * 28.35;
    case "lb": return num * 453.6;
    default:   return num;
  }
}

/** Known brand aliases → canonical brand name. Used for brand_hint extraction. */
const BRAND_ALIASES: Record<string, string> = {
  "maizena":     "unilever",
  "nescau":      "nestlé",
  "toddy":       "pepsico",
  "mucilon":     "nestlé",
  "maggi":       "nestlé",
  "nestle":      "nestlé",
  "ninho":       "nestlé",
  "leite moca":  "nestlé",
  "moça":        "nestlé",
  "moca":        "nestlé",
  "quaker":      "quaker",
  "aveia quaker":"quaker",
  "camil":       "camil",
  "kicaldo":     "kicaldo",
  "finna":       "finna",
  "dona benta":  "dona benta",
  "bauducco":    "bauducco",
  "piraque":     "piraquê",
  "piracanjuba": "piracanjuba",
  "italac":      "italac",
  "nescafe":     "nestlé",
  "pilao":       "pilão",
  "melitta":     "melitta",
  "tres coracoes":"três corações",
  "skol":        "ambev",
  "brahma":      "ambev",
  "antarctica":  "ambev",
  "heineken":    "heineken",
  "coca cola":   "coca-cola",
  "pepsi":       "pepsico",
  "guarana":     "ambev",
};

/**
 * Returns a brand hint if a known brand alias appears in the text.
 * Used as brand_hint in the resolver's step [7].
 */
export function extractBrandHint(text: string): string | null {
  const norm = normalizeText(text);
  for (const [alias, brand] of Object.entries(BRAND_ALIASES)) {
    if (norm.includes(normalizeText(alias))) return brand;
  }
  return null;
}

/**
 * Generates alias variants for a product name.
 * Returns array of { alias, alias_type } pairs ready for off_product_aliases insert.
 */
export function generateAliases(
  name: string,
  brand: string | null | undefined,
): Array<{ alias: string; aliasType: string }> {
  const aliases: Array<{ alias: string; aliasType: string }> = [];
  const seen = new Set<string>();

  function add(alias: string, aliasType: string) {
    const key = normalizeText(alias);
    if (key.length < 3 || seen.has(key)) return;
    seen.add(key);
    aliases.push({ alias: alias.trim(), aliasType });
  }

  // ocr_variant: normalized name without accents (main OCR case)
  add(normalizeText(name), "ocr_variant");

  // ocr_variant: name without stopwords
  add(normalizeForMatch(name), "ocr_variant");

  // brand_name alias: if brand is a known alias
  if (brand) {
    const normBrand = normalizeText(brand);
    if (BRAND_ALIASES[normBrand]) {
      add(brand, "brand_name");
    }
  }

  // typo: name without special characters
  const noSpecial = name.replace(/[^a-zA-Z0-9À-ž\s]/g, " ").replace(/\s+/g, " ").trim();
  if (noSpecial !== name) add(noSpecial, "typo");

  return aliases;
}

/** Maps OFF categories_tags to AíCompensa category names. */
const CATEGORY_MAP: Array<[RegExp, string]> = [
  [/laticin|dairy|leite|queijo|iogurte|manteiga|requeijao|nata/i, "Laticínios"],
  [/biscoito|bolacha|biscuit|cookie/i,                             "Biscoitos"],
  [/massa|macarr|pasta\b|espaguete|penne|parafuso/i,               "Massas"],
  [/refrigerante|bebida|suco|agua|soda|beverage|drink/i,           "Bebidas"],
  [/arroz|rice/i,                                                  "Grãos"],
  [/feijao|feij|bean/i,                                            "Grãos"],
  [/cafe|coffee|cappuccino/i,                                      "Café"],
  [/oleo|oil|azeite|olive/i,                                       "Óleos"],
  [/acucar|sugar/i,                                                "Grãos"],
  [/cerveja|beer/i,                                                "Bebidas"],
  [/limpeza|cleaning|detergente|sabao|sabonete/i,                  "Limpeza"],
  [/higiene|shampoo|cosmetico/i,                                   "Higiene"],
  [/carne|meat|frango|peixe|aves/i,                                "Carnes"],
  [/hortifruti|verdura|fruta|legume/i,                             "Hortifruti"],
  [/congelado|frozen|sorvete/i,                                    "Congelados"],
  [/paes|pao|bread|padaria|bakery/i,                               "Padaria"],
];

/** Derives a single category from an array of OFF categories_tags. */
export function mapOffCategory(categoriesTags: string[] | null | undefined): string | null {
  if (!categoriesTags?.length) return null;
  const joined = categoriesTags.join(" ");
  for (const [re, cat] of CATEGORY_MAP) {
    if (re.test(joined)) return cat;
  }
  return "Alimentos";
}

/** Computes a data quality score (0–100) for an OFF product. */
export function computeDataQuality(product: {
  name?: string | null;
  brand?: string | null;
  quantity?: string | null;
  categories?: string[] | null;
  imageUrl?: string | null;
  barcode?: string | null;
}): number {
  let score = 0;
  if (product.name)       score += 25;
  if (product.brand)      score += 20;
  if (product.quantity)   score += 15;
  if (product.categories?.length) score += 15;
  if (product.imageUrl)   score += 15;
  if (product.barcode)    score += 10;
  return score;
}
