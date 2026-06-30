-- Sprint 13: Alerta Inteligente de Compras
-- Creates shopping_analysis_history table for storing list analysis results.

CREATE TABLE IF NOT EXISTS shopping_analysis_history (
  id                  serial PRIMARY KEY,
  user_id             integer NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  mercado_ideal       text,
  economia_total      real NOT NULL DEFAULT 0,
  percentual_economia real NOT NULL DEFAULT 0,
  itens_encontrados   integer NOT NULL DEFAULT 0,
  itens_totais        integer NOT NULL DEFAULT 0,
  score               real NOT NULL DEFAULT 0,
  analise_json        jsonb NOT NULL DEFAULT '{}',
  push_sent           boolean NOT NULL DEFAULT false,
  created_at          timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shopping_analysis_user_id    ON shopping_analysis_history(user_id);
CREATE INDEX IF NOT EXISTS idx_shopping_analysis_created_at ON shopping_analysis_history(created_at);
