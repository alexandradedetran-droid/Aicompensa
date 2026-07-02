// @ts-nocheck
import { Router } from "express";
import { db, mercadosPatrocinadosTable, mercadoEventosTable, mercadosSugeridosTable, fotosFachadaTable, usuariosTable } from "@workspace/db";
import { eq, and, lte, gte, sql, desc, ilike, or, asc, inArray } from "drizzle-orm";
import {
  listMercados,
  getMercadoById,
  listMercadoOfertas,
  getMercadoLegacyByKey,
  listMercadoLegacyOfertas,
} from "../lib/mercado-service";
import { encodeCursor, decodeCursor } from "../lib/cursor";
import { requireAuth } from "../middleware/auth";

const router = Router();

// ── GET /api/mercados-patrocinados/feed ───────────────────────────────────────
router.get("/mercados-patrocinados/feed", async (req, res) => {
  const { cidade } = req.query as { cidade?: string };
  const now = new Date();

  const whereConditions = [
    eq(mercadosPatrocinadosTable.status, "ativo"),
    lte(mercadosPatrocinadosTable.dataInicio, now),
    gte(mercadosPatrocinadosTable.dataFim, now),
  ] as Parameters<typeof and>[0][];

  if (cidade) {
    whereConditions.push(
      sql`lower(${mercadosPatrocinadosTable.cidade}) = lower(${cidade})`
    );
  }

  const rows = await db
    .select()
    .from(mercadosPatrocinadosTable)
    .where(and(...whereConditions))
    .orderBy(desc(mercadosPatrocinadosTable.prioridade))
    .limit(10);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Batch-fetch daily impression counts for rows that have a limit (avoids N+1).
  const limitedIds = rows
    .filter((r) => r.limiteExibicoesDiarias != null)
    .map((r) => r.id);

  const impressionCounts = new Map<number, number>();
  if (limitedIds.length > 0) {
    const countRows = await db
      .select({
        mercadoPatrocinadoId: mercadoEventosTable.mercadoPatrocinadoId,
        count: sql<number>`count(*)::int`,
      })
      .from(mercadoEventosTable)
      .where(
        and(
          inArray(mercadoEventosTable.mercadoPatrocinadoId, limitedIds),
          eq(mercadoEventosTable.tipo, "impressao"),
          gte(mercadoEventosTable.criadoEm, today),
        )
      )
      .groupBy(mercadoEventosTable.mercadoPatrocinadoId);
    for (const r of countRows) impressionCounts.set(r.mercadoPatrocinadoId, r.count);
  }

  const filtered = [];
  for (const row of rows) {
    if (row.limiteExibicoesDiarias != null) {
      const count = impressionCounts.get(row.id) ?? 0;
      if (count >= row.limiteExibicoesDiarias) continue;
    }
    filtered.push({
      id: row.id,
      nomeExibicao: row.nomeExibicao,
      logoUrl: row.logoUrl ?? null,
      cidade: row.cidade,
      bairro: row.bairro ?? null,
      latitude: row.latitude ?? null,
      longitude: row.longitude ?? null,
      planoPatrocinio: row.planoPatrocinio,
      prioridade: row.prioridade,
      nomeCampanha: row.nomeCampanha ?? null,
      descricaoCampanha: row.descricaoCampanha ?? null,
      modoTeste: row.modoTeste,
    });
    if (filtered.length >= 3) break;
  }

  res.json(filtered);
});

// ── Shared event body parser ───────────────────────────────────────────────────
function parseEventoBody(req: import("express").Request): {
  origem: string | null;
  hora: number;
  bairro: string | null;
  distanciaKm: number | null;
  dispositivo: "mobile" | "web";
  tipoFeed: string | null;
} {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const ua = req.headers["user-agent"] ?? "";
  const isMobile = /Mobile|Android|iPhone|iPad/i.test(ua);
  return {
    origem: typeof body.origem === "string" ? body.origem : null,
    hora: new Date().getHours(),
    bairro: typeof body.bairro === "string" ? body.bairro : null,
    distanciaKm: typeof body.distanciaKm === "number" ? body.distanciaKm : null,
    dispositivo: typeof body.dispositivo === "string" && body.dispositivo === "mobile"
      ? "mobile"
      : isMobile ? "mobile" : "web",
    tipoFeed: typeof body.tipoFeed === "string" ? body.tipoFeed : null,
  };
}

