// @ts-nocheck
import { Router } from "express";
import { db, pushSubscriptionsTable, pushTokensTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { getVapidPublicKey, isVapidConfigured } from "../lib/push";

const router = Router();

// GET /api/push/vapid-key — returns the VAPID public key for the frontend
router.get("/push/vapid-key", (_req, res) => {
  if (!isVapidConfigured()) {
    res.status(503).json({ error: "Push notifications not configured" });
    return;
  }
  res.json({ publicKey: getVapidPublicKey() });
});

// POST /api/push/subscribe — saves a Web Push subscription for the authenticated user
router.post("/push/subscribe", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const body = req.body as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };

  const { endpoint, keys } = body;

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    res.status(400).json({ error: "Subscription inválida" });
    return;
  }

  // Upsert by endpoint — same browser/device may re-subscribe
  const existing = await db
    .select({ id: pushSubscriptionsTable.id })
    .from(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.endpoint, endpoint))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(pushSubscriptionsTable)
      .set({ p256dh: keys.p256dh, auth: keys.auth, usuarioId: userId })
      .where(eq(pushSubscriptionsTable.id, existing[0]!.id));
  } else {
    await db.insert(pushSubscriptionsTable).values({
      usuarioId: userId,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    });
  }

  res.status(201).json({ ok: true });
});

// DELETE /api/push/unsubscribe — removes the subscription for this user+endpoint
router.delete("/push/unsubscribe", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const { endpoint } = req.body as { endpoint?: string };

  if (!endpoint) {
    res.status(400).json({ error: "endpoint obrigatório" });
    return;
  }

  await db
    .delete(pushSubscriptionsTable)
    .where(
      and(
        eq(pushSubscriptionsTable.usuarioId, userId),
        eq(pushSubscriptionsTable.endpoint, endpoint),
      ),
    );

  res.json({ ok: true });
});

// POST /api/push/register — register or refresh a simple mobile push token
router.post("/push/register", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const { pushToken, device, platform } = req.body as {
    pushToken?: string;
    device?:    string;
    platform?:  string;
  };

  if (!pushToken || typeof pushToken !== "string" || pushToken.length < 8) {
    res.status(400).json({ error: "pushToken inválido." });
    return;
  }

  // Upsert by token — same device may re-register
  const [existing] = await db
    .select({ id: pushTokensTable.id })
    .from(pushTokensTable)
    .where(eq(pushTokensTable.pushToken, pushToken))
    .limit(1);

  if (existing) {
    await db
      .update(pushTokensTable)
      .set({ userId, device: device ?? null, platform: platform ?? null, ultimaAtividade: new Date() })
      .where(eq(pushTokensTable.id, existing.id));
  } else {
    await db.insert(pushTokensTable).values({
      userId,
      pushToken,
      device:          device   ?? null,
      platform:        platform ?? null,
      ultimaAtividade: new Date(),
    });
  }

  res.status(201).json({ ok: true });
});

export default router;
