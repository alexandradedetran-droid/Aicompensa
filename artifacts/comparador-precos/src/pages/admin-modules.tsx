import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell,
} from "recharts";
import { customFetch, type AdminAnalytics, type AdminUsuario } from "@workspace/api-client-react";
// TODO: extrair para useOfertaActions — há lógica de mutation duplicada entre as abas de recompensas (P4.8)

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface DashboardRealtime {
  ofertasHoje: number;
  confirmacoes24h: number;
  economiaGerada: number;
  topCidades: Array<{ cidade: string | null; total: number; confirmacoes: number }>;
  usuariosAtivos7d: number;
  ofertasPorHora: Array<{ hora: number; total: number }>;
}

interface RetentionData {
  dau: Array<{ dia: string; usuarios: number }>;
  cidades: Array<{ cidade: string | null; ofertas: number; usuarios: number; confirmacoes: number }>;
  horario: Array<{ hora: number; total: number }>;
}

interface AntiFraudData {
  usuariosConfiancaBaixa:   number;
  usuariosSuspensos:        number;
  usuariosBloqueados:       number;
  ofertasSuspeitas:         number;
  ofertasDenunciadas:       number;
  ofertasSemLocalizacao:    number;
  ofertasBaixaConfiancaOCR: number;
  topUsuariosSuspeitos: Array<{
    usuarioId:          number;
    nome:               string;
    scoreConfianca:     number;
    ofertasPublicadas:  number;
    denunciasRecebidas: number;
    ofertasSuspeitas:   number;
    status:             string;
  }>;
  topOfertasSuspeitas: Array<{
    id:        number;
    produto:   string;
    mercado:   string;
    denuncias: number;
    status:    string;
    usuarioId: number;
    iaScore:   number | null;
  }>;
}

interface IndicacoesData {
  totalConvites: number;
  topIndicadores: Array<{ id: number; nome: string; pontos: number; convites: number }>;
  convitesDiarios: Array<{ dia: string; convites: number }>;
}

// ── Componentes auxiliares ────────────────────────────────────────────────────

function SkeletonCard({ height = 80 }: { height?: number }) {
  return (
    <div
      className="rounded-2xl overflow-hidden relative"
      style={{ height, background: "linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)" }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.6) 50%, transparent 100%)",
          animation: "shimmer 1.4s infinite",
          backgroundSize: "200% 100%",
        }}
      />
    </div>
  );
}

function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} height={88} />
        ))}
      </div>
      {Array.from({ length: rows - 1 }).map((_, i) => (
        <SkeletonCard key={i} height={i === 0 ? 200 : 120} />
      ))}
    </div>
  );
}

function WidgetError({ label }: { label: string }) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-xl shrink-0">⚠️</div>
      <div>
        <div className="text-sm font-bold text-amber-800">Métrica indisponível</div>
        <div className="text-xs text-amber-600">{label} não pôde ser carregado agora.</div>
      </div>
    </div>
  );
}

function valueFontSize(v: string | number): string {
  const s = String(v);
  if (s.length > 10) return "text-base sm:text-lg";
  if (s.length > 7)  return "text-lg sm:text-xl";
  return "text-xl sm:text-2xl";
}

function KpiCard({
  icon, label, value, sub, color = "#84cc16", unavailable = false,
}: { icon: string; label: string; value: string | number; sub?: string; color?: string; unavailable?: boolean }) {
  if (unavailable) {
    return (
      <div className="bg-amber-50 rounded-2xl border border-amber-100 shadow-sm p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 bg-amber-100">⚠️</div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-amber-600">{label}</div>
          <div className="text-[10px] text-amber-400 mt-0.5">indisponível</div>
        </div>
      </div>
    );
  }
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 sm:p-4 flex items-center gap-3">
      <div
        className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center text-lg shrink-0"
        style={{ background: `${color}20` }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0 overflow-hidden">
        <div className={`${valueFontSize(value)} font-black text-gray-900 leading-tight break-words`}>{value}</div>
        <div className="text-[11px] font-semibold text-gray-500 mt-0.5 leading-tight">{label}</div>
        {sub && <div className="text-[10px] text-gray-400 mt-0.5 leading-tight">{sub}</div>}
      </div>
    </div>
  );
}

function SectionTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-lg font-black text-gray-900">{title}</h2>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

