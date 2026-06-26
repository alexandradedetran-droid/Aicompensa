/**
 * @workspace/synonyms
 *
 * Shared synonym / slang expansion dictionary for the AíCompensa search stack.
 * Used by: api-server (search-expand, alertas) and comparador-precos (lista matching).
 *
 * All keys and canonical values are pre-normalized (no accents, lowercase).
 * Call norm() on raw user input before any lookup.
 */

/** Strip accents + lowercase + trim */
export function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

export interface SynonymExpansion {
  /** Primary search term (may differ from raw input when slang detected) */
  canonical: string;
  /** Additional OR terms (brand synonyms, related names, alternative spellings) */
  extras: string[];
  /** True when the input was recognized as slang or abbreviation */
  wasSlang: boolean;
}

// ── Slang / abbreviation dictionary ───────────────────────────────────────────
// Keys: pre-normalized (norm() already applied).
// canonical: best search term to substitute.
// extras: additional OR conditions to improve recall.
const SLANG: Record<string, { canonical: string; extras?: string[] }> = {

  // ── Bebidas ────────────────────────────────────────────────────────────────
  breja:              { canonical: "cerveja" },
  "breja gelada":     { canonical: "cerveja" },
  birra:              { canonical: "cerveja" },
  refri:              { canonical: "refrigerante" },
  refries:            { canonical: "refrigerante" },
  refrig:             { canonical: "refrigerante" },
  "agua com gas":     { canonical: "agua mineral", extras: ["agua gaseificada"] },
  energetico:         { canonical: "energetico", extras: ["red bull", "monster"] },
  isoton:             { canonical: "isotonico", extras: ["gatorade", "powerade"] },

  // ── Laticínios ─────────────────────────────────────────────────────────────
  moca:               { canonical: "leite condensado", extras: ["moca", "nestlé"] },
  "leite moca":       { canonical: "leite condensado", extras: ["moca"] },
  "leite cond":       { canonical: "leite condensado" },
  "creme leite":      { canonical: "creme de leite" },
  iogur:              { canonical: "iogurte" },
  queijinho:          { canonical: "queijo", extras: ["polenguinho", "queijo petit"] },
  polenguinho:        { canonical: "queijo", extras: ["polenguinho"] },
  requeijinho:        { canonical: "requeijao" },

  // ── Alimentos ──────────────────────────────────────────────────────────────
  nescau:             { canonical: "nescau", extras: ["achocolatado", "chocolate em po"] },
  neston:             { canonical: "nescau", extras: ["neston", "achocolatado"] },
  toddy:              { canonical: "toddy", extras: ["achocolatado"] },
  bisca:              { canonical: "biscoito", extras: ["bolacha"] },
  bolacha:            { canonical: "biscoito", extras: ["bolacha"] },
  salgadinho:         { canonical: "salgadinho", extras: ["chips", "batata frita"] },
  chips:              { canonical: "chips", extras: ["salgadinho", "batata frita"] },
  "oleo soja":        { canonical: "oleo de soja" },
  "azeite oliva":     { canonical: "azeite de oliva", extras: ["azeite"] },
  "extrato tomate":   { canonical: "extrato de tomate", extras: ["molho tomate", "polpa tomate"] },
  ketchup:            { canonical: "ketchup", extras: ["molho tomate", "heinz"] },
  maionese:           { canonical: "maionese", extras: ["hellmanns"] },
  mostarda:           { canonical: "mostarda" },
  caldo:              { canonical: "caldo", extras: ["knorr", "maggi", "tempero"] },
  tempero:            { canonical: "tempero", extras: ["knorr", "maggi", "caldo"] },
  miojo:              { canonical: "miojo", extras: ["macarrao instantaneo", "lamen"] },
  lamen:              { canonical: "lamen", extras: ["macarrao instantaneo", "miojo"] },
  "macarrao inst":    { canonical: "macarrao instantaneo", extras: ["miojo", "lamen"] },

  // ── Higiene ────────────────────────────────────────────────────────────────
  papel:              { canonical: "papel higienico", extras: ["papel toalha", "guardanapo"] },
  "papel hig":        { canonical: "papel higienico" },
  "papel higi":       { canonical: "papel higienico" },
  "papel toalha":     { canonical: "papel toalha", extras: ["papel multiuso"] },
  guardanapo:         { canonical: "guardanapo", extras: ["papel toalha"] },
  det:                { canonical: "detergente" },
  sham:               { canonical: "shampoo" },
  xampu:              { canonical: "shampoo" },
  condicio:           { canonical: "condicionador" },
  "pasta dente":      { canonical: "creme dental", extras: ["pasta de dente"] },
  pasta:              { canonical: "creme dental", extras: ["pasta de dente"] },
  desodor:            { canonical: "desodorante" },
  "sabao liquido":    { canonical: "sabao liquido", extras: ["sabao gel"] },
  "sabao po":         { canonical: "sabao em po", extras: ["detergente po"] },
  alcool:             { canonical: "alcool", extras: ["alcool gel", "alcool 70"] },
  "alcool gel":       { canonical: "alcool gel", extras: ["alcool 70", "alcool"] },
  lenco:              { canonical: "lenco umedecido", extras: ["toalha umedecida"] },
  "lenco umedecido":  { canonical: "lenco umedecido", extras: ["toalha umedecida"] },
  absorvente:         { canonical: "absorvente", extras: ["always", "intimus"] },
  fralda:             { canonical: "fralda", extras: ["pampers", "huggies"] },

  // ── Limpeza ────────────────────────────────────────────────────────────────
  esponja:            { canonical: "esponja", extras: ["esponja de aco", "palha de aco"] },
  "palha aco":        { canonical: "palha de aco", extras: ["esponja aco", "bombril"] },
  bombril:            { canonical: "bombril", extras: ["palha de aco", "esponja aco"] },
  limpador:           { canonical: "limpador", extras: ["multiuso", "veja", "pinho sol"] },
  multiuso:           { canonical: "multiuso", extras: ["limpador", "veja"] },
  desinfetante:       { canonical: "desinfetante", extras: ["pinho sol"] },
  "pinho sol":        { canonical: "pinho sol", extras: ["desinfetante"] },
  amaciante:          { canonical: "amaciante", extras: ["downy", "comfort", "fofo"] },
  sanitaria:          { canonical: "agua sanitaria", extras: ["candida", "cloro"] },
  "agua sanitaria":   { canonical: "agua sanitaria", extras: ["candida", "cloro"] },

  // ── Marcas conhecidas como produto ────────────────────────────────────────
  coca:               { canonical: "coca cola", extras: ["refrigerante"] },
  "coca cola":        { canonical: "coca cola", extras: ["refrigerante"] },
  pepsi:              { canonical: "pepsi", extras: ["refrigerante"] },
  skol:               { canonical: "skol", extras: ["cerveja"] },
  brahma:             { canonical: "brahma", extras: ["cerveja"] },
  heineken:           { canonical: "heineken", extras: ["cerveja"] },
  budweiser:          { canonical: "budweiser", extras: ["cerveja"] },
  itaipava:           { canonical: "itaipava", extras: ["cerveja"] },
  amstel:             { canonical: "amstel", extras: ["cerveja"] },
  original:           { canonical: "cerveja original", extras: ["cerveja"] },
  guarana:            { canonical: "guarana", extras: ["refrigerante", "guarana antarctica"] },
  sprite:             { canonical: "sprite", extras: ["refrigerante"] },
  fanta:              { canonical: "fanta", extras: ["refrigerante"] },
  "red bull":         { canonical: "red bull", extras: ["energetico"] },
  monster:            { canonical: "monster", extras: ["energetico"] },
  gatorade:           { canonical: "gatorade", extras: ["isotonico"] },
  powerade:           { canonical: "powerade", extras: ["isotonico"] },
  tang:               { canonical: "tang", extras: ["refresco", "suco po"] },
  clight:             { canonical: "clight", extras: ["refresco", "suco po"] },
  // Limpeza
  ype:                { canonical: "ype", extras: ["detergente", "sabao", "amaciante"] },
  ariel:              { canonical: "ariel", extras: ["sabao em po", "detergente"] },
  veja:               { canonical: "veja", extras: ["limpador", "multiuso"] },
  ajax:               { canonical: "ajax", extras: ["limpador", "desengordurante"] },
  downy:              { canonical: "downy", extras: ["amaciante"] },
  comfort:            { canonical: "comfort", extras: ["amaciante"] },
  fofo:               { canonical: "fofo", extras: ["amaciante"] },
  candida:            { canonical: "candida", extras: ["agua sanitaria"] },
  // Higiene
  pampers:            { canonical: "pampers", extras: ["fralda"] },
  huggies:            { canonical: "huggies", extras: ["fralda"] },
  johnsons:           { canonical: "johnsons", extras: ["sabonete", "shampoo", "talco"] },
  gillette:           { canonical: "gillette", extras: ["aparelho barbear", "creme barbear"] },
  seda:               { canonical: "seda", extras: ["shampoo", "condicionador"] },
  pantene:            { canonical: "pantene", extras: ["shampoo", "condicionador"] },
  "head shoulders":   { canonical: "head shoulders", extras: ["shampoo"] },
  dove:               { canonical: "dove", extras: ["sabonete", "shampoo", "desodorante"] },
  nivea:              { canonical: "nivea", extras: ["creme", "desodorante", "hidratante"] },
  colgate:            { canonical: "colgate", extras: ["creme dental"] },
  oral:               { canonical: "oral b", extras: ["creme dental", "escova"] },
  "oral b":           { canonical: "oral b", extras: ["creme dental", "escova"] },
  rexona:             { canonical: "rexona", extras: ["desodorante"] },
  axe:                { canonical: "axe", extras: ["desodorante"] },
  // Papel
  pom:                { canonical: "pom pom", extras: ["papel higienico"] },
  "pom pom":          { canonical: "pom pom", extras: ["papel higienico"] },
  neve:               { canonical: "neve", extras: ["papel higienico"] },
  scott:              { canonical: "scott", extras: ["papel toalha", "papel higienico"] },
  elegance:           { canonical: "elegance", extras: ["papel higienico"] },
  // Alimentos
  hellmanns:          { canonical: "hellmanns", extras: ["maionese"] },
  heinz:              { canonical: "heinz", extras: ["ketchup", "molho"] },
  maggi:              { canonical: "maggi", extras: ["caldo", "tempero", "molho"] },
  knorr:              { canonical: "knorr", extras: ["caldo", "tempero"] },
  qualy:              { canonical: "qualy", extras: ["margarina"] },
  doriana:            { canonical: "doriana", extras: ["margarina"] },
  becel:              { canonical: "becel", extras: ["margarina"] },
  fleischmann:        { canonical: "fleischmann", extras: ["margarina"] },
  nescafe:            { canonical: "nescafe", extras: ["cafe soluvel", "cafe instantaneo"] },
  pilao:              { canonical: "pilao", extras: ["cafe", "cafe moido"] },
  "cafe pilao":       { canonical: "pilao", extras: ["cafe"] },
  "cafe moka":        { canonical: "moka", extras: ["cafe"] },
  camil:              { canonical: "camil", extras: ["arroz", "feijao"] },
  "tio joao":         { canonical: "tio joao", extras: ["arroz"] },
  kicaldo:            { canonical: "kicaldo", extras: ["feijao", "arroz"] },
  gallo:              { canonical: "gallo", extras: ["azeite"] },
  soya:               { canonical: "soya", extras: ["oleo de soja"] },
  liza:               { canonical: "liza", extras: ["oleo", "margarina"] },
  nissin:             { canonical: "nissin", extras: ["miojo", "macarrao instantaneo"] },
  kitano:             { canonical: "kitano", extras: ["tempero", "sal"] },
  sazon:              { canonical: "sazon", extras: ["tempero"] },
  quaker:             { canonical: "quaker", extras: ["aveia", "cereal"] },
  sucrilhos:          { canonical: "sucrilhos", extras: ["cereal"] },
  mucilon:            { canonical: "mucilon", extras: ["cereal infantil"] },
  // Congelados / Fast
  sadia:              { canonical: "sadia", extras: ["frango", "linguica", "pizza", "hamburguer"] },
  perdigao:           { canonical: "perdigao", extras: ["frango", "linguica", "frios"] },
  seara:              { canonical: "seara", extras: ["frango", "hamburguer", "nuggets"] },
  macedo:             { canonical: "macedo", extras: ["frango"] },
  aurora:             { canonical: "aurora", extras: ["presunto", "salsicha"] },
};

