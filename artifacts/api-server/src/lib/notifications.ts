// @ts-nocheck
/**
 * Smart Notification Engine (Sprint 11).
 * Features: auto-grouping (15 min), priority scoring, push rate-limiting (5/24 h),
 * product muting, delivery tracking, and one-shot summary job helpers.
 */
import {
  db,
  notificationsTable,
  notificationPreferencesTable,
  notificationDeliveryTable,
  notificationMuteTable,
  ofertasTable,
  listaItensUsuarioTable,
  notificacaoPreferenciasTable,
  pushSubscriptionsTable,
  alertasTable,
} from "@workspace/db";
import type { NotificacaoTipo, NotificationPreferences } from "@workspace/db";
import { and, desc, eq, gt, lte, ne, or, sql } from "drizzle-orm";
import { isVapidConfigured, sendWebPushNotification, getPrefsForUser, passesPreferenceFilter } from "./push";

// ── Notification type constants ───────────────────────────────────────────────

export const NOTIF = {
  LISTA_OFERTA:          "lista_oferta",
  LISTA_EDITADA:         "lista_editada",
  ITEM_COMPRADO:         "item_comprado",
  PRECO_CAIU:            "preco_caiu",
  NOVA_OFERTA:           "nova_oferta",
  MERCADO:               "mercado",
  SISTEMA:               "sistema",
  PROMOCAO:              "promocao",
  RESUMO:                "resumo",
  ALERTA_PRECO:          "alerta_preco",
  OFERTA_CONFIRMADA:     "oferta_confirmada",
  VALIDACAO_RECEBIDA:    "validacao_recebida",
  BADGE_CONQUISTADO:     "badge_conquistado",
  RANKING_SEMANA:        "ranking_semana",
} as const satisfies Record<string, NotificacaoTipo>;

// ── Priority scoring ──────────────────────────────────────────────────────────

export type NotifPriority = "CRITICAL" | "HIGH" | "NORMAL" | "LOW";

export function calculateNotificationPriority(input: {
  tipo: NotificacaoTipo;
  economiaReais?: number;
  quedaPercent?: number;
  isListProduct?: boolean;
  isFavoriteMercado?: boolean;
  isPromoEnding?: boolean;
  isFavoritedProduct?: boolean;
}): NotifPriority {
  const {
    tipo,
    economiaReais = 0,
    quedaPercent = 0,
    isListProduct = false,
    isFavoriteMercado = false,
    isPromoEnding = false,
    isFavoritedProduct = false,
  } = input;

  if (economiaReais > 20 || quedaPercent > 25) return "CRITICAL";
  if (isListProduct || isFavoriteMercado || isPromoEnding || isFavoritedProduct) return "HIGH";
  if (tipo === "resumo" || tipo === "ranking_semana" || tipo === "badge_conquistado") return "LOW";
  return "NORMAL";
}

// ── Preference key mapping ────────────────────────────────────────────────────

type PrefKey = keyof Omit<NotificationPreferences, "userId" | "pushEnabled" | "createdAt" | "updatedAt">;

const TIPO_PREF: Partial<Record<NotificacaoTipo, PrefKey>> = {
  lista_oferta:       "ofertasLista",
  lista_editada:      "listaCompartilhada",
  item_comprado:      "listaCompartilhada",
  preco_caiu:         "quedaPreco",
  nova_oferta:        "ofertasLista",
  mercado:            "mercadosFavoritos",
  promocao:           "marketing",
  resumo:             "resumoSemanal",
  alerta_preco:       "ofertasLista",
};

// Types eligible for 15-min grouping (multiple products → single notification)
const GROUPABLE_TIPOS = new Set<NotificacaoTipo>([
  "lista_oferta", "nova_oferta", "preco_caiu", "alerta_preco",
]);

// ── Default preferences ───────────────────────────────────────────────────────

function defaultPrefs(): Omit<NotificationPreferences, "userId" | "createdAt" | "updatedAt"> {
  return {
    ofertasLista: true, listaCompartilhada: true, mercadosFavoritos: true,
    quedaPreco: true, resumoSemanal: true, novidades: true,
    marketing: false, pushEnabled: false,
  };
}

