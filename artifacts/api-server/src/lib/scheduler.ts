/**
 * Background scheduler for AíCompensa.
 * Runs every 5 minutes and fires time-gated jobs:
 *  - Daily summary   → 19:00 BRT (UTC-3)
 *  - Weekly summary  → Sunday 09:00 BRT
 *
 * Uses a DB-presence guard so multiple server instances don't double-send.
 */
import { db, notificationsTable, notificationPreferencesTable, pushSubscriptionsTable, ofertasTable } from "@workspace/db";
import { and, eq, gt, sql, desc } from "drizzle-orm";
import { createNotification, NOTIF, notifyExpiring } from "./notifications";
import { runShoppingAnalysisForAll } from "./shopping-analyzer";
import { runOfertaBot } from "./ofertabot";
import { releaseOfertaBotRunLock, tryAcquireOfertaBotRunLock } from "./ofertabot-run-lock";
import { scrapeAtacadaoAPI } from "./atacadao-api-scraper";
import { importAtacadaoPayload } from "./atacadao-site-importer";
import { runRedeMachadoImporter } from "./rede-machado-site-importer";
import { logger } from "./logger";

// ── BRT helpers ───────────────────────────────────────────────────────────────

function brasiliaDate(): Date {
  return new Date(Date.now() - 3 * 60 * 60 * 1000);
}

function brasiliaHour(): number {
  return brasiliaDate().getUTCHours();
}

function brasiliaWeekday(): number {
  return brasiliaDate().getUTCDay(); // 0 = Sunday
}

function brasiliaDateString(): string {
  return brasiliaDate().toISOString().slice(0, 10); // YYYY-MM-DD
}

// ── Guard: check if a resumo notification for today already exists ────────────

async function resumoAlreadySentToday(): Promise<boolean> {
  const today = new Date(Date.now() - 3 * 60 * 60 * 1000);
  today.setUTCHours(0, 0, 0, 0);
  try {
    const [row] = await db
      .select({ id: notificationsTable.id })
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.tipo, "resumo"),
          gt(notificationsTable.criadaEm, today),
        ),
      )
      .limit(1);
    return !!row;
  } catch {
    return false;
  }
}

async function resumoWeeklyAlreadySentThisWeek(): Promise<boolean> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  try {
    const [row] = await db
      .select({ id: notificationsTable.id })
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.tipo, "resumo"),
          gt(notificationsTable.criadaEm, sevenDaysAgo),
          sql`${notificationsTable.metadata}->>'periodo' = 'semanal'`,
        ),
      )
      .limit(1);
    return !!row;
  } catch {
    return false;
  }
}

// ── Offer stats helpers ───────────────────────────────────────────────────────

interface OfferStats {
  count: number;
  mercados: string[];
  economiaReais: number;
  produtoCampeao: string | null;
}

async function getOfferStatsForPeriod(since: Date): Promise<OfferStats> {
  try {
    // Count + mercados
    const rows = await db
      .select({
        mercado: ofertasTable.mercado,
        preco: ofertasTable.preco,
        precoNormal: ofertasTable.precoNormal,
        produto: ofertasTable.produtoNormalizado,
      })
      .from(ofertasTable)
      .where(gt(ofertasTable.dataCriacao, since))
      .limit(500);

    const count = rows.length;
    const mercadoSet = new Set<string>();
    const produtoCount: Record<string, number> = {};
    let economiaReais = 0;

    for (const r of rows) {
      if (r.mercado) mercadoSet.add(r.mercado);
      if (r.produto) produtoCount[r.produto] = (produtoCount[r.produto] ?? 0) + 1;
      if (r.precoNormal && r.precoNormal > r.preco) {
        economiaReais += r.precoNormal - r.preco;
      }
    }

    const produtoCampeao = Object.entries(produtoCount)
      .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    return {
      count,
      mercados: [...mercadoSet].slice(0, 5),
      economiaReais,
      produtoCampeao,
    };
  } catch {
    return { count: 0, mercados: [], economiaReais: 0, produtoCampeao: null };
  }
}

// ── Eligible users (push enabled + has subscription) ─────────────────────────

async function getEligibleUserIds(): Promise<number[]> {
  try {
    const rows = await db
      .selectDistinct({ userId: pushSubscriptionsTable.usuarioId })
      .from(pushSubscriptionsTable)
      .innerJoin(
        notificationPreferencesTable,
        and(
          eq(notificationPreferencesTable.userId, pushSubscriptionsTable.usuarioId),
          eq(notificationPreferencesTable.pushEnabled, true),
          eq(notificationPreferencesTable.resumoSemanal, true),
        ),
      );
    return rows.map(r => r.userId);
  } catch {
    return [];
  }
}

