// @ts-nocheck
import { db, mercadosSugeridosTable, ofertasTable, usuariosTable } from "@workspace/db";
import { eq, sql, desc, and, or, isNull, gt, ilike } from "drizzle-orm";

// ── Shared condition: offers that belong to a market (linked + legacy fallback) ─
// When mercadoCidade is set, legacy fallback also validates city to avoid
// cross-city collisions between markets with the same name (e.g. two "Comper"s).
// If either side has no city, city check is skipped for backward compatibility.
function ofertasBelongToMercado(mercadoId: number, mercadoNome: string, mercadoCidade: string | null) {
  return or(
    eq(ofertasTable.mercadoId, mercadoId),
    and(
      isNull(ofertasTable.mercadoId),
      sql`TRIM(lower(${ofertasTable.mercado})) = TRIM(lower(${mercadoNome}))`,
      mercadoCidade
        ? sql`(${ofertasTable.cidade} IS NULL OR TRIM(lower(${ofertasTable.cidade})) = TRIM(lower(${mercadoCidade})))`
        : undefined,
    ),
  );
}

// ── LegacyKey helpers ────────────────────────────────────────────────────────

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

export function makeLegacyKey(nome: string, cidade: string | null): string {
  const n = slugify(nome);
  const c = cidade ? slugify(cidade) : "";
  return c ? `${n}~${c}` : n;
}

// ── Active-feed conditions (mirrors GET /api/ofertas base filter) ─────────────
const feedActiveConditions = () => [
  sql`${ofertasTable.status} NOT IN ('expirada', 'pendente_validacao', 'revisao_manual', 'recusada', 'removida', 'arquivada')`,
  or(isNull(ofertasTable.validade), gt(ofertasTable.validade, new Date())),
  sql`${ofertasTable.denuncias} < 5`,
  eq(usuariosTable.bloqueado, false),
  sql`${ofertasTable.statusUsuario} IS DISTINCT FROM 'excluida'`,
];

// ── Types ─────────────────────────────────────────────────────────────────────

export type MercadoListItem = {
  id: number | null;         // null for legacy (unregistered) markets
  legacyKey: string | null;  // set when id is null
  isLegacy: boolean;
  nome: string;
  cidade: string | null;
  bairro: string | null;
  estado: string | null;
  lat: number | null;
  lng: number | null;
  totalOfertas: number;
  ultimaOfertaEm: string | null;
  ativo: boolean;
  logoUrl: string | null;
  fachadaUrl: string | null;
};

export type MercadoDetail = MercadoListItem & {
  lat: number | null;
  lng: number | null;
  endereco: string | null;
  fonte: string;
  totalPorCategoria: Array<{ categoria: string; total: number }>;
};

export type MercadoOfertaRow = {
  id: number;
  produto: string;
  categoria: string;
  marca: string | null;
  preco: number;
  precoNormal: number | null;
  precoClube: number | null;
  programaClubeName: string | null;
  tipoPreco: string;
  unidade: string | null;
  mercado: string;
  bairro: string | null;
  cidade: string | null;
  fotoUrl: string | null;
  validade: Date | null;
  latitude: number | null;
  longitude: number | null;
  dataCriacao: Date;
  ultimaValidacaoEm: Date | null;
  ultimaConfirmacaoEm: Date | null;
  curtidas: number;
  validacoes: number;
  confirmacoes: number;
  denuncias: number;
  status: string;
  usuarioId: number;
  nome: string;
  pontos: number;
  destacada: boolean;
  patrocinada: boolean;
  scoreCache: number;
  tipoOrigem: string;
  statusUsuario: string | null;
  mercadoId: number | null;
  mercadoLogoUrl: string | null;
};

// ── GET /api/mercados — list all active markets with offer counts ─────────────

