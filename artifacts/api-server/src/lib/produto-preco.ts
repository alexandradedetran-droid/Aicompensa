// @ts-nocheck
import { db, ofertasTable } from "@workspace/db";
import { and, gte, inArray, sql } from "drizzle-orm";

export interface InteligenciaPreco {
  precoMedio30d: number;
  menorPreco30d: number;
  maiorPreco30d: number;
  economiaEstimada: number;
  percentualAbaixoMedia: number;
  classificacaoPreco: "melhor_preco" | "bom_preco" | "preco_normal" | "caro";
  mensagemPreco: string;
}

const MIN_HISTORICO = 3; // total offers in last 30d (including current) to generate stats

export async function calcularInteligenciaPrecosBatch(
  ofertas: Array<{ id: number; produtoId: string | null; preco: number }>,
): Promise<Map<number, InteligenciaPreco>> {
  const result = new Map<number, InteligenciaPreco>();

  const produtoIds = [
    ...new Set(ofertas.filter((o) => o.produtoId != null).map((o) => o.produtoId as string)),
  ];
  if (produtoIds.length === 0) return result;

  const trintaDiasAtras = new Date(Date.now() - 30 * 24 * 3_600_000);

  const historico = await db
    .select({ produtoId: ofertasTable.produtoId, id: ofertasTable.id, preco: ofertasTable.preco })
    .from(ofertasTable)
    .where(
      and(
        inArray(ofertasTable.produtoId, produtoIds),
        gte(ofertasTable.dataCriacao, trintaDiasAtras),
        sql`${ofertasTable.status} NOT IN ('suspeita', 'removida', 'recusada', 'arquivada')`,
        sql`${ofertasTable.denuncias} < 5`,
      ),
    );

  // group by produtoId
  const porProduto = new Map<string, Array<{ id: number; preco: number }>>();
  for (const h of historico) {
    if (h.produtoId == null) continue;
    let arr = porProduto.get(h.produtoId);
    if (!arr) { arr = []; porProduto.set(h.produtoId, arr); }
    arr.push({ id: h.id, preco: h.preco });
  }

  for (const oferta of ofertas) {
    if (oferta.produtoId == null) continue;
    const hist = porProduto.get(oferta.produtoId);
    if (!hist || hist.length < MIN_HISTORICO) continue;

    const precos = hist.map((h) => h.preco);
    const precoMedio30d = precos.reduce((a, b) => a + b, 0) / precos.length;
    const menorPreco30d = Math.min(...precos);
    const maiorPreco30d = Math.max(...precos);
    const percentualAbaixoMedia = ((precoMedio30d - oferta.preco) / precoMedio30d) * 100;
    const economiaEstimada = Math.max(0, precoMedio30d - oferta.preco);

    let classificacaoPreco: InteligenciaPreco["classificacaoPreco"];
    let mensagemPreco: string;

    if (oferta.preco <= menorPreco30d) {
      classificacaoPreco = "melhor_preco";
      mensagemPreco = "Menor preço dos últimos 30 dias";
    } else if (percentualAbaixoMedia >= 10) {
      classificacaoPreco = "bom_preco";
      mensagemPreco = "Abaixo da média da região";
    } else if (percentualAbaixoMedia > -10) {
      classificacaoPreco = "preco_normal";
      mensagemPreco = "Preço dentro da média";
    } else {
      classificacaoPreco = "caro";
      mensagemPreco = "Acima da média recente";
    }

    result.set(oferta.id, {
      precoMedio30d: Math.round(precoMedio30d * 100) / 100,
      menorPreco30d: Math.round(menorPreco30d * 100) / 100,
      maiorPreco30d: Math.round(maiorPreco30d * 100) / 100,
      economiaEstimada: Math.round(economiaEstimada * 100) / 100,
      percentualAbaixoMedia: Math.round(percentualAbaixoMedia * 10) / 10,
      classificacaoPreco,
      mensagemPreco,
    });
  }

  return result;
}