// ── Prefix map (user types partial word) ──────────────────────────────────────
// Maps normalized prefix → expanded canonical.
// Only short unambiguous prefixes that wouldn't collide with real product names.
const PREFIX_EXPAND: Record<string, string> = {
  "refri":    "refrigerante",
  "cerv":     "cerveja",
  "iogur":    "iogurte",
  "condi":    "condicionador",
  "desod":    "desodorante",
  "absol":    "absorvente",
  "desen":    "desengordurante",
  "deterg":   "detergente",
  "amaci":    "amaciante",
};

/**
 * Expand a raw search query into synonym terms.
 *
 * Steps:
 *  1. Normalize input (lowercase + strip accents).
 *  2. Full-string lookup in SLANG dict.
 *  3. If multi-word, check if first word is slang (e.g. "refri coca" → "refrigerante coca").
 *  4. Prefix check for recognizable short prefixes.
 *  5. Fallback: return original normalized term unchanged.
 */
export function expandQuery(raw: string): SynonymExpansion {
  const n = norm(raw);
  if (!n) return { canonical: "", extras: [], wasSlang: false };

  // 1. Full-string slang match
  const full = SLANG[n];
  if (full) {
    return { canonical: full.canonical, extras: full.extras ?? [], wasSlang: true };
  }

  // 2. Multi-word: check if first word is slang (e.g. "breja gelada heineken")
  const words = n.split(/\s+/);
  if (words.length > 1) {
    const firstSlang = SLANG[words[0]!];
    if (firstSlang) {
      const rest = words.slice(1).join(" ");
      return {
        canonical: `${firstSlang.canonical} ${rest}`.trim(),
        extras: firstSlang.extras ?? [],
        wasSlang: true,
      };
    }
  }

  // 3. Prefix expansion (e.g. "refri" → "refrigerante")
  for (const [prefix, expanded] of Object.entries(PREFIX_EXPAND)) {
    if (n === prefix || n.startsWith(prefix + " ")) {
      const suffix = n.slice(prefix.length).trim();
      return {
        canonical: suffix ? `${expanded} ${suffix}` : expanded,
        extras: [],
        wasSlang: true,
      };
    }
  }

  // 4. No expansion found — return as-is
  return { canonical: n, extras: [], wasSlang: false };
}

