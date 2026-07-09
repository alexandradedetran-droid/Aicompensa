import { db, pool, productImageCandidatesTable } from "@workspace/db";
import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { normalizeProductName } from "./dedup";
import { extractQuantityG, normalizeForMatch, normalizeText } from "./off-normalize";
import { resolveProduct } from "./off-product-resolver";
import { logger } from "./logger";

export type OfferImageOrigin =
  | "catalogo_interno"
  | "site_mercado"
  | "open_food_facts"
  | "folheto_crop"
  | "usuario_upload"
  | "sem_imagem";

type CandidateSourceType = "off_catalog" | "site_candidate" | "internal_candidate";

interface FlyerImageCandidate {
  url: string;
  origin: OfferImageOrigin;
  sourceType: CandidateSourceType;
  name: string;
  brand?: string | null;
  category?: string | null;
  quantityText?: string | null;
  status?: string | null;
  sourceLabel?: string | null;
}

export interface ResolveFlyerImageInput {
  produto: string;
  produtoNormalizado?: string | null;
  marca?: string | null;
  categoria?: string | null;
  unidade?: string | null;
  cropUrl?: string | null;
}

export interface ResolveFlyerImageResult {
  imagemResolvidaUrl: string | null;
  origemImagem: OfferImageOrigin;
  imagemMatchScore: number | null;
  imagemRevisaoPendente: boolean;
  imagemSugeridaUrl: string | null;
  imagemSugeridaOrigem: OfferImageOrigin | null;
  imagemResolucaoMeta: Record<string, unknown>;
}

interface VariantProfile {
  lactose?: "zero_lactose";
  acucar?: "zero" | "diet";
  leite?: "integral" | "semi" | "desnatado";
}

const STOPWORDS = new Set([
  "de", "do", "da", "dos", "das", "com", "sem", "para", "em", "no", "na",
  "nos", "nas", "o", "a", "os", "as", "e", "ou", "ao", "aos", "um", "uma",
  "tipo", "tradicional", "oferta", "promo", "promocao", "leve",
]);

const KNOWN_BRANDS = new Set([
  "nescau", "xaropinho", "seara", "excelsior", "sadia", "perdigao", "aurora",
  "nestle", "italac", "piracanjuba", "tirol", "elege", "lacta", "garoto",
  "pilao", "3 coracoes", "melitta", "heineken", "coca cola", "pepsi",
]);

const GENERIC_PRODUCT_TOKENS = new Set([
  "achocolatado", "chocolate", "cacau", "po", "pizza", "calabresa", "mussarela",
  "congelada", "congelado", "lata", "garrafa", "pacote", "caixa", "pote",
]);

