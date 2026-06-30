// @ts-nocheck
import { Router } from "express";
import { db, followsTable, ofertasTable, usuariosTable, produtosTable, produtoImagensTable } from "@workspace/db";
import { and, eq, or, isNull, gt, sql, desc, inArray } from "drizzle-orm";
import { calcularInteligenciaPrecosBatch } from "../lib/produto-preco";
import { requireAuth } from "../middleware/auth";
import { encodeCursor, decodeCursor } from "../lib/cursor";

const router = Router();

// ── Shared SELECT columns for feed queries ─────────────────────────────────────
const FEED_SELECT = {
  id: ofertasTable.id,
  produto: ofertasTable.produto,
  categoria: ofertasTable.categoria,
  marca: ofertasTable.marca,
  preco: ofertasTable.preco,
  mercado: ofertasTable.mercado,
  bairro: ofertasTable.bairro,
  cidade: ofertasTable.cidade,
  fotoUrl: ofertasTable.fotoUrl,
  validade: ofertasTable.validade,
  latitude: ofertasTable.latitude,
  longitude: ofertasTable.longitude,
  dataCriacao: ofertasTable.dataCriacao,
  ultimaValidacaoEm: ofertasTable.ultimaValidacaoEm,
  ultimaConfirmacaoEm: ofertasTable.ultimaConfirmacaoEm,
  curtidas: ofertasTable.curtidas,
  validacoes: ofertasTable.validacoes,
  denuncias: ofertasTable.denuncias,
  confirmacoes: ofertasTable.confirmacoes,
  status: ofertasTable.status,
  usuarioId: ofertasTable.usuarioId,
  destacada: ofertasTable.destacada,
  patrocinada: ofertasTable.patrocinada,
  scoreCache: ofertasTable.scoreCache,
  produtoId: ofertasTable.produtoId,
  produtoNormalizado: ofertasTable.produtoNormalizado,
  nome: usuariosTable.nome,
  pontos: usuariosTable.pontos,
} as const;

async function enrichWithCatalog(rows: { id?: number; produtoId?: string | null; produtoNormalizado?: string | null; fotoUrl?: string | null; preco?: number }[]) {
  const produtoIds = [...new Set(rows.map((r) => r.produtoId).filter((id): id is string => id != null))];
  const nomes = [...new Set(rows.map((r) => r.produtoNormalizado).filter((n): n is string => n != null))];

  const [catalogs, imgs, precoMap] = await Promise.all([
    produtoIds.length > 0
      ? db.select({ id: produtosTable.id, nome: produtosTable.nome, marca: produtosTable.marca, categoria: produtosTable.categoria, imagemPremiumUrl: produtosTable.imagemPremiumUrl, statusImagem: produtosTable.statusImagem })
          .from(produtosTable).where(inArray(produtosTable.id, produtoIds))
      : Promise.resolve([]),
    nomes.length > 0
      ? db.select({ produtoNormalizado: produtoImagensTable.produtoNormalizado, imagemUrl: produtoImagensTable.imagemUrl })
          .from(produtoImagensTable).where(and(inArray(produtoImagensTable.produtoNormalizado, nomes), eq(produtoImagensTable.aprovada, true)))
      : Promise.resolve([]),
    calcularInteligenciaPrecosBatch(
      rows
        .filter((r) => r.id != null && r.preco != null)
        .map((r) => ({ id: r.id as number, produtoId: r.produtoId ?? null, preco: r.preco as number }))
    ),
  ]);

  const catalogMap = new Map(catalogs.map((c) => [c.id, { id: c.id, nome: c.nome, marca: c.marca ?? null, categoria: c.categoria ?? null, imagemPremiumUrl: c.imagemPremiumUrl ?? null, statusImagem: c.statusImagem }]));
  const imgMap = new Map(imgs.map((i) => [i.produtoNormalizado, i.imagemUrl]));

  return rows.map((r) => {
    const produtoCatalogo = r.produtoId ? (catalogMap.get(r.produtoId) ?? null) : null;
    const produtoImagemUrl = r.produtoNormalizado ? (imgMap.get(r.produtoNormalizado) ?? null) : null;
    const imagemExibicao = produtoImagemUrl ?? r.fotoUrl ?? null;
    const inteligenciaPreco = r.id != null ? (precoMap.get(r.id) ?? null) : null;
    return { ...r, imagemExibicao, produtoCatalogo, inteligenciaPreco };
  });
}

// ── POST /api/follows/usuario/:id — follow a user ─────────────────────────────
router.post("/follows/usuario/:id", requireAuth, async (req, res) => {
  const followerId = req.session.userId!;
  const followingId = Number(req.params.id);

  if (!Number.isInteger(followingId) || followingId <= 0) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }
  if (followingId === followerId) {
    res.status(400).json({ error: "Você não pode seguir a si mesmo." });
    return;
  }

  const [target] = await db
    .select({ id: usuariosTable.id })
    .from(usuariosTable)
    .where(eq(usuariosTable.id, followingId))
    .limit(1);

  if (!target) {
    res.status(404).json({ error: "Usuário não encontrado." });
    return;
  }

  await db
    .insert(followsTable)
    .values({ followerId, followingUserId: followingId })
    .onConflictDoNothing();

  res.json({ ok: true });
});

// ── DELETE /api/follows/usuario/:id — unfollow a user ─────────────────────────
router.delete("/follows/usuario/:id", requireAuth, async (req, res) => {
  const followerId = req.session.userId!;
  const followingId = Number(req.params.id);

  if (!Number.isInteger(followingId) || followingId <= 0) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }

  await db
    .delete(followsTable)
    .where(
      and(
        eq(followsTable.followerId, followerId),
        eq(followsTable.followingUserId, followingId),
      ),
    );

  res.json({ ok: true });
});

