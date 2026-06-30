import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

type Product = {
  nome: string;
  nomeNormalizado?: string;
  preco: string | null;
  precoValor?: number | null;
  precoPorUnidade: string | null;
  quantidadeMinima: string | null;
  desconto: string | null;
  imagem: string | null;
  url: string;
  categoria: string;
  loja: string;
  cep: string;
  origem?: "site_mercado";
  status?: "pending_review";
};

type ProductResponseLog = {
  url: string;
  status: number;
  method: string;
  categoria: string;
  count: number;
  sampleKeys: string[];
};

const BASE_URL = "https://www.atacadao.com.br";
const CEP = process.env["ATACADAO_CEP"] ?? "78075-850";
const LOJA = process.env["ATACADAO_LOJA"] ?? "Atacadão Cuiabá - Tijucal";
const WORKSPACE_ROOT = path.basename(process.cwd()).toLowerCase() === "scripts" ? path.resolve("..") : process.cwd();
const OUT_DIR = process.env["ATACADAO_OUT_DIR"] ?? path.join(WORKSPACE_ROOT, "artifacts", "scrapers", "atacadao");
const HEADLESS = process.env["HEADLESS"] !== "false";
const MAX_IDLE_SCROLLS = Number(process.env["ATACADAO_MAX_IDLE_SCROLLS"] ?? "8");
const MAX_SCROLLS = Number(process.env["ATACADAO_MAX_SCROLLS"] ?? "240");
const CATEGORY_TIMEOUT_MS = Number(process.env["ATACADAO_CATEGORY_TIMEOUT_MS"] ?? "90000");
const CATEGORIES = [
  "mercearia",
  "limpeza",
  "higiene",
  "bebes",
  "leites",
  "cafes",
  "super-ofertas",
];

function categoryUrl(category: string): string {
  if (category === "mercearia") {
    return `${BASE_URL}/mercearia#atc=|home|atacadao|thumb|selecao-mercearia_1p_01-04-a-05-04|2`;
  }

  return `${BASE_URL}/${category}`;
}

function isProductLike(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  const keys = Object.keys(item).join(" ").toLowerCase();
  const hasName = ["name", "nome", "productname", "productName", "title"].some((key) => key in item);
  const hasProductIdentity = "sku" in item || "gtin" in item || "offers" in item || "sellers" in item || "items" in item;
  const hasPrice = keys.includes("price") || keys.includes("preco") || keys.includes("sellingprice");
  const hasImage = keys.includes("image") || keys.includes("imagem");
  return hasName && hasProductIdentity && (hasPrice || hasImage || "offers" in item);
}

function collectProductLike(value: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (out.length >= 50 || value == null) return out;

  if (Array.isArray(value)) {
    for (const item of value) collectProductLike(item, out);
    return out;
  }

  if (typeof value !== "object") return out;
  if (isProductLike(value)) out.push(value as Record<string, unknown>);

  for (const nested of Object.values(value as Record<string, unknown>)) {
    if (out.length >= 50) break;
    if (nested && typeof nested === "object") collectProductLike(nested, out);
  }

  return out;
}

function sanitizeFileName(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9-]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value.replace(",", "."));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function formatPrice(value: unknown): string | null {
  const number = firstNumber(value);
  if (number == null) return firstString(value);
  const normalized = number > 1000 && Number.isInteger(number) ? number / 100 : number;
  return normalized.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function parsePrice(value: string | number | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (!value) return null;
  const cleaned = String(value)
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
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

function absoluteUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value, BASE_URL).toString();
  } catch {
    return value;
  }
}

