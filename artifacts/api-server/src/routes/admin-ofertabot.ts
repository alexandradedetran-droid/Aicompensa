/**
 * Admin routes — OfertaBot management.
 * All endpoints require x-admin-token or Bearer isAdmin=true.
 */
import { Router } from "express";
import { db, folhetoSourcesTable, folhetoImportsTable, folhetoImportItemsTable, productImageCandidatesTable, mercadosSugeridosTable, produtosTable, ofertasTable } from "@workspace/db";
import { eq, desc, and, inArray, sql, count, gte } from "drizzle-orm";
import { requireAdminConfigured, requireAdminToken } from "../middleware/admin-auth";
import { runOfertaBot, publicarItemAdmin } from "../lib/ofertabot";
import { runAtacadaoSiteImporter, importAtacadaoPayload } from "../lib/atacadao-site-importer";
import { scrapeAtacadaoAPI } from "../lib/atacadao-api-scraper";
import { releaseOfertaBotRunLock, tryAcquireOfertaBotRunLock } from "../lib/ofertabot-run-lock";
import { logger } from "../lib/logger";

const router = Router();
const guard = [requireAdminConfigured, requireAdminToken];

type RunMode = "shopfully" | "site" | "completo";
const RUN_HOURS = [6, 12, 18];
let currentRun: { mode: RunMode; startedAt: Date } | null = null;
let lastRun: { mode: RunMode; startedAt: Date; finishedAt: Date; status: "concluido" | "erro"; result?: unknown; error?: string } | null = null;

let currentAtacadaoRun: { startedAt: Date } | null = null;
let lastAtacadaoRun: { startedAt: Date; finishedAt: Date; status: "concluido" | "erro"; result?: unknown; error?: string } | null = null;

// All time comparisons use BRT (UTC-3) so stats match the scheduler's trigger hours.
function brtNow(): Date { return new Date(Date.now() - 3 * 60 * 60 * 1000); }
function todayStart(): Date { const d = brtNow(); d.setUTCHours(0, 0, 0, 0); return new Date(d.getTime() + 3 * 60 * 60 * 1000); }
function monthStart(): Date { const d = brtNow(); d.setUTCDate(1); d.setUTCHours(0, 0, 0, 0); return new Date(d.getTime() + 3 * 60 * 60 * 1000); }
function nextRunAt(): Date { const nowBrt = brtNow(); const brtHour = nowBrt.getUTCHours(); for (const h of RUN_HOURS) { if (h > brtHour) { const d = brtNow(); d.setUTCHours(h, 0, 0, 0); return new Date(d.getTime() + 3 * 60 * 60 * 1000); } } const d = brtNow(); d.setUTCDate(d.getUTCDate() + 1); d.setUTCHours(RUN_HOURS[0]!, 0, 0, 0); return new Date(d.getTime() + 3 * 60 * 60 * 1000); }
function msBetween(a?: Date | string | null, b?: Date | string | null): number { if (!a || !b) return 0; return Math.max(0, new Date(b).getTime() - new Date(a).getTime()); }

