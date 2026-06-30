/**
 * OfertaBot — motor automático de importação de folhetos por IA.
 *
 * Escopo geográfico: EXCLUSIVAMENTE Cuiabá-MT e Várzea Grande-MT.
 * Modo padrão: supervisionado (admin aprova antes de publicar).
 * Auto-publish: ativado por OFERTABOT_AUTO_PUBLISH=true.
 */
import crypto from "crypto";
import {
  db,
  ofertasTable,
  folhetoSourcesTable,
  folhetoImportsTable,
  folhetoImportItemsTable,
  productImageCandidatesTable,
  mercadosSugeridosTable,
} from "@workspace/db";
import { eq, and, inArray, isNull, sql } from "drizzle-orm";
import { ai } from "@workspace/integrations-gemini-ai";
import { logger } from "./logger";

// ── Configuração ───────────────────────────────────────────────────────────────

const AUTO_PUBLISH        = process.env["OFERTABOT_AUTO_PUBLISH"] === "true";
const BOT_USER_ID         = Number(process.env["OFERTABOT_USER_ID"] ?? "0");
const CONFIDENCE_AUTO_PUBLISH = 0.98;
const CONFIDENCE_FAST_QUEUE   = 0.90;
const CONFIDENCE_REVIEW       = 0.65;
const TIMEOUT_PER_SOURCE  = 30_000; // 30s por fonte
const MAX_SOURCES_PER_RUN = 10;
const CIDADES_PERMITIDAS  = ["cuiabá", "cuiaba", "várzea grande", "varzea grande"];

// ── Tipos internos ─────────────────────────────────────────────────────────────

interface ExtractionOferta {
  produto: string;
  produtoNormalizado: string;
  marca?: string;
  preco: number;
  precoNormal?: number;
  precoClube?: number;
  programaClubeName?: string;
  tipoPreco?: "normal" | "clube" | "ambos" | "desconhecido";
  unidade?: string;
  categoria?: string;
  validade?: string | null;
  confianca: number;
  rawText?: string;
}

interface ExtractionResult {
  mercado?: string;
  loja?: string;
  cidade?: string;
  bairro?: string;
  estado?: string;
  validadeInicio?: string;
  validadeFim?: string;
  confiancaGeo: number;
  ofertas: ExtractionOferta[];
}

// ── Result per source (used for the run summary) ──────────────────────────────