const PIE_COLORS = ["#84cc16", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899"];

function compactBRL(v: number): string {
  if (v >= 1_000_000) {
    const n = (v / 1_000_000).toFixed(1).replace(".", ",");
    return `R$ ${n} mi`;
  }
  if (v >= 1_000) {
    const n = (v / 1_000).toFixed(1).replace(".", ",");
    return `R$ ${n} mil`;
  }
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ─── 1. DASHBOARD EM TEMPO REAL ───────────────────────────────────────────────

type WidgetStatus = "loading" | "ok" | "error";

interface DashboardWidgets {
  kpis: WidgetStatus;
  horas: WidgetStatus;
  cidades: WidgetStatus;
}

export function DashboardRealtimeTab() {
  const [loading, setLoading] = useState(true);
  const [lastAt, setLastAt] = useState(new Date());

  const [kpis, setKpis] = useState<Pick<DashboardRealtime, "ofertasHoje" | "confirmacoes24h" | "economiaGerada" | "usuariosAtivos7d"> | null>(null);
  const [horasData, setHorasData] = useState<Array<{ hora: string; total: number }> | null>(null);
  const [cidades, setCidades] = useState<DashboardRealtime["topCidades"] | null>(null);

  const [widgets, setWidgets] = useState<DashboardWidgets>({
    kpis: "loading",
    horas: "loading",
    cidades: "loading",
  });

  const setWidget = (k: keyof DashboardWidgets, s: WidgetStatus) =>
    setWidgets((prev) => ({ ...prev, [k]: s }));

  const load = async () => {
    setLoading(true);
    setWidgets({ kpis: "loading", horas: "loading", cidades: "loading" });

    const results = await Promise.allSettled([
      customFetch<DashboardRealtime>("/api/admin/dashboard/realtime"),
    ]);

    const result = results[0];

    if (result.status === "rejected") {
      console.error("[DashboardMetricError]", "dashboard/realtime", result.reason);
      setWidgets({ kpis: "error", horas: "error", cidades: "error" });
      setLoading(false);
      return;
    }

    const d = result.value;

    try {
      setKpis({
        ofertasHoje:     d.ofertasHoje     ?? 0,
        confirmacoes24h: d.confirmacoes24h ?? 0,
        economiaGerada:  d.economiaGerada  ?? 0,
        usuariosAtivos7d: d.usuariosAtivos7d ?? 0,
      });
      setWidget("kpis", "ok");
    } catch (e) {
      console.error("[DashboardMetricError]", "kpis", e);
      setWidget("kpis", "error");
    }

    try {
      const filled = Array.from({ length: 24 }, (_, h) => ({
        hora: `${String(h).padStart(2, "0")}h`,
        total: (d.ofertasPorHora ?? []).find((r) => r.hora === h)?.total ?? 0,
      }));
      setHorasData(filled);
      setWidget("horas", "ok");
    } catch (e) {
      console.error("[DashboardMetricError]", "ofertas_por_hora", e);
      setWidget("horas", "error");
    }

    try {
      setCidades(d.topCidades ?? []);
      setWidget("cidades", "ok");
    } catch (e) {
      console.error("[DashboardMetricError]", "top_cidades", e);
      setWidget("cidades", "error");
    }

    setLastAt(new Date());
    setLoading(false);
  };

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const anyOk = widgets.kpis === "ok" || widgets.horas === "ok" || widgets.cidades === "ok";
  const allError = widgets.kpis === "error" && widgets.horas === "error" && widgets.cidades === "error";

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
      <div className="flex items-center justify-between">
        <SectionTitle
          title="📊 Dashboard em Tempo Real"
          sub="Atualiza automaticamente a cada 30 segundos"
        />
        <button
          onClick={() => void load()}
          className="text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-3 py-1.5 rounded-xl transition-colors shrink-0"
        >
          ↻ Agora
        </button>
      </div>

      {loading ? (
        <Skeleton rows={8} />
      ) : allError ? (
        <div className="text-center py-14 space-y-3">
          <div className="text-4xl">📡</div>
          <div className="text-base font-bold text-gray-700">Dashboard temporariamente indisponível</div>
          <div className="text-sm text-gray-400">O servidor não respondeu. Tente novamente em instantes.</div>
          <button
            onClick={() => void load()}
            className="mt-2 text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 px-4 py-2 rounded-xl hover:bg-indigo-100 transition-colors"
          >
            ↻ Tentar novamente
          </button>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {widgets.kpis === "error" ? (
              <>
                <KpiCard icon="📦" label="Ofertas hoje"        value="—" unavailable />
                <KpiCard icon="👥" label="Usuários ativos"     value="—" unavailable />
                <KpiCard icon="✅" label="Confirmações 24h"    value="—" unavailable />
                <KpiCard icon="💰" label="Economia estimada"   value="—" unavailable />
              </>
            ) : (
              <>
                <KpiCard icon="📦" label="Ofertas hoje"       value={kpis?.ofertasHoje ?? 0}       sub="novas publicações" />
                <KpiCard icon="👥" label="Usuários ativos"    value={kpis?.usuariosAtivos7d ?? 0}   sub="últimos 7 dias" color="#3b82f6" />
                <KpiCard icon="✅" label="Confirmações 24h"   value={kpis?.confirmacoes24h ?? 0}    sub="pela comunidade" color="#8b5cf6" />
                <KpiCard
                  icon="💰"
                  label="Economia estimada"
                  value={compactBRL(kpis?.economiaGerada ?? 0)}
                  sub="últimos 30 dias"
                  color="#f59e0b"
                />
              </>
            )}
          </div>

          {/* Gráfico de horas */}
          {widgets.horas === "error" ? (
            <WidgetError label="Publicações por hora" />
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-black text-gray-800 mb-4">📈 Publicações por hora hoje</h3>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={horasData ?? []} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <XAxis dataKey="hora" tick={{ fontSize: 9 }} interval={3} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip formatter={(v: number) => [`${v} ofertas`, ""]} />
                  <Bar dataKey="total" fill="#84cc16" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Top cidades */}
          {widgets.cidades === "error" ? (
            <WidgetError label="Cidades mais ativas" />
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-black text-gray-800 mb-4">🗺️ Cidades mais ativas (7 dias)</h3>
              {!cidades || cidades.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">Nenhuma cidade identificada ainda.</p>
              ) : (
                <div className="space-y-3">
                  {cidades.map((c, i) => {
                    const max = cidades[0]?.total ?? 1;
                    const pct = Math.round((c.total / max) * 100);
                    return (
                      <div key={c.cidade ?? i} className="flex items-center gap-3">
                        <span className="w-5 text-xs font-black text-gray-400 shrink-0 text-right">{i + 1}</span>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-bold text-gray-800">{c.cidade ?? "Não informada"}</span>
                            <span className="text-xs text-gray-500">
                              {c.total} oferta{c.total !== 1 ? "s" : ""} · {c.confirmacoes} confirm.
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                            <div
                              className="h-2 rounded-full transition-all"
                              style={{ width: `${pct}%`, background: "#84cc16" }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {anyOk && (
            <p className="text-[10px] text-gray-400 text-right">
              Última atualização: {lastAt.toLocaleTimeString("pt-BR")}
            </p>
          )}
        </>
      )}
    </motion.div>
  );
}

// ─── 2. ANALYTICS AVANÇADO ────────────────────────────────────────────────────

export function AnalyticsAvancadoTab() {
  const [data, setData]       = useState<RetentionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);

  useEffect(() => {
    customFetch<RetentionData>("/api/admin/analytics/retention")
      .then((d) => { setData(d); setError(false); })
      .catch((e) => {
        console.error("[DashboardMetricError]", "analytics/retention", e);
        setError(true);
      })
      .finally(() => setLoading(false));
  }, []);

  const fmtDia = (s: string) =>
    new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

  const horasData = Array.from({ length: 24 }, (_, h) => ({
    hora: `${String(h).padStart(2, "0")}h`,
    total: (data?.horario ?? []).find((r) => r.hora === h)?.total ?? 0,
  }));

  const cidadesPie = (data?.cidades ?? []).slice(0, 6).map((c, i) => ({
    name: c.cidade ?? "Outra",
    value: c.ofertas,
    fill: PIE_COLORS[i % PIE_COLORS.length],
  }));

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
      <SectionTitle
        title="🔭 Analytics Avançado"
        sub="Retenção DAU, crescimento por cidade e padrões de uso"
      />

      {loading ? (
        <Skeleton rows={10} />
      ) : error ? (
        <div className="text-center py-14 space-y-3">
          <div className="text-4xl">📡</div>
          <div className="text-base font-bold text-gray-700">Analytics indisponível</div>
          <div className="text-sm text-gray-400">Não foi possível carregar os dados de retenção.</div>
        </div>
      ) : data ? (
        <>
          {/* DAU */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-black text-gray-800 mb-1">👥 Usuários Ativos Diários — DAU (30 dias)</h3>
            <p className="text-xs text-gray-400 mb-4">Baseado em último login registrado</p>
            {data.dau.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">Dados insuficientes ainda.</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart
                  data={data.dau.map((d) => ({ ...d, dia: fmtDia(d.dia) }))}
                  margin={{ top: 0, right: 0, left: -20, bottom: 0 }}
                >
                  <XAxis dataKey="dia" tick={{ fontSize: 9 }} interval={4} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="usuarios"
                    stroke="#6366f1"
                    fill="#6366f115"
                    strokeWidth={2}
                    dot={false}
                    name="Usuários ativos"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Horário + pie cidades side by side on desktop */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Horário de uso */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-black text-gray-800 mb-1">🕐 Horários de maior uso (7 dias)</h3>
              <p className="text-xs text-gray-400 mb-4">Publicações por hora</p>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={horasData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <XAxis dataKey="hora" tick={{ fontSize: 8 }} interval={2} />
                  <YAxis tick={{ fontSize: 9 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="total" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Publicações" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Cidades pie */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-black text-gray-800 mb-4">🗺️ Distribuição por cidade</h3>
              {cidadesPie.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-12">Sem dados.</p>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={cidadesPie}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      dataKey="value"
                      nameKey="name"
                      label={({ name, percent }: { name: string; percent: number }) =>
                        `${name} ${(percent * 100).toFixed(0)}%`
                      }
                      labelLine={false}
                    >
                      {cidadesPie.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Tabela de cidades */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-black text-gray-800 mb-4">📋 Crescimento por Cidade (30 dias)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] text-gray-400 border-b border-gray-100 uppercase tracking-wide">
                    <th className="text-left py-2 pr-3 font-semibold">#</th>
                    <th className="text-left py-2 font-semibold">Cidade</th>
                    <th className="text-right py-2 font-semibold">Ofertas</th>
                    <th className="text-right py-2 font-semibold">Usuários</th>
                    <th className="text-right py-2 font-semibold">Confirmações</th>
                  </tr>
                </thead>
                <tbody>
                  {data.cidades.slice(0, 12).map((c, i) => (
                    <tr key={c.cidade ?? i} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="py-2 pr-3 text-gray-400 text-xs font-bold">{i + 1}</td>
                      <td className="py-2 font-medium text-gray-800">{c.cidade ?? "—"}</td>
                      <td className="py-2 text-right font-black text-lime-700">{c.ofertas}</td>
                      <td className="py-2 text-right text-gray-600">{c.usuarios}</td>
                      <td className="py-2 text-right text-indigo-600">{c.confirmacoes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </motion.div>
  );
}

// ─── 3. ANTI-FRAUDE ───────────────────────────────────────────────────────────

export function AntiFraudTab() {
  const [data, setData]       = useState<AntiFraudData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const d = await customFetch<AntiFraudData>("/api/admin/antifraud/overview");
      setData(d);
    } catch (e) {
      console.error("[DashboardMetricError]", "antifraud/overview", e);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const act = async (key: string, path: string, method = "POST", body?: Record<string, unknown>) => {
    setActionId(key);
    try {
      await customFetch<unknown>(path, {
        method,
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      await load();
    } finally {
      setActionId(null);
    }
  };

  const scoreColor = (s: number) =>
    s >= 70 ? "text-lime-600 bg-lime-50"
    : s >= 40 ? "text-amber-600 bg-amber-50"
    : "text-red-600 bg-red-50";

  const statusBadge = (s: string) =>
    s === "bloqueado" ? "bg-red-100 text-red-700 border-red-200"
    : s === "suspenso"  ? "bg-orange-100 text-orange-700 border-orange-200"
    : "bg-gray-100 text-gray-600 border-gray-200";

  const ofertaStatusBadge = (s: string) =>
    s === "suspeita"   ? "bg-orange-100 text-orange-700 border-orange-200"
    : s === "removida" || s === "recusada" ? "bg-red-100 text-red-700 border-red-200"
    : "bg-gray-100 text-gray-600 border-gray-200";

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
      <div className="flex items-center justify-between">
        <SectionTitle
          title="🛡️ Anti-fraude"
          sub="Detecção de padrões suspeitos, usuários de risco e abusos"
        />
        <button
          onClick={() => void load()}
          disabled={loading}
          className="text-xs font-bold px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors disabled:opacity-50"
        >
          {loading ? "↺ Carregando..." : "↺ Atualizar"}
        </button>
      </div>

      {loading && !data && <Skeleton rows={6} />}

      {error && !loading && (
        <div className="text-center py-14 space-y-3">
          <div className="text-4xl">🛡️</div>
          <div className="text-base font-bold text-gray-700">Anti-fraude indisponível</div>
          <div className="text-sm text-gray-400">Não foi possível carregar os dados de segurança.</div>
          <button onClick={() => void load()} className="text-sm text-blue-600 underline">Tentar novamente</button>
        </div>
      )}

      {data && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard icon="🚨" label="Ofertas suspeitas"      value={data.ofertasSuspeitas}         color="#ef4444" />
            <KpiCard icon="🚩" label="Com denúncias"          value={data.ofertasDenunciadas}        color="#f97316" />
            <KpiCard icon="🚫" label="Usuários bloqueados"    value={data.usuariosBloqueados}        color="#8b5cf6" />
            <KpiCard icon="⏸️" label="Usuários suspensos"     value={data.usuariosSuspensos}         color="#f59e0b" />
            <KpiCard icon="⚠️" label="Confiança baixa"        value={data.usuariosConfiancaBaixa}    color="#ef4444" />
            <KpiCard icon="📍" label="Sem localização"        value={data.ofertasSemLocalizacao}     color="#94a3b8" />
            <KpiCard icon="🤖" label="Baixa confiança OCR"    value={data.ofertasBaixaConfiancaOCR}  color="#6366f1" />
          </div>

          {/* Tabela de usuários suspeitos */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-black text-gray-900">👤 Usuários em risco (últimos 7 dias)</h3>
              <p className="text-xs text-gray-400 mt-0.5">Ordenados por denúncias recebidas. Ações aplicadas imediatamente.</p>
            </div>
            {data.topUsuariosSuspeitos.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">✅ Nenhum usuário suspeito detectado.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-4 py-2.5 font-bold text-gray-500 min-w-[150px]">Usuário</th>
                      <th className="text-center px-3 py-2.5 font-bold text-gray-500">Score</th>
                      <th className="text-center px-3 py-2.5 font-bold text-gray-500">Ofertas</th>
                      <th className="text-center px-3 py-2.5 font-bold text-gray-500">Denúncias</th>
                      <th className="text-center px-3 py-2.5 font-bold text-gray-500">Suspeitas</th>
                      <th className="text-left px-3 py-2.5 font-bold text-gray-500 min-w-[200px]">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topUsuariosSuspeitos.map((u) => {
                      const busySusp = actionId === `susp-${u.usuarioId}`;
                      const busyBloc = actionId === `bloc-${u.usuarioId}`;
                      return (
                        <tr key={u.usuarioId} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="px-4 py-2.5">
                            <div className="font-bold text-gray-900 truncate max-w-[140px]">{u.nome}</div>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${statusBadge(u.status)}`}>
                              {u.status}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={`text-xs font-black px-2 py-0.5 rounded-full ${scoreColor(u.scoreConfianca)}`}>
                              {u.scoreConfianca}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center font-bold text-gray-700">{u.ofertasPublicadas}</td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={u.denunciasRecebidas > 0 ? "font-black text-red-600" : "text-gray-300"}>
                              {u.denunciasRecebidas}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={u.ofertasSuspeitas > 0 ? "font-black text-orange-600" : "text-gray-300"}>
                              {u.ofertasSuspeitas}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-1">
                              {u.status !== "suspenso" && u.status !== "bloqueado" && (
                                <button
                                  disabled={busySusp || busyBloc}
                                  onClick={() => act(`susp-${u.usuarioId}`, `/api/admin/usuarios/${u.usuarioId}/suspender`, "POST", { duracao: "24h", motivo: "Anti-fraude: padrão suspeito detectado" })}
                                  className="text-[10px] font-bold px-2 py-1 rounded-lg border border-orange-200 text-orange-700 bg-orange-50 hover:bg-orange-100 transition-colors disabled:opacity-40"
                                >
                                  {busySusp ? "..." : "⏸ suspender"}
                                </button>
                              )}
                              {u.status !== "bloqueado" && (
                                <button
                                  disabled={busySusp || busyBloc}
                                  onClick={() => act(`bloc-${u.usuarioId}`, `/api/admin/usuarios/${u.usuarioId}/bloquear`, "POST")}
                                  className="text-[10px] font-bold px-2 py-1 rounded-lg border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-40"
                                >
                                  {busyBloc ? "..." : "🚫 bloquear"}
                                </button>
                              )}
                              {u.status === "bloqueado" && (
                                <button
                                  disabled={busyBloc}
                                  onClick={() => act(`bloc-${u.usuarioId}`, `/api/admin/usuarios/${u.usuarioId}/bloquear`, "POST")}
                                  className="text-[10px] font-bold px-2 py-1 rounded-lg border border-gray-200 text-gray-600 bg-gray-50 hover:bg-gray-100 transition-colors disabled:opacity-40"
                                >
                                  {busyBloc ? "..." : "✓ desbloquear"}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Tabela de ofertas suspeitas */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-black text-gray-900">🔥 Ofertas suspeitas / denunciadas</h3>
              <p className="text-xs text-gray-400 mt-0.5">Ordenadas por número de denúncias.</p>
            </div>
            {data.topOfertasSuspeitas.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">✅ Nenhuma oferta suspeita no momento.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-4 py-2.5 font-bold text-gray-500 min-w-[160px]">Produto</th>
                      <th className="text-left px-3 py-2.5 font-bold text-gray-500">Mercado</th>
                      <th className="text-center px-3 py-2.5 font-bold text-gray-500">Den.</th>
                      <th className="text-center px-3 py-2.5 font-bold text-gray-500">IA</th>
                      <th className="text-left px-3 py-2.5 font-bold text-gray-500">Status</th>
                      <th className="text-left px-3 py-2.5 font-bold text-gray-500 min-w-[220px]">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topOfertasSuspeitas.map((o) => {
                      const busySusp = actionId === `osusp-${o.id}`;
                      const busyArq  = actionId === `oarq-${o.id}`;
                      const busyRes  = actionId === `ores-${o.id}`;
                      return (
                        <tr key={o.id} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="px-4 py-2.5">
                            <div className="font-bold text-gray-900 truncate max-w-[150px]" title={o.produto}>{o.produto}</div>
                            <div className="text-gray-400 text-[10px]">#{o.id}</div>
                          </td>
                          <td className="px-3 py-2.5 text-gray-600 truncate max-w-[120px]">{o.mercado}</td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={o.denuncias > 0 ? "font-black text-red-600" : "text-gray-300"}>
                              {o.denuncias}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            {o.iaScore != null
                              ? <span className={`font-bold ${o.iaScore < 0.5 ? "text-red-500" : "text-lime-600"}`}>
                                  {Math.round(o.iaScore * 100)}%
                                </span>
                              : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${ofertaStatusBadge(o.status)}`}>
                              {o.status}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-1 flex-wrap">
                              {o.status !== "suspeita" && (
                                <button
                                  disabled={busySusp || busyArq}
                                  onClick={() => act(`osusp-${o.id}`, `/api/admin/ofertas/${o.id}/suspeita`)}
                                  className="text-[10px] font-bold px-2 py-1 rounded-lg border border-orange-200 text-orange-700 bg-orange-50 hover:bg-orange-100 transition-colors disabled:opacity-40"
                                >
                                  {busySusp ? "..." : "⚠️ susp."}
                                </button>
                              )}
                              {o.denuncias > 0 && (
                                <button
                                  disabled={busyRes || busyArq}
                                  onClick={() => act(`ores-${o.id}`, `/api/ofertas/${o.id}/resetar-denuncias`)}
                                  className="text-[10px] font-bold px-2 py-1 rounded-lg border border-gray-200 text-gray-700 bg-gray-50 hover:bg-gray-100 transition-colors disabled:opacity-40"
                                >
                                  {busyRes ? "..." : "🚩 resetar"}
                                </button>
                              )}
                              <button
                                disabled={busyArq || busySusp}
                                onClick={() => act(`oarq-${o.id}`, `/api/admin/ofertas/${o.id}/arquivar`)}
                                className="text-[10px] font-bold px-2 py-1 rounded-lg border border-gray-200 text-gray-500 bg-gray-50 hover:bg-gray-100 transition-colors disabled:opacity-40"
                              >
                                {busyArq ? "..." : "📦 arquivar"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </motion.div>
  );
}

// ─── 4. INDICAÇÕES ────────────────────────────────────────────────────────────

export function IndicacoesTab() {
  const [data, setData]       = useState<IndicacoesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);

  useEffect(() => {
    customFetch<IndicacoesData>("/api/admin/indicacoes")
      .then((d) => { setData(d); setError(false); })
      .catch((e) => {
        console.error("[DashboardMetricError]", "indicacoes", e);
        setError(true);
      })
      .finally(() => setLoading(false));
  }, []);

  const fmtDia = (s: string) =>
    new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
      <SectionTitle
        title="🔗 Sistema de Indicações"
        sub="Rastreamento de convites e referências dos últimos 30 dias"
      />

      {loading ? (
        <Skeleton rows={6} />
      ) : error ? (
        <div className="text-center py-14 space-y-3">
          <div className="text-4xl">🔗</div>
          <div className="text-base font-bold text-gray-700">Indicações indisponível</div>
          <div className="text-sm text-gray-400">Não foi possível carregar os dados de convites.</div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <KpiCard
              icon="📨"
              label="Convites (30 dias)"
              value={data?.totalConvites ?? 0}
              sub="cupons tipo convite registrados"
              color="#8b5cf6"
            />
            <KpiCard
              icon="🏆"
              label="Top indicador"
              value={data?.topIndicadores[0]?.nome ?? "—"}
              sub={`${data?.topIndicadores[0]?.convites ?? 0} convites`}
              color="#f59e0b"
            />
          </div>

          {/* Gráfico diário */}
          {data && data.convitesDiarios.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-black text-gray-800 mb-4">📅 Convites por dia</h3>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart
                  data={data.convitesDiarios.map((d) => ({ ...d, dia: fmtDia(d.dia) }))}
                  margin={{ top: 0, right: 0, left: -20, bottom: 0 }}
                >
                  <XAxis dataKey="dia" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="convites" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Ranking */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-black text-gray-800 mb-4">🏆 Ranking de Indicadores</h3>
            {!data || data.topIndicadores.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-3xl mb-3">🔗</div>
                <p className="text-sm text-gray-500">Nenhum convite registrado ainda.</p>
                <p className="text-xs text-gray-400 mt-1">
                  Aparecerão aqui quando usuários compartilharem o app com tipo='convite'.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {data.topIndicadores.map((u, i) => (
                  <div
                    key={u.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-gray-100 bg-gray-50"
                  >
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                        i === 0
                          ? "bg-yellow-100 text-yellow-700"
                          : i === 1
                          ? "bg-gray-200 text-gray-700"
                          : i === 2
                          ? "bg-orange-100 text-orange-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm text-gray-900 truncate">{u.nome}</div>
                      <div className="text-xs text-gray-500">{u.pontos} pts</div>
                    </div>
                    <span className="text-sm font-black text-purple-700 bg-purple-100 px-2.5 py-0.5 rounded-full shrink-0">
                      {u.convites} convites
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Info box */}
          <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-5">
            <h3 className="text-sm font-black text-indigo-900 mb-3">ℹ️ Como funcionam as indicações</h3>
            <ul className="space-y-1.5 text-xs text-indigo-800">
              <li>• Compartilhamento de oferta via WhatsApp → +1 cupom (compartilhamento/missao_compartilhar)</li>
              <li>• Convites são rastreados via <code className="bg-indigo-100 px-1 rounded">cupons_historico</code> com <code className="bg-indigo-100 px-1 rounded">tipo = 'convite'</code></li>
              <li>• Top indicadores aparecem no ranking semanal de recompensas</li>
              <li>• A missão diária de compartilhar é verificada e creditada automaticamente</li>
            </ul>
          </div>
        </>
      )}
    </motion.div>
  );
}

// ─── 5. SISTEMA VIRAL ─────────────────────────────────────────────────────────

export function ViralTab() {
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const shareLinks = [
    { label: "Feed de ofertas", url: `${origin}/ofertas`, icon: "🛒" },
    { label: "Página inicial", url: origin, icon: "🏠" },
    { label: "Ranking da comunidade", url: `${origin}/ranking`, icon: "🏆" },
  ];

  const mechanics = [
    { icon: "💬", title: "Compartilhamento de oferta", status: "✅ Ativo", desc: "Usuário ganha 1 cupom por compartilhamento válido (missao_compartilhar)", ok: true },
    { icon: "🎯", title: "Missão diária de share", status: "✅ Ativo", desc: "Missão: compartilhe 1 oferta/dia → +pts", ok: true },
    { icon: "📊", title: "Ranking público", status: "✅ Ativo", desc: "Ranking gera competição saudável e retenção orgânica", ok: true },
    { icon: "🏆", title: "Sorteios semanais", status: "✅ Ativo", desc: "Prêmios para usuários mais ativos motivam publicações", ok: true },
    { icon: "🔗", title: "Código de indicação pessoal", status: "🔜 Em breve", desc: "Links únicos por usuário com rastreamento de conversão", ok: false },
    { icon: "🖼️", title: "Cards automáticos Instagram", status: "🔜 Em breve", desc: "Geração de imagens prontas para Stories sobre ofertas", ok: false },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
      <SectionTitle title="🚀 Sistema Viral" sub="Ferramentas de crescimento orgânico e compartilhamento" />

      {/* WhatsApp links */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-green-100 flex items-center justify-center text-xl shrink-0">📱</div>
          <div>
            <h3 className="text-sm font-black text-gray-900">Links de compartilhamento WhatsApp</h3>
            <p className="text-xs text-gray-500">Clique para abrir conversa no WhatsApp Web</p>
          </div>
        </div>
        <div className="space-y-3">
          {shareLinks.map((item) => (
            <div key={item.label} className="border border-gray-200 rounded-xl p-3 flex gap-2 items-center">
              <span className="text-lg shrink-0">{item.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-gray-700 mb-1">{item.label}</p>
                <p className="text-[10px] text-gray-400 font-mono truncate">{item.url}</p>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(item.url).catch(() => {});
                  window.open(
                    `https://wa.me/?text=${encodeURIComponent(`🛒 AíCompensa — Economize nas compras do mercado!\n${item.url}`)}`,
                    "_blank",
                  );
                }}
                className="text-xs font-black bg-green-500 text-white px-3 py-2 rounded-xl hover:bg-green-600 transition-colors shrink-0"
              >
                📤 WA
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Mechanics grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {mechanics.map((m) => (
          <div
            key={m.title}
            className={`bg-white rounded-2xl border shadow-sm p-4 ${m.ok ? "border-lime-200" : "border-gray-100 opacity-60"}`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">{m.icon}</span>
              <span
                className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                  m.ok ? "bg-lime-100 text-lime-700" : "bg-gray-100 text-gray-500"
                }`}
              >
                {m.status}
              </span>
            </div>
            <h4 className="text-sm font-black text-gray-900 mb-1">{m.title}</h4>
            <p className="text-xs text-gray-500">{m.desc}</p>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ─── 6. GAMIFICAÇÃO ───────────────────────────────────────────────────────────

export function GamificacaoTab() {
  const levels = [
    { nivel: "🎒 Estagiário da Economia",    range: "0–49 pts",     color: "#94a3b8" },
    { nivel: "🔎 Assistente de Ofertas",     range: "50–149 pts",   color: "#84cc16" },
    { nivel: "🎓 Bacharel das Compras",      range: "150–299 pts",  color: "#3b82f6" },
    { nivel: "🏪 Especialista das Gôndolas", range: "300–499 pts",  color: "#8b5cf6" },
    { nivel: "💰 Mestre das Pechinchas",     range: "500–999 pts",  color: "#f59e0b" },
    { nivel: "🔬 Doutor da Economia",        range: "1000–2499 pts", color: "#ef4444" },
    { nivel: "🏆 PhD do Supermercado",       range: "2500+ pts",    color: "#ec4899" },
  ];

  const conquistas = [
    { key: "primeira_oferta",     emoji: "🎉", label: "Primeira Oferta",     desc: "Publicou a primeira oferta" },
    { key: "mestre_carnes",       emoji: "🥩", label: "Mestre das Carnes",   desc: "10+ ofertas em Carnes" },
    { key: "cacador_leite",       emoji: "🥛", label: "Caçador do Leite",    desc: "10+ ofertas em Laticínios" },
    { key: "explorador_mercados", emoji: "🗺️", label: "Explorador",          desc: "Ofertas em 5 mercados diferentes" },
    { key: "rei_economia",        emoji: "👑", label: "Rei da Economia",     desc: "500+ pontos acumulados" },
    { key: "oferta_viral",        emoji: "🔥", label: "Oferta Viral",        desc: "10+ confirmações em 1 oferta" },
    { key: "sequencia_7",         emoji: "⚡", label: "Sequência de 7",      desc: "7 dias seguidos publicando" },
    { key: "confirmador",         emoji: "✅", label: "Confirmador Nato",    desc: "20+ confirmações de preço" },
    { key: "hortifruti_lover",    emoji: "🥦", label: "Hortifruti Lover",    desc: "10+ ofertas em Hortifruti" },
    { key: "lenda",               emoji: "💎", label: "Lenda",               desc: "2500+ pontos — status máximo" },
  ];

  const pontos = [
    { acao: "Nova oferta publicada",        pts: "+10 pts", icon: "📦" },
    { acao: "Oferta confirmada (outro user)", pts: "+5 pts", icon: "✅" },
    { acao: "Validação de preço",           pts: "+2 pts",  icon: "🔍" },
    { acao: "Comentário com 3+ curtidas",   pts: "+2 pts",  icon: "💬" },
    { acao: "Missão concluída",             pts: "+N pts",  icon: "🎯" },
    { acao: "Sorteio semanal",              pts: "variável", icon: "🎲" },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
      <SectionTitle title="🎮 Sistema de Gamificação" sub="Níveis, conquistas, missões e pontuação" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Níveis */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-black text-gray-800 mb-4">🏆 Sistema de Níveis</h3>
          <div className="space-y-2">
            {levels.map((l) => (
              <div
                key={l.nivel}
                className="flex items-center gap-3 px-3 py-2 rounded-xl bg-gray-50 border border-gray-100"
              >
                <div className="w-3 h-3 rounded-full shrink-0" style={{ background: l.color }} />
                <span className="flex-1 text-sm font-semibold text-gray-800">{l.nivel}</span>
                <span className="text-xs text-gray-500 font-mono shrink-0">{l.range}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Pontos */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-black text-gray-800 mb-4">💰 Sistema de Pontos</h3>
          <div className="space-y-2">
            {pontos.map((p) => (
              <div
                key={p.acao}
                className="flex items-center gap-3 px-3 py-2 rounded-xl bg-gray-50 border border-gray-100"
              >
                <span className="text-base shrink-0">{p.icon}</span>
                <span className="flex-1 text-sm text-gray-700">{p.acao}</span>
                <span className="text-xs font-black text-lime-700 bg-lime-100 px-2.5 py-0.5 rounded-full shrink-0">
                  {p.pts}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Conquistas */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-sm font-black text-gray-800 mb-4">🥇 Conquistas Disponíveis (10 total)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {conquistas.map((a) => (
            <div
              key={a.key}
              className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-gray-100 bg-gray-50"
            >
              <span className="text-xl shrink-0">{a.emoji}</span>
              <div className="min-w-0">
                <div className="text-xs font-black text-gray-900">{a.label}</div>
                <div className="text-[10px] text-gray-400">{a.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Níveis de recompensas */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
        <h3 className="text-sm font-black text-amber-900 mb-3">🎁 Níveis na página Prêmios</h3>
        <div className="space-y-1.5 text-xs text-amber-800">
          <div className="flex items-center gap-2"><span>🥉</span><span><strong>Econômico Iniciante</strong> — 0–100 pts</span></div>
          <div className="flex items-center gap-2"><span>🥈</span><span><strong>Caçador de Ofertas</strong> — 101–500 pts</span></div>
          <div className="flex items-center gap-2"><span>🥇</span><span><strong>Mestre da Economia</strong> — 501–2000 pts</span></div>
          <div className="flex items-center gap-2"><span>💎</span><span><strong>Lenda do AíCompensa</strong> — 2000+ pts</span></div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── 7. FEED INTELIGENTE ─────────────────────────────────────────────────────

// ── Feed Control types ────────────────────────────────────────────────────────
interface FeedResumoOferta {
  id: number;
  produto: string;
  preco: number;
  mercado: string;
  categoria: string;
  status: string;
  destacada: boolean;
  patrocinada: boolean;
  denuncias: number;
  validade: string | null;
  latitude: number | null;
  longitude: number | null;
}

interface FeedResumo {
  totalAtivas: number;
  totalDestacadas: number;
  totalPatrocinadas: number;
  totalSuspeitas: number;
  totalDenunciadas: number;
  totalExpirando2h: number;
  totalSemLocalizacao: number;
  ultimasOfertas: FeedResumoOferta[];
  atualizadoEm: string;
}

async function feedAction(path: string, method = "POST"): Promise<void> {
  await customFetch<unknown>(path, { method });
}

export function FeedControleTab() {
  const [resumo, setResumo] = useState<FeedResumo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(false);
  const [actionId, setActionId] = useState<number | null>(null);
  const [algoOpen, setAlgoOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await customFetch<FeedResumo>("/api/admin/feed/resumo");
      setResumo(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const act = async (id: number, path: string, method = "POST") => {
    setActionId(id);
    try {
      await feedAction(path, method);
      await load();
    } finally {
      setActionId(null);
    }
  };

  const statusColor: Record<string, string> = {
    nova:      "#84cc16",
    validada:  "#6366f1",
    suspeita:  "#ef4444",
    expirada:  "#94a3b8",
    arquivada: "#94a3b8",
    pendente_validacao: "#f59e0b",
    revisao_manual:     "#f59e0b",
  };

  const prioridades = [
    { pos: 1, label: "Patrocinadas",           desc: "Máx. 2/página, injetadas nos slots 3 e 8",      color: "#f59e0b" },
    { pos: 2, label: "Destacadas",             desc: "Sempre no topo do feed orgânico",                color: "#3b82f6" },
    { pos: 3, label: "Novas (publicadas hoje)", desc: "Status 'nova' + publicadas nas últimas 24h",    color: "#84cc16" },
    { pos: 4, label: "Validadas",              desc: "Status 'validada' — aprovadas pela comunidade",   color: "#6366f1" },
    { pos: 5, label: "Demais ativas",          desc: "Todas as outras ofertas com status ativo",       color: "#94a3b8" },
    { pos: 6, label: "Suspeitas",              desc: "Em revisão — aparecem com badge de aviso",       color: "#ef4444" },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
      <div className="flex items-center justify-between">
        <SectionTitle title="📱 Feed Control" sub="Resumo operacional e ações rápidas sobre o feed público" />
        <button
          onClick={() => void load()}
          disabled={loading}
          className="text-xs font-bold px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors disabled:opacity-50"
        >
          {loading ? "↺ Atualizando..." : "↺ Atualizar"}
        </button>
      </div>

      {/* Error state */}
      {error && !loading && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
          <span className="text-xl">⚠️</span>
          <div>
            <div className="text-sm font-bold text-amber-800">Não foi possível carregar o resumo do feed</div>
            <button onClick={() => void load()} className="text-xs text-amber-600 underline mt-0.5">Tentar novamente</button>
          </div>
        </div>
      )}

      {/* KPI cards */}
      {loading && !resumo && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 7 }).map((_, i) => <SkeletonCard key={i} height={76} />)}
        </div>
      )}

      {resumo && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { icon: "✅", label: "Ativas no feed",    value: resumo.totalAtivas,         color: "#84cc16" },
              { icon: "⭐", label: "Destacadas",         value: resumo.totalDestacadas,     color: "#3b82f6" },
              { icon: "💰", label: "Patrocinadas",       value: resumo.totalPatrocinadas,   color: "#f59e0b" },
              { icon: "⚠️", label: "Suspeitas",          value: resumo.totalSuspeitas,      color: "#ef4444" },
              { icon: "🚩", label: "Com denúncias",      value: resumo.totalDenunciadas,    color: "#f97316" },
              { icon: "⏰", label: "Expirando em 2h",    value: resumo.totalExpirando2h,    color: "#8b5cf6" },
              { icon: "📍", label: "Sem localização",    value: resumo.totalSemLocalizacao, color: "#94a3b8" },
            ].map((k) => (
              <KpiCard key={k.label} icon={k.icon} label={k.label} value={k.value} color={k.color} />
            ))}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0" style={{ background: "#f1f5f920" }}>🕐</div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-semibold text-gray-400">Atualizado em</div>
                <div className="text-xs font-black text-gray-700 leading-tight">
                  {new Date(resumo.atualizadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </div>
              </div>
            </div>
          </div>

          {/* Últimas ofertas — tabela de ações rápidas */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-black text-gray-900">📋 Últimas 30 ofertas ativas</h3>
              <p className="text-xs text-gray-400 mt-0.5">Ações aplicadas instantaneamente no feed público.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-2.5 font-bold text-gray-500 min-w-[180px]">Produto</th>
                    <th className="text-left px-3 py-2.5 font-bold text-gray-500">Mercado</th>
                    <th className="text-left px-3 py-2.5 font-bold text-gray-500">Status</th>
                    <th className="text-center px-3 py-2.5 font-bold text-gray-500">🚩</th>
                    <th className="text-center px-3 py-2.5 font-bold text-gray-500">📍</th>
                    <th className="text-left px-3 py-2.5 font-bold text-gray-500 min-w-[260px]">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {resumo.ultimasOfertas.map((o) => {
                    const busy = actionId === o.id;
                    const expirando = o.validade && new Date(o.validade).getTime() - Date.now() < 2 * 3600_000 && new Date(o.validade) > new Date();
                    return (
                      <tr key={o.id} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${busy ? "opacity-50" : ""}`}>
                        <td className="px-4 py-2.5">
                          <div className="font-bold text-gray-900 truncate max-w-[160px]" title={o.produto}>{o.produto}</div>
                          <div className="text-gray-400 text-[10px]">
                            R$ {o.preco.toFixed(2).replace(".", ",")} · {o.categoria}
                            {expirando && <span className="ml-1 text-orange-500 font-bold">⏰ expirando</span>}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-gray-600 truncate max-w-[120px]">{o.mercado}</td>
                        <td className="px-3 py-2.5">
                          <span
                            className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
                            style={{ background: statusColor[o.status] ?? "#94a3b8" }}
                          >
                            {o.status}
                          </span>
                          {o.destacada  && <span className="ml-1 text-[10px] font-bold text-blue-600">⭐dest</span>}
                          {o.patrocinada && <span className="ml-1 text-[10px] font-bold text-amber-600">💰patr</span>}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {o.denuncias > 0
                            ? <span className="font-bold text-red-500">{o.denuncias}</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {o.latitude != null
                            ? <span className="text-green-500 font-bold">✓</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1 flex-wrap">
                            <button
                              disabled={busy}
                              onClick={() => act(o.id, `/api/ofertas/${o.id}/destacar`)}
                              className="text-[10px] font-bold px-2 py-1 rounded-lg border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors disabled:opacity-40"
                            >
                              {o.destacada ? "✗ dest." : "⭐ dest."}
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => act(o.id, `/api/ofertas/${o.id}/patrocinar`)}
                              className="text-[10px] font-bold px-2 py-1 rounded-lg border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors disabled:opacity-40"
                            >
                              {o.patrocinada ? "✗ patr." : "💰 patr."}
                            </button>
                            {o.status !== "validada" && o.status !== "nova" && (
                              <button
                                disabled={busy}
                                onClick={() => act(o.id, `/api/admin/ofertas/${o.id}/ativar`)}
                                className="text-[10px] font-bold px-2 py-1 rounded-lg border border-lime-200 text-lime-700 bg-lime-50 hover:bg-lime-100 transition-colors disabled:opacity-40"
                              >
                                ✅ ativar
                              </button>
                            )}
                            {o.status !== "suspeita" && (
                              <button
                                disabled={busy}
                                onClick={() => act(o.id, `/api/admin/ofertas/${o.id}/suspeita`)}
                                className="text-[10px] font-bold px-2 py-1 rounded-lg border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-40"
                              >
                                ⚠️ susp.
                              </button>
                            )}
                            {o.denuncias > 0 && (
                              <button
                                disabled={busy}
                                onClick={() => act(o.id, `/api/ofertas/${o.id}/resetar-denuncias`)}
                                className="text-[10px] font-bold px-2 py-1 rounded-lg border border-gray-200 text-gray-700 bg-gray-50 hover:bg-gray-100 transition-colors disabled:opacity-40"
                              >
                                🚩 resetar
                              </button>
                            )}
                            <button
                              disabled={busy}
                              onClick={() => act(o.id, `/api/admin/ofertas/${o.id}/arquivar`)}
                              className="text-[10px] font-bold px-2 py-1 rounded-lg border border-gray-200 text-gray-500 bg-gray-50 hover:bg-gray-100 transition-colors disabled:opacity-40"
                            >
                              📦 arq.
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Seção recolhível: Como o feed é ordenado */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
          onClick={() => setAlgoOpen((v) => !v)}
        >
          <div>
            <span className="text-sm font-black text-gray-900">⚙️ Como o feed é ordenado</span>
            <p className="text-xs text-gray-400 mt-0.5">Grupos de prioridade, recursos ativos e detalhes técnicos</p>
          </div>
          <span className="text-gray-400 text-lg">{algoOpen ? "▲" : "▼"}</span>
        </button>

        {algoOpen && (
          <div className="px-5 pb-5 space-y-4 border-t border-gray-100">
            <div className="space-y-2 pt-4">
              <p className="text-xs text-gray-400 mb-3">Grupos avaliados em ordem. Dentro de cada grupo: data desc → score desc → id desc.</p>
              {prioridades.map((p) => (
                <div key={p.pos} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-gray-100 bg-gray-50">
                  <div
                    className="w-7 h-7 rounded-xl font-black text-sm flex items-center justify-center text-white shrink-0"
                    style={{ background: p.color }}
                  >
                    {p.pos}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-black text-gray-900">{p.label}</div>
                    <p className="text-xs text-gray-400">{p.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { icon: "🔍", title: "Dedup automático",              desc: "Produto similar + mesmo mercado + ±5% preço + janela 48h → confirmation" },
                { icon: "⏰", title: "Auto-expiração por categoria",   desc: "TTL varia: Padaria 12h → Higiene 15d. Expiradas saem automaticamente" },
                { icon: "🛡️", title: "Anti-dead feed",                 desc: "Se < 5 resultados orgânicos, expande janela para 7 dias" },
                { icon: "📍", title: "Filtro por raio (km)",           desc: "Distância lat/lng quando disponível" },
                { icon: "🤖", title: "Auditoria IA",                   desc: "Análise de preço suspeito, foto ruim e categoria errada" },
                { icon: "💰", title: "Blending de patrocinados",       desc: "Máx. 2 patrocinadas/página nos slots 3 e 8" },
              ].map((r) => (
                <div key={r.title} className="bg-lime-50 border border-lime-100 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{r.icon}</span>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-lime-100 text-lime-700">✅ Ativo</span>
                  </div>
                  <h4 className="text-xs font-black text-gray-900 mb-0.5">{r.title}</h4>
                  <p className="text-[11px] text-gray-500">{r.desc}</p>
                </div>
              ))}
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <h3 className="text-xs font-black text-slate-800 mb-2">📐 Filtros SQL ativos</h3>
              <ul className="space-y-1 text-[11px] text-slate-700 font-mono">
                <li><span className="text-slate-400">-- filtros base</span></li>
                <li>status NOT IN ('expirada','removida','arquivada','recusada')</li>
                <li>validade &gt; NOW() — validade SQL real</li>
                <li>usuario.removido = false</li>
                <li className="mt-1"><span className="text-slate-400">-- paginação</span></li>
                <li>cursor: (dataCriacao, score_cache, id)</li>
                <li>pageSize: 20 (padrão)</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── CrescimentoTab ────────────────────────────────────────────────────────────

interface CrescimentoStats {
  totalOfertas: number;
  ofertasHoje: number;
  totalUsuarios: number;
  totalIndicacoes?: number;
}
interface CrescimentoAnalytics {
  atividadeDiaria: Array<{ dia: string; ofertas: number; confirmacoes: number }>;
}
interface CrescimentoRealtime {
  usuariosAtivos7d: number;
  confirmacoes24h: number;
}
interface RankUserGrowth {
  id: number;
  nome: string;
  pontos: number;
  nivel: string;
  ofertasSemana?: number;
}

function GrowthKpiCard({ icon, label, value, accent }: { icon: string; label: string; value: number; accent: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-1">
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center text-xl shrink-0 mb-1"
        style={{ background: accent + "18" }}
      >
        {icon}
      </div>
      <div className="text-2xl font-black text-gray-900 leading-none">{value.toLocaleString("pt-BR")}</div>
      <div className="text-[11px] font-medium text-gray-500 leading-tight mt-0.5">{label}</div>
    </div>
  );
}

const MEDAL_LABELS = ["🥇", "🥈", "🥉", "4º", "5º"];

export function CrescimentoTab() {
  const [stats, setStats]         = useState<CrescimentoStats | null>(null);
  const [realtime, setRealtime]   = useState<CrescimentoRealtime | null>(null);
  const [analytics, setAnalytics] = useState<CrescimentoAnalytics | null>(null);
  const [topPontos, setTopPontos] = useState<RankUserGrowth[]>([]);
  const [topSemana, setTopSemana] = useState<RankUserGrowth[]>([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    Promise.allSettled([
      customFetch<CrescimentoStats>("/api/admin/stats"),
      customFetch<CrescimentoRealtime>("/api/admin/dashboard/realtime"),
      customFetch<CrescimentoAnalytics>("/api/admin/analytics"),
      customFetch<RankUserGrowth[]>("/api/ranking"),
      customFetch<RankUserGrowth[]>("/api/ranking?periodo=semana"),
    ]).then(([s, r, a, rp, rs]) => {
      if (s.status === "fulfilled") setStats(s.value);
      if (r.status === "fulfilled") setRealtime(r.value);
      if (a.status === "fulfilled") setAnalytics(a.value);
      if (rp.status === "fulfilled") setTopPontos((rp.value ?? []).slice(0, 5));
      if (rs.status === "fulfilled") setTopSemana((rs.value ?? []).slice(0, 5));
      setLoading(false);
    });
  }, []);

  const ofertasUltimos7d = analytics?.atividadeDiaria.reduce((s, d) => s + d.ofertas, 0) ?? 0;

  const kpis = [
    { icon: "👥", label: "Total de usuários",   value: stats?.totalUsuarios        ?? 0, accent: "#6366f1" },
    { icon: "🛒", label: "Total de ofertas",     value: stats?.totalOfertas         ?? 0, accent: "#10b981" },
    { icon: "📅", label: "Ofertas (7 dias)",     value: ofertasUltimos7d,                 accent: "#3b82f6" },
    { icon: "🔗", label: "Total de indicações",  value: stats?.totalIndicacoes      ?? 0, accent: "#f59e0b" },
    { icon: "🏃", label: "Ativos (7 dias)",      value: realtime?.usuariosAtivos7d  ?? 0, accent: "#8b5cf6" },
    { icon: "✅", label: "Confirmações (24h)",   value: realtime?.confirmacoes24h   ?? 0, accent: "#ec4899" },
  ];

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} height={90} />)}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SkeletonCard height={200} />
          <SkeletonCard height={200} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SkeletonCard height={200} />
          <SkeletonCard height={200} />
        </div>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">

      {/* ── Métricas de crescimento ── */}
      <div>
        <h2 className="text-sm font-black text-gray-800 mb-3">📈 Métricas de crescimento</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {kpis.map((k) => (
            <GrowthKpiCard key={k.label} icon={k.icon} label={k.label} value={k.value} accent={k.accent} />
          ))}
        </div>
      </div>

      {/* ── Mais ativos ── */}
      <div>
        <h2 className="text-sm font-black text-gray-800 mb-3">🏆 Mais ativos</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Top por pontos */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h3 className="text-xs font-black text-gray-900">⭐ Por pontos (total)</h3>
            </div>
            <div className="divide-y divide-gray-50">
              {topPontos.length === 0 ? (
                <p className="px-4 py-5 text-xs text-gray-400 text-center">Sem dados</p>
              ) : topPontos.map((u, i) => (
                <div key={u.id} className="px-4 py-2.5 flex items-center gap-3">
                  <span className="w-6 text-center text-sm shrink-0">{MEDAL_LABELS[i]}</span>
                  <span className="flex-1 text-xs font-semibold text-gray-800 truncate">{u.nome}</span>
                  <span className="text-xs font-black text-amber-600 shrink-0">{u.pontos} pts</span>
                </div>
              ))}
            </div>
          </div>

          {/* Top por ofertas (semana) */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h3 className="text-xs font-black text-gray-900">📅 Por ofertas (7 dias)</h3>
            </div>
            <div className="divide-y divide-gray-50">
              {topSemana.length === 0 ? (
                <p className="px-4 py-5 text-xs text-gray-400 text-center">Sem atividade esta semana</p>
              ) : topSemana.map((u, i) => (
                <div key={u.id} className="px-4 py-2.5 flex items-center gap-3">
                  <span className="w-6 text-center text-sm shrink-0">{MEDAL_LABELS[i]}</span>
                  <span className="flex-1 text-xs font-semibold text-gray-800 truncate">{u.nome}</span>
                  <span className="text-xs font-black text-emerald-600 shrink-0">
                    {u.ofertasSemana ?? 0} oferta{(u.ofertasSemana ?? 0) !== 1 ? "s" : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

    </motion.div>
  );
}

// ── AnalyticsCharts ───────────────────────────────────────────────────────────

const _PIE_COLORS = ["#84cc16", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

export function AnalyticsCharts({ analytics }: { analytics: AdminAnalytics }) {
  const chartBox = "bg-white rounded-2xl border border-gray-100 shadow-sm p-5";
  const R = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const topProdutosData = (analytics.topProdutos ?? []).slice(0, 8).map((p: { produto: string; totalValidacoes: number; totalConfirmacoes: number; totalOfertas: number; avgPreco: number }) => ({
    name: p.produto.length > 18 ? p.produto.slice(0, 17) + "…" : p.produto,
    engajamento: p.totalValidacoes * 2 + p.totalConfirmacoes * 3,
    ofertas: p.totalOfertas,
  }));

  const topMercadosData = (analytics.topMercados ?? []).slice(0, 6).map((m: { mercado: string; totalEngajamento: number; totalOfertas: number }) => ({
    name: m.mercado.length > 20 ? m.mercado.slice(0, 19) + "…" : m.mercado,
    value: m.totalEngajamento,
    ofertas: m.totalOfertas,
  }));

  const categoriaData = (analytics.distribuicaoCategoria ?? []).map((c: { categoria: string; total: number; percentual: number }) => ({
    name: c.categoria,
    value: c.total,
  }));

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
      {/* Top Produtos por Engajamento */}
      {topProdutosData.length > 0 && (
        <div className={`${chartBox} sm:col-span-2`}>
          <h3 className="text-sm font-bold text-gray-700 mb-4">🏆 Top Produtos por Engajamento</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={topProdutosData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} angle={-25} textAnchor="end" height={55} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                formatter={(v: number, name: string) => [v, name === "engajamento" ? "Engajamento" : "Ofertas"]}
              />
              <Bar dataKey="engajamento" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="engajamento" />
              <Bar dataKey="ofertas" fill="#e5e7eb" radius={[4, 4, 0, 0]} name="ofertas" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top Mercados */}
      {topMercadosData.length > 0 && (
        <div className={chartBox}>
          <h3 className="text-sm font-bold text-gray-700 mb-4">🏪 Mercados mais Ativos</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={topMercadosData} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
              <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={100} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                formatter={(v: number) => [v, "Engajamento"]}
              />
              <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Distribuição por Categoria */}
      {categoriaData.length > 0 && (
        <div className={chartBox}>
          <h3 className="text-sm font-bold text-gray-700 mb-4">📦 Categorias</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={categoriaData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={65}
                label={({ name, percent }) => `${name} ${Math.round((percent ?? 0) * 100)}%`}
                labelLine={false}
              >
                {categoriaData.map((_: unknown, i: number) => (
                  <Cell key={i} fill={_PIE_COLORS[i % _PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                formatter={(v: number) => [v, "Ofertas"]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Preço médio por produto */}
      {(analytics.topProdutos ?? []).length > 0 && (
        <div className={`${chartBox} sm:col-span-2`}>
          <h3 className="text-sm font-bold text-gray-700 mb-3">💰 Preço Médio — Top Produtos</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-gray-500 font-bold uppercase tracking-wide">
                  <th className="pb-2 pr-4">Produto</th>
                  <th className="pb-2 pr-4 text-right">Preço médio</th>
                  <th className="pb-2 pr-4 text-right">Ofertas</th>
                  <th className="pb-2 text-right">Validações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(analytics.topProdutos ?? []).slice(0, 10).map((p: { produto: string; totalValidacoes: number; totalConfirmacoes: number; totalOfertas: number; avgPreco: number }) => (
                  <tr key={p.produto} className="hover:bg-gray-50">
                    <td className="py-2 pr-4 font-medium text-gray-800 truncate max-w-[160px]">{p.produto}</td>
                    <td className="py-2 pr-4 text-right font-bold text-lime-700">{R(p.avgPreco)}</td>
                    <td className="py-2 pr-4 text-right text-gray-600">{p.totalOfertas}</td>
                    <td className="py-2 text-right text-purple-600 font-semibold">{p.totalValidacoes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── PushNotificacoesTab ───────────────────────────────────────────────────────

type PushLogItem = {
  id: number;
  adminNome: string | null;
  usuarioId: number | null;
  usuarioNome: string | null;
  titulo: string;
  mensagem: string;
  link: string | null;
  status: "enviado" | "falhou" | "sem_permissao";
  subsTotal: number;
  subsOk: number;
  criadoEm: string;
};

export function PushNotificacoesTab({ usuarios }: { usuarios: AdminUsuario[] }) {
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [titulo, setTitulo] = useState("🔥 Teste de Notificação");
  const [mensagem, setMensagem] = useState("Se você recebeu, as notificações estão funcionando!");
  const [link, setLink] = useState("");
  const [respeitarFiltros, setRespeitarFiltros] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ status: string; subsTotal?: number; subsOk?: number; motivo?: string } | null>(null);
  const [logs, setLogs] = useState<PushLogItem[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const fetchLogs = async () => {
    setLogsLoading(true);
    try {
      const data = await customFetch<PushLogItem[]>("/api/admin/push/logs");
      setLogs(data);
    } catch { /* ignore */ }
    setLogsLoading(false);
  };

  useEffect(() => { void fetchLogs(); }, []);

  const handleSend = async () => {
    if (!selectedUserId || !titulo || !mensagem) return;
    setSending(true);
    setResult(null);
    try {
      const data = await customFetch<{ status: string; subsTotal?: number; subsOk?: number; motivo?: string }>(
        "/api/admin/push/enviar-teste",
        {
          method: "POST",
          body: JSON.stringify({ usuarioId: Number(selectedUserId), titulo, mensagem, link: link || undefined, respeitarFiltros }),
        },
      );
      setResult(data);
      await fetchLogs();
    } catch {
      setResult({ status: "falhou" });
    }
    setSending(false);
  };

  const STATUS_STYLE: Record<string, string> = {
    enviado:                    "bg-lime-100 text-lime-700",
    falhou:                     "bg-red-100 text-red-700",
    sem_permissao:              "bg-amber-100 text-amber-700",
    bloqueado_por_preferencias: "bg-blue-100 text-blue-700",
  };
  const STATUS_LABEL: Record<string, string> = {
    enviado:                    "✅ Enviado",
    falhou:                     "❌ Falhou",
    sem_permissao:              "⚠️ Sem permissão",
    bloqueado_por_preferencias: "🔕 Bloqueado por preferências",
  };

  return (
    <motion.div key="push" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-5 p-4">
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <h3 className="font-black text-gray-800 text-base mb-1 flex items-center gap-2">
          📢 Teste de Notificações
        </h3>
        <p className="text-xs text-gray-400 mb-4">
          Envia uma notificação push real para um usuário específico.
          O usuário deve ter autorizado notificações no app (ícone 🔔 no perfil).
        </p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Usuário</label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-lime-400"
            >
              <option value="">— Selecionar usuário —</option>
              {usuarios.filter((u) => !u.bloqueado).map((u) => (
                <option key={u.id} value={u.id}>{u.nome} (ID {u.id})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Título</label>
            <input
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              maxLength={100}
              placeholder="Ex: 🔥 Oferta especial!"
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-lime-400"
            />
            <p className="text-[10px] text-gray-400 mt-0.5">
              O nome do app aparece automaticamente como remetente — não precisa repetir no título.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Mensagem</label>
            <textarea
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              maxLength={300}
              rows={3}
              placeholder="Texto da notificação..."
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-lime-400"
            />
            <p className="text-[10px] text-gray-400 mt-0.5 text-right">{mensagem.length}/300</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Link interno <span className="font-normal text-gray-400">(opcional)</span></label>
            <input
              type="text"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="/ofertas"
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-lime-400"
            />
            <p className="text-[10px] text-gray-400 mt-1">
              Ex: <code>/ofertas</code> · <code>/perfil</code> · <code>/recompensas</code> — ao tocar na notificação o app abre nessa página.
            </p>
          </div>

          {/* Respeitar filtros toggle */}
          <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer select-none">
            <input
              type="checkbox"
              checked={respeitarFiltros}
              onChange={e => setRespeitarFiltros(e.target.checked)}
              className="w-4 h-4 accent-lime-500 rounded"
            />
            <div>
              <p className="text-sm font-bold text-gray-700">Respeitar preferências do usuário</p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Se ativado, não envia durante horário silencioso ou se o usuário desligou as notificações.
              </p>
            </div>
          </label>

          <button
            onClick={() => void handleSend()}
            disabled={!selectedUserId || !titulo || !mensagem || sending}
            className="w-full bg-lime-400 text-lime-900 font-black text-sm py-3 rounded-xl disabled:opacity-40 active:scale-[0.98] transition-all"
          >
            {sending ? "⏳ Enviando..." : "📨 Enviar teste"}
          </button>

          {result && (
            <div className={`rounded-xl px-4 py-3 text-sm font-bold ${STATUS_STYLE[result.status] ?? "bg-gray-100 text-gray-600"}`}>
              {STATUS_LABEL[result.status] ?? result.status}
              {result.status === "sem_permissao" && (
                <p className="font-normal text-xs mt-1 opacity-80">
                  Usuário ainda não permitiu notificações. Peça para ele abrir o app, ir ao perfil e tocar em "Ativar notificações".
                </p>
              )}
              {result.status === "bloqueado_por_preferencias" && result.motivo && (
                <p className="font-normal text-xs mt-1 opacity-80">{result.motivo}</p>
              )}
              {result.subsTotal != null && result.status !== "sem_permissao" && result.status !== "bloqueado_por_preferencias" && (
                <p className="font-normal text-xs mt-1 opacity-80">
                  {result.subsOk}/{result.subsTotal} dispositivo(s) recebeu(ram) a notificação.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-black text-gray-800 text-sm">📋 Histórico de envios</h3>
          <button onClick={() => void fetchLogs()} className="text-xs text-lime-600 font-bold hover:underline">
            ↻ Atualizar
          </button>
        </div>
        {logsLoading ? (
          <p className="text-xs text-gray-400 text-center py-6">Carregando...</p>
        ) : logs.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-6">Nenhum envio registrado ainda.</p>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <div key={log.id} className="flex items-start gap-3 p-3 rounded-xl bg-gray-50">
                <span className={`text-[10px] font-black px-2 py-1 rounded-full shrink-0 mt-0.5 ${STATUS_STYLE[log.status] ?? "bg-gray-100 text-gray-500"}`}>
                  {STATUS_LABEL[log.status] ?? log.status}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-gray-800 truncate">{log.titulo}</p>
                  <p className="text-[11px] text-gray-500 truncate">{log.mensagem}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    👤 {log.usuarioNome ?? `ID ${log.usuarioId}`}
                    {log.status === "enviado" && ` · ${log.subsOk}/${log.subsTotal} disp.`}
                    {" · "}{new Date(log.criadoEm).toLocaleString("pt-BR")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── ModeracaoTab ──────────────────────────────────────────────────────────────

interface OfertaSuspeita {
  id: number;
  produto: string;
  preco: number;
  mercado: string;
  cidade: string | null;
  bairro: string | null;
  categoria: string | null;
  hasFoto: boolean;
  validade: string | null;
  dataCriacao: string;
  denuncias: number;
  status: string;
  usuarioId: number | null;
  usuario: string;
  score: number;
  motivosSuspeita: string[];
  visivelFeed: boolean;
  motivoBloqueio: string | null;
}

const MOTIVO_COR: Record<string, { bg: string; text: string }> = {
  "Marcada como suspeita":        { bg: "bg-amber-100",  text: "text-amber-800"  },
  "denúncia":                     { bg: "bg-red-100",    text: "text-red-700"    },
  "Preço muito baixo":            { bg: "bg-orange-100", text: "text-orange-800" },
  "Preço muito alto":             { bg: "bg-orange-100", text: "text-orange-800" },
  "Produto vazio/genérico":       { bg: "bg-gray-100",   text: "text-gray-700"   },
  "Mercado não informado":        { bg: "bg-gray-100",   text: "text-gray-700"   },
  "Sem foto":                     { bg: "bg-slate-100",  text: "text-slate-600"  },
  "Ativa há":                     { bg: "bg-blue-100",   text: "text-blue-700"   },
};

function motivoCor(motivo: string) {
  for (const key of Object.keys(MOTIVO_COR)) {
    if (motivo.startsWith(key)) return MOTIVO_COR[key]!;
  }
  return { bg: "bg-gray-100", text: "text-gray-600" };
}

const R_BRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function OfertaSuspeitaCard({
  oferta,
  onAction,
}: {
  oferta: OfertaSuspeita;
  onAction: (id: number, acao: "aprovar" | "verificada" | "ocultar" | "excluir") => void;
}) {
  const [confirmando, setConfirmando] = useState<"excluir" | null>(null);
  const diasPublicada = Math.floor((Date.now() - new Date(oferta.dataCriacao).getTime()) / 86400000);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header com motivos */}
      <div className="px-4 pt-3 pb-2 border-b border-gray-50 flex flex-wrap gap-1.5 items-center">
        {oferta.motivosSuspeita.map((m) => {
          const { bg, text } = motivoCor(m);
          return (
            <span key={m} className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${bg} ${text}`}>
              {m}
            </span>
          );
        })}
        <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
          oferta.visivelFeed ? "bg-lime-100 text-lime-700" : "bg-red-100 text-red-600"
        }`}>
          {oferta.visivelFeed ? "🟢 Visível no feed" : `🔴 ${oferta.motivoBloqueio ?? "Oculta"}`}
        </span>
      </div>

      {/* Conteúdo principal */}
      <div className="px-4 py-3 flex gap-3 items-start">
        {/* Foto placeholder */}
        <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-2xl shrink-0 ${
          oferta.hasFoto ? "bg-lime-50 border border-lime-100" : "bg-gray-100 border border-gray-200"
        }`} title={oferta.hasFoto ? "Tem foto" : "Sem foto"}>
          {oferta.hasFoto ? "📷" : "🚫"}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div>
              <p className="font-black text-gray-900 text-sm leading-tight">
                {oferta.produto || <span className="italic text-gray-400">Produto não informado</span>}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {oferta.mercado || <span className="italic text-gray-400">Mercado não informado</span>}
                {oferta.cidade ? ` · ${oferta.cidade}` : ""}
              </p>
            </div>
            <p className="text-lg font-black text-lime-700 shrink-0">{R_BRL(oferta.preco)}</p>
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-gray-400 mt-1">
            <span>👤 {oferta.usuario}</span>
            <span>📅 {new Date(oferta.dataCriacao).toLocaleDateString("pt-BR")} ({diasPublicada}d)</span>
            {oferta.denuncias > 0 && (
              <span className="text-red-500 font-bold">🚨 {oferta.denuncias} denúncia{oferta.denuncias !== 1 ? "s" : ""}</span>
            )}
            {oferta.categoria && <span>🏷 {oferta.categoria}</span>}
          </div>
        </div>
      </div>

      {/* Ações */}
      <div className="px-4 pb-3 flex gap-2 flex-wrap">
        <button
          onClick={() => onAction(oferta.id, "aprovar")}
          className="text-xs font-bold px-3 py-1.5 rounded-xl bg-lime-50 text-lime-700 hover:bg-lime-100 border border-lime-200 transition-colors"
        >
          ✅ Aprovar
        </button>
        <button
          onClick={() => onAction(oferta.id, "verificada")}
          className="text-xs font-bold px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors"
          title="Limpa denúncias e aprova a oferta"
        >
          🔍 Verificada
        </button>
        <button
          onClick={() => onAction(oferta.id, "ocultar")}
          className="text-xs font-bold px-3 py-1.5 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200 transition-colors"
        >
          📁 Ocultar
        </button>
        {confirmando === "excluir" ? (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-red-600 font-bold">Confirmar?</span>
            <button
              onClick={() => { onAction(oferta.id, "excluir"); setConfirmando(null); }}
              className="text-xs font-bold px-2 py-1 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
            >
              Sim, excluir
            </button>
            <button
              onClick={() => setConfirmando(null)}
              className="text-xs font-bold px-2 py-1 rounded-lg bg-gray-200 text-gray-600 hover:bg-gray-300 transition-colors"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmando("excluir")}
            className="text-xs font-bold px-3 py-1.5 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 transition-colors"
          >
            🗑 Excluir
          </button>
        )}
      </div>
    </div>
  );
}

export function ModeracaoTab() {
  const [items, setItems] = useState<OfertaSuspeita[]>([]);
  const [loading, setLoading] = useState(true);
  const [processando, setProcessando] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = async () => {
    setLoading(true);
    setErro(null);
    try {
      const data = await customFetch<{ items: OfertaSuspeita[]; total: number }>("/api/admin/moderacao/suspeitas");
      setItems(data.items ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar ofertas suspeitas.");
    }
    setLoading(false);
  };

  useEffect(() => { void carregar(); }, []);

  const handleAction = async (id: number, acao: "aprovar" | "verificada" | "ocultar" | "excluir") => {
    setProcessando(id);
    try {
      const endpointMap = {
        aprovar:    { url: `/api/admin/ofertas/${id}/ativar`,    method: "POST" },
        verificada: { url: `/api/ofertas/${id}/resetar-denuncias`, method: "POST" },
        ocultar:    { url: `/api/admin/ofertas/${id}/arquivar`,  method: "POST" },
        excluir:    { url: `/api/admin/ofertas/${id}`,           method: "DELETE" },
      };
      const { url, method } = endpointMap[acao];
      await customFetch(url, { method });
      // Optimistic: remove from list
      setItems((prev) => prev.filter((o) => o.id !== id));
    } catch (e) {
      // Silently keep the item in list; user can retry
      console.error("Ação falhou:", e);
    }
    setProcessando(null);
  };

  const totalPorMotivo = items.reduce((acc: Record<string, number>, o) => {
    for (const m of o.motivosSuspeita) {
      const key = m.includes("denúncia") ? "Denúncias" : m.includes("dias") ? "Tempo expirado" : m;
      acc[key] = (acc[key] ?? 0) + 1;
    }
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-36 rounded-2xl bg-gray-100 animate-pulse" />
        ))}
      </div>
    );
  }

  if (erro) {
    return (
      <div className="flex flex-col items-center py-16 gap-3 text-center">
        <p className="text-3xl">⚠️</p>
        <p className="text-sm font-bold text-gray-700">{erro}</p>
        <button onClick={() => void carregar()} className="text-xs font-bold px-4 py-2 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200">
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">

      {/* ── Cabeçalho ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-base font-black text-gray-800">
            🔎 Moderação de Ofertas
            {items.length > 0 && (
              <span className="ml-2 text-xs font-black bg-red-500 text-white px-2 py-0.5 rounded-full align-middle">
                {items.length}
              </span>
            )}
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Revisão manual — nenhuma ação é automática. Aprovação não altera o feed sem ação explícita.
          </p>
        </div>
        <button
          onClick={() => void carregar()}
          className="text-xs font-bold px-3 py-1.5 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
        >
          🔄 Recarregar
        </button>
      </div>

      {/* ── Resumo por motivo ── */}
      {Object.keys(totalPorMotivo).length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {Object.entries(totalPorMotivo).map(([motivo, qtd]) => (
            <div key={motivo} className="bg-white rounded-xl border border-gray-100 px-3 py-2 flex items-center gap-2">
              <span className="text-lg font-black text-gray-800 shrink-0">{qtd}</span>
              <span className="text-[11px] text-gray-500 leading-tight">{motivo}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Lista de ofertas ── */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-3 text-center">
          <p className="text-4xl">✅</p>
          <p className="text-sm font-bold text-gray-700">Nenhuma oferta suspeita encontrada</p>
          <p className="text-xs text-gray-400">O sistema não detectou critérios de suspeita nas ofertas ativas.</p>
        </div>
      ) : (
        <div className={`space-y-3 ${processando !== null ? "pointer-events-none opacity-75" : ""}`}>
          {items.map((o) => (
            <OfertaSuspeitaCard key={o.id} oferta={o} onAction={handleAction} />
          ))}
        </div>
      )}

    </motion.div>
  );
}