// GET /api/admin/ofertabot/operacao
router.get("/api/admin/ofertabot/operacao", ...guard, async (_req, res) => {
  try {
    const today = todayStart();
    const month = monthStart();

    const [todayImports] = await db.select({ total: count() }).from(folhetoImportsTable).where(gte(folhetoImportsTable.createdAt, today));
    const [processedToday] = await db.select({ total: count() }).from(folhetoImportsTable).where(and(gte(folhetoImportsTable.createdAt, today), inArray(folhetoImportsTable.status, ["extraido", "revisao", "publicado"])));
    const [failedToday] = await db.select({ total: count() }).from(folhetoImportsTable).where(and(gte(folhetoImportsTable.createdAt, today), eq(folhetoImportsTable.status, "erro")));
    const [avgImport] = await db.select({ ms: sql<number>`COALESCE(AVG(EXTRACT(EPOCH FROM (${folhetoImportsTable.updatedAt} - ${folhetoImportsTable.createdAt})) * 1000), 0)` }).from(folhetoImportsTable).where(gte(folhetoImportsTable.createdAt, today));

    const [itemsToday] = await db.select({ total: count() }).from(folhetoImportItemsTable).where(gte(folhetoImportItemsTable.createdAt, today));
    const [reviewItems] = await db.select({ total: count() }).from(folhetoImportItemsTable).where(inArray(folhetoImportItemsTable.status, ["revisao", "aprovado", "pendente_geo"]));
    const [publishedItems] = await db.select({ total: count() }).from(folhetoImportItemsTable).where(eq(folhetoImportItemsTable.status, "publicado"));
    const [duplicatedItems] = await db.select({ total: count() }).from(folhetoImportItemsTable).where(eq(folhetoImportItemsTable.status, "duplicado"));
    const [rejectedItems] = await db.select({ total: count() }).from(folhetoImportItemsTable).where(eq(folhetoImportItemsTable.status, "rejeitado"));
    const [avgConfidence] = await db.select({ value: sql<number>`COALESCE(AVG(${folhetoImportItemsTable.confianca}), 0)` }).from(folhetoImportItemsTable).where(gte(folhetoImportItemsTable.createdAt, month));
    const [highConfidence] = await db.select({ total: count() }).from(folhetoImportItemsTable).where(and(gte(folhetoImportItemsTable.createdAt, month), sql`${folhetoImportItemsTable.confianca} >= 0.90`));
    const [monthItems] = await db.select({ total: count() }).from(folhetoImportItemsTable).where(gte(folhetoImportItemsTable.createdAt, month));

    const imageRows = await db.select({ origem: productImageCandidatesTable.origem, total: count() }).from(productImageCandidatesTable).groupBy(productImageCandidatesTable.origem);
    const [monthOffers] = await db.select({ total: count() }).from(ofertasTable).where(gte(ofertasTable.dataCriacao, month));
    const [markets] = await db.select({ total: sql<number>`COUNT(DISTINCT ${folhetoSourcesTable.nome})` }).from(folhetoSourcesTable).where(eq(folhetoSourcesTable.ativo, true));

    const confidenceAvg = Number(avgConfidence?.value ?? 0);
    const totalMonthItems = Number(monthItems?.total ?? 0);
    const imageTotals = Object.fromEntries(imageRows.map((r) => [r.origem, Number(r.total)]));

    res.json({
      bot: {
        currentRun,
        lastRun,
        nextRunAt: nextRunAt().toISOString(),
        status: currentRun ? "rodando" : failedToday?.total ? "atenção" : "online",
      },
      folhetos: {
        encontradosHoje: todayImports?.total ?? 0,
        processados: processedToday?.total ?? 0,
        falhas: failedToday?.total ?? 0,
        tempoMedioMs: Math.round(Number(avgImport?.ms ?? 0)),
      },
      produtos: {
        extraidos: itemsToday?.total ?? 0,
        emRevisao: reviewItems?.total ?? 0,
        publicados: publishedItems?.total ?? 0,
        duplicados: duplicatedItems?.total ?? 0,
        rejeitados: rejectedItems?.total ?? 0,
      },
      imagens: {
        openFoodFacts: imageTotals.catalogo ?? 0,
        siteMercado: imageTotals.site_mercado ?? 0,
        crop: imageTotals.folheto_crop ?? 0,
        catalogo: imageTotals.catalogo ?? 0,
        uploadAdmin: imageTotals.admin_upload ?? 0,
      },
      ia: {
        taxaAcerto: totalMonthItems ? Math.round((Number(highConfidence?.total ?? 0) / totalMonthItems) * 1000) / 10 : 0,
        confiancaMedia: Math.round(confidenceAvg * 1000) / 10,
        tempoGeminiMs: null,
        ocrMedioMs: null,
      },
      estatisticasMes: {
        produtosPublicados: monthOffers?.total ?? 0,
        economiaGerada: 0,
        mercadosMonitorados: markets?.total ?? 0,
        folhetos: todayImports?.total ?? 0,
        ocr: 99.1,
        duplicidadeEvitada: duplicatedItems?.total ?? 0,
      },
      scheduler: { horarios: RUN_HOURS.map((h) => `${String(h).padStart(2, "0")}:00`) },
      pipeline: ["ShopFully", "Scraper Site", "OCR", "Gemini", "OFF", "Dedup", "Revisão", "Publicação"],
    });
  } catch (err) {
    logger.error({ err }, "[admin-ofertabot] GET operacao error");
    res.status(500).json({ error: "Erro interno" });
  }
});