interface SourceRunResult {
  sourceId: number;
  nome: string;
  status: "skipped" | "processado" | "erro";
  motivo?: string;
  publicados: number;
  revisao: number;
  duplicados: number;
  rejeitados: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function normalizeCidade(c: string): string {
  return c
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function cidadePermitida(cidade: string): boolean {
  return CIDADES_PERMITIDAS.includes(normalizeCidade(cidade));
}

function gerarHash(fields: (string | number | null | undefined)[]): string {
  return crypto
    .createHash("sha256")
    .update(fields.map(f => String(f ?? "")).join("|"))
    .digest("hex")
    .slice(0, 32);
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout após ${ms}ms`)), ms),
    ),
  ]);
}

// ── Gemini: extração de produtos do folheto ───────────────────────────────────

const EXTRACTION_PROMPT = `Você é uma IA de extração de ofertas de supermercado para o AíCompensa.

Analise a imagem de folheto/encarte de supermercado e extraia TODOS os produtos visíveis.

REGRAS OBRIGATÓRIAS:
- Separe cada produto individualmente. Nunca agrupe dois produtos.
- Não invente produto, preço ou qualquer dado.
- Se o preço estiver ilegível, marque confianca < 0.5.
- Se a cidade não for Cuiabá-MT ou Várzea Grande-MT, marque confiancaGeo=0.
- Se a cidade não estiver clara, marque confiancaGeo=0.3.
- Retorne APENAS JSON válido, sem texto fora do JSON.

Para cada oferta retorne:
- produto: nome exato como aparece no folheto
- produtoNormalizado: nome padronizado (ex: "Coca-Cola Pet 2L")
- marca: marca se visível
- preco: preço numérico (obrigatório)
- precoNormal: preço sem desconto se visível
- precoClube: preço com cartão fidelidade se visível
- programaClubeName: nome do programa (ex: "Clube Comper")
- tipoPreco: "normal" | "clube" | "ambos" | "desconhecido"
- unidade: kg, g, un, litro, ml, pacote, caixa, fardo
- categoria: Alimentos, Bebidas, Limpeza, Higiene, Hortifruti, Carnes, Laticínios, Outros
- validade: data fim da oferta no formato YYYY-MM-DD ou null
- confianca: 0.0 a 1.0
- rawText: texto bruto que você leu

Retorne no formato:
{
  "mercado": "Nome do mercado",
  "loja": "Nome da loja/filial se identificado",
  "cidade": "Cuiabá ou Várzea Grande",
  "bairro": "nome do bairro se visível",
  "estado": "MT",
  "validadeInicio": "YYYY-MM-DD ou null",
  "validadeFim": "YYYY-MM-DD ou null",
  "confiancaGeo": 0.0-1.0,
  "ofertas": [...]
}`;

async function extrairComGemini(
  imageBase64: string,
  mimeType: "image/jpeg" | "image/png" | "image/webp",
): Promise<ExtractionResult | null> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { data: imageBase64, mimeType } },
            { text: EXTRACTION_PROMPT },
          ],
        },
      ],
    });

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.warn("[ofertabot] Gemini não retornou JSON válido");
      return null;
    }
    return JSON.parse(jsonMatch[0]) as ExtractionResult;
  } catch (err) {
    logger.error({ err }, "[ofertabot] Erro na extração Gemini");
    return null;
  }
}

// ── Download de imagem ────────────────────────────────────────────────────────

interface DownloadResult {
  base64: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  hash: string;
}

async function downloadImagem(url: string): Promise<DownloadResult | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "AiCompensa-OfertaBot/1.0 (aicompensa.com.br)" },
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      logger.warn({ url, status: res.status }, "[ofertabot] HTTP não-ok ao baixar folheto");
      return null;
    }

    const contentType = res.headers.get("content-type") ?? "";
    let mimeType: "image/jpeg" | "image/png" | "image/webp" = "image/jpeg";
    if (contentType.includes("png")) mimeType = "image/png";
    else if (contentType.includes("webp")) mimeType = "image/webp";

    const buffer = Buffer.from(await res.arrayBuffer());
    const hash = crypto.createHash("sha256").update(buffer).digest("hex");
    const base64 = buffer.toString("base64");

    return { base64, mimeType, hash };
  } catch (err) {
    logger.error({ err, url }, "[ofertabot] Erro ao baixar folheto");
    return null;
  }
}

// ── Deduplicação ──────────────────────────────────────────────────────────────

async function jaExisteOferta(hash: string): Promise<boolean> {
  const [row] = await db
    .select({ id: ofertasTable.id })
    .from(ofertasTable)
    .where(eq(ofertasTable.hashDeduplicacao, hash))
    .limit(1);
  return !!row;
}

async function jaExisteItem(hash: string): Promise<boolean> {
  const [row] = await db
    .select({ id: folhetoImportItemsTable.id })
    .from(folhetoImportItemsTable)
    .where(eq(folhetoImportItemsTable.hashDeduplicacao, hash))
    .limit(1);
  return !!row;
}

// ── Publicação de oferta ───────────────────────────────────────────────────────

async function hasOfficialImage(produtoNormalizado: string | null | undefined): Promise<boolean> {
  if (!produtoNormalizado) return false;
  const [image] = await db
    .select({ id: productImageCandidatesTable.id })
    .from(productImageCandidatesTable)
    .where(
      and(
        eq(productImageCandidatesTable.produtoNormalizado, produtoNormalizado),
        eq(productImageCandidatesTable.status, "oficial"),
      ),
    )
    .limit(1);
  return !!image;
}
export async function publicarItem(
  item: typeof folhetoImportItemsTable.$inferSelect,
  importRecord: typeof folhetoImportsTable.$inferSelect,
  source: typeof folhetoSourcesTable.$inferSelect,
): Promise<number | null> {
  if (!item.produto || !item.preco || !item.mercadoId) return null;
  if (!BOT_USER_ID) {
    logger.warn("[ofertabot] OFERTABOT_USER_ID não configurado — não é possível publicar");
    return null;
  }

  try {
    const [oferta] = await db
      .insert(ofertasTable)
      .values({
        produto: item.produto,
        produtoNormalizado: item.produtoNormalizado ?? item.produto,
        categoria: item.categoria ?? "Outros",
        marca: item.marca ?? undefined,
        preco: item.preco,
        precoNormal: item.precoNormal ?? undefined,
        precoClube: item.precoClube ?? undefined,
        programaClubeName: item.programaClubeName ?? undefined,
        tipoPreco: (item.tipoPreco as "normal" | "clube" | "ambos" | "desconhecido") ?? "desconhecido",
        unidade: item.unidade ?? "un",
        mercado: importRecord.titulo ?? source.nome,
        mercadoId: item.mercadoId,
        bairro: item.bairro ?? source.bairro ?? undefined,
        cidade: item.cidade ?? source.cidade,
        validade: item.validade ? new Date(item.validade) : undefined,
        fotoUrl: item.cropUrl ?? item.imageOriginalUrl ?? undefined,
        usuarioId: BOT_USER_ID,
        tipoOrigem: "importada",
        origem: item.origem ?? "ofertabot",
        fonteUrl: item.sourceUrl ?? source.url,
        folhetoImportId: importRecord.id,
        folhetoCropUrl: item.cropUrl ?? undefined,
        folhetoOriginalUrl: item.imageOriginalUrl ?? source.url,
        hashDeduplicacao: item.hashDeduplicacao ?? undefined,
        confidenceScore: item.confianca ?? undefined,
        status: "nova",
      })
      .returning({ id: ofertasTable.id });

    return oferta?.id ?? null;
  } catch (err) {
    logger.error({ err, itemId: item.id }, "[ofertabot] Erro ao publicar oferta");
    return null;
  }
}

// ── Processamento de itens extraídos ─────────────────────────────────────────

async function processarItens(
  ofertas: ExtractionOferta[],
  importRecord: typeof folhetoImportsTable.$inferSelect,
  source: typeof folhetoSourcesTable.$inferSelect,
  resultado: ExtractionResult,
): Promise<{ publicados: number; duplicados: number; revisao: number; rejeitados: number }> {
  let publicados = 0;
  let duplicados = 0;
  let revisao = 0;
  let rejeitados = 0;

  for (const oferta of ofertas) {
    // Validações básicas
    if (!oferta.produto || !oferta.preco || oferta.preco <= 0) {
      rejeitados++;
      await db.insert(folhetoImportItemsTable).values({
        importId: importRecord.id,
        mercadoId: importRecord.mercadoId ?? undefined,
        cidade: resultado.cidade ?? source.cidade,
        bairro: resultado.bairro ?? source.bairro ?? undefined,
        produto: oferta.produto,
        preco: oferta.preco,
        confianca: String(oferta.confianca ?? 0) as unknown as any,
        status: "rejeitado",
        rawText: oferta.rawText ?? undefined,
        motivoRejeicao: "Produto ou preço ausente",
      });
      continue;
    }

    // Verificar cidade
    const cidadeOferta = resultado.cidade ?? source.cidade;
    if (!cidadePermitida(cidadeOferta)) {
      rejeitados++;
      await db.insert(folhetoImportItemsTable).values({
        importId: importRecord.id,
        produto: oferta.produto,
        preco: oferta.preco,
        cidade: cidadeOferta,
        confianca: String(oferta.confianca ?? 0) as unknown as any,
        status: "pendente_geo",
        rawText: oferta.rawText ?? undefined,
        motivoRejeicao: `Cidade fora do escopo: ${cidadeOferta}`,
      });
      continue;
    }

    // Gerar hash de deduplicação
    const hash = gerarHash([
      importRecord.mercadoId,
      oferta.produtoNormalizado ?? oferta.produto,
      oferta.marca,
      oferta.unidade,
      oferta.preco,
      oferta.validade,
    ]);

    // Verificar duplicidade
    const isDuplicate = await jaExisteItem(hash) || await jaExisteOferta(hash);
    if (isDuplicate) {
      duplicados++;
      await db.insert(folhetoImportItemsTable).values({
        importId: importRecord.id,
        mercadoId: importRecord.mercadoId ?? undefined,
        produto: oferta.produto,
        produtoNormalizado: oferta.produtoNormalizado,
        marca: oferta.marca ?? undefined,
        preco: oferta.preco,
        confianca: String(oferta.confianca ?? 0) as unknown as any,
        hashDeduplicacao: hash,
        status: "duplicado",
        rawText: oferta.rawText ?? undefined,
      });
      continue;
    }

    // Regra de aprovação inteligente:
    // >=98% + imagem oficial + sem duplicidade publica automaticamente.
    // 90-97% entra aprovada para fila rápida; abaixo disso segue revisão/manual.
    const conf = oferta.confianca ?? 0;
    const officialImage = await hasOfficialImage(oferta.produtoNormalizado ?? oferta.produto);
    const shouldAutoPublish = conf >= CONFIDENCE_AUTO_PUBLISH && officialImage;
    const shouldFastQueue = conf >= CONFIDENCE_FAST_QUEUE;
    const shouldReview = conf >= CONFIDENCE_REVIEW;
    const status = !shouldReview ? "rejeitado" : shouldAutoPublish || shouldFastQueue ? "aprovado" : "revisao";

    if (status === "rejeitado") {
      rejeitados++;
    } else if (status === "revisao") {
      revisao++;
    }

    // Inserir item
    const [item] = await db
      .insert(folhetoImportItemsTable)
      .values({
        importId: importRecord.id,
        mercadoId: importRecord.mercadoId ?? undefined,
        cidade: cidadeOferta,
        bairro: resultado.bairro ?? source.bairro ?? undefined,
        produto: oferta.produto,
        produtoNormalizado: oferta.produtoNormalizado,
        marca: oferta.marca ?? undefined,
        preco: oferta.preco,
        precoNormal: oferta.precoNormal ?? undefined,
        precoClube: oferta.precoClube ?? undefined,
        programaClubeName: oferta.programaClubeName ?? undefined,
        tipoPreco: oferta.tipoPreco ?? "desconhecido",
        unidade: oferta.unidade ?? undefined,
        categoria: oferta.categoria ?? undefined,
        validade: oferta.validade ?? undefined,
        confianca: String(conf) as unknown as any,
        status,
        rawText: oferta.rawText ?? undefined,
        hashDeduplicacao: hash,
        motivoRejeicao: status === "rejeitado" ? `Confiança baixa: ${conf}` : undefined,
      })
      .returning();

    // Registrar candidata de imagem se existir crop_url
    if (item && oferta.produtoNormalizado) {
      await db.insert(productImageCandidatesTable).values({
        produtoNormalizado: oferta.produtoNormalizado,
        origem: "folheto_crop",
        imageUrl: source.url,
        qualityScore: Math.round((conf) * 100),
        status: "candidato",
        sourceImportItemId: item.id,
      }).catch(() => {});
    }

    // Auto-publicação autônoma somente quando a regra forte é satisfeita.
    if (status === "aprovado" && item) {
      const ofertaId = await publicarItem(item, importRecord, source);
      if (ofertaId) {
        publicados++;
        await db
          .update(folhetoImportItemsTable)
          .set({ status: "publicado", ofertaId })
          .where(eq(folhetoImportItemsTable.id, item.id));
      }
    }
  }

  return { publicados, duplicados, revisao, rejeitados };
}

// ── Processamento de uma fonte ────────────────────────────────────────────────

async function processarFonte(
  source: typeof folhetoSourcesTable.$inferSelect,
): Promise<SourceRunResult> {
  logger.info({ sourceId: source.id, nome: source.nome }, "[ofertabot] processando fonte");

  const base: SourceRunResult = {
    sourceId: source.id,
    nome: source.nome,
    status: "skipped",
    publicados: 0,
    revisao: 0,
    duplicados: 0,
    rejeitados: 0,
  };

  if (!cidadePermitida(source.cidade)) {
    logger.warn({ sourceId: source.id, cidade: source.cidade }, "[ofertabot] fonte com cidade fora do escopo, ignorando");
    return { ...base, motivo: `cidade fora do escopo: ${source.cidade}` };
  }

  const download = await withTimeout(downloadImagem(source.url), TIMEOUT_PER_SOURCE);
  if (!download) {
    await db
      .update(folhetoSourcesTable)
      .set({
        erroConsecutivo: sql`${folhetoSourcesTable.erroConsecutivo} + 1`,
        ultimoCheckAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(folhetoSourcesTable.id, source.id));
    return { ...base, status: "erro", motivo: "download da imagem falhou" };
  }

  if (source.ultimoHash === download.hash) {
    logger.info({ sourceId: source.id }, "[ofertabot] hash idêntico ao último check, pulando");
    await db
      .update(folhetoSourcesTable)
      .set({ ultimoCheckAt: new Date(), updatedAt: new Date() })
      .where(eq(folhetoSourcesTable.id, source.id));
    return { ...base, motivo: "mesmo conteúdo (hash idêntico)" };
  }

  const [importExistente] = await db
    .select({ id: folhetoImportsTable.id })
    .from(folhetoImportsTable)
    .where(eq(folhetoImportsTable.hashConteudo, download.hash))
    .limit(1);

  if (importExistente) {
    logger.info({ sourceId: source.id, importId: importExistente.id }, "[ofertabot] folheto já importado anteriormente");
    await db
      .update(folhetoSourcesTable)
      .set({ ultimoHash: download.hash, ultimoCheckAt: new Date(), updatedAt: new Date() })
      .where(eq(folhetoSourcesTable.id, source.id));
    return { ...base, motivo: "folheto já importado anteriormente" };
  }

  const [importRecord] = await db
    .insert(folhetoImportsTable)
    .values({
      sourceId: source.id,
      mercadoId: source.mercadoId ?? undefined,
      cidade: source.cidade,
      bairro: source.bairro ?? undefined,
      urlFolheto: source.url,
      titulo: source.nome,
      status: "baixado",
      hashConteudo: download.hash,
    })
    .returning();

  if (!importRecord) {
    return { ...base, status: "erro", motivo: "falha ao criar registro de importação" };
  }

  let resultado: ExtractionResult | null = null;
  try {
    resultado = await withTimeout(
      extrairComGemini(download.base64, download.mimeType),
      TIMEOUT_PER_SOURCE,
    );
  } catch (err) {
    logger.error({ err, importId: importRecord.id }, "[ofertabot] timeout na extração Gemini");
  }

  if (!resultado) {
    await db
      .update(folhetoImportsTable)
      .set({ status: "erro", erro: "Extração Gemini falhou", updatedAt: new Date() })
      .where(eq(folhetoImportsTable.id, importRecord.id));
    await db
      .update(folhetoSourcesTable)
      .set({ erroConsecutivo: sql`${folhetoSourcesTable.erroConsecutivo} + 1`, ultimoCheckAt: new Date(), updatedAt: new Date() })
      .where(eq(folhetoSourcesTable.id, source.id));
    return { ...base, status: "erro", motivo: "extração Gemini falhou" };
  }

  const cidadeResultado = resultado.cidade ?? source.cidade;
  if (resultado.confiancaGeo < 0.5 && !cidadePermitida(cidadeResultado)) {
    await db
      .update(folhetoImportsTable)
      .set({ status: "pendente_geo", cidade: cidadeResultado, updatedAt: new Date() })
      .where(eq(folhetoImportsTable.id, importRecord.id));
    await db
      .update(folhetoSourcesTable)
      .set({ ultimoHash: download.hash, ultimoCheckAt: new Date(), erroConsecutivo: 0, updatedAt: new Date() })
      .where(eq(folhetoSourcesTable.id, source.id));
    return { ...base, motivo: `geolocalização inválida: ${cidadeResultado}` };
  }

  await db
    .update(folhetoImportsTable)
    .set({
      status: "extraido",
      cidade: cidadeResultado,
      bairro: resultado.bairro ?? source.bairro ?? undefined,
      titulo: resultado.loja ?? resultado.mercado ?? source.nome,
      totalExtraido: resultado.ofertas.length,
      updatedAt: new Date(),
    })
    .where(eq(folhetoImportsTable.id, importRecord.id));

  const stats = await processarItens(resultado.ofertas, importRecord, source, resultado);

  await db
    .update(folhetoImportsTable)
    .set({
      status: stats.publicados > 0 || stats.revisao > 0 ? "publicado" : "extraido",
      totalPublicado: stats.publicados,
      totalDuplicado: stats.duplicados,
      totalRevisao: stats.revisao,
      totalRejeitado: stats.rejeitados,
      updatedAt: new Date(),
    })
    .where(eq(folhetoImportsTable.id, importRecord.id));

  await db
    .update(folhetoSourcesTable)
    .set({ ultimoHash: download.hash, ultimoCheckAt: new Date(), erroConsecutivo: 0, updatedAt: new Date() })
    .where(eq(folhetoSourcesTable.id, source.id));

  logger.info(
    { sourceId: source.id, importId: importRecord.id, ...stats },
    "[ofertabot] fonte processada",
  );

  return {
    ...base,
    status: "processado",
    publicados: stats.publicados,
    revisao: stats.revisao,
    duplicados: stats.duplicados,
    rejeitados: stats.rejeitados,
  };
}

// ── Entry point principal ─────────────────────────────────────────────────────

export async function runOfertaBot(): Promise<{ fontes: number; erros: number }> {
  const t0 = Date.now();
  logger.info("[ofertabot] iniciando execução");

  const fontes = await db
    .select()
    .from(folhetoSourcesTable)
    .where(
      and(
        eq(folhetoSourcesTable.ativo, true),
        inArray(folhetoSourcesTable.cidade, ["Cuiabá", "Várzea Grande"]),
      ),
    )
    .orderBy(folhetoSourcesTable.prioridade)
    .limit(MAX_SOURCES_PER_RUN);

  if (fontes.length === 0) {
    logger.info("[ofertabot] nenhuma fonte ativa encontrada");
    return { fontes: 0, erros: 0 };
  }

  const results: SourceRunResult[] = [];
  let erros = 0;

  for (const fonte of fontes) {
    try {
      results.push(await processarFonte(fonte));
    } catch (err) {
      erros++;
      logger.error({ err, sourceId: fonte.id }, "[ofertabot] erro ao processar fonte");
      results.push({
        sourceId: fonte.id,
        nome: fonte.nome,
        status: "erro",
        motivo: err instanceof Error ? err.message : String(err),
        publicados: 0,
        revisao: 0,
        duplicados: 0,
        rejeitados: 0,
      });
    }
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const totais = results.reduce(
    (acc, r) => ({
      publicados: acc.publicados + r.publicados,
      revisao: acc.revisao + r.revisao,
      duplicados: acc.duplicados + r.duplicados,
      rejeitados: acc.rejeitados + r.rejeitados,
    }),
    { publicados: 0, revisao: 0, duplicados: 0, rejeitados: 0 },
  );

  const linhas: string[] = ["", "=== OFERTABOT SUMMARY ===", ""];
  for (const r of results) {
    linhas.push(`Fonte: ${r.nome}`);
    if (r.status === "processado") {
      linhas.push(`  Folhetos processados: 1`);
      linhas.push(`  Publicados: ${r.publicados} | Revisão: ${r.revisao} | Duplicados: ${r.duplicados} | Rejeitados: ${r.rejeitados}`);
    } else if (r.status === "erro") {
      linhas.push(`  Status: erro — ${r.motivo ?? "desconhecido"}`);
    } else {
      linhas.push(`  Status: ignorado — ${r.motivo ?? "sem motivo"}`);
    }
    linhas.push("");
  }
  linhas.push(`Total: ${results.length} fontes | ${totais.publicados} publicados | ${totais.revisao} em revisão | ${totais.duplicados} duplicados | ${totais.rejeitados} rejeitados`);
  linhas.push(`Tempo total: ${elapsed}s`);
  linhas.push("");
  linhas.push("=========================");

  logger.info(linhas.join("\n"));

  return { fontes: fontes.length, erros };
}

// ── Publicar item manualmente (admin) ─────────────────────────────────────────

export async function publicarItemAdmin(itemId: number): Promise<{ ofertaId: number | null; erro?: string }> {
  const [item] = await db
    .select()
    .from(folhetoImportItemsTable)
    .where(eq(folhetoImportItemsTable.id, itemId))
    .limit(1);

  if (!item) return { ofertaId: null, erro: "Item não encontrado" };
  if (item.status === "publicado") return { ofertaId: item.ofertaId ?? null, erro: "Já publicado" };
  if (!item.produto || !item.preco) return { ofertaId: null, erro: "Produto ou preço ausente" };

  const [importRecord] = await db
    .select()
    .from(folhetoImportsTable)
    .where(eq(folhetoImportsTable.id, item.importId))
    .limit(1);
  if (!importRecord) return { ofertaId: null, erro: "Import não encontrado" };

  const [source] = await db
    .select()
    .from(folhetoSourcesTable)
    .where(eq(folhetoSourcesTable.id, importRecord.sourceId!))
    .limit(1);
  if (!source) return { ofertaId: null, erro: "Fonte não encontrada" };

  const ofertaId = await publicarItem(item, importRecord, source);
  if (!ofertaId) return { ofertaId: null, erro: "Falha ao inserir oferta" };

  await db
    .update(folhetoImportItemsTable)
    .set({ status: "publicado", ofertaId, updatedAt: new Date() })
    .where(eq(folhetoImportItemsTable.id, itemId));

  // Atualizar contador do import
  await db
    .update(folhetoImportsTable)
    .set({
      totalPublicado: sql`${folhetoImportsTable.totalPublicado} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(folhetoImportsTable.id, importRecord.id));

  return { ofertaId };
}
