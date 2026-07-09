import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { db, ofertasTable, usuariosTable, mercadosSugeridosTable, offerConfirmationsTable } from "@workspace/db";
import { and, eq, ilike, sql, asc, gt, or, isNull, type SQL } from "drizzle-orm";
import { computeQuality } from "../lib/quality";
import {
  ListOfertasQueryParams,
  CreateOfertaBody,
  LikeOfertaParams,
  LikeOfertaBody,
  ValidarOfertaParams,
  ValidarOfertaBody,
  DenunciarOfertaParams,
  DenunciarOfertaBody,
} from "@workspace/api-zod";
import { getNivelUsuario } from "../lib/nivel-usuario";
import {
  normalizeProductName,
  withinPriceTolerance,
  DEDUP_WINDOW_MS,
  CONFIRM_COOLDOWN_MS,
  POINTS_NEW_OFFER,
  POINTS_CONFIRMATION,
} from "../lib/dedup";

const router = Router();

// ── Rate limiters ─────────────────────────────────────────────────────────────
// Publish: 5 posts / 10 min per IP (defence against spam bots)
const publishLimiter = rateLimit({
  windowMs: 10 * 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas publicações seguidas. Aguarde alguns minutos." },
});

// Interactions (like/validar/denunciar): 60 / min per IP
const interactLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas ações em sequência. Aguarde um momento." },
});

// ── In-memory per-user publish cooldown: 10 s between posts ──────────────────
const lastPublishMs = new Map<number, number>();
const USER_COOLDOWN_MS = 10_000;

// ── Image size limit ──────────────────────────────────────────────────────────
const MAX_FOTO_B64_CHARS = 500 * 1024;