// ── Group title generation ────────────────────────────────────────────────────

function generateGroupedTitle(tipo: NotificacaoTipo, count: number): string {
  switch (tipo) {
    case "lista_oferta":  return `${count} produtos da sua lista entraram em oferta`;
    case "nova_oferta":
    case "alerta_preco":  return `${count} novas ofertas encontradas`;
    case "preco_caiu":    return `${count} produtos com preço reduzido`;
    default:              return `${count} novas notificações`;
  }
}

// ── Push rate limiting ────────────────────────────────────────────────────────

const PUSH_DAILY_LIMIT = 5;

async function getPushCountLast24h(userId: number): Promise<number> {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notificationDeliveryTable)
      .where(
        and(
          eq(notificationDeliveryTable.userId, userId),
          eq(notificationDeliveryTable.pushSent, true),
          gt(notificationDeliveryTable.createdAt, oneDayAgo),
        ),
      );
    return count ?? 0;
  } catch {
    return 0; // delivery table may not exist yet — don't block
  }
}

// ── createNotification ────────────────────────────────────────────────────────

export interface CreateNotificationInput {
  userId:     number;
  tipo:       NotificacaoTipo;
  titulo:     string;
  mensagem:   string;
  acaoTipo?:  string;
  acaoId?:    string;
  imagemUrl?: string;
  metadata?:  Record<string, unknown>;
  priority?:  NotifPriority;
}

