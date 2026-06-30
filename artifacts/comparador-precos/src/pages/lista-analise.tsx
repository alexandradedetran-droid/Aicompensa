import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ShoppingCart, TrendingDown, Store, CheckCircle, XCircle, BarChart2, RefreshCw, Sparkles } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import { getCurrentUser } from "@/lib/current-user";
import { Link } from "wouter";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ItemAnalysis {
  nome: string;
  slug: string;
  precoMedio: number | null;
  melhorPreco: number | null;
  melhorMercado: string | null;
  economiaAbsoluta: number | null;
  economiaPercentual: number | null;
  matchScore: number;
  ofertaId: number | null;
  encontrado: boolean;
}

interface MercadoScore {
  mercado: string;
  itensEncontrados: number;
  totalPreco: number;
  economia: number;
  coberturaPercent: number;
  itens: { nome: string; preco: number; ofertaId: number; precoMedio: number | null }[];
}

interface ListAnalysis {
  mercadoIdeal: string | null;
  economiaTotal: number;
  percentualEconomia: number;
  itensEncontrados: number;
  itensTotais: number;
  itensFaltando: string[];
  score: number;
  recomendacao: string;
  motivosRecomendacao: string[];
  itensDetalhes: ItemAnalysis[];
  mercados: MercadoScore[];
  analisadoEm: string;
  empty?: boolean;
  mensagem?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const R = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `${min}min atrás`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h atrás`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
}

// ── Simple price bar ─────────────────────────────────────────────────────────

function PriceBar({ preco, precoMedio }: { preco: number; precoMedio: number | null }) {
  if (!precoMedio || precoMedio <= preco) {
    return <span className="text-[11px] text-slate-400 font-medium">{R(preco)}</span>;
  }
  const economy = precoMedio - preco;
  const pct = Math.round((economy / precoMedio) * 100);
  const barFill = Math.max(20, 100 - pct);

  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <div className="flex items-center gap-1.5">
        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-emerald-400 transition-all"
            style={{ width: `${barFill}%` }}
          />
        </div>
        <span className="text-[10px] font-bold text-emerald-600 shrink-0">-{pct}%</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[13px] font-black text-slate-900">{R(preco)}</span>
        <span className="text-[10px] text-slate-400 line-through">{R(precoMedio)}</span>
      </div>
    </div>
  );
}

// ── Item row ─────────────────────────────────────────────────────────────────

function ItemRow({ item }: { item: ItemAnalysis }) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-slate-100 last:border-0">
      <div className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${item.encontrado ? "bg-emerald-50" : "bg-slate-100"}`}>
        {item.encontrado
          ? <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
          : <XCircle className="h-3.5 w-3.5 text-slate-400" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-[13px] font-semibold leading-snug truncate ${item.encontrado ? "text-slate-900" : "text-slate-400"}`}>
          {item.nome}
        </p>
        {item.encontrado && item.melhorMercado && (
          <p className="text-[11px] text-slate-400 leading-none mt-0.5 truncate">
            {item.melhorMercado}
          </p>
        )}
      </div>
      {item.encontrado && item.melhorPreco != null ? (
        <PriceBar preco={item.melhorPreco} precoMedio={item.precoMedio} />
      ) : (
        <span className="text-[11px] text-slate-400 shrink-0">não encontrado</span>
      )}
    </div>
  );
}

// ── Market card ──────────────────────────────────────────────────────────────

function MercadoCard({ ms, isTop }: { ms: MercadoScore; isTop: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={`rounded-2xl border overflow-hidden ${isTop ? "border-emerald-200 bg-emerald-50/40" : "border-slate-100 bg-white"}`}
    >
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 active:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {isTop && (
            <span className="shrink-0 text-[10px] font-black bg-emerald-500 text-white px-1.5 py-0.5 rounded-full">
              MELHOR
            </span>
          )}
          <Store className={`h-4 w-4 shrink-0 ${isTop ? "text-emerald-600" : "text-slate-500"}`} />
          <p className={`text-[13px] font-bold truncate ${isTop ? "text-emerald-800" : "text-slate-700"}`}>
            {ms.mercado}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <p className="text-[12px] font-black text-slate-900">{ms.itensEncontrados}/{ms.coberturaPercent > 0 ? `${ms.itensEncontrados}` : "?"} itens</p>
            {ms.economia > 0 && (
              <p className="text-[10px] text-emerald-600 font-semibold">-{R(ms.economia)}</p>
            )}
          </div>
          <span className={`text-slate-400 text-[10px] transition-transform ${open ? "rotate-180" : ""}`}>▼</span>
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 border-t border-slate-100">
              {ms.itens.map((item, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
                  <span className="text-[12px] text-slate-700 truncate flex-1 mr-3">{item.nome}</span>
                  <PriceBar preco={item.preco} precoMedio={item.precoMedio} />
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ListaAnalisePage() {
  const [, setLocation] = useLocation();
  const currentUser = getCurrentUser();

  const [analysis, setAnalysis] = useState<ListAnalysis | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"itens" | "mercados">("itens");

  const fetchAnalysis = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await customFetch<ListAnalysis>("/api/lista/analise");
      setAnalysis(data);
    } catch {
      setError("Erro ao carregar análise. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchAnalysis(); }, [fetchAnalysis]);

  // Not logged in
  if (!currentUser) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-8 text-center gap-4">
        <ShoppingCart className="h-12 w-12 text-slate-300" />
        <p className="text-slate-700 font-bold">Faça login para ver a análise da sua lista</p>
        <Link href="/login" className="text-sm text-blue-600 font-semibold underline">Entrar</Link>
      </div>
    );
  }

  const found    = analysis?.itensDetalhes?.filter(i => i.encontrado) ?? [];
  const missing  = analysis?.itensFaltando ?? [];
  const mercados = analysis?.mercados ?? [];

  return (
    <div className="flex flex-col min-h-full bg-gray-50">
      {/* Header */}
      <div
        className="bg-white border-b border-slate-200 px-4 pb-3 shadow-sm shrink-0"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 16px)" }}
      >
        <div className="flex items-center gap-2 mb-1">
          <button
            onClick={() => window.history.back()}
            className="h-10 w-10 -ml-2 rounded-full flex items-center justify-center bg-slate-100 text-slate-700 hover:bg-slate-200 active:scale-90 transition-all shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-[17px] font-black text-slate-900 leading-none">Análise da Lista</h1>
            {analysis?.analisadoEm && (
              <p className="text-[11px] text-slate-400 font-medium leading-none mt-0.5">
                Atualizado {relativeTime(analysis.analisadoEm)}
              </p>
            )}
          </div>
          <button
            onClick={() => void fetchAnalysis()}
            disabled={loading}
            className="h-9 w-9 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 border border-slate-200 active:scale-95 transition-all disabled:opacity-40"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-4 flex flex-col gap-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-500">Analisando ofertas para sua lista…</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
            <p className="text-slate-600 font-semibold">{error}</p>
            <button
              onClick={() => void fetchAnalysis()}
              className="px-5 py-2 rounded-xl text-sm font-bold bg-slate-900 text-white active:scale-95 transition-all"
            >
              Tentar novamente
            </button>
          </div>
        ) : analysis?.empty ? (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-3 px-6">
            <div className="text-5xl">🛒</div>
            <p className="text-[17px] font-black text-slate-800">Lista vazia</p>
            <p className="text-sm text-slate-500 max-w-[260px] leading-relaxed">
              {analysis.mensagem}
            </p>
            <Link
              href="/lista"
              className="mt-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-slate-900 text-white active:scale-95 transition-all"
            >
              Ir para minha lista
            </Link>
          </div>
        ) : analysis ? (
          <>
            {/* ── Recommendation hero ── */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl overflow-hidden"
              style={{
                background: analysis.economiaTotal >= 20
                  ? "linear-gradient(135deg, #10b981 0%, #059669 100%)"
                  : analysis.economiaTotal >= 5
                    ? "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)"
                    : "linear-gradient(135deg, #6b7280 0%, #4b5563 100%)",
              }}
            >
              <div className="px-5 py-4">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="h-4 w-4 text-white/80" />
                  <p className="text-[11px] font-bold text-white/80 uppercase tracking-widest">Recomendação</p>
                </div>
                <p className="text-white font-black text-[18px] leading-snug mb-3">
                  {analysis.recomendacao}
                </p>
                {analysis.motivosRecomendacao.map((m, i) => (
                  <p key={i} className="text-white/80 text-[12px] font-medium leading-snug">
                    · {m}
                  </p>
                ))}
              </div>
            </motion.div>

            {/* ── Stats row ── */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-white rounded-2xl border border-slate-100 px-3 py-3 text-center shadow-sm">
                <p className="text-[20px] font-black text-emerald-600">
                  {analysis.economiaTotal > 0 ? R(analysis.economiaTotal) : "—"}
                </p>
                <p className="text-[10px] text-slate-500 font-semibold mt-0.5">economia</p>
              </div>
              <div className="bg-white rounded-2xl border border-slate-100 px-3 py-3 text-center shadow-sm">
                <p className="text-[20px] font-black text-blue-600">
                  {analysis.itensEncontrados}/{analysis.itensTotais}
                </p>
                <p className="text-[10px] text-slate-500 font-semibold mt-0.5">encontrados</p>
              </div>
              <div className="bg-white rounded-2xl border border-slate-100 px-3 py-3 text-center shadow-sm">
                <p className="text-[20px] font-black text-slate-800">
                  {analysis.percentualEconomia > 0 ? `${analysis.percentualEconomia}%` : "—"}
                </p>
                <p className="text-[10px] text-slate-500 font-semibold mt-0.5">desconto</p>
              </div>
            </div>

            {/* ── Tabs ── */}
            <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
              {(["itens", "mercados"] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-2 rounded-lg text-[12px] font-bold transition-all active:scale-95 ${
                    activeTab === tab ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                  }`}
                >
                  {tab === "itens" ? (
                    <span className="flex items-center justify-center gap-1.5">
                      <ShoppingCart className="h-3.5 w-3.5" /> Itens
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-1.5">
                      <Store className="h-3.5 w-3.5" /> Mercados
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* ── Tab content ── */}
            <AnimatePresence mode="wait">
              {activeTab === "itens" ? (
                <motion.div
                  key="itens"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.15 }}
                  className="flex flex-col gap-3"
                >
                  {/* Found items */}
                  {found.length > 0 && (
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                      <div className="px-4 pt-3 pb-1">
                        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 flex items-center gap-1.5">
                          <TrendingDown className="h-3 w-3" />
                          Em promoção ({found.length})
                        </p>
                      </div>
                      <div className="px-4 pb-2">
                        {found.map((item, i) => (
                          <ItemRow key={i} item={item} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Missing items */}
                  {missing.length > 0 && (
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                      <div className="px-4 pt-3 pb-1">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                          <XCircle className="h-3 w-3" />
                          Sem oferta ({missing.length})
                        </p>
                      </div>
                      <div className="px-4 pb-2">
                        {missing.map((nome, i) => (
                          <div key={i} className="flex items-center gap-3 py-2.5 border-b border-slate-100 last:border-0">
                            <XCircle className="h-4 w-4 text-slate-300 shrink-0" />
                            <span className="text-[13px] text-slate-400 truncate">{nome}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="mercados"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.15 }}
                  className="flex flex-col gap-2"
                >
                  {mercados.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-slate-100 px-4 py-10 text-center">
                      <p className="text-slate-500 text-sm">Nenhum mercado encontrou itens da sua lista.</p>
                    </div>
                  ) : (
                    mercados.map((ms, i) => (
                      <MercadoCard key={ms.mercado} ms={ms} isTop={i === 0} />
                    ))
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </>
        ) : null}
      </div>

      {/* Safe area bottom */}
      <div style={{ height: "max(calc(env(safe-area-inset-bottom, 0px) + 80px), 90px)" }} />
    </div>
  );
}
