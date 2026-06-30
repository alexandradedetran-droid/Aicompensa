// @ts-nocheck
import { Router } from "express";
import { z } from "zod";
import {
  db,
  notificacaoPreferenciasTable,
  notificationsTable,
  notificationPreferencesTable,
  notificationDeliveryTable,
  notificationMuteTable,
  ofertasTable,
} from "@workspace/db";
import { and, desc, eq, sql, isNull, isNotNull } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { isVapidConfigured, sendWebPushNotification } from "../lib/push";
import { notifyExpiring } from "../lib/notifications";

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeKw(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/-+/g, " ")
    .replace(/\s+/g, " ");
}

function dedupCaseInsensitive(arr: string[]): string[] {
  const seen = new Set<string>();
  return arr.map(s => s.trim()).filter(s => {
    if (!s) return false;
    const key = s.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Existing: price-alert preferences (keep as-is) ───────────────────────────

function defaultAlertPrefs(userId: number) {
  return {
    usuarioId:               userId,
    categorias:              [] as string[],
    distanciaMaxKm:          null as number | null,
    latitude:                null as string | null,
    longitude:               null as string | null,
    mercadosFavoritos:       [] as string[],
    palavrasChave:           [] as string[],
    frequencia:              "imediata" as const,
    horarioSilenciosoInicio: 22,
    horarioSilenciosoFim:    7,
  };
}

router.get("/notificacoes/preferencias", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const [row] = await db
    .select()
    .from(notificacaoPreferenciasTable)
    .where(eq(notificacaoPreferenciasTable.usuarioId, userId))
    .limit(1);
  if (!row) { res.json(defaultAlertPrefs(userId)); return; }
  res.json({
    usuarioId:               row.usuarioId,
    categorias:              row.categorias ?? [],
    distanciaMaxKm:          row.distanciaMaxKm ?? null,
    latitude:                row.latitude ?? null,
    longitude:               row.longitude ?? null,
    mercadosFavoritos:       row.mercadosFavoritos ?? [],
    palavrasChave:           row.palavrasChave ?? [],
    frequencia:              row.frequencia,
    horarioSilenciosoInicio: row.horarioSilenciosoInicio,
    horarioSilenciosoFim:    row.horarioSilenciosoFim,
  });
});

const alertPrefsSchema = z.object({
  categorias:              z.array(z.string().max(60)).default([]),
  distanciaMaxKm:          z.number().int().positive().nullable().default(null),
  latitude:                z.number().nullable().default(null),
  longitude:               z.number().nullable().default(null),
  mercadosFavoritos:       z.array(z.string().max(100)).default([]),
  palavrasChave:           z.array(z.string().max(80)).max(50).default([]),
  frequencia:              z.enum(["imediata", "diario", "semanal", "desligado"]).default("imediata"),
  horarioSilenciosoInicio: z.number().int().min(0).max(23).default(22),
  horarioSilenciosoFim:    z.number().int().min(0).max(23).default(7),
});

router.put("/notificacoes/preferencias", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const parsed = alertPrefsSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const {
    categorias, distanciaMaxKm, latitude, longitude,
    mercadosFavoritos, palavrasChave, frequencia,
    horarioSilenciosoInicio, horarioSilenciosoFim,
  } = parsed.data;
  const normMercados  = dedupCaseInsensitive(mercadosFavoritos);
  const normPalavras  = [...new Set(palavrasChave.map(normalizeKw).filter(Boolean))];
  const normCategorias = dedupCaseInsensitive(categorias);
  const values = {
    usuarioId: userId,
    categorias: normCategorias,
    distanciaMaxKm: distanciaMaxKm ?? null,
    latitude:   latitude  != null ? String(latitude)  : null,
    longitude:  longitude != null ? String(longitude) : null,
    mercadosFavoritos: normMercados,
    palavrasChave: normPalavras,
    frequencia,
    horarioSilenciosoInicio,
    horarioSilenciosoFim,
    atualizadoEm: new Date(),
  };
  await db
    .insert(notificacaoPreferenciasTable)
    .values(values)
    .onConflictDoUpdate({
      target: notificacaoPreferenciasTable.usuarioId,
      set: {
        categorias: normCategorias,
        distanciaMaxKm: distanciaMaxKm ?? null,
        latitude:  latitude  != null ? String(latitude)  : null,
        longitude: longitude != null ? String(longitude) : null,
        mercadosFavoritos: normMercados,
        palavrasChave: normPalavras,
        frequencia,
        horarioSilenciosoInicio,
        horarioSilenciosoFim,
        atualizadoEm: new Date(),
      },
    });
  res.json({ ok: true });
});

router.get("/notificacoes/mercados-sugeridos", requireAuth, async (_req, res) => {
  const rows = await db
    .selectDistinct({ mercado: ofertasTable.mercado })
    .from(ofertasTable)
    .where(sql`${ofertasTable.mercado} IS NOT NULL AND ${ofertasTable.mercado} != ''`)
    .orderBy(ofertasTable.mercado)
    .limit(100);
  res.json(rows.map(r => r.mercado).filter(Boolean));
});

// ── New Sprint 09: in-app notifications ──────────────────────────────────────

// GET /api/notificacoes — list notifications for the logged-in user
router.get("/notificacoes", requireAuth, async (req, res) => {
  const userId  = req.session.userId!;
  const limit   = Math.min(Number(req.query["limit"]) || 50, 100);
  const offset  = Number(req.query["offset"]) || 0;
  const soFilter = req.query["tipo"] as string | undefined;

  const rows = await db
    .select()
    .from(notificationsTable)
    .where(
      and(
        eq(notificationsTable.userId, userId),
        soFilter ? eq(notificationsTable.tipo, soFilter as any) : undefined,
      ),
    )
    .orderBy(desc(notificationsTable.criadaEm))
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notificationsTable)
    .where(and(eq(notificationsTable.userId, userId), eq(notificationsTable.lida, false)));

  res.json({ notificacoes: rows, naoLidas: count ?? 0 });
});

