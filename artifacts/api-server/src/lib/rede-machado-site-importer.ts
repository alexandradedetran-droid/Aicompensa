import crypto from "crypto";
import {
  db,
  folhetoImportItemsTable,
  folhetoImportsTable,
  folhetoSourcesTable,
  mercadosSugeridosTable,
  ofertasTable,
} from "@workspace/db";
import { and, eq, ilike, sql } from "drizzle-orm";
import { logger } from "./logger";
import { scrapeRedeMachadoPromocoes, type RedeMachadoPayload, type RedeMachadoProduct } from "./rede-machado-scraper";

const MACHADO_SITE_URL = "https://redemachado.com.br/promocoes";
const MACHADO_MARKET_NAME = "Rede Machado - Sinop";
const CIDADE = "Sinop";
const BAIRRO = "Centro";
const ESTADO = "MT";
const ORIGEM = "rede_machado_site";
const BOT_USER_ID = Number(process.env["OFERTABOT_USER_ID"] ?? "0");

type ImportStats = {
  importId: number | null;
  mercadoId: number;
  total: number;
  inseridos: number;
  publicados: number;
  revisao: number;
  duplicados: number;
  rejeitados: number;
};

function gerarHash(fields: (string | number | null | undefined)[]): string {
  return crypto
    .createHash("sha256")
    .update(fields.map((field) => String(field ?? "")).join("|"))
    .digest("hex")
    .slice(0, 32);
}

