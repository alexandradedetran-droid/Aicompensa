-- Sprint 18: Moderação de Fachadas
-- Tabela para fotos de fachada submetidas por usuários, com fluxo de moderação admin

CREATE TABLE IF NOT EXISTS fotos_fachada (
  id                   SERIAL PRIMARY KEY,
  mercado_id           INTEGER NOT NULL REFERENCES mercados_sugeridos(id) ON DELETE CASCADE,
  usuario_id           INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  url                  TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'pendente',  -- pendente | aprovada | rejeitada
  motivo_rejeicao      TEXT,
  enviado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revisado_em          TIMESTAMPTZ,
  revisado_por_id      INTEGER REFERENCES usuarios(id),
  recompensa_concedida BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_fotos_fachada_mercado  ON fotos_fachada(mercado_id);
CREATE INDEX IF NOT EXISTS idx_fotos_fachada_usuario  ON fotos_fachada(usuario_id);
CREATE INDEX IF NOT EXISTS idx_fotos_fachada_status   ON fotos_fachada(status);