// ── POST /api/mercados-patrocinados/:id/impressao ─────────────────────────────
router.post("/mercados-patrocinados/:id/impressao", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "ID inválido" }); return; }

  const evento = parseEventoBody(req);

  const [existing] = await db
    .select({ id: mercadosPatrocinadosTable.id })
    .from(mercadosPatrocinadosTable)
    .where(eq(mercadosPatrocinadosTable.id, id))
    .limit(1);

  if (!existing) { res.status(404).json({ error: "Mercado patrocinado não encontrado" }); return; }

  await db.transaction(async (tx) => {
    await tx.insert(mercadoEventosTable).values({
      mercadoPatrocinadoId: id,
      tipo: "impressao",
      origem: evento.origem,
      hora: evento.hora,
      bairro: evento.bairro,
      distanciaKm: evento.distanciaKm,
      dispositivo: evento.dispositivo,
      tipoFeed: evento.tipoFeed,
    });
    await tx
      .update(mercadosPatrocinadosTable)
      .set({ totalExibicoes: sql`${mercadosPatrocinadosTable.totalExibicoes} + 1` })
      .where(eq(mercadosPatrocinadosTable.id, id));
  });

  res.json({ ok: true });
});

// ── POST /api/mercados-patrocinados/:id/clique ────────────────────────────────
router.post("/mercados-patrocinados/:id/clique", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "ID inválido" }); return; }

  const evento = parseEventoBody(req);

  const [existing] = await db
    .select({ id: mercadosPatrocinadosTable.id })
    .from(mercadosPatrocinadosTable)
    .where(eq(mercadosPatrocinadosTable.id, id))
    .limit(1);

  if (!existing) { res.status(404).json({ error: "Mercado patrocinado não encontrado" }); return; }

  await db.transaction(async (tx) => {
    await tx.insert(mercadoEventosTable).values({
      mercadoPatrocinadoId: id,
      tipo: "clique",
      origem: evento.origem,
      hora: evento.hora,
      bairro: evento.bairro,
      distanciaKm: evento.distanciaKm,
      dispositivo: evento.dispositivo,
      tipoFeed: evento.tipoFeed,
    });
    await tx
      .update(mercadosPatrocinadosTable)
      .set({ totalCliques: sql`${mercadosPatrocinadosTable.totalCliques} + 1` })
      .where(eq(mercadosPatrocinadosTable.id, id));
  });

  res.json({ ok: true });
});

