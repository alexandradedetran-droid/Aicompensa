import { pgTable, serial, text, real, integer, timestamp, pgEnum, boolean, index, uniqueIndex, numeric, uuid, jsonb, date } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ofertaStatusEnum = pgEnum("oferta_status", ["nova", "validada", "suspeita", "expirada", "pendente_validacao", "revisao_manual", "recusada", "removida", "arquivada"]);

/** Product catalog — one row per unique normalized product name. */
export const produtosTable = pgTable("produtos", {
  id:                uuid("id").primaryKey().defaultRandom(),
  nome:              text("nome").notNull(),
  nomeNormalizado:   text("nome_normalizado").notNull(),
  marca:             text("marca"),
  categoria:         text("categoria"),
  subcategoria:      text("subcategoria"),
  unidade:           text("unidade"),
  quantidade:        text("quantidade"),
  nomeCanonico:      text("nome_canonico"),
  aliases:           jsonb("aliases").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  confiancaIA:       integer("confianca_ia"),
  embalagem:         text("embalagem"),
  produtoFingerprint: text("produto_fingerprint"),
  codigoBarras:      text("codigo_barras"),
  imagemPremiumUrl:  text("imagem_premium_url"),
  imagemOriginalUrl: text("imagem_original_url"),
  promptImagem:      text("prompt_imagem"),
  statusImagem:      text("status_imagem").notNull().default("pendente"),
  totalOfertas:      integer("total_ofertas").notNull().default(0),
  primeiraOfertaEm:  timestamp("primeira_oferta_em"),
  ultimaOfertaEm:    timestamp("ultima_oferta_em"),
  criadoEm:          timestamp("criado_em").defaultNow(),
  atualizadoEm:      timestamp("atualizado_em").defaultNow(),
}, (t) => [
  uniqueIndex("idx_produtos_nome_normalizado").on(t.nomeNormalizado),
  index("idx_produtos_categoria").on(t.categoria),
  index("idx_produtos_status_imagem").on(t.statusImagem),
  index("idx_produtos_fingerprint").on(t.produtoFingerprint),
]);

export type Produto = typeof produtosTable.$inferSelect;

export const usuariosTable = pgTable("usuarios", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),
  pontos: integer("pontos").notNull().default(0),
  bloqueado: boolean("bloqueado").notNull().default(false),
  email: text("email"),
  senhaHash: text("senha_hash"),
  telefone: text("telefone"),
  cpf: text("cpf"),
  cidadeUsuario: text("cidade_usuario"),
  estado: text("estado"),
  streak: integer("streak").notNull().default(0),
  ultimoLoginEm: timestamp("ultimo_login_em"),
  apiToken: text("api_token"),
  isAdmin: boolean("is_admin").notNull().default(false),
  suspensoAte: timestamp("suspenso_ate"),
  motivoPunicao: text("motivo_punicao"),
  removido: boolean("removido").notNull().default(false),
  removidoEm: timestamp("removido_em"),
  unlimitedPosts: boolean("unlimited_posts").notNull().default(false),
  codigoIndicacao: text("codigo_indicacao"),
  indicadoPorId: integer("indicado_por_id"),
});

export const insertUsuarioSchema = createInsertSchema(usuariosTable).omit({ id: true });
export type InsertUsuario = z.infer<typeof insertUsuarioSchema>;
export type Usuario = typeof usuariosTable.$inferSelect;

