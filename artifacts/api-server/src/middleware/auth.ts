// @ts-nocheck
import type { Request, Response, NextFunction } from "express";
import "express-session";
import { db, usuariosTable } from "@workspace/db";
import { eq } from "drizzle-orm";

declare module "express-session" {
  interface SessionData {
    userId: number;
  }
}

/**
 * Middleware that requires an authenticated session OR a valid Bearer token.
 *
 * Auth flow (first match wins):
 *  1. req.session.userId — cookie-based session (standard browsers)
 *  2. Authorization: Bearer <token> — token-based (mobile, WebView, cross-origin)
 *
 * When the Bearer token path succeeds, req.session.userId is populated so
 * route handlers don't need to care which path was used.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Fast path: cookie-based session already resolved
  if (req.session.userId) {
    next();
    return;
  }

  // Fallback: Bearer token in Authorization header
  const authHeader = req.headers["authorization"];
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) {
      const [user] = await db
        .select({ id: usuariosTable.id })
        .from(usuariosTable)
        .where(eq(usuariosTable.apiToken, token))
        .limit(1);

      if (user) {
        req.session.userId = user.id;
        next();
        return;
      }
    }
  }

  res.status(401).json({ error: "Não autorizado. Faça login para continuar." });
}