// ── Haversine (server-side) ─────────────────────────────────────────────────
function hav(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const r = (d: number) => (d * Math.PI) / 180;
  const dLat = r(lat2 - lat1), dLng = r(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(r(lat1))*Math.cos(r(lat2))*Math.sin(dLng/2)**2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

const proximosFields = {
  id:        mercadosSugeridosTable.id,
  nome:      mercadosSugeridosTable.nome,
  bairro:    mercadosSugeridosTable.bairro,
  cidade:    mercadosSugeridosTable.cidade,
  estado:    mercadosSugeridosTable.estado,
  lat:       mercadosSugeridosTable.lat,
  lng:       mercadosSugeridosTable.lng,
  fonte:     mercadosSugeridosTable.fonte,
  endereco:  mercadosSugeridosTable.endereco,
  osmId:     mercadosSugeridosTable.osmId,
  usosTotal: mercadosSugeridosTable.usosTotal,
  criadoEm:  mercadosSugeridosTable.criadoEm,
  ativo:     mercadosSugeridosTable.ativo,
  logoUrl:   mercadosSugeridosTable.logoUrl,
};
// In-memory short-term cache: grid-key → { rows, ts }
const _osmCache = new Map<string, { rows: Record<string, unknown>[]; ts: number }>();

// ── GET /api/mercados — list all active markets with aggregated offer counts ───
router.get("/mercados", async (req, res) => {
  const cidade  = typeof req.query["cidade"]  === "string" ? req.query["cidade"]  : undefined;
  const cidadesParam = typeof req.query["cidades"] === "string" ? req.query["cidades"] : undefined;
  const cidades = cidadesParam ? cidadesParam.split(",").map((c) => c.trim()).filter(Boolean) : [];
  const estado  = typeof req.query["estado"]  === "string" ? req.query["estado"]  : undefined;
  const items = await listMercados(
    cidades.length > 0 ? { cidades, estado }
    : cidade || estado ? { cidade, estado }
    : undefined
  );
  res.json(items);
});

// ── GET /api/mercados/proximos?lat=X&lng=Y&raio=2000 ──────────────────────────
router.get("/mercados/proximos", async (req, res) => {
  const lat  = parseFloat(req.query.lat  as string);
  const lng  = parseFloat(req.query.lng  as string);
  const raio = Math.min(parseInt((req.query.raio as string) ?? "2000") || 2000, 5000);

  if (!isFinite(lat) || !isFinite(lng)) {
    res.status(400).json({ error: "lat e lng obrigatórios" });
    return;
  }

  const cacheKey = `${Math.round(lat * 50)},${Math.round(lng * 50)}`;
  const cached = _osmCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 5 * 60 * 1000) {
    const withDist = cached.rows.map(r => ({
      ...r, distanciaMetros: r.lat && r.lng ? Math.round(hav(lat, lng, r.lat, r.lng)) : null,
    })).sort((a, b) => (a.distanciaMetros ?? 99999) - (b.distanciaMetros ?? 99999));
    res.json(withDist.slice(0, 8));
    return;
  }

  // Check DB cache (24 h within ~5 km bounding box)
  const bbox = 0.045; // ~5 km in degrees
  const dbRows = await db.select(proximosFields)
    .from(mercadosSugeridosTable)
    .where(and(
      eq(mercadosSugeridosTable.fonte, "osm"),
      sql`${mercadosSugeridosTable.lat} between ${lat - bbox} and ${lat + bbox}`,
      sql`${mercadosSugeridosTable.lng} between ${lng - bbox} and ${lng + bbox}`,
      gte(mercadosSugeridosTable.criadoEm, new Date(Date.now() - 24 * 3600 * 1000)),
    ))
    .limit(30);

  if (dbRows.length > 0) {
    _osmCache.set(cacheKey, { rows: dbRows, ts: Date.now() });
    const withDist = dbRows
      .map(r => ({ ...r, distanciaMetros: r.lat && r.lng ? Math.round(hav(lat, lng, r.lat, r.lng)) : null }))
      .sort((a, b) => (a.distanciaMetros ?? 99999) - (b.distanciaMetros ?? 99999));
    res.json(withDist.slice(0, 8));
    return;
  }

  // Fetch from OSM Overpass
  const query = `[out:json][timeout:15];(node["shop"~"^(supermarket|convenience|grocery|wholesale)$"](around:${raio},${lat},${lng});way["shop"~"^(supermarket|convenience|grocery|wholesale)$"](around:${raio},${lat},${lng}););out center body;`;

  try {
    const osmRes = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(18000),
    });

    if (!osmRes.ok) { res.json([]); return; }

    const osmData = await osmRes.json() as {
      elements: Array<{
        type: string; id: number;
        lat?: number; lon?: number;
        center?: { lat: number; lon: number };
        tags?: Record<string, string>;
      }>;
    };

    const parsed = osmData.elements
      .filter(el => el.tags?.name)
      .map(el => ({
        nome: el.tags!.name!,
        bairro: el.tags!["addr:suburb"] ?? el.tags!["addr:neighbourhood"] ?? null,
        cidade: el.tags!["addr:city"] ?? null,
        estado: el.tags!["addr:state"] ?? null,
        lat:  (el.type === "node" ? el.lat  : el.center?.lat) ?? null,
        lng:  (el.type === "node" ? el.lon  : el.center?.lon) ?? null,
        fonte: "osm" as const,
        osmId: `${el.type}/${el.id}`,
      }))
      .filter(m => m.lat !== null && m.lng !== null);

    if (parsed.length > 0) {
      await db.insert(mercadosSugeridosTable)
        .values(parsed.map(m => ({ ...m, usosTotal: 0 })))
        .onConflictDoNothing();
    }

    const fresh = await db.select(proximosFields)
      .from(mercadosSugeridosTable)
      .where(and(
        eq(mercadosSugeridosTable.fonte, "osm"),
        sql`${mercadosSugeridosTable.lat} between ${lat - bbox} and ${lat + bbox}`,
        sql`${mercadosSugeridosTable.lng} between ${lng - bbox} and ${lng + bbox}`,
      ))
      .limit(30);

    _osmCache.set(cacheKey, { rows: fresh, ts: Date.now() });
    const withDist = fresh
      .map(r => ({ ...r, distanciaMetros: r.lat && r.lng ? Math.round(hav(lat, lng, r.lat, r.lng)) : null }))
      .sort((a, b) => (a.distanciaMetros ?? 99999) - (b.distanciaMetros ?? 99999));
    res.json(withDist.slice(0, 8));
  } catch {
    req.log.warn("OSM Overpass falhou — retornando lista vazia");
    res.json([]);
  }
});