export async function listMercados(filter?: { cidade?: string; cidades?: string[]; estado?: string }): Promise<MercadoListItem[]> {
  // CASE WHEN applied inside count/max so the LEFT JOIN still returns markets
  // with zero active offers (count = 0) instead of filtering them out entirely.
  const activeCount = sql<number>`count(case when
    ${ofertasTable.id} is not null
    and ${ofertasTable.status} not in ('expirada', 'pendente_validacao', 'revisao_manual', 'recusada', 'removida', 'arquivada')
    and (${ofertasTable.validade} is null or ${ofertasTable.validade} > now())
    and ${ofertasTable.denuncias} < 5
    and coalesce(${usuariosTable.bloqueado}, false) = false
    and (${ofertasTable.statusUsuario} is distinct from 'excluida')
    then 1 end)::int`;

  const rows = await db
    .select({
      id:             mercadosSugeridosTable.id,
      nome:           mercadosSugeridosTable.nome,
      cidade:         mercadosSugeridosTable.cidade,
      bairro:         mercadosSugeridosTable.bairro,
      estado:         mercadosSugeridosTable.estado,
      lat:            mercadosSugeridosTable.lat,
      lng:            mercadosSugeridosTable.lng,
      ativo:          mercadosSugeridosTable.ativo,
      logoUrl:        mercadosSugeridosTable.logoUrl,
      fachadaUrl:     mercadosSugeridosTable.fachadaUrl,
      totalOfertas:   activeCount,
      ultimaOfertaEm: sql<string | null>`max(${ofertasTable.dataCriacao})`,
    })
    .from(mercadosSugeridosTable)
    .leftJoin(
      ofertasTable,
      or(
        eq(ofertasTable.mercadoId, mercadosSugeridosTable.id),
        and(
          isNull(ofertasTable.mercadoId),
          sql`TRIM(lower(${ofertasTable.mercado})) = TRIM(lower(${mercadosSugeridosTable.nome}))`,
          sql`(${ofertasTable.cidade} IS NULL OR ${mercadosSugeridosTable.cidade} IS NULL OR TRIM(lower(${ofertasTable.cidade})) = TRIM(lower(${mercadosSugeridosTable.cidade})))`,
        ),
      ),
    )
    .leftJoin(usuariosTable, eq(ofertasTable.usuarioId, usuariosTable.id))
    .where(and(
      eq(mercadosSugeridosTable.ativo, true),
      ...(filter?.cidades && filter.cidades.length > 1
        ? [or(...filter.cidades.map((c) => ilike(mercadosSugeridosTable.cidade, c)))]
        : filter?.cidades?.length === 1
          ? [ilike(mercadosSugeridosTable.cidade, filter.cidades[0])]
          : filter?.cidade
            ? [ilike(mercadosSugeridosTable.cidade, filter.cidade)]
            : []),
      ...(filter?.estado ? [ilike(mercadosSugeridosTable.estado, filter.estado)] : []),
    ))
    .groupBy(
      mercadosSugeridosTable.id,
      mercadosSugeridosTable.nome,
      mercadosSugeridosTable.cidade,
      mercadosSugeridosTable.bairro,
      mercadosSugeridosTable.estado,
      mercadosSugeridosTable.lat,
      mercadosSugeridosTable.lng,
      mercadosSugeridosTable.ativo,
      mercadosSugeridosTable.logoUrl,
      mercadosSugeridosTable.fachadaUrl,
    )
    .orderBy(desc(activeCount));

  const registered: MercadoListItem[] = rows.map(r => ({
    id:             r.id,
    legacyKey:      null,
    isLegacy:       false,
    nome:           r.nome,
    cidade:         r.cidade,
    bairro:         r.bairro,
    estado:         r.estado,
    lat:            r.lat ?? null,
    lng:            r.lng ?? null,
    ativo:          r.ativo,
    logoUrl:        r.logoUrl,
    fachadaUrl:     (r.fachadaUrl as string | null) ?? null,
    totalOfertas:   r.totalOfertas,
    ultimaOfertaEm: r.ultimaOfertaEm ? new Date(r.ultimaOfertaEm).toISOString() : null,
  }));

  // Append legacy groups: offers with mercadoId IS NULL that have no matching registered market
  const cidadeFilter = filter?.cidades && filter.cidades.length > 0
    ? sql` AND (${sql.join(filter.cidades.map((c) => sql`LOWER(o.cidade) ILIKE LOWER(${c})`), sql` OR `)})`
    : filter?.cidade
      ? sql` AND LOWER(o.cidade) ILIKE LOWER(${filter.cidade})`
      : sql``;
  const legacyResult = await db.execute(sql`
    SELECT
      o.mercado                                                              AS nome,
      o.cidade,
      MAX(o.bairro)                                                         AS bairro,
      COUNT(CASE WHEN
        o.status NOT IN ('expirada','pendente_validacao','revisao_manual','recusada','removida','arquivada')
        AND (o.validade IS NULL OR o.validade > NOW())
        AND o.denuncias < 5
        AND COALESCE(u.bloqueado, false) = false
        AND (o.status_usuario IS DISTINCT FROM 'excluida')
        THEN 1 END
      )::int                                                                AS total_ofertas,
      MAX(o.data_criacao)                                                   AS ultima_oferta_em
    FROM ofertas o
    LEFT JOIN usuarios u ON u.id = o.usuario_id
    WHERE o.mercado_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM mercados_sugeridos ms
        WHERE TRIM(LOWER(ms.nome)) = TRIM(LOWER(o.mercado))
          AND (ms.cidade IS NULL OR o.cidade IS NULL OR TRIM(LOWER(ms.cidade)) = TRIM(LOWER(o.cidade)))
          AND ms.ativo = TRUE
      )
      ${cidadeFilter}
    GROUP BY o.mercado, o.cidade
    HAVING COUNT(CASE WHEN
      o.status NOT IN ('expirada','pendente_validacao','revisao_manual','recusada','removida','arquivada')
      AND (o.validade IS NULL OR o.validade > NOW())
      AND o.denuncias < 5
      AND COALESCE(u.bloqueado, false) = false
      AND (o.status_usuario IS DISTINCT FROM 'excluida')
      THEN 1 END
    ) > 0
  `);

  const legacyItems: MercadoListItem[] = (legacyResult.rows as any[]).map(r => ({
    id:             null,
    legacyKey:      makeLegacyKey(r.nome, r.cidade ?? null),
    isLegacy:       true,
    nome:           r.nome,
    cidade:         r.cidade ?? null,
    bairro:         r.bairro ?? null,
    estado:         null,
    lat:            null,
    lng:            null,
    ativo:          true,
    logoUrl:        null,
    fachadaUrl:     null,
    totalOfertas:   r.total_ofertas ?? 0,
    ultimaOfertaEm: r.ultima_oferta_em ? new Date(r.ultima_oferta_em).toISOString() : null,
  }));

  // Orphaned offers: mercadoId IS NOT NULL but market is INACTIVE (ativo=FALSE).
  // These would be invisible (not in registered, not in legacy). Surface as legacy.
  const orphanCidadeFilter = filter?.cidades && filter.cidades.length > 0
    ? sql` AND (${sql.join(filter.cidades.map((c) => sql`LOWER(o.cidade) ILIKE LOWER(${c})`), sql` OR `)})`
    : filter?.cidade
      ? sql` AND LOWER(o.cidade) ILIKE LOWER(${filter.cidade})`
      : sql``;
  const orphanResult = await db.execute(sql`
    SELECT
      ms.nome,
      o.cidade,
      MAX(o.bairro)                                                         AS bairro,
      COUNT(CASE WHEN
        o.status NOT IN ('expirada','pendente_validacao','revisao_manual','recusada','removida','arquivada')
        AND (o.validade IS NULL OR o.validade > NOW())
        AND o.denuncias < 5
        AND COALESCE(u.bloqueado, false) = false
        AND (o.status_usuario IS DISTINCT FROM 'excluida')
        THEN 1 END
      )::int                                                                AS total_ofertas,
      MAX(o.data_criacao)                                                   AS ultima_oferta_em
    FROM ofertas o
    INNER JOIN mercados_sugeridos ms ON ms.id = o.mercado_id AND ms.ativo = FALSE
    LEFT JOIN usuarios u ON u.id = o.usuario_id
    WHERE o.mercado_id IS NOT NULL
      ${orphanCidadeFilter}
    GROUP BY ms.nome, o.cidade
    HAVING COUNT(CASE WHEN
      o.status NOT IN ('expirada','pendente_validacao','revisao_manual','recusada','removida','arquivada')
      AND (o.validade IS NULL OR o.validade > NOW())
      AND o.denuncias < 5
      AND COALESCE(u.bloqueado, false) = false
      AND (o.status_usuario IS DISTINCT FROM 'excluida')
      THEN 1 END
    ) > 0
  `);

  const orphanItems: MercadoListItem[] = (orphanResult.rows as any[]).map(r => ({
    id:             null,
    legacyKey:      makeLegacyKey(r.nome, r.cidade ?? null),
    isLegacy:       true,
    nome:           r.nome,
    cidade:         r.cidade ?? null,
    bairro:         r.bairro ?? null,
    estado:         null,
    lat:            null,
    lng:            null,
    ativo:          false,
    logoUrl:        null,
    fachadaUrl:     null,
    totalOfertas:   r.total_ofertas ?? 0,
    ultimaOfertaEm: r.ultima_oferta_em ? new Date(r.ultima_oferta_em).toISOString() : null,
  }));

  // Name-mismatch offers: mercadoId IS NOT NULL and market is ACTIVE, but the offer's
  // mercado text doesn't match the linked market's name (wrong FK assignment by OCR/picker).
  // These are invisible in all previous queries: counted under the wrong registered market.
  const mismatchCidadeFilter = orphanCidadeFilter;
  const mismatchResult = await db.execute(sql`
    SELECT
      o.mercado                                                             AS nome,
      o.cidade,
      MAX(o.bairro)                                                         AS bairro,
      COUNT(CASE WHEN
        o.status NOT IN ('expirada','pendente_validacao','revisao_manual','recusada','removida','arquivada')
        AND (o.validade IS NULL OR o.validade > NOW())
        AND o.denuncias < 5
        AND COALESCE(u.bloqueado, false) = false
        AND (o.status_usuario IS DISTINCT FROM 'excluida')
        THEN 1 END
      )::int                                                                AS total_ofertas,
      MAX(o.data_criacao)                                                   AS ultima_oferta_em
    FROM ofertas o
    INNER JOIN mercados_sugeridos ms
      ON ms.id = o.mercado_id
      AND ms.ativo = TRUE
      AND TRIM(LOWER(ms.nome)) != TRIM(LOWER(o.mercado))
    LEFT JOIN usuarios u ON u.id = o.usuario_id
    WHERE o.mercado_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM mercados_sugeridos ms2
        WHERE TRIM(LOWER(ms2.nome)) = TRIM(LOWER(o.mercado))
          AND ms2.ativo = TRUE
      )
      ${mismatchCidadeFilter}
    GROUP BY o.mercado, o.cidade
    HAVING COUNT(CASE WHEN
      o.status NOT IN ('expirada','pendente_validacao','revisao_manual','recusada','removida','arquivada')
      AND (o.validade IS NULL OR o.validade > NOW())
      AND o.denuncias < 5
      AND COALESCE(u.bloqueado, false) = false
      AND (o.status_usuario IS DISTINCT FROM 'excluida')
      THEN 1 END
    ) > 0
  `);

  const mismatchItems: MercadoListItem[] = (mismatchResult.rows as any[]).map(r => ({
    id:             null,
    legacyKey:      makeLegacyKey(r.nome, r.cidade ?? null),
    isLegacy:       true,
    nome:           r.nome,
    cidade:         r.cidade ?? null,
    bairro:         r.bairro ?? null,
    estado:         null,
    lat:            null,
    lng:            null,
    ativo:          true,
    logoUrl:        null,
    fachadaUrl:     null,
    totalOfertas:   r.total_ofertas ?? 0,
    ultimaOfertaEm: r.ultima_oferta_em ? new Date(r.ultima_oferta_em).toISOString() : null,
  }));

  // Merge all sources. Deduplicate by accent-normalized slug (makeLegacyKey), preferring
  // registered markets over legacy/mismatch entries for the same market name written
  // with or without accents (e.g. "America" and "América" → same slug "america~cuiaba").
  const all = [...registered, ...legacyItems, ...orphanItems, ...mismatchItems];
  const seenBySlug = new Map<string, MercadoListItem>();
  for (const m of all) {
    const slugKey = makeLegacyKey(m.nome, m.cidade);
    const existing = seenBySlug.get(slugKey);
    if (!existing || (existing.isLegacy && !m.isLegacy)) {
      seenBySlug.set(slugKey, m);
    }
  }
  return Array.from(seenBySlug.values()).sort((a, b) => b.totalOfertas - a.totalOfertas);
}