export const ofertasTable = pgTable("ofertas", {
  id: serial("id").primaryKey(),
  produto: text("produto").notNull(),
  categoria: text("categoria").notNull().default("Outros"),
  marca: text("marca"),
  preco: real("preco").notNull(),
  mercado: text("mercado").notNull(),
  bairro: text("bairro"),
  cidade: text("cidade"),
  fotoUrl: text("foto_url"),
  validade: timestamp("validade"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  dataCriacao: timestamp("data_criacao").notNull().defaultNow(),
  ultimaValidacaoEm: timestamp("ultima_validacao_em"),
  ultimaConfirmacaoEm: timestamp("ultima_confirmacao_em"),
  curtidas: integer("curtidas").notNull().default(0),
  validacoes: integer("validacoes").notNull().default(0),
  denuncias: integer("denuncias").notNull().default(0),
  confirmacoes: integer("confirmacoes").notNull().default(0),
  status: ofertaStatusEnum("status").notNull().default("nova"),
  usuarioId: integer("usuario_id").notNull().references(() => usuariosTable.id),
  destacada: boolean("destacada").notNull().default(false),
  patrocinada: boolean("patrocinada").notNull().default(false),
  produtoNormalizado: text("produto_normalizado"),
  /** Pre-computed score = validacoes*2 + curtidas + confirmacoes - denuncias*3. Updated on every interaction. */
  scoreCache: integer("score_cache").notNull().default(0),
  /** Source type: organica (user), admin, importada, recorrente, patrocinada_externa */
  tipoOrigem: text("tipo_origem").notNull().default("organica"),
  /** Unit of measure: kg, g, un, litro, ml, pacote, caixa, fardo */
  unidade: text("unidade").default("un"),
  /** IA Admin audit: confidence score 0.00–1.00 for gallery submissions */
  iaScore: real("ia_score"),
  /** IA Admin audit: human-readable reason for the audit decision */
  iaMotivo: text("ia_motivo"),
  /** IA Admin audit: timestamp when the audit was performed */
  iaAnaliseEm: timestamp("ia_analise_em"),
  /** User lifecycle status: null = ativa, encerrada, excluida, pode_ter_acabado */
  statusUsuario: text("status_usuario").$type<"encerrada" | "excluida" | "pode_ter_acabado">(),
  /** Community "não encontrei mais" counter — triggers pode_ter_acabado at threshold */
  naoEncontreiMais: integer("nao_encontrei_mais").notNull().default(0),
  /** Timestamp when user marked the offer as encerrada or excluida */
  dataEncerramento: timestamp("data_encerramento"),
  /** How many times the owner renewed this offer (max 3) */
  renovacoes: integer("renovacoes").notNull().default(0),
  /** Timestamp of the last renewal (used for 24 h cooldown check) */
  ultimaRenovacaoEm: timestamp("ultima_renovacao_em"),
  /** Canonical market name — normalised (title-case, alias-resolved). Used for dedup analytics. */
  mercadoNormalizado: text("mercado_normalizado"),
  /** Reference to the product catalog entry. Null for old offers. */
  produtoId: uuid("produto_id").references(() => produtosTable.id),
  /** Regular/general price (no loyalty/club required). Mirrors preco for backward compat. */
  precoNormal: real("preco_normal"),
  /** Loyalty/club/app price shown on the label (lower value). Null when not present. */
  precoClube: real("preco_clube"),
  /** Name of the loyalty program detected on the label (e.g. "Vuon", "Clube Comper"). */
  programaClubeName: text("programa_clube_nome"),
  /** Whether the offer has a normal price, a club price, or both. */
  tipoPreco: text("tipo_preco").notNull().default("desconhecido").$type<"normal" | "clube" | "ambos" | "desconhecido">(),
  /** Reference to the canonical market entity (mercados_sugeridos). Null for legacy offers. */
  mercadoId: integer("mercado_id").references(() => mercadosSugeridosTable.id, { onDelete: "set null" }),
  /** Origin: usuario (manual), ofertabot (automated), admin, importada */
  origem: text("origem").notNull().default("usuario"),
  /** Source URL for bot-imported offers (flyer page URL). */
  fonteUrl: text("fonte_url"),
  /** FK to folheto_imports that originated this offer. */
  folhetoImportId: integer("folheto_import_id"),
  /** URL of the cropped product image extracted from the flyer. */
  folhetoCropUrl: text("folheto_crop_url"),
  /** URL of the full original flyer page. */
  folhetoOriginalUrl: text("folheto_original_url"),
  /** Deduplication hash: mercadoId+produtoNorm+marca+unidade+preco+validade */
  hashDeduplicacao: text("hash_deduplicacao"),
  /** AI extraction confidence score (0.0000–1.0000). */
  confidenceScore: numeric("confidence_score", { precision: 5, scale: 4 }),
}, (t) => [
  index("idx_ofertas_produto").on(t.produto),
  index("idx_ofertas_categoria").on(t.categoria),
  index("idx_ofertas_mercado").on(t.mercado),
  index("idx_ofertas_mercado_normalizado").on(t.mercadoNormalizado),
  index("idx_ofertas_data_criacao").on(t.dataCriacao),
  index("idx_ofertas_status").on(t.status),
  index("idx_ofertas_usuario_id").on(t.usuarioId),
  index("idx_ofertas_produto_normalizado").on(t.produtoNormalizado),
  index("idx_ofertas_confirmacoes").on(t.confirmacoes),
  index("idx_ofertas_score_cache").on(t.scoreCache),
  index("idx_ofertas_produto_id").on(t.produtoId),
  // Feed performance: filters used on every GET /api/ofertas request
  index("idx_ofertas_validade").on(t.validade),
  index("idx_ofertas_denuncias").on(t.denuncias),
  index("idx_ofertas_status_usuario").on(t.statusUsuario),
  // Composite index for the default "score" feed sort (status + recency + id)
  // Covers the WHERE status NOT IN (...) + ORDER BY dataCriacao DESC, id DESC path
  index("idx_ofertas_feed_score").on(t.status, t.dataCriacao, t.id),
  // Composite index for "recente" sort
  index("idx_ofertas_feed_recente").on(t.dataCriacao, t.id),
  // Composite index for patrocinada/destacada blending on page 1
  index("idx_ofertas_patrocinada_status").on(t.patrocinada, t.status),
  index("idx_ofertas_destacada_status").on(t.destacada, t.patrocinada, t.status),
  index("idx_ofertas_mercado_id").on(t.mercadoId),
]);

export const alertasTable = pgTable("alertas", {
  id: serial("id").primaryKey(),
  usuarioId: integer("usuario_id").notNull().references(() => usuariosTable.id),
  produto: text("produto").notNull(),
  precoAlvo: real("preco_alvo").notNull(),
  criadoEm: timestamp("criado_em").notNull().defaultNow(),
});

export const insertAlertaSchema = createInsertSchema(alertasTable).omit({ id: true, criadoEm: true });
export type InsertAlerta = z.infer<typeof insertAlertaSchema>;
export type Alerta = typeof alertasTable.$inferSelect;

export const favoritosTable = pgTable("favoritos", {
  id: serial("id").primaryKey(),
  usuarioId: integer("usuario_id").notNull().references(() => usuariosTable.id),
  ofertaId: integer("oferta_id").notNull().references(() => ofertasTable.id),
  criadoEm: timestamp("criado_em").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("idx_favoritos_unique").on(t.usuarioId, t.ofertaId),
  index("idx_favoritos_usuario_id").on(t.usuarioId),
]);

export const insertFavoritoSchema = createInsertSchema(favoritosTable).omit({ id: true, criadoEm: true });
export type InsertFavorito = z.infer<typeof insertFavoritoSchema>;
export type Favorito = typeof favoritosTable.$inferSelect;

/** Tracks which user confirmed which offer (dedup system). */
export const offerConfirmationsTable = pgTable("offer_confirmations", {
  id: serial("id").primaryKey(),
  offerId: integer("offer_id").notNull().references(() => ofertasTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usuariosTable.id, { onDelete: "cascade" }),
  confirmedAt: timestamp("confirmed_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("idx_offer_conf_unique").on(t.offerId, t.userId),
  index("idx_offer_conf_offer_id").on(t.offerId),
  index("idx_offer_conf_user_id").on(t.userId),
]);

export type OfferConfirmation = typeof offerConfirmationsTable.$inferSelect;

/** Tracks user interactions (likes, validações, denúncias) — prevents duplicate actions. */
export const offerInteractionsTable = pgTable("offer_interactions", {
  id: serial("id").primaryKey(),
  offerId: integer("offer_id").notNull().references(() => ofertasTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usuariosTable.id, { onDelete: "cascade" }),
  tipo: text("tipo").notNull().$type<"like" | "validar" | "denunciar" | "confirmar">(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("idx_offer_interactions_unique").on(t.offerId, t.userId, t.tipo),
  index("idx_offer_interactions_offer_id").on(t.offerId),
  index("idx_offer_interactions_user_id").on(t.userId),
]);

export type OfferInteraction = typeof offerInteractionsTable.$inferSelect;

/** Tracks who follows whom and which markets are followed. */
export const followsTable = pgTable("follows", {
  id: serial("id").primaryKey(),
  followerId: integer("follower_id").notNull().references(() => usuariosTable.id, { onDelete: "cascade" }),
  followingUserId: integer("following_user_id").references(() => usuariosTable.id, { onDelete: "cascade" }),
  followingMercado: text("following_mercado"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("idx_follows_follower_id").on(t.followerId),
  index("idx_follows_following_user_id").on(t.followingUserId),
]);

export type Follow = typeof followsTable.$inferSelect;

export type NotificacaoTipo =
  | "alerta_preco" | "oferta_confirmada" | "validacao_recebida" | "badge_conquistado" | "ranking_semana"
  | "lista_oferta" | "lista_editada" | "item_comprado" | "preco_caiu" | "nova_oferta"
  | "mercado" | "sistema" | "promocao" | "resumo";

/** Push notification queue — in-app and push-ready. */
export const notificationsTable = pgTable("notifications", {
  id:           serial("id").primaryKey(),
  userId:       integer("user_id").notNull().references(() => usuariosTable.id, { onDelete: "cascade" }),
  tipo:         text("tipo").notNull().$type<NotificacaoTipo>(),
  titulo:       text("titulo").notNull(),
  mensagem:     text("mensagem"),
  ofertaId:     integer("oferta_id").references(() => ofertasTable.id, { onDelete: "set null" }),
  acaoTipo:     text("acao_tipo"),
  acaoId:       text("acao_id"),
  imagemUrl:    text("imagem_url"),
  enviadaPush:  boolean("enviada_push").notNull().default(false),
  metadata:     jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  lida:         boolean("lida").notNull().default(false),
  criadaEm:     timestamp("criada_em").notNull().defaultNow(),
}, (t) => [
  index("idx_notifications_user").on(t.userId, t.lida, t.criadaEm),
  index("idx_notifications_user_id_only").on(t.userId),
  index("idx_notifications_criada_em_idx").on(t.criadaEm),
  index("idx_notifications_lida_idx").on(t.lida),
]);

export type Notification = typeof notificationsTable.$inferSelect;

/** Boolean notification preferences per user (feature-category toggles). */
export const notificationPreferencesTable = pgTable("notification_preferences", {
  userId:             integer("user_id").primaryKey().references(() => usuariosTable.id, { onDelete: "cascade" }),
  ofertasLista:       boolean("ofertas_lista").notNull().default(true),
  listaCompartilhada: boolean("lista_compartilhada").notNull().default(true),
  mercadosFavoritos:  boolean("mercados_favoritos").notNull().default(true),
  quedaPreco:         boolean("queda_preco").notNull().default(true),
  resumoSemanal:      boolean("resumo_semanal").notNull().default(true),
  novidades:          boolean("novidades").notNull().default(true),
  marketing:          boolean("marketing").notNull().default(false),
  pushEnabled:        boolean("push_enabled").notNull().default(false),
  createdAt:          timestamp("created_at").notNull().defaultNow(),
  updatedAt:          timestamp("updated_at").notNull().defaultNow(),
});

export type NotificationPreferences = typeof notificationPreferencesTable.$inferSelect;

/** Simple push tokens for future native-app push notifications. */
export const pushTokensTable = pgTable("push_tokens", {
  id:              serial("id").primaryKey(),
  userId:          integer("user_id").notNull().references(() => usuariosTable.id, { onDelete: "cascade" }),
  device:          text("device"),
  platform:        text("platform"),
  pushToken:       text("push_token").notNull(),
  ultimaAtividade: timestamp("ultima_atividade").notNull().defaultNow(),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("idx_push_tokens_user_id").on(t.userId),
]);

export type PushToken = typeof pushTokensTable.$inferSelect;

export const mercadosPatrocinadosTable = pgTable("mercados_patrocinados", {
  id: serial("id").primaryKey(),
  nomeMercado: text("nome_mercado").notNull(),
  nomeExibicao: text("nome_exibicao").notNull(),
  logoUrl: text("logo_url"),
  cidade: text("cidade").notNull(),
  bairro: text("bairro"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  planoPatrocinio: text("plano_patrocinio").notNull().default("basico"),
  status: text("status").notNull().$type<"ativo" | "pausado" | "expirado">().default("ativo"),
  dataInicio: timestamp("data_inicio").notNull(),
  dataFim: timestamp("data_fim").notNull(),
  prioridade: integer("prioridade").notNull().default(1),
  limiteExibicoesDiarias: integer("limite_exibicoes_diarias"),
  totalExibicoes: integer("total_exibicoes").notNull().default(0),
  totalCliques: integer("total_cliques").notNull().default(0),
  nomeCampanha: text("nome_campanha"),
  descricaoCampanha: text("descricao_campanha"),
  modoTeste: boolean("modo_teste").notNull().default(false),
  observacoes: text("observacoes"),
  criadoEm: timestamp("criado_em").notNull().defaultNow(),
  atualizadoEm: timestamp("atualizado_em").notNull().defaultNow(),
}, (t) => [
  index("idx_mercados_patrocinados_status").on(t.status),
  index("idx_mercados_patrocinados_cidade").on(t.cidade),
  index("idx_mercados_patrocinados_prioridade").on(t.prioridade),
]);

export type MercadoPatrocinado = typeof mercadosPatrocinadosTable.$inferSelect;

export const mercadoEventosTable = pgTable("mercado_eventos", {
  id: serial("id").primaryKey(),
  mercadoPatrocinadoId: integer("mercado_patrocinado_id").notNull().references(() => mercadosPatrocinadosTable.id, { onDelete: "cascade" }),
  tipo: text("tipo").notNull().$type<"impressao" | "clique">(),
  origem: text("origem"),
  hora: integer("hora"),
  bairro: text("bairro"),
  distanciaKm: real("distancia_km"),
  dispositivo: text("dispositivo").$type<"mobile" | "web">().default("web"),
  tipoFeed: text("tipo_feed"),
  criadoEm: timestamp("criado_em").notNull().defaultNow(),
}, (t) => [
  index("idx_mercado_eventos_mercado_id").on(t.mercadoPatrocinadoId),
  index("idx_mercado_eventos_tipo_data").on(t.tipo, t.criadoEm),
  index("idx_mercado_eventos_hora").on(t.hora),
  index("idx_mercado_eventos_bairro").on(t.bairro),
]);

export type MercadoEvento = typeof mercadoEventosTable.$inferSelect;

/** Web Push subscriptions — one row per device per user. */
export const pushSubscriptionsTable = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  usuarioId: integer("usuario_id").notNull().references(() => usuariosTable.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  criadoEm: timestamp("criado_em").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("idx_push_subs_endpoint").on(t.endpoint),
  index("idx_push_subs_usuario").on(t.usuarioId),
]);

export type PushSubscription = typeof pushSubscriptionsTable.$inferSelect;

/** Delivery tracking — one row per notification dispatched to a user device. */
export const notificationDeliveryTable = pgTable("notification_delivery", {
  id:             serial("id").primaryKey(),
  notificationId: integer("notification_id").notNull().references(() => notificationsTable.id, { onDelete: "cascade" }),
  userId:         integer("user_id").notNull().references(() => usuariosTable.id, { onDelete: "cascade" }),
  deliveredAt:    timestamp("delivered_at").notNull().defaultNow(),
  openedAt:       timestamp("opened_at"),
  dismissedAt:    timestamp("dismissed_at"),
  clicked:        boolean("clicked").notNull().default(false),
  pushSent:       boolean("push_sent").notNull().default(false),
  pushSuccess:    boolean("push_success").notNull().default(false),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("idx_notif_delivery_user_id").on(t.userId),
  index("idx_notif_delivery_notification_id").on(t.notificationId),
  index("idx_notif_delivery_created_at").on(t.createdAt),
]);
export type NotificationDelivery = typeof notificationDeliveryTable.$inferSelect;

/** Product muting — user silences a product; push skipped, internal history kept. */
export const notificationMuteTable = pgTable("notification_mute", {
  id:          serial("id").primaryKey(),
  userId:      integer("user_id").notNull().references(() => usuariosTable.id, { onDelete: "cascade" }),
  productName: text("product_name").notNull(),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("idx_notif_mute_unique").on(t.userId, t.productName),
  index("idx_notif_mute_user_id").on(t.userId),
]);
export type NotificationMute = typeof notificationMuteTable.$inferSelect;

/** Push notification send log — one row per test/broadcast sent via admin. */
export const pushLogsTable = pgTable("push_logs", {
  id: serial("id").primaryKey(),
  adminNome: text("admin_nome"),
  usuarioId: integer("usuario_id").references(() => usuariosTable.id, { onDelete: "set null" }),
  usuarioNome: text("usuario_nome"),
  titulo: text("titulo").notNull(),
  mensagem: text("mensagem").notNull(),
  link: text("link"),
  status: text("status").notNull().$type<"enviado" | "falhou" | "sem_permissao">(),
  subsTotal: integer("subs_total").notNull().default(0),
  subsOk: integer("subs_ok").notNull().default(0),
  criadoEm: timestamp("criado_em").notNull().defaultNow(),
}, (t) => [
  index("idx_push_logs_usuario").on(t.usuarioId),
  index("idx_push_logs_criado").on(t.criadoEm),
]);
export type PushLog = typeof pushLogsTable.$inferSelect;

/** Notification preferences per user — one row per user, upserted on save. */
export const notificacaoPreferenciasTable = pgTable("notificacao_preferencias", {
  id:                       serial("id").primaryKey(),
  usuarioId:                integer("usuario_id").notNull().unique().references(() => usuariosTable.id, { onDelete: "cascade" }),
  categorias:               text("categorias").array().notNull().default(sql`'{}'::text[]`),
  distanciaMaxKm:           integer("distancia_max_km"),
  latitude:                 numeric("latitude", { precision: 10, scale: 7 }),
  longitude:                numeric("longitude", { precision: 10, scale: 7 }),
  mercadosFavoritos:        text("mercados_favoritos").array().notNull().default(sql`'{}'::text[]`),
  palavrasChave:            text("palavras_chave").array().notNull().default(sql`'{}'::text[]`),
  frequencia:               text("frequencia").notNull().$type<"imediata" | "diario" | "semanal" | "desligado">().default("imediata"),
  horarioSilenciosoInicio:  integer("horario_silencioso_inicio").notNull().default(22),
  horarioSilenciosoFim:     integer("horario_silencioso_fim").notNull().default(7),
  criadoEm:                 timestamp("criado_em").notNull().defaultNow(),
  atualizadoEm:             timestamp("atualizado_em").notNull().defaultNow(),
}, (t) => [
  index("idx_notif_pref_usuario").on(t.usuarioId),
]);
export type NotificacaoPreferencias = typeof notificacaoPreferenciasTable.$inferSelect;

export const insertOfertaSchema = createInsertSchema(ofertasTable).omit({
  id: true,
  dataCriacao: true,
  curtidas: true,
  validacoes: true,
  denuncias: true,
  confirmacoes: true,
  ultimaConfirmacaoEm: true,
  status: true,
  scoreCache: true,
});
export type InsertOferta = z.infer<typeof insertOfertaSchema>;
export type Oferta = typeof ofertasTable.$inferSelect;

/** Coupon transaction log. delta > 0 = earned, delta < 0 = spent. */
export const cuponsHistoricoTable = pgTable("cupons_historico", {
  id: serial("id").primaryKey(),
  usuarioId: integer("usuario_id").notNull().references(() => usuariosTable.id, { onDelete: "cascade" }),
  delta: integer("delta").notNull(),
  tipo: text("tipo").notNull().$type<"publicacao" | "confirmacao" | "bonus_dia" | "compartilhamento" | "convite" | "missao" | "sorteio" | "missao_compartilhar">(),
  referenciaId: integer("referencia_id"),
  criadoEm: timestamp("criado_em").notNull().defaultNow(),
}, (t) => [
  index("idx_cupons_hist_usuario").on(t.usuarioId),
  index("idx_cupons_hist_criado").on(t.criadoEm),
]);
export type CuponsHistorico = typeof cuponsHistoricoTable.$inferSelect;

/** Daily missions per user — regenerated each day. */
export const missoesDiariasTable = pgTable("missoes_diarias", {
  id: serial("id").primaryKey(),
  usuarioId: integer("usuario_id").notNull().references(() => usuariosTable.id, { onDelete: "cascade" }),
  data: text("data").notNull(),
  tipo: text("tipo").notNull(),
  descricao: text("descricao").notNull(),
  meta: integer("meta").notNull().default(1),
  progresso: integer("progresso").notNull().default(0),
  concluida: boolean("concluida").notNull().default(false),
  premioPontos: integer("premio_pontos").notNull().default(5),
  premioCupons: integer("premio_cupons").notNull().default(1),
  criadoEm: timestamp("criado_em").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("idx_missoes_unique").on(t.usuarioId, t.data, t.tipo),
  index("idx_missoes_usuario_data").on(t.usuarioId, t.data),
]);
export type MissaoDiaria = typeof missoesDiariasTable.$inferSelect;

/** User achievement unlocks. */
export const conquistasUsuarioTable = pgTable("conquistas_usuario", {
  id: serial("id").primaryKey(),
  usuarioId: integer("usuario_id").notNull().references(() => usuariosTable.id, { onDelete: "cascade" }),
  conquistaKey: text("conquista_key").notNull(),
  desbloqueadaEm: timestamp("desbloqueada_em").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("idx_conquistas_unique").on(t.usuarioId, t.conquistaKey),
  index("idx_conquistas_usuario").on(t.usuarioId),
]);
export type ConquistaUsuario = typeof conquistasUsuarioTable.$inferSelect;

/** Weekly lottery definitions. */
export const sorteiosTable = pgTable("sorteios", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull().default(""),
  premio: text("premio").notNull(),
  descricao: text("descricao"),
  imagemUrl: text("imagem_url"),
  dataFim: timestamp("data_fim").notNull(),
  ativo: boolean("ativo").notNull().default(true),
  status: text("status").notNull().$type<"ativo" | "encerrado" | "cancelado">().default("ativo"),
  regra: text("regra").notNull().$type<"manual" | "cupom_publicacao" | "cupom_validacao" | "cupom_pontos" | "cupom_saldo" | "minimo_pontos" | "todos_ativos">().default("manual"),
  regraValor: integer("regra_valor"),
  criadoEm: timestamp("criado_em").notNull().defaultNow(),
}, (t) => [
  index("idx_sorteios_ativo").on(t.ativo),
  index("idx_sorteios_status").on(t.status),
]);
export type Sorteio = typeof sorteiosTable.$inferSelect;

/** Users who joined a lottery draw. */
export const sorteioParticipantesTable = pgTable("sorteio_participantes", {
  id: serial("id").primaryKey(),
  sorteioId: integer("sorteio_id").notNull().references(() => sorteiosTable.id, { onDelete: "cascade" }),
  usuarioId: integer("usuario_id").notNull().references(() => usuariosTable.id, { onDelete: "cascade" }),
  cuponsUsados: integer("cupons_usados").notNull().default(1),
  criadoEm: timestamp("criado_em").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("idx_sorteio_part_unique").on(t.sorteioId, t.usuarioId),
  index("idx_sorteio_part_sorteio").on(t.sorteioId),
]);
export type SorteioParticipante = typeof sorteioParticipantesTable.$inferSelect;

/** Historical lottery winners — denormalized nome for deleted-user safety. */
export const sorteioGanhadoresTable = pgTable("sorteio_ganhadores", {
  id: serial("id").primaryKey(),
  sorteioId: integer("sorteio_id").notNull().references(() => sorteiosTable.id),
  usuarioId: integer("usuario_id").references(() => usuariosTable.id),
  nomeUsuario: text("nome_usuario").notNull(),
  premio: text("premio").notNull(),
  dataSorteio: timestamp("data_sorteio").notNull().defaultNow(),
}, (t) => [
  index("idx_sorteio_ganhadores_sorteio").on(t.sorteioId),
]);
export type SorteioGanhador = typeof sorteioGanhadoresTable.$inferSelect;

/** Admin audit log — every admin action is recorded here. */
export const adminLogsTable = pgTable("admin_logs", {
  id: serial("id").primaryKey(),
  adminNome: text("admin_nome").notNull().default("Admin"),
  acao: text("acao").notNull(),
  usuarioAfetadoId: integer("usuario_afetado_id").references(() => usuariosTable.id, { onDelete: "set null" }),
  usuarioAfetadoNome: text("usuario_afetado_nome"),
  detalhes: text("detalhes"),
  motivo: text("motivo"),
  criadoEm: timestamp("criado_em").notNull().defaultNow(),
}, (t) => [
  index("idx_admin_logs_criado").on(t.criadoEm),
  index("idx_admin_logs_acao").on(t.acao),
]);
export type AdminLog = typeof adminLogsTable.$inferSelect;

/** Audit log of offer lifecycle changes (edits, encerrar, excluir, restaurar). */
export const ofertaHistoricoTable = pgTable("oferta_historico", {
  id: serial("id").primaryKey(),
  ofertaId: integer("oferta_id").notNull().references(() => ofertasTable.id, { onDelete: "cascade" }),
  usuarioId: integer("usuario_id").references(() => usuariosTable.id),
  acao: text("acao").notNull(),
  statusAntes: text("status_antes"),
  statusDepois: text("status_depois"),
  detalhe: text("detalhe"),
  criadoEm: timestamp("criado_em").notNull().defaultNow(),
}, (t) => [
  index("idx_oferta_historico_oferta").on(t.ofertaId),
  index("idx_oferta_historico_usuario").on(t.usuarioId),
]);
export type OfertaHistorico = typeof ofertaHistoricoTable.$inferSelect;

/** Mission config — admin-editable overrides for daily mission templates. */
export const missoesConfigTable = pgTable("missoes_config", {
  tipo: text("tipo").primaryKey(),
  ativo: boolean("ativo").notNull().default(true),
  descricao: text("descricao").notNull(),
  meta: integer("meta").notNull().default(1),
  premioPontos: integer("premio_pontos").notNull().default(5),
  premioCupons: integer("premio_cupons").notNull().default(1),
  missaoDoDia: boolean("missao_do_dia").notNull().default(false),
  atualizadoEm: timestamp("atualizado_em").notNull().defaultNow(),
});
export type MissaoConfig = typeof missoesConfigTable.$inferSelect;

/** Dynamic campaign missions — fully configurable by admin (any type, duration, target). */
export const missoesCampanhasTable = pgTable("missoes_campanhas", {
  id: serial("id").primaryKey(),
  titulo: text("titulo").notNull(),
  descricao: text("descricao"),
  periocidade: text("periocidade").notNull().default("diaria")
    .$type<"diaria" | "semanal" | "mensal" | "temporaria" | "especial" | "sazonal">(),
  tipoAcao: text("tipo_acao").notNull().default("publicar")
    .$type<"publicar" | "confirmar" | "publicar_categoria" | "publicar_mercado" | "compartilhar" | "qualquer">(),
  meta: integer("meta").notNull().default(1),
  categoriaAlvo: text("categoria_alvo"),
  mercadoAlvo: text("mercado_alvo"),
  premioPontos: integer("premio_pontos").notNull().default(10),
  premioCupons: integer("premio_cupons").notNull().default(1),
  multiplicadorPontos: real("multiplicador_pontos").notNull().default(1.0),
  limitePorUsuario: integer("limite_por_usuario").notNull().default(1),
  badge: text("badge").notNull().default("🎯"),
  dataInicio: timestamp("data_inicio").notNull().defaultNow(),
  dataFim: timestamp("data_fim"),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm: timestamp("criado_em").notNull().defaultNow(),
}, (t) => [
  index("idx_campanhas_ativo").on(t.ativo),
  index("idx_campanhas_data_fim").on(t.dataFim),
]);
export type MissaoCampanha = typeof missoesCampanhasTable.$inferSelect;

/** Cache of nearby supermarkets fetched from OSM Overpass + user-submitted markets. */
export const mercadosSugeridosTable = pgTable("mercados_sugeridos", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),
  bairro: text("bairro"),
  cidade: text("cidade"),
  estado: text("estado"),
  lat: real("lat"),
  lng: real("lng"),
  /** 'osm' = from OpenStreetMap Overpass; 'nominatim' = name-search fallback; 'usuario' = user-submitted */
  fonte: text("fonte").notNull().default("osm"),
  /** Free-text street address (optional) */
  endereco: text("endereco"),
  /** Unique OSM element identifier (type/id) for dedup */
  osmId: text("osm_id"),
  /** Number of times this market was selected when publishing an offer */
  usosTotal: integer("usos_total").notNull().default(0),
  criadoEm: timestamp("criado_em").notNull().defaultNow(),
  /** Whether this market is active (false = hidden from suggestions). */
  ativo: boolean("ativo").notNull().default(true),
  /** Logo image URL (admin-uploaded or brand-provided). */
  logoUrl: text("logo_url"),
  /** Storefront/facade photo URL for premium card display (admin-curated or user-submitted). */
  fachadaUrl: text("fachada_url"),
  /** JSON array of additional photo URLs for gallery view. */
  galeriaUrls: jsonb("galeria_urls").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
}, (t) => [
  index("idx_mercados_sug_nome").on(t.nome),
  index("idx_mercados_sug_lat_lng").on(t.lat, t.lng),
  uniqueIndex("idx_mercados_sug_osm_id").on(t.osmId),
]);
export type MercadoSugerido = typeof mercadosSugeridosTable.$inferSelect;

/** User-submitted storefront photos pending admin moderation. */
export const fotosFachadaTable = pgTable("fotos_fachada", {
  id:                  serial("id").primaryKey(),
  mercadoId:           integer("mercado_id").notNull().references(() => mercadosSugeridosTable.id, { onDelete: "cascade" }),
  usuarioId:           integer("usuario_id").notNull().references(() => usuariosTable.id, { onDelete: "cascade" }),
  url:                 text("url").notNull(),
  status:              text("status").notNull().default("pendente").$type<"pendente" | "aprovada" | "rejeitada">(),
  motivoRejeicao:      text("motivo_rejeicao"),
  enviadoEm:           timestamp("enviado_em").notNull().defaultNow(),
  revisadoEm:          timestamp("revisado_em"),
  revisadoPorId:       integer("revisado_por_id").references(() => usuariosTable.id),
  recompensaConcedida: boolean("recompensa_concedida").notNull().default(false),
}, (t) => [
  index("idx_fotos_fachada_mercado").on(t.mercadoId),
  index("idx_fotos_fachada_usuario").on(t.usuarioId),
  index("idx_fotos_fachada_status").on(t.status),
]);
export type FotoFachada = typeof fotosFachadaTable.$inferSelect;

/** Rewards catalog — admin-created items users can exchange points for. */
export const recompensasCatalogoTable = pgTable("recompensas_catalogo", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),
  descricao: text("descricao"),
  tipo: text("tipo").notNull().default("recompensa")
    .$type<"recompensa" | "cupom" | "bonus" | "premiacao">(),
  custoPontos: integer("custo_pontos").notNull().default(100),
  quantidadeDisponivel: integer("quantidade_disponivel"),
  validade: timestamp("validade"),
  imagemUrl: text("imagem_url"),
  status: text("status").notNull().default("ativo")
    .$type<"ativo" | "inativo" | "esgotado">(),
  criadoEm: timestamp("criado_em").notNull().defaultNow(),
}, (t) => [
  index("idx_recompensas_status").on(t.status),
]);
export type RecompensaCatalogo = typeof recompensasCatalogoTable.$inferSelect;

