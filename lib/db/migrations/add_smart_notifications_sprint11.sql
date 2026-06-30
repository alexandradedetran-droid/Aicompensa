-- Sprint 11: Smart Notification Engine
-- Additive migration — two new tables for delivery tracking and product muting.

-- 1. Delivery tracking — one row per notification dispatched to a user
CREATE TABLE IF NOT EXISTS notification_delivery (
  id               serial PRIMARY KEY,
  notification_id  integer NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_id          integer NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  delivered_at     timestamp NOT NULL DEFAULT now(),
  opened_at        timestamp,
  dismissed_at     timestamp,
  clicked          boolean NOT NULL DEFAULT false,
  push_sent        boolean NOT NULL DEFAULT false,
  push_success     boolean NOT NULL DEFAULT false,
  created_at       timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notif_delivery_user_id         ON notification_delivery(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_delivery_notification_id ON notification_delivery(notification_id);
CREATE INDEX IF NOT EXISTS idx_notif_delivery_created_at      ON notification_delivery(created_at);

-- 2. Product muting — user silences a product so it never generates push (internal history kept)
CREATE TABLE IF NOT EXISTS notification_mute (
  id           serial PRIMARY KEY,
  user_id      integer NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  product_name text NOT NULL,
  created_at   timestamp NOT NULL DEFAULT now(),
  UNIQUE(user_id, product_name)
);
CREATE INDEX IF NOT EXISTS idx_notif_mute_user_id ON notification_mute(user_id);
