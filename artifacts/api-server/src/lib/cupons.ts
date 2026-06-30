// @ts-nocheck
import { db, cuponsHistoricoTable } from "@workspace/db";
import { eq, sql, and, gte } from "drizzle-orm";

/** Award 1 coupon to a user for a given action. Fire-and-forget safe. */
export async function awardCupom(
  userId: number,
  tipo: "publicacao" | "confirmacao" | "bonus_dia" | "compartilhamento" | "convite" | "missao" | "missao_compartilhar",
  referenciaId?: number,
): Promise<void> {
  await db.insert(cuponsHistoricoTable).values({
    usuarioId: userId,
    delta: 1,
    tipo,
    referenciaId: referenciaId ?? null,
  });
}

/**
 * Get coupon balance for a user.
 *
 * @param fromDate — when provided, only sums deltas on or after this date.
 *   Pass the current sorteio's `criadoEm` to get "coupons active for this raffle".
 *   Omit for all-time net balance (all earns minus all spends).
 */
export async function getUserCuponsBalance(userId: number, fromDate?: Date): Promise<number> {
  const conditions = fromDate
    ? and(eq(cuponsHistoricoTable.usuarioId, userId), gte(cuponsHistoricoTable.criadoEm, fromDate))
    : eq(cuponsHistoricoTable.usuarioId, userId);

  const [result] = await db
    .select({ total: sql<number>`COALESCE(SUM(${cuponsHistoricoTable.delta}), 0)::int` })
    .from(cuponsHistoricoTable)
    .where(conditions);
  return Number(result?.total ?? 0);
}

/**
 * Total coupons ever EARNED (positive deltas only, all time).
 * Ignores spends. Used to show lifetime earning history in the profile/raffle UI.
 */
export async function getTotalCuponsGanhos(userId: number): Promise<number> {
  const [result] = await db
    .select({ total: sql<number>`COALESCE(SUM(${cuponsHistoricoTable.delta}), 0)::int` })
    .from(cuponsHistoricoTable)
    .where(
      and(
        eq(cuponsHistoricoTable.usuarioId, userId),
        sql`${cuponsHistoricoTable.delta} > 0`,
      ),
    );
  return Number(result?.total ?? 0);
}

/**
 * Deduct coupons for lottery participation.
 *
 * Balance is checked relative to `sorteioStartDate` so coupons earned in
 * previous raffles are NOT usable in the current one — each raffle is a
 * fresh slate.
 *
 * Returns false if the raffle-period balance is insufficient (no deduction made).
 */
export async function spendCupons(
  userId: number,
  quantidade: number,
  sorteioId: number,
  sorteioStartDate: Date,
): Promise<boolean> {
  const balance = await getUserCuponsBalance(userId, sorteioStartDate);
  if (balance < quantidade) return false;
  await db.insert(cuponsHistoricoTable).values({
    usuarioId: userId,
    delta: -quantidade,
    tipo: "sorteio",
    referenciaId: sorteioId,
  });
  return true;
}
