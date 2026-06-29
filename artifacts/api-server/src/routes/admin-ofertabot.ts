/**
 * Admin routes — OfertaBot management.
 * All endpoints require x-admin-token or Bearer isAdmin=true.
 */
import { Router } from "express";
import { db, folhetoSourcesTable, folhetoImportsTable, folhetoImportItemsTable, productImageCandidatesTable, mercadosSugeridosTable, produtosTable } from "@workspace/db";
import { eq, desc, and, inArray, sql, count, isNull, isNotNull } from "drizzle-orm";
import { requireAdminConfigured, requireAdminToken } from "../middleware/admin-auth";
import { runOfertaBot, publicarItemAdmin } from "../lib/ofertabot";
import { logger } from "../lib/logger";

const router = Router();
const guard = [requireAdminConfigured, requireAdminToken];

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

  const cidadeNorm = cidade.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
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
    const cidadeNorm = cidade.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
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
router.post("/api/admin/ofertabot/run-now", ...guard, async (_req, res) => {
  res.json({ ok: true, message: "OfertaBot iniciado em background" });
  setImmediate(async () => {
    try {
      const result = await runOfertaBot();
      logger.info(result, "[admin-ofertabot] run-now concluído");
    } catch (err) {
      logger.error({ err }, "[admin-ofertabot] run-now falhou");
    }
  });
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

    res.json({ import: imp, items });
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