// ── GET /api/mercados/:id — market detail with per-category counts ─────────────

export async function getMercadoById(id: number): Promise<MercadoDetail | null> {
  const rows = await db
    .select()
    .from(mercadosSugeridosTable)
    .where(eq(mercadosSugeridosTable.id, id))
    .limit(1);
  const mercado = rows[0] ?? null;

  if (!mercado) return null;

  const condition = ofertasBelongToMercado(id, mercado.nome, mercado.cidade);
  const activeCondition = and(condition, ...feedActiveConditions());

  const [statsRow] = await db
    .select({
      totalOfertas:   sql<number>`count(*)::int`,
      ultimaOfertaEm: sql<string | null>`max(${ofertasTable.dataCriacao})`,
    })
    .from(ofertasTable)
    .innerJoin(usuariosTable, eq(ofertasTable.usuarioId, usuariosTable.id))
    .where(activeCondition);

  const categoriaRows = await db
    .select({
      categoria: ofertasTable.categoria,
      total:     sql<number>`count(*)::int`,
    })
    .from(ofertasTable)
    .innerJoin(usuariosTable, eq(ofertasTable.usuarioId, usuariosTable.id))
    .where(activeCondition)
    .groupBy(ofertasTable.categoria)
    .orderBy(desc(sql`count(*)`));

  return {
    id:              mercado.id,
    nome:            mercado.nome,
    cidade:          mercado.cidade,
    bairro:          mercado.bairro,
    estado:          mercado.estado,
    lat:             mercado.lat,
    lng:             mercado.lng,
    endereco:        mercado.endereco,
    fonte:           mercado.fonte,
    ativo:           mercado.ativo,
    logoUrl:         mercado.logoUrl,
    fachadaUrl:      mercado.fachadaUrl,
    totalOfertas:    statsRow?.totalOfertas ?? 0,
    ultimaOfertaEm:  statsRow?.ultimaOfertaEm ? new Date(statsRow.ultimaOfertaEm).toISOString() : null,
    totalPorCategoria: categoriaRows,
  };
}

