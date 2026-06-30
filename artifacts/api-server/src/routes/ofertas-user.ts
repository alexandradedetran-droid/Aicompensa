// @ts-nocheck
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { db, ofertasTable, usuariosTable, ofertaHistoricoTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { validateAndStoreImage } from "../lib/image-storage";
import { feedCache } from "../lib/feed-cache";

const router = Router();

const NAO_ENCONTREI_THRESHOLD = 3;

const editLimiter = rateLimit({
  windowMs: 10 * 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas edições. Aguarde alguns minutos." },
});

async function logHistorico(
  ofertaId: number,
  usuarioId: number | null,
  acao: string,
  statusAntes: string | null,
  statusDepois: string | null,
  detalhe?: string,
) {
  await db.insert(ofertaHistoricoTable).values({
    ofertaId,
    usuarioId,
    acao,
    statusAntes,
    statusDepois,
    detalhe: detalhe ?? null,
  });
}

// ── GET /api/ofertas/:id/historico ────────────────────────────────────────────
router.get("/ofertas/:id/historico", async (req, res) => {
  const ofertaId = Number(req.params["id"]);
  if (!ofertaId) { res.status(400).json({ error: "ID inválido" }); return; }

  const rows = await db
    .select({
      id: ofertaHistoricoTable.id,
      acao: ofertaHistoricoTable.acao,
      statusAntes: ofertaHistoricoTable.statusAntes,
      statusDepois: ofertaHistoricoTable.statusDepois,
      detalhe: ofertaHistoricoTable.detalhe,
      criadoEm: ofertaHistoricoTable.criadoEm,
      usuarioNome: usuariosTable.nome,
    })
    .from(ofertaHistoricoTable)
    .leftJoin(usuariosTable, eq(ofertaHistoricoTable.usuarioId, usuariosTable.id))
    .where(eq(ofertaHistoricoTable.ofertaId, ofertaId))
    .orderBy(sql`${ofertaHistoricoTable.criadoEm} DESC`)
    .limit(50);

  res.json(rows.map((r) => ({ ...r, criadoEm: r.criadoEm.toISOString() })));
});

// ── PUT /api/ofertas/:id — edit offer (owner only) ────────────────────────────
router.put("/ofertas/:id", editLimiter, requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const ofertaId = Number(req.params["id"]);
  if (!ofertaId) { res.status(400).json({ error: "ID inválido" }); return; }

  const [oferta] = await db
    .select({ usuarioId: ofertasTable.usuarioId, statusUsuario: ofertasTable.statusUsuario })
    .from(ofertasTable)
    .where(eq(ofertasTable.id, ofertaId))
    .limit(1);

  if (!oferta) { res.status(404).json({ error: "Oferta não encontrada" }); return; }
  if (oferta.usuarioId !== userId) { res.status(403).json({ error: "Sem permissão" }); return; }
  if (oferta.statusUsuario === "excluida") { res.status(410).json({ error: "Oferta excluída" }); return; }

  const { preco, produto, categoria, marca, mercado, bairro, cidade, fotoUrl, validade, unidade,
          precoNormal, precoClube, programaClubeName, tipoPreco } = req.body as Record<string, unknown>;

  if (preco !== undefined && (typeof preco !== "number" || preco <= 0)) {
    res.status(400).json({ error: "Preço inválido" });
    return;
  }

  type UpdatePayload = Partial<{
    preco: number;
    produto: string;
    categoria: string;
    marca: string | null;
    mercado: string;
    bairro: string | null;
    cidade: string | null;
    fotoUrl: string | null;
    validade: Date | null;
    unidade: string | null;
    precoNormal: number | null;
    precoClube: number | null;
    programaClubeName: string | null;
    tipoPreco: "normal" | "clube" | "ambos" | "desconhecido";
  }>;
  const updates: UpdatePayload = {};

  if (typeof preco === "number")    updates.preco    = preco;
  if (typeof produto === "string")  updates.produto  = produto.trim();
  if (typeof categoria === "string") updates.categoria = categoria.trim();
  if (typeof marca === "string")    updates.marca    = marca.trim() || null;
  if (typeof mercado === "string")  updates.mercado  = mercado.trim();
  if (typeof bairro === "string")   updates.bairro   = bairro.trim() || null;
  if (typeof cidade === "string")   updates.cidade   = cidade.trim() || null;
  if (typeof unidade === "string")  updates.unidade  = unidade || null;
  if (typeof precoNormal === "number" && precoNormal > 0) updates.precoNormal = precoNormal;
  if (typeof precoClube === "number" && precoClube > 0)   updates.precoClube  = precoClube;
  if (precoClube === null)                                updates.precoClube  = null;
  if (typeof programaClubeName === "string")              updates.programaClubeName = programaClubeName.trim() || null;
  if (typeof tipoPreco === "string" && ["normal","clube","ambos","desconhecido"].includes(tipoPreco as string))
    updates.tipoPreco = tipoPreco as "normal" | "clube" | "ambos" | "desconhecido";
  if (validade === null)            updates.validade = null;
  if (typeof validade === "string" && validade) {
    const d = new Date(validade);
    if (!isNaN(d.getTime())) updates.validade = d;
  }

  if (typeof fotoUrl === "string" && fotoUrl) {
    const result = await validateAndStoreImage(fotoUrl);
    if (!result.ok) { res.status(400).json({ error: result.error }); return; }
    updates.fotoUrl = result.url;
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "Nenhum campo para atualizar" });
    return;
  }

  await db.update(ofertasTable).set(updates).where(eq(ofertasTable.id, ofertaId));

  void logHistorico(ofertaId, userId, "editar", null, null, JSON.stringify(Object.keys(updates)));
  feedCache.invalidate();

  res.json({ ok: true });
});