// ── Input sanitization ────────────────────────────────────────────────────────
function sanitizeStr(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

function capitalizeBr(s: string): string {
  return s
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function computeStatus(row: {
  denuncias: number;
  status: string;
  validade: Date | null;
}): "nova" | "validada" | "suspeita" | "expirada" {
  if (row.validade && row.validade < new Date()) return "expirada";
  if (row.denuncias >= 3) return "suspeita";
  return row.status as "nova" | "validada" | "suspeita" | "expirada";
}

function computeValidity(r: { dataCriacao: Date; ultimaConfirmacaoEm: Date | null; validade: Date | null; validacoes: number; confirmacoes: number }) {
  if (r.validade && r.validade < new Date()) return { validityScore: 0, validityLabel: "Desatualizada" as const };
  const ageH = (Date.now() - r.dataCriacao.getTime()) / 3_600_000;
  const lastConfH = r.ultimaConfirmacaoEm
    ? (Date.now() - r.ultimaConfirmacaoEm.getTime()) / 3_600_000
    : ageH;
  let score = 100;
  if (ageH > 168) score -= 40;
  else if (ageH > 72) score -= 20;
  else if (ageH > 24) score -= 10;
  if (lastConfH < 12) score += 15;
  else if (lastConfH < 48) score += 7;
  score = Math.min(100, Math.max(0, score));
  const validityLabel =
    lastConfH < 6           ? "Recém confirmada" as const
    : score >= 70           ? "Ativa" as const
    : score >= 40           ? "Expirando" as const
    : score >= 20           ? "Possivelmente expirada" as const
    :                         "Desatualizada" as const;
  return { validityScore: score, validityLabel };
}

type OfertaRow = Partial<typeof ofertasTable.$inferSelect> & {
  id: number;
  produto: string;
  categoria: string;
  preco: number;
  mercado: string;
  mercadoId: number | null;
  mercadoLogoUrl?: string | null;
  validade: Date | null;
  dataCriacao: Date;
  ultimaValidacaoEm: Date | null;
  ultimaConfirmacaoEm: Date | null;
  curtidas: number;
  validacoes: number;
  denuncias: number;
  confirmacoes: number;
  status: string;
  usuarioId: number;
  destacada: boolean;
  patrocinada: boolean;
  tipoOrigem: string | null;
  statusUsuario: string | null;
  naoEncontreiMais: number;
  dataEncerramento: Date | null;
  renovacoes: number;
  ultimaRenovacaoEm: Date | null;
  nome: string;
  pontos: number;
};

function getSafeDisplayImage(r: {
  fotoUrl?: string | null;
  folhetoCropUrl?: string | null;
  origemImagem?: string | null;
  imagemMatchScore?: number | null;
  imagemRevisaoPendente?: boolean | null;
}): string | null {
  const cropUrl = r.folhetoCropUrl?.trim() || null;
  const fotoUrl = r.fotoUrl?.trim() || null;
  const origem = r.origemImagem ?? null;
  const score = r.imagemMatchScore ?? null;
  const isCatalogImage = origem === "catalogo_interno" || origem === "site_mercado" || origem === "open_food_facts";
  const isFolhetoImage = origem === "folheto_crop" || (cropUrl !== null && fotoUrl === cropUrl);

  if (!fotoUrl || isFolhetoImage || r.imagemRevisaoPendente || (isCatalogImage && (score == null || score < 0.92))) {
    return null;
  }

  return fotoUrl;
}
function formatOferta(r: OfertaRow, lat?: number, lng?: number) {
  const distancia =
    lat != null && lng != null && r.latitude != null && r.longitude != null
      ? haversineKm(lat, lng, r.latitude, r.longitude)
      : null;

  const score = (r.validacoes * 2 + r.curtidas + r.confirmacoes) - (r.denuncias * 3);
  const superOferta = r.validacoes >= 5 || r.confirmacoes >= 3;
  const emValidacao = r.status === "suspeita";
  const { qualityScore, authorReliability, confiancaLabel } = computeQuality(
    {
      fotoUrl: r.fotoUrl ?? null,
      marca: r.marca ?? null,
      bairro: r.bairro ?? null,
      cidade: r.cidade ?? null,
      latitude: r.latitude ?? null,
      longitude: r.longitude ?? null,
      validacoes: r.validacoes,
      confirmacoes: r.confirmacoes,
      denuncias: r.denuncias,
      dataCriacao: r.dataCriacao,
      ultimaConfirmacaoEm: r.ultimaConfirmacaoEm,
      tipoOrigem: r.tipoOrigem,
    },
    r.pontos,
  );
  const { validityScore, validityLabel } = computeValidity({
    dataCriacao: r.dataCriacao,
    ultimaConfirmacaoEm: r.ultimaConfirmacaoEm,
    validade: r.validade,
    validacoes: r.validacoes,
    confirmacoes: r.confirmacoes,
  });
  const imagemExibicao = getSafeDisplayImage(r);

  return {
    id: r.id,
    produto: r.produto,
    categoria: r.categoria,
    marca: r.marca ?? null,
    preco: r.preco,
    mercado: r.mercado,
    mercadoId: r.mercadoId ?? null,
    mercadoNome: r.mercado,
    mercadoLogoUrl: r.mercadoLogoUrl ?? null,
    bairro: r.bairro ?? null,
    cidade: r.cidade ?? null,
    fotoUrl: imagemExibicao,
    imagemExibicao,
    validade: r.validade ? r.validade.toISOString() : null,
    ultimaValidacaoEm: r.ultimaValidacaoEm ? r.ultimaValidacaoEm.toISOString() : null,
    ultimaConfirmacaoEm: r.ultimaConfirmacaoEm ? r.ultimaConfirmacaoEm.toISOString() : null,
    latitude: r.latitude ?? null,
    longitude: r.longitude ?? null,
    dataCriacao: r.dataCriacao.toISOString(),
    curtidas: r.curtidas,
    validacoes: r.validacoes,
    denuncias: r.denuncias,
    confirmacoes: r.confirmacoes,
    status: computeStatus(r),
    statusUsuario: (r.statusUsuario ?? null) as "encerrada" | "excluida" | "pode_ter_acabado" | null,
    naoEncontreiMais: r.naoEncontreiMais ?? 0,
    dataEncerramento: r.dataEncerramento ? r.dataEncerramento.toISOString() : null,
    renovacoes: r.renovacoes ?? 0,
    ultimaRenovacaoEm: r.ultimaRenovacaoEm ? r.ultimaRenovacaoEm.toISOString() : null,
    usuarioId: r.usuarioId,
    usuario: r.nome,
    usuarioNome: r.nome,
    autorNome: r.nome,
    score,
    nivelUsuario: getNivelUsuario(r.pontos),
    distancia,
    destacada: r.destacada,
    patrocinada: r.patrocinada,
    tipoOrigem: (r.tipoOrigem ?? "organica") as "presencial" | "encarte" | "organica" | "admin" | "importada" | "recorrente" | "patrocinada_externa" | "galeria" | "camera",
    superOferta,
    emValidacao,
    qualityScore,
    authorReliability,
    confiancaLabel: confiancaLabel as "Alta confiança" | "Confiável" | "Questionável" | "Aguardando validação" | "Nova",
    validityScore,
    validityLabel,
    produtoCatalogo: null,
    inteligenciaPreco: null,
  };
}

// ── GET /api/ofertas ──────────────────────────────────────────────────────────
router.get("/ofertas", async (req, res) => {
  const parsed = ListOfertasQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Parâmetros de busca inválidos" });
    return;
  }
  const { produto, categoria, cidade, lat, lng, raio, ordenar } = parsed.data;

  const conditions: SQL[] = [];
  if (produto) conditions.push(ilike(ofertasTable.produto, `%${produto}%`));
  if (categoria) conditions.push(ilike(ofertasTable.categoria, categoria));
  if (cidade) conditions.push(ilike(ofertasTable.cidade, cidade));
  // Hide heavily-reported offers from public feed (still visible in admin)
  conditions.push(sql`${ofertasTable.denuncias} < 5`);
  // Only active/valid offers
  conditions.push(sql`${ofertasTable.status} NOT IN ('removida', 'recusada', 'arquivada')`);

  const rows = await db
    .select({
      id: ofertasTable.id,
      produto: ofertasTable.produto,
      categoria: ofertasTable.categoria,
      marca: ofertasTable.marca,
      preco: ofertasTable.preco,
      mercado: ofertasTable.mercado,
      mercadoId: ofertasTable.mercadoId,
      mercadoLogoUrl: mercadosSugeridosTable.logoUrl,
      bairro: ofertasTable.bairro,
      cidade: ofertasTable.cidade,
      fotoUrl: ofertasTable.fotoUrl,
      folhetoCropUrl: ofertasTable.folhetoCropUrl,
      origemImagem: ofertasTable.origemImagem,
      imagemMatchScore: ofertasTable.imagemMatchScore,
      imagemRevisaoPendente: ofertasTable.imagemRevisaoPendente,
      validade: ofertasTable.validade,
      latitude: ofertasTable.latitude,
      longitude: ofertasTable.longitude,
      dataCriacao: ofertasTable.dataCriacao,
      ultimaValidacaoEm: ofertasTable.ultimaValidacaoEm,
      ultimaConfirmacaoEm: ofertasTable.ultimaConfirmacaoEm,
      curtidas: ofertasTable.curtidas,
      validacoes: ofertasTable.validacoes,
      denuncias: ofertasTable.denuncias,
      confirmacoes: ofertasTable.confirmacoes,
      status: ofertasTable.status,
      usuarioId: ofertasTable.usuarioId,
      destacada: ofertasTable.destacada,
      patrocinada: ofertasTable.patrocinada,
      produtoNormalizado: ofertasTable.produtoNormalizado,
      tipoOrigem: ofertasTable.tipoOrigem,
      statusUsuario: ofertasTable.statusUsuario,
      naoEncontreiMais: ofertasTable.naoEncontreiMais,
      dataEncerramento: ofertasTable.dataEncerramento,
      renovacoes: ofertasTable.renovacoes,
      ultimaRenovacaoEm: ofertasTable.ultimaRenovacaoEm,
      nome: usuariosTable.nome,
      pontos: usuariosTable.pontos,
    })
    .from(ofertasTable)
    .innerJoin(usuariosTable, eq(ofertasTable.usuarioId, usuariosTable.id))
    .leftJoin(mercadosSugeridosTable, eq(ofertasTable.mercadoId, mercadosSugeridosTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(ofertasTable.preco));

  let results = rows.map((r) => formatOferta(r, lat, lng));

  // Filter by radius if location provided
  if (lat != null && lng != null && raio != null) {
    results = results.filter((o) => o.distancia != null && o.distancia <= raio);
  }

  // Sort
  if (ordenar === "distancia" && lat != null && lng != null) {
    results.sort((a, b) => (a.distancia ?? Infinity) - (b.distancia ?? Infinity));
  } else if (ordenar === "validacoes") {
    results.sort((a, b) => b.validacoes - a.validacoes);
  } else if (ordenar === "recente") {
    results.sort((a, b) => new Date(b.dataCriacao).getTime() - new Date(a.dataCriacao).getTime());
  } else if (ordenar === "score") {
    results.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.preco !== b.preco) return a.preco - b.preco;
      return (a.distancia ?? Infinity) - (b.distancia ?? Infinity);
    });
  }

  // Return paginated format that the frontend expects (OfertasFeedResponse)
  res.json({ items: results, nextCursor: null, hasMore: false });
});

