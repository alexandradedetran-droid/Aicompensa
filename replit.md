# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## App: Comparador de Preços

Waze-style supermarket price comparison app. React + Vite frontend, Express API, PostgreSQL/Drizzle.

### Pages

- `/` — Home with stats, promoted deals, "Confirmadas hoje" section
- `/ofertas` — Browse/search/filter offers, sorted by trust score
- `/publicar` — Post a new offer with camera capture (base64 JPEG)
- `/ranking` — Community leaderboard by points
- `/perfil` — User profile with level progress bar
- `/admin` — Admin panel (no auth, simple mode)

### Admin Panel (`/admin`)

Four tabs:
- **Ofertas** — table of all offers with photo, price, score, denúncias; buttons: ❌ Excluir, ⭐ Destacar (toggle), 💰 Patrocinar (toggle)
- **Denúncias** — offers with `denuncias >= 1`; buttons: ✔ Marcar válida (resets denuncias), ❌ Remover
- **Usuários** — all users with level/points/total offers; button: 🚫 Bloquear / ✅ Desbloquear
- **Estatísticas** — total ofertas, ofertas hoje, confirmadas hoje, total denúncias, validações, usuários

### DB Schema

**usuarios**: id, nome, pontos, bloqueado (boolean), telefone, cpf, cidadeUsuario, estado, streak, ultimoLoginEm

**ofertas**: id, produto, categoria, marca, preco, mercado, bairro, cidade, fotoUrl, validade, latitude, longitude, dataCriacao, ultimaValidacaoEm, ultimaConfirmacaoEm, curtidas, validacoes, denuncias, confirmacoes, status (enum), usuarioId, destacada (boolean), patrocinada (boolean), produtoNormalizado

**offer_confirmations**: id, offer_id (→ofertas.id CASCADE), user_id (→usuarios.id CASCADE), confirmed_at, created_at
- Index: `idx_offer_conf_compound` on (offer_id, user_id, confirmed_at DESC)
- Used for: 24 h cooldown check — same user can't confirm same offer twice in 24 h

**alertas**: id, usuarioId, produto, precoAlvo, criadoEm

**favoritos**: id, usuarioId, ofertaId, criadoEm (unique on usuarioId+ofertaId)

### Dedup / Smart Publish System

File: `artifacts/api-server/src/lib/dedup.ts`

When a user publishes an offer, the backend:
1. Normalizes the product name via `normalizeProductName()` (strips accents, hyphens, expands units)
2. Searches for a similar offer: same `produto_normalizado` + same `mercado` (case-insensitive) + price within ±5% + created within 48 h + not expired/suspicious
3. **If duplicate found**: records a row in `offer_confirmations`, bumps `confirmacoes`, `validacoes`, `ultimaConfirmacaoEm` on the existing offer, awards +5 pts to user, returns `wasConfirmation: true`
4. **If no duplicate**: creates new offer with `produtoNormalizado` set, awards +10 pts, returns `wasConfirmation: false`

Constants (all in `dedup.ts`):
- `DEDUP_WINDOW_MS` = 48 h
- `DEDUP_PRICE_TOLERANCE` = 0.05 (±5%)
- `CONFIRM_COOLDOWN_MS` (in route) = 24 h
- `POINTS_NEW_OFFER` = 10, `POINTS_CONFIRMATION` = 5

### Gamification

- Score = `(validacoes * 2 + curtidas + confirmacoes) - (denuncias * 3)`
- Levels: Iniciante 0–49pts, Explorador 50–149pts, Caçador 150–499pts, Especialista 500–999pts, Mestre 1000–2499pts, Lenda 2500+pts
- +10pts on new publish, +5pts on confirmation, +2pts on validate
- Default sort on /ofertas = score desc

### Security

- Helmet.js: HSTS, X-Content-Type-Options, X-Frame-Options
- Rate limits: global 200/min, publish 5/10min, interactions 60/min, admin login 10/15min
- `ADMIN_TOKEN` env var (default "changeme-admin-token" in dev — change in prod!)
- `ADMIN_USER` / `ADMIN_PASS` env vars for admin login credentials
- `ALLOWED_ORIGINS` env var for CORS (default: all origins in dev)
- Blocked-user check on every publish/interaction
- Per-user 10 s publish cooldown (in-memory), 24 h confirmation cooldown (DB)

### Admin API Routes (all under /api)

- `GET  /admin/stats` — aggregate statistics
- `GET  /admin/ofertas` — all offers with admin fields
- `GET  /admin/usuarios` — all users with totalOfertas + bloqueado
- `POST /admin/usuarios/:id/bloquear` — toggle block
- `DELETE /ofertas/:id` — hard delete
- `POST /ofertas/:id/destacar` — toggle featured
- `POST /ofertas/:id/patrocinar` — toggle sponsored
- `POST /ofertas/:id/resetar-denuncias` — zero denuncias + set status=validada

### Important Notes

- Login required for publish/interact. Anonymous users can view all offers (no change).
- Photos stored as base64 data URLs in PostgreSQL `foto_url` column
- Never convert to vanilla JS — always use React + TypeScript
- `formatOferta` in ofertas.ts must always receive `pontos` for nivelUsuario to work
- After adding new columns: run `ALTER TABLE` manually (no migrations runner)
- Codegen: `pnpm --filter @workspace/api-spec run codegen`
- `wasConfirmation` field is only present in POST /ofertas response (not in GET list)
- publicar.tsx `onSuccess(data)` checks `data.wasConfirmation` to show different toast message