// ── GET /api/mercados/buscar?q=X[&lat=Y&lng=Z] ───────────────────────────────
// DB-first search; falls back to Nominatim when < 3 results and coords available
router.get("/mercados/buscar", async (req, res) => {
  const q   = (req.query.q   as string ?? "").trim();
  const lat = parseFloat(req.query.lat as string);
  const lng = parseFloat(req.query.lng as string);
  if (!q) { res.json([]); return; }

  const dbSearch = () =>
    db.select(proximosFields)
      .from(mercadosSugeridosTable)
      .where(or(
        ilike(mercadosSugeridosTable.nome,   `%${q}%`),
        ilike(mercadosSugeridosTable.bairro, `%${q}%`),
        ilike(mercadosSugeridosTable.cidade, `%${q}%`),
      ))
      .orderBy(desc(mercadosSugeridosTable.usosTotal), asc(mercadosSugeridosTable.nome))
      .limit(15);

  const rows = await dbSearch();
  if (rows.length >= 3) { res.json(rows); return; }

  // ── Nominatim name-search fallback ───────────────────────────────────────
  const SHOP_CLASSES = new Set(["shop", "amenity"]);
  const SHOP_TYPES   = new Set([
    "supermarket", "convenience", "grocery", "wholesale", "general",
    "greengrocer", "butcher", "marketplace",
  ]);

  try {
    const params = new URLSearchParams({
      q,
      format:         "jsonv2",
      countrycodes:   "br",
      limit:          "10",
      addressdetails: "1",
      "accept-language": "pt-BR",
    });
    if (isFinite(lat) && isFinite(lng)) {
      params.set("viewbox",   `${lng - 0.5},${lat - 0.5},${lng + 0.5},${lat + 0.5}`);
      params.set("bounded",   "0");
    }
    const nmRes = await fetch(
      `https://nominatim.openstreetmap.org/search?${params}`,
      {
        headers: { "User-Agent": "AiCompensa/1.0 (aicompensa.com.br)" },
        signal:  AbortSignal.timeout(9000),
      },
    );
    if (!nmRes.ok) { res.json(rows); return; }

    type NmEl = {
      place_id: number;
      display_name: string;
      name?: string;
      lat: string; lon: string;
      class: string; type: string;
      address?: Record<string, string>;
    };
    const data = await nmRes.json() as NmEl[];

    const matches = data.filter(
      el => SHOP_CLASSES.has(el.class) && SHOP_TYPES.has(el.type),
    );

    if (matches.length > 0) {
      const toInsert = matches.map(el => ({
        nome:   el.name ?? el.display_name.split(",")[0].trim(),
        bairro: el.address?.suburb ?? el.address?.neighbourhood ?? el.address?.district ?? null,
        cidade: el.address?.city   ?? el.address?.town          ?? el.address?.municipality ?? null,
        estado: el.address?.state  ?? null,
        lat:    parseFloat(el.lat),
        lng:    parseFloat(el.lon),
        fonte:  "nominatim",
        osmId:  null as string | null,
        usosTotal: 0,
      }));
      await db.insert(mercadosSugeridosTable).values(toInsert).onConflictDoNothing();
    }

    // Re-query to include freshly inserted rows
    const fresh = await dbSearch();
    res.json(fresh);
  } catch {
    req.log.warn("Nominatim fallback falhou para buscar");
    res.json(rows);
  }
});

