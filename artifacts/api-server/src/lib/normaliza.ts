// @ts-nocheck
/**
 * Global normalisation utilities for AíCompensa.
 *
 * Covers:
 *   - Mercado name canonicalisation (trim, aliases, title case)
 *   - Product name for analytics (strips weights / units)
 *   - Brazil timezone helpers (UTC-3, no DST since 2019)
 *   - Keyword-based category detection (used for backfill / reclassification)
 */

// ── Mercado ───────────────────────────────────────────────────────────────────

/**
 * Known aliases: lowercased + accent-stripped key → canonical display name.
 * Add entries whenever a new major chain appears in the wild.
 */
const MERCADO_ALIASES: Record<string, string> = {
  "comper":                 "Comper",
  "comper supermercados":   "Comper",
  "atacadao":               "Atacadão",
  "atacadao supermercados": "Atacadão",
  "carrefour":              "Carrefour",
  "carrefou":               "Carrefour",
  "carrefour market":       "Carrefour Market",
  "carrefour bairro":       "Carrefour Bairro",
  "extra":                  "Extra",
  "extra supermercados":    "Extra",
  "assai":                  "Assaí",
  "assai atacadista":       "Assaí",
  "barbosa":                "Barbosa",
  "supermercados barbosa":  "Barbosa",
  "sonda":                  "Sonda",
  "sonda supermercados":    "Sonda",
  "big":                    "Big",
  "big supermercado":       "Big",
  "walmart":                "Walmart",
  "sams":                   "Sam's Club",
  "sams club":              "Sam's Club",
  "sam s club":             "Sam's Club",
  "mambo":                  "Mambo",
  "prezunic":               "Prezunic",
  "guanabara":              "Guanabara",
  "supernosso":             "Supernosso",
  "super nosso":            "Supernosso",
  "pao de acucar":          "Pão de Açúcar",
  "comprebem":              "CompreBem",
  "compre bem":             "CompreBem",
  "bergamini":              "Bergamini",
  "supermercado bergamini": "Bergamini",
  "supermarket":            "Supermercado",
  "super mercado":          "Supermercado",
  "hipermercado":           "Hipermercado",
  "hiper":                  "Hipermercado",
  "dia":                    "Dia%",
  "dia%":                   "Dia%",
  "lidl":                   "Lidl",
  "aldi":                   "Aldi",
  "tenda":                  "Tenda Atacado",
  "tenda atacado":          "Tenda Atacado",
  "maxxi":                  "Maxxi Atacado",
  "maxxi atacado":          "Maxxi Atacado",
  "makro":                  "Makro",
  "costco":                 "Costco",
};

