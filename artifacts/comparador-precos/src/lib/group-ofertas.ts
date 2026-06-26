import { type Oferta } from "@workspace/api-client-react";

/**
 * Brand/word synonym map — keys and values must already be diacritic-free lowercase.
 * Applied BEFORE unit and punctuation normalization so patterns match naturally.
 */
const SYNONYMS: Array<[RegExp, string]> = [
  // Beverages
  [/\bcoca\b(?!\s*cola)/g,          "coca cola"],
  [/\bpepsi cola\b/g,                "pepsi"],
  [/\brefri\b/g,                     "refrigerante"],
  [/\brefrig\b/g,                    "refrigerante"],
  [/\bsuco de laranja\b/g,           "suco laranja"],
  [/\bsuco de uva\b/g,               "suco uva"],
  [/\bsuco de manga\b/g,             "suco manga"],
  [/\bnescau\b/g,                    "achocolatado"],
  [/\bovomaltine\b/g,                "achocolatado"],
  // Dairy
  [/\bleite integral\b/g,            "leite integral"],
  [/\bleite semi\b/g,                "leite semidesnatado"],
  [/\bleite desnatado\b/g,           "leite desnatado"],
  [/\bqueijo prato\b/g,              "queijo prato"],
  [/\bqueijo mussarela\b/g,          "queijo mussarela"],
  [/\bmussarela\b/g,                 "queijo mussarela"],
  // Oils & condiments
  [/\boleo de soja\b/g,              "oleo soja"],
  [/\bazeite de oliva\b/g,           "azeite"],
  // Grains
  [/\barroz branco\b/g,              "arroz"],
  [/\bfeijao carioca\b/g,            "feijao"],
  [/\bfeijao preto\b/g,              "feijao preto"],
  // Cleaning
  [/\bdetergente liquido\b/g,        "detergente"],
  [/\bsabao em po\b/g,               "sabao po"],
  [/\bsabao liquido\b/g,             "sabao liquido"],
  // Hygiene
  [/\bpasta de dente\b/g,            "creme dental"],
  [/\bcreme dental\b/g,              "creme dental"],
  [/\bpapel higienico\b/g,           "papel higienico"],
  [/\bpapel hig\b/g,                 "papel higienico"],
  // Meat
  [/\bfrango inteiro\b/g,            "frango"],
  [/\bcarne bovina\b/g,              "carne"],
  [/\bcarne de boi\b/g,              "carne"],
];

/**
 * Normalizes a product name for grouping:
 * - lowercases + removes accents
 * - synonym normalization (e.g. "coca" → "coca cola", "refri" → "refrigerante")
 * - unit normalization: "2 litros" → "2l", "500 ml" → "500ml", "1 kg" → "1kg"
 * - removes punctuation / hyphens
 * - collapses whitespace
 */
