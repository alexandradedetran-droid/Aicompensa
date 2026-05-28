import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { toast } from "@/hooks/use-toast";
import {
  useGetAdminOfertas,
  useGetAdminUsuarios,
  useGetAdminStats,
  useDeleteOferta,
  useDestacarOferta,
  usePatrocinarOferta,
  useResetarDenunciasOferta,
  useBloquearUsuario,
  getGetAdminOfertasQueryKey,
  getGetAdminUsuariosQueryKey,
  getGetAdminStatsQueryKey,
  setExtraHeaders,
  type AdminOferta,
  type AdminUsuario,
} from "@workspace/api-client-react";
import { isAdminLogado, getAdminToken, clearAdminSession } from "@/lib/admin-auth";
import { cn } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

// Inject admin token synchronously before hooks fire so every query/mutation
// includes the x-admin-token header automatically.
const _token = typeof window !== "undefined" ? getAdminToken() : null;
if (_token) setExtraHeaders({ "x-admin-token": _token });

const R = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const NIVEL_EMOJI: Record<string, string> = {
  // Current levels
  Iniciante: "🌱", Explorador: "🔍", Caçador: "🎯",
  Especialista: "⭐", Mestre: "🏆", Lenda: "💎",
  // Legacy fallbacks
  Bronze: "🟤", Prata: "⚪", Ouro: "🟡", Diamante: "💎",
};

const PIE_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];
const BAR_COLOR = "#10b981";

type Tab = "ofertas" | "denuncias" | "usuarios" | "stats";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "ofertas",   label: "Ofertas",     icon: "🛒" },
  { id: "denuncias", label: "Denúncias",   icon: "🚨" },
  { id: "usuarios",  label: "Usuários",    icon: "👥" },
  { id: "stats",     label: "Estatísticas",icon: "📊" },
];