// ── Comments ──────────────────────────────────────────────────────────────────
export const comentariosOfertaTable = pgTable("comentarios_oferta", {
  id:        serial("id").primaryKey(),
  ofertaId:  integer("oferta_id").notNull().references(() => ofertasTable.id, { onDelete: "cascade" }),
  usuarioId: integer("usuario_id").notNull().references(() => usuariosTable.id, { onDelete: "cascade" }),
  /** Quick tag: disponivel|acabando|esgotado|compensa|subiu|fila (null = texto puro) */
  tag:       text("tag"),
  texto:     text("texto"),
  curtidas:  integer("curtidas").notNull().default(0),
  /** ativo | oculto | removido */
  status:    text("status").notNull().default("ativo"),
  denuncias: integer("denuncias").notNull().default(0),
  criadoEm:  timestamp("criado_em").notNull().defaultNow(),
}, (t) => [
  index("idx_coment_oferta_id").on(t.ofertaId),
  index("idx_coment_usuario_id").on(t.usuarioId),
]);
export type ComentarioOferta = typeof comentariosOfertaTable.$inferSelect;

export const comentariosCurtidasTable = pgTable("comentarios_curtidas", {
  comentarioId: integer("comentario_id").notNull().references(() => comentariosOfertaTable.id, { onDelete: "cascade" }),
  usuarioId:    integer("usuario_id").notNull().references(() => usuariosTable.id, { onDelete: "cascade" }),
  criadoEm:     timestamp("criado_em").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("idx_coment_curtidas_unique").on(t.comentarioId, t.usuarioId),
]);

