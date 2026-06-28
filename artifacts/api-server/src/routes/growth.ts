// @ts-nocheck
/**
 * Sprint 15 — Growth Engine
 *
 * Routes:
 *   POST /api/growth/onboarding   — save prefs, add initial list, run first analysis
 *   POST /api/growth/event        — track a growth event
 *   GET  /api/growth/convite      — referral stats for current user
 *   POST /api/growth/feedback     — save user rating/feedback
 *   GET  /api/admin/growth        — growth dashboard (admin only)
 */

import { Router } from "express";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import {
  db,
  usuariosTable,
  shoppingProfileTable,
  shoppingPreferenceScoreTable,
  listaItensUsuarioTable,
  referralsTable,
  userFeedbackTable,
  growthEventsTable,
  pushSubscriptionsTable,
} from "@workspace/db";
import { requireAuth } from "../middleware/auth";
import { analyzeListForUser, persistAndAlert } from "../lib/shopping-analyzer";
import { logger } from "../lib/logger";

const router = Router();

const ADMIN_TOKEN = process.env["ADMIN_TOKEN"] ?? "changeme-admin-token";

function requireAdmin(req, res, next) {
  const token = req.headers["x-admin-token"];
  if (!token || token !== ADMIN_TOKEN) {
    res.status(401).json({ error: "Não autorizado." });
    return;
  }
  next();
}

// ── Category → canonical product names ───────────────────────────────────────

const CATEGORY_PRODUCTS: Record<string, string[]> = {
  "Grãos":      ["Arroz", "Feijão", "Milho", "Aveia"],
  "Laticínios": ["Leite", "Queijo", "Iogurte", "Manteiga"],
  "Carnes":     ["Frango", "Carne Bovina", "Peixe"],
  "Limpeza":    ["Detergente", "Sabão em Pó", "Desinfetante"],
  "Bebidas":    ["Suco", "Refrigerante", "Água"],
};

function slugify(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

// ── POST /api/growth/onboarding ───────────────────────────────────────────────

router.post("/growth/onboarding", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const { mercados = [], categorias = [], itens = [] } = req.body ?? {};

  try {
    // 1. Save market preference (first chosen market)
    if (Array.isArray(mercados) && mercados.length > 0) {
      await db
        .insert(shoppingProfileTable)
        .values({ userId, mercadoPreferido: mercados[0], ultimaAtualizacao: new Date() })
        .onConflictDoUpdate({
          target: shoppingProfileTable.userId,
          set: { mercadoPreferido: mercados[0], ultimaAtualizacao: new Date() },
        });
    }

    // 2. Seed preference scores for chosen categories
    if (Array.isArray(categorias)) {
      for (const cat of categorias) {
        const produtos = CATEGORY_PRODUCTS[cat] ?? [];
        for (const produto of produtos) {
          await db
            .insert(shoppingPreferenceScoreTable)
            .values({ userId, produto, score: 65 })
            .onConflictDoUpdate({
              target: [shoppingPreferenceScoreTable.userId, shoppingPreferenceScoreTable.produto],
              set: { score: sql`LEAST(100, ${shoppingPreferenceScoreTable.score} + 5)`, updatedAt: new Date() },
            });
        }
      }
    }

    // 3. Add initial list items only if list is empty
    const selectedItems = Array.isArray(itens) ? itens.filter(s => typeof s === "string" && s.trim()) : [];
    if (selectedItems.length > 0) {
      const [existing] = await db
        .select({ id: listaItensUsuarioTable.id })
        .from(listaItensUsuarioTable)
        .where(eq(listaItensUsuarioTable.usuarioId, userId))
        .limit(1);

      if (!existing) {
        await db.insert(listaItensUsuarioTable).values(
          selectedItems.map(nome => ({
            usuarioId: userId,
            nome: nome.trim(),
            slug: slugify(nome),
            ativo: true,
          })),
        );
      }
    }

    // 4. Run first analysis (fire-and-forget if it errors)
    let economiaTotal = 0;
    let melhorMercado = null;
    try {
      const analysis = await analyzeListForUser(userId);
      if (analysis) {
        economiaTotal = analysis.economiaTotal ?? 0;
        melhorMercado = analysis.melhorMercado ?? null;
        persistAndAlert(userId, analysis).catch(() => {});

        // Track primeira_analise growth event
        await db.insert(growthEventsTable).values({
          userId, tipo: "primeira_analise", metadata: { economiaTotal },
        }).onConflictDoNothing?.() ?? {};
      }
    } catch {
      // analysis can fail if tables not ready — onboarding still succeeds
    }

    // 5. Mark onboarding as completed
    await db.insert(growthEventsTable).values({
      userId,
      tipo: "onboarding_completed",
      metadata: { mercados, categorias, itensCount: selectedItems.length },
    });

    logger.info({ userId, economiaTotal }, "[Growth] onboarding_completed");
    res.json({ ok: true, economiaTotal: Math.round(economiaTotal * 100) / 100, melhorMercado });
  } catch (err) {
    logger.error({ err, userId }, "[Growth] onboarding error");
    res.status(500).json({ error: "Erro ao salvar onboarding." });
  }
});

// ── POST /api/growth/event ────────────────────────────────────────────────────

const GROWTH_TIPOS = new Set([
  "onboarding_started", "onboarding_completed",
  "primeira_lista", "primeira_oferta",
  "primeira_notificacao", "primeiro_convite",
  "primeira_economia", "primeira_analise",
]);

