// @ts-nocheck
/**
 * Sprint 13 — Alerta Inteligente de Compras
 *
 * ShoppingListAnalyzer: matches the user's shopping list against current offers,
 * calculates potential savings, recommends the best market, and generates a
 * smart alert when thresholds are met (≥ R$20 or ≥ 15%).
 */

import {
  db,
  listaItensUsuarioTable,
  listaCompartilhadaTable,
  listaCompartilhadaMembrosTable,
  listaCompartilhadaItensTable,
  ofertasTable,
  shoppingAnalysisHistoryTable,
  produtosTable,
} from "@workspace/db";
import { and, eq, inArray, isNull, or, sql, desc, gt, lt } from "drizzle-orm";
import { normalizeProductForAnalytics } from "./normaliza";
import { createNotification, NOTIF } from "./notifications";
import { logger } from "./logger";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ItemAnalysis {
  nome: string;
  slug: string;
  precoMedio: number | null;
  melhorPreco: number | null;
  melhorMercado: string | null;
  economiaAbsoluta: number | null;
  economiaPercentual: number | null;
  matchScore: number;
  ofertaId: number | null;
  encontrado: boolean;
}

export interface MercadoScore {
  mercado: string;
  itensEncontrados: number;
  totalPreco: number;
  economia: number;
  coberturaPercent: number;
  itens: { nome: string; preco: number; ofertaId: number; precoMedio: number | null }[];
}

export interface ListAnalysis {
  mercadoIdeal: string | null;
  economiaTotal: number;
  percentualEconomia: number;
  itensEncontrados: number;
  itensTotais: number;
  itensFaltando: string[];
  score: number;
  recomendacao: string;
  motivosRecomendacao: string[];
  itensDetalhes: ItemAnalysis[];
  mercados: MercadoScore[];
  analisadoEm: string;
}

// ── Product matching ──────────────────────────────────────────────────────────

const STOP_WORDS = new Set(["de", "da", "do", "com", "para", "a", "o", "e", "em"]);