// ── Founders ──────────────────────────────────────────────────────────────────
/**
 * Founders of AíCompensa — the first 10 real active users.
 * Vitalício badge, admin-managed only. Max 10 entries enforced at API level.
 */
export const fundadoresTable = pgTable("fundadores", {
  id: serial("id").primaryKey(),
  usuarioId: integer("usuario_id").notNull().references(() => usuariosTable.id, { onDelete: "cascade" }),
  posicao: integer("posicao").notNull(),
  adicionadoPor: text("adicionado_por").notNull().default("sistema"),
  observacao: text("observacao"),
  criadoEm: timestamp("criado_em").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("idx_fundadores_usuario").on(t.usuarioId),
]);
export type Fundador = typeof fundadoresTable.$inferSelect;

/** Intelligent product dictionary — learned from community + AI suggestions. */
export const produtoDicionarioTable = pgTable("produto_dicionario", {
  id:                    serial("id").primaryKey(),
  /** Normalized product term (lower-case, accent-stripped) used for matching. */
  termo:                 text("termo").notNull(),
  categoria:             text("categoria").notNull(),
  /** Comma-separated tags, e.g. "proteína,congelado" */
  tags:                  text("tags"),
  quantidadeConfirmacoes: integer("quantidade_confirmacoes").notNull().default(1),
  /** alta | media | baixa — auto-elevated as confirmations grow */
  confianca:             text("confianca").notNull().default("baixa"),
  /** ia | comunidade | admin */
  fonte:                 text("fonte").notNull().default("comunidade"),
  ultimaAtualizacao:     timestamp("ultima_atualizacao").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("idx_dicionario_termo").on(t.termo),
  index("idx_dicionario_categoria").on(t.categoria),
  index("idx_dicionario_confianca").on(t.confianca),
]);
export type ProdutoDicionario = typeof produtoDicionarioTable.$inferSelect;

