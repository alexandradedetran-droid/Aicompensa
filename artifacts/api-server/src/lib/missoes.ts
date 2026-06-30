// @ts-nocheck
import { db, missoesDiariasTable, usuariosTable, cuponsHistoricoTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

const MISSION_TEMPLATES = [
  { tipo: "publicar_oferta",    descricao: "Publique 1 oferta hoje",                meta: 1, premioPontos: 5, premioCupons: 1 },
  { tipo: "confirmar_preco",    descricao: "Confirme o preço de 2 ofertas",          meta: 2, premioPontos: 4, premioCupons: 1 },
  { tipo: "compartilhar",       descricao: "Compartilhe 1 oferta com amigos",        meta: 1, premioPontos: 3, premioCupons: 1 },
  { tipo: "publicar_carne",     descricao: "Publique uma oferta de Carnes",          meta: 1, premioPontos: 5, premioCupons: 2 },
  { tipo: "publicar_hortifruti",descricao: "Publique uma oferta de Hortifruti",      meta: 1, premioPontos: 5, premioCupons: 1 },
  { tipo: "publicar_laticinios",descricao: "Publique uma oferta de Laticínios",      meta: 1, premioPontos: 5, premioCupons: 1 },
  { tipo: "publicar_graos",     descricao: "Publique uma oferta de Grãos e Cereais", meta: 1, premioPontos: 5, premioCupons: 1 },
  { tipo: "publicar_bebidas",   descricao: "Publique uma oferta de Bebidas",         meta: 1, premioPontos: 4, premioCupons: 1 },
  { tipo: "publicar_limpeza",   descricao: "Publique uma oferta de Limpeza",         meta: 1, premioPontos: 4, premioCupons: 1 },
] as const;

type MissionTipo = (typeof MISSION_TEMPLATES)[number]["tipo"];

function getTodayString(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Select 3 missions deterministically based on date + userId so the same user always gets the same missions for a given day. */
function selectDailyMissions(date: string, userId: number): (typeof MISSION_TEMPLATES)[number][] {
  const seed = parseInt(date.replace(/-/g, ""), 10) + userId * 31;
  const result: (typeof MISSION_TEMPLATES)[number][] = [];
  const used = new Set<number>();

  for (let i = 0; result.length < 3; i++) {
    const idx = (seed + i * 7) % MISSION_TEMPLATES.length;
    if (!used.has(idx)) {
      used.add(idx);
      result.push(MISSION_TEMPLATES[idx]!);
    }
  }
  return result;
}

/** Get or generate today's missions for a user. */
export async function getMissoesDoDia(userId: number) {
  const today = getTodayString();

  const existing = await db
    .select()
    .from(missoesDiariasTable)
    .where(
      and(
        eq(missoesDiariasTable.usuarioId, userId),
        eq(missoesDiariasTable.data, today),
      ),
    );

  if (existing.length >= 3) return existing;

  const templates = selectDailyMissions(today, userId);
  await db
    .insert(missoesDiariasTable)
    .values(
      templates.map((t) => ({
        usuarioId: userId,
        data: today,
        tipo: t.tipo,
        descricao: t.descricao,
        meta: t.meta,
        progresso: 0,
        concluida: false,
        premioPontos: t.premioPontos,
        premioCupons: t.premioCupons,
      })),
    )
    .onConflictDoNothing();

  return db
    .select()
    .from(missoesDiariasTable)
    .where(
      and(
        eq(missoesDiariasTable.usuarioId, userId),
        eq(missoesDiariasTable.data, today),
      ),
    );
}

export type AcaoMissao =
  | "publicar_oferta"
  | "confirmar_preco"
  | "compartilhar"
  | { tipo: "publicar_categoria"; categoria: string };

function mapAcaoToTipos(acao: AcaoMissao): MissionTipo[] {
  if (acao === "publicar_oferta") return ["publicar_oferta"];
  if (acao === "confirmar_preco") return ["confirmar_preco"];
  if (acao === "compartilhar") return ["compartilhar"];

  const cat = acao.categoria.toLowerCase();
  const tipos: MissionTipo[] = ["publicar_oferta"];
  if (cat.includes("carne") || cat === "carnes") tipos.unshift("publicar_carne");
  else if (cat.includes("horti")) tipos.unshift("publicar_hortifruti");
  else if (cat.includes("laticin")) tipos.unshift("publicar_laticinios");
  else if (cat.includes("grão") || cat.includes("cereal")) tipos.unshift("publicar_graos");
  else if (cat.includes("bebid")) tipos.unshift("publicar_bebidas");
  else if (cat.includes("limpeza") || cat.includes("higiene")) tipos.unshift("publicar_limpeza");
  return tipos;
}

/** Record progress on daily missions matching the action. Returns rewards earned. */
export async function registrarProgressoMissao(
  userId: number,
  acao: AcaoMissao,
): Promise<{ cuponsGanhos: number; pontosGanhos: number; missoesConcluidas: string[] }> {
  const today = getTodayString();
  const tipos = mapAcaoToTipos(acao);

  let cuponsGanhos = 0;
  let pontosGanhos = 0;
  const missoesConcluidas: string[] = [];

  for (const tipo of tipos) {
    const [missao] = await db
      .select()
      .from(missoesDiariasTable)
      .where(
        and(
          eq(missoesDiariasTable.usuarioId, userId),
          eq(missoesDiariasTable.data, today),
          eq(missoesDiariasTable.tipo, tipo as string),
        ),
      )
      .limit(1);

    if (!missao || missao.concluida) continue;

    const novoProgresso = Math.min(missao.progresso + 1, missao.meta);
    const concluida = novoProgresso >= missao.meta;

    await db
      .update(missoesDiariasTable)
      .set({ progresso: novoProgresso, concluida })
      .where(eq(missoesDiariasTable.id, missao.id));

    if (concluida) {
      cuponsGanhos += missao.premioCupons;
      pontosGanhos += missao.premioPontos;
      missoesConcluidas.push(missao.descricao);

      if (missao.premioPontos > 0) {
        await db
          .update(usuariosTable)
          .set({ pontos: sql`${usuariosTable.pontos} + ${missao.premioPontos}` })
          .where(eq(usuariosTable.id, userId));
      }
      if (missao.premioCupons > 0) {
        await db.insert(cuponsHistoricoTable).values({
          usuarioId: userId,
          delta: missao.premioCupons,
          tipo: "missao",
          referenciaId: missao.id,
        });
      }
    }
  }

  return { cuponsGanhos, pontosGanhos, missoesConcluidas };
}
