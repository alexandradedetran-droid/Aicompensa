import { Router } from "express";
import { db, alertasTable, ofertasTable, usuariosTable } from "@workspace/db";
import { and, eq, lte, sql } from "drizzle-orm";

const router = Router();

function formatAlerta(a: typeof alertasTable.$inferSelect) {
  return {
    id: a.id,
    usuarioId: a.usuarioId,
    produto: a.produto,
    precoAlvo: a.precoAlvo,
    criadoEm: a.criadoEm.toISOString(),
  };
}

// GET /api/alertas?usuarioId=X
router.get("/alertas", async (req, res) => {
  const usuarioId = Number(req.query["usuarioId"]);
  if (isNaN(usuarioId)) {
    res.status(400).json({ error: "usuarioId inválido" });
    return;
  }

  const rows = await db
    .select()
    .from(alertasTable)
    .where(eq(alertasTable.usuarioId, usuarioId))
    .orderBy(alertasTable.criadoEm);

  res.json(rows.map(formatAlerta));
});

// GET /api/alertas/matches?usuarioId=X
// Returns count of distinct current offers that match any of the user's alerts.
router.get("/alertas/matches", async (req, res) => {
  const usuarioId = Number(req.query["usuarioId"]);
  if (isNaN(usuarioId)) {
    res.status(400).json({ error: "usuarioId inválido" });
    return;
  }

  const alertas = await db
    .select()
    .from(alertasTable)
    .where(eq(alertasTable.usuarioId, usuarioId));

  if (alertas.length === 0) {
    res.json({ count: 0, alertas: [], ofertas: [] });
    return;
  }

  const now = new Date();

  // For each alert, find matching offers and deduplicate
  const matchedOfertaIds = new Set<number>();
  const matchedOfertas: Array<{
    id: number;
    produto: string;
    preco: number;
    mercado: string;
    bairro: string | null;
    alertaProduto: string;
    alertaPrecoAlvo: number;
  }> = [];

  for (const alerta of alertas) {
    const rows = await db
      .select({
        id: ofertasTable.id,
        produto: ofertasTable.produto,
        preco: ofertasTable.preco,
        mercado: ofertasTable.mercado,
        bairro: ofertasTable.bairro,
        validade: ofertasTable.validade,
        status: ofertasTable.status,
      })
      .from(ofertasTable)
      .where(
        and(
          lte(ofertasTable.preco, alerta.precoAlvo),
          sql`lower(${ofertasTable.produto}) like ${"%" + alerta.produto.toLowerCase() + "%"}`
        )
      );

    for (const row of rows) {
      // Skip expired
      if (row.validade && row.validade < now) continue;
      if (row.status === "expirada") continue;
      if (!matchedOfertaIds.has(row.id)) {
        matchedOfertaIds.add(row.id);
        matchedOfertas.push({
          id: row.id,
          produto: row.produto,
          preco: row.preco,
          mercado: row.mercado,
          bairro: row.bairro ?? null,
          alertaProduto: alerta.produto,
          alertaPrecoAlvo: alerta.precoAlvo,
        });
      }
    }
  }

  res.json({
    count: matchedOfertaIds.size,
    alertas: alertas.map(formatAlerta),
    ofertas: matchedOfertas,
  });
});

// POST /api/alertas
router.post("/alertas", async (req, res) => {
  const { usuarioId, produto, precoAlvo } = req.body as {
    usuarioId?: number;
    produto?: string;
    precoAlvo?: number;
  };

  if (!usuarioId || isNaN(Number(usuarioId))) {
    res.status(400).json({ error: "usuarioId inválido" });
    return;
  }
  if (!produto || String(produto).trim().length < 2) {
    res.status(400).json({ error: "Produto deve ter pelo menos 2 caracteres" });
    return;
  }
  if (!precoAlvo || isNaN(Number(precoAlvo)) || Number(precoAlvo) <= 0) {
    res.status(400).json({ error: "Preço alvo deve ser maior que zero" });
    return;
  }

  // Check user exists
  const [usuario] = await db
    .select({ id: usuariosTable.id })
    .from(usuariosTable)
    .where(eq(usuariosTable.id, Number(usuarioId)))
    .limit(1);

  if (!usuario) {
    res.status(404).json({ error: "Usuário não encontrado" });
    return;
  }

  const [created] = await db
    .insert(alertasTable)
    .values({
      usuarioId: Number(usuarioId),
      produto: String(produto).trim(),
      precoAlvo: Number(precoAlvo),
    })
    .returning();

  res.status(201).json(formatAlerta(created));
});

// DELETE /api/alertas/:id
router.delete("/alertas/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }

  const [deleted] = await db
    .delete(alertasTable)
    .where(eq(alertasTable.id, id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Alerta não encontrado" });
    return;
  }

  res.json({ ok: true });
});

export default router;
