-- Sprint 20: OfertaBot — motor automático de ofertas por IA
-- Cria 4 novas tabelas e adiciona colunas de rastreabilidade na tabela ofertas

-- ── Colunas adicionais em ofertas ─────────────────────────────────────────────
ALTER TABLE ofertas ADD COLUMN IF NOT EXISTS origem TEXT NOT NULL DEFAULT 'usuario';
ALTER TABLE ofertas ADD COLUMN IF NOT EXISTS fonte_url TEXT;
ALTER TABLE ofertas ADD COLUMN IF NOT EXISTS folheto_import_id INTEGER;
ALTER TABLE ofertas ADD COLUMN IF NOT EXISTS folheto_crop_url TEXT;
ALTER TABLE ofertas ADD COLUMN IF NOT EXISTS folheto_original_url TEXT;
ALTER TABLE ofertas ADD COLUMN IF NOT EXISTS hash_deduplicacao TEXT;
ALTER TABLE ofertas ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(5,4);

CREATE INDEX IF NOT EXISTS idx_ofertas_origem ON ofertas(origem);
CREATE INDEX IF NOT EXISTS idx_ofertas_hash_dedup ON ofertas(hash_deduplicacao) WHERE hash_deduplicacao IS NOT NULL;

-- ── folheto_sources: fontes de folhetos cadastradas pelo admin ────────────────
CREATE TABLE IF NOT EXISTS folheto_sources (
  id             SERIAL PRIMARY KEY,
  mercado_id     INTEGER REFERENCES mercados_sugeridos(id) ON DELETE SET NULL,
  nome           TEXT NOT NULL,
  cidade         TEXT NOT NULL,
  bairro         TEXT,
  estado         TEXT NOT NULL DEFAULT 'MT',
  tipo_fonte     TEXT NOT NULL DEFAULT 'manual',
  url            TEXT NOT NULL,
  ativo          BOOLEAN NOT NULL DEFAULT true,
  prioridade     INTEGER NOT NULL DEFAULT 0,
  ultimo_check_at TIMESTAMP,
  ultimo_hash    TEXT,
  erro_consecutivo INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_folheto_sources_ativo ON folheto_sources(ativo);
CREATE INDEX IF NOT EXISTS idx_folheto_sources_cidade ON folheto_sources(cidade);
CREATE INDEX IF NOT EXISTS idx_folheto_sources_mercado ON folheto_sources(mercado_id);

-- ── folheto_imports: registro de cada folheto baixado ────────────────────────
CREATE TABLE IF NOT EXISTS folheto_imports (
  id              SERIAL PRIMARY KEY,
  source_id       INTEGER REFERENCES folheto_sources(id) ON DELETE CASCADE,
  mercado_id      INTEGER REFERENCES mercados_sugeridos(id) ON DELETE SET NULL,
  cidade          TEXT,
  bairro          TEXT,
  url_folheto     TEXT NOT NULL,
  titulo          TEXT,
  validade_inicio DATE,
  validade_fim    DATE,
  status          TEXT NOT NULL DEFAULT 'encontrado',
  hash_conteudo   TEXT,
  total_extraido  INTEGER NOT NULL DEFAULT 0,
  total_publicado INTEGER NOT NULL DEFAULT 0,
  total_duplicado INTEGER NOT NULL DEFAULT 0,
  total_revisao   INTEGER NOT NULL DEFAULT 0,
  total_rejeitado INTEGER NOT NULL DEFAULT 0,
  erro            TEXT,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_folheto_imports_source ON folheto_imports(source_id);
CREATE INDEX IF NOT EXISTS idx_folheto_imports_status ON folheto_imports(status);
CREATE INDEX IF NOT EXISTS idx_folheto_imports_created ON folheto_imports(created_at DESC);

-- ── folheto_import_items: produtos extraídos de cada folheto ─────────────────
CREATE TABLE IF NOT EXISTS folheto_import_items (
  id                  SERIAL PRIMARY KEY,
  import_id           INTEGER NOT NULL REFERENCES folheto_imports(id) ON DELETE CASCADE,
  mercado_id          INTEGER REFERENCES mercados_sugeridos(id) ON DELETE SET NULL,
  cidade              TEXT,
  bairro              TEXT,
  produto             TEXT,
  produto_normalizado TEXT,
  marca               TEXT,
  preco               REAL,
  preco_normal        REAL,
  preco_clube         REAL,
  programa_clube_name TEXT,
  tipo_preco          TEXT DEFAULT 'desconhecido',
  unidade             TEXT,
  categoria           TEXT,
  validade            DATE,
  confianca           NUMERIC(5,4),
  status              TEXT NOT NULL DEFAULT 'revisao',
  oferta_id           INTEGER REFERENCES ofertas(id) ON DELETE SET NULL,
  raw_text            TEXT,
  crop_url            TEXT,
  image_quality_score INTEGER,
  hash_deduplicacao   TEXT,
  motivo_rejeicao     TEXT,
  created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fii_import ON folheto_import_items(import_id);
CREATE INDEX IF NOT EXISTS idx_fii_status ON folheto_import_items(status);
CREATE INDEX IF NOT EXISTS idx_fii_hash ON folheto_import_items(hash_deduplicacao) WHERE hash_deduplicacao IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fii_mercado ON folheto_import_items(mercado_id);

-- ── product_image_candidates: candidatas a imagem oficial do produto ──────────
CREATE TABLE IF NOT EXISTS product_image_candidates (
  id                    SERIAL PRIMARY KEY,
  produto_normalizado   TEXT,
  produto_id            UUID REFERENCES produtos(id) ON DELETE SET NULL,
  origem                TEXT NOT NULL DEFAULT 'folheto_crop',
  image_url             TEXT NOT NULL,
  quality_score         INTEGER,
  status                TEXT NOT NULL DEFAULT 'candidato',
  source_import_item_id INTEGER REFERENCES folheto_import_items(id) ON DELETE SET NULL,
  created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pic_produto ON product_image_candidates(produto_normalizado);
CREATE INDEX IF NOT EXISTS idx_pic_status ON product_image_candidates(status);