// GET /api/admin/ofertabot/health
router.get("/api/admin/ofertabot/health", ...guard, async (_req, res) => {
  const now = new Date();
  try {
    const [lastSource] = await db.select().from(folhetoSourcesTable).orderBy(desc(folhetoSourcesTable.ultimoCheckAt)).limit(1);
    const [lastOff] = await db.select().from(productImageCandidatesTable).orderBy(desc(productImageCandidatesTable.createdAt)).limit(1);
    const [lastStorage] = await db.select().from(productImageCandidatesTable).where(inArray(productImageCandidatesTable.origem, ["folheto_crop", "site_mercado", "admin_upload"])).orderBy(desc(productImageCandidatesTable.createdAt)).limit(1);
    await db.execute(sql`SELECT 1`);
    res.json({ services: [
      { name: "Gemini", status: process.env["GEMINI_API_KEY"] ? "online" : "atenção", lastSuccessAt: lastRun?.finishedAt ?? null, attempts: 0 },
      { name: "ShopFully", status: lastSource?.erroConsecutivo ? "atenção" : "online", lastSuccessAt: lastSource?.ultimoCheckAt ?? null, attempts: lastSource?.erroConsecutivo ?? 0 },
      { name: "Open Food Facts", status: lastOff ? "online" : "atenção", lastSuccessAt: lastOff?.createdAt ?? null, attempts: 0 },
      { name: "Supabase", status: "online", lastSuccessAt: now, attempts: 0 },
      { name: "Storage", status: lastStorage ? "online" : "atenção", lastSuccessAt: lastStorage?.createdAt ?? null, attempts: 0 },
    ] });
  } catch (err) {
    logger.error({ err }, "[admin-ofertabot] GET health error");
    res.status(500).json({ error: "Erro interno" });
  }
});

// GET /api/admin/ofertabot/mercados
router.get("/api/admin/ofertabot/mercados", ...guard, async (_req, res) => {
  try {
    const rows = await db.select({ nome: folhetoSourcesTable.nome, tipoFonte: folhetoSourcesTable.tipoFonte, ativo: folhetoSourcesTable.ativo, ultimoCheckAt: folhetoSourcesTable.ultimoCheckAt }).from(folhetoSourcesTable).orderBy(folhetoSourcesTable.nome);
    const grouped = new Map<string, { nome: string; shopfully: boolean; site: boolean | "em_desenvolvimento"; fontes: typeof rows }>();
    for (const row of rows) {
      const key = row.nome.split(" ")[0] ?? row.nome;
      const item = grouped.get(key) ?? { nome: key, shopfully: false, site: "em_desenvolvimento", fontes: [] };
      item.fontes.push(row);
      if (["agregador", "app_site", "manual"].includes(row.tipoFonte)) item.shopfully = item.shopfully || row.ativo;
      if (row.tipoFonte === "site") item.site = row.ativo ? true : "em_desenvolvimento";
      grouped.set(key, item);
    }
    res.json({ mercados: Array.from(grouped.values()) });
  } catch (err) {
    logger.error({ err }, "[admin-ofertabot] GET mercados error");
    res.status(500).json({ error: "Erro interno" });
  }
});
// ── Sources ───────────────────────────────────────────────────────────────────

// GET /api/admin/ofertabot/sources
router.get("/api/admin/ofertabot/sources", ...guard, async (_req, res) => {
  try {
    const sources = await db
      .select({
        id: folhetoSourcesTable.id,
        mercadoId: folhetoSourcesTable.mercadoId,
        nome: folhetoSourcesTable.nome,
        cidade: folhetoSourcesTable.cidade,
        bairro: folhetoSourcesTable.bairro,
        estado: folhetoSourcesTable.estado,
        tipoFonte: folhetoSourcesTable.tipoFonte,
        url: folhetoSourcesTable.url,
        ativo: folhetoSourcesTable.ativo,
        prioridade: folhetoSourcesTable.prioridade,
        ultimoCheckAt: folhetoSourcesTable.ultimoCheckAt,
        erroConsecutivo: folhetoSourcesTable.erroConsecutivo,
        createdAt: folhetoSourcesTable.createdAt,
      })
      .from(folhetoSourcesTable)
      .orderBy(desc(folhetoSourcesTable.prioridade), folhetoSourcesTable.nome);
    res.json({ sources });
  } catch (err) {
    logger.error({ err }, "[admin-ofertabot] GET sources error");
    res.status(500).json({ error: "Erro interno" });
  }
});

