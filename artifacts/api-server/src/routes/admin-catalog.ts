// @ts-nocheck
/**
 * Admin Catalog Manager — Sprint 4.2.5
 *
 * Routes for browsing, searching, creating and managing the product image catalog.
 * Called from the admin frontend; protected by x-admin-token or Bearer super-admin.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pool } from "@workspace/db";
import { db, usuariosTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Formato inválido. Use jpeg, png ou webp."));
  },
});

async function storeImageBuffer(buffer: Buffer, barcode: string, mime: string): Promise<string> {
  const ext = mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : "webp";
  const filename = `products/${barcode}/manual-${Date.now()}.${ext}`;

  const supabaseUrl = process.env["SUPABASE_URL"];
  const serviceKey  = process.env["SUPABASE_SERVICE_ROLE_KEY"];

  if (supabaseUrl && serviceKey) {
    const res = await fetch(`${supabaseUrl}/storage/v1/object/product-catalog/${filename}`, {
      method: "POST",
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
    return `${supabaseUrl}/storage/v1/object/public/product-catalog/${filename}`;
  }

  const dir = path.join(process.cwd(), "uploads", "catalog");
  mkdirSync(dir, { recursive: true });
  const localName = `${barcode}-${Date.now()}.${ext}`;
  writeFileSync(path.join(dir, localName), buffer);
  const port = process.env["PORT"] ?? "8080";
  return `http://localhost:${port}/uploads/catalog/${localName}`;
}

const router = Router();

const ADMIN_TOKEN = process.env["ADMIN_TOKEN"] ?? "changeme-admin-token";
const IS_PROD = process.env["NODE_ENV"] === "production";

async function requireAdminToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  const xToken = req.headers["x-admin-token"];
  if (xToken && xToken === ADMIN_TOKEN) { next(); return; }

  const authHeader = req.headers["authorization"];
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) {
      const [user] = await db
        .select({ id: usuariosTable.id, isAdmin: usuariosTable.isAdmin })
        .from(usuariosTable)
        .where(eq(usuariosTable.apiToken, bearer))
        .limit(1);
      if (user?.isAdmin) { next(); return; }
    }
  }

  if (!IS_PROD && ADMIN_TOKEN === "changeme-admin-token") { next(); return; }

  res.status(401).json({ error: "Acesso não autorizado." });
}

// ── GET /api/admin/catalog/stats ──────────────────────────────────────────────

router.get("/admin/catalog/stats", requireAdminToken, async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(DISTINCT barcode) FILTER (WHERE image_status = 'selected')                     AS products_with_official,
        COUNT(*)                FILTER (WHERE image_status = 'selected')                     AS official_images,
        COUNT(*)                FILTER (WHERE image_status = 'candidate')                    AS candidate_images,
        COUNT(*)                FILTER (WHERE image_status = 'review')                       AS pending_review,
        COUNT(*)                FILTER (WHERE image_source = 'ADMIN_UPLOAD')                 AS admin_uploaded,
        COUNT(*)                FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')     AS today_uploads,
        COUNT(*)                FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')       AS week_uploads,
        (SELECT COUNT(*) FROM off_products WHERE is_deleted = FALSE)                         AS total_products,
        (SELECT COUNT(*) FROM off_products WHERE is_deleted = FALSE
           AND source = 'ADMIN' AND created_at >= NOW() - INTERVAL '24 hours')              AS products_today,
        (SELECT COUNT(*) FROM off_products WHERE is_deleted = FALSE
           AND source = 'ADMIN' AND created_at >= NOW() - INTERVAL '7 days')               AS products_week
      FROM off_product_images
    `);

    const { rows: lastRows } = await pool.query(`
      SELECT barcode, name, brand, url, image_status, created_at
      FROM (
        SELECT DISTINCT ON (i.barcode)
          i.barcode,
          p.name,
          p.brand,
          i.off_image_url AS url,
          i.image_status,
          i.created_at
        FROM off_product_images i
        JOIN off_products p ON p.barcode = i.barcode
        WHERE i.image_source IN ('ADMIN_UPLOAD', 'ADMIN')
        ORDER BY i.barcode, i.created_at DESC
      ) sub
      ORDER BY created_at DESC
      LIMIT 8
    `);

    const r = rows[0]!;
    const total = Number(r.total_products) || 0;
    const withOfficial = Number(r.products_with_official) || 0;

    res.json({
      officialImages:       Number(r.official_images),
      candidateImages:      Number(r.candidate_images),
      adminUploaded:        Number(r.admin_uploaded),
      pendingReview:        Number(r.pending_review),
      todayUploads:         Number(r.today_uploads),
      weekUploads:          Number(r.week_uploads),
      productsToday:        Number(r.products_today),
      productsWeek:         Number(r.products_week),
      productsWithOfficial: withOfficial,
      productsWithoutImage: Math.max(0, total - withOfficial),
      totalProducts:        total,
      coveragePct:          total > 0 ? Math.round((withOfficial / total) * 100) : 0,
      lastUploaded:         lastRows.map(lr => ({
        barcode:     lr.barcode,
        name:        lr.name,
        brand:       lr.brand,
        url:         lr.url,
        imageStatus: lr.image_status,
        createdAt:   lr.created_at,
      })),
    });
  } catch (err) {
    logger.error({ err }, "GET /admin/catalog/stats failed");
    res.status(500).json({ error: "Erro ao buscar estatísticas." });
  }
});

// ── GET /api/admin/catalog/search ─────────────────────────────────────────────

router.get("/admin/catalog/search", requireAdminToken, async (req, res) => {
  const q = String(req.query["q"] ?? "").trim();
  if (!q) return res.json([]);

  try {
    const isBarcode = /^\d{4,14}$/.test(q);
    const pattern   = `%${q}%`;

    const { rows } = await pool.query(
      `SELECT
         p.barcode,
         p.name,
         p.brand,
         p.categories,
         COUNT(i.id) FILTER (WHERE i.image_status = 'selected')   AS official_count,
         COUNT(i.id) FILTER (WHERE i.image_status = 'candidate')  AS candidate_count,
         MAX(i.off_image_url) FILTER (WHERE i.image_status = 'selected') AS official_url
       FROM off_products p
       LEFT JOIN off_product_images i ON i.barcode = p.barcode
       WHERE p.is_deleted = FALSE
         AND (($1 AND p.barcode = $2)
          OR (NOT $1 AND (p.name ILIKE $3 OR p.brand ILIKE $3)))
       GROUP BY p.barcode, p.name, p.brand, p.categories
       ORDER BY
         CASE WHEN p.barcode = $2 THEN 0 ELSE 1 END,
         COUNT(i.id) DESC
       LIMIT 20`,
      [isBarcode, q, pattern],
    );

    res.json(rows.map(r => ({
      barcode:       r.barcode,
      name:          r.name,
      brand:         r.brand,
      categories:    r.categories,
      officialCount: Number(r.official_count),
      candidateCount:Number(r.candidate_count),
      officialUrl:   r.official_url,
    })));
  } catch (err) {
    logger.error({ err, q }, "GET /admin/catalog/search failed");
    res.status(500).json({ error: "Erro na busca." });
  }
});

// ── GET /api/admin/catalog/product/:barcode ───────────────────────────────────

router.get("/admin/catalog/product/:barcode", requireAdminToken, async (req, res) => {
  const { barcode } = req.params as { barcode: string };

  try {
    const { rows: productRows } = await pool.query(
      `SELECT barcode, name, brand, categories, quantity, category, created_at
       FROM off_products WHERE barcode = $1 AND is_deleted = FALSE`,
      [barcode],
    );

    if (!productRows.length) {
      return res.status(404).json({ error: `Produto '${barcode}' não encontrado.` });
    }

    const { rows: imgRows } = await pool.query(
      `SELECT
         id, off_image_url, image_type, image_source, image_status,
         selected_by, width_px, height_px, file_size_bytes, phash,
         review_notes, source, status, created_at
       FROM off_product_images
       WHERE barcode = $1
         AND image_status != 'rejected'
       ORDER BY
         CASE image_status
           WHEN 'selected'  THEN 0
           WHEN 'review'    THEN 1
           WHEN 'candidate' THEN 2
           ELSE 3
         END,
         created_at DESC`,
      [barcode],
    );

    const mapImg = (r: Record<string, unknown>) => ({
      id:            r.id,
      url:           r.off_image_url,
      imageType:     r.image_type,
      imageSource:   r.image_source,
      imageStatus:   r.image_status,
      selectedBy:    r.selected_by,
      widthPx:       r.width_px ? Number(r.width_px) : null,
      heightPx:      r.height_px ? Number(r.height_px) : null,
      fileSizeBytes: r.file_size_bytes ? Number(r.file_size_bytes) : null,
      phash:         r.phash,
      notes:         r.review_notes,
      createdAt:     r.created_at,
    });

    const official = imgRows.find(r => r.image_status === "selected") ?? null;
    const p = productRows[0]!;

    res.json({
      barcode:       p.barcode,
      name:          p.name,
      brand:         p.brand,
      categories:    p.categories,
      quantity:      p.quantity,
      category:      p.category,
      createdAt:     p.created_at,
      officialImage: official ? mapImg(official) : null,
      images:        imgRows.map(mapImg),
    });
  } catch (err) {
    logger.error({ err, barcode }, "GET /admin/catalog/product/:barcode failed");
    res.status(500).json({ error: "Erro ao buscar produto." });
  }
});

// ── POST /api/admin/catalog/products ─────────────────────────────────────────

router.post("/admin/catalog/products", requireAdminToken, async (req, res) => {
  const { barcode, name, brand, category, quantity } = (req.body ?? {}) as {
    barcode?: string;
    name?: string;
    brand?: string;
    category?: string;
    quantity?: string;
  };

  if (!barcode || !/^\d{4,14}$/.test(barcode.trim())) {
    return res.status(400).json({ error: "Código de barras inválido (4–14 dígitos)." });
  }
  if (!name || name.trim().length < 2) {
    return res.status(400).json({ error: "Nome do produto obrigatório (mínimo 2 caracteres)." });
  }

  const bc = barcode.trim();
  const nm = name.trim();

  try {
    const { rows: existing } = await pool.query(
      `SELECT barcode FROM off_products WHERE barcode = $1`,
      [bc],
    );
    if (existing.length) {
      return res.status(409).json({ error: `Produto '${bc}' já existe.`, barcode: bc });
    }

    const { rows } = await pool.query(
      `INSERT INTO off_products
         (barcode, name, brand, category, quantity, source, has_image, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'ADMIN', FALSE, NOW())
       RETURNING barcode, name, brand, category, quantity, created_at`,
      [bc, nm, brand?.trim() || null, category?.trim() || null, quantity?.trim() || null],
    );

    logger.info({ barcode: bc, name: nm }, "admin-catalog: product created");
    res.status(201).json({ ...rows[0], categories: null, officialImage: null, images: [] });
  } catch (err) {
    logger.error({ err, barcode: bc }, "POST /admin/catalog/products failed");
    res.status(500).json({ error: "Erro ao criar produto." });
  }
});

// ── PATCH /api/admin/catalog/images/:imageId/make-official ────────────────────

router.patch("/admin/catalog/images/:imageId/make-official", requireAdminToken, async (req, res) => {
  const imageId = Number(req.params["imageId"]);
  if (!Number.isFinite(imageId)) return res.status(400).json({ error: "imageId inválido." });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: imgRows } = await client.query(
      `SELECT barcode, image_status FROM off_product_images WHERE id = $1`,
      [imageId],
    );
    if (!imgRows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Imagem não encontrada." });
    }

    const { barcode, image_status } = imgRows[0]!;
    if (image_status === "selected") {
      await client.query("ROLLBACK");
      return res.json({ message: "Imagem já é oficial.", changed: false, deselectedOthers: 0 });
    }

    const { rowCount: deselected } = await client.query(
      `UPDATE off_product_images
          SET image_status = 'candidate', selected_by = NULL
        WHERE barcode = $1 AND image_status = 'selected'`,
      [barcode],
    );

    await client.query(
      `UPDATE off_product_images
          SET image_status = 'selected', selected_by = 'ADMIN', status = 'approved'
        WHERE id = $1`,
      [imageId],
    );

    await client.query("COMMIT");
    res.json({ message: "Imagem definida como oficial.", changed: true, deselectedOthers: deselected ?? 0 });
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error({ err, imageId }, "PATCH /admin/catalog/images/:id/make-official failed");
    res.status(500).json({ error: "Erro ao definir imagem oficial." });
  } finally {
    client.release();
  }
});

// ── PATCH /api/admin/catalog/images/:imageId/remove-official ──────────────────

router.patch("/admin/catalog/images/:imageId/remove-official", requireAdminToken, async (req, res) => {
  const imageId = Number(req.params["imageId"]);
  if (!Number.isFinite(imageId)) return res.status(400).json({ error: "imageId inválido." });

  try {
    const { rowCount } = await pool.query(
      `UPDATE off_product_images
          SET image_status = 'candidate', selected_by = NULL
        WHERE id = $1 AND image_status = 'selected'`,
      [imageId],
    );
    if (!rowCount) return res.status(404).json({ error: "Imagem oficial não encontrada." });
    res.json({ message: "Imagem oficial removida." });
  } catch (err) {
    logger.error({ err, imageId }, "PATCH /admin/catalog/images/:id/remove-official failed");
    res.status(500).json({ error: "Erro ao remover oficial." });
  }
});

// ── DELETE /api/admin/catalog/images/:imageId ─────────────────────────────────

router.delete("/admin/catalog/images/:imageId", requireAdminToken, async (req, res) => {
  const imageId = Number(req.params["imageId"]);
  if (!Number.isFinite(imageId)) return res.status(400).json({ error: "imageId inválido." });

  try {
    const { rows } = await pool.query(
      `UPDATE off_product_images
          SET image_status = 'rejected'
        WHERE id = $1 AND image_status != 'selected'
        RETURNING id`,
      [imageId],
    );
    if (!rows.length) {
      return res.status(404).json({ error: "Imagem não encontrada ou é a imagem oficial (remova o status oficial primeiro)." });
    }
    res.json({ message: "Imagem rejeitada." });
  } catch (err) {
    logger.error({ err, imageId }, "DELETE /admin/catalog/images/:id failed");
    res.status(500).json({ error: "Erro ao rejeitar imagem." });
  }
});

// ── POST /api/admin/catalog/images/upload — multipart image upload ────────────

router.post(
  "/admin/catalog/images/upload",
  requireAdminToken,
  upload.single("image"),
  async (req: Request, res: Response) => {
    const barcode = typeof req.body?.barcode === "string" ? req.body.barcode.trim() : null;
    const file    = req.file;

    if (!barcode || !/^\d{4,14}$/.test(barcode)) {
      res.status(400).json({ error: "barcode obrigatório (4–14 dígitos)." });
      return;
    }
    if (!file) {
      res.status(400).json({ error: "Campo 'image' com arquivo obrigatório." });
      return;
    }

    try {
      const { rows: productRows } = await pool.query(
        "SELECT barcode FROM off_products WHERE barcode = $1 AND is_deleted = FALSE",
        [barcode],
      );
      if (!productRows.length) {
        res.status(404).json({ error: `Produto '${barcode}' não encontrado.` });
        return;
      }

      let imageUrl: string;
      try {
        imageUrl = await storeImageBuffer(file.buffer, barcode, file.mimetype);
      } catch (err) {
        logger.error({ err, barcode }, "admin-catalog upload: storage failed");
        res.status(500).json({ error: "Falha ao armazenar imagem." });
        return;
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const insertRes = await client.query(
          `INSERT INTO off_product_images
             (barcode, off_image_url, image_type, file_size_bytes,
              status, source, image_source, image_status)
           VALUES ($1, $2, 'front', $3, 'pending_review', 'admin_upload', 'ADMIN_UPLOAD', 'candidate')
           RETURNING id`,
          [barcode, imageUrl, file.size],
        );
        const imageId = insertRes.rows[0]?.id ?? null;
        await client.query("COMMIT");

        logger.info({ barcode, imageId }, "admin-catalog upload: success");

        res.status(201).json({
          ok: true,
          image: {
            id:         imageId,
            url:        imageUrl,
            barcode,
            source:     "ADMIN_UPLOAD",
            isOfficial: false,
            status:     "candidate",
          },
        });
      } catch (err) {
        await client.query("ROLLBACK");
        logger.error({ err, barcode }, "admin-catalog upload: DB write failed");
        res.status(500).json({ error: "Erro ao salvar no banco." });
      } finally {
        client.release();
      }
    } catch (err) {
      logger.error({ err, barcode }, "admin-catalog upload: unexpected error");
      res.status(500).json({ error: "Erro inesperado." });
    }
  },
);

export default router;
