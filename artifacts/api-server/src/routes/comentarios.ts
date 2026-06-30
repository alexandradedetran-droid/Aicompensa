// @ts-nocheck
import { Router } from "express";
import {
  db, comentariosOfertaTable, comentariosCurtidasTable,
  usuariosTable, ofertasTable,
} from "@workspace/db";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";

const router = Router();

// ── Constants ─────────────────────────────────────────────────────────────────
const VALID_TAGS = new Set(["disponivel", "acabando", "esgotado", "compensa", "subiu", "fila"]);
const MAX_TEXT   = 120;
const PAGE_SIZE  = 20;
// Max 3 comments per user per offer per 24h (flood guard)
const FLOOD_WINDOW_MS = 24 * 3600 * 1000;
const FLOOD_MAX       = 5;

// Basic bad-word / link / HTML moderation
const LINK_RE = /https?:\/\/|www\.|\.com\b|\.br\b|bit\.ly|t\.me/i;
const HTML_RE = /<[^>]+>/;
const BAD_RE  = /\b(merda|porra|caralho|fdp|filhod[ae]puta|viado|bicha|arromb|otário)\b/i;

function moderateText(t: string): string | null {
  if (LINK_RE.test(t))  return "Links não são permitidos em comentários.";
  if (HTML_RE.test(t))  return "HTML não é permitido.";
  if (BAD_RE.test(t))   return "Linguagem inapropriada detectada.";
  if (t.length > MAX_TEXT) return `Máximo ${MAX_TEXT} caracteres.`;
  return null;
}

// ── GET /api/ofertas/:id/comentarios?sort=recent|curtidas&page=N ──────────────
router.get("/ofertas/:id/comentarios", async (req, res) => {
  const ofertaId = parseInt(String(req.params.id));
  if (!isFinite(ofertaId)) { res.status(400).json({ error: "ID inválido" }); return; }

  const sort = (req.query.sort as string) === "curtidas" ? "curtidas" : "recent";
  const page = Math.max(0, parseInt(req.query.page as string ?? "0") || 0);

  const rows = await db
    .select({
      id:          comentariosOfertaTable.id,
      tag:         comentariosOfertaTable.tag,
      texto:       comentariosOfertaTable.texto,
      curtidas:    comentariosOfertaTable.curtidas,
      criadoEm:    comentariosOfertaTable.criadoEm,
      usuarioId:   comentariosOfertaTable.usuarioId,
      nomeUsuario: usuariosTable.nome,
      pontos:      usuariosTable.pontos,
    })
    .from(comentariosOfertaTable)
    .innerJoin(usuariosTable, eq(comentariosOfertaTable.usuarioId, usuariosTable.id))
    .where(and(
      eq(comentariosOfertaTable.ofertaId, ofertaId),
      eq(comentariosOfertaTable.status, "ativo"),
    ))
    .orderBy(
      sort === "curtidas"
        ? desc(comentariosOfertaTable.curtidas)
        : desc(comentariosOfertaTable.criadoEm),
      desc(comentariosOfertaTable.criadoEm),
    )
    .limit(PAGE_SIZE)
    .offset(page * PAGE_SIZE);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(comentariosOfertaTable)
    .where(and(
      eq(comentariosOfertaTable.ofertaId, ofertaId),
      eq(comentariosOfertaTable.status, "ativo"),
    ));

  // Tag summary (for badges in the drawer header)
  const tagSummary = await db
    .select({ tag: comentariosOfertaTable.tag, n: sql<number>`count(*)::int` })
    .from(comentariosOfertaTable)
    .where(and(
      eq(comentariosOfertaTable.ofertaId, ofertaId),
      eq(comentariosOfertaTable.status, "ativo"),
      sql`${comentariosOfertaTable.tag} IS NOT NULL`,
    ))
    .groupBy(comentariosOfertaTable.tag);

  // Mark which comments current user already liked
  const userId = req.session?.userId as number | undefined;
  let likedSet = new Set<number>();
  if (userId && rows.length > 0) {
    const ids = rows.map(r => r.id);
    const liked = await db
      .select({ comentarioId: comentariosCurtidasTable.comentarioId })
      .from(comentariosCurtidasTable)
      .where(and(
        eq(comentariosCurtidasTable.usuarioId, userId),
        inArray(comentariosCurtidasTable.comentarioId, ids),
      ));
    likedSet = new Set(liked.map(l => l.comentarioId));
  }

  res.json({
    total,
    hasMore: (page + 1) * PAGE_SIZE < total,
    tagSummary: Object.fromEntries(tagSummary.map(r => [r.tag, r.n])),
    comments: rows.map(r => ({ ...r, curtidoPorMim: likedSet.has(r.id) })),
  });
});