function tokenize(text: string): string[] {
  return normalizeForMatch(text)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

function extractKnownBrands(text: string): Set<string> {
  const normalized = normalizeText(text);
  const found = new Set<string>();
  for (const brand of KNOWN_BRANDS) {
    const pattern = new RegExp(`(^|\\s)${brand.replace(/\\s+/g, "\\\\s+")}(\\s|$)`);
    if (pattern.test(normalized)) found.add(brand);
  }
  return found;
}

function hasBrandConflict(offerText: string, candidate: FlyerImageCandidate, marca?: string | null): boolean {
  const offerBrands = extractKnownBrands(`${offerText} ${marca ?? ""}`);
  const candidateBrands = extractKnownBrands(`${candidate.name} ${candidate.brand ?? ""}`);
  const explicitMarca = marca ? normalizeText(marca) : "";

  if (explicitMarca) offerBrands.add(explicitMarca);
  if (candidate.brand) candidateBrands.add(normalizeText(candidate.brand));
  if (offerBrands.size === 0 || candidateBrands.size === 0) return false;

  return ![...offerBrands].some((brand) => candidateBrands.has(brand));
}

function buildVariantProfile(text: string): VariantProfile {
  const normalized = normalizeText(text);
  return {
    lactose: /\b(sem lactose|zero lactose|lactose free)\b/.test(normalized) ? "zero_lactose" : undefined,
    acucar: /\bdiet\b/.test(normalized)
      ? "diet"
      : /\b(zero|sem acucar|sem açucar)\b/.test(normalized)
        ? "zero"
        : undefined,
    leite: /\bsemi\b/.test(normalized)
      ? "semi"
      : /\bdesnatado\b/.test(normalized)
        ? "desnatado"
        : /\bintegral\b/.test(normalized)
          ? "integral"
          : undefined,
  };
}

function hasVariantConflict(offerText: string, candidateText: string): boolean {
  const offer = buildVariantProfile(offerText);
  const candidate = buildVariantProfile(candidateText);

  if (offer.lactose && offer.lactose !== candidate.lactose) return true;
  if (offer.acucar && offer.acucar !== candidate.acucar) return true;
  if (offer.leite && offer.leite !== candidate.leite) return true;

  return false;
}

function parseCountQuantity(text: string | null | undefined): number | null {
  if (!text) return null;
  const match = normalizeText(text).match(/(\d+[,.]?\d*)\s*(un|und|unid|cada|cx|caixa|pack|pct|pacote|lata|garrafa|pote)\b/);
  if (!match) return null;
  const value = Number(match[1]!.replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function quantitiesConflict(offerText: string, candidateText?: string | null, unidade?: string | null): boolean {
  if (!candidateText) return false;

  const offerMass = extractQuantityG(`${offerText} ${unidade ?? ""}`);
  const candidateMass = extractQuantityG(candidateText);
  if (offerMass !== null && candidateMass !== null) {
    return Math.abs(offerMass - candidateMass) > Math.max(10, candidateMass * 0.02);
  }

  const offerCount = parseCountQuantity(`${offerText} ${unidade ?? ""}`);
  const candidateCount = parseCountQuantity(candidateText);
  if (offerCount !== null && candidateCount !== null) {
    return Math.abs(offerCount - candidateCount) > 0.001;
  }

  return false;
}

function calculateMatchScore(
  offerText: string,
  candidate: FlyerImageCandidate,
  marca?: string | null,
  categoria?: string | null,
  unidade?: string | null,
): number {
  if (hasBrandConflict(offerText, candidate, marca)) return 0;
  if (hasVariantConflict(offerText, candidate.name)) return 0;
  if (quantitiesConflict(offerText, candidate.quantityText ?? candidate.name, unidade)) return 0;

  const offerTokens = tokenize(offerText);
  const candidateTokens = tokenize(candidate.name);
  if (offerTokens.length === 0 || candidateTokens.length === 0) return 0;

  const offerSet = new Set(offerTokens);
  const candidateSet = new Set(candidateTokens);
  const intersection = [...offerSet].filter((token) => candidateSet.has(token)).length;
  const distinctiveIntersection = [...offerSet].filter((token) => candidateSet.has(token) && !GENERIC_PRODUCT_TOKENS.has(token)).length;
  const union = new Set([...offerSet, ...candidateSet]).size;
  const jaccard = union > 0 ? intersection / union : 0;
  const containment = offerSet.size > 0 ? intersection / offerSet.size : 0;

  if (intersection < 2 && normalizeProductName(offerText) !== normalizeProductName(candidate.name)) return 0;
  if (distinctiveIntersection === 0 && !marca) return Math.min(0.64, Math.max(jaccard, containment * 0.7));

  let score = Math.max(jaccard, containment * 0.92);

  const normalizedOffer = normalizeProductName(offerText);
  const normalizedCandidate = normalizeProductName(candidate.name);
  if (normalizedOffer === normalizedCandidate) score += 0.18;
  else if (normalizedCandidate.includes(normalizedOffer) || normalizedOffer.includes(normalizedCandidate)) score += 0.08;

  if (marca && candidate.brand && normalizeText(marca) === normalizeText(candidate.brand)) score += 0.10;
  if (categoria && candidate.category && normalizeText(categoria) === normalizeText(candidate.category)) score += 0.05;

  if (candidate.origin === "catalogo_interno") score += 0.12;
  if (candidate.origin === "site_mercado") score += 0.08;
  if (candidate.origin === "open_food_facts") score += 0.06;
  if (candidate.origin === "usuario_upload") score += 0.07;

  if (candidate.status === "selected" || candidate.status === "oficial" || candidate.status === "aprovado") score += 0.08;

  return Math.max(0, Math.min(0.99, score));
}

async function loadCatalogCandidates(
  produto: string,
  resolvedBarcode: string | null,
): Promise<FlyerImageCandidate[]> {
  const candidates: FlyerImageCandidate[] = [];

  if (resolvedBarcode) {
    const { rows } = await pool.query<{
      name: string;
      brand: string | null;
      category: string | null;
      quantity: string | null;
      image_url: string | null;
      image_source: string | null;
      image_status: string | null;
    }>(
      `SELECT p.name,
              p.brand,
              p.category,
              p.quantity,
              COALESCE(i.r2_url, i.off_image_url) AS image_url,
              i.image_source,
              i.image_status
         FROM off_product_images i
         JOIN off_products p ON p.barcode = i.barcode
        WHERE i.barcode = $1
          AND p.is_deleted = FALSE
          AND COALESCE(i.image_status, 'candidate') != 'rejected'
          AND COALESCE(i.image_source, 'OFF') != 'AI'
        ORDER BY CASE
          WHEN i.image_status = 'selected' THEN 0
          WHEN i.image_source IN ('ADMIN', 'ADMIN_UPLOAD', 'CATALOG', 'BRAND') THEN 1
          WHEN i.image_source = 'USER' THEN 2
          ELSE 3
        END,
        COALESCE(i.quality_score, 0) DESC,
        i.id DESC
        LIMIT 12`,
      [resolvedBarcode],
    );

    for (const row of rows) {
      if (!row.image_url) continue;
      const origin: OfferImageOrigin =
        row.image_source === "OFF"
          ? "open_food_facts"
          : row.image_source === "USER"
            ? "usuario_upload"
            : "catalogo_interno";

      candidates.push({
        url: row.image_url,
        origin,
        sourceType: "off_catalog",
        name: row.name,
        brand: row.brand,
        category: row.category,
        quantityText: row.quantity,
        status: row.image_status,
        sourceLabel: row.image_source,
      });
    }
  }

  const normalized = normalizeProductName(produto);
  const localCandidates = await db
    .select({
      imageUrl: productImageCandidatesTable.imageUrl,
      origem: productImageCandidatesTable.origem,
      status: productImageCandidatesTable.status,
      produtoNormalizado: productImageCandidatesTable.produtoNormalizado,
    })
    .from(productImageCandidatesTable)
    .where(
      and(
        inArray(productImageCandidatesTable.status, ["oficial", "aprovado", "candidato"]),
        or(
          eq(productImageCandidatesTable.produtoNormalizado, normalized),
          ilike(productImageCandidatesTable.produtoNormalizado, `${normalized}%`),
        ),
      ),
    )
    .orderBy(desc(productImageCandidatesTable.updatedAt))
    .limit(12);

  for (const row of localCandidates) {
    if (!row.imageUrl || !row.produtoNormalizado) continue;

    let origin: OfferImageOrigin;
    if (row.origem === "site_mercado") origin = "site_mercado";
    else if (row.origem === "usuario") origin = "usuario_upload";
    else origin = "catalogo_interno";

    candidates.push({
      url: row.imageUrl,
      origin,
      sourceType: row.origem === "site_mercado" ? "site_candidate" : "internal_candidate",
      name: row.produtoNormalizado,
      quantityText: row.produtoNormalizado,
      status: row.status,
      sourceLabel: row.origem,
    });
  }

  const deduped = new Map<string, FlyerImageCandidate>();
  for (const candidate of candidates) {
    if (!deduped.has(candidate.url)) deduped.set(candidate.url, candidate);
  }

  return [...deduped.values()];
}

export async function resolveFlyerOfferImage(input: ResolveFlyerImageInput): Promise<ResolveFlyerImageResult> {
  const offerText = input.produtoNormalizado?.trim() || input.produto.trim();
  const normalizedOffer = normalizeProductName(offerText);

  let resolvedBarcode: string | null = null;
  let resolvedName: string | null = null;
  let resolverConfidence: number | null = null;

  try {
    const resolved = await resolveProduct({
      rawName: offerText,
      source: "flyer",
    });

    resolvedBarcode = resolved.productId;
    resolvedName = resolved.canonicalName;
    resolverConfidence = resolved.confidence;
  } catch (error) {
    logger.warn({ error, produto: offerText }, "[flyer-image] product resolver failed");
  }

  const candidates = await loadCatalogCandidates(offerText, resolverConfidence && resolverConfidence >= 0.65 ? resolvedBarcode : null);

  const ranked = candidates
    .map((candidate) => ({
      candidate,
      score: calculateMatchScore(
        offerText,
        candidate,
        input.marca,
        input.categoria,
        input.unidade,
      ),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const best = ranked[0] ?? null;
  const reviewCandidate = best && best.score >= 0.65 && best.score < 0.85 ? best : null;
  const autoCandidate = best && best.score >= 0.85 ? best : null;

  const imagemResolvidaUrl = autoCandidate ? autoCandidate.candidate.url : null;

  const origemImagem: OfferImageOrigin = autoCandidate
    ? autoCandidate.candidate.origin
    : "sem_imagem";

  const imagemRevisaoPendente = Boolean(reviewCandidate);
  const imagemSugeridaUrl = reviewCandidate?.candidate.url ?? null;
  const imagemSugeridaOrigem = reviewCandidate?.candidate.origin ?? null;
  const imagemMatchScore = autoCandidate?.score ?? reviewCandidate?.score ?? null;

  return {
    imagemResolvidaUrl,
    origemImagem,
    imagemMatchScore,
    imagemRevisaoPendente,
    imagemSugeridaUrl,
    imagemSugeridaOrigem,
    imagemResolucaoMeta: {
      normalizedOffer,
      resolver: {
        barcode: resolvedBarcode,
        canonicalName: resolvedName,
        confidence: resolverConfidence,
      },
      topCandidate: best
        ? {
            url: best.candidate.url,
            origin: best.candidate.origin,
            sourceType: best.candidate.sourceType,
            score: best.score,
            sourceLabel: best.candidate.sourceLabel,
          }
        : null,
      candidatesConsidered: ranked.slice(0, 5).map((entry) => ({
        url: entry.candidate.url,
        origin: entry.candidate.origin,
        sourceType: entry.candidate.sourceType,
        score: entry.score,
        status: entry.candidate.status ?? null,
      })),
      fallback: imagemResolvidaUrl ? origemImagem : "sem_imagem",
    },
  };
}
