-- Migration: add_mercados_foundation
-- Purpose: Support Sprint 08 market-centered navigation.
-- Adds mercado_id FK on ofertas and ativo/logo_url on mercados_sugeridos.
-- All changes are additive — existing rows remain valid with safe defaults.

-- 1. Link offers to their canonical market entity (backward-compatible FK)
ALTER TABLE ofertas
  ADD COLUMN IF NOT EXISTS mercado_id integer
    REFERENCES mercados_sugeridos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ofertas_mercado_id ON ofertas (mercado_id);

-- 2. Allow markets to be hidden from the public list (default: visible)
ALTER TABLE mercados_sugeridos
  ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;

-- 3. Allow admin-uploaded or brand-provided logo images per market
ALTER TABLE mercados_sugeridos
  ADD COLUMN IF NOT EXISTS logo_url text;