// ── Lista de compras — tabelas de suporte ────────────────────────────────────

/** User's personal list synced server-side (enables push alerts). */
export const listaItensUsuarioTable = pgTable("lista_itens_usuario", {
  id:        serial("id").primaryKey(),
  usuarioId: integer("usuario_id").notNull().references(() => usuariosTable.id, { onDelete: "cascade" }),
  nome:      text("nome").notNull(),
  slug:      text("slug").notNull(),
  ativo:     boolean("ativo").notNull().default(true),
  criadoEm:  timestamp("criado_em").notNull().defaultNow(),
}, t => [
  index("idx_lista_itens_uid").on(t.usuarioId),
  index("idx_lista_itens_slug").on(t.slug),
]);
export type ListaItemUsuario = typeof listaItensUsuarioTable.$inferSelect;

/** Shared shopping list (multiple users collaborate). */
export const listaCompartilhadaTable = pgTable("lista_compartilhada", {
  id:        serial("id").primaryKey(),
  nome:      text("nome").notNull().default("Minha Lista"),
  emoji:     text("emoji").notNull().default("🛒"),
  codigo:    text("codigo").notNull(),
  criadorId: integer("criador_id").notNull().references(() => usuariosTable.id, { onDelete: "cascade" }),
  ativa:     boolean("ativa").notNull().default(true),
  criadoEm:  timestamp("criado_em").notNull().defaultNow(),
}, t => [
  uniqueIndex("idx_lista_comp_codigo").on(t.codigo),
  index("idx_lista_comp_criador").on(t.criadorId),
]);
export type ListaCompartilhada = typeof listaCompartilhadaTable.$inferSelect;

