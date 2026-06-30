-- Sprint #05.2 — Lista Compartilhada: emoji, papel, permissao
-- Run in Supabase SQL Editor before deploying backend

ALTER TABLE lista_compartilhada
  ADD COLUMN IF NOT EXISTS emoji text NOT NULL DEFAULT '🛒';

ALTER TABLE lista_compartilhada_membros
  ADD COLUMN IF NOT EXISTS papel text NOT NULL DEFAULT 'member',
  ADD COLUMN IF NOT EXISTS permissao text NOT NULL DEFAULT 'edit';

-- Promote existing creators to owner role
UPDATE lista_compartilhada_membros m
SET papel = 'owner'
FROM lista_compartilhada l
WHERE m.lista_id = l.id
  AND m.usuario_id = l.criador_id;
