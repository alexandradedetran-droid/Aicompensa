// @ts-nocheck
/**
 * Lista de compras — AI suggestions, server sync (alerts), and shared lists.
 *
 * Routes:
 *   POST /api/lista/sugestoes           — AI complementary product suggestions
 *   POST /api/lista/sync                — sync personal list to DB (enables push alerts)
 *   POST /api/lista/comparar            — smart market comparison with confidence index
 *   POST /api/lista/compartilhada       — create a shared list
 *   POST /api/lista/compartilhada/entrar — join by code
 *   GET  /api/lista/compartilhada/:cod  — poll shared list state
 *   POST /api/lista/compartilhada/:cod/itens       — add item
 *   PATCH /api/lista/compartilhada/:cod/itens/:id  — toggle comprado
 *   DELETE /api/lista/compartilhada/:cod/itens/:id — remove item
 *   DELETE /api/lista/compartilhada/:cod/sair      — leave list
 */
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { ai } from "@workspace/integrations-gemini-ai";
import { requireAuth } from "../middleware/auth";
import { db } from "@workspace/db";
import { calcularMelhorCompra, resolverNomesParaProdutoIds } from "../lib/compra-inteligente";
import {
  listaItensUsuarioTable,
  listaCompartilhadaTable,
  listaCompartilhadaMembrosTable,
  listaCompartilhadaItensTable,
  usuariosTable,
  ofertasTable,
} from "@workspace/db";
import { eq, and, sql, inArray, desc, lt, gt, isNull, or, ne } from "drizzle-orm";
import { createNotification, NOTIF } from "../lib/notifications";

const router = Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Normalize to lowercase slug, strip accents, keep only word chars. */
function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

/** Charset avoids visually confusing characters: 0/O, 1/I/L */
const CODE_CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

async function generateUniqueCodigo(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    let codigo = "";
    for (let i = 0; i < 6; i++) {
      codigo += CODE_CHARSET[Math.floor(Math.random() * CODE_CHARSET.length)];
    }
    const [existing] = await db
      .select({ id: listaCompartilhadaTable.id })
      .from(listaCompartilhadaTable)
      .where(eq(listaCompartilhadaTable.codigo, codigo))
      .limit(1);
    if (!existing) return codigo;
  }
  throw new Error("Could not generate unique code");
}

function toStr(v: string | string[]): string {
  return Array.isArray(v) ? (v[0] ?? "") : v;
}

async function getMemberListaId(codigo: string, usuarioId: number): Promise<number | null> {
  const [lista] = await db
    .select({ id: listaCompartilhadaTable.id })
    .from(listaCompartilhadaTable)
    .where(and(eq(listaCompartilhadaTable.codigo, codigo), eq(listaCompartilhadaTable.ativa, true)))
    .limit(1);
  if (!lista) return null;

  const [membro] = await db
    .select({ listaId: listaCompartilhadaMembrosTable.listaId })
    .from(listaCompartilhadaMembrosTable)
    .where(
      and(
        eq(listaCompartilhadaMembrosTable.listaId, lista.id),
        eq(listaCompartilhadaMembrosTable.usuarioId, usuarioId),
      ),
    )
    .limit(1);

  return membro ? lista.id : null;
}

// ── Normalização de itens interpretados pela IA (OCR e voz) ──────────────────
// Garante que toda resposta da IA (ler-manuscrita, interpretar-texto) seja
// padronizada para o mesmo formato: produto, quantidade, unidade, categoria, confiança.

const UNIDADES_CANONICAS = [
  "kg", "g", "mg", "ml", "L",
  "garrafa", "pacote", "caixa", "lata", "bandeja", "dúzia", "un",
] as const;
type UnidadeCanonica = (typeof UNIDADES_CANONICAS)[number];

/** Mapa de variações (singular/plural/sinônimos) → forma canônica da unidade. */
const UNIDADE_MAP: Record<string, UnidadeCanonica> = {
  kg: "kg", quilo: "kg", quilos: "kg", quilograma: "kg", quilogramas: "kg",
  g: "g", grama: "g", gramas: "g",
  mg: "mg", miligrama: "mg", miligramas: "mg",
  ml: "ml", mililitro: "ml", mililitros: "ml",
  l: "L", litro: "L", litros: "L",
  garrafa: "garrafa", garrafas: "garrafa",
  pacote: "pacote", pacotes: "pacote",
  caixa: "caixa", caixas: "caixa",
  lata: "lata", latas: "lata",
  bandeja: "bandeja", bandejas: "bandeja",
  duzia: "dúzia", duzias: "dúzia",
  unidade: "un", unidades: "un", un: "un",
};