function validadePadrao(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

function inferUnit(embalagem: string | null | undefined, nome: string): string {
  const text = `${embalagem ?? ""} ${nome}`.toLowerCase();
  if (/\bkg\b|quilo/.test(text)) return "kg";
  if (/\b(gr|g)\b/.test(text)) return "g";
  if (/\b(lt|l|litro)/.test(text)) return "litro";
  if (/\bml\b/.test(text)) return "ml";
  if (/fardo/.test(text)) return "fardo";
  if (/caixa|cx\b/.test(text)) return "caixa";
  if (/pacote|pct\b/.test(text)) return "pacote";
  return "un";
}

async function ensureMercado(): Promise<number> {
  const [existing] = await db
    .select({ id: mercadosSugeridosTable.id })
    .from(mercadosSugeridosTable)
    .where(
      and(
        ilike(mercadosSugeridosTable.nome, "%Machado%"),
        ilike(mercadosSugeridosTable.cidade, "Sinop%"),
      ),
    )
    .limit(1);

  if (existing) return existing.id;

  const createdRows = await db.execute<{ id: number }>(sql`
    INSERT INTO mercados_sugeridos (nome, bairro, cidade, estado, fonte, endereco)
    VALUES (${MACHADO_MARKET_NAME}, ${BAIRRO}, ${CIDADE}, ${ESTADO}, ${"site"}, ${"Av. das Itaúbas, 4001 - St. Comercial, Sinop - MT"})
    RETURNING id
  `);
  const [created] = createdRows.rows;

  if (!created) throw new Error("Não foi possível criar mercado Rede Machado - Sinop");
  return created.id;
}

async function ensureSource(mercadoId: number): Promise<number> {
  const [existing] = await db
    .select({ id: folhetoSourcesTable.id })
    .from(folhetoSourcesTable)
    .where(and(eq(folhetoSourcesTable.url, MACHADO_SITE_URL), eq(folhetoSourcesTable.cidade, CIDADE)))
    .limit(1);

  if (existing) return existing.id;

  const [created] = await db
    .insert(folhetoSourcesTable)
    .values({
      mercadoId,
      nome: MACHADO_MARKET_NAME,
      cidade: CIDADE,
      bairro: BAIRRO,
      estado: ESTADO,
      tipoFonte: "site",
      url: MACHADO_SITE_URL,
      ativo: true,
      prioridade: 20,
    })
    .returning({ id: folhetoSourcesTable.id });

  if (!created) throw new Error("Não foi possível criar fonte Rede Machado");
  return created.id;
}

async function itemOuOfertaExiste(hash: string): Promise<boolean> {
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

async function publicarProduto(
  product: RedeMachadoProduct,
  importId: number,
  mercadoId: number,
  hash: string,
): Promise<number | null> {
  if (!BOT_USER_ID) return null;

  const [oferta] = await db
    .insert(ofertasTable)
    .values({
      produto: product.nome,
      produtoNormalizado: product.nomeNormalizado,
      categoria: product.categoria,
      preco: product.precoValor,
      precoNormal: product.precoNormalValor ?? undefined,
      tipoPreco: product.precoNormalValor ? "ambos" : "normal",
      unidade: inferUnit(product.embalagem, product.nome),
      mercado: MACHADO_MARKET_NAME,
      mercadoId,
      bairro: product.bairro ?? BAIRRO,
      cidade: CIDADE,
      fotoUrl: product.imagem ?? undefined,
      usuarioId: BOT_USER_ID,
      tipoOrigem: "importada",
      origem: ORIGEM,
      fonteUrl: product.url,
      folhetoImportId: importId,
      folhetoOriginalUrl: MACHADO_SITE_URL,
      imagemResolvidaUrl: product.imagem ?? undefined,
      origemImagem: product.imagem ? "site_mercado" : "sem_imagem",
      imagemMatchScore: product.imagem ? 0.9 : undefined,
      hashDeduplicacao: hash,
      confidenceScore: "0.9200" as unknown as any,
      status: "nova",
    })
    .returning({ id: ofertasTable.id });

  return oferta?.id ?? null;
}

export async function importRedeMachadoPayload(payload: RedeMachadoPayload): Promise<ImportStats> {
  if (payload.importer !== "rede-machado-site-importer") {
    throw new Error(`JSON não pertence ao rede-machado-site-importer: ${payload.importer}`);
  }
  if (!Array.isArray(payload.products) || payload.products.length === 0) {
    throw new Error("Captura da Rede Machado não retornou produtos.");
  }

  const mercadoId = await ensureMercado();
  const sourceId = await ensureSource(mercadoId);
  const campanha = payload.scrapedAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
  const importHash = gerarHash([sourceId, campanha, payload.products.length, payload.products[0]?.nome, payload.products.at(-1)?.nome]);

  const [importRecord] = await db
    .insert(folhetoImportsTable)
    .values({
      sourceId,
      mercadoId,
      cidade: CIDADE,
      bairro: BAIRRO,
      urlFolheto: MACHADO_SITE_URL,
      titulo: `${MACHADO_MARKET_NAME} - promoções ${campanha}`,
      status: "extraido",
      hashConteudo: importHash,
      totalExtraido: payload.products.length,
    })
    .returning();

  if (!importRecord) throw new Error("Não foi possível criar import da Rede Machado");

  let inseridos = 0;
  let publicados = 0;
  let revisao = 0;
  let duplicados = 0;
  let rejeitados = 0;
  const validade = validadePadrao();

  for (const product of payload.products) {
    if (!product.nome || !product.precoValor || product.precoValor <= 0) {
      rejeitados += 1;
      continue;
    }

    const hash = gerarHash([mercadoId, product.nomeNormalizado, product.precoValor, validade, ORIGEM]);
    if (await itemOuOfertaExiste(hash)) {
      duplicados += 1;
      continue;
    }

    const [item] = await db
      .insert(folhetoImportItemsTable)
      .values({
        importId: importRecord.id,
        mercadoId,
        cidade: CIDADE,
        bairro: product.bairro ?? BAIRRO,
        produto: product.nome,
        produtoNormalizado: product.nomeNormalizado,
        preco: product.precoValor,
        precoNormal: product.precoNormalValor ?? undefined,
        tipoPreco: product.precoNormalValor ? "ambos" : "normal",
        unidade: inferUnit(product.embalagem, product.nome),
        categoria: product.categoria,
        validade,
        origem: ORIGEM,
        sourceUrl: product.url,
        imageOriginalUrl: product.imagem ?? undefined,
        loja: product.loja,
        campanha,
        confianca: "0.9200" as unknown as any,
        status: BOT_USER_ID ? "aprovado" : "revisao",
        rawText: product.embalagem ?? undefined,
        hashDeduplicacao: hash,
        imagemResolvidaUrl: product.imagem ?? undefined,
        origemImagem: product.imagem ? "site_mercado" : "sem_imagem",
        imagemMatchScore: product.imagem ? 0.9 : undefined,
      })
      .returning({ id: folhetoImportItemsTable.id });

    inseridos += 1;

    if (!item || !BOT_USER_ID) {
      revisao += 1;
      continue;
    }

    const ofertaId = await publicarProduto(product, importRecord.id, mercadoId, hash).catch((err) => {
      logger.error({ err, produto: product.nome }, "[rede-machado-importer] erro ao publicar oferta");
      return null;
    });

    if (ofertaId) {
      publicados += 1;
      await db
        .update(folhetoImportItemsTable)
        .set({ status: "publicado", ofertaId, updatedAt: new Date() })
        .where(eq(folhetoImportItemsTable.id, item.id));
    } else {
      revisao += 1;
    }
  }

  await db
    .update(folhetoImportsTable)
    .set({
      status: publicados > 0 ? "publicado" : "extraido",
      totalPublicado: publicados,
      totalDuplicado: duplicados,
      totalRevisao: revisao,
      totalRejeitado: rejeitados,
      updatedAt: new Date(),
    })
    .where(eq(folhetoImportsTable.id, importRecord.id));

  await db
    .update(folhetoSourcesTable)
    .set({ ultimoHash: importHash, ultimoCheckAt: new Date(), erroConsecutivo: 0, updatedAt: new Date() })
    .where(eq(folhetoSourcesTable.id, sourceId));

  logger.info(
    { importId: importRecord.id, total: payload.products.length, inseridos, publicados, revisao, duplicados, rejeitados },
    "[rede-machado-importer] import concluído",
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
  };
}

export async function runRedeMachadoImporter(): Promise<ImportStats> {
  const payload = await scrapeRedeMachadoPromocoes();
  return importRedeMachadoPayload(payload);
}

