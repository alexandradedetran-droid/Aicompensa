ALTER TABLE ofertas
  ADD COLUMN IF NOT EXISTS imagem_resolvida_url TEXT,
  ADD COLUMN IF NOT EXISTS origem_imagem TEXT
    CHECK (origem_imagem IN ('catalogo_interno', 'site_mercado', 'open_food_facts', 'folheto_crop', 'usuario_upload', 'sem_imagem')),
  ADD COLUMN IF NOT EXISTS imagem_match_score REAL,
  ADD COLUMN IF NOT EXISTS imagem_revisao_pendente BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS imagem_sugerida_url TEXT,
  ADD COLUMN IF NOT EXISTS imagem_sugerida_origem TEXT
    CHECK (imagem_sugerida_origem IN ('catalogo_interno', 'site_mercado', 'open_food_facts', 'folheto_crop', 'usuario_upload', 'sem_imagem')),
  ADD COLUMN IF NOT EXISTS imagem_resolucao_meta JSONB;

ALTER TABLE folheto_import_items
  ADD COLUMN IF NOT EXISTS imagem_resolvida_url TEXT,
  ADD COLUMN IF NOT EXISTS origem_imagem TEXT
    CHECK (origem_imagem IN ('catalogo_interno', 'site_mercado', 'open_food_facts', 'folheto_crop', 'usuario_upload', 'sem_imagem')),
  ADD COLUMN IF NOT EXISTS imagem_match_score REAL,
  ADD COLUMN IF NOT EXISTS imagem_revisao_pendente BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS imagem_sugerida_url TEXT,
  ADD COLUMN IF NOT EXISTS imagem_sugerida_origem TEXT
    CHECK (imagem_sugerida_origem IN ('catalogo_interno', 'site_mercado', 'open_food_facts', 'folheto_crop', 'usuario_upload', 'sem_imagem')),
  ADD COLUMN IF NOT EXISTS imagem_resolucao_meta JSONB;

CREATE INDEX IF NOT EXISTS idx_ofertas_origem_imagem ON ofertas(origem_imagem);
CREATE INDEX IF NOT EXISTS idx_ofertas_imagem_revisao ON ofertas(imagem_revisao_pendente);
CREATE INDEX IF NOT EXISTS idx_fii_origem_imagem ON folheto_import_items(origem_imagem);
CREATE INDEX IF NOT EXISTS idx_fii_imagem_revisao ON folheto_import_items(imagem_revisao_pendente);