function semAcentos(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Normaliza a unidade vinda da IA. Nunca descarta a unidade encontrada — apenas padroniza singular/plural/sinônimos. */
function resolveUnidade(raw: unknown): { unidade: UnidadeCanonica; reconhecida: boolean } {
  if (typeof raw !== "string" || raw.trim().length === 0) return { unidade: "un", reconhecida: false };
  const match = UNIDADE_MAP[semAcentos(raw)];
  return match ? { unidade: match, reconhecida: true } : { unidade: "un", reconhecida: false };
}

const CATEGORIAS_CANONICAS = [
  "Mercearia", "Hortifruti", "Açougue", "Frios", "Laticínios", "Bebidas",
  "Padaria", "Limpeza", "Higiene", "Pet", "Congelados", "Enlatados", "Outros",
] as const;
type CategoriaCanonica = (typeof CATEGORIAS_CANONICAS)[number];

const CATEGORIA_LOOKUP: Record<string, CategoriaCanonica> = Object.fromEntries(
  CATEGORIAS_CANONICAS.map(c => [semAcentos(c), c]),
) as Record<string, CategoriaCanonica>;

/** Normaliza a categoria vinda da IA para o conjunto fixo usado pela UI. Sem correspondência → "Outros". */
function normalizeCategoria(raw: unknown): CategoriaCanonica {
  if (typeof raw !== "string" || raw.trim().length === 0) return "Outros";
  return CATEGORIA_LOOKUP[semAcentos(raw)] ?? "Outros";
}

type Confianca = "alta" | "media" | "baixa";
const CONFIANCAS_VALIDAS = new Set<Confianca>(["alta", "media", "baixa"]);

/** Valida a confiança vinda da IA; se ausente/inválida, infere de forma conservadora (nunca "baixa" por omissão). */
function resolveConfianca(raw: unknown, quantidadeExplicita: boolean, unidadeReconhecida: boolean): Confianca {
  if (typeof raw === "string") {
    const key = semAcentos(raw) as Confianca;
    if (CONFIANCAS_VALIDAS.has(key)) return key;
  }
  return quantidadeExplicita && unidadeReconhecida ? "alta" : "media";
}

/** Normaliza nome do produto: remove espaços extras e padroniza capitalização (primeira letra maiúscula). */
function normalizeNomeProduto(raw: string): string {
  const limpo = raw.trim().replace(/\s+/g, " ");
  return limpo.length > 0 ? limpo.charAt(0).toUpperCase() + limpo.slice(1) : limpo;
}

type ItemInterpretado = {
  produto: string;
  quantidade: number;
  unidade: UnidadeCanonica;
  categoria: CategoriaCanonica;
  confianca: Confianca;
};

type ItemBrutoIA = {
  produto?: unknown;
  quantidade?: unknown;
  unidade?: unknown;
  categoria?: unknown;
  confianca?: unknown;
};

/** Normaliza um item bruto retornado pela IA (OCR ou voz) para o formato padrão da lista. */
function normalizeItemInterpretado(raw: ItemBrutoIA): ItemInterpretado | null {
  if (typeof raw.produto !== "string" || raw.produto.trim().length === 0) return null;

  const quantidadeExplicita = typeof raw.quantidade === "number" && raw.quantidade > 0;
  const quantidade = quantidadeExplicita
    ? Math.min(Math.round((raw.quantidade as number) * 100) / 100, 99)
    : 1;
  const { unidade, reconhecida } = resolveUnidade(raw.unidade);

  return {
    produto: normalizeNomeProduto(raw.produto),
    quantidade,
    unidade,
    categoria: normalizeCategoria(raw.categoria),
    confianca: resolveConfianca(raw.confianca, quantidadeExplicita, reconhecida),
  };
}

// ── Rate limiters ─────────────────────────────────────────────────────────────

const suggestLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas sugestões. Aguarde um momento." },
});

const syncLimiter = rateLimit({
  windowMs: 10_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas atualizações. Aguarde." },
});

const lerManuscritaLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas leituras de lista. Aguarde um momento." },
});

const interpretarTextoLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas interpretações de texto. Aguarde um momento." },
});

// ── POST /lista/sugestoes — AI complementary product suggestions ──────────────

const sugestoesSchema = z.object({
  itens: z.array(z.string().max(80)).min(1).max(50),
});

router.post("/lista/sugestoes", requireAuth, suggestLimiter, async (req, res) => {
  const parsed = sugestoesSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos." });
    return;
  }

  const { itens } = parsed.data;

  const prompt = `Você é um assistente de compras para supermercado brasileiro.
O usuário tem estes ${itens.length} itens na lista: ${itens.map(i => `"${i}"`).join(", ")}.
Liste até 6 produtos complementares que ele provavelmente também precisa.
Responda SOMENTE com JSON válido: {"sugestoes": ["produto1", "produto2", ...]}
Regras:
- Produtos simples vendidos em supermercados do Brasil
- Não repetir nenhum item já listado
- Foco em complementos lógicos (arroz → feijão, frango → limão/alho, fralda → lenço umedecido)
- Nomes curtos em português (máximo 3 palavras)`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { responseMimeType: "application/json" },
    });

    const raw = response.text?.trim() ?? "{}";
    const json = JSON.parse(raw) as { sugestoes?: unknown };
    const sugestoes = Array.isArray(json.sugestoes)
      ? json.sugestoes
          .filter((s): s is string => typeof s === "string")
          .slice(0, 8)
      : [];

    res.json({ sugestoes });
  } catch (err) {
    req.log.warn({ err }, "lista/sugestoes AI error");
    res.status(503).json({ error: "Serviço de IA temporariamente indisponível." });
  }
});

// ── POST /lista/sync — sync user's list for push alerts ──────────────────────

const syncSchema = z.object({
  itens: z.array(z.string().max(100)).max(100),
});

router.post("/lista/sync", requireAuth, syncLimiter, async (req, res) => {
  const parsed = syncSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos." });
    return;
  }

  const userId = req.session.userId!;
  const itens = parsed.data.itens.filter(i => i.trim().length > 0);

  // Replace all existing active items for this user
  await db
    .delete(listaItensUsuarioTable)
    .where(eq(listaItensUsuarioTable.usuarioId, userId));

  if (itens.length > 0) {
    await db.insert(listaItensUsuarioTable).values(
      itens.map(nome => ({
        usuarioId: userId,
        nome: nome.trim(),
        slug: slugify(nome),
        ativo: true,
      })),
    );
  }

  res.json({ ok: true, synced: itens.length });
});

// ── POST /lista/compartilhada — create shared list ────────────────────────────

const criarListaSchema = z.object({
  nome:  z.string().max(60).optional(),
  emoji: z.string().max(8).optional(),
  itens: z.array(z.string().min(1).max(80)).max(200).optional(),
});

