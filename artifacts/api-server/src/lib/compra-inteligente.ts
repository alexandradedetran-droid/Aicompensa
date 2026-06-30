// @ts-nocheck
import { db, ofertasTable, usuariosTable, produtosTable } from "@workspace/db";
import { and, eq, inArray, isNull, or, gt, sql } from "drizzle-orm";

export type ConfiancaNivel = "alta" | "media" | "baixa";

export interface ItemComparado {
  produtoId: string;
  ofertaId: number;
  produto: string;
  preco: number;
  mercado: string;
  validade: string | null;
  imagemExibicao: string | null;
  confiancaScore: number;
  confiancaNivel: ConfiancaNivel;
  motivoConfianca: string;
}

export interface MercadoAgrupado {
  nomeMercado: string;
  total: number;
  produtosEncontrados: number;
  produtosFaltando: number;
  coberturaPercentual: number;
  confiancaMedia: number;
  economiaEstimada: number;
  itens: ItemComparado[];
}

export interface MelhorCombinacao {
  mercados: string[];
  total: number;
  economiaExtra: number;
  produtosEncontrados: number;
  produtosFaltando: number;
  coberturaPercentual: number;
  confiancaMedia: number;
  itensPorMercado: Record<string, ItemComparado[]>;
}

export interface ResultadoComparacao {
  melhorMercado: MercadoAgrupado | null;
  melhorCombinacao: MelhorCombinacao | null;
  rankingMercados: MercadoAgrupado[];
  produtosResolvidosCount: number;
  produtosTotalCount: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeSlug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

// ── Resolve product names → catalog IDs ──────────────────────────────────────

export async function resolverNomesParaProdutoIds(
  nomes: string[],
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>(nomes.map((n) => [n, null]));
  if (nomes.length === 0) return result;

  const slugs = nomes.map(normalizeSlug);

  // Build one OR query against the catalog using ILIKE for each slug
  const likeConditions = slugs.map((s) => sql`${produtosTable.nomeNormalizado} ILIKE ${"%" + s + "%"}`);
  const whereClause = likeConditions.length === 1
    ? likeConditions[0]
    : sql`(${sql.join(likeConditions, sql` OR `)})`;

  const rows = await db
    .select({ id: produtosTable.id, nome: produtosTable.nome, nomeNormalizado: produtosTable.nomeNormalizado })
    .from(produtosTable)
    .where(whereClause)
    .limit(300);

  for (let i = 0; i < nomes.length; i++) {
    const slug = slugs[i]!;
    const original = nomes[i]!;

    let best: { id: string; score: number } | null = null;

    for (const row of rows) {
      const rowSlug = row.nomeNormalizado ?? normalizeSlug(row.nome);

      // Exact match wins immediately
      if (rowSlug === slug) {
        result.set(original, row.id);
        best = null;
        break;
      }

      // Substring match: row contains input or input contains row (min 3 chars)
      const rowContainsInput = slug.length >= 3 && rowSlug.includes(slug);
      const inputContainsRow = rowSlug.length >= 3 && slug.includes(rowSlug);
      const score = rowContainsInput ? 2 : inputContainsRow ? 1 : 0;

      if (score > 0 && (!best || score > best.score)) {
        best = { id: row.id, score };
      }
    }

    if (best && result.get(original) === null) {
      result.set(original, best.id);
    }
  }

  return result;
}

// ── Offer confidence score (0–100) ───────────────────────────────────────────

type OfertaRow = {
  id: number;
  dataCriacao: Date;
  confirmacoes: number;
  validacoes: number;
  denuncias: number;
  status: string;
  pontos: number; // from usuariosTable join
};

function calcularConfiancaOferta(oferta: OfertaRow): {
  score: number;
  nivel: ConfiancaNivel;
  motivo: string;
} {
  let score = 0;
  const motivos: string[] = [];

  // 1. Recência
  const horasAtras = (Date.now() - oferta.dataCriacao.getTime()) / 3_600_000;
  if (horasAtras < 24) {
    score += 35;
    motivos.push("publicada hoje");
  } else if (horasAtras < 72) {
    score += 25;
    motivos.push("publicada nos últimos 3 dias");
  } else if (horasAtras < 168) {
    score += 15;
    motivos.push("publicada esta semana");
  } else {
    score += 5;
    motivos.push("publicada há mais de 7 dias");
  }

  // 2. Validações da comunidade (confirmacoes + validacoes)
  const totalValidacoes = oferta.confirmacoes + oferta.validacoes;
  const bonusValidacoes = Math.min(30, totalValidacoes * 5);
  score += bonusValidacoes;
  if (totalValidacoes >= 3) {
    motivos.push(`confirmada ${totalValidacoes}× pela comunidade`);
  } else if (totalValidacoes > 0) {
    motivos.push(`${totalValidacoes} validação${totalValidacoes > 1 ? "ões" : ""}`);
  }

  // 3. Denúncias (reduz pontos)
  const penalDenuncias = Math.min(45, oferta.denuncias * 15);
  score -= penalDenuncias;
  if (oferta.denuncias > 0) {
    motivos.push(`${oferta.denuncias} denúncia${oferta.denuncias > 1 ? "s" : ""}`);
  }

  // 4. Status da oferta
  if (oferta.status === "validada") {
    score += 10;
    motivos.push("validada");
  }

  // 5. Autor confiável (pontos como proxy de reputação)
  if (oferta.pontos >= 500) {
    score += 5;
    motivos.push("autor experiente");
  }

  score = Math.max(0, Math.min(100, score));

  const nivel: ConfiancaNivel = score >= 80 ? "alta" : score >= 50 ? "media" : "baixa";

  let motivo: string;
  if (nivel === "alta") {
    const principais = motivos.filter((m) => !m.includes("denúncia")).slice(0, 2);
    motivo = principais.length > 0
      ? `Alta confiança: ${principais.join(" e ")}.`
      : "Alta confiança.";
  } else if (nivel === "media") {
    motivo = `Confiança média: ${motivos.slice(0, 2).join(", ")}.`;
  } else {
    motivo = `Confiança baixa: ${motivos.join(", ")}.`;
  }

  return { score, nivel, motivo };
}

// ── Priority rule: alta > media > baixa, then menor preço ────────────────────

function nivelRank(n: ConfiancaNivel): number {
  return n === "alta" ? 3 : n === "media" ? 2 : 1;
}

type Comparable = { confiancaNivel: ConfiancaNivel; preco: number };

function escolherMelhor<T extends Comparable>(a: T, b: T): T {
  const diff = nivelRank(a.confiancaNivel) - nivelRank(b.confiancaNivel);
  if (diff !== 0) return diff > 0 ? a : b;
  return a.preco <= b.preco ? a : b;
}

// ── Main comparison function ──────────────────────────────────────────────────

export async function calcularMelhorCompra(
  lista: Array<{ produtoId: string; quantidade: number }>,
): Promise<Omit<ResultadoComparacao, "produtosResolvidosCount" | "produtosTotalCount">> {
  if (lista.length === 0) {
    return { melhorMercado: null, melhorCombinacao: null, rankingMercados: [] };
  }

  const produtoIds = lista.map((i) => i.produtoId);
  const quantMap = new Map(lista.map((i) => [i.produtoId, i.quantidade]));

  // 1. Batch fetch all valid offers for these produtoIds
  const agora = new Date();
  const rows = await db
    .select({
      id: ofertasTable.id,
      produtoId: ofertasTable.produtoId,
      produto: ofertasTable.produto,
      preco: ofertasTable.preco,
      mercado: ofertasTable.mercado,
      fotoUrl: ofertasTable.fotoUrl,
      validade: ofertasTable.validade,
      dataCriacao: ofertasTable.dataCriacao,
      confirmacoes: ofertasTable.confirmacoes,
      validacoes: ofertasTable.validacoes,
      denuncias: ofertasTable.denuncias,
      status: ofertasTable.status,
      pontos: usuariosTable.pontos,
    })
    .from(ofertasTable)
    .innerJoin(usuariosTable, eq(ofertasTable.usuarioId, usuariosTable.id))
    .where(
      and(
        inArray(ofertasTable.produtoId, produtoIds),
        sql`${ofertasTable.status} NOT IN ('suspeita', 'removida', 'recusada', 'arquivada', 'expirada')`,
        sql`${ofertasTable.denuncias} < 5`,
        or(isNull(ofertasTable.validade), gt(ofertasTable.validade, agora)),
        eq(usuariosTable.bloqueado, false),
      ),
    );

  // 2. Enrich with confidence scores
  type EnrichedRow = (typeof rows)[0] & {
    confiancaScore: number;
    confiancaNivel: ConfiancaNivel;
    motivoConfianca: string;
  };

  const enriched: EnrichedRow[] = rows.map((r) => {
    const { score, nivel, motivo } = calcularConfiancaOferta(r);
    return { ...r, confiancaScore: score, confiancaNivel: nivel, motivoConfianca: motivo };
  });

  // 3. Best offer per produtoId × mercado
  // Structure: produtoId → Map<mercado, best EnrichedRow>
  const bestPorProdutoPorMercado = new Map<string, Map<string, EnrichedRow>>();

  for (const o of enriched) {
    if (o.produtoId == null) continue;
    let mercadoMap = bestPorProdutoPorMercado.get(o.produtoId);
    if (!mercadoMap) {
      mercadoMap = new Map();
      bestPorProdutoPorMercado.set(o.produtoId, mercadoMap);
    }
    const existing = mercadoMap.get(o.mercado);
    mercadoMap.set(o.mercado, existing ? escolherMelhor(o, existing) : o);
  }

  // 4. Collect all mercados that have at least one offer
  const allMercados = new Set<string>();
  for (const mm of bestPorProdutoPorMercado.values()) {
    for (const mercado of mm.keys()) allMercados.add(mercado);
  }

  // 5. Build MercadoAgrupado for each market
  const mercadoGroups: MercadoAgrupado[] = [];

  for (const mercado of allMercados) {
    const itens: ItemComparado[] = [];

    for (const produtoId of produtoIds) {
      const mm = bestPorProdutoPorMercado.get(produtoId);
      if (!mm) continue;
      const o = mm.get(mercado);
      if (!o) continue;

      itens.push({
        produtoId,
        ofertaId: o.id,
        produto: o.produto,
        preco: o.preco,
        mercado,
        validade: o.validade?.toISOString() ?? null,
        imagemExibicao: o.fotoUrl ?? null,
        confiancaScore: o.confiancaScore,
        confiancaNivel: o.confiancaNivel,
        motivoConfianca: o.motivoConfianca,
      });
    }

    if (itens.length === 0) continue;

    const total = itens.reduce((s, i) => s + i.preco * (quantMap.get(i.produtoId) ?? 1), 0);
    const confiancaMedia = itens.reduce((s, i) => s + i.confiancaScore, 0) / itens.length;

    mercadoGroups.push({
      nomeMercado: mercado,
      total: Math.round(total * 100) / 100,
      produtosEncontrados: itens.length,
      produtosFaltando: lista.length - itens.length,
      coberturaPercentual: Math.round((itens.length / lista.length) * 100),
      confiancaMedia: Math.round(confiancaMedia),
      economiaEstimada: 0,
      itens,
    });
  }

  // 6. Sort: cobertura desc → total asc → confiança desc
  mercadoGroups.sort((a, b) => {
    if (b.coberturaPercentual !== a.coberturaPercentual) return b.coberturaPercentual - a.coberturaPercentual;
    if (a.total !== b.total) return a.total - b.total;
    return b.confiancaMedia - a.confiancaMedia;
  });

  // 7. Economia estimada relative to worst-priced market
  if (mercadoGroups.length > 0) {
    const maxTotal = Math.max(...mercadoGroups.map((m) => m.total));
    for (const m of mercadoGroups) {
      m.economiaEstimada = Math.max(0, Math.round((maxTotal - m.total) * 100) / 100);
    }
  }

  const melhorMercado = mercadoGroups[0] ?? null;

  // 8. Best 2-market combination (search top 8 markets)
  let melhorCombinacao: MelhorCombinacao | null = null;
  const searchLimit = Math.min(mercadoGroups.length, 8);

  if (mercadoGroups.length >= 2) {
    type ComboCandidate = {
      m1: MercadoAgrupado;
      m2: MercadoAgrupado;
      total: number;
      coveredCount: number;
      confiancaMedia: number;
      itensPorMercado: Record<string, ItemComparado[]>;
    };
    let bestCombo: ComboCandidate | null = null;

    for (let i = 0; i < searchLimit; i++) {
      for (let j = i + 1; j < searchLimit; j++) {
        const m1 = mercadoGroups[i]!;
        const m2 = mercadoGroups[j]!;

        let total = 0;
        let totalConfianca = 0;
        let coveredCount = 0;
        const itensPorMercado: Record<string, ItemComparado[]> = {
          [m1.nomeMercado]: [],
          [m2.nomeMercado]: [],
        };

        for (const produtoId of produtoIds) {
          const fromM1 = m1.itens.find((x) => x.produtoId === produtoId);
          const fromM2 = m2.itens.find((x) => x.produtoId === produtoId);
          if (!fromM1 && !fromM2) continue;

          let chosen: ItemComparado;
          let chosenMercado: string;
          if (!fromM2) {
            chosen = fromM1!;
            chosenMercado = m1.nomeMercado;
          } else if (!fromM1) {
            chosen = fromM2!;
            chosenMercado = m2.nomeMercado;
          } else {
            const winner = escolherMelhor(fromM1, fromM2);
            chosen = winner;
            chosenMercado = winner === fromM1 ? m1.nomeMercado : m2.nomeMercado;
          }

          total += chosen.preco * (quantMap.get(produtoId) ?? 1);
          totalConfianca += chosen.confiancaScore;
          coveredCount++;
          itensPorMercado[chosenMercado]!.push(chosen);
        }

        if (coveredCount === 0) continue;
        const confiancaMedia = totalConfianca / coveredCount;
        const roundedTotal = Math.round(total * 100) / 100;

        if (
          !bestCombo ||
          coveredCount > bestCombo.coveredCount ||
          (coveredCount === bestCombo.coveredCount && roundedTotal < bestCombo.total)
        ) {
          bestCombo = { m1, m2, total: roundedTotal, coveredCount, confiancaMedia, itensPorMercado };
        }
      }
    }

    if (bestCombo && melhorMercado) {
      const economiaExtra = Math.max(0, melhorMercado.total - bestCombo.total);
      // Only suggest combo if it saves ≥ R$2 or covers significantly more products
      if (economiaExtra >= 2 || bestCombo.coveredCount > melhorMercado.produtosEncontrados) {
        melhorCombinacao = {
          mercados: [bestCombo.m1.nomeMercado, bestCombo.m2.nomeMercado],
          total: bestCombo.total,
          economiaExtra: Math.round(economiaExtra * 100) / 100,
          produtosEncontrados: bestCombo.coveredCount,
          produtosFaltando: lista.length - bestCombo.coveredCount,
          coberturaPercentual: Math.round((bestCombo.coveredCount / lista.length) * 100),
          confiancaMedia: Math.round(bestCombo.confiancaMedia),
          itensPorMercado: bestCombo.itensPorMercado,
        };
      }
    }
  }

  return { melhorMercado, melhorCombinacao, rankingMercados: mercadoGroups };
}