export async function createNotification(input: CreateNotificationInput) {
  const { userId, tipo, titulo, mensagem, acaoTipo, acaoId, imagemUrl, metadata } = input;

  // 1. Preference gate (sistema always delivers)
  const prefKey = TIPO_PREF[tipo];
  if (prefKey) {
    const [row] = await db
      .select()
      .from(notificationPreferencesTable)
      .where(eq(notificationPreferencesTable.userId, userId))
      .limit(1);
    const prefs = row ?? defaultPrefs();
    if (!prefs[prefKey]) return null;
  }

  // 2. Mute check — record still created, push skipped
  const productName = typeof metadata?.produto === "string" ? metadata.produto : null;
  let isMuted = false;
  if (productName) {
    try {
      const [muteRow] = await db
        .select({ id: notificationMuteTable.id })
        .from(notificationMuteTable)
        .where(
          and(
            eq(notificationMuteTable.userId, userId),
            eq(notificationMuteTable.productName, productName),
          ),
        )
        .limit(1);
      isMuted = !!muteRow;
    } catch { /* table may not exist yet */ }
  }

  // 3. Grouping (groupable tipos) or classic dedup (others, 5-min window)
  const cutoff15 = new Date(Date.now() - 15 * 60_000);
  const cutoff5  = new Date(Date.now() - 5 * 60_000);

  let notif: typeof notificationsTable.$inferSelect | undefined;
  let isGrouped = false;

  if (GROUPABLE_TIPOS.has(tipo)) {
    const [existing] = await db
      .select()
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.userId, userId),
          eq(notificationsTable.tipo, tipo),
          gt(notificationsTable.criadaEm, cutoff15),
        ),
      )
      .orderBy(desc(notificationsTable.criadaEm))
      .limit(1);

    if (existing) {
      const prevMeta = (existing.metadata ?? {}) as Record<string, unknown>;
      // Build produtos list: may already be grouped or still the single original
      let prevProdutos: string[] = [];
      if (Array.isArray(prevMeta.produtos)) {
        prevProdutos = prevMeta.produtos as string[];
      } else if (typeof prevMeta.produto === "string") {
        prevProdutos = [prevMeta.produto];
      }

      const newProdutos = productName && !prevProdutos.includes(productName)
        ? [...prevProdutos, productName]
        : prevProdutos;
      const total = newProdutos.length > 1 ? newProdutos.length : 2;
      const newTitulo = generateGroupedTitle(tipo, total);
      const newMeta = { ...prevMeta, total, produtos: newProdutos };

      const [updated] = await db
        .update(notificationsTable)
        .set({ titulo: newTitulo, metadata: newMeta })
        .where(eq(notificationsTable.id, existing.id))
        .returning();

      notif = updated;
      isGrouped = true;
    }
  } else {
    // Classic dedup — same tipo + titulo in last 5 min
    const [dup] = await db
      .select({ id: notificationsTable.id })
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.userId, userId),
          eq(notificationsTable.tipo, tipo),
          eq(notificationsTable.titulo, titulo),
          gt(notificationsTable.criadaEm, cutoff5),
        ),
      )
      .limit(1);
    if (dup) return null;
  }

  // 4. Persist new notification if not grouped
  if (!notif) {
    const [created] = await db
      .insert(notificationsTable)
      .values({
        userId,
        tipo,
        titulo,
        mensagem,
        acaoTipo:    acaoTipo  ?? null,
        acaoId:      acaoId    ?? null,
        imagemUrl:   imagemUrl ?? null,
        metadata:    metadata  ?? {},
        lida:        false,
        enviadaPush: false,
      })
      .returning();
    notif = created;
  }

  if (!notif) return null;

  // Merged notifications don't trigger a new push
  if (isGrouped) return notif;

  // 5. Priority
  const priority = input.priority ?? calculateNotificationPriority({ tipo });

  // 6. Web push — fire-and-forget, does not block response
  if (isVapidConfigured()) {
    const capturedNotif = notif;
    void (async () => {
      try {
        // 6a. Check push preference
        const [prefRow] = await db
          .select({ pushEnabled: notificationPreferencesTable.pushEnabled })
          .from(notificationPreferencesTable)
          .where(eq(notificationPreferencesTable.userId, userId))
          .limit(1);
        if (!prefRow?.pushEnabled) return;

        // 6b. LOW priority never pushes
        if (priority === "LOW") return;

        // 6c. Mute → record delivery but skip push
        if (isMuted) {
          await db.insert(notificationDeliveryTable).values({
            notificationId: capturedNotif.id, userId,
            pushSent: false, pushSuccess: false,
          }).catch(() => {});
          return;
        }

        // 6d. Rate limit: PUSH_DAILY_LIMIT per 24h, except CRITICAL
        if (priority !== "CRITICAL") {
          const pushCount = await getPushCountLast24h(userId);
          if (pushCount >= PUSH_DAILY_LIMIT) return;
        }

        // 6e. Send
        const url = acaoTipo === "oferta"  ? "/ofertas"
          : acaoTipo === "lista"  ? "/lista"
          : acaoTipo === "mercado" ? "/"
          : "/notificacoes";

        let pushSuccess = false;
        try {
          await sendWebPushNotification(userId, {
            title: titulo, body: mensagem ?? "", url,
            notificationId: capturedNotif.id, acaoTipo, acaoId,
          });
          pushSuccess = true;
        } catch { /* logged inside sendWebPushNotification */ }

        // 6f. Record delivery
        await db.insert(notificationDeliveryTable).values({
          notificationId: capturedNotif.id, userId,
          pushSent: true, pushSuccess,
        }).catch(() => {});

        if (pushSuccess) {
          await db
            .update(notificationsTable)
            .set({ enviadaPush: true })
            .where(eq(notificationsTable.id, capturedNotif.id))
            .catch(() => {});
        }
      } catch {}
    })();
  }

  return notif ?? null;
}

// ── notifyMercadoFavorito ─────────────────────────────────────────────────────

interface OfertaNotifParams {
  ofertaId:  number;
  produto:   string;
  preco:     number;
  mercado:   string;
  cidade:    string | null;
  bairro:    string | null;
  categoria: string | null;
  latitude:  number | null;
  longitude: number | null;
  criadorId: number;
}

const R = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