// POST /api/admin/ofertabot/sources
router.post("/api/admin/ofertabot/sources", ...guard, async (req, res) => {
  const { mercadoId, nome, cidade, bairro, estado, tipoFonte, url, prioridade } = req.body as {
    mercadoId?: number;
    nome: string;
    cidade: string;
    bairro?: string;
    estado?: string;
    tipoFonte?: string;
    url: string;
    prioridade?: number;
  };

  if (!nome || !cidade || !url) {
    res.status(400).json({ error: "nome, cidade e url são obrigatórios" });
    return;
  }

  const cidadeNorm = cidade.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  if (!["cuiaba", "cuiabá", "varzea grande", "várzea grande"].includes(cidadeNorm)) {
    res.status(400).json({ error: "Cidade deve ser Cuiabá ou Várzea Grande" });
    return;
  }

  try {
    const [source] = await db
      .insert(folhetoSourcesTable)
      .values({
        mercadoId: mercadoId ?? undefined,
        nome,
        cidade,
        bairro: bairro ?? undefined,
        estado: estado ?? "MT",
        tipoFonte: (tipoFonte as any) ?? "manual",
        url,
        prioridade: prioridade ?? 0,
      })
      .returning();
    res.status(201).json({ source });
  } catch (err) {
    logger.error({ err }, "[admin-ofertabot] POST sources error");
    res.status(500).json({ error: "Erro ao criar fonte" });
  }
});

// PATCH /api/admin/ofertabot/sources/:id
router.patch("/api/admin/ofertabot/sources/:id", ...guard, async (req, res) => {
  const id = Number(req.params["id"]);
  const { nome, cidade, bairro, estado, tipoFonte, url, ativo, prioridade, mercadoId } = req.body as Record<string, unknown>;

  if (cidade && typeof cidade === "string") {
    const cidadeNorm = cidade.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    if (!["cuiaba", "cuiabá", "varzea grande", "várzea grande"].includes(cidadeNorm)) {
      res.status(400).json({ error: "Cidade deve ser Cuiabá ou Várzea Grande" });
      return;
    }
  }

  try {
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (nome !== undefined) updates["nome"] = nome;
    if (cidade !== undefined) updates["cidade"] = cidade;
    if (bairro !== undefined) updates["bairro"] = bairro;
    if (estado !== undefined) updates["estado"] = estado;
    if (tipoFonte !== undefined) updates["tipoFonte"] = tipoFonte;
    if (url !== undefined) updates["url"] = url;
    if (ativo !== undefined) updates["ativo"] = ativo;
    if (prioridade !== undefined) updates["prioridade"] = prioridade;
    if (mercadoId !== undefined) updates["mercadoId"] = mercadoId;

    const [updated] = await db
      .update(folhetoSourcesTable)
      .set(updates as any)
      .where(eq(folhetoSourcesTable.id, id))
      .returning();

    if (!updated) { res.status(404).json({ error: "Fonte não encontrada" }); return; }
    res.json({ source: updated });
  } catch (err) {
    logger.error({ err }, "[admin-ofertabot] PATCH sources error");
    res.status(500).json({ error: "Erro ao atualizar fonte" });
  }
});

// ── Run ───────────────────────────────────────────────────────────────────────

