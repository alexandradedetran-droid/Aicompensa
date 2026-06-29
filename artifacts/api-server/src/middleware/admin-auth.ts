import { type Request, type Response, type NextFunction } from "express";
import { db, usuariosTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const ADMIN_TOKEN = process.env["ADMIN_TOKEN"] ?? "";
const isProd      = process.env["NODE_ENV"] === "production";

const adminConfigured =
  !!process.env["ADMIN_TOKEN"] &&
  !!process.env["ADMIN_USER"]  &&
  !!process.env["ADMIN_PASS"];

/** Returns 503 in production when admin env vars are missing. */
export function requireAdminConfigured(_req: Request, res: Response, next: NextFunction): void {
  if (isProd && !adminConfigured) {
    res.status(503).json({
      error: "Admin panel not configured. Set ADMIN_TOKEN, ADMIN_USER and ADMIN_PASS secrets.",
    });
    return;
  }
  next();
}

/**
 * Accepts x-admin-token header OR Bearer token from a user with isAdmin=true.
 * Always run requireAdminConfigured before this in production.
 */
export async function requireAdminToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  const xToken = req.headers["x-admin-token"];
  if (xToken && xToken === ADMIN_TOKEN) {
    next();
    return;
  }

  const authHeader = req.headers["authorization"];
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) {
      const [user] = await db
        .select({ id: usuariosTable.id, isAdmin: usuariosTable.isAdmin })
        .from(usuariosTable)
        .where(eq(usuariosTable.apiToken, bearer))
        .limit(1);

      if (user?.isAdmin) {
        next();
        return;
      }
    }
  }

  res.status(401).json({ error: "Acesso não autorizado." });
}