/**
 * Get all normalized search terms for a query.
 * Returns [canonical, ...extras, originalNorm] deduplicated.
 * The first item is always the best/primary term.
 */
export function getAllSearchTerms(raw: string): string[] {
  const n = norm(raw);
  if (!n) return [];
  const { canonical, extras } = expandQuery(raw);
  const all: string[] = [canonical, ...extras];
  if (!all.includes(n)) all.push(n);
  return [...new Set(all)];
}

/**
 * Client-side: check if an offer produto matches a search query,
 * considering synonyms. Returns match tier:
 *  0 = no match
 *  1 = synonym/extra match
 *  2 = canonical match
 *  3 = exact (original query) match
 */
export function matchTier(ofertaProduto: string, raw: string): 0 | 1 | 2 | 3 {
  const prodNorm = norm(ofertaProduto);
  const n = norm(raw);
  if (!n) return 0;

  const { canonical, extras } = expandQuery(raw);

  // Tier 3: matches the original raw term directly
  if (prodNorm.includes(n)) return 3;

  // Tier 2: matches canonical expansion
  if (canonical !== n && prodNorm.includes(canonical)) return 2;

  // Tier 1: matches any extra synonym
  for (const extra of extras) {
    if (prodNorm.includes(extra)) return 1;
  }

  return 0;
}