router.post("/growth/event", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const { tipo, metadata = {} } = req.body ?? {};

  if (!tipo || !GROWTH_TIPOS.has(tipo)) {
    res.status(400).json({ error: "Tipo de evento inválido." });
    return;
  }

  try {
    await db.insert(growthEventsTable).values({
      userId,
      tipo,
      metadata: typeof metadata === "object" ? metadata : {},
    });
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err, userId, tipo }, "[Growth] event error");
    res.status(500).json({ error: "Erro ao registrar evento." });
  }
});

// ── GET /api/growth/convite ───────────────────────────────────────────────────

router.get("/growth/convite", requireAuth, async (req, res) => {
  const userId = req.session.userId!;

  try {
    const [usuario] = await db
      .select({ codigoIndicacao: usuariosTable.codigoIndicacao })
      .from(usuariosTable)
      .where(eq(usuariosTable.id, userId))
      .limit(1);

    const codigo = usuario?.codigoIndicacao ?? null;

    const [refStats] = await db
      .select({
        total:      sql<number>`count(*)::int`,
        ativos:     sql<number>`sum(case when status = 'ativo' then 1 else 0 end)::int`,
      })
      .from(referralsTable)
      .where(eq(referralsTable.inviterUserId, userId));

    const frontendUrl = (process.env["FRONTEND_URL"] ?? "https://aicompensa.com.br").replace(/\/$/, "");
    res.json({
      codigo,
      link: codigo ? `${frontendUrl}/cadastro?ref=${codigo}` : null,
      totalConvidados:      refStats?.total  ?? 0,
      cadastrosConcluidos:  refStats?.ativos ?? 0,
    });
  } catch (err) {
    logger.error({ err, userId }, "[Growth] convite error");
    res.status(500).json({ error: "Erro ao buscar dados de convite." });
  }
});

// ── POST /api/growth/feedback ─────────────────────────────────────────────────

router.post("/growth/feedback", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const { rating, comment, context = "geral" } = req.body ?? {};

  if (!rating || typeof rating !== "number" || rating < 1 || rating > 5) {
    res.status(400).json({ error: "Rating inválido (1–5)." });
    return;
  }

  try {
    await db.insert(userFeedbackTable).values({
      userId,
      rating,
      comment: typeof comment === "string" ? comment.slice(0, 1000) : null,
      context: String(context).slice(0, 50),
    });
    logger.info({ userId, rating, context }, "[Growth] feedback received");
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err, userId }, "[Growth] feedback error");
    res.status(500).json({ error: "Erro ao salvar feedback." });
  }
});

// ── GET /api/admin/growth ─────────────────────────────────────────────────────

router.get("/admin/growth", requireAdmin, async (req, res) => {
  try {
    const now        = new Date();
    const d7  = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000);
    const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // New users
    const [users7d]  = await db.select({ n: sql<number>`count(*)::int` }).from(usuariosTable).where(gte(usuariosTable.criadoEm, d7));
    const [users30d] = await db.select({ n: sql<number>`count(*)::int` }).from(usuariosTable).where(gte(usuariosTable.criadoEm, d30));
    const [usersTotal] = await db.select({ n: sql<number>`count(*)::int` }).from(usuariosTable);

    // Growth events counts
    const eventCounts = await db
      .select({
        tipo:  growthEventsTable.tipo,
        total: sql<number>`count(distinct user_id)::int`,
      })
      .from(growthEventsTable)
      .groupBy(growthEventsTable.tipo);

    const ec = Object.fromEntries(eventCounts.map(r => [r.tipo, r.total]));

    const onboardingStarted    = ec["onboarding_started"]    ?? 0;
    const onboardingCompleted  = ec["onboarding_completed"]  ?? 0;
    const primeiraLista        = ec["primeira_lista"]        ?? 0;
    const primeiraOferta       = ec["primeira_oferta"]       ?? 0;
    const primeiraNotificacao  = ec["primeira_notificacao"]  ?? 0;
    const primeiroConvite      = ec["primeiro_convite"]      ?? 0;

    // Push activations
    const [pushCount] = await db
      .select({ n: sql<number>`count(distinct usuario_id)::int` })
      .from(pushSubscriptionsTable);

    // Referral conversion
    const [refTotal] = await db.select({ n: sql<number>`count(*)::int` }).from(referralsTable);
    const [refAtivos] = await db.select({ n: sql<number>`count(*)::int` }).from(referralsTable).where(eq(referralsTable.status, "ativo"));

    const taxaConclusao = onboardingStarted > 0
      ? Math.round((onboardingCompleted / onboardingStarted) * 100)
      : 0;

    const conversaoConvite = refTotal.n > 0
      ? Math.round((refAtivos.n / refTotal.n) * 100)
      : 0;

    res.json({
      novosUsuarios7d:        users7d.n,
      novosUsuarios30d:       users30d.n,
      totalUsuarios:          usersTotal.n,
      onboardingIniciados:    onboardingStarted,
      onboardingConcluidos:   onboardingCompleted,
      taxaConclusao,
      primeiraListaCriada:    primeiraLista,
      primeiraOfertaPublicada: primeiraOferta,
      pushAtivado:            pushCount.n,
      primeiraNotificacao,
      primeiroConvite,
      totalConvites:          refTotal.n,
      conversaoConvite,
    });
  } catch (err) {
    logger.error({ err }, "[Growth] admin/growth error");
    res.status(500).json({ error: "Erro ao buscar métricas de growth." });
  }
});

export default router;
