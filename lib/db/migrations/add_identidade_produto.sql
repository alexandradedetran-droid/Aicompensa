-- Migration Sprint #05: Identidade Inteligente de Produtos
-- Executar no Supabase SQL Editor (ou via psql)

-- Novos campos na tabela produtos
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS nome_canonico       TEXT;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS aliases            JSONB NOT NULL DEFAULT '[]';
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS confianca_ia       INTEGER;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS embalagem          TEXT;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS produto_fingerprint TEXT;

-- Índice único parcial para fingerprint (NULL não gera conflito)
CREATE UNIQUE INDEX IF NOT EXISTS idx_produtos_fingerprint
  ON produtos(produto_fingerprint)
  WHERE produto_fingerprint IS NOT NULL;

-- Índice GIN para consultas JSONB @> rápidas nos aliases
CREATE INDEX IF NOT EXISTS idx_produtos_aliases_gin
  ON produtos USING gin(aliases);

-- Backfill: seeds aliases com nome + nome_normalizado para produtos existentes
UPDATE produtos
SET aliases = jsonb_build_array(nome, nome_normalizado)
WHERE aliases = '[]'::jsonb
  AND (nome IS NOT NULL OR nome_normalizado IS NOT NULL);

-- Backfill: seeds nome_canonico a partir de nome para produtos existentes
UPDATE produtos
SET nome_canonico = nome
WHERE nome_canonico IS NULL AND nome IS NOT NULL;
