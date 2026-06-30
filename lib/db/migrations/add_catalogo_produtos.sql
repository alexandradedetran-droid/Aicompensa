-- Migration: catálogo inteligente de produtos
-- Executar no Supabase SQL Editor (ou via psql)

CREATE TABLE IF NOT EXISTS produtos (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome               TEXT NOT NULL,
  nome_normalizado   TEXT NOT NULL,
  marca              TEXT,
  categoria          TEXT,
  subcategoria       TEXT,
  unidade            TEXT,
  quantidade         TEXT,
  codigo_barras      TEXT,
  imagem_premium_url  TEXT,
  imagem_original_url TEXT,
  prompt_imagem      TEXT,
  status_imagem      TEXT NOT NULL DEFAULT 'pendente',
  total_ofertas      INTEGER NOT NULL DEFAULT 0,
  primeira_oferta_em TIMESTAMP,
  ultima_oferta_em   TIMESTAMP,
  criado_em          TIMESTAMP DEFAULT NOW(),
  atualizado_em      TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_produtos_nome_normalizado
  ON produtos(nome_normalizado);

CREATE INDEX IF NOT EXISTS idx_produtos_categoria
  ON produtos(categoria);

CREATE INDEX IF NOT EXISTS idx_produtos_status_imagem
  ON produtos(status_imagem);

-- Add produto_id FK to ofertas
ALTER TABLE ofertas ADD COLUMN IF NOT EXISTS produto_id UUID REFERENCES produtos(id);

CREATE INDEX IF NOT EXISTS idx_ofertas_produto_id
  ON ofertas(produto_id);