// ── POST /api/ofertas/:id/comentarios ─────────────────────────────────────────
router.post("/ofertas/:id/comentarios", requireAuth, async (req, res) => {
  const ofertaId = parseInt(String(req.params.id));
  const userId   = req.session.userId!;
  if (!isFinite(ofertaId)) { res.status(400).json({ error: "ID inválido" }); return; }

  const { tag, texto } = (req.body ?? {}) as { tag?: string; texto?: string };

  // Validate tag
  if (tag && !VALID_TAGS.has(tag)) {
    res.status(400).json({ error: "Tag inválida." }); return;
  }

  // Validate text
  const cleanText = texto?.trim() ?? "";
  if (cleanText) {
    const err = moderateText(cleanText);
    if (err) { res.status(400).json({ error: err }); return; }
  }

  // Must have tag OR text
  if (!tag && !cleanText) {
    res.status(400).json({ error: "Informe uma tag ou texto." }); return;
  }

  // Offer must exist
  const [oferta] = await db.select({ id: ofertasTable.id, status: ofertasTable.status })
    .from(ofertasTable).where(eq(ofertasTable.id, ofertaId)).limit(1);
  if (!oferta) { res.status(404).json({ error: "Oferta não encontrada." }); return; }
  if (oferta.status === "expirada") { res.status(409).json({ error: "Oferta encerrada." }); return; }

  // Flood guard
  const [{ recentCount }] = await db
    .select({ recentCount: sql<number>`count(*)::int` })
    .from(comentariosOfertaTable)
    .where(and(
      eq(comentariosOfertaTable.ofertaId, ofertaId),
      eq(comentariosOfertaTable.usuarioId, userId),
      sql`${comentariosOfertaTable.criadoEm} > now() - interval '24 hours'`,
    ));
  if (recentCount >= FLOOD_MAX) {
    res.status(429).json({ error: "Você já comentou muito nesta oferta hoje." }); return;
  }

  const [row] = await db.insert(comentariosOfertaTable).values({
    ofertaId,
    usuarioId: userId,
    tag:   tag || null,
    texto: cleanText || null,
  }).returning();

  // Award +1 point for the comment (fire-and-forget)
  db.execute(sql`UPDATE usuarios SET pontos = pontos + 1 WHERE id = ${userId}`).catch(() => {});

  // Impact: if >= 4 "esgotado" tags → bump offer denuncias (may auto-expire)
  if (tag === "esgotado") {
    const [{ esgotadoCount }] = await db
      .select({ esgotadoCount: sql<number>`count(*)::int` })
      .from(comentariosOfertaTable)
      .where(and(
        eq(comentariosOfertaTable.ofertaId, ofertaId),
        eq(comentariosOfertaTable.tag, "esgotado"),
        eq(comentariosOfertaTable.status, "ativo"),
      ));
    if (esgotadoCount >= 4) {
      db.execute(sql`
        UPDATE ofertas SET denuncias = denuncias + 1,
          status = CASE WHEN denuncias + 1 >= 5 THEN 'expirada'
                        WHEN denuncias + 1 >= 3 THEN 'suspeita'
                        ELSE status END
        WHERE id = ${ofertaId}
      `).catch(() => {});
    }
  }

  res.status(201).json(row);
});

