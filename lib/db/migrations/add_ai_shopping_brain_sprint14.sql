-- Sprint 14: AI Shopping Brain
-- Tables: shopping_profile, shopping_preference_score, shopping_events

-- ── User intelligence profile (one row per user) ──────────────────────────────
CREATE TABLE IF NOT EXISTS shopping_profile (
  id serial PRIMARY KEY,
  user_id integer NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
  mercado_preferido text,
  categoria_preferida text,
  dia_preferido integer,       -- 0=Sun … 6=Sat
  horario_preferido integer,   -- hour 0–23
  ticket_medio real NOT NULL DEFAULT 0,
  economia_total real NOT NULL DEFAULT 0,
  economia_30dias real NOT NULL DEFAULT 0,
  ultima_atualizacao timestamp NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_shopping_profile_user_id ON shopping_profile(user_id);

-- ── Per-product preference score (0–100) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS shopping_preference_score (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  produto text NOT NULL,
  score real NOT NULL DEFAULT 50,
  ultima_compra timestamp,
  ultima_visualizacao timestamp,
  ultima_notificacao timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pref_score_user_id ON shopping_preference_score(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pref_score_user_produto ON shopping_preference_score(user_id, produto);

-- ── Event log for behavioural learning ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS shopping_events (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  produto text,
  mercado text,
  oferta_id integer,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shopping_events_user_id ON shopping_events(user_id);
CREATE INDEX IF NOT EXISTS idx_shopping_events_tipo ON shopping_events(tipo);
CREATE INDEX IF NOT EXISTS idx_shopping_events_created_at ON shopping_events(created_at);
