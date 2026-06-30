// @ts-nocheck
import webpush from "web-push";
import { db } from "@workspace/db";
import { pushSubscriptionsTable, usuariosTable, notificacaoPreferenciasTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { logger } from "./logger";

// ── VAPID setup ───────────────────────────────────────────────────────────────

export const VAPID_PUBLIC_KEY  = process.env["VAPID_PUBLIC_KEY"];
const VAPID_PRIVATE_KEY = process.env["VAPID_PRIVATE_KEY"];
const VAPID_SUBJECT     = process.env["VAPID_SUBJECT"] ?? "mailto:suporte@aicompensa.com.br";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

export function isVapidConfigured(): boolean {
  return !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
}

export function getVapidPublicKey(): string | undefined {
  return VAPID_PUBLIC_KEY;
}

// ── Send a single push notification ──────────────────────────────────────────

export async function sendPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: { title: string; body: string; url?: string; icon?: string },
): Promise<"sent" | "gone"> {
  if (!isVapidConfigured()) return "gone";

  const pushSubscription = {
    endpoint: subscription.endpoint,
    keys: { p256dh: subscription.p256dh, auth: subscription.auth },
  };

  try {
    await webpush.sendNotification(pushSubscription, JSON.stringify(payload));
    return "sent";
  } catch (err: unknown) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      return "gone";
    }
    logger.warn({ err, endpoint: subscription.endpoint }, "push send failed");
    return "gone";
  }
}

// ── Preference helpers ────────────────────────────────────────────────────────

export interface UserPrefs {
  categorias:              string[];
  distanciaMaxKm:          number | null;
  latitude:                number | null;
  longitude:               number | null;
  mercadosFavoritos:       string[];
  palavrasChave:           string[];
  frequencia:              string;
  horarioSilenciosoInicio: number;
  horarioSilenciosoFim:    number;
}

/** Load user prefs or return sensible defaults (all categories, no distance limit, immediate). */
export async function getPrefsForUser(userId: number): Promise<UserPrefs> {
  const [row] = await db
    .select()
    .from(notificacaoPreferenciasTable)
    .where(eq(notificacaoPreferenciasTable.usuarioId, userId))
    .limit(1);

  if (!row) {
    return {
      categorias: [], distanciaMaxKm: null, latitude: null, longitude: null,
      mercadosFavoritos: [], palavrasChave: [], frequencia: "imediata",
      horarioSilenciosoInicio: 22, horarioSilenciosoFim: 7,
    };
  }

  return {
    categorias:              row.categorias ?? [],
    distanciaMaxKm:          row.distanciaMaxKm ?? null,
    latitude:                row.latitude  != null ? Number(row.latitude)  : null,
    longitude:               row.longitude != null ? Number(row.longitude) : null,
    mercadosFavoritos:       row.mercadosFavoritos ?? [],
    palavrasChave:           row.palavrasChave ?? [],
    frequencia:              row.frequencia,
    horarioSilenciosoInicio: row.horarioSilenciosoInicio,
    horarioSilenciosoFim:    row.horarioSilenciosoFim,
  };
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Returns hour in Brasília time (UTC-3). */
function brasiliaHour(): number {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).getUTCHours();
}

/** Check if current Brasília hour falls in [start, end) quiet window.
 *  Handles overnight wrap: e.g. inicio=22, fim=7 → quiet from 22:00 to 06:59 */
function isQuietHour(prefs: UserPrefs): boolean {
  const h = brasiliaHour();
  const { horarioSilenciosoInicio: s, horarioSilenciosoFim: e } = prefs;
  if (s === e) return false; // same hour = no quiet window
  if (s > e) return h >= s || h < e;   // overnight: 22..23..0..6
  return h >= s && h < e;              // same day: e.g. 14..18
}

/**
 * Returns true if the notification should be sent to this user given their preferences.
 * Handles: frequencia=desligado, quiet hours, category, mercado, distance, keywords.
 */
export function passesPreferenceFilter(
  prefs: UserPrefs,
  oferta: {
    categoria?: string | null;
    mercado?: string | null;
    produto?: string;
    produtoNormalizado?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  },
): boolean {
  // Disabled completely
  if (prefs.frequencia === "desligado") return false;

  // Quiet hours
  if (isQuietHour(prefs)) return false;

  // Category filter — empty = all allowed
  if (prefs.categorias.length > 0 && oferta.categoria) {
    const cat = oferta.categoria.toLowerCase();
    if (!prefs.categorias.some(c => c.toLowerCase() === cat)) return false;
  }

  // Mercado filter — empty = all allowed
  if (prefs.mercadosFavoritos.length > 0 && oferta.mercado) {
    const merc = oferta.mercado.toLowerCase();
    if (!prefs.mercadosFavoritos.some(m => merc.includes(m.toLowerCase()))) return false;
  }

  // Keyword filter — empty = all allowed
  if (prefs.palavrasChave.length > 0) {
    const produto = (oferta.produtoNormalizado ?? oferta.produto ?? "").toLowerCase();
    if (!prefs.palavrasChave.some(kw => produto.includes(kw.toLowerCase()))) return false;
  }

  // Distance filter
  if (
    prefs.distanciaMaxKm != null &&
    prefs.latitude != null && prefs.longitude != null &&
    oferta.latitude != null && oferta.longitude != null
  ) {
    const dist = haversineKm(prefs.latitude, prefs.longitude, oferta.latitude, oferta.longitude);
    if (dist > prefs.distanciaMaxKm) return false;
  }

  return true;
}

// ── Check alerts and fan-out push notifications when a new offer is published ─

// ── sendWebPushNotification — fan-out push to all subscriptions of a user ────

export async function sendWebPushNotification(
  userId: number,
  payload: {
    title:          string;
    body:           string;
    icon?:          string;
    url?:           string;
    notificationId?: number;
    acaoTipo?:      string | null;
    acaoId?:        string | null;
  },
): Promise<void> {
  if (!isVapidConfigured()) return;

  const subs = await db
    .select()
    .from(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.usuarioId, userId));

  if (subs.length === 0) return;

  const json = JSON.stringify({
    title: payload.title,
    body:  payload.body,
    icon:  payload.icon  ?? "/brand/icon-192.png",
    badge: "/brand/favicon-32.png",
    url:   payload.url   ?? "/notificacoes",
    notificationId: payload.notificationId ?? null,
    acaoTipo: payload.acaoTipo ?? null,
    acaoId:   payload.acaoId   ?? null,
  });

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          json,
        );
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.id, sub.id)).catch(() => {});
        } else {
          logger.warn({ err, endpoint: sub.endpoint }, "sendWebPushNotification: send failed");
        }
      }
    }),
  );
}