/** Notify users who favorited this mercado when a new offer is published there. */
export async function notifyMercadoFavorito(p: OfertaNotifParams): Promise<void> {
  const rows = await db
    .selectDistinct({ usuarioId: pushSubscriptionsTable.usuarioId })
    .from(pushSubscriptionsTable)
    .innerJoin(
      notificacaoPreferenciasTable,
      eq(notificacaoPreferenciasTable.usuarioId, pushSubscriptionsTable.usuarioId),
    )
    .where(
      and(
        ne(pushSubscriptionsTable.usuarioId, p.criadorId),
        sql`${notificacaoPreferenciasTable.mercadosFavoritos}::text ilike ${"%" + p.mercado + "%"}`,
      ),
    )
    .limit(50);

  for (const { usuarioId } of rows) {
    const prefs = await getPrefsForUser(usuarioId);
    if (!passesPreferenceFilter(prefs, { categoria: p.categoria, mercado: p.mercado, produto: p.produto, latitude: p.latitude, longitude: p.longitude })) continue;
    await createNotification({
      userId: usuarioId,
      tipo: NOTIF.MERCADO,
      titulo: `🏪 Nova oferta no ${p.mercado}`,
      mensagem: `${p.produto} por ${R(p.preco)}${p.bairro ? ` · ${p.bairro}` : p.cidade ? ` · ${p.cidade}` : ""}. Toque para ver.`,
      acaoTipo: "oferta",
      acaoId:   String(p.ofertaId),
      metadata: { produto: p.produto, preco: p.preco, mercado: p.mercado },
      priority: "HIGH",
    }).catch(() => {});
  }
}

/** Notify push-subscribed users about a sponsored offer that matches their preferences. */
export async function notifyPatrocinada(p: OfertaNotifParams): Promise<void> {
  const rows = await db
    .selectDistinct({ usuarioId: pushSubscriptionsTable.usuarioId })
    .from(pushSubscriptionsTable)
    .where(ne(pushSubscriptionsTable.usuarioId, p.criadorId))
    .limit(80);

  for (const { usuarioId } of rows) {
    const prefs = await getPrefsForUser(usuarioId);
    if (!passesPreferenceFilter(prefs, { categoria: p.categoria, mercado: p.mercado, produto: p.produto, latitude: p.latitude, longitude: p.longitude })) continue;
    await createNotification({
      userId: usuarioId,
      tipo: NOTIF.PROMOCAO,
      titulo: `⭐ Oferta destacada: ${p.produto}`,
      mensagem: `${p.produto} por ${R(p.preco)} no ${p.mercado}${p.cidade ? ` · ${p.cidade}` : ""}. Aproveite!`,
      acaoTipo: "oferta",
      acaoId:   String(p.ofertaId),
      metadata: { produto: p.produto, preco: p.preco, mercado: p.mercado },
    }).catch(() => {});
  }
}

// ── checkAndSendAlerts ────────────────────────────────────────────────────────

