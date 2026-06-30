/**
 * Atacadão VTEX GraphQL scraper — no browser needed.
 *
 * Uses the same API endpoints the site calls internally.
 * Parameters (seller, regionId) were captured from live network traffic
 * by scrape-atacadao.ts on 2026-06-30. Stable across VTEX platforms.
 *
 * Two store contexts exist in the wild:
 *   atacadaobr927 — serves category pages (category-1 facet)
 *   atacadaobr60  — serves cluster pages (productClusterIds facet)
 * We use atacadaobr927 for all categories including super-ofertas.
 */
import { logger } from "./logger";

const BASE_URL = "https://www.atacadao.com.br";
const GRAPHQL_URL = `${BASE_URL}/api/graphql`;

// Store context for Cuiabá – Tijucal (CEP 78075-850)
const SELLER = "atacadaobr927";
const REGION_ID = "U1cjYXRhY2FkYW9icjkyNw==";
const CEP = "78075-850";
const LOJA = "Atacadão Cuiabá - Tijucal";

const PAGE_SIZE = 40;
const MAX_PAGES = 10; // safety cap: 400 products per category

// VTEX GraphQL query (same operation the site sends)
const PRODUCTS_QUERY = `
  query ProductsQuery(
    $first: Int
    $after: String
    $sort: String
    $term: String
    $selectedFacets: [IStoreSelectedFacet!]
  ) {
    search(
      first: $first
      after: $after
      sort: $sort
      term: $term
      selectedFacets: $selectedFacets
    ) {
      products {
        edges {
          node {
            name
            slug
            offers {
              lowPrice
              highPrice
              offers {
                price
                listPrice
                sellingPrice
              }
            }
            image {
              url
              alternateName
            }
            sku
            gtin
            isVariantOf {
              productGroupID
              name
            }
          }
        }
        pageInfo {
          totalCount
          hasNextPage
          endCursor
        }
      }
    }
  }
`;

export interface ScrapedProduct {
  nome: string;
  nomeNormalizado?: string;
  preco: string | null;
  precoValor?: number | null;
  precoPorUnidade?: string | null;
  quantidadeMinima?: string | null;
  desconto?: string | null;
  imagem?: string | null;
  url: string;
  categoria: string;
  loja?: string;
  cep?: string;
  origem?: "site_mercado";
  status?: "pending_review";
}

export interface ScrapedPayload {
  schemaVersion: number;
  scrapedAt: string;
  source: string;
  importer: string;
  cep: string;
  loja: string;
  skippedCategories: Array<{ category: string; reason: string; url: string }>;
  products: ScrapedProduct[];
}

const CATEGORIES: string[] = [
  "mercearia",
  "limpeza",
  "higiene",
  "bebes",
  "leites",
  "cafes",
  "super-ofertas",
];

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatPrice(cents: number): string {
  // VTEX prices sometimes come as integer cents
  const value = cents > 1000 && Number.isInteger(cents) ? cents / 100 : cents;
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function absoluteUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value, BASE_URL).toString();
  } catch {
    return value;
  }
}

interface VtexEdge {
  node: {
    name?: string;
    slug?: string;
    offers?: {
      lowPrice?: number;
      highPrice?: number;
      offers?: Array<{ price?: number; listPrice?: number; sellingPrice?: number }>;
    };
    image?: Array<{ url?: string; alternateName?: string }> | { url?: string };
    sku?: string;
  };
}

function edgeToProduct(edge: VtexEdge, category: string): ScrapedProduct | null {
  const node = edge.node;
  const nome = node.name;
  if (!nome) return null;

  const offersData = node.offers;
  const firstOffer = offersData?.offers?.[0];
  const rawPrice = firstOffer?.price ?? firstOffer?.sellingPrice ?? offersData?.lowPrice;
  if (!rawPrice) return null;

  const price = rawPrice > 1000 && Number.isInteger(rawPrice) ? rawPrice / 100 : rawPrice;
  const listPrice = firstOffer?.listPrice
    ? (firstOffer.listPrice > 1000 && Number.isInteger(firstOffer.listPrice) ? firstOffer.listPrice / 100 : firstOffer.listPrice)
    : null;

  const imageArr = Array.isArray(node.image) ? node.image : node.image ? [node.image] : [];
  const imageUrl = absoluteUrl(imageArr[0]?.url ?? null);

  const productUrl = absoluteUrl(node.slug ? `/${node.slug}/p` : null) ?? BASE_URL;

  const desconto = listPrice && listPrice > price
    ? `${Math.round(((listPrice - price) / listPrice) * 100)}% desconto`
    : null;

  return {
    nome,
    nomeNormalizado: normalizeName(nome),
    preco: formatPrice(price),
    precoValor: price,
    precoPorUnidade: null,
    quantidadeMinima: null,
    desconto,
    imagem: imageUrl,
    url: productUrl,
    categoria: category,
    loja: LOJA,
    cep: CEP,
    origem: "site_mercado",
    status: "pending_review",
  };
}