// ── Format currency ───────────────────────────────────────────────────────────

const R = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

// ── Daily summary job ─────────────────────────────────────────────────────────

async function runDailySummaryJob(): Promise<void> {
  if (await resumoAlreadySentToday()) return;

  const midnight = new Date(Date.now() - 3 * 60 * 60 * 1000);
  midnight.setUTCHours(0, 0, 0, 0);
  const stats = await getOfferStatsForPeriod(midnight);

  if (stats.count === 0) {
    logger.info("[scheduler] daily summary: no offers today, skipping");
    return;
  }

  const userIds = await getEligibleUserIds();
  if (userIds.length === 0) return;

  const mercadoStr = stats.mercados.length > 0
    ? stats.mercados.join(", ")
    : "vários mercados";

  const titulo = `📊 Resumo do dia — ${stats.count} ${stats.count === 1 ? "oferta" : "ofertas"}`;
  const mensagem = stats.economiaReais > 0
    ? `Mercados: ${mercadoStr}. Economia estimada: ${R(stats.economiaReais)}.`
    : `Encontramos ${stats.count} ofertas hoje nos mercados ${mercadoStr}.`;

  let sent = 0;
  for (const userId of userIds) {
    await createNotification({
      userId,
      tipo: NOTIF.RESUMO,
      titulo,
      mensagem,
      acaoTipo: "mercado",
      metadata: { count: stats.count, mercados: stats.mercados, economia: stats.economiaReais, periodo: "diario" },
    }).catch(() => {});
    sent++;
  }

  logger.info({ sent, count: stats.count }, "[scheduler] daily summary sent");
}

// ── Weekly summary job ────────────────────────────────────────────────────────

async function runWeeklySummaryJob(): Promise<void> {
  if (await resumoWeeklyAlreadySentThisWeek()) return;

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const stats = await getOfferStatsForPeriod(weekAgo);

  if (stats.count === 0) {
    logger.info("[scheduler] weekly summary: no offers this week, skipping");
    return;
  }

  const userIds = await getEligibleUserIds();
  if (userIds.length === 0) return;

  const titulo = `🏆 Resumo da semana — ${stats.count} ofertas`;
  const campeaoStr = stats.produtoCampeao ? ` Produto campeão: ${stats.produtoCampeao}.` : "";
  const mensagem = stats.economiaReais > 0
    ? `Economia possível: ${R(stats.economiaReais)}.${campeaoStr}`
    : `${stats.count} ofertas nos mercados ${stats.mercados.join(", ")}.${campeaoStr}`;

  let sent = 0;
  for (const userId of userIds) {
    await createNotification({
      userId,
      tipo: NOTIF.RESUMO,
      titulo,
      mensagem,
      acaoTipo: "mercado",
      metadata: { count: stats.count, mercados: stats.mercados, economia: stats.economiaReais, produtoCampeao: stats.produtoCampeao, periodo: "semanal" },
    }).catch(() => {});
    sent++;
  }

  logger.info({ sent, count: stats.count }, "[scheduler] weekly summary sent");
}

// ── Expiring offers job ───────────────────────────────────────────────────────

let lastExpiringRunDate = "";
let lastOfertaBotRunDate = "";
let lastAtacadaoRunDate = "";
let lastRedeMachadoRunDate = "";

async function runExpiringOffersJob(): Promise<void> {
  if (lastExpiringRunDate === brasiliaDateString()) return;
  lastExpiringRunDate = brasiliaDateString(); // mark before running to prevent concurrent runs
  logger.info("[scheduler] expiring offers job: starting");
  try {
    const sent = await notifyExpiring();
    logger.info({ sent }, "[scheduler] expiring offers job: done");
  } catch (err) {
    logger.error({ err }, "[scheduler] expiring offers job: failed");
    lastExpiringRunDate = ""; // reset so the next tick can retry
  }
}

// ── Scheduler loop ────────────────────────────────────────────────────────────