router.post("/lista/compartilhada", requireAuth, async (req, res) => {
  const parsed = criarListaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos." });
    return;
  }

  const userId     = req.session.userId!;
  const nome       = parsed.data.nome?.trim()  || "Minha Lista";
  const emoji      = parsed.data.emoji?.trim() || "🛒";
  let itensNomes   = parsed.data.itens ?? [];
  const codigo     = await generateUniqueCodigo();

  // If the frontend sent no items, fall back to the user's synced personal list
  if (itensNomes.length === 0) {
    const personal = await db
      .select({ nome: listaItensUsuarioTable.nome })
      .from(listaItensUsuarioTable)
      .where(eq(listaItensUsuarioTable.usuarioId, userId));
    itensNomes = personal.map(r => r.nome).filter(n => n.trim().length > 0);
  }

  const [user] = await db
    .select({ nome: usuariosTable.nome })
    .from(usuariosTable)
    .where(eq(usuariosTable.id, userId))
    .limit(1);
  const nomeUsuario = user?.nome ?? "Usuário";

  // Create list, membership, and seed items atomically
  const lista = await db.transaction(async (tx) => {
    const [lista] = await tx
      .insert(listaCompartilhadaTable)
      .values({ nome, emoji, codigo, criadorId: userId, ativa: true })
      .returning();

    await tx
      .insert(listaCompartilhadaMembrosTable)
      .values({ listaId: lista.id, usuarioId: userId, papel: "owner", permissao: "edit" })
      .onConflictDoNothing();

    if (itensNomes.length > 0) {
      await tx
        .insert(listaCompartilhadaItensTable)
        .values(
          itensNomes.map(nomeItem => ({
            listaId:    lista.id,
            usuarioId:  userId,
            nomeUsuario,
            nome:       nomeItem.trim(),
            slug:       slugify(nomeItem),
            comprado:   false,
          }))
        );
    }

    return lista;
  });

  const [membro] = await db
    .select()
    .from(listaCompartilhadaMembrosTable)
    .where(and(
      eq(listaCompartilhadaMembrosTable.listaId,   lista.id),
      eq(listaCompartilhadaMembrosTable.usuarioId, userId),
    ))
    .limit(1);

  const state = await buildListaState(lista, userId, membro);
  res.json(state);
});

// ── POST /lista/compartilhada/entrar — join by code ───────────────────────────

const entrarSchema = z.object({ codigo: z.string().length(6) });

router.post("/lista/compartilhada/entrar", requireAuth, async (req, res) => {
  const parsed = entrarSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Código inválido." });
    return;
  }

  const userId = req.session.userId!;
  const codigo = parsed.data.codigo.toUpperCase();

  const [lista] = await db
    .select()
    .from(listaCompartilhadaTable)
    .where(and(eq(listaCompartilhadaTable.codigo, codigo), eq(listaCompartilhadaTable.ativa, true)))
    .limit(1);

  if (!lista) {
    res.status(404).json({ error: "Lista não encontrada." });
    return;
  }

  // Count members (max 10)
  const membros = await db
    .select({ usuarioId: listaCompartilhadaMembrosTable.usuarioId })
    .from(listaCompartilhadaMembrosTable)
    .where(eq(listaCompartilhadaMembrosTable.listaId, lista.id));

  if (membros.length >= 10 && !membros.some(m => m.usuarioId === userId)) {
    res.status(400).json({ error: "Lista cheia (máximo 10 membros)." });
    return;
  }

  await db
    .insert(listaCompartilhadaMembrosTable)
    .values({ listaId: lista.id, usuarioId: userId, papel: "member", permissao: "edit" })
    // Refresh joinedAt on re-join so GET /atual ORDER BY desc(joinedAt) returns this list first.
    .onConflictDoUpdate({
      target: [listaCompartilhadaMembrosTable.listaId, listaCompartilhadaMembrosTable.usuarioId],
      set: { joinedAt: sql`now()` },
    });

  res.json({ id: lista.id, nome: lista.nome, codigo: lista.codigo });
});

// ── Helper: build full list state for a given listaId + requesting userId ─────

async function buildListaState(lista: typeof listaCompartilhadaTable.$inferSelect, userId: number, meuMembro: typeof listaCompartilhadaMembrosTable.$inferSelect) {
  const membrosRows = await db
    .select({
      usuarioId: listaCompartilhadaMembrosTable.usuarioId,
      nome:      usuariosTable.nome,
      papel:     listaCompartilhadaMembrosTable.papel,
      permissao: listaCompartilhadaMembrosTable.permissao,
      joinedAt:  listaCompartilhadaMembrosTable.joinedAt,
    })
    .from(listaCompartilhadaMembrosTable)
    .innerJoin(usuariosTable, eq(usuariosTable.id, listaCompartilhadaMembrosTable.usuarioId))
    .where(eq(listaCompartilhadaMembrosTable.listaId, lista.id))
    .orderBy(listaCompartilhadaMembrosTable.joinedAt);

  const itens = await db
    .select()
    .from(listaCompartilhadaItensTable)
    .where(eq(listaCompartilhadaItensTable.listaId, lista.id))
    .orderBy(listaCompartilhadaItensTable.adicionadoEm);

  return {
    lista: {
      id:        lista.id,
      nome:      lista.nome,
      emoji:     lista.emoji,
      codigo:    lista.codigo,
      criadorId: lista.criadorId,
    },
    meuPapel:     meuMembro.papel,
    minhaPermissao: meuMembro.permissao,
    membros: membrosRows.map(m => ({
      usuarioId: m.usuarioId,
      nome:      m.nome,
      papel:     m.papel,
      permissao: m.permissao,
    })),
    itens: itens.map(i => ({
      id:             i.id,
      usuarioId:      i.usuarioId,
      nomeUsuario:    i.nomeUsuario,
      nome:           i.nome,
      comprado:       i.comprado,
      compradoPorNome: i.compradoPorNome,
      adicionadoEm:   i.adicionadoEm,
    })),
  };
}

// ── GET /lista/compartilhada/atual — full state of my active list ─────────────

