// @ts-nocheck
import { Router, type Request, type Response, type NextFunction } from "express";
import { db, produtosTable, usuariosTable } from "@workspace/db";
import { eq, sql, desc, ilike, and } from "drizzle-orm";
import { gerarImagemPremiumProduto } from "../lib/produto-catalogo";
import { logger } from "../lib/logger";

const router = Router();

const ADMIN_TOKEN = process.env["ADMIN_TOKEN"] ?? "changeme-admin-token";

async function requireAdminToken(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const xToken = req.headers["x-admin-token"];
  if (xToken && xToken === ADMIN_TOKEN) { next(); return; }

  const auth = req.headers["authorization"];
  if (auth?.startsWith("Bearer ")) {
    const bearer = auth.slice(7).trim();
    if (bearer) {
      const [user] = await db
        .select({ id: usuariosTable.id, isAdmin: usuariosTable.isAdmin })
        .from(usuariosTable)
        .where(eq(usuariosTable.apiToken, bearer))
        .limit(1);
      if (user?.isAdmin) { next(); return; }
    }
  }
  res.status(401).json({ error: "Acesso não autorizado." });
}

router.use(/^\/admin\/produtos/, requireAdminToken);

// ── GET /api/admin/produtos ───────────────────────────────────────────────────
router.get("/admin/produtos", async (req: Request, res: Response) => {
  try {
    const page   = Math.max(1, Number(req.query.page   ?? 1));
    const limit  = Math.min(100, Math.max(1, Number(req.query.limit ?? 30)));
    const offset = (page - 1) * limit;
    const busca  = (req.query.busca  as string | undefined)?.trim() || undefined;
    const status = (req.query.statusImagem as string | undefined)?.trim() || undefined;

    const conds = [];
    if (busca)  conds.push(ilike(produtosTable.nome, `%${busca}%`));
    if (status) conds.push(eq(produtosTable.statusImagem, status));
    const where = conds.length > 0 ? and(...conds) : undefined;

    const [items, countResult] = await Promise.all([
      db.select({
        id:               produtosTable.id,
        nome:             produtosTable.nome,
        marca:            produtosTable.marca,
        categoria:        produtosTable.categoria,
        subcategoria:     produtosTable.subcategoria,
        unidade:          produtosTable.unidade,
        quantidade:       produtosTable.quantidade,
        codigoBarras:     produtosTable.codigoBarras,
        imagemPremiumUrl: produtosTable.imagemPremiumUrl,
        imagemOriginalUrl:produtosTable.imagemOriginalUrl,
        statusImagem:     produtosTable.statusImagem,
        totalOfertas:     produtosTable.totalOfertas,
        criadoEm:         produtosTable.criadoEm,
        atualizadoEm:     produtosTable.atualizadoEm,
      })
        .from(produtosTable)
        .where(where)
        .orderBy(desc(produtosTable.criadoEm))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql`count(*)` })
        .from(produtosTable)
        .where(where),
    ]);

    const total = Number(countResult[0]?.count ?? 0);
    res.json({ items, total, page, pages: Math.ceil(total / limit), limit });
  } catch (err) {
    logger.error({ err }, "GET /admin/produtos failed");
    res.status(500).json({ error: "Erro ao buscar produtos" });
  }
});

// ── POST /api/admin/produtos/:id/regenerar-imagem ────────────────────────────
router.post("/admin/produtos/:id/regenerar-imagem", async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const [produto] = await db
      .select()
      .from(produtosTable)
      .where(eq(produtosTable.id, id))
      .limit(1);

    if (!produto) return res.status(404).json({ error: "Produto não encontrado" });

    await db
      .update(produtosTable)
      .set({ imagemPremiumUrl: null, statusImagem: "pendente", atualizadoEm: new Date() })
      .where(eq(produtosTable.id, id));

    gerarImagemPremiumProduto({ ...produto, imagemPremiumUrl: null, statusImagem: "pendente" }).catch(() => {});

    res.json({ ok: true, message: "Regeneração de imagem iniciada" });
  } catch (err) {
    logger.error({ err }, "POST /admin/produtos/:id/regenerar-imagem failed");
    res.status(500).json({ error: "Erro ao iniciar regeneração" });
  }
});

// ── PATCH /api/admin/produtos/:id ────────────────────────────────────────────
router.patch("/admin/produtos/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { nome, marca, categoria, subcategoria, unidade, quantidade, codigoBarras, statusImagem } = req.body;

  const updates: Record<string, unknown> = { atualizadoEm: new Date() };
  if (nome         !== undefined) updates.nome         = nome;
  if (marca        !== undefined) updates.marca        = marca;
  if (categoria    !== undefined) updates.categoria    = categoria;
  if (subcategoria !== undefined) updates.subcategoria = subcategoria;
  if (unidade      !== undefined) updates.unidade      = unidade;
  if (quantidade   !== undefined) updates.quantidade   = quantidade;
  if (codigoBarras !== undefined) updates.codigoBarras = codigoBarras;
  if (statusImagem !== undefined) updates.statusImagem = statusImagem;

  try {
    const [updated] = await db
      .update(produtosTable)
      .set(updates)
      .where(eq(produtosTable.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: "Produto não encontrado" });
    res.json(updated);
  } catch (err) {
    logger.error({ err }, "PATCH /admin/produtos/:id failed");
    res.status(500).json({ error: "Erro ao atualizar produto" });
  }
});

export default router;
