import crypto from "crypto";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  db,
  folhetoImportsTable,
  folhetoImportItemsTable,
  folhetoSourcesTable,
  mercadosSugeridosTable,
  productImageCandidatesTable,
  ofertasTable,
} from "@workspace/db";
import { and, eq, ilike, sql } from "drizzle-orm";
import { normalizeProductName } from "./dedup";
import { validateAndStoreImage } from "./image-storage";
import { publicarItem } from "./ofertabot";
import { logger } from "./logger";

// Set ATACADAO_VTEX_AUTOPUBLISH=true in Railway to publish directly without admin review.
// Data source is the official VTEX API, so confidence is structurally high.
const VTEX_AUTOPUBLISH = process.env["ATACADAO_VTEX_AUTOPUBLISH"] === "true";

const ATACADAO_SITE_URL = "https://www.atacadao.com.br";
const ATACADAO_MARKET_NAME = "Atacadão Cuiabá - Tijucal";
const ATACADAO_CEP = "78075-850";
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
  importId: number;
  mercadoId: number;
  total: number;
  inseridos: number;
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

function parsePrice(value: string | number | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (!value) return null;
  const parsed = Number(String(value).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function contentHash(payload: ScrapedPayload): string {
  return crypto.createHash("sha256").update(JSON.stringify({
    scrapedAt: payload.scrapedAt,
    source: payload.source,
    count: payload.products.length,
    products: payload.products.map((product) => [
      product.categoria,
      product.nome,
      product.preco,
      product.url,
    ]),
  })).digest("hex");
}

function inferUnit(product: ScrapedProduct): string {
  const value = product.precoPorUnidade ?? product.quantidadeMinima ?? "";
  const match = value.match(/\b(kg|g|l|ml|un|und|cada|pacote|caixa|fardo)\b/i);
  return match?.[1]?.toLowerCase() ?? "un";
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
    VALUES (${ATACADAO_MARKET_NAME}, ${BAIRRO}, ${CIDADE}, ${"MT"}, ${"site"}, ${`CEP ${ATACADAO_CEP}`})
    RETURNING id
  `);
  const [created] = createdRows.rows;

  if (!created) throw new Error("Não foi possível criar mercado Atacadão Cuiabá - Tijucal");
  return created.id;
}

async function ensureSource(mercadoId: number): Promise<typeof folhetoSourcesTable.$inferSelect> {
  const [existing] = await db
    .select()
    .from(folhetoSourcesTable)
    .where(and(eq(folhetoSourcesTable.mercadoId, mercadoId), eq(folhetoSourcesTable.url, ATACADAO_SITE_URL)))
    .limit(1);

  if (existing) return existing;

  const [created] = await db
    .insert(folhetoSourcesTable)
    .values({
      mercadoId,
      nome: ATACADAO_MARKET_NAME,
      cidade: CIDADE,
      bairro: BAIRRO,
      estado: "MT",
      tipoFonte: "site",
      url: ATACADAO_SITE_URL,
      ativo: true,
      prioridade: 100,
    })
    .returning();

  if (!created) throw new Error("Não foi possível criar fonte Atacadão site");
  return created;
}

async function jaExisteHash(hash: string): Promise<boolean> {
  const [item] = await db
    .select({ id: folhetoImportItemsTable.id })
    .from(folhetoImportItemsTable)
    .where(eq(folhetoImportItemsTable.hashDeduplicacao, hash))
    .limit(1);

  if (item) return true;

  const [oferta] = await db
    .select({ id: ofertasTable.id })
    .from(ofertasTable)
    .where(eq(ofertasTable.hashDeduplicacao, hash))
    .limit(1);

  return !!oferta;
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
  const source = await ensureSource(mercadoId);
  const campanha = payload.scrapedAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
  const hashConteudo = contentHash(payload);

  const [importRecord] = await db
    .insert(folhetoImportsTable)
    .values({
      sourceId: source.id,
      mercadoId,
      cidade: CIDADE,
      bairro: BAIRRO,
      urlFolheto: ATACADAO_SITE_URL,
      titulo: `${ATACADAO_MARKET_NAME} - site ${campanha}`,
      status: "revisao",
      hashConteudo,
      totalExtraido: payload.products.length,
    })
    .returning();

  if (!importRecord) throw new Error("Não foi possível criar import do Atacadão");

  logger.info(
    { importId: importRecord.id, total: payload.products.length, autopublish: VTEX_AUTOPUBLISH },
    "[atacadao-site-importer] iniciando importação",
  );

  let inseridos = 0;
  let publicados = 0;
  let revisao = 0;
  let duplicados = 0;
  let rejeitados = 0;
  let imagensSalvas = 0;
  let imagensComErro = 0;

  for (const product of payload.products) {
    const preco = product.precoValor ?? parsePrice(product.preco);
    const produtoNormalizado = product.nomeNormalizado || normalizeProductName(product.nome);
    const hash = gerarHash([mercadoId, produtoNormalizado, preco, ORIGEM, product.categoria, campanha]);

    if (!product.nome || !preco || preco <= 0) {
      rejeitados += 1;
      await db.insert(folhetoImportItemsTable).values({
        importId: importRecord.id,
        mercadoId,
        cidade: CIDADE,
        bairro: BAIRRO,
        produto: product.nome,
        produtoNormalizado,
        preco: preco ?? undefined,
        categoria: product.categoria,
        origem: ORIGEM,
        sourceUrl: product.url,
        imageOriginalUrl: product.imagem ?? undefined,
        cep: product.cep ?? payload.cep ?? ATACADAO_CEP,
        loja: product.loja ?? payload.loja ?? ATACADAO_MARKET_NAME,
        campanha,
        status: "erro",
        rawText: JSON.stringify(product),
        motivoRejeicao: "Produto ou preço ausente",
      });
      continue;
    }

    if (await jaExisteHash(hash)) {
      duplicados += 1;
      await db.insert(folhetoImportItemsTable).values({
        importId: importRecord.id,
        mercadoId,
        cidade: CIDADE,
        bairro: BAIRRO,
        produto: product.nome,
        produtoNormalizado,
        preco,
        categoria: product.categoria,
        origem: ORIGEM,
        sourceUrl: product.url,
        imageOriginalUrl: product.imagem ?? undefined,
        cep: product.cep ?? payload.cep ?? ATACADAO_CEP,
        loja: product.loja ?? payload.loja ?? ATACADAO_MARKET_NAME,
        campanha,
        confianca: "0.9000" as unknown as any,
        hashDeduplicacao: hash,
        status: "duplicado",
        rawText: JSON.stringify(product),
      });
      continue;
    }

    const image = await downloadAndStoreImage(product.imagem);
    if (image.storageUrl) imagensSalvas += 1;
    else if (product.imagem) imagensComErro += 1;

    // Auto-publish when flag is on AND image was stored in Supabase.
    // Data comes directly from VTEX API (no OCR), so structural confidence is high.
    const canAutoPublish = VTEX_AUTOPUBLISH && !!image.storageUrl;
    const itemStatus = canAutoPublish ? "aprovado" : "revisao";

    const [item] = await db
      .insert(folhetoImportItemsTable)
      .values({
        importId: importRecord.id,
        mercadoId,
        cidade: CIDADE,
        bairro: BAIRRO,
        produto: product.nome,
        produtoNormalizado,
        preco,
        precoNormal: preco,
        tipoPreco: "normal",
        unidade: inferUnit(product),
        categoria: product.categoria,
        origem: ORIGEM,
        sourceUrl: product.url,
        imageOriginalUrl: product.imagem ?? undefined,
        cep: product.cep ?? payload.cep ?? ATACADAO_CEP,
        loja: product.loja ?? payload.loja ?? ATACADAO_MARKET_NAME,
        campanha,
        confianca: "0.9000" as unknown as any,
        status: itemStatus,
        cropUrl: image.storageUrl ?? product.imagem ?? undefined,
        imageQualityScore: image.storageUrl ? 90 : 60,
        hashDeduplicacao: hash,
        rawText: JSON.stringify({
          ...product,
          storageError: image.error,
        }),
      })
      .returning();

    inseridos += 1;

    if (item && (image.storageUrl ?? product.imagem)) {
      await db.insert(productImageCandidatesTable).values({
        produtoNormalizado,
        origem: ORIGEM,
        imageUrl: image.storageUrl ?? product.imagem!,
        qualityScore: image.storageUrl ? 90 : 60,
        status: "candidato",
        sourceImportItemId: item.id,
      }).catch((error) => logger.warn({ error, itemId: item.id }, "[atacadao-site-importer] imagem candidata não inserida"));
    }

    if (canAutoPublish && item) {
      const ofertaId = await publicarItem(item, importRecord, source);
      if (ofertaId) {
        publicados += 1;
        await db
          .update(folhetoImportItemsTable)
          .set({ status: "publicado", ofertaId })
          .where(eq(folhetoImportItemsTable.id, item.id));
        logger.info(
          { produto: product.nome, preco, imagem: image.storageUrl, ofertaId },
          "[atacadao-site-importer] oferta autopublicada",
        );
      } else {
        revisao += 1;
        await db
          .update(folhetoImportItemsTable)
          .set({ status: "revisao" })
          .where(eq(folhetoImportItemsTable.id, item.id));
        logger.warn(
          { produto: product.nome, preco },
          "[atacadao-site-importer] publicarItem falhou — revertido para revisão",
        );
      }
    } else {
      revisao += 1;
      const motivo = !VTEX_AUTOPUBLISH
        ? "ATACADAO_VTEX_AUTOPUBLISH não ativado"
        : "imagem não armazenada no Supabase";
      logger.debug(
        { produto: product.nome, preco, imagem: product.imagem ?? null, motivo },
        "[atacadao-site-importer] produto em revisão manual",
      );
    }
  }

  await db
    .update(folhetoImportsTable)
    .set({
      totalExtraido: payload.products.length,
      totalPublicado: publicados,
      totalRevisao: revisao,
      totalDuplicado: duplicados,
      totalRejeitado: rejeitados,
      status: publicados > 0 ? "publicado" : "revisao",
      updatedAt: new Date(),
    })
    .where(eq(folhetoImportsTable.id, importRecord.id));

  logger.info(
    { importId: importRecord.id, total: payload.products.length, inseridos, publicados, revisao, duplicados, rejeitados, imagensSalvas, imagensComErro },
    "[atacadao-site-importer] importação concluída",
  );

  return {
    importId: importRecord.id,
    mercadoId,
    total: payload.products.length,
    inseridos,
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