// ── GET /api/mercados/:id/ofertas — paginated offer feed for a market ──────────

export async function listMercadoOfertas(
  id: number,
  nome: string,
  cidade: string | null,
  limit: number,
  cursor: { val: number; id: number } | null,
): Promise<{ rows: MercadoOfertaRow[]; hasMore: boolean }> {
  const conditions = [
    ofertasBelongToMercado(id, nome, cidade),
    ...feedActiveConditions(),
  ];

  if (cursor) {
    const cursorDate = new Date(cursor.val);
    conditions.push(
      sql`(${ofertasTable.dataCriacao} < ${cursorDate} OR (${ofertasTable.dataCriacao} = ${cursorDate} AND ${ofertasTable.id} < ${cursor.id}))`,
    );
  }

  const rows = await db
    .select({
      id:                  ofertasTable.id,
      produto:             ofertasTable.produto,
      categoria:           ofertasTable.categoria,
      marca:               ofertasTable.marca,
      preco:               ofertasTable.preco,
      precoNormal:         ofertasTable.precoNormal,
      precoClube:          ofertasTable.precoClube,
      programaClubeName:   ofertasTable.programaClubeName,
      tipoPreco:           ofertasTable.tipoPreco,
      unidade:             ofertasTable.unidade,
      mercado:             ofertasTable.mercado,
      bairro:              ofertasTable.bairro,
      cidade:              ofertasTable.cidade,
      fotoUrl:             ofertasTable.fotoUrl,
      validade:            ofertasTable.validade,
      latitude:            ofertasTable.latitude,
      longitude:           ofertasTable.longitude,
      dataCriacao:         ofertasTable.dataCriacao,
      ultimaValidacaoEm:   ofertasTable.ultimaValidacaoEm,
      ultimaConfirmacaoEm: ofertasTable.ultimaConfirmacaoEm,
      curtidas:            ofertasTable.curtidas,
      validacoes:          ofertasTable.validacoes,
      confirmacoes:        ofertasTable.confirmacoes,
      denuncias:           ofertasTable.denuncias,
      status:              ofertasTable.status,
      usuarioId:           ofertasTable.usuarioId,
      destacada:           ofertasTable.destacada,
      patrocinada:         ofertasTable.patrocinada,
      scoreCache:          ofertasTable.scoreCache,
      tipoOrigem:          ofertasTable.tipoOrigem,
      statusUsuario:       ofertasTable.statusUsuario,
      mercadoId:           ofertasTable.mercadoId,
      mercadoLogoUrl:      mercadosSugeridosTable.logoUrl,
      nome:                usuariosTable.nome,
      pontos:              usuariosTable.pontos,
    })
    .from(ofertasTable)
    .innerJoin(usuariosTable, eq(ofertasTable.usuarioId, usuariosTable.id))
    .where(and(...conditions))
    .orderBy(desc(ofertasTable.dataCriacao), desc(ofertasTable.id))
    .limit(limit);

  const hasMore = rows.length === limit;
  return { rows: rows.slice(0, limit), hasMore };
}

