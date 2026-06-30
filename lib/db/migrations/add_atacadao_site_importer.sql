ALTER TABLE folheto_import_items
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'ofertabot',
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS image_original_url text,
  ADD COLUMN IF NOT EXISTS cep text,
  ADD COLUMN IF NOT EXISTS loja text,
  ADD COLUMN IF NOT EXISTS campanha text;

CREATE INDEX IF NOT EXISTS idx_fii_origem ON folheto_import_items(origem);