/** Members of a shared list. */
export const listaCompartilhadaMembrosTable = pgTable("lista_compartilhada_membros", {
  listaId:   integer("lista_id").notNull().references(() => listaCompartilhadaTable.id, { onDelete: "cascade" }),
  usuarioId: integer("usuario_id").notNull().references(() => usuariosTable.id, { onDelete: "cascade" }),
  papel:     text("papel").notNull().default("member").$type<"owner" | "member">(),
  permissao: text("permissao").notNull().default("edit").$type<"edit" | "view">(),
  joinedAt:  timestamp("joined_at").notNull().defaultNow(),
}, t => [
  uniqueIndex("idx_lista_comp_membro").on(t.listaId, t.usuarioId),
]);

/** Items in a shared list. */
export const listaCompartilhadaItensTable = pgTable("lista_compartilhada_itens", {
  id:              serial("id").primaryKey(),
  listaId:         integer("lista_id").notNull().references(() => listaCompartilhadaTable.id, { onDelete: "cascade" }),
  usuarioId:       integer("usuario_id").notNull().references(() => usuariosTable.id, { onDelete: "cascade" }),
  nomeUsuario:     text("nome_usuario").notNull(),
  nome:            text("nome").notNull(),
  slug:            text("slug").notNull(),
  comprado:        boolean("comprado").notNull().default(false),
  compradoPorId:   integer("comprado_por_id").references(() => usuariosTable.id),
  compradoPorNome: text("comprado_por_nome"),
  adicionadoEm:    timestamp("adicionado_em").notNull().defaultNow(),
  compradoEm:      timestamp("comprado_em"),
}, t => [
  index("idx_lista_comp_itens").on(t.listaId),
]);
export type ListaCompartilhadaItem = typeof listaCompartilhadaItensTable.$inferSelect;

