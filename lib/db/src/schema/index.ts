import { pgTable, serial, text, real, integer, timestamp, pgEnum, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ofertaStatusEnum = pgEnum("oferta_status", ["nova", "validada", "suspeita", "expirada"]);

export const usuariosTable = pgTable("usuarios", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),
  pontos: integer("pontos").notNull().default(0),
  bloqueado: boolean("bloqueado").notNull().default(false),
  telefone: text("telefone"),
  cpf: text("cpf"),
  cidadeUsuario: text("cidade_usuario"),
  estado: text("estado"),
  streak: integer("streak").notNull().default(0),
  ultimoLoginEm: timestamp("ultimo_login_em"),
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
}, (t) => [
  index("idx_ofertas_produto").on(t.produto),
  index("idx_ofertas_categoria").on(t.categoria),
  index("idx_ofertas_mercado").on(t.mercado),
  index("idx_ofertas_data_criacao").on(t.dataCriacao),
  index("idx_ofertas_status").on(t.status),
  index("idx_ofertas_usuario_id").on(t.usuarioId),
  index("idx_ofertas_produto_normalizado").on(t.produtoNormalizado),
  index("idx_ofertas_confirmacoes").on(t.confirmacoes),
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

export const insertOfertaSchema = createInsertSchema(ofertasTable).omit({
  id: true,
  dataCriacao: true,
  curtidas: true,
  validacoes: true,
  denuncias: true,
  confirmacoes: true,
  ultimaConfirmacaoEm: true,
  status: true,
});
export type InsertOferta = z.infer<typeof insertOfertaSchema>;
export type Oferta = typeof ofertasTable.$inferSelect;