// ── GET /api/mercados/legacy/:legacyKey — detail for unregistered market ──────

export async function getMercadoLegacyByKey(legacyKey: string): Promise<MercadoDetail | null> {
  // Find all distinct legacy groups and locate matching key
  const distinctResult = await db.execute(sql`
    SELECT DISTINCT o.mercado AS nome, o.cidade
    FROM ofertas o
    WHERE o.mercado_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM mercados_sugeridos ms
        WHERE TRIM(LOWER(ms.nome)) = TRIM(LOWER(o.mercado))
          AND (ms.cidade IS NULL OR o.cidade IS NULL OR TRIM(LOWER(ms.cidade)) = TRIM(LOWER(o.cidade)))
          AND ms.ativo = TRUE
      )
    UNION
    SELECT DISTINCT o.mercado AS nome, o.cidade
    FROM ofertas o
    INNER JOIN mercados_sugeridos ms
      ON ms.id = o.mercado_id
      AND ms.ativo = TRUE
      AND TRIM(LOWER(ms.nome)) != TRIM(LOWER(o.mercado))
    WHERE NOT EXISTS (
      SELECT 1 FROM mercados_sugeridos ms2
      WHERE TRIM(LOWER(ms2.nome)) = TRIM(LOWER(o.mercado))
        AND ms2.ativo = TRUE
    )
  `);

  const match = (distinctResult.rows as { nome: string; cidade: string | null }[]).find(
    r => makeLegacyKey(r.nome, r.cidade ?? null) === legacyKey,
  );
  if (!match) return null;

  const { nome, cidade } = match;

  // Condition shared by stats and categories: pure legacy (mercadoId IS NULL) OR
  // name-mismatch (mercadoId IS NOT NULL but linked market has a different name).
  const legacyOrMismatchWhere = sql`
    TRIM(LOWER(o.mercado)) = TRIM(LOWER(${nome}))
    AND (${cidade} IS NULL OR o.cidade IS NULL OR TRIM(LOWER(o.cidade)) = TRIM(LOWER(${cidade})))
    AND (
      o.mercado_id IS NULL
      OR EXISTS (
        SELECT 1 FROM mercados_sugeridos ms
        WHERE ms.id = o.mercado_id
          AND TRIM(LOWER(ms.nome)) != TRIM(LOWER(o.mercado))
      )
    )
  `;

  const statsResult = await db.execute(sql`
    SELECT
      COUNT(CASE WHEN
        o.status NOT IN ('expirada','pendente_validacao','revisao_manual','recusada','removida','arquivada')
        AND (o.validade IS NULL OR o.validade > NOW())
        AND o.denuncias < 5
        AND COALESCE(u.bloqueado, false) = false
        AND (o.status_usuario IS DISTINCT FROM 'excluida')
        THEN 1 END
      )::int AS total_ofertas,
      MAX(o.data_criacao) AS ultima_oferta_em,
      MAX(o.bairro) AS bairro
    FROM ofertas o
    LEFT JOIN usuarios u ON u.id = o.usuario_id
    WHERE ${legacyOrMismatchWhere}
  `);

  const catResult = await db.execute(sql`
    SELECT o.categoria, COUNT(*)::int AS total
    FROM ofertas o
    LEFT JOIN usuarios u ON u.id = o.usuario_id
    WHERE ${legacyOrMismatchWhere}
      AND o.status NOT IN ('expirada','pendente_validacao','revisao_manual','recusada','removida','arquivada')
      AND (o.validade IS NULL OR o.validade > NOW())
      AND o.denuncias < 5
      AND COALESCE(u.bloqueado, false) = false
      AND (o.status_usuario IS DISTINCT FROM 'excluida')
    GROUP BY o.categoria
    ORDER BY COUNT(*) DESC
  `);

  const stats = (statsResult.rows as any)[0] ?? {};

  return {
    id:              null as any,
    legacyKey,
    isLegacy:        true,
    nome,
    cidade:          cidade ?? null,
    bairro:          stats.bairro ?? null,
    estado:          null,
    lat:             null,
    lng:             null,
    endereco:        null,
    fonte:           "legacy",
    ativo:           true,
    logoUrl:         null,
    totalOfertas:    stats.total_ofertas ?? 0,
    ultimaOfertaEm:  stats.ultima_oferta_em ? new Date(stats.ultima_oferta_em).toISOString() : null,
    totalPorCategoria: (catResult.rows as { categoria: string; total: number }[]).map(r => ({
      categoria: r.categoria,
      total: r.total,
    })),
  };
}

