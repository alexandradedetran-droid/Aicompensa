// @ts-nocheck
/**
 * Daily publish limits — per-level throttle system.
 *
 * Limits reset at BRT midnight (UTC-3, no DST since 2019).
 *
 * Exemptions (semLimite = true), in priority order:
 *   1. isAdmin = true        → motivoSemLimite = "Admin"
 *   2. unlimitedPosts = true → motivoSemLimite = "Manual"
 *   3. Colaborador Pioneiro  → motivoSemLimite = "Colaborador Pioneiro"
 *   4. PhD do Supermercado   → motivoSemLimite = "PhD do Supermercado"
 */
import { db, ofertasTable, fundadoresTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { getNivelUsuario, type Nivel } from "./nivel-usuario";
import { startOfDayBRT } from "./normaliza";

// Null = sem limite diário (unlimited)
export const NIVEL_LIMITES: Record<Nivel, number | null> = {
  "Estagiário da Economia":    5,
  "Assistente de Ofertas":     8,
  "Bacharel das Compras":      10,
  "Especialista das Gôndolas": 15,
  "Mestre das Pechinchas":     20,
  "Doutor da Economia":        30,
  "PhD do Supermercado":       null,
};

export interface LimiteDiarioResult {
  limite: number | null;
  semLimite: boolean;
  /** Human-readable reason for no limit, null when the user is limited. */
  motivoSemLimite: string | null;
}

/**
 * Returns the effective daily publish limit for a user.
 *
 * Callers should pass isAdmin and unlimitedPosts from the DB row so that
 * admin accounts see "sem limite" in their profile — not just at publish time.
 */
export function getLimiteDiario(
  pontos: number,
  isPioneiro: boolean,
  isAdmin?: boolean,
  unlimitedPosts?: boolean,
): LimiteDiarioResult {
  if (isAdmin)        return { limite: null, semLimite: true, motivoSemLimite: "Admin" };
  if (unlimitedPosts) return { limite: null, semLimite: true, motivoSemLimite: "Manual" };
  if (isPioneiro)     return { limite: null, semLimite: true, motivoSemLimite: "Colaborador Pioneiro" };

  const nivel = getNivelUsuario(pontos);
  const limite = NIVEL_LIMITES[nivel];
  if (limite === null) {
    return { limite: null, semLimite: true, motivoSemLimite: "PhD do Supermercado" };
  }
  return { limite, semLimite: false, motivoSemLimite: null };
}

export async function checkIsPioneiro(userId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: fundadoresTable.id })
    .from(fundadoresTable)
    .where(eq(fundadoresTable.usuarioId, userId))
    .limit(1);
  return !!row;
}

export async function contarOfertasHoje(userId: number): Promise<number> {
  const inicio = startOfDayBRT();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(ofertasTable)
    .where(
      sql`${ofertasTable.usuarioId} = ${userId}
          AND ${ofertasTable.dataCriacao} >= ${inicio}
          AND ${ofertasTable.tipoOrigem} NOT IN ('admin', 'importada', 'patrocinada_externa')`,
    );
  return Number(row?.n ?? 0);
}
