-- Migration: add_preco_clube
-- Purpose: Support loyalty/app/club prices alongside the regular price.
-- The existing `preco` column continues to hold the normal (non-club) price.
-- New columns are additive — all existing rows remain valid with defaults.

ALTER TABLE ofertas
  ADD COLUMN IF NOT EXISTS preco_normal REAL,
  ADD COLUMN IF NOT EXISTS preco_clube  REAL,
  ADD COLUMN IF NOT EXISTS programa_clube_nome TEXT,
  ADD COLUMN IF NOT EXISTS tipo_preco TEXT NOT NULL DEFAULT 'desconhecido'
    CHECK (tipo_preco IN ('normal', 'clube', 'ambos', 'desconhecido'));

-- Back-fill precoNormal from the existing preco for all current rows
UPDATE ofertas SET preco_normal = preco WHERE preco_normal IS NULL;

-- Mark existing single-price offers as 'normal'
UPDATE ofertas SET tipo_preco = 'normal' WHERE preco_clube IS NULL AND tipo_preco = 'desconhecido';

-- Indexes for admin queries and possible filtering by tipo_preco
CREATE INDEX IF NOT EXISTS idx_ofertas_tipo_preco    ON ofertas (tipo_preco);
CREATE INDEX IF NOT EXISTS idx_ofertas_preco_clube   ON ofertas (preco_clube) WHERE preco_clube IS NOT NULL;
