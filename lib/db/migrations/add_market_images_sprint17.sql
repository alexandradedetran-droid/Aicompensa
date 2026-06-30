-- Migration: add_market_images_sprint17
-- Purpose: Sprint 17 — Banco Oficial de Imagens dos Mercados.
-- Adds fachada_url and galeria_urls to mercados_sugeridos so each market
-- can store a real storefront photo and an optional gallery.
-- All changes are additive — existing rows are unaffected.

ALTER TABLE mercados_sugeridos
  ADD COLUMN IF NOT EXISTS fachada_url TEXT;

ALTER TABLE mercados_sugeridos
  ADD COLUMN IF NOT EXISTS galeria_urls JSONB NOT NULL DEFAULT '[]'::jsonb;
