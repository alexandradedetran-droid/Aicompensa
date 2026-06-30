import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  bigint,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ── off_products ───────────────────────────────────────────────────────────────
// NOTE: name_normalized, brand_normalized are GENERATED ALWAYS AS STORED columns
// in PostgreSQL. They are defined here as plain text for SELECT type inference
// only. Never INSERT into these columns via Drizzle — always use pool.query().
export const offProductsTable = pgTable("off_products", {
  barcode:           text("barcode").primaryKey(),
  offCode:           text("off_code"),
  name:              text("name").notNull(),
  nameNormalized:    text("name_normalized"),  // GENERATED in PG
  brand:             text("brand"),
  brandNormalized:   text("brand_normalized"), // GENERATED in PG
  quantity:          text("quantity"),
  quantityG:         integer("quantity_g"),
  category:          text("category"),
  categories:        text("categories").array(),
  primaryImageId:    integer("primary_image_id"),
  imageUrl:          text("image_url"),
  imageThumbUrl:     text("image_thumb_url"),
  offLastModified:   bigint("off_last_modified", { mode: "number" }),
  offUpdatedAt:      timestamp("off_updated_at", { withTimezone: true }),
  isDeleted:         boolean("is_deleted").notNull().default(false),
  dataQualityScore:  integer("data_quality_score").default(0),
  hasImage:          boolean("has_image").notNull().default(false),
  source:            text("source").notNull().default("off"),
  createdAt:         timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:         timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("off_products_category_idx").on(t.category),
  index("off_products_has_image_idx").on(t.hasImage),
  index("off_products_brand_idx").on(t.brandNormalized),
]);

export type OffProduct = typeof offProductsTable.$inferSelect;

// ── off_product_aliases ────────────────────────────────────────────────────────
export const offProductAliasesTable = pgTable("off_product_aliases", {
  id:              serial("id").primaryKey(),
  alias:           text("alias").notNull(),
  aliasNormalized: text("alias_normalized"),  // GENERATED in PG
  barcode:         text("barcode"),
  aliasType:       text("alias_type").notNull(),
  confidence:      text("confidence").notNull().default("high"),
  usageCount:      integer("usage_count").notNull().default(0),
  lastUsedAt:      timestamp("last_used_at", { withTimezone: true }),
  createdBy:       text("created_by").notNull().default("system"),
  createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("off_aliases_barcode_idx").on(t.barcode),
]);

export type OffProductAlias = typeof offProductAliasesTable.$inferSelect;

// ── off_product_images ─────────────────────────────────────────────────────────
export const offProductImagesTable = pgTable("off_product_images", {
  id:              serial("id").primaryKey(),
  barcode:         text("barcode").notNull(),
  offImageKey:     text("off_image_key"),
  offImageUrl:     text("off_image_url").notNull(),
  offImgid:        text("off_imgid"),
  offRevision:     integer("off_revision"),
  offUploadedT:    bigint("off_uploaded_t", { mode: "number" }),
  r2Key:           text("r2_key"),
  r2Url:           text("r2_url"),
  imageType:       text("image_type").notNull().default("other"),
  language:        text("language"),
  widthPx:         integer("width_px"),
  heightPx:        integer("height_px"),
  fileSizeBytes:   integer("file_size_bytes"),
  qualityScore:    integer("quality_score"),
  qualityBreakdown: jsonb("quality_breakdown"),
  status:          text("status").notNull().default("pending_review"),
  rejectionReason: text("rejection_reason"),
  reviewedBy:      text("reviewed_by"),
  reviewedAt:      timestamp("reviewed_at", { withTimezone: true }),
  reviewNotes:     text("review_notes"),
  phash:           text("phash"),
  isPrimary:       boolean("is_primary").notNull().default(false),
  isMirrored:      boolean("is_mirrored").notNull().default(false),
  source:          text("source").notNull().default("off"),
  createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:       timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("off_images_barcode_idx").on(t.barcode),
  index("off_images_status_idx").on(t.status),
  index("off_images_primary_idx").on(t.barcode).where(sql`${t.isPrimary} = TRUE`),
]);

export type OffProductImage = typeof offProductImagesTable.$inferSelect;

// ── product_resolution_logs ────────────────────────────────────────────────────
export const productResolutionLogsTable = pgTable("product_resolution_logs", {
  id:                bigint("id", { mode: "number" }).primaryKey(),
  inputText:         text("input_text"),
  inputBarcode:      text("input_barcode"),
  inputBrandHint:    text("input_brand_hint"),
  inputCategoryHint: text("input_category_hint"),
  resolvedBarcode:   text("resolved_barcode"),
  resolvedName:      text("resolved_name"),
  confidence:        text("confidence"),
  resolutionStep:    text("resolution_step"),
  similarityScore:   integer("similarity_score"),
  latencyMs:         integer("latency_ms"),
  sessionId:         text("session_id"),
  userId:            text("user_id"),
  feedback:          text("feedback"),
  feedbackBarcode:   text("feedback_barcode"),
  feedbackAt:        timestamp("feedback_at", { withTimezone: true }),
  createdAt:         timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("resolution_logs_step_idx").on(t.resolutionStep),
  index("resolution_logs_created_idx").on(t.createdAt),
  uniqueIndex("resolution_logs_id_idx").on(t.id),
]);

export type ProductResolutionLog = typeof productResolutionLogsTable.$inferSelect;