export interface NewOfertaForAlerts {
  id: number;
  produto: string;
  produtoNormalizado: string | null;
  preco: number;
  mercado: string;
  cidade: string | null;
  bairro: string | null;
  categoria?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

/**
 * Fan-out notifications when a new offer is published.
 * Handles two cases: users with a matching price alert AND users who have the
 * product in their personal shopping list. Uses createNotification so that all
 * preference toggles, rate limits, dedup/grouping, and in-app records are applied.
 */
export async function checkAndSendAlerts(oferta: NewOfertaForAlerts): Promise<void> {
  if (!isVapidConfigured()) return;

  const Rf = (n: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
  const prodNormLc = (oferta.produtoNormalizado ?? oferta.produto).toLowerCase();

  // ── Price alerts ────────────────────────────────────────────────────────────
  const alertas = await db
    .select({ id: alertasTable.id, usuarioId: alertasTable.usuarioId })
    .from(alertasTable)
    .where(
      and(
        sql`${alertasTable.precoAlvo} >= ${oferta.preco}`,
        or(
          sql`lower(${alertasTable.produto}) like ${"%" + prodNormLc.substring(0, 30) + "%"}`,
          sql`${prodNormLc} like '%' || lower(${alertasTable.produto}) || '%'`,
        )!,
      ),
    );

  const alreadyNotified = new Set<number>();

  for (const alerta of alertas) {
    const prefs = await getPrefsForUser(alerta.usuarioId);
    if (!passesPreferenceFilter(prefs, {
      categoria: oferta.categoria, mercado: oferta.mercado,
      produto: oferta.produto, produtoNormalizado: oferta.produtoNormalizado,
      latitude: oferta.latitude, longitude: oferta.longitude,
    })) continue;

    await createNotification({
      userId:   alerta.usuarioId,
      tipo:     NOTIF.ALERTA_PRECO,
      titulo:   `🔥 ${oferta.produto} por ${Rf(oferta.preco)}!`,
      mensagem: `No ${oferta.mercado}${oferta.bairro ? ` · ${oferta.bairro}` : ""}. Toque para ver.`,
      acaoTipo: "oferta",
      acaoId:   String(oferta.id),
      metadata: { produto: oferta.produto, preco: oferta.preco, mercado: oferta.mercado },
      priority: "HIGH",
    }).catch(() => {});

    alreadyNotified.add(alerta.usuarioId);
  }

  // ── Personal list matches ───────────────────────────────────────────────────
  let listaUsers: Array<{ usuarioId: number }> = [];
  try {
    listaUsers = await db
      .selectDistinct({ usuarioId: listaItensUsuarioTable.usuarioId })
      .from(listaItensUsuarioTable)
      .where(
        and(
          eq(listaItensUsuarioTable.ativo, true),
          sql`${prodNormLc} ilike '%' || ${listaItensUsuarioTable.slug} || '%'`,
        ),
      );
  } catch {
    return;
  }

  for (const { usuarioId } of listaUsers) {
    if (alreadyNotified.has(usuarioId)) continue;

    const prefs = await getPrefsForUser(usuarioId);
    if (!passesPreferenceFilter(prefs, {
      categoria: oferta.categoria, mercado: oferta.mercado,
      produto: oferta.produto, produtoNormalizado: oferta.produtoNormalizado,
      latitude: oferta.latitude, longitude: oferta.longitude,
    })) continue;

    await createNotification({
      userId:   usuarioId,
      tipo:     NOTIF.LISTA_OFERTA,
      titulo:   `🔥 ${oferta.produto} por ${Rf(oferta.preco)}!`,
      mensagem: `Item da sua lista no ${oferta.mercado}${oferta.bairro ? ` · ${oferta.bairro}` : ""}. Toque para ver.`,
      acaoTipo: "lista",
      acaoId:   String(oferta.id),
      metadata: { produto: oferta.produto, preco: oferta.preco, mercado: oferta.mercado },
      priority: "HIGH",
    }).catch(() => {});
  }
}

// ── notifyExpiring ────────────────────────────────────────────────────────────

/** Find offers expiring in the next 24 h and notify users who have those products in their personal list. */
export async function notifyExpiring(): Promise<number> {
  const now   = new Date();
  const in24h = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const expiring = await db
    .select({
      id:                ofertasTable.id,
      produto:           ofertasTable.produto,
      produtoNormalizado: ofertasTable.produtoNormalizado,
      preco:             ofertasTable.preco,
      mercado:           ofertasTable.mercado,
      cidade:            ofertasTable.cidade,
      bairro:            ofertasTable.bairro,
    })
    .from(ofertasTable)
    .where(
      and(
        eq(ofertasTable.status, "nova"),
        gt(ofertasTable.validade, now),
        lte(ofertasTable.validade, in24h),
      ),
    )
    .limit(100);

  if (expiring.length === 0) return 0;

  let sent = 0;

  for (const oferta of expiring) {
    const prodNorm = (oferta.produtoNormalizado ?? oferta.produto).toLowerCase();
    const listaUsers = await db
      .selectDistinct({ usuarioId: listaItensUsuarioTable.usuarioId })
      .from(listaItensUsuarioTable)
      .where(
        and(
          eq(listaItensUsuarioTable.ativo, true),
          sql`${prodNorm} ilike '%' || ${listaItensUsuarioTable.slug} || '%'`,
        ),
      );

    for (const { usuarioId } of listaUsers) {
      await createNotification({
        userId:   usuarioId,
        tipo:     NOTIF.LISTA_OFERTA,
        titulo:   `⏰ Oferta vence hoje: ${oferta.produto}`,
        mensagem: `${oferta.produto} por ${R(oferta.preco)} no ${oferta.mercado}${oferta.bairro ? ` · ${oferta.bairro}` : ""}. Vence em breve!`,
        acaoTipo: "oferta",
        acaoId:   String(oferta.id),
        metadata: { produto: oferta.produto, preco: oferta.preco },
        priority: "HIGH",
      }).catch(() => {});
      sent++;
    }
  }

  return sent;
}
