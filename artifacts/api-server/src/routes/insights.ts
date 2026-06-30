// @ts-nocheck
/**
 * Insights routes — radar, heatmap, regional trends.
 * All read-only. No auth required (public data aggregation).
 */
import { Router } from "express";
import { db, ofertasTable, usuariosTable } from "@workspace/db";
import { and, eq, sql, isNull, gt, or } from "drizzle-orm";

const router = Router();

// ── GET /api/insights/radar ───────────────────────────────────────────────────
// Active markets near a location + hourly activity + estimated savings.
router.get("/insights/radar", async (req, res) => {
  const lat = req.query["lat"] ? Number(req.query["lat"]) : null;
  const lng = req.query["lng"] ? Number(req.query["lng"]) : null;
  const raio = req.query["raio"] ? Number(req.query["raio"]) : 10;

  const seisHorasAtras = new Date(Date.now() - 6 * 3_600_000);
  const vintequatroHorasAtras = new Date(Date.now() - 24 * 3_600_000);
  const seteDiasAtras = new Date(Date.now() - 7 * 24 * 3_600_000);

  const activeConditions = [
    sql`${ofertasTable.status} NOT IN ('expirada', 'suspeita')`,
    or(isNull(ofertasTable.validade), gt(ofertasTable.validade, new Date())),
    sql`${ofertasTable.denuncias} < 5`,
    eq(usuariosTable.bloqueado, false),
  ];

  // Active markets aggregation
  const mercadosRows = await db
    .select({
      mercado: ofertasTable.mercado,
      bairro: ofertasTable.bairro,
      cidade: ofertasTable.cidade,
      latitude: sql<number>`AVG(${ofertasTable.latitude})`,
      longitude: sql<number>`AVG(${ofertasTable.longitude})`,
      totalOfertas: sql<number>`count(*)::int`,
      ofertasRecentes: sql<number>`count(*) filter (where ${ofertasTable.dataCriacao} >= ${seisHorasAtras})::int`,
      totalValidacoes: sql<number>`coalesce(sum(${ofertasTable.validacoes}), 0)::int`,
      totalConfirmacoes: sql<number>`coalesce(sum(${ofertasTable.confirmacoes}), 0)::int`,
      menorPreco: sql<number>`min(${ofertasTable.preco})`,
    })
    .from(ofertasTable)
    .innerJoin(usuariosTable, eq(ofertasTable.usuarioId, usuariosTable.id))
    .where(and(...activeConditions))
    .groupBy(sql`coalesce(${ofertasTable.mercadoNormalizado}, ${ofertasTable.mercado})`, ofertasTable.bairro, ofertasTable.cidade)
    .orderBy(sql`count(*) desc`)
    .limit(20);

  // Filter by radius if coords provided
  const mercados = mercadosRows
    .filter((m) => {
      if (lat == null || lng == null || m.latitude == null || m.longitude == null) return true;
      const d = haversineKm(lat, lng, m.latitude, m.longitude);
      return d <= raio;
    })
    .map((m) => ({
      ...m,
      distancia:
        lat != null && lng != null && m.latitude != null && m.longitude != null
          ? Math.round(haversineKm(lat, lng, m.latitude, m.longitude) * 10) / 10
          : null,
      atividade: m.ofertasRecentes > 0 ? "Muito ativo" : m.totalOfertas > 3 ? "Ativo" : "Tranquilo",
    }))
    .sort((a, b) => (a.distancia ?? 999) - (b.distancia ?? 999));

  // Hourly activity pattern (last 7 days)
  const hourlyRows = await db
    .select({
      hora: sql<number>`EXTRACT(HOUR FROM ${ofertasTable.dataCriacao})::int`,
      total: sql<number>`count(*)::int`,
    })
    .from(ofertasTable)
    .where(sql`${ofertasTable.dataCriacao} >= ${seteDiasAtras}`)
    .groupBy(sql`EXTRACT(HOUR FROM ${ofertasTable.dataCriacao})`)
    .orderBy(sql`EXTRACT(HOUR FROM ${ofertasTable.dataCriacao})`);

  // Estimated savings today
  const [savingsRow] = await db
    .select({
      totalOfertas: sql<number>`count(*)::int`,
      ofertasHoje: sql<number>`count(*) filter (where ${ofertasTable.dataCriacao} >= ${vintequatroHorasAtras})::int`,
      confirmadosHoje: sql<number>`count(*) filter (where ${ofertasTable.ultimaConfirmacaoEm} >= ${vintequatroHorasAtras})::int`,
      menorPreco: sql<number>`min(${ofertasTable.preco})`,
    })
    .from(ofertasTable)
    .innerJoin(usuariosTable, eq(ofertasTable.usuarioId, usuariosTable.id))
    .where(and(...activeConditions));

  res.json({
    mercados,
    atividadeHoraria: hourlyRows,
    resumo: {
      totalOfertas: savingsRow?.totalOfertas ?? 0,
      ofertasUltimas24h: savingsRow?.ofertasHoje ?? 0,
      confirmadosHoje: savingsRow?.confirmadosHoje ?? 0,
      menorPreco: savingsRow?.menorPreco ?? null,
    },
  });
});

