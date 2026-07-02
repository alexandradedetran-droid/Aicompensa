import crypto from "crypto";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  db,
  mercadosSugeridosTable,
  productImageCandidatesTable,
} from "@workspace/db";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { normalizeProductName } from "./dedup";
import { validateAndStoreImage } from "./image-storage";
import { logger } from "./logger";

const ATACADAO_SITE_URL = "https://www.atacadao.com.br";
const ATACADAO_MARKET_NAME = "Atacadão Cuiabá - Tijucal";
const CIDADE = "Cuiabá";
const BAIRRO = "Tijucal";
const ORIGEM = "site_mercado";

type ScrapedProduct = {
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
};

type ScrapedPayload = {
  schemaVersion?: number;
  scrapedAt?: string;
  source?: string;
  importer?: string;
  cep?: string;
  loja?: string;
  skippedCategories?: Array<{ category: string; reason: string; url: string }>;
  products: ScrapedProduct[];
};

type ImportStats = {
  importId: number | null;
  mercadoId: number;
  total: number;
  inseridos: number;
  catalogados: number;
  publicados: number;
  revisao: number;
  duplicados: number;
  rejeitados: number;
  imagensSalvas: number;
  imagensComErro: number;
};

function gerarHash(fields: (string | number | null | undefined)[]): string {
  return crypto
    .createHash("sha256")
    .update(fields.map((field) => String(field ?? "")).join("|"))
    .digest("hex")
    .slice(0, 32);
}

async function ensureMercado(): Promise<number> {
  const [existing] = await db
    .select({ id: mercadosSugeridosTable.id })
    .from(mercadosSugeridosTable)
    .where(
      and(
        ilike(mercadosSugeridosTable.nome, "%atacad%"),
        ilike(mercadosSugeridosTable.cidade, "Cuiab%"),
        ilike(mercadosSugeridosTable.bairro, "%Tijucal%"),
      ),
    )
    .limit(1);

  if (existing) return existing.id;

  const createdRows = await db.execute<{ id: number }>(sql`
    INSERT INTO mercados_sugeridos (nome, bairro, cidade, estado, fonte, endereco)
    VALUES (${ATACADAO_MARKET_NAME}, ${BAIRRO}, ${CIDADE}, ${"MT"}, ${"site"}, ${"Catálogo digital"})
    RETURNING id
  `);
  const [created] = createdRows.rows;

  if (!created) throw new Error("Não foi possível criar mercado Atacadão Cuiabá - Tijucal");
  return created.id;
}

async function candidateExists(produtoNormalizado: string, imageUrl: string): Promise<boolean> {
  const [existing] = await db
    .select({ id: productImageCandidatesTable.id })
    .from(productImageCandidatesTable)
    .where(
      and(
        eq(productImageCandidatesTable.origem, ORIGEM),
        eq(productImageCandidatesTable.imageUrl, imageUrl),
        or(
          eq(productImageCandidatesTable.produtoNormalizado, produtoNormalizado),
          ilike(productImageCandidatesTable.produtoNormalizado, `${produtoNormalizado}%`),
        ),
      ),
    )
    .orderBy(desc(productImageCandidatesTable.id))
    .limit(1);

  return !!existing;
}

async function downloadAndStoreImage(imageUrl: string | null | undefined): Promise<{ storageUrl: string | null; error?: string }> {
  if (!imageUrl) return { storageUrl: null };

  try {
    const response = await fetch(imageUrl, {
      headers: { "User-Agent": "AiCompensa-AtacadaoImporter/1.0" },
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      return { storageUrl: null, error: `download HTTP ${response.status}` };
    }

    const contentType = response.headers.get("content-type") ?? "image/jpeg";
    const mime = contentType.includes("png")
      ? "image/png"
      : contentType.includes("webp")
        ? "image/webp"
        : "image/jpeg";
    const buffer = Buffer.from(await response.arrayBuffer());
    const stored = await validateAndStoreImage(`data:${mime};base64,${buffer.toString("base64")}`);

    return stored.ok ? { storageUrl: stored.url } : { storageUrl: null, error: stored.error };
  } catch (error) {
    return { storageUrl: null, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function importAtacadaoPayload(payload: ScrapedPayload): Promise<ImportStats> {
  if (payload.importer && payload.importer !== "atacadao-site-importer") {
    throw new Error(`JSON não pertence ao atacadao-site-importer: ${payload.importer}`);
  }
  if (!Array.isArray(payload.products) || payload.products.length === 0) {
    throw new Error("JSON do Atacadão não contém produtos.");
  }

  const mercadoId = await ensureMercado();
  const campanha = payload.scrapedAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);

  logger.info(
    { total: payload.products.length, mercadoId, sourceUrl: ATACADAO_SITE_URL },
    "[atacadao-site-importer] iniciando sincronização de imagens do catálogo",
  );

  let inseridos = 0;
  let catalogados = 0;
  let publicados = 0;
  let revisao = 0;
  let duplicados = 0;
  let rejeitados = 0;
  let imagensSalvas = 0;
  let imagensComErro = 0;

  for (const product of payload.products) {
    const produtoNormalizado = product.nomeNormalizado || normalizeProductName(product.nome);
    const imageKey = product.imagem?.trim() || "";

    if (!product.nome || !product.imagem) {
      rejeitados += 1;
      continue;
    }

    if (imageKey && await candidateExists(produtoNormalizado, imageKey)) {
      duplicados += 1;
      continue;
    }

    const image = await downloadAndStoreImage(product.imagem);
    if (image.storageUrl) imagensSalvas += 1;
    else imagensComErro += 1;

    const finalUrl = image.storageUrl ?? product.imagem;
    const hash = gerarHash([mercadoId, produtoNormalizado, finalUrl, ORIGEM, campanha]);
    if (await candidateExists(produtoNormalizado, finalUrl)) {
      duplicados += 1;
      continue;
    }

    const [item] = await db
      .insert(productImageCandidatesTable)
      .values({
        produtoNormalizado,
        origem: ORIGEM,
        imageUrl: finalUrl,
        qualityScore: image.storageUrl ? 90 : 60,
        status: "candidato",
      })
      .returning({ id: productImageCandidatesTable.id });

    inseridos += 1;
    if (item) catalogados += 1;

    logger.debug(
      { produto: product.nome, produtoNormalizado, imageUrl: finalUrl, hash },
      "[atacadao-site-importer] imagem catalogada sem tocar em preço",
    );
  }

  logger.info(
    { total: payload.products.length, inseridos, catalogados, duplicados, rejeitados, imagensSalvas, imagensComErro },
    "[atacadao-site-importer] sincronização de imagens concluída",
  );

  return {
    importId: null,
    mercadoId,
    total: payload.products.length,
    inseridos,
    catalogados,
    publicados,
    revisao,
    duplicados,
    rejeitados,
    imagensSalvas,
    imagensComErro,
  };
}

export async function runAtacadaoSiteImporter(jsonPath: string): Promise<ImportStats> {
  const payload = JSON.parse(await readFile(jsonPath, "utf8")) as ScrapedPayload;
  return importAtacadaoPayload(payload);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const jsonPath = path.resolve(process.argv[2] ?? "artifacts/scrapers/atacadao/produtos.json");
  runAtacadaoSiteImporter(jsonPath)
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