router.get("/lista/compartilhada/atual", requireAuth, async (req, res) => {
  const userId = req.session.userId!;

  const [row] = await db
    .select({
      lista:   listaCompartilhadaTable,
      membro:  listaCompartilhadaMembrosTable,
    })
    .from(listaCompartilhadaMembrosTable)
    .innerJoin(
      listaCompartilhadaTable,
      and(
        eq(listaCompartilhadaTable.id,   listaCompartilhadaMembrosTable.listaId),
        eq(listaCompartilhadaTable.ativa, true),
      ),
    )
    .where(eq(listaCompartilhadaMembrosTable.usuarioId, userId))
    // Most recently joined list first — prevents returning an old list when user
    // has multiple active memberships (e.g., their own list + an invited one).
    .orderBy(desc(listaCompartilhadaMembrosTable.joinedAt))
    .limit(1);

  if (!row) {
    res.json({ lista: null });
    return;
  }

  const state = await buildListaState(row.lista, userId, row.membro);
  res.json(state);
});

// ── GET /lista/compartilhada/:codigo — poll list state ────────────────────────

router.get("/lista/compartilhada/:codigo", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const codigo = toStr(req.params["codigo"] ?? "").toUpperCase();

  const [lista] = await db
    .select()
    .from(listaCompartilhadaTable)
    .where(and(eq(listaCompartilhadaTable.codigo, codigo), eq(listaCompartilhadaTable.ativa, true)))
    .limit(1);

  if (!lista) {
    res.status(404).json({ error: "Lista não encontrada." });
    return;
  }

  // Verify membership
  const [membro] = await db
    .select()
    .from(listaCompartilhadaMembrosTable)
    .where(
      and(
        eq(listaCompartilhadaMembrosTable.listaId,   lista.id),
        eq(listaCompartilhadaMembrosTable.usuarioId, userId),
      ),
    )
    .limit(1);

  if (!membro) {
    res.status(403).json({ error: "Você não é membro desta lista." });
    return;
  }

  const state = await buildListaState(lista, userId, membro);
  res.json(state);
});

// ── POST /lista/compartilhada/:codigo/itens — add item ────────────────────────

const addItemSchema = z.object({ nome: z.string().min(1).max(80) });

router.post("/lista/compartilhada/:codigo/itens", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const codigo = toStr(req.params["codigo"] ?? "").toUpperCase();
  const parsed = addItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Nome inválido." });
    return;
  }

  const listaId = await getMemberListaId(codigo, userId);
  if (!listaId) {
    res.status(403).json({ error: "Lista não encontrada ou você não é membro." });
    return;
  }

  const [user] = await db
    .select({ nome: usuariosTable.nome })
    .from(usuariosTable)
    .where(eq(usuariosTable.id, userId))
    .limit(1);

  const nome = parsed.data.nome.trim();
  const [item] = await db
    .insert(listaCompartilhadaItensTable)
    .values({
      listaId,
      usuarioId: userId,
      nomeUsuario: user?.nome ?? "Usuário",
      nome,
      slug: slugify(nome),
      comprado: false,
    })
    .returning();

  res.json({ id: item.id, nome: item.nome, comprado: item.comprado });

  // Notify other members (fire-and-forget — doesn't block response)
  void (async () => {
    try {
      const otherMembers = await db
        .select({ usuarioId: listaCompartilhadaMembrosTable.usuarioId })
        .from(listaCompartilhadaMembrosTable)
        .where(
          and(
            eq(listaCompartilhadaMembrosTable.listaId, listaId),
            ne(listaCompartilhadaMembrosTable.usuarioId, userId),
          ),
        );
      const quem = (user?.nome ?? "Alguém").split(" ")[0];
      await Promise.all(
        otherMembers.map(m =>
          createNotification({
            userId:    m.usuarioId,
            tipo:      NOTIF.LISTA_EDITADA,
            titulo:    `${quem} adicionou ${nome}`,
            mensagem:  `${quem} adicionou "${nome}" à lista compartilhada.`,
            acaoTipo:  "lista",
            acaoId:    codigo,
          }).catch(() => {}),
        ),
      );
    } catch {}
  })();
});

// ── PATCH /lista/compartilhada/:codigo/itens/:id — toggle comprado ───────────

router.patch("/lista/compartilhada/:codigo/itens/:id", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const codigo = toStr(req.params["codigo"] ?? "").toUpperCase();
  const itemId = parseInt(toStr(req.params["id"] ?? ""), 10);

  if (isNaN(itemId)) {
    res.status(400).json({ error: "ID inválido." });
    return;
  }

  const listaId = await getMemberListaId(codigo, userId);
  if (!listaId) {
    res.status(403).json({ error: "Lista não encontrada ou você não é membro." });
    return;
  }

  const [item] = await db
    .select()
    .from(listaCompartilhadaItensTable)
    .where(
      and(
        eq(listaCompartilhadaItensTable.id, itemId),
        eq(listaCompartilhadaItensTable.listaId, listaId),
      ),
    )
    .limit(1);

  if (!item) {
    res.status(404).json({ error: "Item não encontrado." });
    return;
  }

  const [user] = await db
    .select({ nome: usuariosTable.nome })
    .from(usuariosTable)
    .where(eq(usuariosTable.id, userId))
    .limit(1);

  const novoComprado = !item.comprado;
  await db
    .update(listaCompartilhadaItensTable)
    .set({
      comprado: novoComprado,
      compradoPorId: novoComprado ? userId : null,
      compradoPorNome: novoComprado ? (user?.nome ?? null) : null,
      compradoEm: novoComprado ? new Date() : null,
    })
    .where(eq(listaCompartilhadaItensTable.id, itemId));

  res.json({ ok: true, comprado: novoComprado });

  // Notify other members when item is marked as bought (fire-and-forget)
  if (novoComprado) {
    void (async () => {
      try {
        const otherMembers = await db
          .select({ usuarioId: listaCompartilhadaMembrosTable.usuarioId })
          .from(listaCompartilhadaMembrosTable)
          .where(
            and(
              eq(listaCompartilhadaMembrosTable.listaId, listaId),
              ne(listaCompartilhadaMembrosTable.usuarioId, userId),
            ),
          );
        const quem = (user?.nome ?? "Alguém").split(" ")[0];
        await Promise.all(
          otherMembers.map(m =>
            createNotification({
              userId:   m.usuarioId,
              tipo:     NOTIF.ITEM_COMPRADO,
              titulo:   `${quem} marcou ${item.nome} como comprado`,
              mensagem: `${quem} marcou "${item.nome}" como comprado na lista compartilhada.`,
              acaoTipo: "lista",
              acaoId:   codigo,
            }).catch(() => {}),
          ),
        );
      } catch {}
    })();
  }
});