/** Strip diacritics + lower-case a string (for alias lookup only). */
function toAlias(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Canonicalises a market name.
 *
 *  1. Trim and collapse spaces
 *  2. Remove characters that are not letters, digits, spaces, apostrophes or hyphens
 *  3. Exact alias lookup (accent-insensitive)
 *  4. Fall back to title-case of the cleaned string
 *
 * @example
 *   normalizeMercado("COMPER-")   → "Comper"
 *   normalizeMercado("comper")    → "Comper"
 *   normalizeMercado("Meu Mercado local!") → "Meu Mercado Local"
 */
export function normalizeMercado(nome: string): string {
  // 1. Clean
  const clean = nome
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^a-zA-ZÀ-ÿ0-9 '&%@.-]/g, "")
    .trim();

  // 2. Alias lookup
  const key = toAlias(clean);
  const alias = MERCADO_ALIASES[key];
  if (alias) return alias;

  // 3. Title case
  return clean.replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── City normalisation ────────────────────────────────────────────────────────

/**
 * Common typo / accent-stripped → canonical city name.
 * Keys are accent-free lowercase (produced by toAlias).
 */
const CITY_FIXES: Record<string, string> = {
  "cuiaba":              "Cuiabá",
  "cuiabab":             "Cuiabá",
  "cuiabá":              "Cuiabá",
  "goiania":             "Goiânia",
  "goiânia":             "Goiânia",
  "belem":               "Belém",
  "belem do para":       "Belém",
  "belem-pa":            "Belém",
  "sao paulo":           "São Paulo",
  "são paulo":           "São Paulo",
  "sp":                  "São Paulo",
  "rio de janeiro":      "Rio de Janeiro",
  "rj":                  "Rio de Janeiro",
  "belo horizonte":      "Belo Horizonte",
  "bh":                  "Belo Horizonte",
  "fortaleza":           "Fortaleza",
  "manaus":              "Manaus",
  "salvador":            "Salvador",
  "recife":              "Recife",
  "porto alegre":        "Porto Alegre",
  "poa":                 "Porto Alegre",
  "curitiba":            "Curitiba",
  "cwb":                 "Curitiba",
  "brasilia":            "Brasília",
  "brasília":            "Brasília",
  "bsb":                 "Brasília",
  "maceio":              "Maceió",
  "maceió":              "Maceió",
  "natal":               "Natal",
  "teresina":            "Teresina",
  "campo grande":        "Campo Grande",
  "joao pessoa":         "João Pessoa",
  "joão pessoa":         "João Pessoa",
  "aracaju":             "Aracaju",
  "porto velho":         "Porto Velho",
  "boa vista":           "Boa Vista",
  "macapa":              "Macapá",
  "macapá":              "Macapá",
  "palmas":              "Palmas",
  "vitoria":             "Vitória",
  "vitória":             "Vitória",
  "florianopolis":       "Florianópolis",
  "florianópolis":       "Florianópolis",
  "floripolis":          "Florianópolis",
  "floripa":             "Florianópolis",
  "sao luis":            "São Luís",
  "são luis":            "São Luís",
  "são luís":            "São Luís",
  "rio branco":          "Rio Branco",
};

/**
 * Normalises a city name from user input:
 *  1. Trim + collapse spaces
 *  2. Exact typo/alias lookup (accent-insensitive)
 *  3. Fall back to title-case of cleaned string
 *
 * @example
 *   normalizeCity("cuiabab")   → "Cuiabá"
 *   normalizeCity("GOIANIA")   → "Goiânia"
 *   normalizeCity("sp")        → "São Paulo"
 *   normalizeCity("Joinville") → "Joinville"
 */
export function normalizeCity(raw: string): string {
  const clean = raw.trim().replace(/\s+/g, " ");
  const key = toAlias(clean);
  const fixed = CITY_FIXES[key];
  if (fixed) return fixed;
  return clean.replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Product — analytics display ───────────────────────────────────────────────

/**
 * Strips weights, volumes, units and extraneous numbers from a product name
 * so that "Chocolate Hershey's Chocotubes 25g" becomes "Chocolate Hersheys Chocotubes".
 *
 * This is intentionally different from `normalizeProductName` (used for dedup),
 * which **keeps** units for fuzzy comparison. This version is for grouping /
 * analytics where "Arroz 1kg" and "Arroz 5kg" should share the same analytics bucket.
 */
export function normalizeProductForAnalytics(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")          // strip accents
    .toLowerCase()
    // Remove weight / volume patterns  (e.g. "25g", "1.5kg", "500 ml")
    .replace(/\b\d+[\.,]?\d*\s*(kg|g|ml|l|litros?|gramas?|quilos?|quilogramas?|mililitros?|un|unidades?|packs?|cx|caixa|fardo|pacote|lata|garrafa|pote|sachet?|sache|envelope)\b/gi, "")
    // Remove isolated numbers (quantities / pack sizes / codes)
    .replace(/\b\d+\b/g, "")
    // Drop special chars (apostrophes, dots, %)
    .replace(/[^a-z0-9 ]/g, " ")
    // Collapse whitespace
    .replace(/\s+/g, " ")
    .trim();
}

// ── Brazil timezone ───────────────────────────────────────────────────────────

/**
 * Returns the start of the current day in Brasília time (BRT = UTC−3).
 *
 * Brazil abolished daylight-saving time in 2019, so the offset is always −3.
 * BRT midnight corresponds to 03:00 UTC (e.g. 00:00 BRT = 03:00 UTC).
 *
 * Use this instead of `new Date()` / `setHours(0,0,0,0)` whenever computing
 * "Ofertas Hoje", "Confirmadas Hoje", etc.
 */
export function startOfDayBRT(): Date {
  const d = new Date();
  // Set to 03:00 UTC of today (= BRT midnight)
  d.setUTCHours(3, 0, 0, 0);
  // If we haven't reached 03:00 UTC yet, the current BRT day started yesterday
  if (d > new Date()) {
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return d;
}

// ── Category detection ────────────────────────────────────────────────────────

type Categoria =
  | "Hortifruti" | "Carnes" | "Laticínios" | "Padaria"
  | "Bebidas" | "Alimentos" | "Limpeza" | "Higiene"
  | "Eletrônicos" | "Atacado" | "Pet" | "Bebê" | "Congelados" | "Outros";

interface CategoryRule {
  patterns: RegExp;
  categoria: Categoria;
}

/** Rules evaluated top-to-bottom; first match wins. */
const CATEGORY_RULES: CategoryRule[] = [
  // Pet — MUST come before Carnes/Hortifruti so "ração sabor frango" → Pet, not Carnes
  {
    patterns: /\b(racao|ração|petisco|aro\s*pet|areia\s*(gato|felina|para\s*gatos?)|antipulgas|vermifugo|vermífugo|coleira\s*anti|caes\s*adulto|para\s*caes|para\s*gatos?|alimento\s*(para\s*)?(caes|gatos?|cão|felino)|dog\s*chow|pedigree|whiskas|purina|royal\s*canin|golden\s*special)\b/i,
    categoria: "Pet",
  },
  // Bebê — before Laticínios to handle "leite infantil", "fórmula infantil"
  {
    patterns: /\b(fralda|mamadeira|chupeta|nestogeno|aptamil|milupa|formula\s*infantil|leite\s*infantil|composto\s*lacteo|papinha|mingau\s*infantil|ninho\s*fases?)\b/i,
    categoria: "Bebê",
  },
  // Congelados — specific frozen products
  {
    patterns: /\b(sorvete|gelato|acai\s*congelado|nuggets|pizza\s*(congelada?|de\s*frango|de\s*queijo|mista)|lasanha|hamburguer\s*congelado|hambúrguer\s*congelado|empanado\s*(congelado|de\s*frango|de\s*peixe)|coxinha\s*congelada|torta\s*congelada)\b/i,
    categoria: "Congelados",
  },
  // Hortifruti — fresh produce (banana/morango etc. are flavors only when no stronger context matched)
  {
    patterns: /\b(fruta|banana|maca|laranja|uva|morango|abacate|mamao|manga|melancia|melao|abacaxi|caju|goiaba|kiwi|pera|pessego|cereja|ameixa|figo|limao|acerola|maracuja|tangerina|coco|lichia|hortifruti|legum|verdura|alface|tomate|cebola|alho|batata|cenoura|brocolis|couve|espinafre|abobrinha|pepino|pimentao|quiabo|berinjela|mandioca|inhame|chuchu|jilo|beterraba|ervilha|vagem|repolho|acelga|alho-poro|cogumelo|milho verde|salsa|coentro|manjericao|gengibre|batata-doce)\b/i,
    categoria: "Hortifruti",
  },
  // Carnes — meat & fish (frango/carne here are product, not flavor — no stronger context matched above)
  {
    patterns: /\b(carne|frango|peixe|costela|alcatra|file|bifes?|linguica|salsich|bacon|presunto|salame|hamburguer|tilapia|salmao|atum|sardinha|camarao|lula|patinho|fraldinha|picanha|contra-file|acém|pernil|sobrecoxa|coxa|asa|drumette|coxinha da asa|musculo|ossobuco|tutano|boi|suino|cordeiro)\b/i,
    categoria: "Carnes",
  },
  // Laticínios — dairy
  {
    patterns: /\b(leite|queijo|iogurte|manteiga|nata|creme de leite|requeijao|muçarela|mussarela|parmesao|gouda|brie|catupiry|ricota|cottage|creme cheese|cream cheese|coalhada|kefir|sorvete|gelato|ninho|condensado|whey)\b/i,
    categoria: "Laticínios",
  },
  // Padaria — bakery
  {
    patterns: /\b(pao|paozinho|pao de forma|baguete|brioche|croissant|bolo|rosca|biscoito|cookie|torrada|broa|bisnaguinha|pao integral|pao frances|pao hamburguer|pao hot-dog|waffle|panqueca|crepe)\b/i,
    categoria: "Padaria",
  },
  // Bebidas — beverages
  {
    patterns: /\b(agua|suco|refrigerante|cerveja|vinho|whisky|vodka|rum|gin|energetico|isotônico|cha|cafe|capuccino|caldo de cana|limonada|coca.cola|pepsi|guarana|fanta|sprite|schweppes|heineken|skol|brahma|itaipava|eisenbahn|leao|mate|kombucha|caldo de cana)\b/i,
    categoria: "Bebidas",
  },
  // Limpeza — cleaning
  {
    patterns: /\b(sabao|sabonete|detergente|desinfetante|amaciante|alvejante|candida|pinho sol|veja|ajax|fairy|omo|tide|ace|brilhante|limpador|esponja|vassoura|rodo|mop|pano|flanela|papel toalha|papel higienico|guardanapo|fralda|fraldinha|faz tudo|multiuso|limpeza)\b/i,
    categoria: "Limpeza",
  },
  // Higiene — personal care
  {
    patterns: /\b(shampoo|condicionador|creme de cabelo|gel|pomada|pasta de dente|escova de dente|fio dental|desodorante|perfume|colonia|absorvente|lenco umedecido|algodao|cotonete|barbeador|lamina|espuma de barbear|hidratante|protetor solar|maquiagem|batom|base|rimel|delineador|tinturas?|henna|fixador|laquê|lacque|listerine|oral-b|colgate|sorriso|dove|nivea|garnier)\b/i,
    categoria: "Higiene",
  },
  // Eletrônicos — electronics
  {
    patterns: /\b(tv|televisao|celular|smartphone|tablet|notebook|computador|monitor|teclado|mouse|fone|headset|airpod|impressora|roteador|cabo|carregador|powerbank|alexa|google home|playstation|xbox|nintendo|camera|filmadora|drone|ar condicionado|geladeira|lavadora|microondas|fritadeira|liquidificador|batedeira|cafeteira|ventilador|aspirador)\b/i,
    categoria: "Eletrônicos",
  },
  // Atacado — bulk / wholesale
  {
    patterns: /\b(atacado|fardo|caixa com \d+|pack com \d+|kit com \d+|combo|lote|bulk|granel)\b/i,
    categoria: "Atacado",
  },
  // Alimentos — general food / catch-all
  {
    patterns: /\b(arroz|feijao|macarrao|massa|molho|farinha|acucar|sal|oleo|azeite|vinagre|ketchup|mostarda|maionese|tempero|pimenta|canela|curry|colorau|caldo|sopa|lentilha|grao de bico|quinoa|aveia|granola|cereal|muesli|amendoim|castanha|nozes|passas|chocolate|achocolatado|nescau|ovomaltine|nutella|doce de leite|geleia|mel|refresco|pó para gelatina|fermento|amido|maisena|polenta|cuscuz|tapioca|creme de arroz|ervilha|milho|palmito)\b/i,
    categoria: "Alimentos",
  },
];

/**
 * Infers a category from a product name using keyword rules.
 * Returns `null` when no rule matches (caller should keep existing category).
 */
export function detectCategoryFromProduct(produto: string): Categoria | null {
  const lower = produto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  for (const rule of CATEGORY_RULES) {
    if (rule.patterns.test(lower)) return rule.categoria;
  }
  return null;
}
