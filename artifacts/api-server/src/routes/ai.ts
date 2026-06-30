// @ts-nocheck
/**
 * Sprint 14 — AI Shopping Brain
 *
 * Routes:
 *   GET  /api/ai/profile           — personalized shopping profile
 *   GET  /api/ai/insights          — generated insights (≥3 analyses needed)
 *   GET  /api/ai/economia          — savings dashboard
 *   GET  /api/ai/trends/:produto   — price trend for a product
 *   GET  /api/ai/preferences       — product preference scores
 *   POST /api/ai/events            — track a user event
 */

import { Router } from "express";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import {
  db,
  shoppingAnalysisHistoryTable,
  shoppingPreferenceScoreTable,
} from "@workspace/db";
import { requireAuth } from "../middleware/auth";
import { getOrBuildProfile, trackEvent } from "../lib/shopping-profile";
import { getTrend } from "../lib/price-trend-analyzer";
import { getInsights } from "../lib/shopping-insights";

const router = Router();

// ── GET /api/ai/profile ───────────────────────────────────────────────────────

router.get("/ai/profile", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  try {
    const profile = await getOrBuildProfile(userId);
    if (!profile) {
      res.json({ empty: true, mensagem: "Perfil ainda não disponível. Continue usando o app para gerar insights." });
      return;
    }
    res.json(profile);
  } catch {
    res.status(500).json({ error: "Erro ao buscar perfil inteligente." });
  }
});

// ── GET /api/ai/insights ──────────────────────────────────────────────────────

router.get("/ai/insights", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  try {
    const insights = await getInsights(userId);
    res.json({ insights });
  } catch {
    res.status(500).json({ error: "Erro ao gerar insights." });
  }
});

// ── GET /api/ai/economia ──────────────────────────────────────────────────────

router.get("/ai/economia", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  try {
    const ninetyDaysAgo  = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo  = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo   = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Aggregate stats
    const [stats] = await db
      .select({
        economiaTotal:   sql<number>`coalesce(sum(economia_total), 0)::real`,
        economia30dias:  sql<number>`coalesce(sum(economia_total) filter (where created_at >= ${thirtyDaysAgo}), 0)::real`,
        economia7dias:   sql<number>`coalesce(sum(economia_total) filter (where created_at >= ${sevenDaysAgo}), 0)::real`,
        maiorEconomia:   sql<number>`coalesce(max(economia_total), 0)::real`,
        totalAnalises:   sql<number>`count(*)::int`,
      })
      .from(shoppingAnalysisHistoryTable)
      .where(
        and(
          eq(shoppingAnalysisHistoryTable.userId, userId),
          gt(shoppingAnalysisHistoryTable.createdAt, ninetyDaysAgo),
        ),
      );

    // Best market (most frequent)
    const [bestMercado] = await db
      .select({
        mercado: shoppingAnalysisHistoryTable.mercadoIdeal,
        count:   sql<number>`count(*)::int`,
      })
      .from(shoppingAnalysisHistoryTable)
      .where(
        and(
          eq(shoppingAnalysisHistoryTable.userId, userId),
          gt(shoppingAnalysisHistoryTable.createdAt, ninetyDaysAgo),
          sql`mercado_ideal IS NOT NULL`,
        ),
      )
      .groupBy(shoppingAnalysisHistoryTable.mercadoIdeal)
      .orderBy(sql`count(*) desc`)
      .limit(1);

    // Monthly evolution (last 6 months)
    const monthlyRows = await db
      .select({
        mes:            sql<string>`to_char(date_trunc('month', created_at), 'YYYY-MM')`,
        economiaTotal:  sql<number>`coalesce(sum(economia_total), 0)::real`,
        totalAnalises:  sql<number>`count(*)::int`,
      })
      .from(shoppingAnalysisHistoryTable)
      .where(
        and(
          eq(shoppingAnalysisHistoryTable.userId, userId),
          gt(shoppingAnalysisHistoryTable.createdAt, new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000)),
        ),
      )
      .groupBy(sql`date_trunc('month', created_at)`)
      .orderBy(sql`date_trunc('month', created_at)`);

    // Top savings entry
    const [topEntry] = await db
      .select({
        economiaTotal:      shoppingAnalysisHistoryTable.economiaTotal,
        mercadoIdeal:       shoppingAnalysisHistoryTable.mercadoIdeal,
        percentualEconomia: shoppingAnalysisHistoryTable.percentualEconomia,
        createdAt:          shoppingAnalysisHistoryTable.createdAt,
      })
      .from(shoppingAnalysisHistoryTable)
      .where(eq(shoppingAnalysisHistoryTable.userId, userId))
      .orderBy(desc(shoppingAnalysisHistoryTable.economiaTotal))
      .limit(1);

    res.json({
      economiaTotal:  Math.round((stats?.economiaTotal ?? 0) * 100) / 100,
      economia30dias: Math.round((stats?.economia30dias ?? 0) * 100) / 100,
      economia7dias:  Math.round((stats?.economia7dias ?? 0) * 100) / 100,
      maiorEconomia:  Math.round((stats?.maiorEconomia ?? 0) * 100) / 100,
      totalAnalises:  stats?.totalAnalises ?? 0,
      melhorMercado:  bestMercado?.mercado ?? null,
      maiorEconomiaEntrada: topEntry
        ? {
            economiaTotal:      Math.round(topEntry.economiaTotal * 100) / 100,
            mercadoIdeal:       topEntry.mercadoIdeal,
            percentualEconomia: topEntry.percentualEconomia,
            data:               topEntry.createdAt.toISOString(),
          }
        : null,
      evolucaoMensal: monthlyRows.map(r => ({
        mes:           r.mes,
        economiaTotal: Math.round(r.economiaTotal * 100) / 100,
        totalAnalises: r.totalAnalises,
      })),
    });
  } catch {
    res.status(500).json({ error: "Erro ao buscar dashboard de economia." });
  }
});