// ── DELETE /lista/compartilhada/:codigo/itens/:id — remove item ───────────────

router.delete("/lista/compartilhada/:codigo/itens/:id", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const codigo = toStr(req.params["codigo"] ?? "").toUpperCase();
  const itemId = parseInt(toStr(req.params["id"] ?? ""), 10);

  if (isNaN(itemId)) {
    res.status(400).json({ error: "ID inválido." });
    return;
  }

  // Must be a member
  const listaId = await getMemberListaId(codigo, userId);
  if (!listaId) {
    res.status(403).json({ error: "Lista não encontrada ou você não é membro." });
    return;
  }

  const [item] = await db
    .select()
    .from(listaCompartilhadaItensTable)
    .where(
      and(
        eq(listaCompartilhadaItensTable.id, itemId),
        eq(listaCompartilhadaItensTable.listaId, listaId),
      ),
    )
    .limit(1);

  if (!item) {
    res.status(404).json({ error: "Item não encontrado." });
    return;
  }

  // Only creator of the item OR the list creator can remove
  const [lista] = await db
    .select({ criadorId: listaCompartilhadaTable.criadorId })
    .from(listaCompartilhadaTable)
    .where(eq(listaCompartilhadaTable.id, listaId))
    .limit(1);

  if (item.usuarioId !== userId && lista?.criadorId !== userId) {
    res.status(403).json({ error: "Sem permissão para remover este item." });
    return;
  }

  await db
    .delete(listaCompartilhadaItensTable)
    .where(eq(listaCompartilhadaItensTable.id, itemId));

  res.json({ ok: true });
});

// ── DELETE /lista/compartilhada/:codigo/sair — leave list ─────────────────────

router.delete("/lista/compartilhada/:codigo/sair", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const codigo = toStr(req.params["codigo"] ?? "").toUpperCase();

  const [lista] = await db
    .select()
    .from(listaCompartilhadaTable)
    .where(and(eq(listaCompartilhadaTable.codigo, codigo), eq(listaCompartilhadaTable.ativa, true)))
    .limit(1);

  if (!lista) {
    res.status(404).json({ error: "Lista não encontrada." });
    return;
  }

  const membro = await db
    .select()
    .from(listaCompartilhadaMembrosTable)
    .where(eq(listaCompartilhadaMembrosTable.listaId, lista.id))
    .orderBy(listaCompartilhadaMembrosTable.joinedAt);

  const isOwner = membro.some(m => m.usuarioId === userId && m.papel === "owner");
  const outrosMembros = membro.filter(m => m.usuarioId !== userId);

  if (isOwner && outrosMembros.length > 0) {
    // Transfer ownership to the oldest remaining member
    const novoOwner = outrosMembros[0]!;
    await db
      .update(listaCompartilhadaMembrosTable)
      .set({ papel: "owner" })
      .where(
        and(
          eq(listaCompartilhadaMembrosTable.listaId,   lista.id),
          eq(listaCompartilhadaMembrosTable.usuarioId, novoOwner.usuarioId),
        ),
      );
    await db
      .update(listaCompartilhadaTable)
      .set({ criadorId: novoOwner.usuarioId })
      .where(eq(listaCompartilhadaTable.id, lista.id));
  }

  // Remove the leaving member
  await db
    .delete(listaCompartilhadaMembrosTable)
    .where(
      and(
        eq(listaCompartilhadaMembrosTable.listaId,   lista.id),
        eq(listaCompartilhadaMembrosTable.usuarioId, userId),
      ),
    );

  // If owner is last member, deactivate the list
  if (isOwner && outrosMembros.length === 0) {
    await db
      .update(listaCompartilhadaTable)
      .set({ ativa: false })
      .where(eq(listaCompartilhadaTable.id, lista.id));
  }

  res.json({ ok: true });
});

// ── POST /lista/comparar — smart market comparison with confidence index ───────

const compararLimiter = rateLimit({
  windowMs: 15_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas comparações. Aguarde um momento." },
});

const compararSchema = z.object({
  itens: z
    .array(
      z.object({
        nome: z.string().min(1).max(80),
        quantidade: z.number().positive().max(99).default(1),
      }),
    )
    .min(1)
    .max(50),
});

// ── DELETE /lista/compartilhada/:codigo — excluir lista (owner only) ──────────

router.delete("/lista/compartilhada/:codigo", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const codigo = toStr(req.params["codigo"] ?? "").toUpperCase();

  const [lista] = await db
    .select()
    .from(listaCompartilhadaTable)
    .where(and(eq(listaCompartilhadaTable.codigo, codigo), eq(listaCompartilhadaTable.ativa, true)))
    .limit(1);

  if (!lista) {
    res.status(404).json({ error: "Lista não encontrada." });
    return;
  }
  if (lista.criadorId !== userId) {
    res.status(403).json({ error: "Apenas o criador da lista pode excluí-la." });
    return;
  }

  await db
    .update(listaCompartilhadaTable)
    .set({ ativa: false })
    .where(eq(listaCompartilhadaTable.id, lista.id));

  res.json({ ok: true });
});

// ── POST /lista/compartilhada/:codigo/convidar — add member (owner only) ──────

const convidarSchema = z.object({ usuarioId: z.number().int().positive() });

