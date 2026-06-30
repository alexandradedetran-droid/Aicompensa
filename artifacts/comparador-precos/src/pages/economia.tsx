import { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, TrendingDown, Store, Sparkles, BarChart2, Calendar, Trophy, RefreshCw, ChevronRight } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import { getCurrentUser } from "@/lib/current-user";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";

// ── Types ─────────────────────────────────────────────────────────────────────

interface EconomiaDashboard {
  economiaTotal:       number;
  economia30dias:      number;
  economia7dias:       number;
  maiorEconomia:       number;
  totalAnalises:       number;
  melhorMercado:       string | null;
  maiorEconomiaEntrada: {
    economiaTotal:      number;
    mercadoIdeal:       string | null;
    percentualEconomia: number;
    data:               string;
  } | null;
  evolucaoMensal: { mes: string; economiaTotal: number; totalAnalises: number }[];
}

interface Insight {
  titulo:    string;
  mensagem:  string;
  tipo:      string;
  confianca: "alta" | "media" | "baixa";
  icone:     string;
}

interface AiProfile {
  mercadoPreferido:   string | null;
  categoriaPreferida: string | null;
  diaPreferido:       number | null;
  horarioPreferido:   number | null;
  ticketMedio:        number;
  economiaTotal:      number;
  economia30dias:     number;
  empty?:             boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function MesLabel({ mes }: { mes: string }) {
  const [year, month] = mes.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return <>{date.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}</>;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div className="flex-1 rounded-2xl p-3.5 flex flex-col gap-1" style={{ background: color }}>
      <span className="text-[11px] font-semibold text-slate-500 leading-none">{label}</span>
      <span className="text-xl font-black text-slate-800 leading-tight">{value}</span>
      {sub && <span className="text-[10px] text-slate-400">{sub}</span>}
    </div>
  );
}