// GET /api/notificacoes/preferences — boolean feature-category prefs
router.get("/notificacoes/preferences", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const [row] = await db
    .select()
    .from(notificationPreferencesTable)
    .where(eq(notificationPreferencesTable.userId, userId))
    .limit(1);
  if (!row) {
    res.json({
      ofertasLista: true, listaCompartilhada: true, mercadosFavoritos: true,
      quedaPreco: true, resumoSemanal: true, novidades: true,
      marketing: false, pushEnabled: false,
    });
    return;
  }
  res.json({
    ofertasLista:       row.ofertasLista,
    listaCompartilhada: row.listaCompartilhada,
    mercadosFavoritos:  row.mercadosFavoritos,
    quedaPreco:         row.quedaPreco,
    resumoSemanal:      row.resumoSemanal,
    novidades:          row.novidades,
    marketing:          row.marketing,
    pushEnabled:        row.pushEnabled,
  });
});

const notifSettingsSchema = z.object({
  ofertasLista:       z.boolean().optional(),
  listaCompartilhada: z.boolean().optional(),
  mercadosFavoritos:  z.boolean().optional(),
  quedaPreco:         z.boolean().optional(),
  resumoSemanal:      z.boolean().optional(),
  novidades:          z.boolean().optional(),
  marketing:          z.boolean().optional(),
  pushEnabled:        z.boolean().optional(),
});

// PATCH /api/notificacoes/preferences — update boolean prefs
router.patch("/notificacoes/preferences", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const parsed = notifSettingsSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const set: Record<string, unknown> = { updatedAt: new Date() };
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v !== undefined) set[k] = v;
  }

  await db
    .insert(notificationPreferencesTable)
    .values({ userId, ...set })
    .onConflictDoUpdate({ target: notificationPreferencesTable.userId, set });

  res.json({ ok: true });
});

// PATCH /api/notificacoes/lidas — mark ALL as read
router.patch("/notificacoes/lidas", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  await db
    .update(notificationsTable)
    .set({ lida: true })
    .where(and(eq(notificationsTable.userId, userId), eq(notificationsTable.lida, false)));
  res.json({ ok: true });
});

// PATCH /api/notificacoes/:id/lida — mark one notification as read
router.patch("/notificacoes/:id/lida", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const id = parseInt(req.params["id"] ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido." }); return; }

  const [notif] = await db
    .select({ id: notificationsTable.id, userId: notificationsTable.userId })
    .from(notificationsTable)
    .where(eq(notificationsTable.id, id))
    .limit(1);

  if (!notif || notif.userId !== userId) {
    res.status(404).json({ error: "Notificação não encontrada." });
    return;
  }

  await db
    .update(notificationsTable)
    .set({ lida: true })
    .where(eq(notificationsTable.id, id));

  res.json({ ok: true });
});

// ── Sprint 11: Stats ──────────────────────────────────────────────────────────

// GET /api/notificacoes/stats — engagement statistics for the logged-in user
router.get("/notificacoes/stats", requireAuth, async (req, res) => {
  const userId = req.session.userId!;

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(notificationsTable)
    .where(eq(notificationsTable.userId, userId));

  const [{ pushEnviados }] = await db
    .select({ pushEnviados: sql<number>`count(*)::int` })
    .from(notificationsTable)
    .where(and(eq(notificationsTable.userId, userId), eq(notificationsTable.enviadaPush, true)));

  // From delivery table (may be empty if migration not yet run)
  let abertas = 0;
  let pushFalharam = 0;
  try {
    const [{ a }] = await db
      .select({ a: sql<number>`count(*)::int` })
      .from(notificationDeliveryTable)
      .where(and(eq(notificationDeliveryTable.userId, userId), isNotNull(notificationDeliveryTable.openedAt)));
    abertas = a ?? 0;

    const [{ f }] = await db
      .select({ f: sql<number>`count(*)::int` })
      .from(notificationDeliveryTable)
      .where(
        and(
          eq(notificationDeliveryTable.userId, userId),
          eq(notificationDeliveryTable.pushSent, true),
          eq(notificationDeliveryTable.pushSuccess, false),
        ),
      );
    pushFalharam = f ?? 0;
  } catch { /* delivery table not yet created — return zeros */ }

  const totalNum   = total ?? 0;
  const abertasNum = abertas;
  const ignoradas  = totalNum > 0 ? totalNum - abertasNum : 0;
  const taxaAbertura = totalNum > 0 ? Math.round((abertasNum / totalNum) * 100) : 0;

  res.json({
    total: totalNum,
    abertas: abertasNum,
    ignoradas,
    taxa_abertura: taxaAbertura,
    push_enviados: pushEnviados ?? 0,
    push_falharam: pushFalharam,
  });
});