function normalizeNetworkProduct(item: Record<string, unknown>, category: string): Product | null {
  const offersContainer = item["offers"] as Record<string, unknown> | undefined;
  const offerList = Array.isArray(offersContainer?.["offers"]) ? offersContainer?.["offers"] as Record<string, unknown>[] : [];
  const offer = offerList[0] ?? offersContainer ?? {};
  const imageValue = item["image"];
  const image = Array.isArray(imageValue) ? imageValue[0] as Record<string, unknown> | undefined : imageValue as Record<string, unknown> | undefined;
  const slug = firstString(item["slug"]);
  const url = absoluteUrl(
    firstString(item["url"], item["link"], item["href"], offersContainer?.["url"]) ??
    (slug ? `/${slug}/p` : null),
  );
  const price = firstNumber(
    offer["price"],
    offer["Price"],
    offer["sellingPrice"],
    offer["SellingPrice"],
    offersContainer?.["lowPrice"],
    offersContainer?.["highPrice"],
  );
  const listPrice = firstNumber(offer["listPrice"], offer["ListPrice"]);
  const measurementUnit = firstString(item["measurementUnit"]);
  const unitMultiplier = firstNumber(item["unitMultiplier"]);
  const discount = price != null && listPrice != null && listPrice > price
    ? `${Math.round(((listPrice - price) / listPrice) * 100)}% desconto`
    : firstString(item["discount"], item["desconto"]);
  const nome = firstString(item["name"], item["nome"], item["productName"], item["title"]);

  if (!nome) return null;

  return {
    nome,
    nomeNormalizado: normalizeName(nome),
    preco: formatPrice(price ?? offer["price"] ?? offersContainer?.["lowPrice"]),
    precoValor: price ?? firstNumber(offer["price"], offersContainer?.["lowPrice"]),
    precoPorUnidade: measurementUnit && unitMultiplier ? `${unitMultiplier} ${measurementUnit}` : measurementUnit,
    quantidadeMinima: firstString(item["minimumQuantity"], item["minQuantity"], item["quantidadeMinima"]),
    desconto: discount,
    imagem: absoluteUrl(firstString(image?.["url"], image?.["imageUrl"], image?.["src"], item["imageUrl"])),
    url: url ?? BASE_URL,
    categoria: category,
    loja: LOJA,
    cep: CEP,
    origem: "site_mercado",
    status: "pending_review",
  };
}

