import { logger } from "./logger";

const BASE_URL = "https://redemachado.com.br";
const PROMOCOES_URL = `${BASE_URL}/promocoes`;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36 AiCompensa-RedeMachadoScraper/1.0";

const MAX_PAGES = 20;
const REQUEST_DELAY_MS = 500;

export interface RedeMachadoProduct {
  nome: string;
  nomeNormalizado: string;
  preco: string;
  precoValor: number;
  precoNormal?: string | null;
  precoNormalValor?: number | null;
  embalagem?: string | null;
  imagem?: string | null;
  url: string;
  categoria: string;
  loja: string;
  cidade: string;
  bairro?: string | null;
  origem: "site_mercado";
  status: "pending_review";
}

export interface RedeMachadoPayload {
  schemaVersion: number;
  scrapedAt: string;
  source: string;
  importer: "rede-machado-site-importer";
  loja: string;
  cidade: string;
  bairro: string;
  skippedPages: Array<{ page: number; reason: string; url: string }>;
  products: RedeMachadoProduct[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(value: string): string {
  return decodeHtml(value.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "));
}

function absoluteUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(decodeHtml(value), BASE_URL).toString();
  } catch {
    return decodeHtml(value);
  }
}

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePrice(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.match(/(\d{1,3}(?:\.\d{3})*,\d{2})/);
  if (!match) return null;
  const parsed = Number(match[1].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatPrice(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function inferCategoryFromUrl(url: string): string {
  const path = new URL(url).pathname.toLowerCase();
  const first = path.split("/").filter(Boolean)[0] ?? "";
  const map: Record<string, string> = {
    "horti-fruti": "Hortifruti",
    acougue: "Carnes",
    bebidas: "Bebidas",
    limpeza: "Limpeza",
    mercearia: "Alimentos",
    perfumaria: "Higiene",
    "frios-e-laticinios": "Laticínios",
    "pet-shop": "Pet shop",
  };
  return map[first] ?? "Outros";
}

function extractArticleBlocks(html: string): string[] {
  const articles = [...html.matchAll(/<article\b[\s\S]*?<\/article>/gi)].map((match) => match[0]);
  if (articles.length > 0) return articles;

  return [...html.matchAll(/<div\b[^>]*(?:product-miniature|js-product-miniature|thumbnail-container)[^>]*>[\s\S]*?(?=<div\b[^>]*(?:product-miniature|js-product-miniature|thumbnail-container)|<nav\b[^>]*pagination|<\/main>|$)/gi)]
    .map((match) => match[0]);
}

function extractProduct(block: string): RedeMachadoProduct | null {
  const titleLink =
    block.match(/<h[1-6][^>]*>\s*<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i) ??
    block.match(/<a[^>]+href=["']([^"']+)["'][^>]*(?:class=["'][^"']*(?:product|thumbnail)[^"']*["'][^>]*)?>([\s\S]*?)<\/a>/i);

  const url = absoluteUrl(titleLink?.[1]);
  const nome = stripTags(titleLink?.[2] ?? "");
  if (!url || !nome || nome.length < 2) return null;

  const prices = [...block.matchAll(/R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/g)]
    .map((match) => parsePrice(match[0]))
    .filter((price): price is number => price != null);
  if (prices.length === 0) return null;

  const preco = prices[0]!;
  const precoNormal = prices.find((price) => price > preco) ?? null;
  const embalagem = stripTags(block.match(/Embalagem:\s*([\s\S]*?)(?:<|R\$)/i)?.[1] ?? "") || null;
  const imageMatch =
    block.match(/<img[^>]+(?:data-src|src)=["']([^"']+)["'][^>]*>/i) ??
    block.match(/<source[^>]+srcset=["']([^"'\s,]+)/i);
  const imageUrl = absoluteUrl(imageMatch?.[1]);

  return {
    nome,
    nomeNormalizado: normalizeName(nome),
    preco: formatPrice(preco),
    precoValor: preco,
    precoNormal: precoNormal ? formatPrice(precoNormal) : null,
    precoNormalValor: precoNormal,
    embalagem,
    imagem: imageUrl,
    url,
    categoria: inferCategoryFromUrl(url),
    loja: "Rede Machado - Sinop",
    cidade: "Sinop",
    bairro: "Centro",
    origem: "site_mercado",
    status: "pending_review",
  };
}

function parseProducts(html: string): RedeMachadoProduct[] {
  const seen = new Set<string>();
  const products: RedeMachadoProduct[] = [];

  for (const block of extractArticleBlocks(html)) {
    const product = extractProduct(block);
    if (!product) continue;
    const key = `${product.nomeNormalizado}|${product.precoValor}|${product.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    products.push(product);
  }

  return products;
}

async function fetchPromocoesPage(page: number): Promise<string> {
  const url = page === 1 ? PROMOCOES_URL : `${PROMOCOES_URL}?page=${page}`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      Referer: PROMOCOES_URL,
    },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ao buscar ${url}`);
  }

  return response.text();
}

export async function scrapeRedeMachadoPromocoes(): Promise<RedeMachadoPayload> {
  logger.info("[rede-machado-scraper] iniciando captura de promoções");

  const products: RedeMachadoProduct[] = [];
  const skippedPages: RedeMachadoPayload["skippedPages"] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= MAX_PAGES; page++) {
    const pageUrl = page === 1 ? PROMOCOES_URL : `${PROMOCOES_URL}?page=${page}`;
    let html = "";
    try {
      html = await fetchPromocoesPage(page);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      skippedPages.push({ page, reason, url: pageUrl });
      logger.warn({ page, reason }, "[rede-machado-scraper] página pulada");
      if (page === 1) throw err;
      break;
    }

    const pageProducts = parseProducts(html);
    if (pageProducts.length === 0) {
      logger.info({ page }, "[rede-machado-scraper] página sem produtos; encerrando paginação");
      break;
    }

    let insertedOnPage = 0;
    for (const product of pageProducts) {
      const key = `${product.nomeNormalizado}|${product.precoValor}|${product.url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      products.push(product);
      insertedOnPage++;
    }

    logger.info({ page, count: insertedOnPage }, "[rede-machado-scraper] página capturada");
    if (insertedOnPage === 0) break;
    await sleep(REQUEST_DELAY_MS);
  }

  logger.info({ total: products.length, skipped: skippedPages.length }, "[rede-machado-scraper] captura concluída");

  return {
    schemaVersion: 1,
    scrapedAt: new Date().toISOString(),
    source: PROMOCOES_URL,
    importer: "rede-machado-site-importer",
    loja: "Rede Machado - Sinop",
    cidade: "Sinop",
    bairro: "Centro",
    skippedPages,
    products,
  };
}

