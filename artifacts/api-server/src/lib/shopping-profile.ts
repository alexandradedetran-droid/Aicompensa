// @ts-nocheck
/**
 * Sprint 14 — AI Shopping Brain
 *
 * ShoppingProfileService: builds and caches the user's intelligent shopping
 * profile derived from analysis history, events, and list behaviour.
 */

import {
  db,
  shoppingProfileTable,
  shoppingAnalysisHistoryTable,
  shoppingEventsTable,
  shoppingPreferenceScoreTable,
  listaItensUsuarioTable,
  ofertasTable,
} from "@workspace/db";
import { and, eq, gt, sql, desc } from "drizzle-orm";
import { logger } from "./logger";

export type { ShoppingProfile } from "@workspace/db";

// ── Helpers ───────────────────────────────────────────────────────────────────

const PROFILE_TTL_MS = 60 * 60 * 1000; // 1 h

// ── buildProfile ──────────────────────────────────────────────────────────────

/**
 * Derive a full profile from stored analysis history and events.
 * Not persisted here — caller decides whether to upsert.
 */
async function buildProfile(userId: number) {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Pull analysis history (last 90 days)
  const history = await db
    .select({
      mercadoIdeal:       shoppingAnalysisHistoryTable.mercadoIdeal,
      economiaTotal:      shoppingAnalysisHistoryTable.economiaTotal,
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
    .limit(200);

  // Preferred market: most frequent
  const mercadoCount = new Map<string, number>();
  let economiaTotal = 0;
  let economia30dias = 0;
  const ticketValues: number[] = [];

  for (const row of history) {
    if (row.mercadoIdeal) {
      mercadoCount.set(row.mercadoIdeal, (mercadoCount.get(row.mercadoIdeal) ?? 0) + 1);
    }
    economiaTotal += row.economiaTotal;
    if (row.createdAt >= thirtyDaysAgo) economia30dias += row.economiaTotal;
    if (row.itensEncontrados > 0) {
      ticketValues.push(row.economiaTotal);
    }
  }

  const mercadoPreferido = [...mercadoCount.entries()]
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const ticketMedio = ticketValues.length > 0
    ? ticketValues.reduce((s, v) => s + v, 0) / ticketValues.length
    : 0;

  // Preferred day and hour from events
  const events = await db
    .select({ createdAt: shoppingEventsTable.createdAt, tipo: shoppingEventsTable.tipo })
    .from(shoppingEventsTable)
    .where(
      and(
        eq(shoppingEventsTable.userId, userId),
        gt(shoppingEventsTable.createdAt, ninetyDaysAgo),
      ),
    )
    .limit(500);

  const dayCount = new Array(7).fill(0);
  const hourCount = new Array(24).fill(0);
  for (const ev of events) {
    dayCount[ev.createdAt.getDay()]++;
    hourCount[ev.createdAt.getHours()]++;
  }

  const diaPreferido = dayCount.indexOf(Math.max(...dayCount));
  const horarioPreferido = hourCount.indexOf(Math.max(...hourCount));

  // Preferred category from current list items
  const listItems = await db
    .select({ nome: listaItensUsuarioTable.nome })
    .from(listaItensUsuarioTable)
    .where(and(eq(listaItensUsuarioTable.usuarioId, userId), eq(listaItensUsuarioTable.ativo, true)));

  // Simple category mapping from item names
  const categoriaPreferida = inferTopCategory(listItems.map(i => i.nome));

  return {
    mercadoPreferido,
    categoriaPreferida,
    diaPreferido: events.length >= 5 ? diaPreferido : null,
    horarioPreferido: events.length >= 5 ? horarioPreferido : null,
    ticketMedio: Math.round(ticketMedio * 100) / 100,
    economiaTotal: Math.round(economiaTotal * 100) / 100,
    economia30dias: Math.round(economia30dias * 100) / 100,
  };
}

// ── Category inference ────────────────────────────────────────────────────────

const CATEGORY_KEYWORDS: [string, string[]][] = [
  ["Hortifrúti",   ["fruta", "legume", "verdura", "tomate", "cebola", "alface", "banana", "maca", "laranja"]],
  ["Proteínas",    ["carne", "frango", "peixe", "ovo", "presunto", "salsicha", "linguiça", "bacon"]],
  ["Laticínios",   ["leite", "queijo", "iogurte", "manteiga", "nata", "creme"]],
  ["Bebidas",      ["suco", "refrigerante", "agua", "cerveja", "vinho", "cha", "cafe"]],
  ["Grãos",        ["arroz", "feijao", "lentilha", "grao", "milho", "trigo", "aveia"]],
  ["Limpeza",      ["detergente", "sabao", "amaciante", "desinfetante", "limpa", "lavanda"]],
  ["Higiene",      ["shampoo", "condicionador", "sabonete", "pasta", "escova", "desodorante"]],
];

function inferTopCategory(nomes: string[]): string | null {
  const counts = new Map<string, number>();
  for (const nome of nomes) {
    const lower = nome.toLowerCase();
    for (const [cat, keywords] of CATEGORY_KEYWORDS) {
      if (keywords.some(k => lower.includes(k))) {
        counts.set(cat, (counts.get(cat) ?? 0) + 1);
        break;
      }
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the cached profile if fresh (< 1 h); otherwise rebuilds and upserts.
 */
export async function getOrBuildProfile(userId: number) {
  const t0 = Date.now();

  // Try cached
  const [existing] = await db
    .select()
    .from(shoppingProfileTable)
    .where(eq(shoppingProfileTable.userId, userId))
    .limit(1);

  const isStale = !existing ||
    (Date.now() - existing.ultimaAtualizacao.getTime()) > PROFILE_TTL_MS;

  if (!isStale) return existing;

  // Rebuild
  const built = await buildProfile(userId);

  const upsertValues = {
    userId,
    ...built,
    ultimaAtualizacao: new Date(),
  };

  const [upserted] = await db
    .insert(shoppingProfileTable)
    .values(upsertValues)
    .onConflictDoUpdate({
      target: shoppingProfileTable.userId,
      set: {
        mercadoPreferido:   built.mercadoPreferido,
        categoriaPreferida: built.categoriaPreferida,
        diaPreferido:       built.diaPreferido,
        horarioPreferido:   built.horarioPreferido,
        ticketMedio:        built.ticketMedio,
        economiaTotal:      built.economiaTotal,
        economia30dias:     built.economia30dias,
        ultimaAtualizacao:  new Date(),
      },
    })
    .returning();

  logger.info({ userId, ms: Date.now() - t0 }, "[AI] profile rebuilt");
  return upserted;
}

// ── Preference score updates ──────────────────────────────────────────────────

const SCORE_DELTAS: Partial<Record<string, number>> = {
  abriu_oferta:        3,
  item_adicionado:     8,
  clicou_recomendacao: 10,
  item_comprado:       15,
};

async function updatePreferenceScore(
  userId: number,
  tipo: string,
  produto: string,
): Promise<void> {
  const delta = SCORE_DELTAS[tipo];
  if (!delta || !produto.trim()) return;

  const now = new Date();
  const initialScore = Math.min(100, 50 + delta);

  const setFields: Record<string, unknown> = {
    score:     sql`LEAST(100, GREATEST(0, ${shoppingPreferenceScoreTable.score} + ${delta}))`,
    updatedAt: now,
  };

  if (tipo === "abriu_oferta")   setFields.ultimaVisualizacao = now;
  if (tipo === "item_comprado")  setFields.ultimaCompra       = now;

  await db
    .insert(shoppingPreferenceScoreTable)
    .values({
      userId,
      produto,
      score:             initialScore,
      ultimaVisualizacao: tipo === "abriu_oferta"  ? now : undefined,
      ultimaCompra:       tipo === "item_comprado" ? now : undefined,
      updatedAt:          now,
    })
    .onConflictDoUpdate({
      target: [shoppingPreferenceScoreTable.userId, shoppingPreferenceScoreTable.produto],
      set:    setFields,
    });
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Track a user behavioural event. Fire-and-forget safe. */
export async function trackEvent(
  userId: number,
  tipo: string,
  data: { produto?: string; mercado?: string; ofertaId?: number; metadata?: Record<string, unknown> } = {},
): Promise<void> {
  try {
    await db.insert(shoppingEventsTable).values({
      userId,
      tipo: tipo as any,
      produto:  data.produto,
      mercado:  data.mercado,
      ofertaId: data.ofertaId,
      metadata: data.metadata ?? {},
    });

    if (data.produto) {
      await updatePreferenceScore(userId, tipo, data.produto);
    }
  } catch (err) {
    logger.error({ err, userId, tipo }, "[AI] failed to track event");
  }
}
