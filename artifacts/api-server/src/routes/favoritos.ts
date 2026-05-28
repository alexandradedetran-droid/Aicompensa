import { Router } from "express";
import { db, favoritosTable, usuariosTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

const router = Router();

// GET /api/favoritos?usuarioId=X — returns array of ofertaId integers
router.get("/favoritos", async (req, res) => {
  const usuarioId = Number(req.query["usuarioId"]);
  if (!usuarioId || isNaN(usuarioId)) {
    res.status(400).json({ error: "usuarioId inválido" });
    return;
  }

  const rows = await db
    .select({ ofertaId: favoritosTable.ofertaId })
    .from(favoritosTable)
    .where(eq(favoritosTable.usuarioId, usuarioId));

  res.json(rows.map((r) => r.ofertaId));
});

// POST /api/favoritos — { usuarioId, ofertaId }
router.post("/favoritos", async (req, res) => {
  const { usuarioId, ofertaId } = req.body as { usuarioId?: number; ofertaId?: number };

  if (!usuarioId || isNaN(Number(usuarioId))) {
    res.status(400).json({ error: "usuarioId inválido" });
    return;
  }
  if (!ofertaId || isNaN(Number(ofertaId))) {
    res.status(400).json({ error: "ofertaId inválido" });
    return;
  }

  // Verify user exists
  const [usuario] = await db
    .select({ id: usuariosTable.id })
    .from(usuariosTable)
    .where(eq(usuariosTable.id, Number(usuarioId)))
    .limit(1);

  if (!usuario) {
    res.status(401).json({ error: "Usuário não encontrado" });
    return;
  }

  // Check if already saved
  const existing = await db
    .select({ id: favoritosTable.id })
    .from(favoritosTable)
    .where(
      and(
        eq(favoritosTable.usuarioId, Number(usuarioId)),
        eq(favoritosTable.ofertaId, Number(ofertaId)),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    res.status(409).json({ error: "Oferta já salva nos favoritos" });
    return;
  }

  await db.insert(favoritosTable).values({
    usuarioId: Number(usuarioId),
    ofertaId: Number(ofertaId),
  });

  res.status(201).json({ ok: true });
});

// DELETE /api/favoritos/:ofertaId?usuarioId=X
router.delete("/favoritos/:ofertaId", async (req, res) => {
  const ofertaId = Number(req.params["ofertaId"]);
  const usuarioId = Number(req.query["usuarioId"]);

  if (isNaN(ofertaId) || isNaN(usuarioId)) {
    res.status(400).json({ error: "Parâmetros inválidos" });
    return;
  }

  const [deleted] = await db
    .delete(favoritosTable)
    .where(
      and(
        eq(favoritosTable.usuarioId, usuarioId),
        eq(favoritosTable.ofertaId, ofertaId),
      ),
    )
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Favorito não encontrado" });
    return;
  }

  res.json({ ok: true });
});

export default router;
