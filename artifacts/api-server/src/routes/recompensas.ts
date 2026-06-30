// @ts-nocheck
import { Router } from "express";
import {
  db,
  usuariosTable,
  ofertasTable,
  cuponsHistoricoTable,
  missoesDiariasTable,
  conquistasUsuarioTable,
  sorteiosTable,
  sorteioParticipantesTable,
  sorteioGanhadoresTable,
  offerConfirmationsTable,
} from "@workspace/db";
import { eq, sql, and, desc, gte } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { getMissoesDoDia, registrarProgressoMissao } from "../lib/missoes";
import { getUserCuponsBalance, spendCupons, awardCupom, getTotalCuponsGanhos } from "../lib/cupons";

const router = Router();

// ── Rewards-specific level system ─────────────────────────────────────────────
function getNivelRecompensas(pontos: number): {
  label: string;
  emoji: string;
  min: number;
  max: number | null;
} {
  if (pontos >= 2000) return { label: "Lenda do AíCompensa", emoji: "💎", min: 2000, max: null };
  if (pontos >= 501)  return { label: "Mestre da Economia",  emoji: "🥇", min: 501,  max: 2000 };
  if (pontos >= 101)  return { label: "Caçador de Ofertas",  emoji: "🥈", min: 101,  max: 501  };
  return                     { label: "Econômico Iniciante", emoji: "🥉", min: 0,    max: 101  };
}

// ── Achievement definitions ───────────────────────────────────────────────────
type UserStats = {
  totalOfertas: number;
  ofertasCarnes: number;
  ofertasLaticinios: number;
  ofertasHortifruti: number;
  mercadosDiversos: number;
  maxCurtidas: number;
  totalConfirmacoes: number;
  pontos: number;
  streak: number;
};

const CONQUISTAS_DEF = [
  {
    key: "primeira_oferta",
    emoji: "🌟",
    nome: "Primeira Oferta",
    descricao: "Publicou sua primeira oferta",
    check: (s: UserStats) => s.totalOfertas >= 1,
  },
  {
    key: "mestre_carnes",
    emoji: "🥩",
    nome: "Mestre das Carnes",
    descricao: "Publicou 5+ ofertas de Carnes",
    check: (s: UserStats) => s.ofertasCarnes >= 5,
  },
  {
    key: "cacador_leite",
    emoji: "🥛",
    nome: "Caçador do Leite",
    descricao: "Publicou 3+ ofertas de Laticínios",
    check: (s: UserStats) => s.ofertasLaticinios >= 3,
  },
  {
    key: "explorador_mercados",
    emoji: "📍",
    nome: "Explorador de Mercados",
    descricao: "Publicou em 3+ mercados diferentes",
    check: (s: UserStats) => s.mercadosDiversos >= 3,
  },
  {
    key: "rei_economia",
    emoji: "💸",
    nome: "Rei da Economia",
    descricao: "Publicou 20+ ofertas ao total",
    check: (s: UserStats) => s.totalOfertas >= 20,
  },
  {
    key: "oferta_viral",
    emoji: "🔥",
    nome: "Oferta Viral",
    descricao: "Teve uma oferta com 10+ curtidas",
    check: (s: UserStats) => s.maxCurtidas >= 10,
  },
  {
    key: "sequencia_7",
    emoji: "⚡",
    nome: "7 Dias em Chama",
    descricao: "Fez login 7 dias seguidos",
    check: (s: UserStats) => s.streak >= 7,
  },
  {
    key: "confirmador",
    emoji: "✅",
    nome: "Confirmador Fiel",
    descricao: "Confirmou 10+ preços na comunidade",
    check: (s: UserStats) => s.totalConfirmacoes >= 10,
  },
  {
    key: "hortifruti_lover",
    emoji: "🥬",
    nome: "Hortifrúti Fan",
    descricao: "Publicou 5+ ofertas de Hortifruti",
    check: (s: UserStats) => s.ofertasHortifruti >= 5,
  },
  {
    key: "lenda",
    emoji: "🏆",
    nome: "Lenda do AíCompensa",
    descricao: "Atingiu 2000+ pontos",
    check: (s: UserStats) => s.pontos >= 2000,
  },
] as const;

type ConquistaKey = (typeof CONQUISTAS_DEF)[number]["key"];