// ── GET /api/insights/heatmap ─────────────────────────────────────────────────
// Returns lat/lng clusters for heatmap rendering.
router.get("/insights/heatmap", async (_req, res) => {
  const rows = await db
    .select({
      latitude: ofertasTable.latitude,
      longitude: ofertasTable.longitude,
      score: ofertasTable.scoreCache,
      confirmacoes: ofertasTable.confirmacoes,
      validacoes: ofertasTable.validacoes,
    })
    .from(ofertasTable)
    .innerJoin(usuariosTable, eq(ofertasTable.usuarioId, usuariosTable.id))
    .where(
      and(
        sql`${ofertasTable.status} NOT IN ('expirada', 'suspeita')`,
        or(isNull(ofertasTable.validade), gt(ofertasTable.validade, new Date())),
        sql`${ofertasTable.latitude} IS NOT NULL`,
        sql`${ofertasTable.longitude} IS NOT NULL`,
        eq(usuariosTable.bloqueado, false),
      ),
    )
    .limit(500);

  const points = rows.map((r) => ({
    lat: r.latitude!,
    lng: r.longitude!,
    // Weight = engagement (for heatmap intensity)
    weight: Math.min(10, 1 + r.confirmacoes + r.validacoes * 0.5),
  }));

  res.json(points);
});