router.post("/lista/compartilhada/:codigo/convidar", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const codigo = toStr(req.params["codigo"] ?? "").toUpperCase();
  const parsed = convidarSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "usuarioId inválido." });
    return;
  }

  const [lista] = await db
    .select()
    .from(listaCompartilhadaTable)
    .where(and(eq(listaCompartilhadaTable.codigo, codigo), eq(listaCompartilhadaTable.ativa, true)))
    .limit(1);

  if (!lista) {
    res.status(404).json({ error: "Lista não encontrada." });
    return;
  }
  if (lista.criadorId !== userId) {
    res.status(403).json({ error: "Apenas o criador da lista pode adicionar participantes." });
    return;
  }

  const novoId = parsed.data.usuarioId;
  if (novoId === userId) {
    res.status(400).json({ error: "Você já é membro desta lista." });
    return;
  }

  await db
    .insert(listaCompartilhadaMembrosTable)
    .values({ listaId: lista.id, usuarioId: novoId, papel: "member", permissao: "edit" })
    .onConflictDoNothing();

  res.json({ ok: true });
});

// ── DELETE /lista/compartilhada/:codigo/participantes/:membroId (owner only) ──

router.delete("/lista/compartilhada/:codigo/participantes/:membroId", requireAuth, async (req, res) => {
  const userId   = req.session.userId!;
  const codigo   = toStr(req.params["codigo"] ?? "").toUpperCase();
  const membroId = parseInt(toStr(req.params["membroId"] ?? ""), 10);

  if (!membroId) {
    res.status(400).json({ error: "membroId inválido." });
    return;
  }
  if (membroId === userId) {
    res.status(400).json({ error: "Use /sair para sair da lista." });
    return;
  }

  const [lista] = await db
    .select()
    .from(listaCompartilhadaTable)
    .where(and(eq(listaCompartilhadaTable.codigo, codigo), eq(listaCompartilhadaTable.ativa, true)))
    .limit(1);

  if (!lista) {
    res.status(404).json({ error: "Lista não encontrada." });
    return;
  }
  if (lista.criadorId !== userId) {
    res.status(403).json({ error: "Apenas o criador da lista pode remover participantes." });
    return;
  }

  await db
    .delete(listaCompartilhadaMembrosTable)
    .where(
      and(
        eq(listaCompartilhadaMembrosTable.listaId,   lista.id),
        eq(listaCompartilhadaMembrosTable.usuarioId, membroId),
      ),
    );

  res.json({ ok: true });
});

// ── POST /lista/comparar — smart market comparison with confidence index ───────

router.post("/lista/comparar", requireAuth, compararLimiter, async (req, res) => {
  const parsed = compararSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos." });
    return;
  }

  const { itens } = parsed.data;
  const nomes = itens.map((i) => i.nome);

  // Resolve product names → catalog produtoIds (one batch query)
  const nomeProdutoMap = await resolverNomesParaProdutoIds(nomes);

  const listaComIds = itens
    .map((i) => ({ produtoId: nomeProdutoMap.get(i.nome) ?? null, quantidade: i.quantidade }))
    .filter((i): i is { produtoId: string; quantidade: number } => i.produtoId !== null);

  if (listaComIds.length === 0) {
    res.json({
      melhorMercado: null,
      melhorCombinacao: null,
      rankingMercados: [],
      produtosResolvidosCount: 0,
      produtosTotalCount: itens.length,
    });
    return;
  }

  const resultado = await calcularMelhorCompra(listaComIds);

  res.json({
    ...resultado,
    produtosResolvidosCount: listaComIds.length,
    produtosTotalCount: itens.length,
  });
});

// ── GET /lista/compartilhada/minhas — find my active shared list ──────────────

router.get("/lista/compartilhada/minhas", requireAuth, async (req, res) => {
  const userId = req.session.userId!;

  const rows = await db
    .select({
      id: listaCompartilhadaTable.id,
      nome: listaCompartilhadaTable.nome,
      codigo: listaCompartilhadaTable.codigo,
      criadorId: listaCompartilhadaTable.criadorId,
    })
    .from(listaCompartilhadaMembrosTable)
    .innerJoin(
      listaCompartilhadaTable,
      and(
        eq(listaCompartilhadaTable.id, listaCompartilhadaMembrosTable.listaId),
        eq(listaCompartilhadaTable.ativa, true),
      ),
    )
    .where(eq(listaCompartilhadaMembrosTable.usuarioId, userId))
    .limit(1);

  if (rows.length === 0) {
    res.json({ lista: null });
    return;
  }

  res.json({ lista: rows[0] });
});

// ── POST /lista/ler-manuscrita — interpreta foto de lista manuscrita ──────────

const lerManuscritaSchema = z.object({
  imageBase64: z.string().min(100),
});