export function startScheduler(): void {
  setInterval(async () => {
    const hour    = brasiliaHour();
    const weekday = brasiliaWeekday();

    // Daily at 19:00 BRT
    if (hour === 19) {
      await runDailySummaryJob().catch(err =>
        logger.error({ err }, "[scheduler] daily summary job failed"),
      );
    }

    // Weekly on Sunday at 09:00 BRT
    if (weekday === 0 && hour === 9) {
      await runWeeklySummaryJob().catch(err =>
        logger.error({ err }, "[scheduler] weekly summary job failed"),
      );
    }

    // Daily expiring offers at 08:00 BRT
    if (hour === 8) {
      await runExpiringOffersJob().catch(err =>
        logger.error({ err }, "[scheduler] expiring offers job failed"),
      );
    }

    // Sprint 13: Shopping list analysis at 08h, 12h, 18h BRT
    if (hour === 8 || hour === 12 || hour === 18) {
      await runShoppingAnalysisForAll().catch(err =>
        logger.error({ err }, "[scheduler] shopping analysis job failed"),
      );
    }

    // Sprint 21: Atacadão GraphQL scraper — 06h, 12h e 18h BRT (roda antes do OfertaBot)
    if ((hour === 6 || hour === 12 || hour === 18) && lastAtacadaoRunDate !== `${brasiliaDateString()}-${hour}`) {
      const atacadaoKey = `${brasiliaDateString()}-${hour}`;
      lastAtacadaoRunDate = atacadaoKey;
      setImmediate(async () => {
        const t0 = Date.now();
        try {
          const payload = await scrapeAtacadaoAPI();
          const stats = await importAtacadaoPayload(payload);
          const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
          const linhas = [
            "",
            "=== ATACADÃO VTEX SUMMARY ===",
            "",
            `Fonte: Atacadão Cuiabá — Tijucal (VTEX GraphQL)`,
            `Produtos capturados:   ${stats.total}`,
            `Imagens catalogadas:   ${stats.catalogados}`,
            `Publicados:            ${stats.publicados}`,
            `Enviados p/ revisão:   ${stats.revisao}`,
            `Duplicados:            ${stats.duplicados}`,
            `Rejeitados:            ${stats.rejeitados}`,
            `Imagens salvas:        ${stats.imagensSalvas}`,
            `Imagens com erro:      ${stats.imagensComErro}`,
            ``,
            `Tempo total: ${elapsed}s`,
            "",
            "=============================",
          ];
          logger.info(linhas.join("\n"));
        } catch (err) {
          logger.error({ err, runKey: atacadaoKey }, "[scheduler] atacadao scraper falhou");
          lastAtacadaoRunDate = ""; // permite retry no próximo tick
        }
      });
    }

    // Rede Machado Sinop: captura de promocoes do site - 06h, 12h e 18h BRT
    if ((hour === 6 || hour === 12 || hour === 18) && lastRedeMachadoRunDate !== `${brasiliaDateString()}-${hour}`) {
      const redeMachadoKey = `${brasiliaDateString()}-${hour}`;
      lastRedeMachadoRunDate = redeMachadoKey;
      setImmediate(async () => {
        const t0 = Date.now();
        try {
          const stats = await runRedeMachadoImporter();
          const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
          logger.info({ ...stats, elapsed }, "[scheduler] rede machado scraper completed");
        } catch (err) {
          logger.error({ err, runKey: redeMachadoKey }, "[scheduler] rede machado scraper falhou");
          lastRedeMachadoRunDate = "";
        }
      });
    }

    // Sprint 21: OfertaBot autônomo — 06h, 12h e 18h BRT
    if ((hour === 6 || hour === 12 || hour === 18) && lastOfertaBotRunDate !== `${brasiliaDateString()}-${hour}`) {
      const runKey = `${brasiliaDateString()}-${hour}`;
      lastOfertaBotRunDate = runKey;
      const locked = await tryAcquireOfertaBotRunLock().catch((err) => {
        logger.error({ err, runKey }, "[scheduler] ofertabot lock failed");
        return false;
      });
      if (!locked) {
        logger.info({ runKey }, "[scheduler] ofertabot already running in another instance");
        return;
      }
      try {
        await runOfertaBot();
        logger.info({ runKey }, "[scheduler] ofertabot job completed");
      } catch (err) {
        logger.error({ err, runKey }, "[scheduler] ofertabot job failed");
      } finally {
        await releaseOfertaBotRunLock().catch((err) =>
          logger.error({ err, runKey }, "[scheduler] ofertabot unlock failed"),
        );
      }
    }
  }, 5 * 60 * 1000); // tick every 5 minutes

  logger.info("[scheduler] started — daily 19h BRT, weekly Sunday 09h BRT, expiring 08h BRT, shopping analysis 08h/12h/18h BRT, atacadao scraper 06h/12h/18h BRT, rede machado scraper 06h/12h/18h BRT, ofertabot 06h/12h/18h BRT");
}