// ── GET /api/insights/regional ────────────────────────────────────────────────
// Regional trends: price changes, cheapest markets per bairro, trending products.
router.get("/insights/regional", async (req, res) => {
  const cidade = typeof req.query["cidade"] === "string" ? req.query["cidade"] : null;
  const seteDiasAtras = new Date(Date.now() - 7 * 24 * 3_600_000);
  const quatorzeDiasAtras = new Date(Date.now() - 14 * 24 * 3_600_000);

  const baseWhere = cidade
    ? sql`lower(${ofertasTable.cidade}) = lower(${cidade})`
    : sql`1=1`;

  // Avg price this week vs last week per category (price trend)
  const trendRows = await db
    .select({
      categoria: ofertasTable.categoria,
      avgEstaSmana: sql<number>`AVG(${ofertasTable.preco}) filter (where ${ofertasTable.dataCriacao} >= ${seteDiasAtras})`,
      avgSemanaPassada: sql<number>`AVG(${ofertasTable.preco}) filter (where ${ofertasTable.dataCriacao} >= ${quatorzeDiasAtras} AND ${ofertasTable.dataCriacao} < ${seteDiasAtras})`,
      totalOfertas: sql<number>`count(*)::int`,
    })
    .from(ofertasTable)
    .where(and(baseWhere, sql`${ofertasTable.dataCriacao} >= ${quatorzeDiasAtras}`))
    .groupBy(ofertasTable.categoria)
    .orderBy(sql`count(*) desc`)
    .limit(10);

  const tendencias = trendRows
    .filter((r) => r.avgEstaSmana != null && r.avgSemanaPassada != null)
    .map((r) => {
      const delta = ((r.avgEstaSmana - r.avgSemanaPassada) / r.avgSemanaPassada) * 100;
      return {
        categoria: r.categoria,
        avgEstaSmana: Math.round(r.avgEstaSmana * 100) / 100,
        avgSemanaPassada: Math.round(r.avgSemanaPassada * 100) / 100,
        variacao: Math.round(delta * 10) / 10,
        tendencia: delta <= -5 ? "caiu" : delta >= 5 ? "subiu" : "estavel",
      };
    });

  // Cheapest markets by bairro
  const mercadosBairro = await db
    .select({
      bairro: ofertasTable.bairro,
      mercado: ofertasTable.mercado,
      avgPreco: sql<number>`AVG(${ofertasTable.preco})`,
      totalOfertas: sql<number>`count(*)::int`,
      totalValidacoes: sql<number>`coalesce(sum(${ofertasTable.validacoes}), 0)::int`,
    })
    .from(ofertasTable)
    .where(
      and(
        baseWhere,
        sql`${ofertasTable.status} NOT IN ('expirada', 'suspeita')`,
        sql`${ofertasTable.bairro} IS NOT NULL`,
      ),
    )
    .groupBy(ofertasTable.bairro, ofertasTable.mercado)
    .orderBy(sql`AVG(${ofertasTable.preco}) asc`)
    .limit(20);

  // Top trending products (most confirmations last 48h)
  const quarentaOitoHorasAtras = new Date(Date.now() - 48 * 3_600_000);
  const produtosTrend = await db
    .select({
      produto: ofertasTable.produtoNormalizado,
      totalConfirmacoes: sql<number>`sum(${ofertasTable.confirmacoes})::int`,
      totalValidacoes: sql<number>`sum(${ofertasTable.validacoes})::int`,
      menorPreco: sql<number>`min(${ofertasTable.preco})`,
      ofertasCount: sql<number>`count(*)::int`,
    })
    .from(ofertasTable)
    .where(
      and(
        sql`${ofertasTable.dataCriacao} >= ${quarentaOitoHorasAtras}`,
        sql`${ofertasTable.status} NOT IN ('expirada', 'suspeita')`,
        sql`${ofertasTable.produtoNormalizado} IS NOT NULL`,
      ),
    )
    .groupBy(ofertasTable.produtoNormalizado)
    .orderBy(sql`sum(${ofertasTable.confirmacoes}) + sum(${ofertasTable.validacoes}) desc`)
    .limit(10);

  res.json({
    tendencias,
    mercadosPorBairro: mercadosBairro.map((m) => ({
      ...m,
      avgPreco: Math.round((m.avgPreco ?? 0) * 100) / 100,
    })),
    produtosTrend: produtosTrend.filter((p) => p.produto != null),
  });
});

// ── GET /api/produtos/populares ───────────────────────────────────────────────
// Returns the top product terms by number of active offers.
// Used by the frontend to populate "Você quis dizer?" suggestions on empty search.
router.get("/produtos/populares", async (_req, res) => {
  try {
    const rows = await db
      .select({
        produto: ofertasTable.produtoNormalizado,
        total: sql<number>`count(*)::int`,
      })
      .from(ofertasTable)
      .where(
        and(
          sql`${ofertasTable.status} NOT IN ('expirada', 'removida', 'recusada', 'pendente_validacao')`,
          sql`${ofertasTable.produtoNormalizado} IS NOT NULL`,
          sql`char_length(${ofertasTable.produtoNormalizado}) >= 3`,
        ),
      )
      .groupBy(ofertasTable.produtoNormalizado)
      .orderBy(sql`count(*) desc`)
      .limit(16);

    // Capitalize each word for display
    const termos = rows
      .map((r) => r.produto)
      .filter((t): t is string => Boolean(t))
      .map((t) =>
        t
          .split(" ")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" "),
      )
      .slice(0, 10);

    res.json({ termos });
  } catch {
    res.json({ termos: [] });
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default router;
