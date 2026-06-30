// @ts-nocheck
/**
 * Sprint 14 — AI Shopping Brain
 *
 * ShoppingInsights: generates personalized, confidence-gated insights for a user
 * from their shopping profile and analysis history.
 */

import {
  db,
  shoppingAnalysisHistoryTable,
  listaItensUsuarioTable,
  ofertasTable,
} from "@workspace/db";
import { and, eq, gt, sql, desc } from "drizzle-orm";
import { getOrBuildProfile } from "./shopping-profile";

export interface Insight {
  titulo:    string;
  mensagem:  string;
  tipo:      "economia" | "mercado" | "produto" | "habito" | "tendencia";
  confianca: "alta" | "media" | "baixa";
  icone:     string;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

const DAYS_PT = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const CONFIDENCE_MIN_ANALYSES = 3;

export async function getInsights(userId: number): Promise<Insight[]> {
  const insights: Insight[] = [];

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Get profile
  const profile = await getOrBuildProfile(userId);
  if (!profile) return [];

  // Get recent history
  const history = await db
    .select({
      mercadoIdeal:       shoppingAnalysisHistoryTable.mercadoIdeal,
      economiaTotal:      shoppingAnalysisHistoryTable.economiaTotal,
      percentualEconomia: shoppingAnalysisHistoryTable.percentualEconomia,
      itensEncontrados:   shoppingAnalysisHistoryTable.itensEncontrados,
      itensTotais:        shoppingAnalysisHistoryTable.itensTotais,
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
    .limit(90);

  if (history.length < CONFIDENCE_MIN_ANALYSES) return [];

  // ── 1. Total savings ────────────────────────────────────────────────────────
  if (profile.economiaTotal >= 10) {
    insights.push({
      titulo:    "Você está economizando",
      mensagem:  `Você economizou ${fmt(profile.economiaTotal)} nos últimos 90 dias usando o AíCompensa.`,
      tipo:      "economia",
      confianca: profile.economiaTotal >= 50 ? "alta" : "media",
      icone:     "💰",
    });
  }

  // ── 2. Savings last 30 days ─────────────────────────────────────────────────
  if (profile.economia30dias >= 5) {
    insights.push({
      titulo:    "Mês em destaque",
      mensagem:  `Você economizou ${fmt(profile.economia30dias)} nos últimos 30 dias.`,
      tipo:      "economia",
      confianca: "media",
      icone:     "📅",
    });
  }

  // ── 3. Preferred market ─────────────────────────────────────────────────────
  if (profile.mercadoPreferido && history.length >= 5) {
    const freq = history.filter(h => h.mercadoIdeal === profile.mercadoPreferido).length;
    const pct = Math.round((freq / history.length) * 100);
    if (pct >= 40) {
      insights.push({
        titulo:    "Seu mercado favorito",
        mensagem:  `O ${profile.mercadoPreferido} aparece em ${pct}% das suas análises como melhor opção.`,
        tipo:      "mercado",
        confianca: pct >= 60 ? "alta" : "media",
        icone:     "🏪",
      });
    }
  }

  // ── 4. Average ticket ───────────────────────────────────────────────────────
  if (profile.ticketMedio >= 5) {
    insights.push({
      titulo:    "Sua economia média",
      mensagem:  `Em média, você economiza ${fmt(profile.ticketMedio)} por análise de lista.`,
      tipo:      "economia",
      confianca: history.length >= 10 ? "alta" : "media",
      icone:     "📊",
    });
  }

  // ── 5. Best day to shop ─────────────────────────────────────────────────────
  if (profile.diaPreferido != null && history.length >= 10) {
    const diaNome = DAYS_PT[profile.diaPreferido];
    insights.push({
      titulo:    "Melhor dia para comprar",
      mensagem:  `Com base no seu histórico, você encontra melhores preços na ${diaNome}.`,
      tipo:      "habito",
      confianca: "media",
      icone:     "📆",
    });
  }

  // ── 6. Category insight ─────────────────────────────────────────────────────
  if (profile.categoriaPreferida) {
    // Check if this category has offers above average this week
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [catRow] = await db
      .select({
        totalOfertas: sql<number>`count(*)::int`,
        avgPreco:     sql<number>`avg(${ofertasTable.preco})`,
      })
      .from(ofertasTable)
      .where(
        and(
          eq(ofertasTable.categoria, profile.categoriaPreferida),
          sql`${ofertasTable.status} NOT IN ('expirada', 'suspeita', 'recusada', 'removida')`,
          gt(ofertasTable.dataCriacao, sevenDaysAgo),
        ),
      );

    if (catRow && catRow.totalOfertas >= 3) {
      insights.push({
        titulo:    `Ofertas em ${profile.categoriaPreferida}`,
        mensagem:  `Há ${catRow.totalOfertas} ofertas ativas na sua categoria preferida (${profile.categoriaPreferida}) esta semana.`,
        tipo:      "tendencia",
        confianca: catRow.totalOfertas >= 10 ? "alta" : "media",
        icone:     "🛒",
      });
    }
  }

  // ── 7. High-coverage streak ─────────────────────────────────────────────────
  const recentFull = history.slice(0, 7).filter(
    h => h.itensTotais > 0 && h.itensEncontrados / h.itensTotais >= 0.8,
  );
  if (recentFull.length >= 5) {
    insights.push({
      titulo:    "Lista bem coberta",
      mensagem:  `Nos últimos 7 dias, 80% ou mais dos seus itens tiveram ofertas encontradas.`,
      tipo:      "produto",
      confianca: "alta",
      icone:     "✅",
    });
  }

  // ── 8. List items without offers (last analysis) ────────────────────────────
  const last = history[0];
  if (last && last.itensTotais > 0) {
    const missing = last.itensTotais - last.itensEncontrados;
    if (missing >= 2) {
      insights.push({
        titulo:    "Itens sem ofertas",
        mensagem:  `${missing} ${missing === 1 ? "item da sua lista não tem" : "itens da sua lista não têm"} oferta ativa no momento.`,
        tipo:      "produto",
        confianca: "alta",
        icone:     "🔍",
      });
    }
  }

  return insights;
}