function significant(words: string[]): string[] {
  return words.filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

/**
 * Compute a match score [0–100] between a list item slug and an offer.
 *
 *   95 = catalog name exact match
 *   90 = alias match
 *   80 = normalized substring or ≥70 % word overlap
 *    0 = no match
 *
 * Score < 80 is considered a mismatch.
 */
function matchScore(itemNorm: string, offerNorm: string, aliases?: string[]): number {
  if (!itemNorm || !offerNorm) return 0;

  // Exact match on normalized product name
  if (itemNorm === offerNorm) return 95;

  // Alias match
  if (aliases) {
    for (const alias of aliases) {
      if (normalizeProductForAnalytics(alias) === itemNorm) return 90;
    }
  }

  // One contains the other (skip very short tokens to avoid false positives)
  if (itemNorm.length > 3 && offerNorm.includes(itemNorm)) return 80;
  if (offerNorm.length > 3 && itemNorm.includes(offerNorm)) return 80;

  // Word-level overlap: ≥70 % of significant item words appear in offer
  const itemWords = significant(itemNorm.split(" "));
  const offerWords = new Set(significant(offerNorm.split(" ")));
  if (itemWords.length === 0) return 0;
  const matched = itemWords.filter(w => offerWords.has(w));
  const ratio = matched.length / itemWords.length;
  if (ratio >= 0.7) return 80;

  return 0;
}

// ── Core analysis ─────────────────────────────────────────────────────────────

const VALID_STATUSES = ["nova", "validada"] as const;

/** Compute R$ "economia" from offer and observed price average. */
function calcEconomy(preco: number, precoNormal: number | null, precoMedio: number | null): number {
  const ref = precoNormal ?? precoMedio;
  if (ref == null || ref <= preco) return 0;
  return ref - preco;
}

/**
 * Analyse the user's current active personal list items against live offers.
 * Returns a structured ListAnalysis (not persisted here).
 */
export async function analyzeListForUser(userId: number): Promise<ListAnalysis | null> {
  const t0 = Date.now();
  // 1. Fetch the user's active personal list items
  const listItems = await db
    .select({ id: listaItensUsuarioTable.id, nome: listaItensUsuarioTable.nome, slug: listaItensUsuarioTable.slug })
    .from(listaItensUsuarioTable)
    .where(and(eq(listaItensUsuarioTable.usuarioId, userId), eq(listaItensUsuarioTable.ativo, true)));

  if (listItems.length === 0) return null;

  // 2. Fetch active offers (not expired)
  const now = new Date();
  const offers = await db
    .select({
      id: ofertasTable.id,
      produto: ofertasTable.produto,
      produtoNormalizado: ofertasTable.produtoNormalizado,
      preco: ofertasTable.preco,
      precoNormal: ofertasTable.precoNormal,
      mercado: ofertasTable.mercado,
      mercadoNormalizado: ofertasTable.mercadoNormalizado,
      produtoId: ofertasTable.produtoId,
    })
    .from(ofertasTable)
    .where(
      and(
        inArray(ofertasTable.status, VALID_STATUSES as unknown as string[]),
        or(isNull(ofertasTable.validade), gt(ofertasTable.validade, now)),
        isNull(ofertasTable.statusUsuario),
      ),
    )
    .limit(2000);

  if (offers.length === 0) return null;

  // 3. Build per-product average price map (from live offers)
  const avgMap = new Map<string, { sum: number; count: number }>();
  for (const o of offers) {
    const key = normalizeProductForAnalytics(o.produtoNormalizado ?? o.produto);
    if (!key) continue;
    const cur = avgMap.get(key) ?? { sum: 0, count: 0 };
    avgMap.set(key, { sum: cur.sum + o.preco, count: cur.count + 1 });
  }

  // 4. Fetch aliases for catalog products referenced by offers
  const catalogIds = [...new Set(offers.filter(o => o.produtoId).map(o => o.produtoId as string))];
  const aliasMap = new Map<string, string[]>();
  if (catalogIds.length > 0) {
    const prods = await db
      .select({ id: produtosTable.id, aliases: produtosTable.aliases })
      .from(produtosTable)
      .where(inArray(produtosTable.id, catalogIds));
    for (const p of prods) {
      aliasMap.set(p.id, p.aliases ?? []);
    }
  }

  // 5. Match each list item to the best offer per market
  // itemKey → mercado → best offer
  const itemResults: ItemAnalysis[] = [];
  const mercadoMap = new Map<string, MercadoScore>();

  for (const item of listItems) {
    const itemNorm = normalizeProductForAnalytics(item.nome);
    const avgEntry = avgMap.get(itemNorm);
    const precoMedio = avgEntry ? avgEntry.sum / avgEntry.count : null;

    let bestScore = 0;
    let bestOffer: typeof offers[0] | null = null;
    // Track best offer per market for this item
    const bestPerMercado = new Map<string, { offer: typeof offers[0]; score: number }>();

    for (const o of offers) {
      const offerNorm = normalizeProductForAnalytics(o.produtoNormalizado ?? o.produto);
      const aliases = o.produtoId ? (aliasMap.get(o.produtoId) ?? []) : [];
      const score = matchScore(itemNorm, offerNorm, aliases);
      if (score < 80) continue;

      const mercado = o.mercadoNormalizado ?? o.mercado;
      const existing = bestPerMercado.get(mercado);
      if (!existing || score > existing.score || (score === existing.score && o.preco < existing.offer.preco)) {
        bestPerMercado.set(mercado, { offer: o, score });
      }
      if (score > bestScore || (score === bestScore && bestOffer && o.preco < bestOffer.preco)) {
        bestScore = score;
        bestOffer = o;
      }
    }

    const found = bestScore >= 80 && bestOffer != null;
    const economia = found
      ? calcEconomy(bestOffer!.preco, bestOffer!.precoNormal, precoMedio)
      : null;

    itemResults.push({
      nome: item.nome,
      slug: item.slug,
      precoMedio,
      melhorPreco:        found ? bestOffer!.preco : null,
      melhorMercado:      found ? (bestOffer!.mercadoNormalizado ?? bestOffer!.mercado) : null,
      economiaAbsoluta:   economia,
      economiaPercentual: economia && precoMedio ? Math.round((economia / precoMedio) * 100) : null,
      matchScore:         bestScore,
      ofertaId:           found ? bestOffer!.id : null,
      encontrado:         found,
    });

    // Populate mercado map with this item's best offer per market
    for (const [mercado, { offer }] of bestPerMercado) {
      if (!mercadoMap.has(mercado)) {
        mercadoMap.set(mercado, {
          mercado,
          itensEncontrados: 0,
          totalPreco: 0,
          economia: 0,
          coberturaPercent: 0,
          itens: [],
        });
      }
      const ms = mercadoMap.get(mercado)!;
      const refPrice = offer.precoNormal ?? precoMedio;
      const ec = refPrice && refPrice > offer.preco ? refPrice - offer.preco : 0;
      ms.itensEncontrados++;
      ms.totalPreco += offer.preco;
      ms.economia += ec;
      ms.itens.push({ nome: item.nome, preco: offer.preco, ofertaId: offer.id, precoMedio });
    }
  }

  // 6. Compute coverage percent for each market
  const itensTotais = listItems.length;
  for (const ms of mercadoMap.values()) {
    ms.coberturaPercent = Math.round((ms.itensEncontrados / itensTotais) * 100);
  }

  // 7. Rank markets: coverage first, then total economy, then lowest total price
  const rankedMercados = [...mercadoMap.values()].sort((a, b) => {
    if (b.itensEncontrados !== a.itensEncontrados) return b.itensEncontrados - a.itensEncontrados;
    if (b.economia !== a.economia) return b.economia - a.economia;
    return a.totalPreco - b.totalPreco;
  });

  const best = rankedMercados[0] ?? null;
  const itensEncontrados = itemResults.filter(i => i.encontrado).length;
  const itensFaltando = itemResults.filter(i => !i.encontrado).map(i => i.nome);

  // 8. Calculate total economy from the best market
  const economiaTotal = best?.economia ?? 0;
  // Reference total = what you'd pay at "normal" prices (best market total + its savings).
  // Falls back to per-item precoMedio sum when precoNormal is absent.
  const precoMedioTotal = itemResults.reduce((s, i) => s + (i.precoMedio ?? 0), 0);
  const refTotal = best && best.economia > 0
    ? best.totalPreco + best.economia
    : precoMedioTotal;
  const percentualEconomia = refTotal > 0
    ? Math.round((economiaTotal / refTotal) * 100)
    : 0;

  // 9. Score for the analysis (0–100): coverage × economy weight
  const coverageScore = itensTotais > 0 ? (itensEncontrados / itensTotais) * 60 : 0;
  const economyScore  = percentualEconomia >= 25 ? 40 : (percentualEconomia / 25) * 40;
  const analysisScore = Math.round(coverageScore + economyScore);

  // 10. Human-readable recommendation
  const { recomendacao, motivosRecomendacao } = buildRecomendacao(
    best, itensEncontrados, itensTotais, economiaTotal, percentualEconomia,
  );

  const result: ListAnalysis = {
    mercadoIdeal:       best?.mercado ?? null,
    economiaTotal:      Math.round(economiaTotal * 100) / 100,
    percentualEconomia,
    itensEncontrados,
    itensTotais,
    itensFaltando,
    score:              analysisScore,
    recomendacao,
    motivosRecomendacao,
    itensDetalhes:      itemResults,
    mercados:           rankedMercados,
    analisadoEm:        new Date().toISOString(),
  };

  logger.info({
    userId,
    ms:              Date.now() - t0,
    itensEncontrados,
    itensTotais,
    economiaTotal:   result.economiaTotal,
    percentual:      percentualEconomia,
    mercadoIdeal:    result.mercadoIdeal,
    score:           analysisScore,
  }, "[shopping-analyzer] analysis complete");

  return result;
}

// ── Recommendation text ───────────────────────────────────────────────────────

function buildRecomendacao(
  best: MercadoScore | null,
  itensEncontrados: number,
  itensTotais: number,
  economiaTotal: number,
  percentualEconomia: number,
): { recomendacao: string; motivosRecomendacao: string[] } {
  const fmt = (n: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

  if (!best || itensEncontrados === 0) {
    return {
      recomendacao: "Nenhuma promoção relevante hoje.",
      motivosRecomendacao: ["Adicione itens à sua lista para receber alertas personalizados."],
    };
  }

  if (percentualEconomia < 5 && economiaTotal < 10) {
    return {
      recomendacao: "Hoje vale esperar.",
      motivosRecomendacao: [
        "Os preços atuais estão próximos da média.",
        `${itensEncontrados} de ${itensTotais} ${itensTotais === 1 ? "produto encontrado" : "produtos encontrados"}.`,
      ],
    };
  }

  const recomendacao = `Hoje vale comprar no ${best.mercado}.`;
  const motivos: string[] = [];

  motivos.push(`${itensEncontrados} ${itensEncontrados === 1 ? "produto encontrado" : "produtos encontrados"} em oferta.`);

  if (economiaTotal >= 1) {
    motivos.push(`Você economiza ${fmt(economiaTotal)}.`);
  }

  if (percentualEconomia >= 10) {
    motivos.push(`${percentualEconomia}% abaixo da média geral.`);
  }

  motivos.push(`O melhor mercado é o ${best.mercado}.`);

  return { recomendacao, motivosRecomendacao: motivos };
}

// ── Persist + smart alert ─────────────────────────────────────────────────────

const MIN_ECONOMIA_REAIS = 20;
const MIN_ECONOMIA_PERCENT = 15;

/**
 * Persist analysis result and generate a push alert when thresholds are met.
 * Only one alert per user per calendar day (guards via shoppingAnalysisHistoryTable).
 */
export async function persistAndAlert(userId: number, analysis: ListAnalysis): Promise<void> {
  // Persist to history
  try {
    await db.insert(shoppingAnalysisHistoryTable).values({
      userId,
      mercadoIdeal:       analysis.mercadoIdeal,
      economiaTotal:      analysis.economiaTotal,
      percentualEconomia: analysis.percentualEconomia,
      itensEncontrados:   analysis.itensEncontrados,
      itensTotais:        analysis.itensTotais,
      score:              analysis.score,
      analiseJson:        analysis as unknown as Record<string, unknown>,
      pushSent:           false,
    });
  } catch (err) {
    logger.error({ err, userId }, "[shopping-analyzer] failed to persist analysis");
    return;
  }

  // Check thresholds
  const shouldAlert =
    analysis.economiaTotal >= MIN_ECONOMIA_REAIS ||
    analysis.percentualEconomia >= MIN_ECONOMIA_PERCENT;

  if (!shouldAlert || !analysis.mercadoIdeal) return;

  // Guard: one alert per user per 12 h
  const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
  const [recentRow] = await db
    .select({ id: shoppingAnalysisHistoryTable.id })
    .from(shoppingAnalysisHistoryTable)
    .where(
      and(
        eq(shoppingAnalysisHistoryTable.userId, userId),
        eq(shoppingAnalysisHistoryTable.pushSent, true),
        gt(shoppingAnalysisHistoryTable.createdAt, twelveHoursAgo),
      ),
    )
    .limit(1);

  if (recentRow) return; // already alerted this user recently

  const fmt = (n: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

  const titulo = `Sua lista pode economizar ${fmt(analysis.economiaTotal)} hoje.`;
  const mensagem = analysis.itensEncontrados === 1
    ? `1 produto está em promoção no ${analysis.mercadoIdeal}.`
    : `${analysis.itensEncontrados} produtos estão em promoção no ${analysis.mercadoIdeal}.`;

  try {
    await createNotification({
      userId,
      tipo: NOTIF.LISTA_OFERTA,
      titulo,
      mensagem,
      acaoTipo: "analise",
      acaoId: String(userId),
      metadata: {
        mercadoIdeal: analysis.mercadoIdeal,
        economiaTotal: analysis.economiaTotal,
        percentual: analysis.percentualEconomia,
        itensEncontrados: analysis.itensEncontrados,
        sprint: 13,
      },
    });

    logger.info({
      userId,
      mercadoIdeal:    analysis.mercadoIdeal,
      economiaTotal:   analysis.economiaTotal,
      percentual:      analysis.percentualEconomia,
      itensEncontrados: analysis.itensEncontrados,
    }, "[shopping-analyzer] smart alert sent");

    // Mark push sent
    await db
      .update(shoppingAnalysisHistoryTable)
      .set({ pushSent: true })
      .where(
        and(
          eq(shoppingAnalysisHistoryTable.userId, userId),
          eq(shoppingAnalysisHistoryTable.pushSent, false),
          gt(shoppingAnalysisHistoryTable.createdAt, twelveHoursAgo),
        ),
      );
  } catch (err) {
    logger.error({ err, userId }, "[shopping-analyzer] failed to send alert");
  }
}

// ── Scheduler entry point ─────────────────────────────────────────────────────

/**
 * Analyse lists for all users who have at least one active list item.
 * Called by the scheduler at 08h, 12h, 18h BRT.
 */
export async function runShoppingAnalysisForAll(): Promise<void> {
  try {
    // Find distinct user IDs who have active list items
    const rows = await db
      .selectDistinct({ userId: listaItensUsuarioTable.usuarioId })
      .from(listaItensUsuarioTable)
      .where(eq(listaItensUsuarioTable.ativo, true));

    const userIds = rows.map(r => r.userId);
    if (userIds.length === 0) return;

    logger.info({ count: userIds.length }, "[shopping-analyzer] running analysis for active users");

    let analysed = 0;
    let alerted  = 0;

    for (const userId of userIds) {
      try {
        const analysis = await analyzeListForUser(userId);
        if (!analysis) continue;
        await persistAndAlert(userId, analysis);
        analysed++;
        if (analysis.economiaTotal >= MIN_ECONOMIA_REAIS || analysis.percentualEconomia >= MIN_ECONOMIA_PERCENT) {
          alerted++;
        }
      } catch (err) {
        logger.error({ err, userId }, "[shopping-analyzer] user analysis failed");
      }
    }

    logger.info({ analysed, alerted }, "[shopping-analyzer] batch complete");
  } catch (err) {
    logger.error({ err }, "[shopping-analyzer] runShoppingAnalysisForAll failed");
  }
}

/**
 * Targeted analysis: called when a new offer is published.
 * Only analyses users whose list contains a product that matches the offer.
 */
export async function analyzeAffectedUsers(ofertaProduto: string): Promise<void> {
  try {
    const offerNorm = normalizeProductForAnalytics(ofertaProduto);
    if (!offerNorm) return;

    // Find list items that might match this offer
    const allItems = await db
      .select({
        userId: listaItensUsuarioTable.usuarioId,
        slug:   listaItensUsuarioTable.slug,
      })
      .from(listaItensUsuarioTable)
      .where(eq(listaItensUsuarioTable.ativo, true));

    const affectedUserIds = [
      ...new Set(
        allItems
          .filter(item => {
            const itemNorm = normalizeProductForAnalytics(item.slug);
            return matchScore(itemNorm, offerNorm) >= 80;
          })
          .map(item => item.userId),
      ),
    ];

    if (affectedUserIds.length === 0) return;

    logger.info(
      { count: affectedUserIds.length, produto: ofertaProduto },
      "[shopping-analyzer] analysing affected users for new offer",
    );

    for (const userId of affectedUserIds) {
      try {
        const analysis = await analyzeListForUser(userId);
        if (analysis) await persistAndAlert(userId, analysis);
      } catch (err) {
        logger.error({ err, userId }, "[shopping-analyzer] affected user analysis failed");
      }
    }
  } catch (err) {
    logger.error({ err }, "[shopping-analyzer] analyzeAffectedUsers failed");
  }
}