// ── POST /api/ofertas ─────────────────────────────────────────────────────────
// Smart publish: detects duplicates and turns repeated submissions into
// confirmations of the existing offer instead of creating a new one.
router.post("/ofertas", publishLimiter, async (req, res) => {
  const parsed = CreateOfertaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Campos obrigatórios inválidos" });
    return;
  }

  const { produto, categoria, marca, preco, mercado, bairro, cidade, fotoUrl, validade, latitude, longitude, usuarioId } = parsed.data;

  if (!bairro || !cidade || !fotoUrl) {
    res.status(400).json({ error: "Produto, categoria, preço, mercado, bairro, cidade e foto são obrigatórios." });
    return;
  }

  if (preco <= 0 || !isFinite(preco)) {
    res.status(400).json({ error: "O preço deve ser maior que zero." });
    return;
  }

  if (fotoUrl.length > MAX_FOTO_B64_CHARS) {
    res.status(400).json({
      error: `Imagem muito grande (${Math.round(fotoUrl.length / 1024)} KB). Máximo: 500 KB.`,
    });
    return;
  }

  // Block anonymous submissions
  if (!usuarioId || usuarioId === 0) {
    res.status(401).json({ error: "Não autorizado. Faça login para publicar ofertas." });
    return;
  }

  // Per-user cooldown (10 s between posts)
  const nowMs = Date.now();
  const lastMs = lastPublishMs.get(usuarioId) ?? 0;
  const waitMs = USER_COOLDOWN_MS - (nowMs - lastMs);
  if (waitMs > 0) {
    res.status(429).json({ error: `Aguarde ${Math.ceil(waitMs / 1000)}s antes de publicar novamente.` });
    return;
  }

  const usuarioRows = await db.select().from(usuariosTable).where(eq(usuariosTable.id, usuarioId)).limit(1);
  if (usuarioRows.length === 0) {
    res.status(401).json({ error: "Usuário não encontrado." });
    return;
  }

  if (usuarioRows[0].bloqueado) {
    res.status(403).json({ error: "Conta bloqueada. Contate o suporte." });
    return;
  }

  lastPublishMs.set(usuarioId, nowMs);

  // Sanitize text inputs
  const produtoClean  = sanitizeStr(produto);
  const mercadoClean  = sanitizeStr(mercado);
  const bairroClean   = capitalizeBr(sanitizeStr(bairro));
  const cidadeClean   = capitalizeBr(sanitizeStr(cidade));
  const marcaClean    = marca ? sanitizeStr(marca) : null;

  // ── DEDUP: normalise product name and search for a similar offer ──────────
  const produtoNorm = normalizeProductName(produtoClean);
  const dedupWindowStart = new Date(nowMs - DEDUP_WINDOW_MS);

  const candidates = await db
    .select()
    .from(ofertasTable)
    .where(
      and(
        eq(ofertasTable.produtoNormalizado, produtoNorm),
        ilike(ofertasTable.mercado, mercadoClean),
        gt(ofertasTable.dataCriacao, dedupWindowStart),
        sql`${ofertasTable.status} NOT IN ('expirada', 'suspeita')`,
        sql`${ofertasTable.denuncias} < 5`,
        // Bug fix: exclude offers where the physical validity date has passed,
        // even when their status column hasn't been updated to 'expirada' yet.
        or(isNull(ofertasTable.validade), gt(ofertasTable.validade, new Date()))
      )
    )
    .limit(10);

  // Find the best candidate within price tolerance (±5 %)
  const similar = candidates.find((c) => withinPriceTolerance(c.preco, preco));

  // ── BRANCH A: confirmation of existing offer ──────────────────────────────
  if (similar) {
    // Anti-spam: prevent the same user from confirming the same offer
    // more than once within the last 24 hours
    const cooldownStart = new Date(nowMs - CONFIRM_COOLDOWN_MS);
    const recentConfirmation = await db
      .select()
      .from(offerConfirmationsTable)
      .where(
        and(
          eq(offerConfirmationsTable.offerId, similar.id),
          eq(offerConfirmationsTable.userId, usuarioId),
          gt(offerConfirmationsTable.confirmedAt, cooldownStart)
        )
      )
      .limit(1);

    if (recentConfirmation.length > 0) {
      res.status(409).json({
        error: "Você já confirmou esta oferta recentemente. Volte amanhã para confirmar novamente.",
      });
      return;
    }

    // Record the confirmation
    await db
      .insert(offerConfirmationsTable)
      .values({ offerId: similar.id, userId: usuarioId });

    // Bump confirmacoes + validacoes (confirmation counts as a validation too)
    // and promote status to "validada" if threshold reached
    const newValidacoes = similar.validacoes + 1;
    const newStatus = newValidacoes >= 3 && similar.status === "nova" ? "validada" : similar.status;

    const [updatedOferta] = await db
      .update(ofertasTable)
      .set({
        confirmacoes: sql`${ofertasTable.confirmacoes} + 1`,
        validacoes: sql`${ofertasTable.validacoes} + 1`,
        ultimaConfirmacaoEm: new Date(),
        ultimaValidacaoEm: new Date(),
        status: newStatus,
      })
      .where(eq(ofertasTable.id, similar.id))
      .returning();

    // Award confirmation points to the submitting user
    await db
      .update(usuariosTable)
      .set({ pontos: sql`${usuariosTable.pontos} + ${POINTS_CONFIRMATION}` })
      .where(eq(usuariosTable.id, usuarioId));

    // Refresh user row for formatting
    const refreshedUsuario = await db
      .select()
      .from(usuariosTable)
      .where(eq(usuariosTable.id, usuarioId))
      .limit(1);

    // Fetch original offer author for formatting
    const ofertaAuthor = await db
      .select()
      .from(usuariosTable)
      .where(eq(usuariosTable.id, updatedOferta.usuarioId))
      .limit(1);

    return res.status(201).json({
      ...formatOferta({
        ...updatedOferta,
        nome: ofertaAuthor[0]?.nome ?? "Desconhecido",
        pontos: ofertaAuthor[0]?.pontos ?? 0,
      }),
      wasConfirmation: true,
      confirmadoPor: refreshedUsuario[0]?.nome ?? "Desconhecido",
    });
  }

  // ── BRANCH B: new offer ───────────────────────────────────────────────────
  const [oferta] = await db
    .insert(ofertasTable)
    .values({
      produto: produtoClean,
      categoria: categoria ?? "Outros",
      marca: marcaClean,
      preco,
      mercado: mercadoClean,
      bairro: bairroClean,
      cidade: cidadeClean,
      fotoUrl: fotoUrl ?? null,
      validade: validade ? new Date(validade) : null,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      usuarioId,
      produtoNormalizado: produtoNorm,
    })
    .returning();

  await db
    .update(usuariosTable)
    .set({ pontos: sql`${usuariosTable.pontos} + ${POINTS_NEW_OFFER}` })
    .where(eq(usuariosTable.id, usuarioId));

  return res.status(201).json({
    ...formatOferta({ ...oferta, nome: usuarioRows[0].nome, pontos: usuarioRows[0].pontos }),
    wasConfirmation: false,
  });
});