// ── PATCH /api/ofertas/:id/encerrar — mark as ended (owner only) ──────────────
router.patch("/ofertas/:id/encerrar", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const ofertaId = Number(req.params["id"]);
  if (!ofertaId) { res.status(400).json({ error: "ID inválido" }); return; }

  const [oferta] = await db
    .select({ usuarioId: ofertasTable.usuarioId, statusUsuario: ofertasTable.statusUsuario })
    .from(ofertasTable)
    .where(eq(ofertasTable.id, ofertaId))
    .limit(1);

  if (!oferta) { res.status(404).json({ error: "Oferta não encontrada" }); return; }
  if (oferta.usuarioId !== userId) { res.status(403).json({ error: "Sem permissão" }); return; }
  if (oferta.statusUsuario === "excluida") { res.status(410).json({ error: "Oferta excluída" }); return; }
  if (oferta.statusUsuario === "encerrada") {
    res.status(409).json({ error: "Oferta já encerrada" });
    return;
  }

  const antes = oferta.statusUsuario ?? "ativa";

  await db
    .update(ofertasTable)
    .set({ statusUsuario: "encerrada", dataEncerramento: new Date() })
    .where(eq(ofertasTable.id, ofertaId));

  void logHistorico(ofertaId, userId, "encerrar", antes, "encerrada");
  feedCache.invalidate();

  res.json({ ok: true, statusUsuario: "encerrada" });
});

// ── PATCH /api/ofertas/:id/excluir — soft delete (owner only, 10-min rule) ───
router.patch("/ofertas/:id/excluir", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const ofertaId = Number(req.params["id"]);
  if (!ofertaId) { res.status(400).json({ error: "ID inválido" }); return; }

  const [oferta] = await db
    .select({
      usuarioId: ofertasTable.usuarioId,
      statusUsuario: ofertasTable.statusUsuario,
      dataCriacao: ofertasTable.dataCriacao,
    })
    .from(ofertasTable)
    .where(eq(ofertasTable.id, ofertaId))
    .limit(1);

  if (!oferta) { res.status(404).json({ error: "Oferta não encontrada" }); return; }
  if (oferta.usuarioId !== userId) { res.status(403).json({ error: "Sem permissão" }); return; }
  if (oferta.statusUsuario === "excluida") { res.status(410).json({ error: "Oferta já excluída" }); return; }

  const ageMs = Date.now() - oferta.dataCriacao.getTime();
  const withinGracePeriod = ageMs < 10 * 60_000;

  const antes = oferta.statusUsuario ?? "ativa";

  if (withinGracePeriod) {
    await db.delete(ofertasTable).where(and(eq(ofertasTable.id, ofertaId), eq(ofertasTable.usuarioId, userId)));
    feedCache.invalidate();
    res.json({ ok: true, deleted: true });
    return;
  }

  await db
    .update(ofertasTable)
    .set({ statusUsuario: "excluida", dataEncerramento: new Date() })
    .where(eq(ofertasTable.id, ofertaId));

  void logHistorico(ofertaId, userId, "excluir", antes, "excluida");
  feedCache.invalidate();

  res.json({ ok: true, deleted: false, statusUsuario: "excluida" });
});

