// @ts-nocheck
/**
 * Sprint 14 — AI Shopping Brain
 *
 * PriceTrendAnalyzer: computes price statistics and trends for a given product
 * from the last 90 days of offers.
 */

import { db, ofertasTable } from "@workspace/db";
import { and, sql, isNull, gt, or } from "drizzle-orm";
import { normalizeProductForAnalytics } from "./normaliza";
import { logger } from "./logger";

export interface PriceTrend {
  produto:         string;
  precoAtual:      number | null;
  precoMedio:      number | null;
  precoMin:        number | null;
  precoMax:        number | null;
  tendencia:       "caindo" | "subindo" | "estavel" | "insuficiente";
  variacao:        number | null;   // % vs 30-day avg
  confianca:       "alta" | "media" | "baixa";
  melhorDia:       number | null;   // 0=Sun…6=Sat
  melhorHorario:   number | null;   // hour 0–23
  totalOfertas:    number;
  historico:       { data: string; precoMedio: number }[];  // last 12 weeks
}

// ── Core ──────────────────────────────────────────────────────────────────────

export async function getTrend(produto: string): Promise<PriceTrend> {
  const t0 = Date.now();
  const produtoNorm = normalizeProductForAnalytics(produto);
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const now = new Date();

  const rows = await db
    .select({
      preco:      ofertasTable.preco,
      dataCriacao: ofertasTable.dataCriacao,
      dia:        sql<number>`EXTRACT(DOW FROM ${ofertasTable.dataCriacao})::int`,
      hora:       sql<number>`EXTRACT(HOUR FROM ${ofertasTable.dataCriacao})::int`,
    })
    .from(ofertasTable)
    .where(
      and(
        sql`(
          lower(${ofertasTable.produtoNormalizado}) LIKE ${'%' + produtoNorm + '%'}
          OR lower(${ofertasTable.produto}) LIKE ${'%' + produtoNorm + '%'}
        )`,
        sql`${ofertasTable.status} NOT IN ('expirada', 'suspeita', 'recusada', 'removida')`,
        or(isNull(ofertasTable.validade), gt(ofertasTable.validade, now)),
        gt(ofertasTable.dataCriacao, ninetyDaysAgo),
      ),
    )
    .limit(500);

  if (rows.length < 2) {
    return {
      produto,
      precoAtual:    null,
      precoMedio:    null,
      precoMin:      null,
      precoMax:      null,
      tendencia:     "insuficiente",
      variacao:      null,
      confianca:     "baixa",
      melhorDia:     null,
      melhorHorario: null,
      totalOfertas:  rows.length,
      historico:     [],
    };
  }

  const precos = rows.map(r => r.preco);
  const precoMedio = precos.reduce((s, v) => s + v, 0) / precos.length;
  const precoMin = Math.min(...precos);
  const precoMax = Math.max(...precos);

  // Recent avg (last 30 days) vs older avg
  const recent = rows.filter(r => r.dataCriacao >= thirtyDaysAgo).map(r => r.preco);
  const older  = rows.filter(r => r.dataCriacao < thirtyDaysAgo).map(r => r.preco);

  let tendencia: PriceTrend["tendencia"] = "estavel";
  let variacao: number | null = null;

  if (recent.length >= 2 && older.length >= 2) {
    const avgRecent = recent.reduce((s, v) => s + v, 0) / recent.length;
    const avgOlder  = older.reduce((s, v) => s + v, 0) / older.length;
    variacao = Math.round(((avgRecent - avgOlder) / avgOlder) * 100 * 10) / 10;
    tendencia = variacao <= -5 ? "caindo" : variacao >= 5 ? "subindo" : "estavel";
  }

  // Best day of week (lowest avg price)
  const dayBuckets = new Array(7).fill(null).map(() => ({ sum: 0, count: 0 }));
  const hourBuckets = new Array(24).fill(null).map(() => ({ sum: 0, count: 0 }));
  for (const r of rows) {
    dayBuckets[r.dia].sum += r.preco;
    dayBuckets[r.dia].count++;
    hourBuckets[r.hora].sum += r.preco;
    hourBuckets[r.hora].count++;
  }

  const dayAvgs = dayBuckets.map((b, i) => ({ dia: i, avg: b.count >= 2 ? b.sum / b.count : null }));
  const hourAvgs = hourBuckets.map((b, i) => ({ hora: i, avg: b.count >= 2 ? b.sum / b.count : null }));

  const melhorDia   = dayAvgs.filter(d => d.avg !== null).sort((a, b) => a.avg! - b.avg!)[0]?.dia ?? null;
  const melhorHorario = hourAvgs.filter(h => h.avg !== null).sort((a, b) => a.avg! - b.avg!)[0]?.hora ?? null;

  // Weekly price history (last 12 weeks)
  const weekMap = new Map<string, { sum: number; count: number }>();
  for (const r of rows) {
    const d = new Date(r.dataCriacao);
    // Round down to Monday
    const day = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((day + 6) % 7));
    const key = monday.toISOString().slice(0, 10);
    const cur = weekMap.get(key) ?? { sum: 0, count: 0 };
    weekMap.set(key, { sum: cur.sum + r.preco, count: cur.count + 1 });
  }

  const historico = [...weekMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([data, { sum, count }]) => ({
      data,
      precoMedio: Math.round((sum / count) * 100) / 100,
    }));

  const confianca: PriceTrend["confianca"] =
    rows.length >= 20 ? "alta" : rows.length >= 8 ? "media" : "baixa";

  // Current price = most recent offer
  const sorted = [...rows].sort((a, b) => b.dataCriacao.getTime() - a.dataCriacao.getTime());
  const precoAtual = sorted[0]?.preco ?? null;

  logger.info({ produto, totalOfertas: rows.length, ms: Date.now() - t0 }, "[AI] trend computed");

  return {
    produto,
    precoAtual,
    precoMedio:   Math.round(precoMedio * 100) / 100,
    precoMin,
    precoMax,
    tendencia,
    variacao,
    confianca,
    melhorDia,
    melhorHorario,
    totalOfertas:  rows.length,
    historico,
  };
}