// ── Helpers ───────────────────────────────────────────────────────────────────
async function getUserStats(userId: number): Promise<UserStats> {
  const [categoryRow] = await db
    .select({
      total: sql<number>`count(*)::int`,
      carnes: sql<number>`count(*) filter (where lower(${ofertasTable.categoria}) like '%carne%')::int`,
      laticinios: sql<number>`count(*) filter (where lower(${ofertasTable.categoria}) like '%laticin%')::int`,
      hortifruti: sql<number>`count(*) filter (where lower(${ofertasTable.categoria}) like '%horti%')::int`,
      mercados: sql<number>`count(distinct lower(${ofertasTable.mercado}))::int`,
      maxCurtidas: sql<number>`coalesce(max(${ofertasTable.curtidas}), 0)::int`,
    })
    .from(ofertasTable)
    .where(
      and(
        eq(ofertasTable.usuarioId, userId),
        sql`${ofertasTable.status} != 'recusada'`,
      ),
    );

  const [confirmRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(offerConfirmationsTable)
    .where(eq(offerConfirmationsTable.userId, userId));

  const [usuario] = await db
    .select({ pontos: usuariosTable.pontos, streak: usuariosTable.streak })
    .from(usuariosTable)
    .where(eq(usuariosTable.id, userId))
    .limit(1);

  return {
    totalOfertas: Number(categoryRow?.total ?? 0),
    ofertasCarnes: Number(categoryRow?.carnes ?? 0),
    ofertasLaticinios: Number(categoryRow?.laticinios ?? 0),
    ofertasHortifruti: Number(categoryRow?.hortifruti ?? 0),
    mercadosDiversos: Number(categoryRow?.mercados ?? 0),
    maxCurtidas: Number(categoryRow?.maxCurtidas ?? 0),
    totalConfirmacoes: Number(confirmRow?.count ?? 0),
    pontos: usuario?.pontos ?? 0,
    streak: usuario?.streak ?? 0,
  };
}

async function syncConquistas(userId: number, stats: UserStats): Promise<void> {
  const already = await db
    .select({ key: conquistasUsuarioTable.conquistaKey })
    .from(conquistasUsuarioTable)
    .where(eq(conquistasUsuarioTable.usuarioId, userId));
  const alreadyKeys = new Set(already.map((r) => r.key as ConquistaKey));

  for (const def of CONQUISTAS_DEF) {
    if (alreadyKeys.has(def.key)) continue;
    if (def.check(stats)) {
      await db
        .insert(conquistasUsuarioTable)
        .values({ usuarioId: userId, conquistaKey: def.key })
        .onConflictDoNothing();
    }
  }
}

// ── GET /api/recompensas/dashboard ───────────────────────────────────────────
router.get("/recompensas/dashboard", requireAuth, async (req, res) => {
  const userId = req.session.userId!;

  const [usuario] = await db
    .select()
    .from(usuariosTable)
    .where(eq(usuariosTable.id, userId))
    .limit(1);

  if (!usuario) {
    res.status(404).json({ error: "Usuário não encontrado." });
    return;
  }

  const [missoes, stats] = await Promise.all([
    getMissoesDoDia(userId),
    getUserStats(userId),
  ]);

  // Sync achievements in background
  syncConquistas(userId, stats).catch(() => {});

  const conquistasDesbloqueadas = await db
    .select()
    .from(conquistasUsuarioTable)
    .where(eq(conquistasUsuarioTable.usuarioId, userId));
  const conquistasKeys = new Set(conquistasDesbloqueadas.map((c) => c.conquistaKey));

  // Weekly ranking (top 10 by total pontos)
  const rankingRows = await db
    .select({
      usuarioId: usuariosTable.id,
      nome: usuariosTable.nome,
      pontos: usuariosTable.pontos,
      streak: usuariosTable.streak,
    })
    .from(usuariosTable)
    .where(eq(usuariosTable.bloqueado, false))
    .orderBy(desc(usuariosTable.pontos))
    .limit(10);

  // Count offers this week per ranking user for display
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const ofertasSemana = await db
    .select({
      usuarioId: ofertasTable.usuarioId,
      count: sql<number>`count(*)::int`,
    })
    .from(ofertasTable)
    .where(gte(ofertasTable.dataCriacao, weekAgo))
    .groupBy(ofertasTable.usuarioId);

  const ofertasMap = new Map(ofertasSemana.map((r) => [r.usuarioId, Number(r.count)]));

  // Active lottery
  const [sorteio] = await db
    .select()
    .from(sorteiosTable)
    .where(eq(sorteiosTable.ativo, true))
    .orderBy(desc(sorteiosTable.criadoEm))
    .limit(1);

  let sorteioData = null;
  if (sorteio) {
    const [partCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(sorteioParticipantesTable)
      .where(eq(sorteioParticipantesTable.sorteioId, sorteio.id));

    const [userPart] = await db
      .select()
      .from(sorteioParticipantesTable)
      .where(
        and(
          eq(sorteioParticipantesTable.sorteioId, sorteio.id),
          eq(sorteioParticipantesTable.usuarioId, userId),
        ),
      )
      .limit(1);

    sorteioData = {
      id: sorteio.id,
      premio: sorteio.premio,
      descricao: sorteio.descricao ?? null,
      dataFim: sorteio.dataFim.toISOString(),
      totalParticipantes: Number(partCount?.count ?? 0),
      jaParticipou: !!userPart,
      cuponsUsados: userPart?.cuponsUsados ?? 0,
    };
  }

  // Coupon balances — scoped to current raffle so each draw is a fresh slate
  const sorteioStartDate = sorteio?.criadoEm;
  const [cuponsAtivos, totalCuponsHistorico] = await Promise.all([
    getUserCuponsBalance(userId, sorteioStartDate),
    getTotalCuponsGanhos(userId),
  ]);

  // Past winners (last 5)
  const ganhadoresRows = await db
    .select({
      nomeUsuario: sorteioGanhadoresTable.nomeUsuario,
      premio: sorteioGanhadoresTable.premio,
      dataSorteio: sorteioGanhadoresTable.dataSorteio,
    })
    .from(sorteioGanhadoresTable)
    .orderBy(desc(sorteioGanhadoresTable.dataSorteio))
    .limit(5);

  const nivel = getNivelRecompensas(usuario.pontos);

  req.log.info({ userId, cuponsAtivos, totalCuponsHistorico, totalMissoes: missoes.length }, "recompensas dashboard");

  res.json({
    usuario: {
      id: usuario.id,
      nome: usuario.nome,
      pontos: usuario.pontos,
      cupons: cuponsAtivos,
      cuponsAtivos,
      totalCuponsHistorico,
      nivel: nivel.label,
      nivelEmoji: nivel.emoji,
      nivelMin: nivel.min,
      nivelMax: nivel.max,
      streak: usuario.streak ?? 0,
    },
    missoes: missoes.map((m) => ({
      id: m.id,
      tipo: m.tipo,
      descricao: m.descricao,
      meta: m.meta,
      progresso: m.progresso,
      concluida: m.concluida,
      premioPontos: m.premioPontos,
      premioCupons: m.premioCupons,
    })),
    sorteio: sorteioData,
    ganhadores: ganhadoresRows.map((g) => {
      const partes = g.nomeUsuario.split(" ");
      const nomeAbreviado =
        partes[0] +
        (partes[1] ? " " + partes[1][0] + "." : "");
      return {
        nome: nomeAbreviado,
        premio: g.premio,
        dataSorteio: g.dataSorteio.toISOString(),
      };
    }),
    rankingSemanal: rankingRows.map((r, i) => ({
      posicao: i + 1,
      nome: r.nome,
      pontos: r.pontos,
      streak: r.streak ?? 0,
      ofertasSemana: ofertasMap.get(r.usuarioId) ?? 0,
      isMe: r.usuarioId === userId,
    })),
    conquistas: CONQUISTAS_DEF.map((def) => ({
      key: def.key,
      emoji: def.emoji,
      nome: def.nome,
      descricao: def.descricao,
      desbloqueada: conquistasKeys.has(def.key),
    })),
  });
});

// ── POST /api/recompensas/sorteio/participar ──────────────────────────────────
router.post("/recompensas/sorteio/participar", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const { cuponsParticipacao } = req.body as { cuponsParticipacao?: unknown };
  const quantidade = Math.max(1, Math.min(10, Number(cuponsParticipacao ?? 1)));

  const [usuario] = await db
    .select({ bloqueado: usuariosTable.bloqueado })
    .from(usuariosTable)
    .where(eq(usuariosTable.id, userId))
    .limit(1);
  if (!usuario) { res.status(404).json({ error: "Usuário não encontrado." }); return; }
  if (usuario.bloqueado) { res.status(403).json({ error: "Conta bloqueada." }); return; }

  const [sorteio] = await db
    .select()
    .from(sorteiosTable)
    .where(eq(sorteiosTable.ativo, true))
    .orderBy(desc(sorteiosTable.criadoEm))
    .limit(1);

  if (!sorteio) {
    res.status(404).json({ error: "Nenhum sorteio ativo no momento." });
    return;
  }
  if (new Date() > sorteio.dataFim) {
    res.status(400).json({ error: "Este sorteio já encerrou." });
    return;
  }

  const [existing] = await db
    .select()
    .from(sorteioParticipantesTable)
    .where(
      and(
        eq(sorteioParticipantesTable.sorteioId, sorteio.id),
        eq(sorteioParticipantesTable.usuarioId, userId),
      ),
    )
    .limit(1);

  if (existing) {
    res.status(409).json({ error: "Você já está participando deste sorteio." });
    return;
  }

  const spent = await spendCupons(userId, quantidade, sorteio.id, sorteio.criadoEm);
  if (!spent) {
    res.status(400).json({
      error: `Cupons insuficientes. Você precisa de ${quantidade} cupom(s) ganhos neste sorteio.`,
    });
    return;
  }

  await db.insert(sorteioParticipantesTable).values({
    sorteioId: sorteio.id,
    usuarioId: userId,
    cuponsUsados: quantidade,
  });

  const [partCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(sorteioParticipantesTable)
    .where(eq(sorteioParticipantesTable.sorteioId, sorteio.id));

  const novoSaldo = await getUserCuponsBalance(userId, sorteio.criadoEm);

  req.log.info(
    { userId, sorteioId: sorteio.id, cuponsUsados: quantidade },
    "participação no sorteio registrada",
  );

  res.json({
    ok: true,
    mensagem: `Você está no sorteio! ${quantidade} cupom(s) usado(s). Boa sorte! 🍀`,
    cuponsRestantes: novoSaldo,
    totalParticipantes: Number(partCount?.count ?? 0),
  });
});

// ── POST /api/recompensas/missao/compartilhar ─────────────────────────────────
// Called when user shares an offer from the rewards page — records mission progress.
router.post("/recompensas/missao/compartilhar", requireAuth, async (req, res) => {
  const userId = req.session.userId!;

  const resultado = await registrarProgressoMissao(userId, "compartilhar");

  if (resultado.missoesConcluidas.length > 0) {
    await awardCupom(userId, "missao_compartilhar").catch(() => {});
  } else {
    await awardCupom(userId, "compartilhamento").catch(() => {});
  }

  req.log.info({ userId, resultado }, "missão compartilhar registrada");

  const cuponsAtual = await getUserCuponsBalance(userId);
  res.json({ ok: true, ...resultado, cuponsAtual });
});

// ── GET /api/recompensas/historico-cupons ─────────────────────────────────────
router.get("/recompensas/historico-cupons", requireAuth, async (req, res) => {
  const userId = req.session.userId!;

  const historico = await db
    .select({
      id: cuponsHistoricoTable.id,
      delta: cuponsHistoricoTable.delta,
      tipo: cuponsHistoricoTable.tipo,
      criadoEm: cuponsHistoricoTable.criadoEm,
    })
    .from(cuponsHistoricoTable)
    .where(eq(cuponsHistoricoTable.usuarioId, userId))
    .orderBy(desc(cuponsHistoricoTable.criadoEm))
    .limit(20);

  const [saldo, totalGanhos] = await Promise.all([
    getUserCuponsBalance(userId),
    getTotalCuponsGanhos(userId),
  ]);

  res.json({ saldo, totalGanhos, historico });
});

// ── GET /api/recompensas/historico-sorteios ───────────────────────────────────
router.get("/recompensas/historico-sorteios", requireAuth, async (req, res) => {
  const userId = req.session.userId!;

  const participacoes = await db
    .select({
      sorteioId: sorteioParticipantesTable.sorteioId,
      cuponsUsados: sorteioParticipantesTable.cuponsUsados,
      criadoEm: sorteioParticipantesTable.criadoEm,
      nome: sorteiosTable.nome,
      premio: sorteiosTable.premio,
      status: sorteiosTable.status,
      dataFim: sorteiosTable.dataFim,
    })
    .from(sorteioParticipantesTable)
    .innerJoin(sorteiosTable, eq(sorteioParticipantesTable.sorteioId, sorteiosTable.id))
    .where(eq(sorteioParticipantesTable.usuarioId, userId))
    .orderBy(desc(sorteiosTable.dataFim))
    .limit(20);

  const vitorias = await db
    .select({ sorteioId: sorteioGanhadoresTable.sorteioId })
    .from(sorteioGanhadoresTable)
    .where(eq(sorteioGanhadoresTable.usuarioId, userId));
  const ganhouIds = new Set(vitorias.map((v) => v.sorteioId));

  req.log.info({ userId, total: participacoes.length }, "historico-sorteios");

  res.json({
    historico: participacoes.map((p) => ({
      sorteioId: p.sorteioId,
      nome: p.nome || `Sorteio #${p.sorteioId}`,
      premio: p.premio,
      status: p.status,
      cuponsUsados: p.cuponsUsados,
      ganhou: ganhouIds.has(p.sorteioId),
      dataFim: p.dataFim.toISOString(),
      criadoEm: p.criadoEm.toISOString(),
    })),
  });
});

export default router;