// ── Admin AI Audit ─────────────────────────────────────────────────────────────
/** One audit record per offer (upserted on each AI analysis). Admin suggests, human decides. */
export const adminOfertaAuditsTable = pgTable("admin_oferta_audits", {
  id:                     serial("id").primaryKey(),
  ofertaId:               integer("oferta_id").notNull().references(() => ofertasTable.id, { onDelete: "cascade" }),
  analisadoEm:            timestamp("analisado_em").notNull().defaultNow(),
  risco:                  text("risco").notNull().$type<"baixo" | "medio" | "alto">(),
  motivo:                 text("motivo").notNull(),
  sugestaoAcao:           text("sugestao_acao").notNull().$type<"manter" | "corrigir_categoria" | "revisar_preco" | "arquivar" | "marcar_suspeita">(),
  precoSuspeito:          boolean("preco_suspeito").notNull().default(false),
  categoriaErrada:        boolean("categoria_errada").notNull().default(false),
  possivelDuplicada:      boolean("possivel_duplicada").notNull().default(false),
  fotoRuim:               boolean("foto_ruim").notNull().default(false),
  categoriaSugerida:      text("categoria_sugerida"),
  idsDuplicadosSuspeitos: text("ids_duplicados_suspeitos"),
}, (t) => [
  uniqueIndex("idx_admin_oferta_audits_oferta").on(t.ofertaId),
  index("idx_admin_oferta_audits_risco").on(t.risco),
  index("idx_admin_oferta_audits_analisado_em").on(t.analisadoEm),
]);
export type AdminOfertaAudit = typeof adminOfertaAuditsTable.$inferSelect;

/** Approved product images — admin-curated, shown in feed instead of label photo. */
export const produtoImagensTable = pgTable("produto_imagens", {
  id: serial("id").primaryKey(),
  produtoNormalizado: text("produto_normalizado").notNull(),
  imagemUrl: text("imagem_url").notNull(),
  aprovada: boolean("aprovada").notNull().default(false),
  criadoEm: timestamp("criado_em").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("idx_produto_imagens_normalizado").on(t.produtoNormalizado),
  index("idx_produto_imagens_aprovada").on(t.aprovada),
]);
export type ProdutoImagem = typeof produtoImagensTable.$inferSelect;

// ── Sprint 14: AI Shopping Brain ──────────────────────────────────────────────

/** Persistent intelligence profile per user — recalculated incrementally. */
export const shoppingProfileTable = pgTable("shopping_profile", {
  id:                  serial("id").primaryKey(),
  userId:              integer("user_id").notNull().unique().references(() => usuariosTable.id, { onDelete: "cascade" }),
  mercadoPreferido:    text("mercado_preferido"),
  categoriaPreferida:  text("categoria_preferida"),
  diaPreferido:        integer("dia_preferido"),
  horarioPreferido:    integer("horario_preferido"),
  ticketMedio:         real("ticket_medio").notNull().default(0),
  economiaTotal:       real("economia_total").notNull().default(0),
  economia30dias:      real("economia_30dias").notNull().default(0),
  ultimaAtualizacao:   timestamp("ultima_atualizacao").notNull().defaultNow(),
  metadata:            jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
}, (t) => [
  index("idx_shopping_profile_user_id").on(t.userId),
]);
export type ShoppingProfile = typeof shoppingProfileTable.$inferSelect;

/** Product preference score per user (0–100, decays when unused). */
export const shoppingPreferenceScoreTable = pgTable("shopping_preference_score", {
  id:                   serial("id").primaryKey(),
  userId:               integer("user_id").notNull().references(() => usuariosTable.id, { onDelete: "cascade" }),
  produto:              text("produto").notNull(),
  score:                real("score").notNull().default(50),
  ultimaCompra:         timestamp("ultima_compra"),
  ultimaVisualizacao:   timestamp("ultima_visualizacao"),
  ultimaNotificacao:    timestamp("ultima_notificacao"),
  createdAt:            timestamp("created_at").notNull().defaultNow(),
  updatedAt:            timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("idx_pref_score_user_id").on(t.userId),
  uniqueIndex("idx_pref_score_user_produto").on(t.userId, t.produto),
]);
export type ShoppingPreferenceScore = typeof shoppingPreferenceScoreTable.$inferSelect;

/** Behavioural event log — feeds the AI profile incrementally. */
export const shoppingEventsTable = pgTable("shopping_events", {
  id:        serial("id").primaryKey(),
  userId:    integer("user_id").notNull().references(() => usuariosTable.id, { onDelete: "cascade" }),
  tipo:      text("tipo").notNull().$type<
    | "abriu_oferta" | "ignorou_oferta" | "abriu_notificacao"
    | "clicou_recomendacao" | "mercado_escolhido"
    | "lista_criada" | "lista_compartilhada"
    | "item_adicionado" | "item_comprado"
  >(),
  produto:   text("produto"),
  mercado:   text("mercado"),
  ofertaId:  integer("oferta_id"),
  metadata:  jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("idx_shopping_events_user_id").on(t.userId),
  index("idx_shopping_events_tipo").on(t.tipo),
  index("idx_shopping_events_created_at").on(t.createdAt),
]);
export type ShoppingEvent = typeof shoppingEventsTable.$inferSelect;

// ── Sprint 13: Shopping analysis history ──────────────────────────────────────

/** Stores the result of each shopping list analysis run per user. */
export const shoppingAnalysisHistoryTable = pgTable("shopping_analysis_history", {
  id:                  serial("id").primaryKey(),
  userId:              integer("user_id").notNull().references(() => usuariosTable.id, { onDelete: "cascade" }),
  mercadoIdeal:        text("mercado_ideal"),
  economiaTotal:       real("economia_total").notNull().default(0),
  percentualEconomia:  real("percentual_economia").notNull().default(0),
  itensEncontrados:    integer("itens_encontrados").notNull().default(0),
  itensTotais:         integer("itens_totais").notNull().default(0),
  score:               real("score").notNull().default(0),
  analiseJson:         jsonb("analise_json").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  pushSent:            boolean("push_sent").notNull().default(false),
  createdAt:           timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("idx_shopping_analysis_user_id").on(t.userId),
  index("idx_shopping_analysis_created_at").on(t.createdAt),
]);

export type ShoppingAnalysisHistory = typeof shoppingAnalysisHistoryTable.$inferSelect;

// ── Sprint 15: Growth Engine ──────────────────────────────────────────────────

export const referralsTable = pgTable("referrals", {
  id:            serial("id").primaryKey(),
  inviterUserId: integer("inviter_user_id").notNull().references(() => usuariosTable.id, { onDelete: "cascade" }),
  invitedUserId: integer("invited_user_id").notNull().references(() => usuariosTable.id, { onDelete: "cascade" }),
  codigo:        text("codigo").notNull(),
  status:        text("status").notNull().default("cadastrado"),
  createdAt:     timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("idx_referrals_inviter").on(t.inviterUserId),
  index("idx_referrals_invited").on(t.invitedUserId),
]);
export type Referral = typeof referralsTable.$inferSelect;

