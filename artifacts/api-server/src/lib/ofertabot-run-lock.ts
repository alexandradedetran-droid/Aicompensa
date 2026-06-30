import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const OFERTABOT_RUN_LOCK_ID = 21061218;

type LockRow = { locked: boolean };

export async function tryAcquireOfertaBotRunLock(): Promise<boolean> {
  const result = await db.execute(sql<LockRow>`SELECT pg_try_advisory_lock(${OFERTABOT_RUN_LOCK_ID}) AS locked`);
  const rows = Array.isArray(result) ? result : (result as unknown as { rows?: LockRow[] }).rows;
  return rows?.[0]?.locked === true;
}

export async function releaseOfertaBotRunLock(): Promise<void> {
  await db.execute(sql`SELECT pg_advisory_unlock(${OFERTABOT_RUN_LOCK_ID})`);
}