function dedupeProducts(products: Product[]): Product[] {
  const seen = new Set<string>();
  return products.filter((product) => {
    const key = `${product.categoria}|${product.nome}|${product.preco}|${product.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function clickFirst(page: any, selectors: string[], timeout = 2500): Promise<boolean> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      await locator.waitFor({ state: "visible", timeout });
      await locator.click({ timeout });
      return true;
    } catch {
      // Try the next site variant.
    }
  }
  return false;
}

async function fillFirst(page: any, selectors: string[], value: string, timeout = 2500): Promise<boolean> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      await locator.waitFor({ state: "visible", timeout });
      await locator.fill(value, { timeout });
      return true;
    } catch {
      // Try the next site variant.
    }
  }
  return false;
}

async function configureStore(page: any): Promise<void> {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => undefined);

  await clickFirst(page, [
    "text=Aceitar todos",
    "button:has-text('Aceitar')",
    "button:has-text('ACEITAR')",
    "button:has-text('Continuar')",
    "button:has-text('Entendi')",
    "[data-testid*='accept']",
  ], 1200);

  await clickFirst(page, [
    "text=/Entregue pela Loja/i",
    "text=/Entregue no CEP/i",
    "text=/Informar Localiza/i",
    "[class*='delivery']",
    "[data-testid*='location']",
    "[class*='location']",
    "[class*='cep']",
  ]);

  await clickFirst(page, [
    "button:has-text('Informar Localização')",
    "button:has-text('INFORMAR LOCALIZAÇÃO')",
    "text=/Informar Localiza/i",
  ], 3000);

  const filledCep = await fillFirst(page, [
    "input[name='postalCode']",
    "input[name='cep']",
    "input[id*='cep' i]",
    "input[placeholder*='CEP' i]",
    "input[aria-label*='CEP' i]",
    "input[type='tel']",
    "input[type='text']",
  ], CEP);

  if (!filledCep) {
    throw new Error("Não encontrei o campo de CEP para configurar o contexto da loja.");
  }

  await clickFirst(page, [
    "button:has-text('Buscar')",
    "button:has-text('BUSCAR')",
    "button:has-text('Pesquisar')",
    "button:has-text('Confirmar')",
    "button:has-text('Aplicar')",
    "button[type='submit']",
  ]);

  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => undefined);
  await page.getByText(/Cuiab[aá].*Tijucal|Tijucal/i).first().waitFor({ state: "visible", timeout: 20000 }).catch(() => undefined);

  await clickFirst(page, [
    `button:has-text('${LOJA}')`,
    `label:has-text('${LOJA}')`,
    "button:has-text('Tijucal')",
    "label:has-text('Tijucal')",
    "[role='option']:has-text('Tijucal')",
    "text=/Cuiab[aá].*Tijucal/i",
  ], 5000);

  await clickFirst(page, [
    "button:has-text('Confirmar')",
    "button:has-text('Selecionar')",
    "button:has-text('Comprar nesta loja')",
    "button:has-text('Aplicar')",
    "button:has-text('Continuar')",
  ], 5000);

  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => undefined);

  const activeContext = await readActiveContext(page);
  if (!activeContext.includes("78075") && !activeContext.toLowerCase().includes("tijucal")) {
    throw new Error(`Contexto da loja não confirmado após configurar CEP. Topo atual: ${activeContext.slice(0, 500)}`);
  }
}

async function readActiveContext(page: any): Promise<string> {
  return page.evaluate(() => {
    const candidates = [
      "header",
      "[data-testid*='header']",
      "[data-testid*='location']",
      "[class*='header']",
      "[class*='location']",
      "[class*='cep']",
      "body",
    ];
    const parts: string[] = [];
    for (const selector of candidates) {
      document.querySelectorAll(selector).forEach((node) => {
        const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
        if (text) parts.push(text.slice(0, 800));
      });
    }
    return Array.from(new Set(parts)).join(" | ");
  });
}

async function waitForCards(page: any): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < CATEGORY_TIMEOUT_MS) {
    const count = await page.evaluate(() => {
      const pricePattern = /R\$\s?\d/;
      return Array.from(document.querySelectorAll("a, article, li, div"))
        .filter((element) => {
          const text = (element.textContent ?? "").replace(/\s+/g, " ");
          return pricePattern.test(text) && !!element.querySelector("img");
        })
        .length;
    });
    if (count > 0) return;
    await sleep(1000);
  }
}

async function extractDomProducts(page: any, category: string): Promise<Product[]> {
  return page.evaluate(({ category, loja, cep }: { category: string; loja: string; cep: string }) => {
    const money = /R\$\s?\d{1,3}(?:\.\d{3})*,\d{2}/g;
    const unit = /(R\$\s?\d{1,3}(?:\.\d{3})*,\d{2}\s*\/\s*(?:kg|g|l|ml|un|und|cada|m|m2|m²)|\d+,\d+\s*(?:kg|g|l|ml|un|und))/i;
    const minQty = /(quantidade\s*m[ií]nima|min\.?|a partir de|leve)\s*:?\s*\d+[^.\n]*/i;
    const discount = /(\d{1,2}%\s*(?:off|desconto)|economize\s*R\$\s?\d{1,3}(?:\.\d{3})*,\d{2}|desconto\s*R\$\s?\d{1,3}(?:\.\d{3})*,\d{2})/i;

    function absoluteUrl(value: string | null): string | null {
      if (!value) return null;
      try {
        return new URL(value, location.origin).toString();
      } catch {
        return value;
      }
    }

    function parseCardPrice(value: string | null): number | null {
      if (!value) return null;
      const parsed = Number(value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));
      return Number.isFinite(parsed) ? parsed : null;
    }

    function normalizeCardName(value: string): string {
      return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    function nameFrom(element: Element, text: string): string {
      const selectors = [
        "[data-testid*='name' i]",
        "[class*='name' i]",
        "[class*='title' i]",
        "h2",
        "h3",
        "h4",
        "p",
      ];
      for (const selector of selectors) {
        const found = element.querySelector(selector)?.textContent?.replace(/\s+/g, " ").trim();
        if (found && !money.test(found) && found.length > 3) {
          money.lastIndex = 0;
          return found;
        }
        money.lastIndex = 0;
      }
      return text
        .replace(money, " ")
        .replace(/comprar|adicionar|indispon[ií]vel|oferta/gi, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 180);
    }

    const cards = Array.from(document.querySelectorAll("article, li, a[href*='/p'], a[href*='produto'], [data-testid*='product' i], [class*='product' i], [class*='shelf' i]"))
      .filter((element) => {
        const text = (element.textContent ?? "").replace(/\s+/g, " ");
        return money.test(text) && !!element.querySelector("img");
      });

    const products = cards.map((element) => {
      const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
      const prices = text.match(money) ?? [];
      const link = element instanceof HTMLAnchorElement ? element : element.querySelector("a[href]");
      const image = element.querySelector("img");
      const src = image?.getAttribute("src") || image?.getAttribute("data-src") || image?.getAttribute("srcset")?.split(/\s+/)[0] || null;
      return {
        nome: nameFrom(element, text),
        nomeNormalizado: "",
        preco: prices[0] ?? null,
        precoValor: parseCardPrice(prices[0] ?? null),
        precoPorUnidade: text.match(unit)?.[0] ?? null,
        quantidadeMinima: text.match(minQty)?.[0] ?? null,
        desconto: text.match(discount)?.[0] ?? null,
        imagem: absoluteUrl(src),
        url: absoluteUrl(link?.getAttribute("href") ?? null) ?? location.href,
        categoria: category,
        loja,
        cep,
        origem: "site_mercado",
        status: "pending_review",
      };
    });

    const seen = new Set<string>();
    return products.filter((product) => {
      const key = `${product.nome}|${product.preco}|${product.url}`;
      product.nomeNormalizado = product.nomeNormalizado || (product.nome ? normalizeCardName(product.nome) : "");
      if (!product.nome || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, { category, loja: LOJA, cep: CEP });
}

async function loadAllCategoryProducts(page: any, category: string): Promise<Product[]> {
  await waitForCards(page);
  let idleScrolls = 0;
  let lastCount = 0;

  for (let i = 0; i < MAX_SCROLLS && idleScrolls < MAX_IDLE_SCROLLS; i += 1) {
    const products = await extractDomProducts(page, category);
    const currentCount = products.length;

    if (currentCount > lastCount) {
      lastCount = currentCount;
      idleScrolls = 0;
    } else {
      idleScrolls += 1;
    }

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await clickFirst(page, [
      "button:has-text('Carregar mais')",
      "button:has-text('Ver mais')",
      "button:has-text('Mostrar mais')",
      "a:has-text('Próxima')",
      "button[aria-label*='próxima' i]",
      "a[rel='next']",
    ], 1000);
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => undefined);
    await sleep(900);
  }

  return extractDomProducts(page, category);
}

async function saveZeroDiagnostics(page: any, category: string, productResponses: ProductResponseLog[]): Promise<void> {
  const safeCategory = sanitizeFileName(category);
  const activeContext = await readActiveContext(page);
  const html = await page.content();
  const prefix = path.join(OUT_DIR, `zero-${safeCategory}-${Date.now()}`);

  await page.screenshot({ path: `${prefix}.png`, fullPage: true });
  await writeFile(`${prefix}.html`, html, "utf8");
  await writeFile(`${prefix}.json`, JSON.stringify({
    category,
    url: page.url(),
    cep: CEP,
    loja: LOJA,
    activeContext,
    productResponses,
  }, null, 2), "utf8");

  console.error(`[atacadao] ZERO PRODUTOS em ${category}`);
  console.error(`[atacadao] contexto ativo: ${activeContext.slice(0, 1000)}`);
  console.error(`[atacadao] XHR/fetch com produtos: ${JSON.stringify(productResponses, null, 2)}`);
}

async function saveContextDiagnostics(page: any, reason: unknown): Promise<void> {
  const activeContext = await readActiveContext(page).catch(() => "");
  const html = await page.content().catch(() => "");
  const prefix = path.join(OUT_DIR, `context-${Date.now()}`);

  await page.screenshot({ path: `${prefix}.png`, fullPage: true }).catch(() => undefined);
  await writeFile(`${prefix}.html`, html, "utf8");
  await writeFile(`${prefix}.json`, JSON.stringify({
    url: page.url(),
    cep: CEP,
    loja: LOJA,
    activeContext,
    error: reason instanceof Error ? reason.message : String(reason),
  }, null, 2), "utf8");

  console.error(`[atacadao] falha ao configurar contexto. Diagnóstico salvo em ${prefix}.*`);
  console.error(`[atacadao] contexto ativo: ${activeContext.slice(0, 1000)}`);
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({
    locale: "pt-BR",
    timezoneId: "America/Cuiaba",
    viewport: { width: 1440, height: 1200 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
  });
  await context.addInitScript(() => {
    (window as unknown as { __name?: <T>(value: T) => T }).__name = (value) => value;
  });
  const page = await context.newPage();
  let activeCategory = "";
  const productResponses: ProductResponseLog[] = [];
  const networkProducts: Product[] = [];
  const skippedCategories: Array<{ category: string; reason: string; url: string }> = [];

  page.on("response", async (response: any) => {
    const request = response.request();
    const resourceType = request.resourceType();
    if (resourceType !== "xhr" && resourceType !== "fetch") return;

    const contentType = response.headers()["content-type"] ?? "";
    if (!contentType.includes("json")) return;

    try {
      const body = await response.json();
      const products = collectProductLike(body)
        .map((item) => normalizeNetworkProduct(item, activeCategory || "desconhecida"))
        .filter((item): item is Product => item != null);
      if (products.length === 0) return;
      networkProducts.push(...products);
      productResponses.push({
        url: response.url(),
        status: response.status(),
        method: request.method(),
        categoria: activeCategory || "desconhecida",
        count: products.length,
        sampleKeys: Object.keys(products[0] ?? {}).slice(0, 30),
      });
    } catch {
      // Non-JSON or already-consumed response bodies are ignored.
    }
  });

  try {
    try {
      await configureStore(page);
    } catch (error) {
      await saveContextDiagnostics(page, error);
      throw error;
    }

    const allProducts: Product[] = [];
    for (const category of CATEGORIES) {
      const beforeResponseCount = productResponses.length;
      const beforeNetworkCount = networkProducts.length;
      activeCategory = category;
      await page.goto(categoryUrl(category), { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => undefined);
      let products = await loadAllCategoryProducts(page, category);
      if (products.length === 0) {
        products = dedupeProducts(networkProducts.slice(beforeNetworkCount).filter((product) => product.categoria === category));
      }

      if (products.length === 0) {
        await saveZeroDiagnostics(page, category, productResponses.slice(beforeResponseCount));
        const activeContext = await readActiveContext(page);
        const reason = activeContext.toLowerCase().includes("não encontramos") || activeContext.toLowerCase().includes("nao encontramos")
          ? "site retornou pagina sem resultados"
          : "categoria sem produtos renderizados ou em XHR";
        skippedCategories.push({ category, reason, url: page.url() });
        console.warn(`[atacadao] ${category}: skipped (${reason})`);
        continue;
      }

      allProducts.push(...products);
      await writeFile(
        path.join(OUT_DIR, `${sanitizeFileName(category)}.json`),
        JSON.stringify({ category, count: products.length, cep: CEP, loja: LOJA, products }, null, 2),
        "utf8",
      );
      console.log(`[atacadao] ${category}: ${products.length} produtos`);
    }

    const deduped = new Map<string, Product>();
    for (const product of allProducts) {
      deduped.set(`${product.categoria}|${product.url}|${product.nome}|${product.preco}`, product);
    }

    const payload = {
      schemaVersion: 1,
      scrapedAt: new Date().toISOString(),
      source: BASE_URL,
      importer: "atacadao-site-importer",
      origem: "site_mercado",
      status: "pending_review",
      mercado: "Atacadão",
      cep: CEP,
      loja: LOJA,
      categories: CATEGORIES,
      skippedCategories,
      count: deduped.size,
      productResponses,
      products: Array.from(deduped.values()).map((product) => ({
        ...product,
        nomeNormalizado: product.nomeNormalizado || normalizeName(product.nome),
        precoValor: product.precoValor ?? parsePrice(product.preco),
        origem: "site_mercado",
        status: "pending_review",
      })),
    };

    if (payload.count === 0) {
      throw new Error(`Scraper retornou 0 produto. Diagnósticos em ${OUT_DIR}.`);
    }

    await writeFile(path.join(OUT_DIR, "produtos.json"), JSON.stringify(payload, null, 2), "utf8");
    console.log(`[atacadao] total: ${deduped.size} produtos salvos em ${path.join(OUT_DIR, "produtos.json")}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