router.post("/lista/ler-manuscrita", requireAuth, lerManuscritaLimiter, async (req, res) => {
  const parsed = lerManuscritaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Imagem inválida." });
    return;
  }

  const { imageBase64 } = parsed.data;
  let rawBase64: string;
  let mimeType = "image/jpeg";
  const dataUrlMatch = imageBase64.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/i);
  if (dataUrlMatch) {
    mimeType = dataUrlMatch[1]!.toLowerCase().replace("jpg", "jpeg");
    rawBase64 = dataUrlMatch[2]!;
  } else {
    rawBase64 = imageBase64;
  }

  const SYSTEM = `Você analisa fotos de listas de compras manuscritas em português brasileiro.
Extraia todos os produtos listados, com quantidade, unidade, categoria e confiança.
Corrija erros ortográficos comuns (ex: "leitche" → "Leite", "farinha de trig" → "Farinha de trigo").
Normalize os nomes: primeira letra maiúscula, máximo 4 palavras, sem abreviações.
Se houver quantidade indicada (número, "x2", "duas unidades"), extraia como número; caso contrário use 1.
Identifique a unidade de cada item, quando indicada no texto ou implícita pelo tipo de produto. Use sempre uma destas: kg, g, mg, ml, L, garrafa, pacote, caixa, lata, bandeja, dúzia, un. Nunca descarte a unidade encontrada no texto.
Infira a categoria de cada produto entre: Mercearia, Hortifruti, Açougue, Frios, Laticínios, Bebidas, Padaria, Limpeza, Higiene, Pet, Congelados, Enlatados, Outros.
Avalie sua confiança em cada item: "alta" quando produto, quantidade e unidade estão claros e sem ambiguidade; "media" quando há pequena dúvida (ex: letra difícil de ler); "baixa" apenas quando houver ambiguidade real (ex: palavra ilegível, quantidade rasurada). Nunca use "baixa" para itens perfeitamente legíveis.
Ignore textos que não sejam itens de compras (datas, assinaturas, anotações irrelevantes).
Máximo 30 itens.
Responda SOMENTE com JSON válido, sem markdown, sem explicações, no formato exato:
{"itens": [{"produto": "Arroz", "quantidade": 5, "unidade": "kg", "categoria": "Mercearia", "confianca": "alta"}]}

Exemplos:
"5 kg de arroz" → {"produto": "Arroz", "quantidade": 5, "unidade": "kg", "categoria": "Mercearia", "confianca": "alta"}
"4 pacotes de macarrão" → {"produto": "Macarrão", "quantidade": 4, "unidade": "pacote", "categoria": "Mercearia", "confianca": "alta"}
"3 latas de sardinha" → {"produto": "Sardinha", "quantidade": 3, "unidade": "lata", "categoria": "Enlatados", "confianca": "alta"}
"1 garrafa de óleo" → {"produto": "Óleo", "quantidade": 1, "unidade": "garrafa", "categoria": "Mercearia", "confianca": "alta"}
"detergente" (sem quantidade ou unidade legível) → {"produto": "Detergente", "quantidade": 1, "unidade": "un", "categoria": "Limpeza", "confianca": "media"}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{
        role: "user",
        parts: [
          { inlineData: { data: rawBase64, mimeType } },
          { text: "Leia esta lista de compras manuscrita e retorne os itens em JSON." }
        ]
      }],
      config: {
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
        systemInstruction: SYSTEM,
      },
    });

    const raw = response.text?.trim() ?? "{}";
    let json: { itens?: unknown };
    try { json = JSON.parse(raw) as { itens?: unknown }; }
    catch { json = {}; }

    const itens = Array.isArray(json.itens)
      ? (json.itens as ItemBrutoIA[])
          .map(normalizeItemInterpretado)
          .filter((i): i is ItemInterpretado => i !== null)
          .slice(0, 30)
      : [];

    res.json({ itens });
  } catch (err) {
    req.log.warn({ err }, "lista/ler-manuscrita AI error");
    res.status(503).json({ error: "Não foi possível ler a lista. Tente novamente." });
  }
});

// ── POST /lista/interpretar-texto — interpreta lista falada (voz) ─────────────

const interpretarTextoSchema = z.object({
  texto: z.string().min(2).max(500),
});

router.post("/lista/interpretar-texto", requireAuth, interpretarTextoLimiter, async (req, res) => {
  const parsed = interpretarTextoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Texto inválido." });
    return;
  }

  const { texto } = parsed.data;

  const SYSTEM = `Você interpreta falas de listas de compras em português brasileiro, ditadas naturalmente pelo usuário ao celular.
Extraia cada produto mencionado, com quantidade, unidade, categoria e confiança.
Corrija erros de ortografia e transcrição (ex: "leitche" → "Leite").
Remova palavras sem valor para a lista (ex: "eu quero", "também", "por favor", "preciso de", "e mais").
Normalize os nomes dos produtos: primeira letra maiúscula, máximo 4 palavras, sem abreviações.
Identifique a quantidade falada por extenso ou numeral (ex: "dois", "meia dúzia", "três pacotes") e converta para número; use decimais quando fizer sentido (ex: "meio quilo" = 0.5). Se não houver quantidade explícita, use 1.
Identifique a unidade. Use sempre uma destas: kg, g, mg, ml, L, garrafa, pacote, caixa, lata, bandeja, dúzia, un. Use "kg" para hortifruti, açougue, peixaria e frios vendidos a peso quando nenhuma outra unidade for dita; "un" para produtos comuns contados (ex: leite, banana, ovos) sem unidade explícita; e a unidade exata (garrafa, pacote, caixa, lata, bandeja, dúzia, L, ml, g, mg) sempre que for mencionada na fala. Nunca descarte a unidade encontrada na fala.
Infira a categoria do produto entre: Mercearia, Hortifruti, Açougue, Frios, Laticínios, Bebidas, Padaria, Limpeza, Higiene, Pet, Congelados, Enlatados, Outros.
Avalie sua confiança em cada item: "alta" quando produto, quantidade e unidade estão claros e sem ambiguidade; "media" quando há pequena dúvida; "baixa" apenas quando houver ambiguidade real. Nunca use "baixa" para itens perfeitamente claros.
Ignore qualquer trecho que não seja um item de lista de compras (saudações, comentários, frases soltas).
Máximo 50 itens.
Exemplos:
"dois leites" → {"produto": "Leite", "quantidade": 2, "unidade": "un", "categoria": "Laticínios", "confianca": "alta"}
"cinco kg de arroz" → {"produto": "Arroz", "quantidade": 5, "unidade": "kg", "categoria": "Mercearia", "confianca": "alta"}
"meio quilo de carne moída" → {"produto": "Carne moída", "quantidade": 0.5, "unidade": "kg", "categoria": "Açougue", "confianca": "alta"}
"três pacotes de macarrão" → {"produto": "Macarrão", "quantidade": 3, "unidade": "pacote", "categoria": "Mercearia", "confianca": "alta"}
"três latas de sardinha" → {"produto": "Sardinha", "quantidade": 3, "unidade": "lata", "categoria": "Enlatados", "confianca": "alta"}
Responda SOMENTE com JSON válido, sem markdown, sem explicações:
{"itens": [{"produto": "Nome do Produto", "quantidade": 1, "unidade": "un", "categoria": "Mercearia", "confianca": "alta"}]}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{
        role: "user",
        parts: [{ text: `Texto falado pelo usuário: "${texto}"\n\nRetorne os itens em JSON.` }],
      }],
      config: {
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
        systemInstruction: SYSTEM,
      },
    });

    const raw = response.text?.trim() ?? "{}";
    let json: { itens?: unknown };
    try { json = JSON.parse(raw) as { itens?: unknown }; }
    catch { json = {}; }

    const itens = Array.isArray(json.itens)
      ? (json.itens as ItemBrutoIA[])
          .map(normalizeItemInterpretado)
          .filter((i): i is ItemInterpretado => i !== null)
          .slice(0, 50)
      : [];

    res.json({ itens });
  } catch (err) {
    req.log.warn({ err }, "lista/interpretar-texto AI error");
    res.status(503).json({ error: "Não foi possível interpretar sua lista. Tente novamente." });
  }
});