// ── POST /api/mercados/manual ─────────────────────────────────────────────────
// UPSERT: respects UNIQUE constraint on (TRIM(lower(nome)), TRIM(lower(COALESCE(cidade,''))))
router.post("/mercados/manual", async (req, res) => {
  const { nome, bairro, cidade, estado, endereco, lat, lng } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof nome !== "string" || !nome.trim()) {
    res.status(400).json({ error: "nome obrigatório" });
    return;
  }

  const nomeTrimmed     = nome.trim();
  const bairroVal       = typeof bairro   === "string" && bairro.trim()   ? bairro.trim()   : null;
  const cidadeVal       = typeof cidade   === "string" && cidade.trim()   ? cidade.trim()   : null;
  const estadoVal       = typeof estado   === "string" && estado.trim()   ? estado.trim()   : null;
  const enderecoVal     = typeof endereco === "string" && endereco.trim() ? endereco.trim() : null;
  const latVal          = typeof lat === "number" && isFinite(lat) ? lat : null;
  const lngVal          = typeof lng === "number" && isFinite(lng) ? lng : null;

  const result = await db.execute(sql`
    INSERT INTO mercados_sugeridos (nome, bairro, cidade, estado, endereco, lat, lng, fonte)
    VALUES (
      ${nomeTrimmed},
      ${bairroVal},
      ${cidadeVal},
      ${estadoVal},
      ${enderecoVal},
      ${latVal},
      ${lngVal},
      'usuario'
    )
    ON CONFLICT (TRIM(lower(nome)), TRIM(lower(COALESCE(cidade, ''))))
    DO UPDATE SET
      bairro   = COALESCE(EXCLUDED.bairro,   mercados_sugeridos.bairro),
      cidade   = COALESCE(EXCLUDED.cidade,   mercados_sugeridos.cidade),
      estado   = COALESCE(EXCLUDED.estado,   mercados_sugeridos.estado),
      endereco = COALESCE(EXCLUDED.endereco, mercados_sugeridos.endereco),
      lat      = COALESCE(EXCLUDED.lat,      mercados_sugeridos.lat),
      lng      = COALESCE(EXCLUDED.lng,      mercados_sugeridos.lng)
    RETURNING *
  `);

  res.json(result.rows[0]);
});

// ── GET /api/mercados/legacy/:legacyKey — detail for unregistered market ──────
// Must be defined BEFORE /mercados/:id to avoid "legacy" being parsed as a numeric id.
router.get("/mercados/legacy/:legacyKey", async (req, res) => {
  const { legacyKey } = req.params;
  if (!legacyKey) { res.status(400).json({ error: "legacyKey obrigatório" }); return; }

  const mercado = await getMercadoLegacyByKey(legacyKey);
  if (!mercado) { res.status(404).json({ error: "Mercado não encontrado" }); return; }

  res.json(mercado);
});

// ── GET /api/mercados/legacy/:legacyKey/ofertas ───────────────────────────────
router.get("/mercados/legacy/:legacyKey/ofertas", async (req, res) => {
  const { legacyKey } = req.params;
  if (!legacyKey) { res.status(400).json({ error: "legacyKey obrigatório" }); return; }

  const mercado = await getMercadoLegacyByKey(legacyKey);
  if (!mercado) { res.status(404).json({ error: "Mercado não encontrado" }); return; }

  const limit     = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const cursorStr = typeof req.query.cursor === "string" ? req.query.cursor : null;
  const cursor    = cursorStr ? decodeCursor(cursorStr) : null;

  if (cursorStr && !cursor) { res.status(400).json({ error: "Cursor inválido" }); return; }

  const { rows, hasMore } = await listMercadoLegacyOfertas(mercado.nome, mercado.cidade, limit + 1, cursor);

  const trimmed = rows.slice(0, limit);
  let nextCursor: string | null = null;
  if (hasMore && trimmed.length > 0) {
    const last = trimmed[trimmed.length - 1]!;
    nextCursor = encodeCursor(last.dataCriacao.getTime(), last.id);
  }

  const items = trimmed.map(r => {
    const score = r.validacoes * 2 + r.curtidas + r.confirmacoes - r.denuncias * 3;
    return {
      id:                  r.id,
      produto:             r.produto,
      categoria:           r.categoria,
      marca:               r.marca ?? null,
      preco:               r.preco,
      precoNormal:         r.precoNormal ?? r.preco,
      precoClube:          r.precoClube ?? null,
      programaClubeName:   r.programaClubeName ?? null,
      tipoPreco:           r.tipoPreco ?? "desconhecido",
      unidade:             r.unidade ?? "un",
      mercado:             r.mercado,
      bairro:              r.bairro ?? null,
      cidade:              r.cidade ?? null,
      fotoUrl:             r.fotoUrl ?? null,
      imagemExibicao:      r.fotoUrl ?? null,
      validade:            r.validade ? r.validade.toISOString() : null,
      latitude:            r.latitude ?? null,
      longitude:           r.longitude ?? null,
      dataCriacao:         r.dataCriacao.toISOString(),
      ultimaValidacaoEm:   r.ultimaValidacaoEm ? r.ultimaValidacaoEm.toISOString() : null,
      ultimaConfirmacaoEm: r.ultimaConfirmacaoEm ? r.ultimaConfirmacaoEm.toISOString() : null,
      curtidas:            r.curtidas,
      validacoes:          r.validacoes,
      confirmacoes:        r.confirmacoes,
      denuncias:           r.denuncias,
      status:              r.status,
      score,
      usuarioId:           r.usuarioId,
      usuario:             r.nome,
      destacada:           r.destacada,
      patrocinada:         r.patrocinada,
      tipoOrigem:          r.tipoOrigem ?? "organica",
      statusUsuario:       r.statusUsuario ?? null,
      mercadoId:           r.mercadoId ?? null,
      mercadoNome:         r.mercado ?? null,
      mercadoLogoUrl:      r.mercadoLogoUrl ?? null,
      usuarioNome:         r.nome,
      autorNome:           r.nome,
    };
  });

  res.json({ items, nextCursor, hasMore });
});

