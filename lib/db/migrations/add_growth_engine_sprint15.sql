-- Sprint 15: Growth Engine
-- Tables: referrals, user_feedback, growth_events

CREATE TABLE IF NOT EXISTS referrals (
  id              serial      PRIMARY KEY,
  inviter_user_id integer     NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  invited_user_id integer     NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  codigo          text        NOT NULL,
  status          text        NOT NULL DEFAULT 'cadastrado',
  created_at      timestamp   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referrals_inviter  ON referrals(inviter_user_id);
CREATE INDEX IF NOT EXISTS idx_referrals_invited  ON referrals(invited_user_id);

CREATE TABLE IF NOT EXISTS user_feedback (
  id         serial    PRIMARY KEY,
  user_id    integer   NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  rating     integer   NOT NULL,
  comment    text,
  context    text,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_feedback_user ON user_feedback(user_id);

CREATE TABLE IF NOT EXISTS growth_events (
  id         serial    PRIMARY KEY,
  user_id    integer   NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo       text      NOT NULL,
  metadata   jsonb     NOT NULL DEFAULT '{}',
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_growth_events_user    ON growth_events(user_id);
CREATE INDEX IF NOT EXISTS idx_growth_events_tipo    ON growth_events(tipo);
CREATE INDEX IF NOT EXISTS idx_growth_events_created ON growth_events(created_at);