// ── POST /lista/comparar-mercados — compara custo total da lista por mercado ──

const compararMercadosLimiter = rateLimit({
  windowMs: 30_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas comparações. Aguarde um momento." },
});

const compararMercadosSchema = z.object({
  itens: z.array(z.string().min(1).max(80)).min(1).max(100),
});

router.post("/lista/comparar-mercados", requireAuth, compararMercadosLimiter, async (req, res) => {
  const parsed = compararMercadosSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos." });
    return;
  }

  const { itens } = parsed.data;
  const itensTotal = itens.length;
  const slugs = [...new Set(itens.map(slugify).filter(s => s.length > 0))];

  if (slugs.length === 0) {
    res.json({ itensTotal, itensComparados: 0, mercados: [], economiaMaxima: 0 });
    return;
  }

  const now = new Date();
  const offers = await db
    .select({
      produtoNormalizado: ofertasTable.produtoNormalizado,
      preco: ofertasTable.preco,
      mercado: ofertasTable.mercado,
      mercadoId: ofertasTable.mercadoId,
      dataCriacao: ofertasTable.dataCriacao,
    })
    .from(ofertasTable)
    .where(
      and(
        inArray(ofertasTable.produtoNormalizado, slugs),
        sql`${ofertasTable.status} NOT IN ('expirada', 'removida', 'recusada', 'arquivada')`,
        lt(ofertasTable.denuncias, 3),
        gt(ofertasTable.preco, 0),
        isNull(ofertasTable.statusUsuario),
        or(isNull(ofertasTable.validade), gt(ofertasTable.validade, now)),
      )
    )
    .orderBy(desc(ofertasTable.dataCriacao))
    .limit(5000);

  if (offers.length === 0) {
    res.json({ itensTotal, itensComparados: 0, mercados: [], economiaMaxima: 0 });
    return;
  }

  // Map slug → first original name entered by the user (for product labels)
  const slugToOriginal = new Map<string, string>();
  for (const item of itens) {
    const s = slugify(item);
    if (s.length > 0 && !slugToOriginal.has(s)) slugToOriginal.set(s, item);
  }

  // Dedup: keep the most recent offer per (produtoNormalizado, mercado)
  // Since query is ordered by dataCriacao DESC, first occurrence is the most recent
  type OfferEntry = { produtoNorm: string; preco: number; mercado: string; mercadoId: number | null };
  const seenProdMercado = new Set<string>();
  const deduped: OfferEntry[] = [];
  for (const o of offers) {
    if (!o.produtoNormalizado) continue;
    const mkey = o.mercadoId != null ? `id:${o.mercadoId}` : o.mercado.trim().toLowerCase();
    const key = `${o.produtoNormalizado}::${mkey}`;
    if (!seenProdMercado.has(key)) {
      seenProdMercado.add(key);
      deduped.push({ produtoNorm: o.produtoNormalizado, preco: o.preco, mercado: o.mercado, mercadoId: o.mercadoId ?? null });
    }
  }

  // Group by market: sum totals and track preco per product slug
  type MercadoEntry = { mercado: string; mercadoId: number | null; produtosMap: Map<string, number>; total: number };
  const mercadoMap = new Map<string, MercadoEntry>();
  for (const entry of deduped) {
    const mkey = entry.mercadoId != null ? `id:${entry.mercadoId}` : entry.mercado.trim().toLowerCase();
    if (!mercadoMap.has(mkey)) {
      mercadoMap.set(mkey, { mercado: entry.mercado, mercadoId: entry.mercadoId, produtosMap: new Map(), total: 0 });
    }
    const m = mercadoMap.get(mkey)!;
    m.produtosMap.set(entry.produtoNorm, entry.preco);
    m.total += entry.preco;
  }

  // Count how many of the user's slugs were found in at least one market
  const allFoundSlugs = new Set(deduped.map(d => d.produtoNorm));
  const itensComparados = slugs.filter(s => allFoundSlugs.has(s)).length;

  // Sort markets by total ascending, include per-product breakdown
  const mercados = [...mercadoMap.values()]
    .map(m => {
      const produtos = slugs.map(slug => ({
        nome: slugToOriginal.get(slug) ?? slug,
        preco: m.produtosMap.has(slug) ? m.produtosMap.get(slug)! : null,
        encontrado: m.produtosMap.has(slug),
      }));
      return {
        mercadoId: m.mercadoId,
        mercado: m.mercado,
        valorTotal: Math.round(m.total * 100) / 100,
        itensEncontrados: m.produtosMap.size,
        itensNaoEncontrados: slugs.length - m.produtosMap.size,
        produtos,
      };
    })
    .sort((a, b) => a.valorTotal - b.valorTotal);

  const economiaMaxima = mercados.length >= 2
    ? Math.round((mercados[mercados.length - 1]!.valorTotal - mercados[0]!.valorTotal) * 100) / 100
    : 0;

  res.json({ itensTotal, itensComparados, mercados, economiaMaxima });
});

export default router;
