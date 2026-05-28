import { Router } from "express";
import { db, usuariosTable, ofertasTable } from "@workspace/db";
import { desc, eq, count, sum, sql } from "drizzle-orm";
import { getNivelUsuario } from "../lib/nivel-usuario";

const router = Router();

// ── Simple in-memory TTL cache ─────────────────────────────────────────────────
interface CacheEntry<T> { data: T; ts: number }
function makeCache<T>(ttlMs: number) {
  let entry: CacheEntry<T> | null = null;
  return {
    get(): T | null {
      if (entry && Date.now() - entry.ts < ttlMs) return entry.data;
      return null;
    },
    set(data: T) { entry = { data, ts: Date.now() }; },
    invalidate() { entry = null; },
  };
}

const rankingCache = makeCache<object[]>(60_000);  // 60 s
const statsCache   = makeCache<object>(30_000);    // 30 s

// ── GET /api/ranking ──────────────────────────────────────────────────────────
router.get("/ranking", async (_req, res) => {
  const cached = rankingCache.get();
  if (cached) { res.json(cached); return; }

  const rows = await db
    .select()
    .from(usuariosTable)
    .orderBy(desc(usuariosTable.pontos));

  const result = rows.map((u) => ({
    id: u.id,
    nome: u.nome,
    pontos: u.pontos,
    nivel: getNivelUsuario(u.pontos),
  }));

  rankingCache.set(result);
  res.json(result);
});

// ── GET /api/stats ────────────────────────────────────────────────────────────
router.get("/stats", async (_req, res) => {
  const cached = statsCache.get();
  if (cached) { res.json(cached); return; }

  const [menorPrecoRow] = await db
    .select({ preco: ofertasTable.preco, produto: ofertasTable.produto })
    .from(ofertasTable)
    .orderBy(ofertasTable.preco)
    .limit(1);

  const [totals] = await db
    .select({ total: count(ofertasTable.id) })
    .from(ofertasTable);

  const [liderRow] = await db
    .select()
    .from(usuariosTable)
    .orderBy(desc(usuariosTable.pontos))
    .limit(1);

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const [confirmadosRow] = await db
    .select({ total: count(ofertasTable.id) })
    .from(ofertasTable)
    .where(sql`${ofertasTable.ultimaValidacaoEm} >= ${startOfDay}`);

  const lider = liderRow
    ? {
        id: liderRow.id,
        nome: liderRow.nome,
        pontos: liderRow.pontos,
        nivel: getNivelUsuario(liderRow.pontos),
      }
    : null;

  const result = {
    totalOfertas: Number(totals?.total ?? 0),
    confirmadosHoje: Number(confirmadosRow?.total ?? 0),
    menorPreco: menorPrecoRow?.preco ?? null,
    menorPrecoProduto: menorPrecoRow?.produto ?? null,
    lider,
  };

  statsCache.set(result);
  res.json(result);
});

// ── GET /api/perfil/:id ───────────────────────────────────────────────────────
router.get("/perfil/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }

  const [usuario] = await db
    .select()
    .from(usuariosTable)
    .where(eq(usuariosTable.id, id))
    .limit(1);

  if (!usuario) {
    res.status(404).json({ error: "Usuário não encontrado" });
    return;
  }

  const [ofertaStats] = await db
    .select({
      totalOfertas: count(ofertasTable.id),
      totalValidacoesRecebidas: sum(ofertasTable.validacoes),
    })
    .from(ofertasTable)
    .where(eq(ofertasTable.usuarioId, id));

  res.json({
    id: usuario.id,
    nome: usuario.nome,
    pontos: usuario.pontos,
    nivel: getNivelUsuario(usuario.pontos),
    streak: usuario.streak ?? 0,
    totalOfertas: Number(ofertaStats?.totalOfertas ?? 0),
    totalValidacoesRecebidas: Number(ofertaStats?.totalValidacoesRecebidas ?? 0),
    telefone: usuario.telefone ?? null,
    cidade: usuario.cidadeUsuario ?? null,
    estado: usuario.estado ?? null,
  });
});

export default router;
