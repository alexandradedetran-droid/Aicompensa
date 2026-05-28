import { Router } from "express";
import { db, ofertasTable, usuariosTable } from "@workspace/db";
import { ilike, eq, desc } from "drizzle-orm";

const router = Router();

// GET /api/historico?produto=X
// Returns price history: all offers for a product (case-insensitive), newest first
router.get("/historico", async (req, res) => {
  const produto = req.query["produto"];
  if (!produto || typeof produto !== "string" || produto.trim().length < 2) {
    res.status(400).json({ error: "Parâmetro 'produto' obrigatório (mínimo 2 caracteres)" });
    return;
  }

  const rows = await db
    .select({
      preco:       ofertasTable.preco,
      mercado:     ofertasTable.mercado,
      cidade:      ofertasTable.cidade,
      dataCriacao: ofertasTable.dataCriacao,
      validacoes:  ofertasTable.validacoes,
      status:      ofertasTable.status,
      validade:    ofertasTable.validade,
    })
    .from(ofertasTable)
    .innerJoin(usuariosTable, eq(ofertasTable.usuarioId, usuariosTable.id))
    .where(ilike(ofertasTable.produto, `%${produto.trim()}%`))
    .orderBy(desc(ofertasTable.dataCriacao))
    .limit(20);

  const result = rows.map((r) => {
    let status = r.status as string;
    if (r.validade && r.validade < new Date()) status = "expirada";
    return {
      preco:       r.preco,
      mercado:     r.mercado,
      cidade:      r.cidade ?? null,
      dataCriacao: r.dataCriacao.toISOString(),
      validacoes:  r.validacoes,
      status,
    };
  });

  res.json(result);
});

// GET /api/economia
// Returns daily economy statistics derived from current offers
router.get("/economia", async (req, res) => {
  const rows = await db
    .select({
      produto:     ofertasTable.produto,
      mercado:     ofertasTable.mercado,
      preco:       ofertasTable.preco,
      validacoes:  ofertasTable.validacoes,
      dataCriacao: ofertasTable.dataCriacao,
      ultimaValidacaoEm: ofertasTable.ultimaValidacaoEm,
    })
    .from(ofertasTable);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Confirmed today = ultimaValidacaoEm >= start of today
  const ofertasConfirmadasHoje = rows.filter(
    (r) => r.ultimaValidacaoEm && r.ultimaValidacaoEm >= today
  ).length;

  // Group by produto to find min/max per product (economy = max - min)
  const byProduto: Record<string, { min: number; max: number; mercadoMin: string }> = {};
  for (const r of rows) {
    const key = r.produto.toLowerCase().trim();
    if (!byProduto[key]) {
      byProduto[key] = { min: r.preco, max: r.preco, mercadoMin: r.mercado };
    } else {
      if (r.preco < byProduto[key].min) {
        byProduto[key].min = r.preco;
        byProduto[key].mercadoMin = r.mercado;
      }
      if (r.preco > byProduto[key].max) byProduto[key].max = r.preco;
    }
  }

  let economiaTotal = 0;
  let produtoMaisBarato: string | null = null;
  let precoProdutoMaisBarato: number | null = null;
  let minPreco = Infinity;

  for (const [key, { min, max, mercadoMin }] of Object.entries(byProduto)) {
    economiaTotal += max - min;
    if (min < minPreco) {
      minPreco = min;
      produtoMaisBarato = key;
      precoProdutoMaisBarato = min;
      void mercadoMin; // used below
    }
  }

  // Most economical market: market with most offers below average price
  const mercadoCounts: Record<string, number> = {};
  for (const r of rows) {
    const key = r.produto.toLowerCase().trim();
    const avg = byProduto[key] ? (byProduto[key].min + byProduto[key].max) / 2 : r.preco;
    if (r.preco <= avg) {
      mercadoCounts[r.mercado] = (mercadoCounts[r.mercado] ?? 0) + 1;
    }
  }
  const mercadoMaisEconomico =
    Object.entries(mercadoCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  res.json({
    economiaTotal: Math.round(economiaTotal * 100) / 100,
    produtoMaisBarato,
    precoProdutoMaisBarato,
    mercadoMaisEconomico,
    ofertasConfirmadasHoje,
    totalProdutosMonitorados: Object.keys(byProduto).length,
  });
});

export default router;