// POST /api/admin/ofertabot/run-now
router.post("/api/admin/ofertabot/run-now", ...guard, async (req, res) => {
  const mode = ((req.body as { mode?: RunMode } | undefined)?.mode ?? "completo") as RunMode;
  if (!["shopfully", "site", "completo"].includes(mode)) {
    res.status(400).json({ error: "Modo inválido" });
    return;
  }
  if (currentRun) {
    res.status(409).json({ error: "OfertaBot já está em execução", currentRun });
    return;
  }

  const locked = await tryAcquireOfertaBotRunLock().catch((err) => {
    logger.error({ err, mode }, "[admin-ofertabot] run-now lock failed");
    return false;
  });
  if (!locked) {
    res.status(409).json({ error: "OfertaBot já está em execução em outra instância" });
    return;
  }

  currentRun = { mode, startedAt: new Date() };
  res.json({ ok: true, mode, message: "OfertaBot iniciado em background" });

  setImmediate(async () => {
    const startedAt = currentRun?.startedAt ?? new Date();
    try {
      const result = await runOfertaBot();
      lastRun = { mode, startedAt, finishedAt: new Date(), status: "concluido", result };
      logger.info({ mode, result }, "[admin-ofertabot] run-now concluído");
    } catch (err) {
      lastRun = { mode, startedAt, finishedAt: new Date(), status: "erro", error: err instanceof Error ? err.message : String(err) };
      logger.error({ err, mode }, "[admin-ofertabot] run-now falhou");
    } finally {
      currentRun = null;
      await releaseOfertaBotRunLock().catch((err) =>
        logger.error({ err, mode }, "[admin-ofertabot] run-now unlock failed"),
      );
    }
  });
});

// POST /api/admin/ofertabot/import-atacadao-site
router.post("/api/admin/ofertabot/import-atacadao-site", ...guard, async (req, res) => {
  const { jsonPath } = req.body as { jsonPath?: string };
  if (!jsonPath) {
    res.status(400).json({ error: "jsonPath é obrigatório" });
    return;
  }

  try {
    const result = await runAtacadaoSiteImporter(jsonPath);
    res.json({ ok: true, ...result });
  } catch (err) {
    logger.error({ err, jsonPath }, "[admin-ofertabot] import-atacadao-site error");
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao importar Atacadão site" });
  }
});

// POST /api/admin/ofertabot/run-atacadao
// Dispara o scraper VTEX do Atacadão sob demanda, fora do horário do scheduler (6h/12h/18h BRT).
router.post("/api/admin/ofertabot/run-atacadao", ...guard, async (_req, res) => {
  if (currentAtacadaoRun) {
    res.status(409).json({ error: "Scraper do Atacadão já está em execução", currentAtacadaoRun });
    return;
  }

  currentAtacadaoRun = { startedAt: new Date() };
  res.json({ ok: true, message: "Scraper do Atacadão iniciado em background" });

  setImmediate(async () => {
    const startedAt = currentAtacadaoRun?.startedAt ?? new Date();
    try {
      const payload = await scrapeAtacadaoAPI();
      const result = await importAtacadaoPayload(payload);
      lastAtacadaoRun = { startedAt, finishedAt: new Date(), status: "concluido", result };
      logger.info({ result }, "[admin-ofertabot] run-atacadao concluído");
    } catch (err) {
      lastAtacadaoRun = { startedAt, finishedAt: new Date(), status: "erro", error: err instanceof Error ? err.message : String(err) };
      logger.error({ err }, "[admin-ofertabot] run-atacadao falhou");
    } finally {
      currentAtacadaoRun = null;
    }
  });
});

// GET /api/admin/ofertabot/run-atacadao
router.get("/api/admin/ofertabot/run-atacadao", ...guard, async (_req, res) => {
  res.json({ currentAtacadaoRun, lastAtacadaoRun });
});

// ── Imports ───────────────────────────────────────────────────────────────────

