-- Migration: sistema de indicação
-- Executar no Supabase SQL Editor (ou via psql)

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS codigo_indicacao TEXT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS indicado_por_id INTEGER REFERENCES usuarios(id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_codigo_indicacao
  ON usuarios(codigo_indicacao)
  WHERE codigo_indicacao IS NOT NULL;