function InsightCard({ insight }: { insight: Insight }) {
  const bg =
    insight.confianca === "alta"  ? "#F0FDF4" :
    insight.confianca === "media" ? "#FFFBEB" :
                                    "#F8FAFC";
  const border =
    insight.confianca === "alta"  ? "#BBF7D0" :
    insight.confianca === "media" ? "#FDE68A" :
                                    "#E2E8F0";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-4 flex items-start gap-3"
      style={{ background: bg, border: `1px solid ${border}` }}
    >
      <span className="text-2xl leading-none mt-0.5">{insight.icone}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-slate-700 leading-snug">{insight.titulo}</p>
        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{insight.mensagem}</p>
      </div>
      {insight.confianca === "alta" && (
        <span className="shrink-0 text-[9px] font-black text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded-full leading-none">
          ALTA
        </span>
      )}
    </motion.div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Economia() {
  const [, setLocation] = useLocation();
  const currentUser = getCurrentUser();

  const { data: dashboard, isLoading: loadingDash, refetch: refetchDash } = useQuery<EconomiaDashboard>({
    queryKey: ["ai-economia"],
    queryFn:  () => customFetch("/api/ai/economia"),
    enabled:  !!currentUser,
    staleTime: 5 * 60 * 1000,
  });

  const { data: insightsData, isLoading: loadingInsights } = useQuery<{ insights: Insight[] }>({
    queryKey: ["ai-insights"],
    queryFn:  () => customFetch("/api/ai/insights"),
    enabled:  !!currentUser,
    staleTime: 5 * 60 * 1000,
  });

  const { data: profile } = useQuery<AiProfile>({
    queryKey: ["ai-profile"],
    queryFn:  () => customFetch("/api/ai/profile"),
    enabled:  !!currentUser,
    staleTime: 60 * 60 * 1000,
  });

  if (!currentUser) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center gap-4">
        <span className="text-5xl">💰</span>
        <h2 className="text-xl font-bold text-slate-800">Dashboard de Economia</h2>
        <p className="text-sm text-slate-500">Faça login para ver sua economia acumulada e insights personalizados.</p>
        <Link href="/login">
          <button className="px-6 py-2.5 rounded-full font-bold text-sm text-white" style={{ background: "linear-gradient(135deg,#F2C14E,#E0A800)" }}>
            Entrar
          </button>
        </Link>
      </div>
    );
  }

  const evolucao = dashboard?.evolucaoMensal ?? [];
  const maxEco = Math.max(...evolucao.map(e => e.economiaTotal), 1);
  const insights = insightsData?.insights ?? [];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col min-h-full"
    >
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-slate-100 px-4 py-3 flex items-center gap-3">
        <button onClick={() => setLocation("/")} className="p-1.5 rounded-xl hover:bg-slate-100 transition-colors">
          <ArrowLeft className="h-5 w-5 text-slate-600" />
        </button>
        <div className="flex-1">
          <h1 className="text-base font-black text-slate-800 leading-none">📈 Economia</h1>
          <p className="text-[11px] text-slate-400 mt-0.5">Seu histórico de economia inteligente</p>
        </div>
        <button
          onClick={() => refetchDash()}
          className="p-1.5 rounded-xl hover:bg-slate-100 transition-colors"
        >
          <RefreshCw className="h-4 w-4 text-slate-500" />
        </button>
      </div>

      <div className="flex flex-col gap-4 p-4">
        {/* Hero: economia total */}
        {loadingDash ? (
          <div className="h-28 rounded-2xl bg-slate-100 animate-pulse" />
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-3xl p-5 relative overflow-hidden"
            style={{
              background: "linear-gradient(135deg, #10B981 0%, #059669 50%, #047857 100%)",
              boxShadow: "0 8px 32px rgba(16,185,129,0.3)",
            }}
          >
            <div className="absolute right-0 top-0 w-40 h-40 rounded-full opacity-10" style={{ background: "white", transform: "translate(30%, -30%)" }} />
            <p className="text-emerald-100 text-xs font-semibold uppercase tracking-widest">Economia total (90 dias)</p>
            <p className="text-4xl font-black text-white mt-1 leading-none">
              {fmt(dashboard?.economiaTotal ?? 0)}
            </p>
            {dashboard?.melhorMercado && (
              <div className="flex items-center gap-1.5 mt-3">
                <Store className="h-3.5 w-3.5 text-emerald-200" />
                <span className="text-emerald-100 text-xs font-medium">
                  Melhor mercado: <strong className="text-white">{dashboard.melhorMercado}</strong>
                </span>
              </div>
            )}
            {(dashboard?.totalAnalises ?? 0) > 0 && (
              <div className="flex items-center gap-1 mt-1">
                <BarChart2 className="h-3.5 w-3.5 text-emerald-200" />
                <span className="text-emerald-100 text-xs">{dashboard!.totalAnalises} análises realizadas</span>
              </div>
            )}
          </motion.div>
        )}

        {/* Stats row */}
        {loadingDash ? (
          <div className="flex gap-2">
            <div className="flex-1 h-20 rounded-2xl bg-slate-100 animate-pulse" />
            <div className="flex-1 h-20 rounded-2xl bg-slate-100 animate-pulse" />
            <div className="flex-1 h-20 rounded-2xl bg-slate-100 animate-pulse" />
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="flex gap-2"
          >
            <StatCard
              label="Esta semana"
              value={fmt(dashboard?.economia7dias ?? 0)}
              color="#F0FDF4"
            />
            <StatCard
              label="Este mês"
              value={fmt(dashboard?.economia30dias ?? 0)}
              color="#FFFBEB"
            />
            <StatCard
              label="Maior economia"
              value={fmt(dashboard?.maiorEconomia ?? 0)}
              color="#EFF6FF"
            />
          </motion.div>
        )}

        {/* Profile highlights */}
        {profile && !profile.empty && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="rounded-2xl p-4 bg-slate-50 border border-slate-100"
          >
            <p className="text-xs font-black text-slate-600 uppercase tracking-widest mb-3">Seu perfil de compras</p>
            <div className="grid grid-cols-2 gap-3">
              {profile.mercadoPreferido && (
                <div className="flex items-start gap-2">
                  <Store className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[10px] text-slate-400 leading-none">Mercado preferido</p>
                    <p className="text-xs font-bold text-slate-700 mt-0.5">{profile.mercadoPreferido}</p>
                  </div>
                </div>
              )}
              {profile.categoriaPreferida && (
                <div className="flex items-start gap-2">
                  <Sparkles className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[10px] text-slate-400 leading-none">Categoria favorita</p>
                    <p className="text-xs font-bold text-slate-700 mt-0.5">{profile.categoriaPreferida}</p>
                  </div>
                </div>
              )}
              {profile.diaPreferido != null && (
                <div className="flex items-start gap-2">
                  <Calendar className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[10px] text-slate-400 leading-none">Melhor dia</p>
                    <p className="text-xs font-bold text-slate-700 mt-0.5">{DIAS[profile.diaPreferido]}</p>
                  </div>
                </div>
              )}
              {profile.ticketMedio >= 1 && (
                <div className="flex items-start gap-2">
                  <TrendingDown className="h-4 w-4 text-purple-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[10px] text-slate-400 leading-none">Economia média</p>
                    <p className="text-xs font-bold text-slate-700 mt-0.5">{fmt(profile.ticketMedio)}</p>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Monthly evolution chart */}
        {evolucao.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="rounded-2xl p-4 bg-white border border-slate-100"
            style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}
          >
            <div className="flex items-center gap-2 mb-4">
              <BarChart2 className="h-4 w-4 text-emerald-500" />
              <p className="text-sm font-bold text-slate-700">Evolução mensal</p>
            </div>
            <div className="flex items-end gap-1.5 h-24">
              {evolucao.map((e) => {
                const heightPct = maxEco > 0 ? (e.economiaTotal / maxEco) * 100 : 0;
                const isMax = e.economiaTotal === maxEco && maxEco > 0;
                return (
                  <div key={e.mes} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[9px] font-bold text-slate-500" style={{ visibility: isMax ? "visible" : "hidden" }}>
                      {fmt(e.economiaTotal)}
                    </span>
                    <div className="w-full flex-1 flex items-end">
                      <div
                        className="w-full rounded-t-lg transition-all"
                        style={{
                          height:     `${Math.max(heightPct, 4)}%`,
                          background: isMax
                            ? "linear-gradient(180deg,#10B981,#059669)"
                            : "linear-gradient(180deg,#A7F3D0,#6EE7B7)",
                        }}
                      />
                    </div>
                    <span className="text-[9px] text-slate-400">
                      <MesLabel mes={e.mes} />
                    </span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Top savings entry */}
        {dashboard?.maiorEconomiaEntrada && dashboard.maiorEconomiaEntrada.economiaTotal >= 1 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="rounded-2xl p-4 flex items-center gap-3 bg-amber-50 border border-amber-100"
          >
            <Trophy className="h-8 w-8 text-amber-400 shrink-0" />
            <div className="flex-1">
              <p className="text-xs font-black text-amber-700 uppercase tracking-wide">Maior economia em uma compra</p>
              <p className="text-lg font-black text-amber-800">
                {fmt(dashboard.maiorEconomiaEntrada.economiaTotal)}
              </p>
              {dashboard.maiorEconomiaEntrada.mercadoIdeal && (
                <p className="text-xs text-amber-600">
                  {dashboard.maiorEconomiaEntrada.mercadoIdeal} · {dashboard.maiorEconomiaEntrada.percentualEconomia}% de desconto
                </p>
              )}
            </div>
          </motion.div>
        )}

        {/* AI Insights */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-4 w-4 text-violet-500" />
            <p className="text-sm font-bold text-slate-700">Insights inteligentes</p>
          </div>

          {loadingInsights ? (
            <div className="flex flex-col gap-2">
              {[0, 1].map(i => (
                <div key={i} className="h-16 rounded-2xl bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : insights.length > 0 ? (
            <div className="flex flex-col gap-2">
              {insights.map((ins, i) => (
                <InsightCard key={i} insight={ins} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl p-5 text-center bg-slate-50 border border-slate-100">
              <p className="text-sm text-slate-400">
                Continue usando o app para gerar insights personalizados.
              </p>
              <p className="text-xs text-slate-300 mt-1">Mínimo de 3 análises de lista necessárias.</p>
            </div>
          )}
        </div>

        {/* CTA: Analisar lista */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <button
            onClick={() => setLocation("/lista/analise")}
            className="w-full flex items-center justify-between rounded-2xl p-4 text-white font-bold text-sm"
            style={{ background: "linear-gradient(135deg,#10B981,#059669)" }}
          >
            <div className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5" />
              <span>Analisar minha lista agora</span>
            </div>
            <ChevronRight className="h-4 w-4 opacity-80" />
          </button>
        </motion.div>

        <div className="h-4" />
      </div>
    </motion.div>
  );
}