// ── POST /api/follows/mercado — follow a market ───────────────────────────────
router.post("/follows/mercado", requireAuth, async (req, res) => {
  const followerId = req.session.userId!;
  const { mercado } = req.body as { mercado?: unknown };

  if (!mercado || typeof mercado !== "string" || mercado.trim().length < 2) {
    res.status(400).json({ error: "Nome do mercado obrigatório (mínimo 2 caracteres)." });
    return;
  }

  await db
    .insert(followsTable)
    .values({ followerId, followingMercado: mercado.trim() })
    .onConflictDoNothing();

  res.json({ ok: true });
});

// ── DELETE /api/follows/mercado/:nome — unfollow a market ────────────────────
router.delete("/follows/mercado/:nome", requireAuth, async (req, res) => {
  const followerId = req.session.userId!;
  const mercado = decodeURIComponent(String(req.params["nome"]));

  await db
    .delete(followsTable)
    .where(
      and(
        eq(followsTable.followerId, followerId),
        eq(followsTable.followingMercado, mercado),
      ),
    );

  res.json({ ok: true });
});

// ── GET /api/follows — list what the current user follows ─────────────────────
router.get("/follows", requireAuth, async (req, res) => {
  const followerId = req.session.userId!;

  const rows = await db
    .select()
    .from(followsTable)
    .where(eq(followsTable.followerId, followerId))
    .orderBy(desc(followsTable.createdAt));

  res.json({
    usuarios: rows
      .filter((r) => r.followingUserId != null)
      .map((r) => r.followingUserId!),
    mercados: rows
      .filter((r) => r.followingMercado != null)
      .map((r) => r.followingMercado!),
  });
});

// ── GET /api/feed/seguindo — cursor-paginated feed from followed users/markets ─
router.get("/feed/seguindo", requireAuth, async (req, res) => {
  const followerId = req.session.userId!;
  const limit = Math.min(50, Math.max(1, Number(req.query["limit"]) || 20));
  const cursorStr = typeof req.query["cursor"] === "string" ? req.query["cursor"] : null;

  // Fetch follows list
  const follows = await db
    .select()
    .from(followsTable)
    .where(eq(followsTable.followerId, followerId));

  const followedUserIds = follows
    .filter((f) => f.followingUserId != null)
    .map((f) => f.followingUserId!);
  const followedMercados = follows
    .filter((f) => f.followingMercado != null)
    .map((f) => f.followingMercado!);

  if (followedUserIds.length === 0 && followedMercados.length === 0) {
    res.json({ items: [], nextCursor: null, hasMore: false });
    return;
  }

  // Base filters
  const baseConditions = [
    sql`${ofertasTable.status} NOT IN ('expirada', 'suspeita')`,
    or(isNull(ofertasTable.validade), gt(ofertasTable.validade, new Date())),
    sql`${ofertasTable.denuncias} < 5`,
    eq(usuariosTable.bloqueado, false),
  ];

  // Target filter: user OR market
  const targetParts: ReturnType<typeof sql>[] = [];
  if (followedUserIds.length > 0) {
    const idList = followedUserIds.join(",");
    targetParts.push(sql`${ofertasTable.usuarioId} IN (${sql.raw(idList)})`);
  }
  if (followedMercados.length > 0) {
    const mktList = followedMercados.map((m) => `'${m.replace(/'/g, "''")}'`).join(",");
    targetParts.push(sql`lower(${ofertasTable.mercado}) IN (${sql.raw(followedMercados.map(() => "lower(?)").join(","))})`);
    void mktList; // built differently below
  }

  // Build target condition with safe parameterised approach
  let targetCondition: ReturnType<typeof sql> | undefined;
  if (followedUserIds.length > 0 && followedMercados.length > 0) {
    targetCondition = sql`(${ofertasTable.usuarioId} = ANY(ARRAY[${sql.raw(followedUserIds.join(","))}]::int[]) OR lower(${ofertasTable.mercado}) = ANY(ARRAY[${sql.raw(followedMercados.map((m) => `'${m.replace(/'/g, "''")}'`).join(","))}]::text[]))`;
  } else if (followedUserIds.length > 0) {
    targetCondition = sql`${ofertasTable.usuarioId} = ANY(ARRAY[${sql.raw(followedUserIds.join(","))}]::int[])`;
  } else {
    targetCondition = sql`lower(${ofertasTable.mercado}) = ANY(ARRAY[${sql.raw(followedMercados.map((m) => `'${m.replace(/'/g, "''")}'`).join(","))}]::text[])`;
  }

  const conditions = [...baseConditions, targetCondition];

  // Apply cursor
  if (cursorStr) {
    const decoded = decodeCursor(cursorStr);
    if (decoded) {
      conditions.push(
        sql`(${ofertasTable.scoreCache} < ${decoded.val} OR (${ofertasTable.scoreCache} = ${decoded.val} AND ${ofertasTable.id} < ${decoded.id}))`,
      );
    }
  }

  const rows = await db
    .select(FEED_SELECT)
    .from(ofertasTable)
    .innerJoin(usuariosTable, eq(ofertasTable.usuarioId, usuariosTable.id))
    .where(and(...(conditions as [ReturnType<typeof sql>, ...ReturnType<typeof sql>[]])))
    .orderBy(desc(ofertasTable.scoreCache), desc(ofertasTable.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const trimmed = rows.slice(0, limit);
  let nextCursor: string | null = null;

  if (hasMore && trimmed.length > 0) {
    const last = trimmed[trimmed.length - 1]!;
    nextCursor = encodeCursor(last.scoreCache, last.id);
  }

  const enriched = await enrichWithCatalog(trimmed);
  res.json({ items: enriched, nextCursor, hasMore });
});

export default router;
