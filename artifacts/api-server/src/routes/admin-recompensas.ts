// @ts-nocheck
/**
 * Admin Recompensas routes — all protected by requireAdminToken.
 * Handles: sorteios CRUD, draw winners, coupon audit, points adjustment,
 * mission config, ranking, and admin audit log.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import {
  db,
  sorteiosTable,
  sorteioParticipantesTable,
  sorteioGanhadoresTable,
  usuariosTable,
  cuponsHistoricoTable,
  missoesDiariasTable,
  adminLogsTable,
  missoesConfigTable,
  missoesCampanhasTable,
  recompensasCatalogoTable,
  ofertasTable,
} from "@workspace/db";
import { eq, sql, desc, and, gte, lte, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { logger } from "../lib/logger";

const router = Router();

const ADMIN_TOKEN = process.env["ADMIN_TOKEN"] ?? "changeme-admin-token";

// ── Auth middleware ───────────────────────────────────────────────────────────
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

router.use(/^\/admin\/recompensas/, requireAdminToken);

// ── Audit log helper ──────────────────────────────────────────────────────────
async function auditLog(params: {
  adminNome?: string;
  acao: string;
  usuarioAfetadoId?: number | null;
  usuarioAfetadoNome?: string | null;
  detalhes?: object | null;
  motivo?: string | null;
}) {
  try {
    await db.insert(adminLogsTable).values({
      adminNome: params.adminNome ?? "Admin",
      acao: params.acao,
      usuarioAfetadoId: params.usuarioAfetadoId ?? null,
      usuarioAfetadoNome: params.usuarioAfetadoNome ?? null,
      detalhes: params.detalhes ? JSON.stringify(params.detalhes) : null,
      motivo: params.motivo ?? null,
    });
  } catch (err) {
    logger.error({ err }, "auditLog insert failed");
  }
}

// ── GET /api/admin/recompensas/sorteios ──────────────────────────────────────
router.get("/admin/recompensas/sorteios", async (_req, res) => {
  const sorteios = await db
    .select()
    .from(sorteiosTable)
    .orderBy(desc(sorteiosTable.criadoEm));

  const result = await Promise.all(
    sorteios.map(async (s) => {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(sorteioParticipantesTable)
        .where(eq(sorteioParticipantesTable.sorteioId, s.id));

      const [ganhador] = await db
        .select()
        .from(sorteioGanhadoresTable)
        .where(eq(sorteioGanhadoresTable.sorteioId, s.id))
        .orderBy(desc(sorteioGanhadoresTable.dataSorteio))
        .limit(1);

      return {
        ...s,
        dataFim: s.dataFim.toISOString(),
        criadoEm: s.criadoEm.toISOString(),
        participantesCount: count ?? 0,
        ganhador: ganhador
          ? { nome: ganhador.nomeUsuario, dataSorteio: ganhador.dataSorteio.toISOString() }
          : null,
      };
    }),
  );

  res.json(result);
});

// ── POST /api/admin/recompensas/sorteios ─────────────────────────────────────
router.post("/admin/recompensas/sorteios", async (req, res) => {
  const schema = z.object({
    premio: z.string().min(1),
    descricao: z.string().optional(),
    dataFim: z.string(),
    status: z.enum(["ativo", "encerrado", "cancelado"]).default("ativo"),
  });

  const body = schema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Dados inválidos", details: body.error.flatten() });
    return;
  }

  const ativo = body.data.status === "ativo";
  const [sorteio] = await db
    .insert(sorteiosTable)
    .values({
      premio: body.data.premio,
      descricao: body.data.descricao ?? null,
      dataFim: new Date(body.data.dataFim),
      ativo,
      status: body.data.status,
    })
    .returning();

  await auditLog({
    acao: "criar_sorteio",
    detalhes: { sorteioId: sorteio!.id, premio: body.data.premio, status: body.data.status },
  });

  res.json({ ...sorteio, dataFim: sorteio!.dataFim.toISOString(), criadoEm: sorteio!.criadoEm.toISOString() });
});

// ── PATCH /api/admin/recompensas/sorteios/:id/status ─────────────────────────
router.patch("/admin/recompensas/sorteios/:id/status", async (req, res) => {
  const id = Number(req.params["id"]);
  if (!id) { res.status(400).json({ error: "ID inválido" }); return; }

  const { status } = req.body as { status?: string };
  if (!["ativo", "encerrado", "cancelado"].includes(status ?? "")) {
    res.status(400).json({ error: "Status inválido: ativo | encerrado | cancelado" });
    return;
  }

  const ativo = status === "ativo";
  const [updated] = await db
    .update(sorteiosTable)
    .set({ status: status as "ativo" | "encerrado" | "cancelado", ativo })
    .where(eq(sorteiosTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Sorteio não encontrado" }); return; }

  await auditLog({
    acao: "alterar_status_sorteio",
    detalhes: { sorteioId: id, status, premio: updated.premio },
  });

  res.json({ ok: true, status: updated.status });
});

// ── GET /api/admin/recompensas/sorteios/:id/participantes ────────────────────
router.get("/admin/recompensas/sorteios/:id/participantes", async (req, res) => {
  const id = Number(req.params["id"]);
  if (!id) { res.status(400).json({ error: "ID inválido" }); return; }

  const rows = await db
    .select({
      id: sorteioParticipantesTable.id,
      usuarioId: sorteioParticipantesTable.usuarioId,
      cuponsUsados: sorteioParticipantesTable.cuponsUsados,
      criadoEm: sorteioParticipantesTable.criadoEm,
      nome: usuariosTable.nome,
      pontos: usuariosTable.pontos,
      bloqueado: usuariosTable.bloqueado,
    })
    .from(sorteioParticipantesTable)
    .innerJoin(usuariosTable, eq(sorteioParticipantesTable.usuarioId, usuariosTable.id))
    .where(eq(sorteioParticipantesTable.sorteioId, id))
    .orderBy(desc(sorteioParticipantesTable.cuponsUsados));

  res.json(rows.map((r) => ({ ...r, criadoEm: r.criadoEm.toISOString() })));
});

// ── POST /api/admin/recompensas/sorteios/:id/sortear ─────────────────────────
router.post("/admin/recompensas/sorteios/:id/sortear", async (req, res) => {
  const id = Number(req.params["id"]);
  if (!id) { res.status(400).json({ error: "ID inválido" }); return; }

  const { confirmar, motivo } = req.body as { confirmar?: boolean; motivo?: string };

  const [sorteio] = await db
    .select()
    .from(sorteiosTable)
    .where(eq(sorteiosTable.id, id))
    .limit(1);
  if (!sorteio) { res.status(404).json({ error: "Sorteio não encontrado" }); return; }

  // Check existing winner
  const [existingWinner] = await db
    .select()
    .from(sorteioGanhadoresTable)
    .where(eq(sorteioGanhadoresTable.sorteioId, id))
    .orderBy(desc(sorteioGanhadoresTable.dataSorteio))
    .limit(1);

  if (existingWinner && !confirmar) {
    res.status(409).json({
      error: "Este sorteio já possui um ganhador. Envie confirmar=true para sortear novamente.",
      ganhadorExistente: existingWinner.nomeUsuario,
      dataSorteioAnterior: existingWinner.dataSorteio.toISOString(),
    });
    return;
  }

  // Load participants
  const participantes = await db
    .select({
      usuarioId: sorteioParticipantesTable.usuarioId,
      cuponsUsados: sorteioParticipantesTable.cuponsUsados,
      nome: usuariosTable.nome,
      bloqueado: usuariosTable.bloqueado,
    })
    .from(sorteioParticipantesTable)
    .innerJoin(usuariosTable, eq(sorteioParticipantesTable.usuarioId, usuariosTable.id))
    .where(eq(sorteioParticipantesTable.sorteioId, id));

  const elegiveis = participantes.filter((p) => !p.bloqueado);
  if (elegiveis.length === 0) {
    res.status(400).json({ error: "Nenhum participante elegível para o sorteio." });
    return;
  }

  // Weighted random — each cupom = 1 ticket
  const tickets: (typeof elegiveis)[number][] = [];
  for (const p of elegiveis) {
    for (let i = 0; i < p.cuponsUsados; i++) tickets.push(p);
  }
  const winner = tickets[Math.floor(Math.random() * tickets.length)]!;

  const [ganhador] = await db
    .insert(sorteioGanhadoresTable)
    .values({
      sorteioId: id,
      usuarioId: winner.usuarioId,
      nomeUsuario: winner.nome,
      premio: sorteio.premio,
    })
    .returning();

  // Close the lottery
  await db
    .update(sorteiosTable)
    .set({ status: "encerrado", ativo: false })
    .where(eq(sorteiosTable.id, id));

  await auditLog({
    acao: "sortear_vencedor",
    usuarioAfetadoId: winner.usuarioId,
    usuarioAfetadoNome: winner.nome,
    motivo: motivo ?? null,
    detalhes: {
      sorteioId: id,
      premio: sorteio.premio,
      totalParticipantes: participantes.length,
      totalElegiveis: elegiveis.length,
      totalTickets: tickets.length,
    },
  });

  res.json({
    ganhador: { nome: winner.nome, usuarioId: winner.usuarioId },
    premio: sorteio.premio,
    dataSorteio: ganhador!.dataSorteio.toISOString(),
  });
});

// ── GET /api/admin/recompensas/cupons ─────────────────────────────────────────
router.get("/admin/recompensas/cupons", async (req, res) => {
  const limit = Math.min(Number(req.query["limit"]) || 100, 500);
  const tipo = req.query["tipo"] as string | undefined;
  const apenasRecentes = req.query["recentes"] === "1";

  type CupomTipo = "publicacao" | "confirmacao" | "bonus_dia" | "compartilhamento" | "convite" | "missao" | "missao_compartilhar" | "sorteio";
  const conditions: ReturnType<typeof eq>[] = [];
  if (tipo) conditions.push(eq(cuponsHistoricoTable.tipo, tipo as CupomTipo));
  if (apenasRecentes) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    conditions.push(gte(cuponsHistoricoTable.criadoEm, sevenDaysAgo));
  }

  const rows = await db
    .select({
      id: cuponsHistoricoTable.id,
      usuarioId: cuponsHistoricoTable.usuarioId,
      delta: cuponsHistoricoTable.delta,
      tipo: cuponsHistoricoTable.tipo,
      referenciaId: cuponsHistoricoTable.referenciaId,
      criadoEm: cuponsHistoricoTable.criadoEm,
      nomeUsuario: usuariosTable.nome,
    })
    .from(cuponsHistoricoTable)
    .innerJoin(usuariosTable, eq(cuponsHistoricoTable.usuarioId, usuariosTable.id))
    .where(conditions.length > 0 ? and(...(conditions as [ReturnType<typeof eq>])) : undefined)
    .orderBy(desc(cuponsHistoricoTable.criadoEm))
    .limit(limit);

  res.json(rows.map((r) => ({ ...r, criadoEm: r.criadoEm.toISOString() })));
});

// ── DELETE /api/admin/recompensas/cupons/:id ─────────────────────────────────
router.delete("/admin/recompensas/cupons/:id", async (req, res) => {
  const id = Number(req.params["id"]);
  if (!id) { res.status(400).json({ error: "ID inválido" }); return; }

  const { motivo } = req.body as { motivo?: string };

  const [cupom] = await db
    .select({
      id: cuponsHistoricoTable.id,
      usuarioId: cuponsHistoricoTable.usuarioId,
      delta: cuponsHistoricoTable.delta,
      tipo: cuponsHistoricoTable.tipo,
      nome: usuariosTable.nome,
    })
    .from(cuponsHistoricoTable)
    .innerJoin(usuariosTable, eq(cuponsHistoricoTable.usuarioId, usuariosTable.id))
    .where(eq(cuponsHistoricoTable.id, id))
    .limit(1);

  if (!cupom) { res.status(404).json({ error: "Transação não encontrada" }); return; }

  // Compensating entry (reversal) — preserves audit trail
  await db.insert(cuponsHistoricoTable).values({
    usuarioId: cupom.usuarioId,
    delta: -cupom.delta,
    tipo: "sorteio",
    referenciaId: id,
  });

  await auditLog({
    acao: "remover_cupom",
    usuarioAfetadoId: cupom.usuarioId,
    usuarioAfetadoNome: cupom.nome,
    motivo: motivo ?? "Cupom suspeito removido pelo admin",
    detalhes: { cupomId: id, tipo: cupom.tipo, delta: cupom.delta },
  });

  res.json({ ok: true });
});

// ── POST /api/admin/recompensas/usuarios/:id/ajustar-pontos ──────────────────
router.post("/admin/recompensas/usuarios/:id/ajustar-pontos", async (req, res) => {
  const id = Number(req.params["id"]);
  if (!id) { res.status(400).json({ error: "ID inválido" }); return; }

  const schema = z.object({
    delta: z.number().int(),
    motivo: z.string().min(3),
  });
  const body = schema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Dados inválidos: delta (int) e motivo (string) obrigatórios" }); return; }

  const [user] = await db
    .select()
    .from(usuariosTable)
    .where(eq(usuariosTable.id, id))
    .limit(1);
  if (!user) { res.status(404).json({ error: "Usuário não encontrado" }); return; }

  const novoPontos = Math.max(0, user.pontos + body.data.delta);
  await db.update(usuariosTable).set({ pontos: novoPontos }).where(eq(usuariosTable.id, id));

  await auditLog({
    acao: "ajustar_pontos",
    usuarioAfetadoId: id,
    usuarioAfetadoNome: user.nome,
    motivo: body.data.motivo,
    detalhes: { delta: body.data.delta, pontosBefore: user.pontos, pontosAfter: novoPontos },
  });

  res.json({ ok: true, pontosAnteriores: user.pontos, pontosAtuais: novoPontos });
});

// ── GET /api/admin/recompensas/missoes ────────────────────────────────────────
router.get("/admin/recompensas/missoes", async (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);

  const configs = await db.select().from(missoesConfigTable).orderBy(missoesConfigTable.tipo);

  const stats = await db
    .select({
      tipo: missoesDiariasTable.tipo,
      total: sql<number>`count(*)::int`,
      concluidas: sql<number>`count(*) filter (where concluida = true)::int`,
    })
    .from(missoesDiariasTable)
    .where(eq(missoesDiariasTable.data, today))
    .groupBy(missoesDiariasTable.tipo);

  const statsMap = Object.fromEntries(stats.map((s) => [s.tipo, s]));

  res.json(
    configs.map((c) => ({
      ...c,
      atualizadoEm: c.atualizadoEm.toISOString(),
      ativosHoje: statsMap[c.tipo]?.total ?? 0,
      concluidasHoje: statsMap[c.tipo]?.concluidas ?? 0,
    })),
  );
});

// ── PATCH /api/admin/recompensas/missoes/:tipo ────────────────────────────────
router.patch("/admin/recompensas/missoes/:tipo", async (req, res) => {
  const tipo = req.params["tipo"] ?? "";

  const schema = z.object({
    ativo: z.boolean().optional(),
    premioPontos: z.number().int().min(0).optional(),
    premioCupons: z.number().int().min(0).optional(),
    missaoDoDia: z.boolean().optional(),
    descricao: z.string().min(1).optional(),
    meta: z.number().int().min(1).optional(),
  });
  const body = schema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Dados inválidos" }); return; }

  const [existing] = await db
    .select()
    .from(missoesConfigTable)
    .where(eq(missoesConfigTable.tipo, tipo))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Missão não encontrada" }); return; }

  const updates: Record<string, unknown> = { atualizadoEm: new Date() };
  if (body.data.ativo !== undefined) updates["ativo"] = body.data.ativo;
  if (body.data.premioPontos !== undefined) updates["premioPontos"] = body.data.premioPontos;
  if (body.data.premioCupons !== undefined) updates["premioCupons"] = body.data.premioCupons;
  if (body.data.missaoDoDia !== undefined) updates["missaoDoDia"] = body.data.missaoDoDia;
  if (body.data.descricao !== undefined) updates["descricao"] = body.data.descricao;
  if (body.data.meta !== undefined) updates["meta"] = body.data.meta;

  await db.update(missoesConfigTable).set(updates).where(eq(missoesConfigTable.tipo, tipo));

  await auditLog({
    acao: "editar_missao",
    detalhes: { tipo, mudancas: body.data },
  });

  res.json({ ok: true });
});

// ── GET /api/admin/recompensas/ranking ────────────────────────────────────────
router.get("/admin/recompensas/ranking", async (_req, res) => {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      id: usuariosTable.id,
      nome: usuariosTable.nome,
      pontos: usuariosTable.pontos,
      bloqueado: usuariosTable.bloqueado,
      totalOfertas: sql<number>`count(distinct ${ofertasTable.id})::int`,
      cupons7d: sql<number>`coalesce(sum(${cuponsHistoricoTable.delta}) filter (where ${cuponsHistoricoTable.criadoEm} >= ${sevenDaysAgo} and ${cuponsHistoricoTable.delta} > 0), 0)::int`,
      saldoCupons: sql<number>`coalesce(sum(${cuponsHistoricoTable.delta}), 0)::int`,
    })
    .from(usuariosTable)
    .leftJoin(ofertasTable, eq(ofertasTable.usuarioId, usuariosTable.id))
    .leftJoin(cuponsHistoricoTable, eq(cuponsHistoricoTable.usuarioId, usuariosTable.id))
    .groupBy(usuariosTable.id)
    .orderBy(desc(sql`coalesce(sum(${cuponsHistoricoTable.delta}), 0)`))
    .limit(50);

  res.json(
    rows.map((r) => ({
      ...r,
      suspeito: r.cupons7d > 15 && r.totalOfertas < 3,
    })),
  );
});

// ── GET /api/admin/recompensas/logs ───────────────────────────────────────────
router.get("/admin/recompensas/logs", async (req, res) => {
  const limit = Math.min(Number(req.query["limit"]) || 100, 500);

  const rows = await db
    .select()
    .from(adminLogsTable)
    .orderBy(desc(adminLogsTable.criadoEm))
    .limit(limit);

  res.json(rows.map((r) => ({ ...r, criadoEm: r.criadoEm.toISOString() })));
});

// ══════════════════════════════════════════════════════════════════════════════
// CAMPANHAS DE MISSÕES — CRUD
// ══════════════════════════════════════════════════════════════════════════════

function serializeCampanha(c: typeof missoesCampanhasTable.$inferSelect) {
  return {
    ...c,
    dataInicio: c.dataInicio.toISOString(),
    dataFim: c.dataFim?.toISOString() ?? null,
    criadoEm: c.criadoEm.toISOString(),
  };
}

// ── GET /api/admin/recompensas/campanhas ─────────────────────────────────────
router.get("/admin/recompensas/campanhas", async (_req, res) => {
  const rows = await db
    .select()
    .from(missoesCampanhasTable)
    .orderBy(desc(missoesCampanhasTable.criadoEm));
  res.json(rows.map(serializeCampanha));
});

// ── POST /api/admin/recompensas/campanhas ────────────────────────────────────
router.post("/admin/recompensas/campanhas", async (req, res) => {
  const schema = z.object({
    titulo:            z.string().min(1).max(100),
    descricao:         z.string().optional(),
    periocidade:       z.enum(["diaria", "semanal", "mensal", "temporaria", "especial", "sazonal"]).default("diaria"),
    tipoAcao:          z.enum(["publicar", "confirmar", "publicar_categoria", "publicar_mercado", "compartilhar", "qualquer"]).default("publicar"),
    meta:              z.number().int().min(1).default(1),
    categoriaAlvo:     z.string().optional(),
    mercadoAlvo:       z.string().optional(),
    premioPontos:      z.number().int().min(0).default(10),
    premioCupons:      z.number().int().min(0).default(1),
    multiplicadorPontos: z.number().min(0.1).max(10).default(1),
    limitePorUsuario:  z.number().int().min(1).default(1),
    badge:             z.string().default("🎯"),
    dataInicio:        z.string().default(new Date().toISOString()),
    dataFim:           z.string().optional(),
    ativo:             z.boolean().default(true),
  });

  const body = schema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Dados inválidos", details: body.error.flatten() }); return; }

  const { dataInicio, dataFim, ...rest } = body.data;

  const [row] = await db.insert(missoesCampanhasTable).values({
    ...rest,
    dataInicio: new Date(dataInicio),
    dataFim: dataFim ? new Date(dataFim) : null,
  }).returning();

  await auditLog({ acao: "criar_campanha", detalhes: { id: row!.id, titulo: row!.titulo } });

  res.json(serializeCampanha(row!));
});

// ── PATCH /api/admin/recompensas/campanhas/:id ───────────────────────────────
router.patch("/admin/recompensas/campanhas/:id", async (req, res) => {
  const id = Number(req.params["id"]);
  if (!id) { res.status(400).json({ error: "ID inválido" }); return; }

  const schema = z.object({
    titulo:            z.string().min(1).max(100).optional(),
    descricao:         z.string().optional(),
    periocidade:       z.enum(["diaria", "semanal", "mensal", "temporaria", "especial", "sazonal"]).optional(),
    tipoAcao:          z.enum(["publicar", "confirmar", "publicar_categoria", "publicar_mercado", "compartilhar", "qualquer"]).optional(),
    meta:              z.number().int().min(1).optional(),
    categoriaAlvo:     z.string().nullable().optional(),
    mercadoAlvo:       z.string().nullable().optional(),
    premioPontos:      z.number().int().min(0).optional(),
    premioCupons:      z.number().int().min(0).optional(),
    multiplicadorPontos: z.number().min(0.1).max(10).optional(),
    limitePorUsuario:  z.number().int().min(1).optional(),
    badge:             z.string().optional(),
    dataInicio:        z.string().optional(),
    dataFim:           z.string().nullable().optional(),
    ativo:             z.boolean().optional(),
  });

  const body = schema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Dados inválidos" }); return; }

  const updates: Record<string, unknown> = { ...body.data };
  if (body.data.dataInicio) updates["dataInicio"] = new Date(body.data.dataInicio);
  if (body.data.dataFim !== undefined) updates["dataFim"] = body.data.dataFim ? new Date(body.data.dataFim) : null;

  const [row] = await db.update(missoesCampanhasTable).set(updates).where(eq(missoesCampanhasTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Campanha não encontrada" }); return; }

  await auditLog({ acao: "editar_campanha", detalhes: { id, mudancas: body.data } });

  res.json(serializeCampanha(row));
});

// ── DELETE /api/admin/recompensas/campanhas/:id ──────────────────────────────
router.delete("/admin/recompensas/campanhas/:id", async (req, res) => {
  const id = Number(req.params["id"]);
  if (!id) { res.status(400).json({ error: "ID inválido" }); return; }

  const [deleted] = await db.delete(missoesCampanhasTable).where(eq(missoesCampanhasTable.id, id)).returning();
  if (!deleted) { res.status(404).json({ error: "Campanha não encontrada" }); return; }

  await auditLog({ acao: "excluir_campanha", detalhes: { id, titulo: deleted.titulo } });

  res.json({ ok: true });
});

// ══════════════════════════════════════════════════════════════════════════════
// CATÁLOGO DE RECOMPENSAS — CRUD
// ══════════════════════════════════════════════════════════════════════════════

function serializeCatalogo(c: typeof recompensasCatalogoTable.$inferSelect) {
  return {
    ...c,
    validade: c.validade?.toISOString() ?? null,
    criadoEm: c.criadoEm.toISOString(),
  };
}

// ── GET /api/admin/recompensas/catalogo ──────────────────────────────────────
router.get("/admin/recompensas/catalogo", async (_req, res) => {
  const rows = await db
    .select()
    .from(recompensasCatalogoTable)
    .orderBy(desc(recompensasCatalogoTable.criadoEm));
  res.json(rows.map(serializeCatalogo));
});

// ── POST /api/admin/recompensas/catalogo ─────────────────────────────────────
router.post("/admin/recompensas/catalogo", async (req, res) => {
  const schema = z.object({
    nome:                 z.string().min(1).max(100),
    descricao:            z.string().optional(),
    tipo:                 z.enum(["recompensa", "cupom", "bonus", "premiacao"]).default("recompensa"),
    custoPontos:          z.number().int().min(0).default(100),
    quantidadeDisponivel: z.number().int().min(1).optional(),
    validade:             z.string().optional(),
    imagemUrl:            z.string().url().optional(),
    status:               z.enum(["ativo", "inativo", "esgotado"]).default("ativo"),
  });

  const body = schema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Dados inválidos", details: body.error.flatten() }); return; }

  const { validade, ...rest } = body.data;

  const [row] = await db.insert(recompensasCatalogoTable).values({
    ...rest,
    validade: validade ? new Date(validade) : null,
  }).returning();

  await auditLog({ acao: "criar_recompensa_catalogo", detalhes: { id: row!.id, nome: row!.nome } });

  res.json(serializeCatalogo(row!));
});

// ── PATCH /api/admin/recompensas/catalogo/:id ────────────────────────────────
router.patch("/admin/recompensas/catalogo/:id", async (req, res) => {
  const id = Number(req.params["id"]);
  if (!id) { res.status(400).json({ error: "ID inválido" }); return; }

  const schema = z.object({
    nome:                 z.string().min(1).max(100).optional(),
    descricao:            z.string().nullable().optional(),
    tipo:                 z.enum(["recompensa", "cupom", "bonus", "premiacao"]).optional(),
    custoPontos:          z.number().int().min(0).optional(),
    quantidadeDisponivel: z.number().int().min(1).nullable().optional(),
    validade:             z.string().nullable().optional(),
    imagemUrl:            z.string().nullable().optional(),
    status:               z.enum(["ativo", "inativo", "esgotado"]).optional(),
  });

  const body = schema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Dados inválidos" }); return; }

  const updates: Record<string, unknown> = { ...body.data };
  if (body.data.validade !== undefined) updates["validade"] = body.data.validade ? new Date(body.data.validade) : null;

  const [row] = await db.update(recompensasCatalogoTable).set(updates).where(eq(recompensasCatalogoTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Recompensa não encontrada" }); return; }

  res.json(serializeCatalogo(row));
});

// ── DELETE /api/admin/recompensas/catalogo/:id ───────────────────────────────
router.delete("/admin/recompensas/catalogo/:id", async (req, res) => {
  const id = Number(req.params["id"]);
  if (!id) { res.status(400).json({ error: "ID inválido" }); return; }

  const [deleted] = await db.delete(recompensasCatalogoTable).where(eq(recompensasCatalogoTable.id, id)).returning();
  if (!deleted) { res.status(404).json({ error: "Recompensa não encontrada" }); return; }

  await auditLog({ acao: "excluir_recompensa_catalogo", detalhes: { id, nome: deleted.nome } });

  res.json({ ok: true });
});

// ══════════════════════════════════════════════════════════════════════════════
// DASHBOARD STATS — Parte 3
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /api/admin/recompensas/dashboard ─────────────────────────────────────
router.get("/admin/recompensas/dashboard", async (_req, res) => {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const seteDiasAtras = new Date(Date.now() - 7 * 24 * 3_600_000);
  const trintaDiasAtras = new Date(Date.now() - 30 * 24 * 3_600_000);

  const [
    totalCampanhasAtivas,
    totalSorteiosAtivos,
    totalRecompensasAtivas,
    pontosDistribuidos7d,
    cuponsEmitidos7d,
    missoesConcluidas,
    usuariosAtivos7d,
    topMissoesConcluidaHoje,
    topUsuariosAtivos,
  ] = await Promise.all([
    // Campanhas ativas (data_fim nula ou no futuro)
    db.select({ count: sql<number>`count(*)::int` })
      .from(missoesCampanhasTable)
      .where(and(
        eq(missoesCampanhasTable.ativo, true),
        or(isNull(missoesCampanhasTable.dataFim), gte(missoesCampanhasTable.dataFim, now)),
      )),

    // Sorteios ativos
    db.select({ count: sql<number>`count(*)::int` })
      .from(sorteiosTable)
      .where(eq(sorteiosTable.ativo, true)),

    // Recompensas ativas no catálogo
    db.select({ count: sql<number>`count(*)::int` })
      .from(recompensasCatalogoTable)
      .where(eq(recompensasCatalogoTable.status, "ativo")),

    // Pontos distribuídos últimos 7 dias (via cupons, estimativa: delta positivo * custo médio)
    db.select({ total: sql<number>`coalesce(sum(${cuponsHistoricoTable.delta}) filter (where ${cuponsHistoricoTable.delta} > 0), 0)::int` })
      .from(cuponsHistoricoTable)
      .where(gte(cuponsHistoricoTable.criadoEm, seteDiasAtras)),

    // Cupons emitidos 7 dias
    db.select({ total: sql<number>`coalesce(sum(${cuponsHistoricoTable.delta}) filter (where ${cuponsHistoricoTable.delta} > 0), 0)::int` })
      .from(cuponsHistoricoTable)
      .where(gte(cuponsHistoricoTable.criadoEm, seteDiasAtras)),

    // Total de missões concluídas hoje
    db.select({ total: sql<number>`count(*)::int` })
      .from(missoesDiariasTable)
      .where(and(eq(missoesDiariasTable.data, today), eq(missoesDiariasTable.concluida, true))),

    // Usuários únicos ativos em 7 dias (publicaram ou confirmaram)
    db.select({ total: sql<number>`count(distinct ${ofertasTable.usuarioId})::int` })
      .from(ofertasTable)
      .where(gte(ofertasTable.dataCriacao, seteDiasAtras)),

    // Top 5 missões mais concluídas hoje
    db.select({
      tipo: missoesDiariasTable.tipo,
      concluidas: sql<number>`count(*) filter (where concluida = true)::int`,
      total: sql<number>`count(*)::int`,
    })
      .from(missoesDiariasTable)
      .where(eq(missoesDiariasTable.data, today))
      .groupBy(missoesDiariasTable.tipo)
      .orderBy(sql`count(*) filter (where concluida = true) desc`)
      .limit(5),

    // Top 5 usuários mais ativos (30 dias por pontos)
    db.select({
      id: usuariosTable.id,
      nome: usuariosTable.nome,
      pontos: usuariosTable.pontos,
      totalOfertas: sql<number>`count(distinct ${ofertasTable.id})::int`,
      cupons7d: sql<number>`coalesce(sum(${cuponsHistoricoTable.delta}) filter (where ${cuponsHistoricoTable.criadoEm} >= ${seteDiasAtras} and ${cuponsHistoricoTable.delta} > 0), 0)::int`,
    })
      .from(usuariosTable)
      .leftJoin(ofertasTable, and(
        eq(ofertasTable.usuarioId, usuariosTable.id),
        gte(ofertasTable.dataCriacao, trintaDiasAtras),
      ))
      .leftJoin(cuponsHistoricoTable, eq(cuponsHistoricoTable.usuarioId, usuariosTable.id))
      .where(eq(usuariosTable.bloqueado, false))
      .groupBy(usuariosTable.id)
      .orderBy(desc(usuariosTable.pontos))
      .limit(5),
  ]);

  res.json({
    totalCampanhasAtivas: totalCampanhasAtivas[0]?.count ?? 0,
    totalSorteiosAtivos: totalSorteiosAtivos[0]?.count ?? 0,
    totalRecompensasAtivas: totalRecompensasAtivas[0]?.count ?? 0,
    pontosDistribuidos7d: pontosDistribuidos7d[0]?.total ?? 0,
    cuponsEmitidos7d: cuponsEmitidos7d[0]?.total ?? 0,
    missoesConcluidasHoje: missoesConcluidas[0]?.total ?? 0,
    usuariosAtivos7d: usuariosAtivos7d[0]?.total ?? 0,
    topMissoesConcluidaHoje,
    topUsuariosAtivos,
  });
});

export default router;
