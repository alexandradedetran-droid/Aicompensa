// @ts-nocheck
/**
 * Admin Image Upload — Sprint 4.2.3
 *
 * POST /internal/products/:barcode/images/upload
 *
 * Accepts a base64-encoded product image from an admin/trusted caller,
 * extracts dimensions via sharp, computes a DCT pHash, stores the image
 * (local disk in dev, Supabase Storage in prod), and inserts it into
 * off_product_images with image_source='ADMIN_UPLOAD'.
 *
 * markAsOfficial=true immediately promotes the image to image_status='selected'
 * and deselects all previously-selected images for the same barcode so the
 * catalog priority rule in ImageResolverService serves it without scoring.
 */

import { Router, type Request, type Response } from "express";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger.js";
import { computePhashFromBuffer } from "../lib/image-resolver/duplicate-detector.js";

const router = Router();

const UPLOADS_DIR = path.join(process.cwd(), "uploads", "catalog");

const INTERNAL_API_KEY = process.env["INTERNAL_API_KEY"];
const IS_PROD          = process.env["NODE_ENV"] === "production";

function requireInternalKey(req: Request, res: Response, next: () => void): void {
  if (!IS_PROD && !INTERNAL_API_KEY) { next(); return; }
  const key = req.headers["x-internal-key"];
  if (!INTERNAL_API_KEY || key !== INTERNAL_API_KEY) {
    res.status(401).json({ error: "Acesso não autorizado." });
    return;
  }
  next();
}

// ── Storage helpers ───────────────────────────────────────────────────────────

const VALID_PREFIXES = [
  "data:image/jpeg;base64,",
  "data:image/png;base64,",
  "data:image/webp;base64,",
] as const;

const MIME_MAP: Record<string, string> = {
  "data:image/jpeg;base64,": "image/jpeg",
  "data:image/png;base64,":  "image/png",
  "data:image/webp;base64,": "image/webp",
};

const EXT_MAP: Record<string, string> = {
  "data:image/jpeg;base64,": "jpg",
  "data:image/png;base64,":  "png",
  "data:image/webp;base64,": "webp",
};

function uniqueName(barcode: string, ext: string): string {
  return `${barcode}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
}

async function saveLocal(buffer: Buffer, barcode: string, ext: string): Promise<string> {
  mkdirSync(UPLOADS_DIR, { recursive: true });
  const filename = uniqueName(barcode, ext);
  writeFileSync(path.join(UPLOADS_DIR, filename), buffer);
  const port = process.env["PORT"] ?? "8080";
  return `http://localhost:${port}/uploads/catalog/${filename}`;
}