export const userFeedbackTable = pgTable("user_feedback", {
  id:        serial("id").primaryKey(),
  userId:    integer("user_id").notNull().references(() => usuariosTable.id, { onDelete: "cascade" }),
  rating:    integer("rating").notNull(),
  comment:   text("comment"),
  context:   text("context"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("idx_user_feedback_user").on(t.userId),
]);
export type UserFeedback = typeof userFeedbackTable.$inferSelect;

export const growthEventsTable = pgTable("growth_events", {
  id:        serial("id").primaryKey(),
  userId:    integer("user_id").notNull().references(() => usuariosTable.id, { onDelete: "cascade" }),
  tipo:      text("tipo").notNull(),
  metadata:  jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("idx_growth_events_user").on(t.userId),
  index("idx_growth_events_tipo").on(t.tipo),
  index("idx_growth_events_created").on(t.createdAt),
]);
export type GrowthEvent = typeof growthEventsTable.$inferSelect;

// ── Sprint 20: OfertaBot ──────────────────────────────────────────────────────

/** Registered flyer sources monitored by the OfertaBot. */
export const folhetoSourcesTable = pgTable("folheto_sources", {
  id:             serial("id").primaryKey(),
  mercadoId:      integer("mercado_id").references(() => mercadosSugeridosTable.id, { onDelete: "set null" }),
  nome:           text("nome").notNull(),
  cidade:         text("cidade").notNull(),
  bairro:         text("bairro"),
  estado:         text("estado").notNull().default("MT"),
  tipoFonte:      text("tipo_fonte").notNull().default("manual")
    .$type<"site" | "instagram" | "facebook" | "agregador" | "app_site" | "manual">(),
  url:            text("url").notNull(),
  ativo:          boolean("ativo").notNull().default(true),
  prioridade:     integer("prioridade").notNull().default(0),
  ultimoCheckAt:  timestamp("ultimo_check_at"),
  ultimoHash:     text("ultimo_hash"),
  erroConsecutivo: integer("erro_consecutivo").notNull().default(0),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
  updatedAt:      timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("idx_folheto_sources_ativo").on(t.ativo),
  index("idx_folheto_sources_cidade").on(t.cidade),
]);
export type FolhetoSource = typeof folhetoSourcesTable.$inferSelect;

/** One row per flyer URL downloaded by the bot. */
export const folhetoImportsTable = pgTable("folheto_imports", {
  id:             serial("id").primaryKey(),
  sourceId:       integer("source_id").references(() => folhetoSourcesTable.id, { onDelete: "cascade" }),
  mercadoId:      integer("mercado_id").references(() => mercadosSugeridosTable.id, { onDelete: "set null" }),
  cidade:         text("cidade"),
  bairro:         text("bairro"),
  urlFolheto:     text("url_folheto").notNull(),
  titulo:         text("titulo"),
  validadeInicio: date("validade_inicio"),
  validadeFim:    date("validade_fim"),
  status:         text("status").notNull().default("encontrado")
    .$type<"encontrado" | "baixado" | "extraido" | "revisao" | "publicado" | "erro" | "pendente_geo" | "rejeitado_geo">(),
  hashConteudo:   text("hash_conteudo"),
  totalExtraido:  integer("total_extraido").notNull().default(0),
  totalPublicado: integer("total_publicado").notNull().default(0),
  totalDuplicado: integer("total_duplicado").notNull().default(0),
  totalRevisao:   integer("total_revisao").notNull().default(0),
  totalRejeitado: integer("total_rejeitado").notNull().default(0),
  erro:           text("erro"),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
  updatedAt:      timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("idx_folheto_imports_source").on(t.sourceId),
  index("idx_folheto_imports_status").on(t.status),
  index("idx_folheto_imports_created").on(t.createdAt),
]);
export type FolhetoImport = typeof folhetoImportsTable.$inferSelect;

/** Individual product extracted from a flyer import. */
export const folhetoImportItemsTable = pgTable("folheto_import_items", {
  id:                  serial("id").primaryKey(),
  importId:            integer("import_id").notNull().references(() => folhetoImportsTable.id, { onDelete: "cascade" }),
  mercadoId:           integer("mercado_id").references(() => mercadosSugeridosTable.id, { onDelete: "set null" }),
  cidade:              text("cidade"),
  bairro:              text("bairro"),
  produto:             text("produto"),
  produtoNormalizado:  text("produto_normalizado"),
  marca:               text("marca"),
  preco:               real("preco"),
  precoNormal:         real("preco_normal"),
  precoClube:          real("preco_clube"),
  programaClubeName:   text("programa_clube_name"),
  tipoPreco:           text("tipo_preco").default("desconhecido")
    .$type<"normal" | "clube" | "ambos" | "desconhecido">(),
  unidade:             text("unidade"),
  categoria:           text("categoria"),
  validade:            date("validade"),
  confianca:           numeric("confianca", { precision: 5, scale: 4 }),
  status:              text("status").notNull().default("revisao")
    .$type<"aprovado" | "rejeitado" | "publicado" | "duplicado" | "erro" | "revisao" | "pendente_geo">(),
  ofertaId:            integer("oferta_id").references(() => ofertasTable.id, { onDelete: "set null" }),
  rawText:             text("raw_text"),
  cropUrl:             text("crop_url"),
  imageQualityScore:   integer("image_quality_score"),
  hashDeduplicacao:    text("hash_deduplicacao"),
  motivoRejeicao:      text("motivo_rejeicao"),
  createdAt:           timestamp("created_at").notNull().defaultNow(),
  updatedAt:           timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("idx_fii_import").on(t.importId),
  index("idx_fii_status").on(t.status),
  index("idx_fii_mercado").on(t.mercadoId),
]);
export type FolhetoImportItem = typeof folhetoImportItemsTable.$inferSelect;

/** Candidate product images extracted from flyers — pending admin promotion. */
export const productImageCandidatesTable = pgTable("product_image_candidates", {
  id:                  serial("id").primaryKey(),
  produtoNormalizado:  text("produto_normalizado"),
  produtoId:           uuid("produto_id").references(() => produtosTable.id, { onDelete: "set null" }),
  origem:              text("origem").notNull().default("folheto_crop")
    .$type<"folheto_crop" | "admin_upload" | "usuario" | "catalogo">(),
  imageUrl:            text("image_url").notNull(),
  qualityScore:        integer("quality_score"),
  status:              text("status").notNull().default("candidato")
    .$type<"candidato" | "aprovado" | "rejeitado" | "oficial">(),
  sourceImportItemId:  integer("source_import_item_id").references(() => folhetoImportItemsTable.id, { onDelete: "set null" }),
  createdAt:           timestamp("created_at").notNull().defaultNow(),
  updatedAt:           timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("idx_pic_produto").on(t.produtoNormalizado),
  index("idx_pic_status").on(t.status),
]);
export type ProductImageCandidate = typeof productImageCandidatesTable.$inferSelect;

export * from "./off-products";