export default function Admin() {
  const [tab, setTab] = useState<Tab>("ofertas");
  const [, setLocation] = useLocation();
  const qc = useQueryClient();

  const logado = isAdminLogado();

  useEffect(() => {
    if (!logado) setLocation("/admin-login");
  }, [logado, setLocation]);

  const { data: ofertas = [], isLoading: loadingOfertas } = useGetAdminOfertas({
    query: { queryKey: getGetAdminOfertasQueryKey(), enabled: logado },
  });
  const { data: usuarios = [], isLoading: loadingUsuarios } = useGetAdminUsuarios({
    query: { queryKey: getGetAdminUsuariosQueryKey(), enabled: logado },
  });
  const { data: stats, isLoading: loadingStats } = useGetAdminStats({
    query: { queryKey: getGetAdminStatsQueryKey(), enabled: logado },
  });

  function handleLogout() {
    clearAdminSession();
    setLocation("/admin-login");
  }

  if (!logado) return null;

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: getGetAdminOfertasQueryKey() });
    qc.invalidateQueries({ queryKey: getGetAdminUsuariosQueryKey() });
    qc.invalidateQueries({ queryKey: getGetAdminStatsQueryKey() });
  };

  const { mutate: deleteOferta } = useDeleteOferta({
    mutation: {
      onSuccess: () => { toast({ title: "Oferta removida" }); invalidateAll(); },
      onError: () => toast({ title: "Erro ao remover", variant: "destructive" }),
    },
  });

  const { mutate: destacar } = useDestacarOferta({
    mutation: {
      onSuccess: (data: AdminOferta) => {
        toast({ title: data.destacada ? "⭐ Oferta destacada!" : "Destaque removido" });
        invalidateAll();
      },
      onError: () => toast({ title: "Erro", variant: "destructive" }),
    },
  });

  const { mutate: patrocinar } = usePatrocinarOferta({
    mutation: {
      onSuccess: (data: AdminOferta) => {
        toast({ title: data.patrocinada ? "💰 Oferta patrocinada!" : "Patrocínio removido" });
        invalidateAll();
      },
      onError: () => toast({ title: "Erro", variant: "destructive" }),
    },
  });

  const { mutate: resetarDenuncias } = useResetarDenunciasOferta({
    mutation: {
      onSuccess: () => { toast({ title: "✔ Denúncias zeradas" }); invalidateAll(); },
      onError: () => toast({ title: "Erro", variant: "destructive" }),
    },
  });

  const { mutate: bloquear } = useBloquearUsuario({
    mutation: {
      onSuccess: (data: AdminUsuario) => {
        toast({ title: data.bloqueado ? "🚫 Usuário bloqueado" : "✅ Usuário desbloqueado" });
        invalidateAll();
      },
      onError: () => toast({ title: "Erro", variant: "destructive" }),
    },
  });

  const denunciadas = ofertas.filter((o: AdminOferta) => o.denuncias >= 1);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🛡️</span>
            <h1 className="text-lg font-black text-gray-900">Painel Admin</h1>
            <span className="text-[10px] font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">ADMIN</span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setLocation("/")} className="text-xs text-gray-500 hover:text-gray-800 transition-colors">← Voltar ao app</button>
            <button
              onClick={handleLogout}
              className="text-xs font-bold px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
            >
              Sair
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-5xl mx-auto px-4 flex gap-1 pb-0">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors",
                tab === t.id
                  ? "border-primary text-primary"
                  : "border-transparent text-gray-500 hover:text-gray-800"
              )}
            >
              <span>{t.icon}</span>
              <span className="hidden sm:inline">{t.label}</span>
              {t.id === "denuncias" && denunciadas.length > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full leading-none">
                  {denunciadas.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        <AnimatePresence mode="wait">
          {/* ── ABA OFERTAS ── */}
          {tab === "ofertas" && (
            <motion.div key="ofertas" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-gray-800">Todas as Ofertas ({ofertas.length})</h2>
              </div>
              {loadingOfertas ? (
                <LoadingSkeleton />
              ) : ofertas.length === 0 ? (
                <EmptyState msg="Nenhuma oferta cadastrada." />
              ) : (
                <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">
                        <th className="px-4 py-3">Produto</th>
                        <th className="px-4 py-3">Mercado / Cidade</th>
                        <th className="px-4 py-3 text-right">Preço</th>
                        <th className="px-4 py-3 text-center">Score</th>
                        <th className="px-4 py-3 text-center">Denúncias</th>
                        <th className="px-4 py-3 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {ofertas.map((o: AdminOferta) => (
                        <tr
                          key={o.id}
                          className={cn(
                            "hover:bg-gray-50 transition-colors",
                            o.denuncias >= 3 && "bg-red-50",
                            o.destacada && "bg-yellow-50/60",
                            o.patrocinada && "bg-blue-50/60",
                          )}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {o.fotoUrl ? (
                                <img src={o.fotoUrl} alt={o.produto} className="w-10 h-10 rounded-lg object-cover shrink-0" />
                              ) : (
                                <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-lg shrink-0">🛒</div>
                              )}
                              <div>
                                <p className="font-semibold text-gray-900 line-clamp-1">{o.produto}</p>
                                <div className="flex gap-1 mt-0.5">
                                  {o.destacada && <span className="text-[10px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded font-bold">⭐ Destaque</span>}
                                  {o.patrocinada && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold">💰 Patrocinada</span>}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-600">
                            <p className="font-medium">{o.mercado}</p>
                            <p className="text-xs text-gray-400">{o.cidade}</p>
                          </td>
                          <td className="px-4 py-3 text-right font-black text-emerald-700">{R(o.preco)}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={cn(
                              "text-xs font-bold px-2 py-0.5 rounded-full",
                              o.score >= 10 ? "bg-emerald-100 text-emerald-700" :
                              o.score >= 0  ? "bg-amber-100 text-amber-700" :
                              "bg-red-100 text-red-700"
                            )}>
                              ⭐ {o.score}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={cn(
                              "text-xs font-bold px-2 py-0.5 rounded-full",
                              o.denuncias === 0 ? "bg-gray-100 text-gray-400" :
                              o.denuncias < 3  ? "bg-orange-100 text-orange-700" :
                              "bg-red-100 text-red-700"
                            )}>
                              {o.denuncias === 0 ? "—" : `🚨 ${o.denuncias}`}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-1 flex-wrap">
                              <ActionBtn
                                onClick={() => destacar({ id: o.id })}
                                active={o.destacada}
                                activeLabel="⭐ Destacado"
                                inactiveLabel="⭐ Destacar"
                                activeClass="bg-yellow-100 text-yellow-700 hover:bg-yellow-200"
                                inactiveClass="bg-gray-100 text-gray-600 hover:bg-gray-200"
                              />
                              <ActionBtn
                                onClick={() => patrocinar({ id: o.id })}
                                active={o.patrocinada}
                                activeLabel="💰 Patroc."
                                inactiveLabel="💰 Patroc."
                                activeClass="bg-blue-100 text-blue-700 hover:bg-blue-200"
                                inactiveClass="bg-gray-100 text-gray-600 hover:bg-gray-200"
                              />
                              <button
                                onClick={() => {
                                  if (confirm(`Excluir "${o.produto}"?`))
                                    deleteOferta({ id: o.id });
                                }}
                                className="text-xs font-bold px-2 py-1 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                              >
                                ❌ Excluir
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </motion.div>
          )}

          {/* ── ABA DENÚNCIAS ── */}
          {tab === "denuncias" && (
            <motion.div key="denuncias" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-gray-800">
                  Ofertas Denunciadas
                  {denunciadas.length > 0 && (
                    <span className="ml-2 bg-red-500 text-white text-xs font-black px-2 py-0.5 rounded-full">{denunciadas.length}</span>
                  )}
                </h2>
              </div>
              {loadingOfertas ? (
                <LoadingSkeleton />
              ) : denunciadas.length === 0 ? (
                <EmptyState msg="Nenhuma denúncia registrada. 🎉" />
              ) : (
                <div className="space-y-3">
                  {denunciadas
                    .sort((a: AdminOferta, b: AdminOferta) => b.denuncias - a.denuncias)
                    .map((o: AdminOferta) => (
                      <div
                        key={o.id}
                        className={cn(
                          "bg-white rounded-xl border p-4 shadow-sm flex items-center gap-4",
                          o.denuncias >= 3 ? "border-red-300 bg-red-50/50" : "border-orange-200 bg-orange-50/30"
                        )}
                      >
                        {o.fotoUrl ? (
                          <img src={o.fotoUrl} alt={o.produto} className="w-14 h-14 rounded-xl object-cover shrink-0" />
                        ) : (
                          <div className="w-14 h-14 rounded-xl bg-gray-100 flex items-center justify-center text-2xl shrink-0">🛒</div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={cn(
                              "text-xs font-black px-2 py-0.5 rounded-full",
                              o.denuncias >= 3 ? "bg-red-200 text-red-800" : "bg-orange-200 text-orange-800"
                            )}>
                              🚨 {o.denuncias} {o.denuncias === 1 ? "denúncia" : "denúncias"}
                            </span>
                            <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                              ⭐ {o.score} Confiança
                            </span>
                          </div>
                          <p className="font-bold text-gray-900 line-clamp-1">{o.produto}</p>
                          <p className="text-sm text-gray-500">{o.mercado} · {o.cidade} · {R(o.preco)}</p>
                          <p className="text-xs text-gray-400">por {NIVEL_EMOJI[o.nivelUsuario]} {o.usuario}</p>
                        </div>
                        <div className="flex flex-col gap-2 shrink-0">
                          <button
                            onClick={() => resetarDenuncias({ id: o.id })}
                            className="text-xs font-bold px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                          >
                            ✔ Marcar válida
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Remover "${o.produto}"?`))
                                deleteOferta({ id: o.id });
                            }}
                            className="text-xs font-bold px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                          >
                            ❌ Remover
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ── ABA USUÁRIOS ── */}
          {tab === "usuarios" && (
            <motion.div key="usuarios" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-gray-800">Usuários ({usuarios.length})</h2>
              </div>
              {loadingUsuarios ? (
                <LoadingSkeleton />
              ) : usuarios.length === 0 ? (
                <EmptyState msg="Nenhum usuário cadastrado." />
              ) : (
                <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">
                        <th className="px-4 py-3">Usuário</th>
                        <th className="px-4 py-3 text-center">Nível</th>
                        <th className="px-4 py-3 text-center">Pontos</th>
                        <th className="px-4 py-3 text-center">Ofertas</th>
                        <th className="px-4 py-3 text-center">Status</th>
                        <th className="px-4 py-3 text-center">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {usuarios
                        .slice()
                        .sort((a: AdminUsuario, b: AdminUsuario) => b.pontos - a.pontos)
                        .map((u: AdminUsuario) => (
                          <tr
                            key={u.id}
                            className={cn("hover:bg-gray-50 transition-colors", u.bloqueado && "opacity-50 bg-gray-100")}
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-black text-primary">
                                  {u.nome[0]?.toUpperCase()}
                                </div>
                                <span className="font-semibold text-gray-900">{u.nome}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="font-bold">{NIVEL_EMOJI[u.nivel]} {u.nivel}</span>
                            </td>
                            <td className="px-4 py-3 text-center font-bold text-amber-700">{u.pontos}</td>
                            <td className="px-4 py-3 text-center text-gray-600">{u.totalOfertas}</td>
                            <td className="px-4 py-3 text-center">
                              <span className={cn(
                                "text-xs font-bold px-2 py-0.5 rounded-full",
                                u.bloqueado ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
                              )}>
                                {u.bloqueado ? "🚫 Bloqueado" : "✅ Ativo"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button
                                onClick={() => bloquear({ id: u.id })}
                                className={cn(
                                  "text-xs font-bold px-3 py-1 rounded-lg transition-colors",
                                  u.bloqueado
                                    ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                    : "bg-red-50 text-red-600 hover:bg-red-100"
                                )}
                              >
                                {u.bloqueado ? "✅ Desbloquear" : "🚫 Bloquear"}
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </motion.div>
          )}

          {/* ── ABA ESTATÍSTICAS ── */}
          {tab === "stats" && (
            <motion.div key="stats" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
              <h2 className="text-base font-bold text-gray-800">Estatísticas do App</h2>

              {/* KPI Cards */}
              {loadingStats || !stats ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-28 rounded-2xl bg-gray-100 animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <StatCard emoji="🛒" label="Total de Ofertas" value={stats.totalOfertas} color="emerald" />
                  <StatCard emoji="📅" label="Ofertas Hoje" value={stats.ofertasHoje} color="blue" />
                  <StatCard emoji="✅" label="Confirmadas Hoje" value={stats.confirmadosHoje} color="green" />
                  <StatCard emoji="🚨" label="Total de Denúncias" value={stats.totalDenuncias} color="red" />
                  <StatCard emoji="👍" label="Total de Validações" value={stats.totalValidacoes} color="purple" />
                  <StatCard emoji="👥" label="Total de Usuários" value={stats.totalUsuarios} color="amber" />
                </div>
              )}

              {/* Charts — computed from loaded offers */}
              {!loadingOfertas && ofertas.length > 0 && (
                <AdminCharts ofertas={ofertas} usuarios={usuarios} />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function AdminCharts({ ofertas, usuarios }: { ofertas: AdminOferta[]; usuarios: AdminUsuario[] }) {
  const byCategoria = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of ofertas) {
      map.set(o.categoria, (map.get(o.categoria) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [ofertas]);

  const byStatus = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of ofertas) {
      const label = o.status === "nova" ? "Nova" : o.status === "validada" ? "Validada" : "Expirada";
      map.set(label, (map.get(label) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [ofertas]);

  const byMercado = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of ofertas) {
      map.set(o.mercado, (map.get(o.mercado) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [ofertas]);

  const byNivel = useMemo(() => {
    const order = ["Iniciante", "Explorador", "Caçador", "Especialista", "Mestre", "Lenda"];
    const map = new Map<string, number>();
    for (const u of usuarios) {
      const label = u.nivel ?? "Iniciante";
      map.set(label, (map.get(label) ?? 0) + 1);
    }
    return order
      .filter((n) => map.has(n))
      .map((name) => ({ name, value: map.get(name) ?? 0 }));
  }, [usuarios]);

  const chartBox = "bg-white rounded-2xl border border-gray-100 shadow-sm p-5";

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
      {/* Ofertas por Categoria */}
      <div className={chartBox}>
        <h3 className="text-sm font-bold text-gray-700 mb-4">Ofertas por Categoria</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={byCategoria} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={50} />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
              formatter={(v: number) => [v, "Ofertas"]}
            />
            <Bar dataKey="value" fill={BAR_COLOR} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Status das Ofertas */}
      <div className={chartBox}>
        <h3 className="text-sm font-bold text-gray-700 mb-4">Status das Ofertas</h3>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={byStatus}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={70}
              label={({ name, percent }) => `${name} ${Math.round((percent ?? 0) * 100)}%`}
              labelLine={false}
            >
              {byStatus.map((_, i) => (
                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
              formatter={(v: number) => [v, "ofertas"]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Mercados mais ativos */}
      <div className={chartBox}>
        <h3 className="text-sm font-bold text-gray-700 mb-4">Mercados mais Ativos</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={byMercado} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
            <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
              formatter={(v: number) => [v, "Ofertas"]}
            />
            <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Usuários por Nível */}
      {byNivel.length > 0 && (
        <div className={chartBox}>
          <h3 className="text-sm font-bold text-gray-700 mb-4">Usuários por Nível</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={byNivel} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                formatter={(v: number) => [v, "Usuários"]}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {byNivel.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function ActionBtn({
  onClick,
  active,
  activeLabel,
  inactiveLabel,
  activeClass,
  inactiveClass,
}: {
  onClick: () => void;
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
  activeClass: string;
  inactiveClass: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn("text-xs font-bold px-2 py-1 rounded-lg transition-colors", active ? activeClass : inactiveClass)}
    >
      {active ? activeLabel : inactiveLabel}
    </button>
  );
}

function StatCard({
  emoji,
  label,
  value,
  color,
}: {
  emoji: string;
  label: string;
  value: number;
  color: string;
}) {
  const colors: Record<string, string> = {
    emerald: "bg-emerald-50 border-emerald-100",
    blue:    "bg-blue-50 border-blue-100",
    green:   "bg-green-50 border-green-100",
    red:     "bg-red-50 border-red-100",
    purple:  "bg-purple-50 border-purple-100",
    amber:   "bg-amber-50 border-amber-100",
  };
  const textColors: Record<string, string> = {
    emerald: "text-emerald-700",
    blue:    "text-blue-700",
    green:   "text-green-700",
    red:     "text-red-700",
    purple:  "text-purple-700",
    amber:   "text-amber-700",
  };

  return (
    <div className={cn("rounded-2xl border p-5 flex flex-col gap-1", colors[color] ?? "bg-gray-50 border-gray-100")}>
      <span className="text-2xl">{emoji}</span>
      <span className={cn("text-3xl font-black leading-none", textColors[color] ?? "text-gray-700")}>{value.toLocaleString("pt-BR")}</span>
      <span className="text-xs text-gray-500 font-medium leading-snug">{label}</span>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-16 rounded-xl bg-gray-100 animate-pulse" />
      ))}
    </div>
  );
}

function EmptyState({ msg }: { msg: string }) {
  return (
    <div className="text-center py-16 text-gray-400">
      <p className="text-4xl mb-3">📭</p>
      <p className="text-sm font-medium">{msg}</p>
    </div>
  );
}