export function normalizeKey(s: string): string {
  let result = s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");    // strip diacritics

  // Apply synonym substitutions
  for (const [pattern, replacement] of SYNONYMS) {
    result = result.replace(pattern, replacement);
  }

  return result
    // ── Unit normalization (must run before punctuation stripping) ──
    .replace(/(\d+)\s*litros?\b/g, "$1l")
    .replace(/(\d+)\s*quilogramas?\b/g, "$1kg")
    .replace(/(\d+)\s*quilos?\b/g, "$1kg")
    .replace(/(\d+)\s*gramas?\b/g, "$1g")
    .replace(/(\d+)\s*mililitros?\b/g, "$1ml")
    .replace(/(\d+)\s*ml\b/g, "$1ml")
    .replace(/(\d+)\s*kg\b/g, "$1kg")
    .replace(/(\d+)\s*g\b/g, "$1g")
    .replace(/(\d+)\s*l\b/g, "$1l")
    // ── Remove singular/plural trailing 's' on simple words ──
    .replace(/\b(\w{4,})s\b/g, "$1")
    // ── Strip punctuation / hyphens ──
    .replace(/[-_.,;:!?'"()/\\+&]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Builds a brand-aware grouping key.
 *
 * When `marca` is present, we strip it from the product name before normalizing
 * so that "Ypê Detergente 500ml" and "Detergente Ypê 500ml" produce the same key,
 * while "Ypê Detergente 500ml" vs "Ypê Amaciante 2L" correctly stay separate.
 */
function buildGroupKey(o: Oferta): string {
  const prodNorm = normalizeKey(o.produto);

  if (o.marca) {
    const marcaNorm = normalizeKey(o.marca);
    // Remove brand tokens from the normalized product name
    const withoutBrand = prodNorm
      .replace(new RegExp(`\\b${marcaNorm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"), "")
      .replace(/\s+/g, " ")
      .trim();

    // Only use brand-aware key when there's a meaningful product description left
    if (withoutBrand.length >= 3) {
      return `${marcaNorm}||${withoutBrand}`;
    }
  }

  return prodNorm;
}

/**
 * Score for ranking / comparing offers within a group.
 * Lower = better.
 * Expired offers are always last (Infinity).
 */
export function ofertaCompareScore(o: Oferta): number {
  if (o.status === "expirada") return Infinity;
  const confianca = Math.max(0, (o.validacoes * 2 + o.curtidas) - (o.denuncias * 3));
  const dist = o.distancia ?? 0;
  return (o.preco * (1 + 0.15 * dist)) / (1 + confianca * 0.05);
}

export interface GrupoOferta {
  key: string;
  produto: string;
  categoria: string;
  ofertas: Oferta[];
  best: Oferta;
  count: number;
  /** Total number of raw publications before per-market deduplication */
  totalPublicacoes: number;
  minPreco: number;
  maxPreco: number;
  avgPreco: number;
  savings: number;
  /** True if the best offer was validated in the last 24 h */
  confirmadoHoje: boolean;
  /** Highest curtidas count in the group */
  maxCurtidas: number;
  /** Total confirmations across all offers in the group */
  totalConfirmacoes: number;
}

export function groupOfertas(ofertas: Oferta[]): GrupoOferta[] {
  if (!ofertas.length) return [];

  const map = new Map<string, Oferta[]>();
  for (const o of ofertas) {
    const key = buildGroupKey(o);
    const arr = map.get(key) ?? [];
    arr.push(o);
    map.set(key, arr);
  }

  const grupos: GrupoOferta[] = [];

  for (const [key, arr] of map) {
    const totalPublicacoes = arr.length;

    // De-duplicate by mercado (keep the most validated / most recent)
    const byMercado = new Map<string, Oferta>();
    for (const o of arr) {
      const mk = normalizeKey(o.mercado);
      const ex = byMercado.get(mk);
      if (
        !ex ||
        o.validacoes > ex.validacoes ||
        (o.validacoes === ex.validacoes &&
          new Date(o.dataCriacao) > new Date(ex.dataCriacao))
      ) {
        byMercado.set(mk, o);
      }
    }

    const deduped = Array.from(byMercado.values());
    deduped.sort((a, b) => ofertaCompareScore(a) - ofertaCompareScore(b));

    const best = deduped[0];
    const prices = deduped.map((o) => o.preco);
    const minPreco = Math.min(...prices);
    const maxPreco = Math.max(...prices);
    const avgPreco = prices.reduce((sum, p) => sum + p, 0) / prices.length;
    const maxCurtidas = Math.max(...deduped.map((o) => o.curtidas));
    const totalConfirmacoes = deduped.reduce((sum, o) => sum + (o.confirmacoes ?? 0), 0);

    const confirmadoHoje = deduped.some((o) => {
      if (!o.ultimaValidacaoEm) return false;
      const diff = Date.now() - new Date(o.ultimaValidacaoEm).getTime();
      return diff < 24 * 60 * 60 * 1000;
    });

    grupos.push({
      key,
      produto: best.produto,
      categoria: best.categoria,
      ofertas: deduped,
      best,
      count: deduped.length,
      totalPublicacoes,
      minPreco,
      maxPreco,
      avgPreco,
      savings: maxPreco - minPreco,
      confirmadoHoje,
      maxCurtidas,
      totalConfirmacoes,
    });
  }

  grupos.sort((a, b) => ofertaCompareScore(a.best) - ofertaCompareScore(b.best));
  return grupos;
}
