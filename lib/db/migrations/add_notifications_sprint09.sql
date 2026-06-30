-- Sprint 09: Sistema Inteligente de Notificações
-- Additive migration — extends notifications table and adds two new tables.

-- 1. Extend notifications with new action/metadata columns
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS acao_tipo    text,
  ADD COLUMN IF NOT EXISTS acao_id      text,
  ADD COLUMN IF NOT EXISTS imagem_url   text,
  ADD COLUMN IF NOT EXISTS enviada_push boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS metadata     jsonb   NOT NULL DEFAULT '{}';

-- 2. Boolean notification preferences per user (separate from notificacao_preferencias
--    which is the price-alert/distance/category preferences table)
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id             integer PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  ofertas_lista       boolean NOT NULL DEFAULT true,
  lista_compartilhada boolean NOT NULL DEFAULT true,
  mercados_favoritos  boolean NOT NULL DEFAULT true,
  queda_preco         boolean NOT NULL DEFAULT true,
  resumo_semanal      boolean NOT NULL DEFAULT true,
  novidades           boolean NOT NULL DEFAULT true,
  marketing           boolean NOT NULL DEFAULT false,
  push_enabled        boolean NOT NULL DEFAULT false,
  created_at          timestamp NOT NULL DEFAULT now(),
  updated_at          timestamp NOT NULL DEFAULT now()
);

-- 3. Simple push tokens (mobile / future native push, independent of Web Push subscriptions)
CREATE TABLE IF NOT EXISTS push_tokens (
  id               serial PRIMARY KEY,
  user_id          integer NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  device           text,
  platform         text,
  push_token       text NOT NULL,
  ultima_atividade timestamp NOT NULL DEFAULT now(),
  created_at       timestamp NOT NULL DEFAULT now()
);

-- 4. Additional indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_id_only  ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_criada_em_idx ON notifications(criada_em);
CREATE INDEX IF NOT EXISTS idx_notifications_lida_idx      ON notifications(lida);
CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id         ON push_tokens(user_id);