// ── Sprint 11: Click tracking ─────────────────────────────────────────────────

// POST /api/notificacoes/:id/click — record opened_at + clicked=true
router.post("/notificacoes/:id/click", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const id = parseInt(req.params["id"] ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido." }); return; }

  const [notif] = await db
    .select({ id: notificationsTable.id, userId: notificationsTable.userId })
    .from(notificationsTable)
    .where(eq(notificationsTable.id, id))
    .limit(1);

  if (!notif || notif.userId !== userId) {
    res.status(404).json({ error: "Notificação não encontrada." });
    return;
  }

  // Mark as lida
  await db.update(notificationsTable).set({ lida: true }).where(eq(notificationsTable.id, id));

  // Upsert delivery record
  try {
    const [existing] = await db
      .select({ id: notificationDeliveryTable.id })
      .from(notificationDeliveryTable)
      .where(and(eq(notificationDeliveryTable.notificationId, id), eq(notificationDeliveryTable.userId, userId)))
      .limit(1);

    if (existing) {
      await db.update(notificationDeliveryTable)
        .set({ openedAt: new Date(), clicked: true })
        .where(eq(notificationDeliveryTable.id, existing.id));
    } else {
      await db.insert(notificationDeliveryTable).values({
        notificationId: id, userId,
        openedAt: new Date(), clicked: true,
        pushSent: false, pushSuccess: false,
      });
    }
  } catch { /* delivery table may not exist yet */ }

  res.json({ ok: true });
});

// ── Sprint 11: Mute CRUD ──────────────────────────────────────────────────────

const muteSchema = z.object({
  productName: z.string().min(1).max(200).trim(),
});

// POST /api/notificacoes/mute — silence a product
router.post("/notificacoes/mute", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const parsed = muteSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  try {
    await db
      .insert(notificationMuteTable)
      .values({ userId, productName: parsed.data.productName })
      .onConflictDoNothing();
    res.json({ ok: true });
  } catch (err: unknown) {
    const pgCode = (err as { code?: string }).code;
    if (pgCode === "42P01") {
      res.status(503).json({ error: "Sistema de silenciar notificações ainda não disponível." });
    } else {
      res.status(500).json({ error: "Erro ao silenciar produto." });
    }
  }
});

// GET /api/notificacoes/muted — list muted products for the logged-in user
router.get("/notificacoes/muted", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  try {
    const rows = await db
      .select({ id: notificationMuteTable.id, productName: notificationMuteTable.productName, createdAt: notificationMuteTable.createdAt })
      .from(notificationMuteTable)
      .where(eq(notificationMuteTable.userId, userId))
      .orderBy(desc(notificationMuteTable.createdAt));
    res.json(rows);
  } catch {
    res.json([]);
  }
});

// DELETE /api/notificacoes/mute/:productName — unmute a product
router.delete("/notificacoes/mute/:productName", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const productName = decodeURIComponent(req.params["productName"] ?? "");
  if (!productName) { res.status(400).json({ error: "Nome do produto inválido." }); return; }

  try {
    await db
      .delete(notificationMuteTable)
      .where(and(eq(notificationMuteTable.userId, userId), eq(notificationMuteTable.productName, productName)));
    res.json({ ok: true });
  } catch (err: unknown) {
    const pgCode = (err as { code?: string }).code;
    if (pgCode === "42P01") {
      res.status(503).json({ error: "Sistema de silenciar notificações ainda não disponível." });
    } else {
      res.status(500).json({ error: "Erro ao remover silenciamento." });
    }
  }
});

// ── POST /api/notifications/test — send a test push to the logged-in user ────

router.post("/notifications/test", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  if (!isVapidConfigured()) {
    res.status(503).json({ error: "Push não configurado no servidor." });
    return;
  }
  await sendWebPushNotification(userId, {
    title: "🔔 Teste de Notificação",
    body:  "Funcionou! Você está com as notificações ativas no AíCompensa.",
    url:   "/notificacoes",
  });
  res.json({ ok: true });
});

// ── POST /api/notifications/expiring — cron: notify users of expiring offers ─

router.post("/notifications/expiring", async (req, res) => {
  const secret   = process.env["CRON_SECRET"];
  const provided = (req.headers["x-cron-secret"] as string | undefined)
    ?? (req.headers["authorization"] as string | undefined)?.replace("Bearer ", "");
  if (secret && provided !== secret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const sent = await notifyExpiring();
    res.json({ ok: true, sent });
  } catch (err) {
    res.status(500).json({ error: "Erro ao processar notificações de expiração." });
  }
});

export default router;
