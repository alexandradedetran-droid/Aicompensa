/**
 * Admin routes — protected by x-admin-token header.
 * Token is read from ADMIN_TOKEN env var (set via Replit Secrets).
 * Fallback: "changeme-admin-token" in dev (override in production!).
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { rateLimit } from "express-rate-limit";
import { db, ofertasTable, usuariosTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { getNivelUsuario } from "../lib/nivel-usuario";

const router = Router();

// Token from env — NEVER hardcode in source
const ADMIN_TOKEN = process.env["ADMIN_TOKEN"] ?? "changeme-admin-token";

// ── Brute-force protection on login: 10 attempts / 15 min per IP ─────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas tentativas de login. Aguarde 15 minutos." },
});

function formatAdminOferta(
  r: typeof ofertasTable.$inferSelect & { nome: string; pontos: number }
) {
  const score = (r.validacoes * 2 + r.curtidas) - (r.denuncias * 3);
  return {
    id: r.id,
    produto: r.produto,
    categoria: r.categoria,
    marca: r.marca ?? null,
    preco: r.preco,
    mercado: r.mercado,
    bairro: r.bairro ?? null,
    cidade: r.cidade ?? null,
    fotoUrl: r.fotoUrl ?? null,
    dataCriacao: r.dataCriacao.toISOString(),
    curtidas: r.curtidas,
    validacoes: r.validacoes,
    denuncias: r.denuncias,
    status: r.status,
    usuarioId: r.usuarioId,
    usuario: r.nome,
    score,
    nivelUsuario: getNivelUsuario(r.pontos),
    destacada: r.destacada,
    patrocinada: r.patrocinada,
  };
}

// ── PUBLIC: POST /api/admin/login ─────────────────────────────────────────────
router.post("/admin/login", loginLimiter, (req, res) => {
  const { usuario, senha } = req.body as { usuario?: string; senha?: string };
  const adminUser = process.env["ADMIN_USER"] ?? "admin";
  const adminPass = process.env["ADMIN_PASS"] ?? "admin123";

  if (
    typeof usuario === "string" &&
    typeof senha === "string" &&
    usuario === adminUser &&
    senha === adminPass
  ) {
    res.json({ token: ADMIN_TOKEN });
  } else {
    res.status(401).json({ error: "Usuário ou senha inválidos." });
  }
});

// ── MIDDLEWARE: all routes below require x-admin-token ────────────────────────
function requireAdminToken(req: Request, res: Response, next: NextFunction) {
  const token = req.headers["x-admin-token"];
  if (!token || token !== ADMIN_TOKEN) {
    res.status(401).json({ error: "Acesso não autorizado." });
    return;
  }
  next();
}

// ── PROTECTED: DELETE /api/ofertas/:id ───────────────────────────────────────
router.delete("/ofertas/:id", requireAdminToken, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "ID inválido" }); return; }

  const [deleted] = await db.delete(ofertasTable).where(eq(ofertasTable.id, id)).returning();
  if (!deleted) { res.status(404).json({ error: "Oferta não encontrada" }); return; }

  res.json({ ok: true });
});

// ── PROTECTED: POST /api/ofertas/:id/destacar ─────────────────────────────────
router.post("/ofertas/:id/destacar", requireAdminToken, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "ID inválido" }); return; }

  const existing = await db.select().from(ofertasTable).where(eq(ofertasTable.id, id)).limit(1);
  if (existing.length === 0) { res.status(404).json({ error: "Oferta não encontrada" }); return; }

  const [updated] = await db
    .update(ofertasTable)
    .set({ destacada: !existing[0].destacada })
    .where(eq(ofertasTable.id, id))
    .returning();

  const usuario = await db.select().from(usuariosTable).where(eq(usuariosTable.id, updated.usuarioId)).limit(1);
  res.json(formatAdminOferta({ ...updated, nome: usuario[0]?.nome ?? "Desconhecido", pontos: usuario[0]?.pontos ?? 0 }));
});

// ── PROTECTED: POST /api/ofertas/:id/patrocinar ───────────────────────────────
router.post("/ofertas/:id/patrocinar", requireAdminToken, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "ID inválido" }); return; }

  const existing = await db.select().from(ofertasTable).where(eq(ofertasTable.id, id)).limit(1);
  if (existing.length === 0) { res.status(404).json({ error: "Oferta não encontrada" }); return; }

  const [updated] = await db
    .update(ofertasTable)
    .set({ patrocinada: !existing[0].patrocinada })
    .where(eq(ofertasTable.id, id))
    .returning();

  const usuario = await db.select().from(usuariosTable).where(eq(usuariosTable.id, updated.usuarioId)).limit(1);
  res.json(formatAdminOferta({ ...updated, nome: usuario[0]?.nome ?? "Desconhecido", pontos: usuario[0]?.pontos ?? 0 }));
});

// ── PROTECTED: POST /api/ofertas/:id/resetar-denuncias ───────────────────────
router.post("/ofertas/:id/resetar-denuncias", requireAdminToken, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "ID inválido" }); return; }

  const existing = await db.select().from(ofertasTable).where(eq(ofertasTable.id, id)).limit(1);
  if (existing.length === 0) { res.status(404).json({ error: "Oferta não encontrada" }); return; }

  const [updated] = await db
    .update(ofertasTable)
    .set({ denuncias: 0, status: "validada" })
    .where(eq(ofertasTable.id, id))
    .returning();

  const usuario = await db.select().from(usuariosTable).where(eq(usuariosTable.id, updated.usuarioId)).limit(1);
  res.json(formatAdminOferta({ ...updated, nome: usuario[0]?.nome ?? "Desconhecido", pontos: usuario[0]?.pontos ?? 0 }));
});

// ── PROTECTED: GET /api/admin/stats ──────────────────────────────────────────
router.get("/admin/stats", requireAdminToken, async (_req, res) => {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const [totals] = await db
    .select({
      totalOfertas:    sql<number>`count(*)::int`,
      ofertasHoje:     sql<number>`count(*) filter (where data_criacao >= ${hoje})::int`,
      confirmadosHoje: sql<number>`count(*) filter (where ultima_validacao_em >= ${hoje})::int`,
      totalDenuncias:  sql<number>`coalesce(sum(denuncias), 0)::int`,
      totalValidacoes: sql<number>`coalesce(sum(validacoes), 0)::int`,
    })
    .from(ofertasTable);

  const [usersCount] = await db
    .select({ totalUsuarios: sql<number>`count(*)::int` })
    .from(usuariosTable);

  res.json({
    totalOfertas:    totals.totalOfertas,
    ofertasHoje:     totals.ofertasHoje,
    confirmadosHoje: totals.confirmadosHoje,
    totalDenuncias:  totals.totalDenuncias,
    totalValidacoes: totals.totalValidacoes,
    totalUsuarios:   usersCount.totalUsuarios,
  });
});

// ── PROTECTED: GET /api/admin/ofertas ─────────────────────────────────────────
router.get("/admin/ofertas", requireAdminToken, async (_req, res) => {
  const rows = await db
    .select({
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
      curtidas: ofertasTable.curtidas,
      validacoes: ofertasTable.validacoes,
      denuncias: ofertasTable.denuncias,
      status: ofertasTable.status,
      usuarioId: ofertasTable.usuarioId,
      destacada: ofertasTable.destacada,
      patrocinada: ofertasTable.patrocinada,
      nome: usuariosTable.nome,
      pontos: usuariosTable.pontos,
    })
    .from(ofertasTable)
    .leftJoin(usuariosTable, eq(ofertasTable.usuarioId, usuariosTable.id))
    .orderBy(ofertasTable.dataCriacao);

  res.json(
    rows.map((r) =>
      formatAdminOferta({
        ...r,
        nome: r.nome ?? "Desconhecido",
        pontos: r.pontos ?? 0,
        status: r.status ?? "nova",
      } as typeof ofertasTable.$inferSelect & { nome: string; pontos: number })
    )
  );
});

// ── PROTECTED: GET /api/admin/usuarios ────────────────────────────────────────
router.get("/admin/usuarios", requireAdminToken, async (_req, res) => {
  const rows = await db
    .select({
      id: usuariosTable.id,
      nome: usuariosTable.nome,
      pontos: usuariosTable.pontos,
      bloqueado: usuariosTable.bloqueado,
      totalOfertas: sql<number>`count(${ofertasTable.id})::int`,
    })
    .from(usuariosTable)
    .leftJoin(ofertasTable, eq(ofertasTable.usuarioId, usuariosTable.id))
    .groupBy(usuariosTable.id)
    .orderBy(usuariosTable.pontos);

  res.json(
    rows.map((r) => ({
      id: r.id,
      nome: r.nome,
      pontos: r.pontos,
      nivel: getNivelUsuario(r.pontos),
      totalOfertas: r.totalOfertas,
      bloqueado: r.bloqueado,
    }))
  );
});

// ── PROTECTED: POST /api/admin/usuarios/:id/bloquear ──────────────────────────
router.post("/admin/usuarios/:id/bloquear", requireAdminToken, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "ID inválido" }); return; }

  const existing = await db.select().from(usuariosTable).where(eq(usuariosTable.id, id)).limit(1);
  if (existing.length === 0) { res.status(404).json({ error: "Usuário não encontrado" }); return; }

  const [updated] = await db
    .update(usuariosTable)
    .set({ bloqueado: !existing[0].bloqueado })
    .where(eq(usuariosTable.id, id))
    .returning();

  const [totalOfertas] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(ofertasTable)
    .where(eq(ofertasTable.usuarioId, id));

  res.json({
    id: updated.id,
    nome: updated.nome,
    pontos: updated.pontos,
    nivel: getNivelUsuario(updated.pontos),
    totalOfertas: totalOfertas.total,
    bloqueado: updated.bloqueado,
  });
});

export default router;
