// @ts-nocheck
/**
 * Sprint 13 — Alerta Inteligente de Compras
 *
 * Routes:
 *   GET  /api/lista/analise           — run analysis for current user
 *   GET  /api/lista/analise/historico — last 90 days of analysis history
 *   GET  /api/lista/analise/stats     — cumulative savings stats
 */

import { Router } from "express";
import { and, desc, eq, gt, sql, max, min } from "drizzle-orm";
import { db, shoppingAnalysisHistoryTable } from "@workspace/db";
import { requireAuth } from "../middleware/auth";
import { analyzeListForUser, persistAndAlert } from "../lib/shopping-analyzer";

const router = Router();

// ── GET /api/lista/analise ────────────────────────────────────────────────────

router.get("/lista/analise", requireAuth, async (req, res) => {
  const userId = req.session.userId!;

  try {
    const analysis = await analyzeListForUser(userId);

    if (!analysis) {
      res.json({
        empty: true,
        mensagem: "Adicione itens à sua lista para receber análises personalizadas.",
      });
      return;
    }

    // Persist to history and trigger smart alert (fire-and-forget; 12h guard prevents duplicate push)
    persistAndAlert(userId, analysis).catch(() => {});

    res.json(analysis);
  } catch (err) {
    const pgCode = (err as { code?: string }).code;
    if (pgCode === "42P01") {
      res.status(503).json({ error: "Sistema de análise de lista ainda não disponível." });
    } else {
      res.status(500).json({ error: "Erro ao analisar lista de compras." });
    }
  }
});

// ── GET /api/lista/analise/historico ─────────────────────────────────────────

router.get("/lista/analise/historico", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const limit  = Math.min(Number(req.query["limit"]) || 30, 90);

  try {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const rows = await db
      .select({
        id:                 shoppingAnalysisHistoryTable.id,
        mercadoIdeal:       shoppingAnalysisHistoryTable.mercadoIdeal,
        economiaTotal:      shoppingAnalysisHistoryTable.economiaTotal,
        percentualEconomia: shoppingAnalysisHistoryTable.percentualEconomia,
        itensEncontrados:   shoppingAnalysisHistoryTable.itensEncontrados,
        itensTotais:        shoppingAnalysisHistoryTable.itensTotais,
        score:              shoppingAnalysisHistoryTable.score,
        pushSent:           shoppingAnalysisHistoryTable.pushSent,
        createdAt:          shoppingAnalysisHistoryTable.createdAt,
      })
      .from(shoppingAnalysisHistoryTable)
      .where(
        and(
          eq(shoppingAnalysisHistoryTable.userId, userId),
          gt(shoppingAnalysisHistoryTable.createdAt, ninetyDaysAgo),
        ),
      )
      .orderBy(desc(shoppingAnalysisHistoryTable.createdAt))
      .limit(limit);

    res.json({ historico: rows });
  } catch (err) {
    const pgCode = (err as { code?: string }).code;
    if (pgCode === "42P01") {
      res.json({ historico: [] });
    } else {
      res.status(500).json({ error: "Erro ao buscar histórico de análises." });
    }
  }
});

// ── GET /api/lista/analise/stats ──────────────────────────────────────────────

router.get("/lista/analise/stats", requireAuth, async (req, res) => {
  const userId = req.session.userId!;

  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    // Aggregate from last 30 days
    const [stats30] = await db
      .select({
        economiaAcumulada:  sql<number>`coalesce(sum(economia_total), 0)::real`,
        maiorEconomia:      sql<number>`coalesce(max(economia_total), 0)::real`,
        totalAnalises:      sql<number>`count(*)::int`,
      })
      .from(shoppingAnalysisHistoryTable)
      .where(
        and(
          eq(shoppingAnalysisHistoryTable.userId, userId),
          gt(shoppingAnalysisHistoryTable.createdAt, thirtyDaysAgo),
        ),
      );

    // Mercado campeão (most frequent best market, last 90 days)
    const mercadoRows = await db
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

    const mercadoCampeao = mercadoRows[0]?.mercado ?? null;

    res.json({
      economiaAcumulada30dias: stats30?.economiaAcumulada ?? 0,
      maiorEconomia:           stats30?.maiorEconomia ?? 0,
      totalAnalises30dias:     stats30?.totalAnalises ?? 0,
      mercadoCampeao,
    });
  } catch (err) {
    const pgCode = (err as { code?: string }).code;
    if (pgCode === "42P01") {
      res.json({
        economiaAcumulada30dias: 0,
        maiorEconomia: 0,
        totalAnalises30dias: 0,
        mercadoCampeao: null,
      });
    } else {
      res.status(500).json({ error: "Erro ao buscar estatísticas de análise." });
    }
  }
});

export default router;