async function saveSupabase(
  buffer: Buffer,
  barcode: string,
  ext: string,
  mime: string,
): Promise<string> {
  const supabaseUrl = process.env["SUPABASE_URL"]!;
  const serviceKey  = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
  const bucket      = "product-catalog";
  const filename    = uniqueName(barcode, ext);
  const uploadUrl   = `${supabaseUrl}/storage/v1/object/${bucket}/${filename}`;

  const res = await fetch(uploadUrl, {
    method:  "POST",
    headers: {
      Authorization:  `Bearer ${serviceKey}`,
      apikey:         serviceKey,
      "Content-Type": mime,
      "x-upsert":     "false",
    },
    body: buffer,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Supabase upload failed ${res.status}: ${body}`);
  }

  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${filename}`;
}

// ── Route ─────────────────────────────────────────────────────────────────────

router.post(
  "/internal/products/:barcode/images/upload",
  requireInternalKey,
  async (req: Request, res: Response) => {
    const { barcode } = req.params as { barcode: string };
    const {
      imageBase64,
      notes,
      marketId,
      markAsOfficial = false,
    } = (req.body ?? {}) as {
      imageBase64?: string;
      notes?: string;
      marketId?: string;
      markAsOfficial?: boolean;
    };

    if (!imageBase64 || typeof imageBase64 !== "string") {
      return res.status(400).json({ error: "imageBase64 obrigatório." });
    }

    const prefix = VALID_PREFIXES.find((p) => imageBase64.startsWith(p));
    if (!prefix) {
      return res.status(400).json({
        error: "Formato inválido. Use data:image/jpeg|png|webp;base64,…",
      });
    }

    // Verify product exists
    const { rows: productRows } = await pool.query(
      "SELECT barcode, name FROM off_products WHERE barcode = $1",
      [barcode],
    );
    if (!productRows.length) {
      return res.status(404).json({ error: `Produto '${barcode}' não encontrado.` });
    }

    const buffer        = Buffer.from(imageBase64.slice(prefix.length), "base64");
    const ext           = EXT_MAP[prefix]!;
    const mime          = MIME_MAP[prefix]!;
    const fileSizeBytes = buffer.length;

    // Dimension extraction
    let widthPx: number | null  = null;
    let heightPx: number | null = null;
    try {
      const sharpMod = (await import("sharp")).default as any;
      const meta = await sharpMod(buffer).metadata();
      widthPx  = meta.width  ?? null;
      heightPx = meta.height ?? null;
    } catch { /* sharp unavailable — continue without dimensions */ }

    // pHash (DCT, from buffer — no HTTP round-trip needed)
    const phash = await computePhashFromBuffer(buffer);

    // Image storage
    const useSupabase = !!(
      process.env["SUPABASE_URL"] && process.env["SUPABASE_SERVICE_ROLE_KEY"]
    );

    let imageUrl: string;
    try {
      imageUrl = useSupabase
        ? await saveSupabase(buffer, barcode, ext, mime)
        : await saveLocal(buffer, barcode, ext);
    } catch (err) {
      logger.error({ err, barcode }, "admin-image-upload: storage failed");
      return res.status(500).json({ error: "Falha ao armazenar imagem." });
    }

    // DB write — transaction so deselection + insert are atomic
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const imageStatus = markAsOfficial ? "selected"  : "candidate";
      const statusLegacy = markAsOfficial ? "approved" : "pending_review";
      const selectedBy  = markAsOfficial ? "ADMIN"     : null;

      // Deselect any currently selected images for this product
      let deselectedOthers = 0;
      if (markAsOfficial) {
        const dRes = await client.query(
          `UPDATE off_product_images
              SET image_status = 'candidate',
                  selected_by  = NULL
            WHERE barcode = $1
              AND image_status = 'selected'`,
          [barcode],
        );
        deselectedOthers = dRes.rowCount ?? 0;
      }

      const insertRes = await client.query(
        `INSERT INTO off_product_images
           (barcode, off_image_url, image_type,
            width_px, height_px, file_size_bytes,
            status, source,
            image_source, image_status, selected_by,
            phash, review_notes)
         VALUES ($1,$2,'front', $3,$4,$5, $6,'admin_upload',
                 'ADMIN_UPLOAD',$7,$8, $9,$10)
         RETURNING id`,
        [
          barcode,
          imageUrl,
          widthPx,
          heightPx,
          fileSizeBytes,
          statusLegacy,
          imageStatus,
          selectedBy,
          phash,
          notes ?? null,
        ],
      );

      const imageId = insertRes.rows[0]?.id ?? null;
      await client.query("COMMIT");

      logger.info(
        { barcode, imageId, markAsOfficial, phash, useSupabase },
        "admin-image-upload: success",
      );

      return res.status(201).json({
        imageId,
        barcode,
        productName:      productRows[0]?.name,
        imageUrl,
        imageSource:      "ADMIN_UPLOAD",
        imageStatus,
        selectedBy,
        widthPx,
        heightPx,
        fileSizeBytes,
        phash,
        isOfficial:       markAsOfficial,
        deselectedOthers,
        storageBackend:   useSupabase ? "supabase" : "local",
        marketId:         marketId ?? null,
      });
    } catch (err) {
      await client.query("ROLLBACK");
      logger.error({ err, barcode }, "admin-image-upload: DB write failed");
      return res.status(500).json({ error: "Erro ao salvar no banco." });
    } finally {
      client.release();
    }
  },
);

export default router;