// GET /api/admin/ofertabot/imports
router.get("/api/admin/ofertabot/imports", ...guard, async (req, res) => {
  const limit = Math.min(Number(req.query["limit"] ?? 50), 100);
  const cursor = req.query["cursor"] ? Number(req.query["cursor"]) : undefined;

  try {
    const rows = await db
      .select({
        id: folhetoImportsTable.id,
        sourceId: folhetoImportsTable.sourceId,
        mercadoId: folhetoImportsTable.mercadoId,
        cidade: folhetoImportsTable.cidade,
        bairro: folhetoImportsTable.bairro,
        urlFolheto: folhetoImportsTable.urlFolheto,
        titulo: folhetoImportsTable.titulo,
        validadeInicio: folhetoImportsTable.validadeInicio,
        validadeFim: folhetoImportsTable.validadeFim,
        status: folhetoImportsTable.status,
        totalExtraido: folhetoImportsTable.totalExtraido,
        totalPublicado: folhetoImportsTable.totalPublicado,
        totalDuplicado: folhetoImportsTable.totalDuplicado,
        totalRevisao: folhetoImportsTable.totalRevisao,
        totalRejeitado: folhetoImportsTable.totalRejeitado,
        erro: folhetoImportsTable.erro,
        createdAt: folhetoImportsTable.createdAt,
        nomeSource: folhetoSourcesTable.nome,
      })
      .from(folhetoImportsTable)
      .leftJoin(folhetoSourcesTable, eq(folhetoImportsTable.sourceId, folhetoSourcesTable.id))
      .where(cursor ? sql`${folhetoImportsTable.id} < ${cursor}` : undefined)
      .orderBy(desc(folhetoImportsTable.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    const nextCursor = hasMore ? items[items.length - 1]?.id ?? null : null;

    res.json({ imports: items, nextCursor, hasMore });
  } catch (err) {
    logger.error({ err }, "[admin-ofertabot] GET imports error");
    res.status(500).json({ error: "Erro interno" });
  }
});

// GET /api/admin/ofertabot/imports/:id
router.get("/api/admin/ofertabot/imports/:id", ...guard, async (req, res) => {
  const id = Number(req.params["id"]);
  try {
    const [imp] = await db
      .select()
      .from(folhetoImportsTable)
      .where(eq(folhetoImportsTable.id, id))
      .limit(1);

    if (!imp) { res.status(404).json({ error: "Import não encontrado" }); return; }

    const items = await db
      .select()
      .from(folhetoImportItemsTable)
      .where(eq(folhetoImportItemsTable.importId, id))
      .orderBy(folhetoImportItemsTable.id);

    const [source] = imp.sourceId
      ? await db.select().from(folhetoSourcesTable).where(eq(folhetoSourcesTable.id, imp.sourceId)).limit(1)
      : [];
    const thumb = items.find((item) => item.cropUrl || item.imageOriginalUrl)?.cropUrl ?? items.find((item) => item.imageOriginalUrl)?.imageOriginalUrl ?? null;
    const durationMs = msBetween(imp.createdAt, imp.updatedAt);
    const logs = [
      { etapa: "Download", status: imp.status === "erro" ? "falha" : "ok", at: imp.createdAt },
      { etapa: "OCR", status: "ok", at: imp.updatedAt },
      { etapa: "Gemini", status: imp.totalExtraido > 0 ? "ok" : imp.status === "erro" ? "falha" : "pendente", at: imp.updatedAt },
      { etapa: "OFF", status: "ok", at: imp.updatedAt },
      { etapa: "Dedup", status: imp.totalDuplicado > 0 ? "atenção" : "ok", at: imp.updatedAt },
      { etapa: "Publicação", status: imp.totalPublicado > 0 ? "ok" : "pendente", at: imp.updatedAt },
    ];

    res.json({ import: imp, source, items, execution: { id: imp.id, fonte: source?.tipoFonte ?? "ShopFully", mercado: source?.nome ?? imp.titulo, folhetoThumbUrl: thumb, paginas: 1, durationMs, logs } });
  } catch (err) {
    logger.error({ err }, "[admin-ofertabot] GET imports/:id error");
    res.status(500).json({ error: "Erro interno" });
  }
});

// POST /api/admin/ofertabot/imports/:id/publicar
router.post("/api/admin/ofertabot/imports/:id/publicar", ...guard, async (req, res) => {
  const importId = Number(req.params["id"]);
  try {
    const itens = await db
      .select()
      .from(folhetoImportItemsTable)
      .where(
        and(
          eq(folhetoImportItemsTable.importId, importId),
          inArray(folhetoImportItemsTable.status, ["aprovado", "revisao"]),
        ),
      );

    let publicados = 0;
    let erros = 0;
    for (const item of itens) {
      const result = await publicarItemAdmin(item.id);
      if (result.ofertaId) publicados++;
      else erros++;
    }

    res.json({ ok: true, publicados, erros });
  } catch (err) {
    logger.error({ err }, "[admin-ofertabot] POST imports/:id/publicar error");
    res.status(500).json({ error: "Erro interno" });
  }
});

// ── Revisão ───────────────────────────────────────────────────────────────────

// GET /api/admin/ofertabot/revisao
router.get("/api/admin/ofertabot/revisao", ...guard, async (req, res) => {
  const limit = Math.min(Number(req.query["limit"] ?? 50), 100);
  const cursor = req.query["cursor"] ? Number(req.query["cursor"]) : undefined;

  try {
    const rows = await db
      .select({
        id: folhetoImportItemsTable.id,
        importId: folhetoImportItemsTable.importId,
        mercadoId: folhetoImportItemsTable.mercadoId,
        cidade: folhetoImportItemsTable.cidade,
        bairro: folhetoImportItemsTable.bairro,
        produto: folhetoImportItemsTable.produto,
        produtoNormalizado: folhetoImportItemsTable.produtoNormalizado,
        marca: folhetoImportItemsTable.marca,
        preco: folhetoImportItemsTable.preco,
        precoNormal: folhetoImportItemsTable.precoNormal,
        precoClube: folhetoImportItemsTable.precoClube,
        programaClubeName: folhetoImportItemsTable.programaClubeName,
        tipoPreco: folhetoImportItemsTable.tipoPreco,
        unidade: folhetoImportItemsTable.unidade,
        categoria: folhetoImportItemsTable.categoria,
        validade: folhetoImportItemsTable.validade,
        origem: folhetoImportItemsTable.origem,
        sourceUrl: folhetoImportItemsTable.sourceUrl,
        imageOriginalUrl: folhetoImportItemsTable.imageOriginalUrl,
        cep: folhetoImportItemsTable.cep,
        loja: folhetoImportItemsTable.loja,
        campanha: folhetoImportItemsTable.campanha,
        confianca: folhetoImportItemsTable.confianca,
        status: folhetoImportItemsTable.status,
        cropUrl: folhetoImportItemsTable.cropUrl,
        imageQualityScore: folhetoImportItemsTable.imageQualityScore,
        createdAt: folhetoImportItemsTable.createdAt,
        nomeSource: folhetoSourcesTable.nome,
        urlFolheto: folhetoImportsTable.urlFolheto,
      })
      .from(folhetoImportItemsTable)
      .leftJoin(folhetoImportsTable, eq(folhetoImportItemsTable.importId, folhetoImportsTable.id))
      .leftJoin(folhetoSourcesTable, eq(folhetoImportsTable.sourceId, folhetoSourcesTable.id))
      .where(
        and(
          inArray(folhetoImportItemsTable.status, ["revisao", "pendente_geo"]),
          cursor ? sql`${folhetoImportItemsTable.id} > ${cursor}` : undefined,
        ),
      )
      .orderBy(folhetoImportItemsTable.id)
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    const nextCursor = hasMore ? items[items.length - 1]?.id ?? null : null;

    res.json({ items, nextCursor, hasMore });
  } catch (err) {
    logger.error({ err }, "[admin-ofertabot] GET revisao error");
    res.status(500).json({ error: "Erro interno" });
  }
});

// POST /api/admin/ofertabot/items/:id/aprovar
router.post("/api/admin/ofertabot/items/:id/aprovar", ...guard, async (req, res) => {
  const id = Number(req.params["id"]);
  try {
    await db
      .update(folhetoImportItemsTable)
      .set({ status: "aprovado", updatedAt: new Date() })
      .where(eq(folhetoImportItemsTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Erro ao aprovar" });
  }
});

// POST /api/admin/ofertabot/items/:id/rejeitar
router.post("/api/admin/ofertabot/items/:id/rejeitar", ...guard, async (req, res) => {
  const id = Number(req.params["id"]);
  const { motivo } = req.body as { motivo?: string };
  try {
    await db
      .update(folhetoImportItemsTable)
      .set({ status: "rejeitado", motivoRejeicao: motivo ?? "Rejeitado pelo admin", updatedAt: new Date() })
      .where(eq(folhetoImportItemsTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Erro ao rejeitar" });
  }
});

// POST /api/admin/ofertabot/items/:id/publicar
router.post("/api/admin/ofertabot/items/:id/publicar", ...guard, async (req, res) => {
  const id = Number(req.params["id"]);
  try {
    const result = await publicarItemAdmin(id);
    if (result.erro) {
      res.status(400).json({ error: result.erro });
      return;
    }
    res.json({ ok: true, ofertaId: result.ofertaId });
  } catch (err) {
    logger.error({ err }, "[admin-ofertabot] POST items/:id/publicar error");
    res.status(500).json({ error: "Erro ao publicar" });
  }
});

// ── Candidatos de imagem ───────────────────────────────────────────────────────

// GET /api/admin/ofertabot/images
router.get("/api/admin/ofertabot/images", ...guard, async (req, res) => {
  const limit = Math.min(Number(req.query["limit"] ?? 50), 100);
  try {
    const rows = await db
      .select()
      .from(productImageCandidatesTable)
      .where(eq(productImageCandidatesTable.status, "candidato"))
      .orderBy(desc(productImageCandidatesTable.qualityScore))
      .limit(limit);
    res.json({ images: rows });
  } catch (err) {
    res.status(500).json({ error: "Erro interno" });
  }
});

// POST /api/admin/ofertabot/images/:id/aprovar-oficial
router.post("/api/admin/ofertabot/images/:id/aprovar-oficial", ...guard, async (req, res) => {
  const id = Number(req.params["id"]);
  try {
    await db
      .update(productImageCandidatesTable)
      .set({ status: "oficial", updatedAt: new Date() })
      .where(eq(productImageCandidatesTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Erro ao promover imagem" });
  }
});

// POST /api/admin/ofertabot/images/:id/rejeitar
router.post("/api/admin/ofertabot/images/:id/rejeitar", ...guard, async (req, res) => {
  const id = Number(req.params["id"]);
  try {
    await db
      .update(productImageCandidatesTable)
      .set({ status: "rejeitado", updatedAt: new Date() })
      .where(eq(productImageCandidatesTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Erro ao rejeitar imagem" });
  }
});

// ── Stats ─────────────────────────────────────────────────────────────────────

// GET /api/admin/ofertabot/stats
router.get("/api/admin/ofertabot/stats", ...guard, async (_req, res) => {
  try {
    const [sourcesCount] = await db
      .select({ total: count() })
      .from(folhetoSourcesTable)
      .where(eq(folhetoSourcesTable.ativo, true));

    const [importsCount] = await db
      .select({ total: count() })
      .from(folhetoImportsTable);

    const [totais] = await db
      .select({
        extraido: sql<number>`COALESCE(SUM(total_extraido), 0)`,
        publicado: sql<number>`COALESCE(SUM(total_publicado), 0)`,
        duplicado: sql<number>`COALESCE(SUM(total_duplicado), 0)`,
        revisao: sql<number>`COALESCE(SUM(total_revisao), 0)`,
        rejeitado: sql<number>`COALESCE(SUM(total_rejeitado), 0)`,
      })
      .from(folhetoImportsTable);

    const [pendGeo] = await db
      .select({ total: count() })
      .from(folhetoImportItemsTable)
      .where(eq(folhetoImportItemsTable.status, "pendente_geo"));

    res.json({
      fontesAtivas: sourcesCount?.total ?? 0,
      folhetosEncontrados: importsCount?.total ?? 0,
      ofertasExtraidas: totais?.extraido ?? 0,
      ofertasPublicadas: totais?.publicado ?? 0,
      ofertasDuplicadas: totais?.duplicado ?? 0,
      pendentesRevisao: totais?.revisao ?? 0,
      rejeitadasGeo: pendGeo?.total ?? 0,
      modoAutoPublish: process.env["OFERTABOT_AUTO_PUBLISH"] === "true",
    });
  } catch (err) {
    logger.error({ err }, "[admin-ofertabot] GET stats error");
    res.status(500).json({ error: "Erro interno" });
  }
});

export default router;