// ── POST /api/ofertas/:id/nao-encontrei — community "não encontrei mais" ──────
router.post("/ofertas/:id/nao-encontrei", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const ofertaId = Number(req.params["id"]);
  if (!ofertaId) { res.status(400).json({ error: "ID inválido" }); return; }

  const [oferta] = await db
    .select({
      usuarioId: ofertasTable.usuarioId,
      statusUsuario: ofertasTable.statusUsuario,
      naoEncontreiMais: ofertasTable.naoEncontreiMais,
    })
    .from(ofertasTable)
    .where(eq(ofertasTable.id, ofertaId))
    .limit(1);

  if (!oferta) { res.status(404).json({ error: "Oferta não encontrada" }); return; }
  if (oferta.usuarioId === userId) { res.status(403).json({ error: "Você não pode reportar sua própria oferta" }); return; }
  if (oferta.statusUsuario === "excluida" || oferta.statusUsuario === "encerrada") {
    res.status(409).json({ error: "Oferta já encerrada" });
    return;
  }

  const newCount = (oferta.naoEncontreiMais ?? 0) + 1;
  const novoStatus = newCount >= NAO_ENCONTREI_THRESHOLD ? "pode_ter_acabado" : oferta.statusUsuario ?? null;

  const updatePayload: Partial<typeof ofertasTable.$inferInsert> = {
    naoEncontreiMais: newCount,
  };
  if (newCount >= NAO_ENCONTREI_THRESHOLD && oferta.statusUsuario !== "pode_ter_acabado") {
    updatePayload.statusUsuario = "pode_ter_acabado";
  }

  await db.update(ofertasTable).set(updatePayload).where(eq(ofertasTable.id, ofertaId));

  if (newCount >= NAO_ENCONTREI_THRESHOLD && oferta.statusUsuario !== "pode_ter_acabado") {
    void logHistorico(ofertaId, userId, "nao_encontrei_auto", oferta.statusUsuario ?? "ativa", "pode_ter_acabado", `${newCount} relatos`);
    feedCache.invalidate();
  }

  res.json({ ok: true, naoEncontreiMais: newCount, statusUsuario: novoStatus });
});

// ── POST /api/admin/ofertas/:id/restaurar — admin restore ────────────────────
router.post("/admin/ofertas/:id/restaurar", async (req, res) => {
  const token = req.headers["x-admin-token"];
  if (!token || token !== process.env["ADMIN_TOKEN"]) {
    res.status(401).json({ error: "Token admin inválido" });
    return;
  }

  const ofertaId = Number(req.params["id"]);
  if (!ofertaId) { res.status(400).json({ error: "ID inválido" }); return; }

  const [oferta] = await db
    .select({ statusUsuario: ofertasTable.statusUsuario })
    .from(ofertasTable)
    .where(eq(ofertasTable.id, ofertaId))
    .limit(1);

  if (!oferta) { res.status(404).json({ error: "Oferta não encontrada" }); return; }

  const antes = oferta.statusUsuario ?? "ativa";

  await db
    .update(ofertasTable)
    .set({ statusUsuario: null, dataEncerramento: null, naoEncontreiMais: 0 })
    .where(eq(ofertasTable.id, ofertaId));

  void logHistorico(ofertaId, null, "restaurar_admin", antes, "ativa");
  feedCache.invalidate();

  res.json({ ok: true });
});

export default router;