// ── GET /api/mercados/:id — market detail with totalPorCategoria ──────────────
router.get("/mercados/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (!isFinite(id) || id <= 0) { res.status(400).json({ error: "ID inválido" }); return; }

  const mercado = await getMercadoById(id);
  if (!mercado) { res.status(404).json({ error: "Mercado não encontrado" }); return; }

  res.json(mercado);
});

// ── GET /api/mercados/:id/ofertas — paginated offer feed for a market ──────────
router.get("/mercados/:id/ofertas", async (req, res) => {
  const id = parseInt(req.params.id);
  if (!isFinite(id) || id <= 0) { res.status(400).json({ error: "ID inválido" }); return; }

  const mercado = await getMercadoById(id);
  if (!mercado) { res.status(404).json({ error: "Mercado não encontrado" }); return; }

  const limit     = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const cursorStr = typeof req.query.cursor === "string" ? req.query.cursor : null;
  const cursor    = cursorStr ? decodeCursor(cursorStr) : null;

  if (cursorStr && !cursor) {
    res.status(400).json({ error: "Cursor inválido" });
    return;
  }

  const { rows, hasMore } = await listMercadoOfertas(id, mercado.nome, mercado.cidade, limit + 1, cursor);

  const trimmed    = rows.slice(0, limit);
  let nextCursor: string | null = null;
  if (hasMore && trimmed.length > 0) {
    const last = trimmed[trimmed.length - 1]!;
    nextCursor = encodeCursor(last.dataCriacao.getTime(), last.id);
  }

  const items = trimmed.map(r => {
    const score = r.validacoes * 2 + r.curtidas + r.confirmacoes - r.denuncias * 3;
    return {
      id:                  r.id,
      produto:             r.produto,
      categoria:           r.categoria,
      marca:               r.marca ?? null,
      preco:               r.preco,
      precoNormal:         r.precoNormal ?? r.preco,
      precoClube:          r.precoClube ?? null,
      programaClubeName:   r.programaClubeName ?? null,
      tipoPreco:           r.tipoPreco ?? "desconhecido",
      unidade:             r.unidade ?? "un",
      mercado:             r.mercado,
      bairro:              r.bairro ?? null,
      cidade:              r.cidade ?? null,
      fotoUrl:             r.fotoUrl ?? null,
      imagemExibicao:      r.fotoUrl ?? null,
      validade:            r.validade ? r.validade.toISOString() : null,
      latitude:            r.latitude ?? null,
      longitude:           r.longitude ?? null,
      dataCriacao:         r.dataCriacao.toISOString(),
      ultimaValidacaoEm:   r.ultimaValidacaoEm ? r.ultimaValidacaoEm.toISOString() : null,
      ultimaConfirmacaoEm: r.ultimaConfirmacaoEm ? r.ultimaConfirmacaoEm.toISOString() : null,
      curtidas:            r.curtidas,
      validacoes:          r.validacoes,
      confirmacoes:        r.confirmacoes,
      denuncias:           r.denuncias,
      status:              r.status,
      score,
      usuarioId:           r.usuarioId,
      usuario:             r.nome,
      destacada:           r.destacada,
      patrocinada:         r.patrocinada,
      tipoOrigem:          r.tipoOrigem ?? "organica",
      statusUsuario:       r.statusUsuario ?? null,
      mercadoId:           r.mercadoId ?? null,
      mercadoNome:         r.mercado ?? null,
      mercadoLogoUrl:      r.mercadoLogoUrl ?? null,
      usuarioNome:         r.nome,
      autorNome:           r.nome,
    };
  });

  res.json({ items, nextCursor, hasMore });
});