// ── POST /api/ofertas/:id/like ────────────────────────────────────────────────
router.post("/ofertas/:id/like", interactLimiter, async (req, res) => {
  const parsedParams = LikeOfertaParams.safeParse({ id: Number(req.params.id) });
  if (!parsedParams.success) { res.status(400).json({ error: "ID inválido" }); return; }

  const parsedBody = LikeOfertaBody.safeParse(req.body);
  if (!parsedBody.success || !parsedBody.data.usuarioId) {
    res.status(401).json({ error: "Não autorizado. Faça login para curtir." });
    return;
  }

  const validador = await db.select().from(usuariosTable).where(eq(usuariosTable.id, parsedBody.data.usuarioId)).limit(1);
  if (validador.length === 0) { res.status(401).json({ error: "Usuário não encontrado." }); return; }

  const [updated] = await db
    .update(ofertasTable)
    .set({ curtidas: sql`${ofertasTable.curtidas} + 1` })
    .where(eq(ofertasTable.id, parsedParams.data.id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Oferta não encontrada" }); return; }

  const usuario = await db.select().from(usuariosTable).where(eq(usuariosTable.id, updated.usuarioId)).limit(1);
  res.json(formatOferta({ ...updated, nome: usuario[0]?.nome ?? "Desconhecido", pontos: usuario[0]?.pontos ?? 0 }));
});

// ── POST /api/ofertas/:id/validar ─────────────────────────────────────────────
router.post("/ofertas/:id/validar", interactLimiter, async (req, res) => {
  const parsedParams = ValidarOfertaParams.safeParse({ id: Number(req.params.id) });
  if (!parsedParams.success) { res.status(400).json({ error: "ID inválido" }); return; }

  const parsedBody = ValidarOfertaBody.safeParse(req.body);
  if (!parsedBody.success || !parsedBody.data.usuarioId) {
    res.status(401).json({ error: "Não autorizado. Faça login para validar." });
    return;
  }

  const validador = await db.select().from(usuariosTable).where(eq(usuariosTable.id, parsedBody.data.usuarioId)).limit(1);
  if (validador.length === 0) { res.status(401).json({ error: "Usuário não encontrado." }); return; }

  const existing = await db.select().from(ofertasTable).where(eq(ofertasTable.id, parsedParams.data.id)).limit(1);
  if (existing.length === 0) { res.status(404).json({ error: "Oferta não encontrada" }); return; }

  const newValidacoes = existing[0].validacoes + 1;
  const newStatus = newValidacoes >= 3 && existing[0].status === "nova" ? "validada" : existing[0].status;

  const [updated] = await db
    .update(ofertasTable)
    .set({ validacoes: sql`${ofertasTable.validacoes} + 1`, status: newStatus, ultimaValidacaoEm: new Date() })
    .where(eq(ofertasTable.id, parsedParams.data.id))
    .returning();

  await db
    .update(usuariosTable)
    .set({ pontos: sql`${usuariosTable.pontos} + 2` })
    .where(eq(usuariosTable.id, updated.usuarioId));

  const usuario = await db.select().from(usuariosTable).where(eq(usuariosTable.id, updated.usuarioId)).limit(1);
  res.json(formatOferta({ ...updated, nome: usuario[0]?.nome ?? "Desconhecido", pontos: usuario[0]?.pontos ?? 0 }));
});

// ── POST /api/ofertas/:id/denunciar ───────────────────────────────────────────
router.post("/ofertas/:id/denunciar", interactLimiter, async (req, res) => {
  const parsedParams = DenunciarOfertaParams.safeParse({ id: Number(req.params.id) });
  if (!parsedParams.success) { res.status(400).json({ error: "ID inválido" }); return; }

  const parsedBody = DenunciarOfertaBody.safeParse(req.body);
  if (!parsedBody.success || !parsedBody.data.usuarioId) {
    res.status(401).json({ error: "Não autorizado. Faça login para denunciar." });
    return;
  }

  const validador = await db.select().from(usuariosTable).where(eq(usuariosTable.id, parsedBody.data.usuarioId)).limit(1);
  if (validador.length === 0) { res.status(401).json({ error: "Usuário não encontrado." }); return; }

  const existing = await db.select().from(ofertasTable).where(eq(ofertasTable.id, parsedParams.data.id)).limit(1);
  if (existing.length === 0) { res.status(404).json({ error: "Oferta não encontrada" }); return; }

  const newDenuncias = existing[0].denuncias + 1;
  const newStatus = newDenuncias >= 3 ? "suspeita" : existing[0].status;

  const [updated] = await db
    .update(ofertasTable)
    .set({ denuncias: sql`${ofertasTable.denuncias} + 1`, status: newStatus })
    .where(eq(ofertasTable.id, parsedParams.data.id))
    .returning();

  const usuario = await db.select().from(usuariosTable).where(eq(usuariosTable.id, updated.usuarioId)).limit(1);
  res.json(formatOferta({ ...updated, nome: usuario[0]?.nome ?? "Desconhecido", pontos: usuario[0]?.pontos ?? 0 }));
});

export default router;