async function fetchCategoryPage(category: string, after: string): Promise<{
  products: ScrapedProduct[];
  hasNextPage: boolean;
  endCursor: string;
}> {
  const variables = {
    first: PAGE_SIZE,
    after,
    sort: "score_desc",
    term: "",
    selectedFacets: [
      { key: "category-1", value: category },
      { key: "region-id", value: REGION_ID },
      {
        key: "channel",
        value: JSON.stringify({ salesChannel: "1", seller: SELLER, regionId: REGION_ID }),
      },
      { key: "locale", value: "pt-BR" },
    ],
  };

  const resp = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "AiCompensa-AtacadaoScraper/2.0 (aicompensa.com.br)",
      "Accept": "application/json",
      "Origin": BASE_URL,
      "Referer": `${BASE_URL}/${category}`,
    },
    body: JSON.stringify({ operationName: "ProductsQuery", variables, query: PRODUCTS_QUERY }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!resp.ok) {
    throw new Error(`GraphQL HTTP ${resp.status} for category ${category}`);
  }

  const json = await resp.json() as {
    data?: { search?: { products?: { edges?: VtexEdge[]; pageInfo?: { hasNextPage?: boolean; endCursor?: string } } } };
    errors?: unknown[];
  };

  if (json.errors?.length) {
    logger.warn({ errors: json.errors, category }, "[atacadao-scraper] GraphQL errors");
  }

  const edges = json.data?.search?.products?.edges ?? [];
  const pageInfo = json.data?.search?.products?.pageInfo;

  const products = edges
    .map((e) => edgeToProduct(e, category))
    .filter((p): p is ScrapedProduct => p != null);

  return {
    products,
    hasNextPage: pageInfo?.hasNextPage ?? false,
    endCursor: pageInfo?.endCursor ?? String(Number(after) + PAGE_SIZE),
  };
}

async function scrapeCategory(category: string): Promise<{ products: ScrapedProduct[]; skipped: boolean; reason?: string }> {
  const all: ScrapedProduct[] = [];
  let cursor = "0";

  for (let page = 0; page < MAX_PAGES; page++) {
    try {
      const result = await fetchCategoryPage(category, cursor);
      all.push(...result.products);

      if (!result.hasNextPage || result.products.length === 0) break;
      cursor = result.endCursor;

      // Small delay to avoid hammering the API
      await new Promise((r) => setTimeout(r, 400));
    } catch (err) {
      logger.error({ err, category, page }, "[atacadao-scraper] page fetch failed");
      break;
    }
  }

  if (all.length === 0) {
    return { products: [], skipped: true, reason: "categoria sem produtos na API" };
  }

  // Dedup within category
  const seen = new Set<string>();
  const unique = all.filter((p) => {
    const key = `${p.nome}|${p.precoValor}|${p.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { products: unique, skipped: false };
}

export async function scrapeAtacadaoAPI(): Promise<ScrapedPayload> {
  logger.info("[atacadao-scraper] iniciando scraping via GraphQL");

  const allProducts: ScrapedProduct[] = [];
  const skippedCategories: Array<{ category: string; reason: string; url: string }> = [];

  for (const category of CATEGORIES) {
    const result = await scrapeCategory(category);
    if (result.skipped) {
      skippedCategories.push({ category, reason: result.reason ?? "sem produtos", url: `${BASE_URL}/${category}` });
      logger.warn({ category, reason: result.reason }, "[atacadao-scraper] categoria pulada");
    } else {
      allProducts.push(...result.products);
      logger.info({ category, count: result.products.length }, "[atacadao-scraper] categoria ok");
    }
  }

  logger.info({ total: allProducts.length, skipped: skippedCategories.length }, "[atacadao-scraper] scraping concluído");

  return {
    schemaVersion: 1,
    scrapedAt: new Date().toISOString(),
    source: BASE_URL,
    importer: "atacadao-site-importer",
    cep: CEP,
    loja: LOJA,
    skippedCategories,
    products: allProducts,
  };
}