// ── POST /api/mercados/:id/uso ────────────────────────────────────────────────
router.post("/mercados/:id/uso", async (req, res) => {
  const id = parseInt(req.params.id);
  if (!isFinite(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  await db.update(mercadosSugeridosTable)
    .set({ usosTotal: sql`${mercadosSugeridosTable.usosTotal} + 1` })
    .where(eq(mercadosSugeridosTable.id, id));
  res.json({ ok: true });
});

// ── POST /api/mercados/:id/fotos/proposta — user fachada upload (pending) ─────

const SUPABASE_URL      = process.env["SUPABASE_URL"];
const SUPABASE_SVC_KEY  = process.env["SUPABASE_SERVICE_ROLE_KEY"];
const VALID_FOTO_PREFIXES = ["data:image/jpeg;base64,", "data:image/png;base64,", "data:image/webp;base64,"] as const;
const FOTO_MIME: Record<string, string> = {
  "data:image/jpeg;base64,": "image/jpeg",
  "data:image/png;base64,":  "image/png",
  "data:image/webp;base64,": "image/webp",
};
const FOTO_EXT: Record<string, string> = {
  "data:image/jpeg;base64,": "jpg",
  "data:image/png;base64,":  "png",
  "data:image/webp;base64,": "webp",
};

async function uploadFachadaToSupabase(buffer: Buffer, ext: string, mime: string): Promise<string> {
  if (!SUPABASE_URL || !SUPABASE_SVC_KEY) throw new Error("Supabase não configurado.");
  const bucket   = "market-facades";
  const filename = `fachada-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const url      = `${SUPABASE_URL}/storage/v1/object/${bucket}/${filename}`;
  const res = await fetch(url, {
    method:  "POST",
    headers: { Authorization: `Bearer ${SUPABASE_SVC_KEY}`, apikey: SUPABASE_SVC_KEY, "Content-Type": mime, "x-upsert": "false" },
    body:    buffer,
  });
  if (!res.ok) throw new Error(`Supabase upload failed ${res.status}`);
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${filename}`;
}

router.post("/mercados/:id/fotos/proposta", requireAuth, async (req, res) => {
  const mercadoId = parseInt(req.params.id);
  if (!isFinite(mercadoId)) { res.status(400).json({ error: "ID inválido." }); return; }

  const { imageBase64 } = (req.body ?? {}) as { imageBase64?: string };
  if (!imageBase64 || typeof imageBase64 !== "string") {
    res.status(400).json({ error: "imageBase64 obrigatório." });
    return;
  }

  const prefix = VALID_FOTO_PREFIXES.find(p => imageBase64.startsWith(p));
  if (!prefix) {
    res.status(400).json({ error: "Formato inválido. Use data:image/jpeg|png|webp;base64,…" });
    return;
  }

  const [mercado] = await db
    .select({ id: mercadosSugeridosTable.id })
    .from(mercadosSugeridosTable)
    .where(eq(mercadosSugeridosTable.id, mercadoId))
    .limit(1);

  if (!mercado) { res.status(404).json({ error: "Mercado não encontrado." }); return; }

  const buffer = Buffer.from(imageBase64.slice(prefix.length), "base64");
  if (buffer.length > 8 * 1024 * 1024) {
    res.status(400).json({ error: "Imagem muito grande. Máximo 8 MB." });
    return;
  }

  let url: string;
  try {
    url = await uploadFachadaToSupabase(buffer, FOTO_EXT[prefix]!, FOTO_MIME[prefix]!);
  } catch {
    res.status(500).json({ error: "Falha ao armazenar imagem. Tente novamente." });
    return;
  }

  const [foto] = await db
    .insert(fotosFachadaTable)
    .values({ mercadoId, usuarioId: req.session.userId!, url, status: "pendente" })
    .returning({ id: fotosFachadaTable.id });

  res.status(201).json({
    ok: true,
    fotoId: foto!.id,
    mensagem: "Foto enviada com sucesso! Nossa equipe irá analisá-la. Se aprovada, você receberá sua recompensa.",
  });
});

export default router;