// ── GET /api/ai/trends/:produto ───────────────────────────────────────────────

router.get("/ai/trends/:produto", requireAuth, async (req, res) => {
  const produto = decodeURIComponent(req.params["produto"] ?? "");
  if (!produto || produto.length < 2) {
    res.status(400).json({ error: "Produto inválido." });
    return;
  }
  try {
    const trend = await getTrend(produto);
    res.json(trend);
  } catch {
    res.status(500).json({ error: "Erro ao calcular tendência de preço." });
  }
});

// ── GET /api/ai/preferences ───────────────────────────────────────────────────

router.get("/ai/preferences", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  try {
    const rows = await db
      .select({
        produto:            shoppingPreferenceScoreTable.produto,
        score:              shoppingPreferenceScoreTable.score,
        ultimaCompra:       shoppingPreferenceScoreTable.ultimaCompra,
        ultimaVisualizacao: shoppingPreferenceScoreTable.ultimaVisualizacao,
        updatedAt:          shoppingPreferenceScoreTable.updatedAt,
      })
      .from(shoppingPreferenceScoreTable)
      .where(eq(shoppingPreferenceScoreTable.userId, userId))
      .orderBy(desc(shoppingPreferenceScoreTable.score))
      .limit(50);

    res.json({ preferences: rows });
  } catch {
    res.status(500).json({ error: "Erro ao buscar preferências." });
  }
});

// ── POST /api/ai/events ───────────────────────────────────────────────────────

const ALLOWED_TIPOS = new Set([
  "abriu_oferta", "ignorou_oferta", "abriu_notificacao",
  "clicou_recomendacao", "mercado_escolhido",
  "lista_criada", "lista_compartilhada",
  "item_adicionado", "item_comprado",
]);

router.post("/ai/events", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const { tipo, produto, mercado, ofertaId, metadata } = req.body ?? {};

  if (!tipo || !ALLOWED_TIPOS.has(tipo)) {
    res.status(400).json({ error: "Tipo de evento inválido." });
    return;
  }

  // Fire-and-forget — don't block the caller
  trackEvent(userId, tipo, {
    produto:  typeof produto === "string" ? produto : undefined,
    mercado:  typeof mercado === "string" ? mercado : undefined,
    ofertaId: typeof ofertaId === "number" ? ofertaId : undefined,
    metadata: metadata && typeof metadata === "object" ? metadata : undefined,
  });

  res.json({ ok: true });
});

export default router;