// ── GET /api/mercados/legacy/:legacyKey/ofertas — offers for legacy market ────

export async function listMercadoLegacyOfertas(
  nome: string,
  cidade: string | null,
  limit: number,
  cursor: { val: number; id: number } | null,
): Promise<{ rows: MercadoOfertaRow[]; hasMore: boolean }> {
  // Include pure legacy (mercadoId IS NULL) and name-mismatch offers (wrong FK).
  const conditions: any[] = [
    or(
      isNull(ofertasTable.mercadoId),
      sql`EXISTS (SELECT 1 FROM mercados_sugeridos ms WHERE ms.id = ${ofertasTable.mercadoId} AND TRIM(LOWER(ms.nome)) != TRIM(LOWER(${ofertasTable.mercado})))`,
    ),
    sql`TRIM(LOWER(${ofertasTable.mercado})) = TRIM(LOWER(${nome}))`,
    cidade
      ? sql`(${ofertasTable.cidade} IS NULL OR TRIM(LOWER(${ofertasTable.cidade})) = TRIM(LOWER(${cidade})))`
      : undefined,
    ...feedActiveConditions(),
  ].filter(Boolean);

  if (cursor) {
    const cursorDate = new Date(cursor.val);
    conditions.push(
      sql`(${ofertasTable.dataCriacao} < ${cursorDate} OR (${ofertasTable.dataCriacao} = ${cursorDate} AND ${ofertasTable.id} < ${cursor.id}))`,
    );
  }

  const rows = await db
    .select({
      id:                  ofertasTable.id,
      produto:             ofertasTable.produto,
      categoria:           ofertasTable.categoria,
      marca:               ofertasTable.marca,
      preco:               ofertasTable.preco,
      precoNormal:         ofertasTable.precoNormal,
      precoClube:          ofertasTable.precoClube,
      programaClubeName:   ofertasTable.programaClubeName,
      tipoPreco:           ofertasTable.tipoPreco,
      unidade:             ofertasTable.unidade,
      mercado:             ofertasTable.mercado,
      bairro:              ofertasTable.bairro,
      cidade:              ofertasTable.cidade,
      fotoUrl:             ofertasTable.fotoUrl,
      validade:            ofertasTable.validade,
      latitude:            ofertasTable.latitude,
      longitude:           ofertasTable.longitude,
      dataCriacao:         ofertasTable.dataCriacao,
      ultimaValidacaoEm:   ofertasTable.ultimaValidacaoEm,
      ultimaConfirmacaoEm: ofertasTable.ultimaConfirmacaoEm,
      curtidas:            ofertasTable.curtidas,
      validacoes:          ofertasTable.validacoes,
      confirmacoes:        ofertasTable.confirmacoes,
      denuncias:           ofertasTable.denuncias,
      status:              ofertasTable.status,
      usuarioId:           ofertasTable.usuarioId,
      destacada:           ofertasTable.destacada,
      patrocinada:         ofertasTable.patrocinada,
      scoreCache:          ofertasTable.scoreCache,
      tipoOrigem:          ofertasTable.tipoOrigem,
      statusUsuario:       ofertasTable.statusUsuario,
      mercadoId:           ofertasTable.mercadoId,
      mercadoLogoUrl:      mercadosSugeridosTable.logoUrl,
      nome:                usuariosTable.nome,
      pontos:              usuariosTable.pontos,
    })
    .from(ofertasTable)
    .leftJoin(mercadosSugeridosTable, eq(ofertasTable.mercadoId, mercadosSugeridosTable.id))
    .innerJoin(usuariosTable, eq(ofertasTable.usuarioId, usuariosTable.id))
    .where(and(...conditions))
    .orderBy(desc(ofertasTable.dataCriacao), desc(ofertasTable.id))
    .limit(limit);

  const hasMore = rows.length === limit;
  return { rows: rows.slice(0, limit), hasMore };
}