// ── POST /api/comentarios/:id/curtir ─────────────────────────────────────────
router.post("/comentarios/:id/curtir", requireAuth, async (req, res) => {
  const comentarioId = parseInt(String(req.params.id));
  const userId       = req.session.userId!;
  if (!isFinite(comentarioId)) { res.status(400).json({ error: "ID inválido" }); return; }

  // Check already liked
  const [existing] = await db.select()
    .from(comentariosCurtidasTable)
    .where(and(
      eq(comentariosCurtidasTable.comentarioId, comentarioId),
      eq(comentariosCurtidasTable.usuarioId, userId),
    )).limit(1);

  if (existing) {
    // Toggle off — unlike
    await db.delete(comentariosCurtidasTable).where(and(
      eq(comentariosCurtidasTable.comentarioId, comentarioId),
      eq(comentariosCurtidasTable.usuarioId, userId),
    ));
    await db.execute(sql`UPDATE comentarios_oferta SET curtidas = GREATEST(0, curtidas - 1) WHERE id = ${comentarioId}`);
    res.json({ curtidoPorMim: false });
    return;
  }

  await db.insert(comentariosCurtidasTable).values({ comentarioId, usuarioId: userId });
  await db.execute(sql`
    UPDATE comentarios_oferta SET curtidas = curtidas + 1 WHERE id = ${comentarioId}
  `);
  const [{ newCurtidas }] = await db
    .select({ newCurtidas: comentariosOfertaTable.curtidas })
    .from(comentariosOfertaTable)
    .where(eq(comentariosOfertaTable.id, comentarioId))
    .limit(1);
  if (newCurtidas === 3) {
    const [comment] = await db.select({ usuarioId: comentariosOfertaTable.usuarioId })
      .from(comentariosOfertaTable).where(eq(comentariosOfertaTable.id, comentarioId)).limit(1);
    if (comment) {
      db.execute(sql`UPDATE usuarios SET pontos = pontos + 2 WHERE id = ${comment.usuarioId}`).catch(() => {});
    }
  }

  res.json({ curtidoPorMim: true, curtidas: newCurtidas });
});

// ── POST /api/comentarios/:id/denunciar ───────────────────────────────────────
router.post("/comentarios/:id/denunciar", requireAuth, async (req, res) => {
  const comentarioId = parseInt(String(req.params.id));
  if (!isFinite(comentarioId)) { res.status(400).json({ error: "ID inválido" }); return; }

  await db.execute(sql`
    UPDATE comentarios_oferta
    SET denuncias = denuncias + 1,
        status = CASE WHEN denuncias + 1 >= 3 THEN 'oculto' ELSE status END
    WHERE id = ${comentarioId}
  `);
  res.json({ ok: true });
});

// ── DELETE /api/comentarios/:id (admin) ───────────────────────────────────────
router.delete("/comentarios/:id", requireAuth, async (req, res) => {
  const comentarioId = parseInt(String(req.params.id));
  const userId       = req.session.userId!;
  if (!isFinite(comentarioId)) { res.status(400).json({ error: "ID inválido" }); return; }

  // Allow own comment or admin token
  const adminUser = process.env.ADMIN_USER;
  const [user] = await db.select({ nome: usuariosTable.nome })
    .from(usuariosTable).where(eq(usuariosTable.id, userId)).limit(1);
  const isAdmin = user?.nome === adminUser;

  const [comment] = await db.select({ usuarioId: comentariosOfertaTable.usuarioId })
    .from(comentariosOfertaTable).where(eq(comentariosOfertaTable.id, comentarioId)).limit(1);
  if (!comment) { res.status(404).json({ error: "Comentário não encontrado." }); return; }

  if (!isAdmin && comment.usuarioId !== userId) {
    res.status(403).json({ error: "Sem permissão." }); return;
  }

  await db.update(comentariosOfertaTable)
    .set({ status: "removido" })
    .where(eq(comentariosOfertaTable.id, comentarioId));

  res.json({ ok: true });
});

export default router;
