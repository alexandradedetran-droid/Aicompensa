import { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { toast } from "@/hooks/use-toast";
import {
  customFetch,
  getAdminOfertasPaged,
  getAdminUsuariosPaged,
  useGetAdminStats,
  useGetAdminAnalytics,
  useGetAdminValidacao,
  useAprovarValidacao,
  useRecusarValidacao,
  useDeleteOferta,
  useDestacarOferta,
  usePatrocinarOferta,
  useResetarDenunciasOferta,
  useAtivarOferta,
  useArquivarOferta,
  useMarcarOfertaSuspeita,
  useBloquearUsuario,
  useSuspenderUsuario,
  useDeleteAdminUsuario,
  useGetAdminLogs,
  getGetAdminStatsQueryKey,
  getGetAdminAnalyticsQueryKey,
  getGetAdminValidacaoQueryKey,
  getGetAdminLogsQueryKey,
  setExtraHeaders,
  useGetAdminMercadosPatrocinados,
  useCreateMercadoPatrocinado,
  useUpdateMercadoPatrocinado,
  useDeleteMercadoPatrocinado,
  useUpdateMercadoPatrocinadoStatus,
  useExtenderMercadoPatrocinado,
  useGetComercialAnalytics,
  getGetAdminMercadosPatrocinadosQueryKey,
  useGetAdminFundadores,
  useCreateAdminFundador,
  useDeleteAdminFundador,
  useGetAdminFundadoresElegiveis,
  getGetAdminFundadoresQueryKey,
  getGetAdminFundadoresElegiveisQueryKey,
  useGetAdminAuditoriaMetricas,
  getGetAdminAuditoriaMetricasQueryKey,
  getGetAdminOfertasQueryKey,
  usePostAdminOfertasIdAnalisarIa,
  usePostAdminOfertasAnalisarIaLote,
  usePatchAdminOfertasIdAplicarCorrecao,
  type AdminOferta,
  type AdminOfertaAudit,
  type AdminOfertaPage,
  type AdminUsuarioPage,
  type AuditoriaMetricas,
  type AdminUsuario,
  type AdminAnalytics,
  type AdminLog,
  type MercadoPatrocinado,
  type CreateMercadoPatrocinadoBody,
  type ComercialAnalytics,
  type AdminFundador,
  type FundadorElegivel,
} from "@workspace/api-client-react";
import { isAdminLogado, getAdminToken, clearAdminSession } from "@/lib/admin-auth";
import AdminRecompensasTab from "./admin-recompensas";
import AdminProdutosTab from "./admin-produtos";
import SorteioAdminTab from "./admin-sorteio";
import {
  DashboardRealtimeTab,
  AnalyticsAvancadoTab,
  AntiFraudTab,
  IndicacoesTab,
  ViralTab,
  GamificacaoTab,
  FeedControleTab,
  CrescimentoTab,
  AnalyticsCharts,
  PushNotificacoesTab,
  ModeracaoTab,
} from "./admin-modules";
import { getCurrentUser } from "@/lib/current-user";
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

// Inject admin credentials synchronously before hooks fire.
// Super admin: uses their Bearer token (set globally by setAuthTokenGetter in App.tsx).
// Classic admin: uses x-admin-token header from env-based login.
const _token = typeof window !== "undefined" ? getAdminToken() : null;
if (_token) setExtraHeaders({ "x-admin-token": _token });

const R = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const NIVEL_EMOJI: Record<string, string> = {
  "Estagiário da Economia":    "🎒",
  "Assistente de Ofertas":     "🔎",
  "Bacharel das Compras":      "🎓",
  "Especialista das Gôndolas": "🏪",
  "Mestre das Pechinchas":     "💰",
  "Doutor da Economia":        "🔬",
  "PhD do Supermercado":       "🏆",
};

const PIE_COLORS = ["#84cc16", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];
const BAR_COLOR = "#84cc16";

type Tab =
  | "dashboard" | "ofertas" | "denuncias" | "usuarios" | "stats" | "analytics"
  | "analytics-avancado" | "mercados" | "validacao" | "recompensas" | "sorteios"
  | "logs" | "dicionario" | "fundadores" | "push"
  | "antifraud" | "indicacoes" | "gamificacao" | "viral" | "feed" | "crescimento" | "moderacao"
  | "produtos";

const TAB_MAP: Record<Tab, { label: string; icon: string }> = {
  dashboard:            { label: "Dashboard",     icon: "📊" },
  stats:                { label: "Estatísticas",  icon: "📈" },
  "analytics-avancado": { label: "Analytics+",   icon: "🔭" },
  crescimento:          { label: "Crescimento",   icon: "📈" },
  indicacoes:           { label: "Indicações",    icon: "🔗" },
  viral:                { label: "Viral",         icon: "🚀" },
  usuarios:             { label: "Usuários",      icon: "👥" },
  fundadores:           { label: "Fundadores",    icon: "🏆" },
  gamificacao:          { label: "Gamificação",   icon: "🎮" },
  recompensas:          { label: "Recompensas",   icon: "🎁" },
  sorteios:             { label: "Sorteios",      icon: "🎲" },
  ofertas:              { label: "Ofertas",       icon: "🛒" },
  moderacao:            { label: "Moderação",     icon: "🔎" },
  denuncias:            { label: "Denúncias",     icon: "🚨" },
  validacao:            { label: "Validação",     icon: "🔍" },
  mercados:             { label: "Mercados",      icon: "🏪" },
  produtos:             { label: "Produtos",      icon: "📦" },
  feed:                 { label: "Feed",          icon: "📱" },
  antifraud:            { label: "Anti-fraude",   icon: "🛡️" },
  push:                 { label: "Notificações",  icon: "🔔" },
  analytics:            { label: "Analytics",     icon: "📉" },
  dicionario:           { label: "Dicionário",    icon: "📚" },
  logs:                 { label: "Logs",          icon: "📋" },
};

const SIDEBAR_GROUPS: { label: string; items: Tab[] }[] = [
  { label: "Visão Geral",  items: ["dashboard", "stats", "analytics-avancado"] },
  { label: "Crescimento",  items: ["crescimento", "indicacoes"] },
  { label: "Comunidade",   items: ["usuarios", "fundadores", "recompensas", "sorteios"] },
  { label: "Operações",    items: ["ofertas", "moderacao", "denuncias", "validacao", "mercados", "produtos"] },
  { label: "Plataforma",   items: ["feed", "antifraud", "push"] },
  { label: "Sistema",      items: ["analytics", "dicionario", "logs"] },
];

const TABS = Object.entries(TAB_MAP).map(([id, v]) => ({ id: id as Tab, ...v }));

// ── Motivos de punição ────────────────────────────────────────────────────────
const MOTIVOS_PUNICAO = [
  { value: "spam",    label: "🗑️ Spam" },
  { value: "fake",    label: "🎭 Informação falsa" },
  { value: "abuso",   label: "🤬 Abuso / Assédio" },
  { value: "fraude",  label: "💀 Fraude" },
  { value: "outro",   label: "❓ Outro" },
] as const;

const DURACOES_SUSPENSAO = [
  { value: "24h", label: "24 horas" },
  { value: "7d",  label: "7 dias" },
  { value: "30d", label: "30 dias" },
] as const;

// ── UsuariosCentralInteligente ───────────────────────────────────────────────

/** Computes a trust score 0–100 from available AdminUsuario fields. */
function computeUserScore(u: AdminUsuario): number {
  if (u.removido) return 0;
  let score = 100;
  if (u.bloqueado) score -= 40;
  const suspensoAte = u.suspensoAte ? new Date(u.suspensoAte) : null;
  if (suspensoAte && suspensoAte > new Date()) score -= 25;
  if (u.motivoPunicao) score -= 15;
  // Engagement bonuses (capped so max stays 100)
  if (u.pontos > 1000) score += 5;
  else if (u.pontos > 500) score += 3;
  else if (u.pontos > 100) score += 2;
  if (u.totalOfertas > 50) score += 3;
  else if (u.totalOfertas > 20) score += 2;
  if (u.colaboradorPioneiro) score += 5;
  return Math.max(0, Math.min(100, score));
}

function scoreLabel(score: number): { label: string; color: string; dot: string } {
  if (score >= 90) return { label: "Excelente", color: "text-lime-700 bg-lime-100 border-lime-200",   dot: "🟢" };
  if (score >= 70) return { label: "Bom",       color: "text-yellow-700 bg-yellow-100 border-yellow-200", dot: "🟡" };
  if (score >= 50) return { label: "Atenção",   color: "text-orange-700 bg-orange-100 border-orange-200", dot: "🟠" };
  return                  { label: "Risco",     color: "text-red-700 bg-red-100 border-red-200",      dot: "🔴" };
}

function generateIaSummary(u: AdminUsuario, score: number): string {
  if (u.removido) return "Conta anonimizada. Dados pessoais removidos.";
  const suspensoAte = u.suspensoAte ? new Date(u.suspensoAte) : null;
  const aindaSuspenso = suspensoAte ? suspensoAte > new Date() : false;
  if (u.bloqueado)
    return `Conta bloqueada.${u.motivoPunicao ? ` Motivo: ${u.motivoPunicao}.` : ""} Verificar histórico antes de reativar.`;
  if (aindaSuspenso)
    return `Suspenso temporariamente.${u.motivoPunicao ? ` Motivo: ${u.motivoPunicao}.` : ""} Monitorar após retorno.`;
  if (score >= 90) {
    if (u.totalOfertas >= 50)
      return `Usuário altamente confiável. ${u.totalOfertas} ofertas publicadas. Sem penalidades.${u.colaboradorPioneiro ? " Colaborador Pioneiro ativo." : " Candidato a selo VIP."}`;
    if (u.totalOfertas >= 10)
      return `Usuário confiável. ${u.totalOfertas} ofertas e ${u.pontos} pts. Boa participação na comunidade.`;
    return `Perfil novo com bom histórico. ${u.pontos} pts acumulados. Nenhuma ocorrência.`;
  }
  if (score >= 70)
    return `Usuário em bom estado. ${u.totalOfertas} ofertas, ${u.pontos} pts. Monitoramento padrão.`;
  if (score >= 50)
    return `Atenção: histórico misto. Revisar ofertas recentes e qualidade das publicações.`;
  return `Risco elevado detectado. Histórico de penalidades. Considerar ação preventiva imediata.`;
}

function timeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 2)    return "agora";
  if (mins < 60)   return `há ${mins}min`;
  if (hours < 24)  return `há ${hours}h`;
  if (days < 30)   return `há ${days}d`;
  return date.toLocaleDateString("pt-BR");
}

type UsuarioFilter = "todos" | "ativos" | "bloqueados" | "suspensos" | "removidos" | "risco" | "excelente";

function UsuarioCard({
  u, onBloquear, onSuspender, onExcluir, onPioneiro,
}: {
  u: AdminUsuario;
  onBloquear:  (id: number) => void;
  onSuspender: (u: AdminUsuario) => void;
  onExcluir:   (u: AdminUsuario) => void;
  onPioneiro:  (id: number) => Promise<void>;
}) {
  const [emailVisible, setEmailVisible] = useState(false);
  const [iaOpen, setIaOpen] = useState(false);

  const suspensoAte    = u.suspensoAte ? new Date(u.suspensoAte) : null;
  const aindaSuspenso  = suspensoAte ? suspensoAte > new Date() : false;
  const isRemovido     = u.removido;
  const ultimoLogin    = u.ultimoLoginEm ? new Date(u.ultimoLoginEm) : null;
  const score          = computeUserScore(u);
  const sl             = scoreLabel(score);
  const summary        = generateIaSummary(u, score);

  const borderColor =
    isRemovido ? "border-l-gray-300"
    : u.bloqueado ? "border-l-red-400"
    : aindaSuspenso ? "border-l-orange-400"
    : score < 50 ? "border-l-red-300"
    : score < 70 ? "border-l-orange-300"
    : "border-l-lime-400";

  const statusBadge = isRemovido ? (
    <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full">👻 Removido</span>
  ) : aindaSuspenso && suspensoAte ? (
    <span className="text-[10px] font-bold text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded-full">
      ⏳ Suspenso até {suspensoAte.toLocaleDateString("pt-BR")}
    </span>
  ) : u.bloqueado ? (
    <span className="text-[10px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded-full">🚫 Bloqueado</span>
  ) : (
    <span className="text-[10px] font-bold text-lime-700 bg-lime-100 px-1.5 py-0.5 rounded-full">🟢 Ativo</span>
  );

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className={cn(
        "bg-white rounded-xl border border-l-4 shadow-sm transition-all overflow-hidden",
        borderColor,
        isRemovido && "opacity-60",
      )}
    >
      {/* ── Main card row ── */}
      <div className="flex items-center gap-3 px-3 py-2.5">
        {/* Avatar */}
        <div className={cn(
          "w-9 h-9 rounded-full flex items-center justify-center text-sm font-black shrink-0 select-none",
          isRemovido ? "bg-gray-100 text-gray-400"
          : u.bloqueado ? "bg-red-100 text-red-700"
          : u.colaboradorPioneiro ? "bg-amber-100 text-amber-700"
          : "bg-indigo-100 text-indigo-700",
        )}>
          {isRemovido ? "👻" : (u.nome[0]?.toUpperCase() ?? "?")}
        </div>

        {/* Name + level */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={cn("font-bold text-sm leading-tight", isRemovido ? "line-through text-gray-400" : "text-gray-900")}>
              {u.nome}
            </span>
            {u.isAdmin && <span className="text-[9px] font-black text-red-700 bg-red-100 px-1 py-0.5 rounded-full leading-none">ADMIN</span>}
            {u.colaboradorPioneiro && !u.isAdmin && <span className="text-[9px] font-black text-amber-700 bg-amber-100 px-1 py-0.5 rounded-full leading-none">🏆 PIONEIRO</span>}
          </div>
          {!isRemovido && (
            <div className="text-[10px] text-gray-400 leading-tight truncate">
              {NIVEL_EMOJI[u.nivel]} {u.nivel}
            </div>
          )}
        </div>

        {/* Score badge */}
        {!isRemovido && (
          <div className={cn("flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full border shrink-0", sl.color)}>
            {sl.dot} {score}
            <span className="hidden sm:inline ml-0.5">{sl.label}</span>
          </div>
        )}
      </div>

      {/* ── Stats row ── */}
      {!isRemovido && (
        <div className="flex items-center gap-2 px-3 pb-2 flex-wrap">
          <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded-full">💰 {u.pontos} pts</span>
          <span className="text-[10px] font-semibold text-gray-600 bg-gray-50 border border-gray-100 px-1.5 py-0.5 rounded-full">🛒 {u.totalOfertas} ofertas</span>
          <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full border", sl.color)}>⭐ Score {score}</span>
          {u.motivoPunicao && (
            <span className="text-[10px] font-semibold text-red-600 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded-full" title={u.motivoPunicao}>🚨 Punido</span>
          )}
          {!u.semLimite && u.limiteDiario != null && (
            <span className="text-[10px] text-slate-500 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded-full">
              📤 {u.ofertasHoje ?? 0}/{u.limiteDiario} hoje
            </span>
          )}
        </div>
      )}

      {/* ── Status + last login row ── */}
      <div className="flex items-center gap-2 px-3 pb-2 flex-wrap">
        {statusBadge}
        {!isRemovido && ultimoLogin && (
          <span className="text-[10px] text-gray-400">🕒 {timeAgo(ultimoLogin)}</span>
        )}
        {!isRemovido && (u.email || u.telefone) && (
          <button
            onClick={() => setEmailVisible(v => !v)}
            className="text-[10px] text-indigo-500 hover:text-indigo-700 font-medium transition-colors"
          >
            {emailVisible ? "▲ ocultar" : "✉️ contato"}
          </button>
        )}
      </div>

      {/* ── Contact (hidden by default) ── */}
      <AnimatePresence>
        {emailVisible && !isRemovido && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="flex gap-3 px-3 pb-2 flex-wrap">
              {u.email && <span className="text-[10px] text-gray-500 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-lg">✉️ {u.email}</span>}
              {u.telefone && <span className="text-[10px] text-gray-500 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-lg">📱 {u.telefone}</span>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── IA Resumo (collapsible) ── */}
      <div className="px-3 pb-2">
        <button
          onClick={() => setIaOpen(v => !v)}
          className="flex items-center gap-1 text-[10px] font-medium text-violet-600 hover:text-violet-800 transition-colors"
        >
          🧠 Resumo IA {iaOpen ? "▲" : "▼"}
        </button>
        <AnimatePresence>
          {iaOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <p className="text-[10px] text-gray-600 bg-violet-50 border border-violet-100 rounded-lg px-2.5 py-1.5 mt-1 leading-relaxed italic">
                {summary}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Actions row ── */}
      {!isRemovido && (
        <div className="flex items-center gap-1 px-3 pb-2.5 flex-wrap">
          <button
            onClick={() => onBloquear(u.id)}
            className={cn(
              "text-[10px] font-bold px-2 py-1 rounded-lg transition-colors border",
              u.bloqueado
                ? "bg-lime-50 text-lime-700 border-lime-200 hover:bg-lime-100"
                : "bg-red-50 text-red-600 border-red-200 hover:bg-red-100",
            )}
          >
            {u.bloqueado ? "✅ Ativar" : "🚫 Bloquear"}
          </button>
          <button
            onClick={() => onSuspender(u)}
            className="text-[10px] font-bold px-2 py-1 rounded-lg bg-orange-50 text-orange-600 border border-orange-200 hover:bg-orange-100 transition-colors"
          >
            ⏸ Suspender
          </button>
          <button
            onClick={() => onPioneiro(u.id)}
            className={cn(
              "text-[10px] font-bold px-2 py-1 rounded-lg transition-colors border",
              u.colaboradorPioneiro
                ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-amber-50 hover:text-amber-700",
            )}
            title={u.colaboradorPioneiro ? "Remover Pioneiro" : "Conceder Pioneiro"}
          >
            {u.colaboradorPioneiro ? "🏆 −Pioneiro" : "🏆 +Pioneiro"}
          </button>
          <button
            onClick={() => onExcluir(u)}
            className="text-[10px] font-bold px-2 py-1 rounded-lg bg-gray-100 text-gray-500 border border-gray-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
            title="Anonimizar conta"
          >
            🗑 Excluir
          </button>
        </div>
      )}
    </motion.div>
  );
}

function UsuariosCentralInteligente({
  usuarios, loading, hasMore, loadingMore, totalApprox, onLoadMore,
  onBloquear, onSuspender, onExcluir, onPioneiro,
}: {
  usuarios:     AdminUsuario[];
  loading:      boolean;
  hasMore:      boolean;
  loadingMore:  boolean;
  totalApprox:  number;
  onLoadMore:   () => void;
  onBloquear:   (id: number) => void;
  onSuspender:  (u: AdminUsuario) => void;
  onExcluir:    (u: AdminUsuario) => void;
  onPioneiro:   (id: number) => Promise<void>;
}) {
  const [filter, setFilter] = useState<UsuarioFilter>("todos");
  const [search, setSearch]  = useState("");

  const now = new Date();

  const withScore = useMemo(() =>
    usuarios.map(u => ({ u, score: computeUserScore(u) })),
  [usuarios]);

  const filtered = useMemo(() => {
    let list = withScore;
    if (filter === "ativos")    list = list.filter(({ u }) => !u.bloqueado && !u.removido && !(u.suspensoAte && new Date(u.suspensoAte) > now));
    if (filter === "bloqueados") list = list.filter(({ u }) => u.bloqueado && !u.removido);
    if (filter === "suspensos") list = list.filter(({ u }) => !u.removido && u.suspensoAte && new Date(u.suspensoAte) > now);
    if (filter === "removidos") list = list.filter(({ u }) => u.removido);
    if (filter === "risco")     list = list.filter(({ score }) => score < 50);
    if (filter === "excelente") list = list.filter(({ score }) => score >= 90);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(({ u }) => u.nome.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || false);
    }
    return list;
  }, [withScore, filter, search, now]);

  const counts = useMemo(() => ({
    todos:     usuarios.length,
    ativos:    usuarios.filter(u => !u.bloqueado && !u.removido && !(u.suspensoAte && new Date(u.suspensoAte) > now)).length,
    bloqueados: usuarios.filter(u => u.bloqueado && !u.removido).length,
    suspensos: usuarios.filter(u => !u.removido && u.suspensoAte && new Date(u.suspensoAte) > now).length,
    removidos: usuarios.filter(u => u.removido).length,
    risco:     withScore.filter(({ score }) => score < 50).length,
    excelente: withScore.filter(({ score }) => score >= 90).length,
  }), [usuarios, withScore, now]);

  const FILTERS: { id: UsuarioFilter; label: string; cls: string }[] = [
    { id: "todos",      label: `Todos ${counts.todos}`,             cls: "bg-gray-100 text-gray-700" },
    { id: "ativos",     label: `🟢 Ativos ${counts.ativos}`,        cls: "bg-lime-100 text-lime-700" },
    { id: "bloqueados", label: `🚫 Bloqueados ${counts.bloqueados}`, cls: "bg-red-100 text-red-700" },
    { id: "suspensos",  label: `⏸ Suspensos ${counts.suspensos}`,   cls: "bg-orange-100 text-orange-700" },
    { id: "excelente",  label: `🟢 Excelentes ${counts.excelente}`, cls: "bg-emerald-100 text-emerald-700" },
    { id: "risco",      label: `🔴 Risco ${counts.risco}`,          cls: "bg-red-200 text-red-800" },
    { id: "removidos",  label: `👻 Removidos ${counts.removidos}`,   cls: "bg-gray-200 text-gray-500" },
  ];

  return (
    <div>
      {/* Header + search */}
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-gray-800">Central de Usuários</h2>
          <p className="text-xs text-gray-400">{usuarios.length} cadastrados · score de confiança automático</p>
        </div>
        <input
          type="text"
          placeholder="🔍 Buscar por nome ou e-mail…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="text-xs border border-gray-200 rounded-xl px-3 py-1.5 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 w-52"
        />
      </div>

      {/* Filter pills */}
      <div className="flex gap-1.5 flex-wrap mb-4">
        {FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              "text-[11px] font-bold px-2.5 py-1 rounded-full border transition-all",
              filter === f.id
                ? `${f.cls} border-transparent ring-2 ring-offset-1 ring-current`
                : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState msg="Nenhum usuário neste filtro." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <AnimatePresence mode="popLayout">
            {filtered.map(({ u }) => (
              <UsuarioCard
                key={u.id}
                u={u}
                onBloquear={onBloquear}
                onSuspender={onSuspender}
                onExcluir={onExcluir}
                onPioneiro={onPioneiro}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Carregar mais */}
      {(hasMore || loadingMore) && (
        <div className="flex flex-col items-center gap-1 py-4">
          <button
            onClick={onLoadMore}
            disabled={loadingMore}
            className="text-sm font-bold px-6 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {loadingMore ? "Carregando..." : `Carregar mais usuários`}
          </button>
          <p className="text-xs text-gray-400">{usuarios.length} de ~{totalApprox} exibidos</p>
        </div>
      )}
    </div>
  );
}

// ── OfertasAdminTab ───────────────────────────────────────────────────────────
type OfertasAdminTabProps = {
  ofertas:        AdminOferta[];
  loading:        boolean;
  metricas:       AuditoriaMetricas | undefined;
  loadingMetricas:boolean;
  analisandoLote: boolean;
  analisandoId:   number | null;
  hasMore:        boolean;
  loadingMore:    boolean;
  totalApprox:    number;
  onLoadMore:     () => void;
  onDestacar:         (id: number) => void;
  onPatrocinar:       (id: number) => void;
  onDelete:           (id: number, nome: string) => void;
  onAtivar:           (id: number) => void;
  onArquivar:         (id: number, nome: string) => void;
  onSuspeita:         (id: number) => void;
  onAnalisarIA:       (id: number) => void;
  onAnalisarLote:     () => void;
  onAplicarCorrecao:  (id: number, categoria: string) => void;
};

type OfertaFilter =
  | "todas" | "ativas" | "validadas" | "suspeitas" | "expiradas" | "arquivadas" | "removidas"
  | "precisa_atencao" | "preco_suspeito" | "categoria_errada" | "possivel_duplicada" | "foto_ruim";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    nova:               { cls: "bg-blue-100 text-blue-700",     label: "🆕 Nova" },
    validada:           { cls: "bg-lime-100 text-lime-700",     label: "✅ Validada" },
    suspeita:           { cls: "bg-amber-100 text-amber-700",   label: "⚠️ Suspeita" },
    expirada:           { cls: "bg-red-100 text-red-700",       label: "❌ Expirada" },
    arquivada:          { cls: "bg-gray-200 text-gray-600",     label: "📁 Arquivada" },
    removida:           { cls: "bg-gray-300 text-gray-500",     label: "🗑️ Removida" },
    pendente_validacao: { cls: "bg-purple-100 text-purple-700", label: "⏳ Pendente" },
    revisao_manual:     { cls: "bg-orange-100 text-orange-700", label: "🔍 Revisão" },
    recusada:           { cls: "bg-red-200 text-red-800",       label: "🚫 Recusada" },
  };
  const { cls, label } = map[status] ?? { cls: "bg-gray-100 text-gray-600", label: status };
  return <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${cls}`}>{label}</span>;
}

function AuditRiscoBadge({ audit }: { audit: AdminOfertaAudit | null | undefined }) {
  if (!audit) {
    return <span className="text-[10px] text-gray-300 font-medium">🧠 —</span>;
  }
  const cls =
    audit.risco === "alto"  ? "bg-red-100 text-red-700 border-red-200" :
    audit.risco === "medio" ? "bg-amber-100 text-amber-700 border-amber-200" :
                              "bg-lime-100 text-lime-700 border-lime-200";
  const icon = audit.risco === "alto" ? "🔴" : audit.risco === "medio" ? "🟡" : "🟢";
  return (
    <div className="mt-0.5 flex items-center gap-1 flex-wrap">
      <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${cls}`}>
        {icon} {audit.risco}
      </span>
      {audit.precoSuspeito    && <span className="text-[9px] bg-red-50 text-red-600 border border-red-100 px-1 py-0.5 rounded-full font-bold">💸</span>}
      {audit.categoriaErrada  && <span className="text-[9px] bg-orange-50 text-orange-600 border border-orange-100 px-1 py-0.5 rounded-full font-bold">🏷</span>}
      {audit.possivelDuplicada && <span className="text-[9px] bg-blue-50 text-blue-600 border border-blue-100 px-1 py-0.5 rounded-full font-bold">🔁</span>}
      {audit.fotoRuim         && <span className="text-[9px] bg-gray-100 text-gray-500 border border-gray-200 px-1 py-0.5 rounded-full font-bold">📷</span>}
    </div>
  );
}

function CentralInteligente({
  metricas, loading, analisandoLote, onAnalisarLote, onFilterChange,
}: {
  metricas:       AuditoriaMetricas | undefined;
  loading:        boolean;
  analisandoLote: boolean;
  onAnalisarLote: () => void;
  onFilterChange: (f: OfertaFilter) => void;
}) {
  const [open, setOpen] = useState(true);

  const cards: { icon: string; label: string; value: number | undefined; filter: OfertaFilter; cls: string; critico?: boolean }[] = [
    { icon: "🚨", label: "Precisa atenção",    value: metricas?.precisaAtencao,    filter: "precisa_atencao",  cls: "border-red-200 bg-red-50",    critico: (metricas?.precisaAtencao ?? 0) > 0 },
    { icon: "💸", label: "Preço suspeito",     value: metricas?.precoSuspeito,     filter: "preco_suspeito",   cls: "border-amber-200 bg-amber-50" },
    { icon: "🏷",  label: "Cat. errada",        value: metricas?.categoriaErrada,   filter: "categoria_errada", cls: "border-orange-200 bg-orange-50" },
    { icon: "🔁", label: "Possível duplicata", value: metricas?.possivelDuplicada, filter: "possivel_duplicada",cls: "border-blue-200 bg-blue-50" },
    { icon: "📷", label: "Foto ruim",          value: metricas?.fotoRuim,          filter: "foto_ruim",        cls: "border-gray-200 bg-gray-50" },
    { icon: "⏰", label: "Expirando em 24h",   value: metricas?.ofertasExpirando,  filter: "expiradas",        cls: "border-red-100 bg-red-50/60" },
  ];

  return (
    <div className="mb-4 rounded-xl border border-violet-200 bg-gradient-to-r from-violet-50 to-indigo-50 overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-2.5 cursor-pointer select-none"
        onClick={() => setOpen(v => !v)}
      >
        <div className="flex items-center gap-2">
          <span className="text-base">🧠</span>
          <span className="text-sm font-bold text-violet-800">Central Inteligente</span>
          {(metricas?.precisaAtencao ?? 0) > 0 && (
            <span className="text-[10px] font-black bg-red-500 text-white px-1.5 py-0.5 rounded-full animate-pulse">
              {metricas!.precisaAtencao} urgente{metricas!.precisaAtencao !== 1 ? "s" : ""}
            </span>
          )}
          {metricas && (
            <span className="text-[10px] text-violet-500 font-medium">
              {metricas.totalAnalisadas} analisada{metricas.totalAnalisadas !== 1 ? "s" : ""}
              {metricas.totalNaoAnalisadas > 0 && ` · ${metricas.totalNaoAnalisadas} pendente${metricas.totalNaoAnalisadas !== 1 ? "s" : ""}`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onAnalisarLote(); }}
            disabled={analisandoLote || loading}
            className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
          >
            {analisandoLote ? "⏳ Analisando…" : "🧠 Analisar lote"}
          </button>
          <span className="text-violet-400 text-xs">{open ? "▲" : "▼"}</span>
        </div>
      </div>
      {open && (
        <div className="px-4 pb-3">
          {loading && !metricas ? (
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-14 rounded-lg bg-white/60 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {cards.map(c => (
                <button
                  key={c.filter}
                  onClick={() => onFilterChange(c.filter)}
                  className={cn(
                    "flex flex-col items-center justify-center gap-0.5 py-2 px-1 rounded-lg border text-center cursor-pointer hover:opacity-80 transition-opacity",
                    c.cls,
                    c.critico && "ring-1 ring-red-400",
                  )}
                >
                  <span className="text-lg leading-none">{c.icon}</span>
                  <span className="text-[18px] font-black text-gray-800 leading-none">{c.value ?? "—"}</span>
                  <span className="text-[9px] font-semibold text-gray-500 leading-tight">{c.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OfertasAdminTab({
  ofertas, loading, metricas, loadingMetricas, analisandoLote, analisandoId,
  hasMore, loadingMore, totalApprox, onLoadMore,
  onDestacar, onPatrocinar, onDelete, onAtivar, onArquivar, onSuspeita,
  onAnalisarIA, onAnalisarLote, onAplicarCorrecao,
}: OfertasAdminTabProps) {
  const [filter, setFilter] = useState<OfertaFilter>("todas");
  const [ofertaConfirmAction, setOfertaConfirmAction] = useState<{ msg: string; onConfirm: () => void } | null>(null);

  const INACTIVE = new Set(["expirada", "suspeita", "removida", "arquivada"]);
  const ativas      = ofertas.filter(o => !INACTIVE.has(o.status ?? ""));
  const validadas   = ofertas.filter(o => o.status === "validada");
  const suspeitas   = ofertas.filter(o => o.status === "suspeita");
  const expiradas   = ofertas.filter(o => o.status === "expirada");
  const arquivadas  = ofertas.filter(o => o.status === "arquivada");
  const removidas   = ofertas.filter(o => o.status === "removida");

  const visible =
    filter === "ativas"            ? ativas
    : filter === "validadas"       ? validadas
    : filter === "suspeitas"       ? suspeitas
    : filter === "expiradas"       ? expiradas
    : filter === "arquivadas"      ? arquivadas
    : filter === "removidas"       ? removidas
    : filter === "precisa_atencao" ? ofertas.filter(o => o.auditoria?.risco === "alto")
    : filter === "preco_suspeito"  ? ofertas.filter(o => o.auditoria?.precoSuspeito)
    : filter === "categoria_errada"? ofertas.filter(o => o.auditoria?.categoriaErrada)
    : filter === "possivel_duplicada"? ofertas.filter(o => o.auditoria?.possivelDuplicada)
    : filter === "foto_ruim"       ? ofertas.filter(o => o.auditoria?.fotoRuim)
    : ofertas;

  const FILTERS: { id: OfertaFilter; label: string; count: number; cls: string }[] = [
    { id: "todas",     label: "Todas",          count: ofertas.length,    cls: "bg-gray-100 text-gray-700" },
    { id: "ativas",    label: "✅ Ativas",      count: ativas.length,     cls: "bg-lime-100 text-lime-700" },
    { id: "validadas", label: "🟢 Validadas",   count: validadas.length,  cls: "bg-emerald-100 text-emerald-700" },
    { id: "suspeitas", label: "⚠️ Suspeitas",  count: suspeitas.length,  cls: "bg-amber-100 text-amber-700" },
    { id: "expiradas", label: "❌ Expiradas",  count: expiradas.length,  cls: "bg-red-100 text-red-700" },
    { id: "arquivadas",label: "📁 Arquivadas",  count: arquivadas.length, cls: "bg-gray-200 text-gray-600" },
    { id: "removidas", label: "🗑️ Removidas",  count: removidas.length,  cls: "bg-gray-300 text-gray-500" },
  ];

  return (
    <div>
      <CentralInteligente
        metricas={metricas}
        loading={loadingMetricas}
        analisandoLote={analisandoLote}
        onAnalisarLote={onAnalisarLote}
        onFilterChange={(f) => setFilter(f)}
      />

      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <h2 className="text-base font-bold text-gray-800">
          Todas as Ofertas
          {filter !== "todas" && (
            <button
              onClick={() => setFilter("todas")}
              className="ml-2 text-xs font-normal text-gray-400 hover:text-gray-600"
            >✕ limpar filtro</button>
          )}
        </h2>
        <div className="flex gap-1.5 flex-wrap">
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "text-xs font-bold px-2.5 py-1 rounded-full border transition-all",
                filter === f.id
                  ? `${f.cls} border-transparent ring-2 ring-offset-1 ring-current`
                  : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
              )}
            >
              {f.label}
              <span className="ml-1 font-black">{f.count}</span>
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <LoadingSkeleton />
      ) : visible.length === 0 ? (
        <EmptyState msg="Nenhuma oferta neste filtro." />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3">Produto</th>
                <th className="px-4 py-3">Mercado / Cidade</th>
                <th className="px-4 py-3 text-right">Preço</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center">Score</th>
                <th className="px-4 py-3 text-center">Prioridade</th>
                <th className="px-4 py-3 text-center">Den.</th>
                <th className="px-4 py-3 text-center min-w-[260px]">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {visible.map((o: AdminOferta) => {
                const isRemovida  = o.status === "removida";
                const isArquivada = o.status === "arquivada";
                const isExpirada  = o.status === "expirada";
                const isSuspeita  = o.status === "suspeita";
                const isInactive  = isRemovida || isArquivada || isExpirada;
                const canActivate = !["validada", "removida"].includes(o.status ?? "");
                const audit       = o.auditoria as AdminOfertaAudit | null | undefined;
                const isBeingAnalyzed = analisandoId === o.id;

                return (
                  <tr
                    key={o.id}
                    className={cn(
                      "hover:bg-gray-50 transition-colors",
                      isExpirada  && "bg-red-50/60 opacity-75",
                      isSuspeita  && "bg-amber-50/60",
                      isArquivada && "bg-gray-50/80 opacity-70",
                      isRemovida  && "bg-gray-100/80 opacity-50",
                      !isInactive && !isSuspeita && o.denuncias >= 3 && "bg-red-50",
                      o.destacada   && !isInactive && !isSuspeita && "bg-yellow-50/50",
                      o.patrocinada && !isInactive && !isSuspeita && "bg-blue-50/50",
                      audit?.risco === "alto" && !isInactive && "ring-1 ring-inset ring-red-200",
                    )}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {o.hasFoto ? (
                          <div className="w-8 h-8 rounded bg-lime-100 flex items-center justify-center text-sm flex-shrink-0" title="Tem foto">📷</div>
                        ) : (
                          <div className="w-8 h-8 rounded bg-gray-200 flex items-center justify-center text-xs text-gray-400 flex-shrink-0">—</div>
                        )}
                        <div>
                          <div className={cn("font-semibold text-gray-800 leading-tight", isRemovida && "line-through text-gray-400")}>{o.produto}</div>
                          <div className="text-xs text-gray-400">{o.categoria ?? "—"}{o.marca ? ` · ${o.marca}` : ""}</div>
                          {o.visivelFeed
                            ? <div className="text-xs text-lime-600 font-medium mt-0.5">🟢 Visível no feed</div>
                            : <div className="text-xs text-red-500 font-medium mt-0.5" title={o.motivoBloqueio ?? ""}>🔴 {o.motivoBloqueio ?? "Oculto"}</div>
                          }
                          <AuditRiscoBadge audit={audit} />
                          {audit?.motivo && audit.risco !== "baixo" && (
                            <div className="text-[9px] text-gray-400 mt-0.5 max-w-[200px] line-clamp-2" title={audit.motivo}>
                              {audit.motivo}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-700">{o.mercado}</div>
                      <div className="text-xs text-gray-400">{o.bairro ? `${o.bairro}, ` : ""}{o.cidade ?? "—"}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-lime-700">
                      {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(o.preco)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={o.status ?? "nova"} />
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-gray-700">{o.score ?? 0}</td>
                    <td className="px-4 py-3 text-center">
                      {o.patrocinada
                        ? <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full whitespace-nowrap">⭐ Patrocinada</span>
                        : o.destacada
                          ? <span className="text-xs font-bold text-yellow-700 bg-yellow-50 border border-yellow-200 px-2 py-0.5 rounded-full whitespace-nowrap">🏆 Destaque</span>
                          : <span className="text-xs text-gray-400">📌 Normal</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn("font-bold", o.denuncias >= 3 && "text-red-600")}>
                        {o.denuncias}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 flex-wrap justify-center">
                        {canActivate && (
                          <button onClick={() => onAtivar(o.id)} className="text-xs font-bold px-2 py-1 rounded-lg bg-lime-50 text-lime-700 hover:bg-lime-100 transition-colors" title="Ativar">✅ Ativar</button>
                        )}
                        {!isRemovida && !isArquivada && (
                          <button onClick={() => onArquivar(o.id, o.produto)} className="text-xs font-bold px-2 py-1 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">⏸ Arquivar</button>
                        )}
                        {!isRemovida && !isSuspeita && !isArquivada && !isExpirada && (
                          <button onClick={() => onSuspeita(o.id)} className="text-xs font-bold px-2 py-1 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors">⚠️ Suspeita</button>
                        )}
                        <ActionBtn onClick={() => onDestacar(o.id)} active={o.destacada} activeLabel="✖ Dest." inactiveLabel="⭐ Destacar" activeClass="bg-yellow-100 text-yellow-700 hover:bg-yellow-200" inactiveClass="bg-gray-100 text-gray-600 hover:bg-gray-200" />
                        <ActionBtn onClick={() => onPatrocinar(o.id)} active={o.patrocinada} activeLabel="✖ Pat." inactiveLabel="💰 Patroc." activeClass="bg-amber-100 text-amber-700 hover:bg-amber-200" inactiveClass="bg-gray-100 text-gray-600 hover:bg-gray-200" />
                        {!isRemovida && (
                          <button onClick={() => onDelete(o.id, o.produto)} className="text-xs font-bold px-2 py-1 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors">🗑 Remover</button>
                        )}
                        <button
                          onClick={() => onAnalisarIA(o.id)}
                          disabled={isBeingAnalyzed}
                          className="text-xs font-bold px-2 py-1 rounded-lg bg-violet-50 text-violet-700 hover:bg-violet-100 disabled:opacity-50 transition-colors border border-violet-200"
                          title="Analisar com IA"
                        >
                          {isBeingAnalyzed ? "⏳" : "🧠"} {audit ? "Re-analisar" : "Analisar"}
                        </button>
                        {audit?.categoriaErrada && audit.categoriaSugerida && (
                          <button
                            onClick={() => { setOfertaConfirmAction({ msg: `Corrigir categoria para "${audit.categoriaSugerida}"?`, onConfirm: () => onAplicarCorrecao(o.id, audit.categoriaSugerida!) }); }}
                            className="text-xs font-bold px-2 py-1 rounded-lg bg-orange-50 text-orange-700 hover:bg-orange-100 transition-colors border border-orange-200"
                            title={`Categoria sugerida: ${audit.categoriaSugerida}`}
                          >
                            🏷 Corrigir
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

      {/* Carregar mais */}
      {(hasMore || loadingMore) && (
        <div className="flex flex-col items-center gap-1 py-4">
          <button
            onClick={onLoadMore}
            disabled={loadingMore}
            className="text-sm font-bold px-6 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {loadingMore ? "Carregando..." : `Carregar mais ofertas`}
          </button>
          <p className="text-xs text-gray-400">{ofertas.length} de ~{totalApprox} exibidas</p>
        </div>
      )}

      {/* Confirmação local (substitui confirm()) */}
      {ofertaConfirmAction && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl p-6 shadow-xl max-w-sm w-full mx-4">
            <p className="text-sm font-bold text-gray-800 mb-4">{ofertaConfirmAction.msg}</p>
            <div className="flex gap-3">
              <button onClick={() => setOfertaConfirmAction(null)} className="flex-1 py-2 rounded-xl border text-sm font-bold text-gray-600">Cancelar</button>
              <button onClick={() => { ofertaConfirmAction.onConfirm(); setOfertaConfirmAction(null); }} className="flex-1 py-2 rounded-xl bg-red-500 text-white text-sm font-bold">Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── FundadoresTab ─────────────────────────────────────────────────────────────
interface FundadoresTabProps {
  fundadores: AdminFundador[];
  elegiveis: FundadorElegivel[];
  loading: boolean;
  loadingElegiveis: boolean;
  onAdd: (usuarioId: number, observacao?: string) => void;
  onRemove: (usuarioId: number, nome: string) => void;
  isPending: boolean;
}

function FundadoresTab({
  fundadores,
  elegiveis,
  loading,
  loadingElegiveis,
  onAdd,
  onRemove,
  isPending,
}: FundadoresTabProps) {
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [addObs, setAddObs] = useState("");

  const MAX_SLOTS = 10;
  const remaining = MAX_SLOTS - fundadores.length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-bold text-gray-800">🏆 Fundadores AíCompensa</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Os primeiros usuários reais e ativos do app. Selo vitalício, sem limite de postagem.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn(
            "text-xs font-bold px-3 py-1.5 rounded-full border",
            fundadores.length >= MAX_SLOTS
              ? "bg-amber-50 border-amber-200 text-amber-700"
              : "bg-lime-50 border-lime-200 text-lime-700"
          )}>
            {fundadores.length}/{MAX_SLOTS} fundadores
          </span>
          {fundadores.length < MAX_SLOTS && (
            <button
              onClick={() => setShowAddPanel((v) => !v)}
              className="text-xs font-bold px-3 py-1.5 rounded-full bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
            >
              + Adicionar
            </button>
          )}
        </div>
      </div>

      {/* Benefits banner */}
      <div className="bg-gradient-to-r from-yellow-50 to-amber-50 border border-amber-200 rounded-xl px-4 py-3">
        <p className="text-xs font-bold text-amber-800 mb-1.5">✨ Benefícios dos Fundadores</p>
        <div className="flex flex-wrap gap-2">
          {["Sem limite de postagem", "Acesso antecipado a novos recursos", "Testes beta exclusivos", "Selo vitalício 🏆"].map((b) => (
            <span key={b} className="text-[10px] font-semibold bg-white border border-amber-200 text-amber-700 px-2 py-0.5 rounded-full">
              {b}
            </span>
          ))}
        </div>
      </div>

      {/* Add founder panel */}
      {showAddPanel && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-indigo-800">Adicionar fundador manualmente</p>
            <span className="text-[10px] text-indigo-600 font-semibold">{remaining} {remaining === 1 ? "vaga" : "vagas"} restante{remaining === 1 ? "" : "s"}</span>
          </div>
          <div>
            <label className="text-xs font-semibold text-indigo-700 mb-1 block">Observação (opcional)</label>
            <input
              value={addObs}
              onChange={(e) => setAddObs(e.target.value)}
              placeholder="Ex: Primeiro usuário da cidade de SP"
              maxLength={200}
              className="w-full text-xs border border-indigo-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
            />
          </div>
          {loadingElegiveis ? (
            <div className="text-xs text-indigo-500 py-2">Carregando candidatos elegíveis…</div>
          ) : elegiveis.length === 0 ? (
            <div className="text-xs text-indigo-500 py-2">Nenhum candidato elegível encontrado.</div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-indigo-100 bg-white">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-indigo-50 text-left font-bold text-indigo-700 uppercase tracking-wide text-[10px]">
                    <th className="px-3 py-2">Usuário</th>
                    <th className="px-3 py-2 text-right">Pontos</th>
                    <th className="px-3 py-2 text-right">Ofertas</th>
                    <th className="px-3 py-2 text-center">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(elegiveis as FundadorElegivel[]).map((u) => (
                    <tr key={u.id} className="hover:bg-indigo-50/50">
                      <td className="px-3 py-2">
                        <div className="font-semibold text-gray-800">{u.nome}</div>
                        {u.email && <div className="text-[10px] text-gray-400">{u.email}</div>}
                        <div className="text-[10px] text-gray-400">ID #{u.id}</div>
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-lime-700">{u.pontos}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{u.totalOfertas}</td>
                      <td className="px-3 py-2 text-center">
                        <button
                          disabled={isPending}
                          onClick={() => { onAdd(u.id, addObs || undefined); setAddObs(""); }}
                          className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                        >
                          + Fundador
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Founders table */}
      {loading ? (
        <LoadingSkeleton />
      ) : fundadores.length === 0 ? (
        <EmptyState msg="Nenhum fundador definido ainda. Acesse esta aba para selecionar automaticamente os primeiros usuários ativos." />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3 w-10">#</th>
                <th className="px-4 py-3">Fundador</th>
                <th className="px-4 py-3 text-right">Pontos</th>
                <th className="px-4 py-3 text-right">Ofertas</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center">Adicionado por</th>
                <th className="px-4 py-3 text-center">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(fundadores as AdminFundador[]).map((f, idx) => (
                <tr key={f.id} className={cn("hover:bg-gray-50 transition-colors", f.bloqueado && "opacity-60 bg-red-50/30")}>
                  <td className="px-4 py-3">
                    <span className={cn(
                      "w-7 h-7 rounded-full flex items-center justify-center text-xs font-black",
                      idx === 0 ? "bg-yellow-400 text-yellow-900" :
                      idx === 1 ? "bg-gray-300 text-gray-700" :
                      idx === 2 ? "bg-orange-300 text-orange-800" :
                      "bg-gray-100 text-gray-600"
                    )}>
                      {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${f.posicao}`}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-gray-800 flex items-center gap-1.5">
                      {f.nome}
                      <span className="text-[9px] font-black bg-yellow-400 text-yellow-900 px-1.5 py-0.5 rounded-full">🏆 FUNDADOR</span>
                    </div>
                    {f.email && <div className="text-[10px] text-gray-400">{f.email}</div>}
                    <div className="text-[10px] text-gray-400">ID #{f.usuarioId}</div>
                    {f.observacao && <div className="text-[10px] text-indigo-600 italic mt-0.5">"{f.observacao}"</div>}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-lime-700">{f.pontos}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{f.totalOfertas}</td>
                  <td className="px-4 py-3 text-center">
                    {f.bloqueado ? (
                      <span className="text-[10px] bg-red-100 text-red-700 font-bold px-2 py-0.5 rounded-full">🚫 Bloqueado</span>
                    ) : (
                      <span className="text-[10px] bg-lime-100 text-lime-700 font-bold px-2 py-0.5 rounded-full">✅ Ativo</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-[10px] text-gray-500">{f.adicionadoPor}</td>
                  <td className="px-4 py-3 text-center">
                    <button
                      disabled={isPending}
                      onClick={() => onRemove(f.usuarioId, f.nome)}
                      className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50 transition-colors"
                    >
                      Remover
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {fundadores.length >= MAX_SLOTS && (
        <p className="text-xs text-center text-amber-700 font-semibold bg-amber-50 border border-amber-200 rounded-xl py-2.5 px-4">
          ⚠️ Limite de {MAX_SLOTS} fundadores atingido. Remova um fundador para liberar uma vaga.
        </p>
      )}
    </div>
  );
}

// ── Ações do audit log — mapa de label legível ────────────────────────────────
const ACAO_LABEL: Record<string, string> = {
  bloquear_usuario:    "🚫 Bloqueou usuário",
  desbloquear_usuario: "✅ Desbloqueou usuário",
  suspender_usuario:   "⏳ Suspendeu usuário",
  excluir_usuario:     "🗑️ Excluiu usuário",
  ajustar_pontos:      "💰 Ajustou pontos",
  criar_sorteio:       "🎲 Criou sorteio",
  sortear_vencedor:    "🏆 Realizou sorteio",
  alterar_status_sorteio: "📋 Alterou sorteio",
  remover_cupom:       "🗑️ Removeu cupom",
  editar_missao:       "✏️ Editou missão",
  seed_fundadores:     "🏆 Seleção automática de fundadores",
  adicionar_fundador:  "🏆 Adicionou fundador",
  remover_fundador:    "❌ Removeu fundador",
};

// ── Admin ─────────────────────────────────────────────────────────────────────
export default function Admin() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [, setLocation] = useLocation();
  const qc = useQueryClient();

  // ── Modal state ────────────────────────────────────────────────────────────
  const [suspenderTarget, setSuspenderTarget] = useState<AdminUsuario | null>(null);
  const [excluirTarget, setExcluirTarget] = useState<AdminUsuario | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ msg: string; onConfirm: () => void } | null>(null);

  // Accept classic env-based admin session OR super admin user (isAdmin flag)
  const superAdmin = getCurrentUser()?.isAdmin === true;
  const logado = isAdminLogado() || superAdmin;

  useEffect(() => {
    if (!logado) setLocation("/admin-login");
  }, [logado, setLocation]);

  // ── Paginated ofertas ────────────────────────────────────────────────────────
  const [ofertas,         setOfertas]         = useState<AdminOferta[]>([]);
  const [ofertasCursor,   setOfertasCursor]   = useState<number | null>(null);
  const [ofertasHasMore,  setOfertasHasMore]  = useState(false);
  const [ofertasTotal,    setOfertasTotal]    = useState(0);
  const [loadingOfertas,  setLoadingOfertas]  = useState(false);
  const [loadingMoreOfertas, setLoadingMoreOfertas] = useState(false);

  const loadOfertas = async (cursor?: number) => {
    if (!logado) return;
    if (cursor) setLoadingMoreOfertas(true); else setLoadingOfertas(true);
    try {
      const page: AdminOfertaPage = await getAdminOfertasPaged({ limit: 50, cursor });
      setOfertas(prev => cursor ? [...prev, ...page.items] : page.items);
      setOfertasCursor(page.nextCursor);
      setOfertasHasMore(page.hasMore);
      setOfertasTotal(page.totalApprox);
    } finally {
      if (cursor) setLoadingMoreOfertas(false); else setLoadingOfertas(false);
    }
  };

  // ── Paginated usuarios ───────────────────────────────────────────────────────
  const [usuarios,           setUsuarios]           = useState<AdminUsuario[]>([]);
  const [usuariosCursor,     setUsuariosCursor]     = useState<number | null>(null);
  const [usuariosHasMore,    setUsuariosHasMore]    = useState(false);
  const [usuariosTotal,      setUsuariosTotal]      = useState(0);
  const [loadingUsuarios,    setLoadingUsuarios]    = useState(false);
  const [loadingMoreUsuarios, setLoadingMoreUsuarios] = useState(false);

  const loadUsuarios = async (cursor?: number) => {
    if (!logado) return;
    if (cursor) setLoadingMoreUsuarios(true); else setLoadingUsuarios(true);
    try {
      const page: AdminUsuarioPage = await getAdminUsuariosPaged({ limit: 50, cursor });
      setUsuarios(prev => cursor ? [...prev, ...page.items] : page.items);
      setUsuariosCursor(page.nextCursor);
      setUsuariosHasMore(page.hasMore);
      setUsuariosTotal(page.totalApprox);
    } finally {
      if (cursor) setLoadingMoreUsuarios(false); else setLoadingUsuarios(false);
    }
  };

  useEffect(() => {
    if (!logado) return;
    void loadOfertas();
    void loadUsuarios();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logado]);
  const { data: stats, isLoading: loadingStats } = useGetAdminStats({
    query: { queryKey: getGetAdminStatsQueryKey(), enabled: logado },
  });
  const { data: analytics, isLoading: loadingAnalytics } = useGetAdminAnalytics({
    query: { queryKey: getGetAdminAnalyticsQueryKey(), enabled: logado && tab === "analytics" },
  });
  const { data: validacaoOfertas = [], isLoading: loadingValidacao } = useGetAdminValidacao({
    query: { queryKey: getGetAdminValidacaoQueryKey(), enabled: logado && tab === "validacao" },
  });
  const { data: adminLogs = [], isLoading: loadingLogs } = useGetAdminLogs(
    {},
    { query: { queryKey: getGetAdminLogsQueryKey(), enabled: logado && tab === "logs" } },
  );
  const { data: fundadores = [], isLoading: loadingFundadores } = useGetAdminFundadores({
    query: { queryKey: getGetAdminFundadoresQueryKey(), enabled: logado && tab === "fundadores" },
  });
  const { data: elegiveisData = [], isLoading: loadingElegiveis } = useGetAdminFundadoresElegiveis({
    query: { queryKey: getGetAdminFundadoresElegiveisQueryKey(), enabled: logado && tab === "fundadores" },
  });
  const addFundador   = useCreateAdminFundador();
  const removeFundador = useDeleteAdminFundador();

  function handleLogout() {
    if (superAdmin) {
      setLocation("/");
      return;
    }
    clearAdminSession();
    setLocation("/admin-login");
  }

  if (!logado) return null;

  const invalidateAll = () => {
    void loadOfertas();
    void loadUsuarios();
    qc.invalidateQueries({ queryKey: getGetAdminStatsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetAdminValidacaoQueryKey() });
    qc.invalidateQueries({ queryKey: getGetAdminLogsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetAdminFundadoresQueryKey() });
    qc.invalidateQueries({ queryKey: getGetAdminFundadoresElegiveisQueryKey() });
  };

  function handleAddFundador(usuarioId: number, observacao?: string) {
    addFundador.mutate(
      { data: { usuarioId, observacao } },
      {
        onSuccess: () => {
          toast({ title: "🏆 Fundador adicionado com sucesso!" });
          qc.invalidateQueries({ queryKey: getGetAdminFundadoresQueryKey() });
          qc.invalidateQueries({ queryKey: getGetAdminFundadoresElegiveisQueryKey() });
        },
        onError: (err: unknown) => {
          const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
          toast({ title: msg ?? "Erro ao adicionar fundador", variant: "destructive" });
        },
      }
    );
  }

  function handleRemoveFundador(usuarioId: number, nome: string) {
    setConfirmAction({
      msg: `Remover "${nome}" dos Fundadores? O usuário perderá o selo vitalício.`,
      onConfirm: () => removeFundador.mutate(
        { usuarioId },
        {
          onSuccess: () => {
            toast({ title: `❌ ${nome} removido dos fundadores.` });
            qc.invalidateQueries({ queryKey: getGetAdminFundadoresQueryKey() });
            qc.invalidateQueries({ queryKey: getGetAdminFundadoresElegiveisQueryKey() });
          },
          onError: () => toast({ title: "Erro ao remover fundador", variant: "destructive" }),
        }
      ),
    });
  }

  const { mutate: aprovarValidacao } = useAprovarValidacao({
    mutation: {
      onSuccess: () => { toast({ title: "✅ Oferta aprovada! +10 pts para o usuário." }); invalidateAll(); },
      onError: () => toast({ title: "Erro ao aprovar", variant: "destructive" }),
    },
  });
  const { mutate: recusarValidacao } = useRecusarValidacao({
    mutation: {
      onSuccess: () => { toast({ title: "❌ Oferta recusada." }); invalidateAll(); },
      onError: () => toast({ title: "Erro ao recusar", variant: "destructive" }),
    },
  });

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

  const { mutate: ativarOferta } = useAtivarOferta({
    mutation: {
      onSuccess: () => { toast({ title: "✅ Oferta ativada e voltou ao feed!" }); invalidateAll(); },
      onError: () => toast({ title: "Erro ao ativar oferta", variant: "destructive" }),
    },
  });

  const { mutate: arquivarOferta } = useArquivarOferta({
    mutation: {
      onSuccess: () => { toast({ title: "📁 Oferta arquivada — saiu do feed, histórico preservado" }); invalidateAll(); },
      onError: () => toast({ title: "Erro ao arquivar oferta", variant: "destructive" }),
    },
  });

  const { mutate: marcarSuspeita } = useMarcarOfertaSuspeita({
    mutation: {
      onSuccess: () => { toast({ title: "⚠️ Oferta marcada como suspeita" }); invalidateAll(); },
      onError: () => toast({ title: "Erro ao marcar suspeita", variant: "destructive" }),
    },
  });

  // ── Central Inteligente — AI audit hooks ─────────────────────────────────────
  const [analisandoId, setAnalisandoId] = useState<number | null>(null);

  const { data: metricas, isLoading: loadingMetricas } = useGetAdminAuditoriaMetricas({
    query: {
      queryKey: getGetAdminAuditoriaMetricasQueryKey(),
      enabled: logado && tab === "ofertas",
      refetchInterval: 30_000,
    },
  });

  const { mutate: analisarIa } = usePostAdminOfertasIdAnalisarIa({
    mutation: {
      onSuccess: (_audit, vars) => {
        toast({ title: "🧠 Análise IA concluída!" });
        setAnalisandoId(null);
        qc.invalidateQueries({ queryKey: getGetAdminOfertasQueryKey() });
        qc.invalidateQueries({ queryKey: getGetAdminAuditoriaMetricasQueryKey() });
        void vars;
      },
      onError: () => { toast({ title: "Erro na análise IA", variant: "destructive" }); setAnalisandoId(null); },
    },
  });

  const { mutate: analisarLote, isPending: analisandoLote } = usePostAdminOfertasAnalisarIaLote({
    mutation: {
      onSuccess: (data) => {
        toast({ title: `🧠 Lote enfileirado: ${data.processadas} oferta${data.processadas !== 1 ? "s" : ""} sendo analisada${data.processadas !== 1 ? "s" : ""}` });
        setTimeout(() => {
          qc.invalidateQueries({ queryKey: getGetAdminOfertasQueryKey() });
          qc.invalidateQueries({ queryKey: getGetAdminAuditoriaMetricasQueryKey() });
        }, 5000);
      },
      onError: () => toast({ title: "Erro no lote IA", variant: "destructive" }),
    },
  });

  const { mutate: aplicarCorrecao } = usePatchAdminOfertasIdAplicarCorrecao({
    mutation: {
      onSuccess: (data) => {
        toast({ title: `🏷 Categoria corrigida para "${data.categoria}"` });
        qc.invalidateQueries({ queryKey: getGetAdminOfertasQueryKey() });
        qc.invalidateQueries({ queryKey: getGetAdminAuditoriaMetricasQueryKey() });
      },
      onError: () => toast({ title: "Erro ao corrigir categoria", variant: "destructive" }),
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

  const { mutate: suspender, isPending: suspendendo } = useSuspenderUsuario({
    mutation: {
      onSuccess: () => {
        toast({ title: "⏳ Usuário suspenso com sucesso." });
        setSuspenderTarget(null);
        invalidateAll();
      },
      onError: () => toast({ title: "Erro ao suspender", variant: "destructive" }),
    },
  });

  const { mutate: excluirUsuario, isPending: excluindo } = useDeleteAdminUsuario({
    mutation: {
      onSuccess: (data) => {
        toast({ title: `✅ Conta de "${data.nome}" anonimizada com sucesso.` });
        setExcluirTarget(null);
        invalidateAll();
      },
      onError: (err) => {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
        toast({ title: msg ?? "Erro ao anonimizar usuário", variant: "destructive" });
      },
    },
  });

  const denunciadas = ofertas.filter((o: AdminOferta) => o.denuncias >= 1);

  return (
    <div className="min-h-screen flex flex-col text-gray-900 overflow-hidden" style={{ background: "#0f0e1a" }}>

      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <header
        className="flex items-center justify-between px-4 sm:px-5 gap-2 shrink-0 z-30"
        style={{
          background: "#1e1b4b",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          minHeight: "var(--admin-header-h)",
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)",
          paddingBottom: "12px",
        }}
      >
        {/* Left: hamburger + logo */}
        <div className="flex items-center gap-2.5">
          <button
            className="lg:hidden w-8 h-8 flex items-center justify-center rounded-xl text-indigo-300 hover:text-white hover:bg-white/10 transition-colors text-lg leading-none"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label="Menu"
          >
            ☰
          </button>
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center text-base shrink-0"
            style={{ background: "#84cc16" }}
          >
            🛡️
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-black text-white leading-tight">AíCompensa Admin</h1>
              <span
                className="text-[9px] font-black px-1.5 py-0.5 rounded-full hidden sm:inline"
                style={{ background: "#84cc16", color: "#1e1b4b" }}
              >
                ADMIN
              </span>
            </div>
            <p className="text-[9px] text-indigo-400 leading-none hidden sm:block">
              {TAB_MAP[tab]?.label ?? tab}
            </p>
          </div>
        </div>

        {/* Right: quick stats + user + actions */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {stats && (
            <div
              className="hidden lg:flex items-center gap-3 px-3 py-1 rounded-xl"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              {([
                { v: stats.totalOfertas,   l: "Ofertas"   },
                { v: stats.ofertasHoje,    l: "Hoje"      },
                { v: stats.totalUsuarios,  l: "Usuários"  },
                { v: stats.totalDenuncias, l: "Denúncias" },
              ] as { v: number; l: string }[]).map((s) => (
                <div key={s.l} className="flex items-center gap-1">
                  <span className="text-xs font-black text-white">{s.v}</span>
                  <span className="text-[10px] text-indigo-300">{s.l}</span>
                </div>
              ))}
            </div>
          )}
          {superAdmin && (
            <div
              className="hidden md:flex items-center gap-1 px-2 py-1 rounded-lg"
              style={{ background: "rgba(132,204,22,0.1)", border: "1px solid rgba(132,204,22,0.25)" }}
            >
              <span className="text-[9px] font-black uppercase tracking-wide" style={{ color: "#84cc16" }}>Super</span>
              <span className="text-[9px]" style={{ color: "#86efac" }}>{getCurrentUser()?.nome?.split(" ")[0]}</span>
            </div>
          )}
          <button
            onClick={() => setLocation("/")}
            className="text-xs font-bold px-2.5 py-1.5 rounded-xl transition-colors"
            style={{ background: "rgba(255,255,255,0.08)", color: "#c7d2fe" }}
          >
            ← App
          </button>
          <button
            onClick={handleLogout}
            className="text-xs font-bold px-2.5 py-1.5 rounded-xl transition-colors"
            style={{ background: "rgba(239,68,68,0.15)", color: "#fca5a5" }}
          >
            Sair
          </button>
        </div>
      </header>

      {/* ── Body (sidebar + content) ─────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          </div>
        )}

        {/* ── Sidebar ──────────────────────────────────────────────────────── */}
        <aside
          className={cn(
            "fixed lg:relative inset-y-0 left-0 z-50 lg:z-auto w-60 flex flex-col shrink-0",
            "transition-transform duration-300 ease-out overflow-hidden",
            sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          )}
          style={{
            background: "#13112b",
            borderRight: "1px solid rgba(255,255,255,0.07)",
            top: "var(--admin-header-h)",
            height: "calc(100dvh - var(--admin-header-h))",
          }}
        >
          <nav className="p-2 flex-1 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:#312e81_transparent]">
            {SIDEBAR_GROUPS.map((group) => (
              <div key={group.label} className="mb-1">
                <div className="px-3 py-1.5 text-[9px] font-black text-indigo-500/70 uppercase tracking-widest select-none">
                  {group.label}
                </div>
                {group.items.map((id) => {
                  const t = TAB_MAP[id];
                  if (!t) return null;
                  const isActive = tab === id;
                  const badge =
                    id === "denuncias" && denunciadas.length > 0
                      ? denunciadas.length
                      : id === "validacao" && validacaoOfertas.length > 0
                      ? validacaoOfertas.length
                      : 0;
                  return (
                    <button
                      key={id}
                      onClick={() => { setTab(id); setSidebarOpen(false); }}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all mb-0.5 text-left",
                        isActive
                          ? "font-black text-[#1e1b4b]"
                          : "font-medium text-indigo-300/80 hover:text-white hover:bg-white/5",
                      )}
                      style={isActive ? { background: "#84cc16" } : {}}
                    >
                      <span className="text-base w-5 shrink-0 text-center leading-none">{t.icon}</span>
                      <span className="flex-1 truncate">{t.label}</span>
                      {badge > 0 && (
                        <span
                          className={cn(
                            "text-[9px] font-black px-1.5 py-0.5 rounded-full leading-none shrink-0",
                            isActive
                              ? "bg-[#1e1b4b] text-[#84cc16]"
                              : id === "denuncias"
                              ? "bg-red-500 text-white"
                              : "bg-purple-600 text-white",
                          )}
                        >
                          {badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
        </aside>

        {/* ── Main content ─────────────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto" style={{ background: "#f0f2f8" }}>
          <div className="p-4 lg:p-6 max-w-6xl mx-auto">
        <AnimatePresence mode="wait">
          {/* ── ABA OFERTAS ── */}
          {tab === "ofertas" && (
            <motion.div key="ofertas" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <OfertasAdminTab
                ofertas={ofertas}
                loading={loadingOfertas}
                metricas={metricas}
                loadingMetricas={loadingMetricas}
                analisandoLote={analisandoLote}
                analisandoId={analisandoId}
                hasMore={ofertasHasMore}
                loadingMore={loadingMoreOfertas}
                totalApprox={ofertasTotal}
                onLoadMore={() => ofertasCursor && void loadOfertas(ofertasCursor)}
                onDestacar={(id) => destacar({ id })}
                onPatrocinar={(id) => patrocinar({ id })}
                onDelete={(id, nome) => {
                  setConfirmAction({ msg: `Remover "${nome}"?\n\nA oferta sairá do feed público, mas o histórico e analytics serão preservados.`, onConfirm: () => deleteOferta({ id }) });
                }}
                onAtivar={(id) => ativarOferta({ id })}
                onArquivar={(id, nome) => {
                  setConfirmAction({ msg: `Arquivar "${nome}"?\n\nA oferta sairá do feed mas ficará no histórico.`, onConfirm: () => arquivarOferta({ id }) });
                }}
                onSuspeita={(id) => marcarSuspeita({ id })}
                onAnalisarIA={(id) => { setAnalisandoId(id); analisarIa({ id }); }}
                onAnalisarLote={() => analisarLote({ data: {} })}
                onAplicarCorrecao={(id, categoria) => aplicarCorrecao({ id, data: { categoria } })}
              />
            </motion.div>
          )}

          {/* ── ABA MODERAÇÃO ── */}
          {tab === "moderacao" && (
            <motion.div key="moderacao" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <ModeracaoTab />
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
                        {o.hasFoto ? (
                          <div className="w-14 h-14 rounded-xl bg-lime-100 flex items-center justify-center text-3xl shrink-0" title="Tem foto">📷</div>
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
                            className="text-xs font-bold px-3 py-1.5 rounded-lg bg-lime-50 text-lime-700 hover:bg-lime-100 transition-colors"
                          >
                            ✔ Marcar válida
                          </button>
                          <button
                            onClick={() => {
                              setConfirmAction({ msg: `Remover "${o.produto}"?`, onConfirm: () => deleteOferta({ id: o.id }) });
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

          {/* ── ABA USUÁRIOS — Central Inteligente ── */}
          {tab === "usuarios" && (
            <motion.div key="usuarios" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <UsuariosCentralInteligente
                usuarios={usuarios}
                loading={loadingUsuarios}
                hasMore={usuariosHasMore}
                loadingMore={loadingMoreUsuarios}
                totalApprox={usuariosTotal}
                onLoadMore={() => usuariosCursor && void loadUsuarios(usuariosCursor)}
                onBloquear={(id) => bloquear({ id, data: {} })}
                onSuspender={(u) => setSuspenderTarget(u)}
                onExcluir={(u) => setExcluirTarget(u)}
                onPioneiro={async (id) => {
                  const token = getAdminToken();
                  const headers: Record<string, string> = { "Content-Type": "application/json" };
                  if (token) headers["x-admin-token"] = token;
                  await fetch(`/api/admin/usuarios/${id}/colaborador-pioneiro`, { method: "POST", headers, credentials: "include" });
                  void loadUsuarios();
                }}
              />
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

          {/* ── ABA ANALYTICS ── */}
          {tab === "analytics" && (
            <motion.div key="analytics" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
              <h2 className="text-base font-bold text-gray-800">Analytics de Engajamento</h2>

              {loadingAnalytics || !analytics ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-52 rounded-2xl bg-gray-100 animate-pulse" />
                  ))}
                </div>
              ) : (
                <AnalyticsCharts analytics={analytics} />
              )}
            </motion.div>
          )}

          {/* ── ABA VALIDAÇÃO IA ── */}
          {tab === "validacao" && (
            <motion.div key="validacao" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-gray-800">
                  Validação de Fotos da Galeria
                  {validacaoOfertas.length > 0 && (
                    <span className="ml-2 bg-violet-100 text-violet-700 text-xs font-black px-2 py-0.5 rounded-full">
                      {validacaoOfertas.length} pendente{validacaoOfertas.length > 1 ? "s" : ""}
                    </span>
                  )}
                </h2>
              </div>
              {loadingValidacao ? (
                <LoadingSkeleton />
              ) : validacaoOfertas.length === 0 ? (
                <EmptyState msg="Nenhuma oferta aguardando validação. 🎉" />
              ) : (
                <div className="space-y-4">
                  {validacaoOfertas.map((oferta) => (
                    <div key={oferta.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                      <div className="flex gap-4">
                        {oferta.hasFoto && (
                          <div className="w-20 h-20 rounded-xl bg-lime-100 flex items-center justify-center text-4xl flex-shrink-0 border border-lime-200" title="Oferta tem foto">📷</div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <div>
                              <p className="font-bold text-gray-900 text-sm leading-tight">{oferta.produto}</p>
                              <p className="text-xs text-gray-500">{oferta.categoria} · {oferta.mercado}</p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-lg font-black text-lime-600">{R(oferta.preco)}</p>
                              <span className={cn(
                                "text-[10px] font-bold px-2 py-0.5 rounded-full",
                                oferta.status === "pendente_validacao"
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-orange-100 text-orange-700"
                              )}>
                                {oferta.status === "pendente_validacao" ? "🕐 Analisando IA" : "👁 Revisão humana"}
                              </span>
                            </div>
                          </div>
                          <p className="text-xs text-gray-500 mb-2">
                            Por <strong>{oferta.usuario}</strong> · {new Date(oferta.dataCriacao).toLocaleString("pt-BR")}
                          </p>
                          {oferta.iaMotivo && (
                            <div className="bg-violet-50 border border-violet-200 rounded-lg p-2 mb-3">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] font-black text-violet-700 uppercase tracking-wide">Análise IA</span>
                                {oferta.iaScore !== null && oferta.iaScore !== undefined && (
                                  <span className="text-[10px] font-bold text-violet-600 font-mono">
                                    Score: {(Number(oferta.iaScore) * 100).toFixed(0)}%
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-violet-800 leading-relaxed">{oferta.iaMotivo}</p>
                            </div>
                          )}
                          <div className="flex gap-2">
                            <button
                              onClick={() => aprovarValidacao({ id: oferta.id })}
                              className="flex-1 py-2 bg-lime-500 hover:bg-lime-600 text-black text-sm font-bold rounded-lg transition-colors"
                            >
                              ✅ Aprovar
                            </button>
                            <button
                              onClick={() => recusarValidacao({ id: oferta.id })}
                              className="flex-1 py-2 bg-red-100 hover:bg-red-200 text-red-700 text-sm font-bold rounded-lg transition-colors"
                            >
                              ❌ Recusar
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ── ABA MERCADOS PATROCINADOS ── */}
          {tab === "mercados" && <MercadosTab />}

          {/* ── ABA RECOMPENSAS ── */}
          {tab === "recompensas" && (
            <motion.div key="recompensas" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <AdminRecompensasTab onGoToSorteios={() => setTab("sorteios")} />
            </motion.div>
          )}

          {/* ── ABA SORTEIOS ── */}
          {tab === "sorteios" && (
            <motion.div key="sorteios" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <SorteioAdminTab />
            </motion.div>
          )}

          {/* ── ABA DICIONÁRIO ── */}
          {tab === "dicionario" && <DicionarioTab />}

          {/* ── ABA FUNDADORES ── */}
          {tab === "fundadores" && (
            <motion.div key="fundadores" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <FundadoresTab
                fundadores={fundadores as AdminFundador[]}
                elegiveis={elegiveisData as FundadorElegivel[]}
                loading={loadingFundadores}
                loadingElegiveis={loadingElegiveis}
                onAdd={handleAddFundador}
                onRemove={handleRemoveFundador}
                isPending={addFundador.isPending || removeFundador.isPending}
              />
            </motion.div>
          )}

          {/* ── ABA NOTIFICAÇÕES PUSH ── */}
          {tab === "push" && (
            <PushNotificacoesTab usuarios={usuarios as AdminUsuario[]} />
          )}

          {/* ── ABA LOGS ── */}
          {tab === "logs" && (
            <motion.div key="logs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-gray-800">Audit Log Administrativo</h2>
                <span className="text-xs text-gray-400">{adminLogs.length} registros</span>
              </div>
              {loadingLogs ? (
                <LoadingSkeleton />
              ) : adminLogs.length === 0 ? (
                <EmptyState msg="Nenhuma ação registrada ainda." />
              ) : (
                <div className="space-y-2">
                  {(adminLogs as AdminLog[]).map((log) => (
                    <div key={log.id} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 flex items-start gap-3">
                      <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-base shrink-0 mt-0.5">
                        {(ACAO_LABEL[log.acao] ?? "🔧").slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-gray-900">
                            {ACAO_LABEL[log.acao] ?? log.acao}
                          </span>
                          {log.usuarioAfetadoNome && (
                            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
                              {log.usuarioAfetadoNome}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                          <span className="text-xs text-gray-400">
                            por <strong className="text-gray-600">{log.adminNome}</strong>
                          </span>
                          <span className="text-xs text-gray-400">
                            {new Date(log.criadoEm).toLocaleString("pt-BR")}
                          </span>
                        </div>
                        {log.motivo && (
                          <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-0.5 mt-1 inline-block">
                            Motivo: {log.motivo}
                          </p>
                        )}
                        {log.detalhes && (
                          <p className="text-xs text-gray-400 font-mono mt-0.5 truncate">{log.detalhes}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
          {tab === "dashboard" && <DashboardRealtimeTab />}
          {tab === "analytics-avancado" && <AnalyticsAvancadoTab />}
          {tab === "antifraud" && <AntiFraudTab />}
          {tab === "crescimento" && <CrescimentoTab />}
          {tab === "indicacoes" && <IndicacoesTab />}
          {tab === "viral" && <ViralTab />}
          {tab === "gamificacao" && <GamificacaoTab />}
          {tab === "feed" && <FeedControleTab />}
          {tab === "produtos" && <AdminProdutosTab />}
        </AnimatePresence>
          </div>
        </main>
      </div>

      {/* ── MODAL: Suspender usuário ────────────────────────────────────────── */}
      {suspenderTarget && (
        <SuspenderModal
          usuario={suspenderTarget}
          onClose={() => setSuspenderTarget(null)}
          onConfirm={(duracao, motivo, detalhe) =>
            suspender({ id: suspenderTarget.id, data: { duracao, motivo, detalhe: detalhe ?? undefined } })
          }
          isPending={suspendendo}
        />
      )}

      {/* ── MODAL: Excluir usuário ──────────────────────────────────────────── */}
      {excluirTarget && (
        <ExcluirModal
          usuario={excluirTarget}
          onClose={() => setExcluirTarget(null)}
          onConfirm={(motivo) =>
            excluirUsuario({ id: excluirTarget.id, data: { confirmar: true, motivo } })
          }
          isPending={excluindo}
        />
      )}

      {/* ── MODAL: Confirmação genérica (substitui confirm()) ──────────────── */}
      {confirmAction && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl p-6 shadow-xl max-w-sm w-full mx-4">
            <p className="text-sm font-bold text-gray-800 mb-4">{confirmAction.msg}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmAction(null)} className="flex-1 py-2 rounded-xl border text-sm font-bold text-gray-600">Cancelar</button>
              <button onClick={() => { confirmAction.onConfirm(); setConfirmAction(null); }} className="flex-1 py-2 rounded-xl bg-red-500 text-white text-sm font-bold">Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Modal: Suspender Usuário ──────────────────────────────────────────────────
function SuspenderModal({
  usuario,
  onClose,
  onConfirm,
  isPending,
}: {
  usuario: AdminUsuario;
  onClose: () => void;
  onConfirm: (duracao: "24h" | "7d" | "30d", motivo: "spam" | "fake" | "abuso" | "fraude" | "outro", detalhe?: string) => void;
  isPending: boolean;
}) {
  const [duracao, setDuracao] = useState<"24h" | "7d" | "30d">("24h");
  const [motivo, setMotivo] = useState<"spam" | "fake" | "abuso" | "fraude" | "outro">("spam");
  const [detalhe, setDetalhe] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm"
      >
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center text-xl">⏳</div>
          <div>
            <h3 className="font-black text-gray-900">Suspender Usuário</h3>
            <p className="text-sm text-gray-500">{usuario.nome}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5 block">Duração</label>
            <div className="grid grid-cols-3 gap-2">
              {DURACOES_SUSPENSAO.map((d) => (
                <button
                  key={d.value}
                  onClick={() => setDuracao(d.value)}
                  className={cn(
                    "py-2 rounded-xl text-sm font-bold border-2 transition-all",
                    duracao === d.value
                      ? "border-orange-400 bg-orange-50 text-orange-700"
                      : "border-gray-200 text-gray-500 hover:border-gray-300",
                  )}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5 block">Motivo</label>
            <div className="grid grid-cols-2 gap-2">
              {MOTIVOS_PUNICAO.map((m) => (
                <button
                  key={m.value}
                  onClick={() => setMotivo(m.value)}
                  className={cn(
                    "py-2 px-3 rounded-xl text-xs font-bold border-2 transition-all text-left",
                    motivo === m.value
                      ? "border-red-400 bg-red-50 text-red-700"
                      : "border-gray-200 text-gray-500 hover:border-gray-300",
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5 block">
              Detalhes adicionais <span className="font-normal text-gray-400">(opcional)</span>
            </label>
            <textarea
              value={detalhe}
              onChange={(e) => setDetalhe(e.target.value)}
              placeholder="Explique o motivo..."
              rows={2}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-300 resize-none"
            />
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(duracao, motivo, detalhe || undefined)}
            disabled={isPending}
            className="flex-1 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-black transition-colors disabled:opacity-50"
          >
            {isPending ? "Suspendendo…" : "⏳ Confirmar Suspensão"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Modal: Excluir Usuário ────────────────────────────────────────────────────
function ExcluirModal({
  usuario,
  onClose,
  onConfirm,
  isPending,
}: {
  usuario: AdminUsuario;
  onClose: () => void;
  onConfirm: (motivo: string) => void;
  isPending: boolean;
}) {
  const [etapa, setEtapa] = useState<1 | 2>(1);
  const [motivo, setMotivo] = useState("");
  const [confirmacao, setConfirmacao] = useState("");

  const nomeCorreto = confirmacao.trim() === usuario.nome.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm"
      >
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-xl">🗑️</div>
          <div>
            <h3 className="font-black text-red-700">Excluir Conta Permanentemente</h3>
            <p className="text-sm text-gray-500">{usuario.nome}</p>
          </div>
        </div>

        {etapa === 1 ? (
          <>
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 space-y-2">
              <p className="text-sm text-red-800 font-medium">
                ⚠️ Esta ação é <strong>irreversível</strong>. A conta será <strong>anonimizada</strong>:
              </p>
              <ul className="text-xs text-red-700 space-y-1 list-disc list-inside">
                <li>Nome substituído por "Usuário Removido"</li>
                <li>E-mail, telefone e CPF apagados</li>
                <li>Sessões e acesso revogados imediatamente</li>
                <li>Alertas e favoritos removidos</li>
                <li>Ofertas mantidas como contribuição à comunidade</li>
              </ul>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5 block">Motivo da exclusão</label>
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Descreva o motivo (mínimo 5 caracteres)…"
                rows={3}
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
              />
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => setEtapa(2)}
                disabled={motivo.trim().length < 5}
                className="flex-1 py-2.5 rounded-xl bg-red-100 text-red-700 text-sm font-black transition-colors hover:bg-red-200 disabled:opacity-40"
              >
                Continuar →
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
              <p className="text-sm text-red-800">
                Para confirmar, digite o nome exato do usuário: <strong>{usuario.nome}</strong>
              </p>
            </div>
            <input
              value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)}
              placeholder={`Digite "${usuario.nome}"`}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-300 mb-4"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setEtapa(1)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                ← Voltar
              </button>
              <button
                onClick={() => onConfirm(motivo)}
                disabled={!nomeCorreto || isPending}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-black transition-colors disabled:opacity-40"
              >
                {isPending ? "Excluindo…" : "🗑️ Excluir Agora"}
              </button>
            </div>
          </>
        )}
      </motion.div>
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
    const order = ["Estagiário da Economia", "Assistente de Ofertas", "Bacharel das Compras", "Especialista das Gôndolas", "Mestre das Pechinchas", "Doutor da Economia", "PhD do Supermercado"];
    const map = new Map<string, number>();
    for (const u of usuarios) {
      const label = u.nivel ?? "Estagiário da Economia";
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
    emerald: "bg-lime-50 border-lime-100",
    blue:    "bg-blue-50 border-blue-100",
    green:   "bg-green-50 border-green-100",
    red:     "bg-red-50 border-red-100",
    purple:  "bg-purple-50 border-purple-100",
    amber:   "bg-amber-50 border-amber-100",
  };
  const textColors: Record<string, string> = {
    emerald: "text-lime-700",
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

// ── ABA MERCADOS PATROCINADOS ─────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  ativo:    "bg-lime-100 text-lime-700",
  pausado:  "bg-amber-100 text-amber-700",
  expirado: "bg-gray-100 text-gray-500",
};

const PLANOS_CONFIG = [
  {
    id: "basico",
    emoji: "🥉",
    nome: "Básico",
    subtitulo: "Visibilidade local",
    prioridade: 3,
    alcance: "1 bairro",
    features: ["Aparece no feed local", "Selo Patrocinado", "Limite diário flexível"],
    bloqueado: ["Destaque no mapa", "Banner premium"],
    cor: { border: "#f97316", bg: "#fff7ed", text: "#c2410c", badge: "bg-orange-100 text-orange-700" },
  },
  {
    id: "regional",
    emoji: "🥈",
    nome: "Regional",
    subtitulo: "Toda a cidade",
    prioridade: 5,
    alcance: "Cidade inteira",
    features: ["Toda a cidade", "Prioridade média no feed", "Aparece no mapa", "Selo Patrocinado"],
    bloqueado: ["Banner premium", "Posição #1 garantida"],
    cor: { border: "#6b7280", bg: "#f9fafb", text: "#374151", badge: "bg-gray-100 text-gray-700" },
  },
  {
    id: "premium",
    emoji: "🥇",
    nome: "Premium",
    subtitulo: "Alta visibilidade",
    prioridade: 8,
    alcance: "Região expandida",
    features: ["Região expandida", "Alta prioridade", "Feed + Mapa em destaque", "Banner premium", "Analytics completo"],
    bloqueado: [],
    cor: { border: "#f59e0b", bg: "#fffbeb", text: "#92400e", badge: "bg-amber-100 text-amber-700" },
  },
  {
    id: "ultra",
    emoji: "👑",
    nome: "Ultra Destaque",
    subtitulo: "Máxima exposição",
    prioridade: 10,
    alcance: "Máximo alcance",
    features: ["Máximo alcance", "Posição #1 garantida", "Todos os benefícios", "Suporte prioritário", "Dashboard exclusivo"],
    bloqueado: [],
    cor: { border: "#7c3aed", bg: "#f5f3ff", text: "#4c1d95", badge: "bg-purple-100 text-purple-700" },
  },
] as const;

type PlanoId = "basico" | "regional" | "premium" | "ultra";

const PLANO_BADGE: Record<string, string> = {
  basico:   "bg-orange-100 text-orange-700",
  regional: "bg-gray-100 text-gray-700",
  premium:  "bg-amber-100 text-amber-700",
  ultra:    "bg-purple-100 text-purple-700",
  destaque: "bg-purple-100 text-purple-700",
};

function MercadosTab() {
  const qc = useQueryClient();
  const [view, setView] = useState<"lista" | "analytics">("lista");
  const [filtro, setFiltro] = useState({ nome: "", status: "" });
  const [modal, setModal] = useState<{ mode: "create" | "edit"; data?: MercadoPatrocinado } | null>(null);
  const [extendModal, setExtendModal] = useState<{ id: number; nome: string } | null>(null);
  const [mercConfirmAction, setMercConfirmAction] = useState<{ msg: string; onConfirm: () => void } | null>(null);

  const { data: mercados = [], isLoading } = useGetAdminMercadosPatrocinados({
    query: { queryKey: getGetAdminMercadosPatrocinadosQueryKey() },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: getGetAdminMercadosPatrocinadosQueryKey() });

  const { mutate: criar } = useCreateMercadoPatrocinado({
    mutation: {
      onSuccess: () => { toast({ title: "🎉 Campanha criada com sucesso!" }); invalidate(); setModal(null); },
      onError: () => toast({ title: "Erro ao criar campanha", variant: "destructive" }),
    },
  });
  const { mutate: atualizar } = useUpdateMercadoPatrocinado({
    mutation: {
      onSuccess: () => { toast({ title: "✅ Campanha atualizada!" }); invalidate(); setModal(null); },
      onError: () => toast({ title: "Erro ao atualizar", variant: "destructive" }),
    },
  });
  const { mutate: excluir } = useDeleteMercadoPatrocinado({
    mutation: {
      onSuccess: () => { toast({ title: "Campanha encerrada" }); invalidate(); },
      onError: () => toast({ title: "Erro ao excluir", variant: "destructive" }),
    },
  });
  const { mutate: atualizarStatus } = useUpdateMercadoPatrocinadoStatus({
    mutation: {
      onSuccess: () => { toast({ title: "Status atualizado" }); invalidate(); },
      onError: () => toast({ title: "Erro", variant: "destructive" }),
    },
  });
  const { mutate: extender } = useExtenderMercadoPatrocinado({
    mutation: {
      onSuccess: () => { toast({ title: "📅 Campanha estendida!" }); invalidate(); setExtendModal(null); },
      onError: () => toast({ title: "Erro ao estender", variant: "destructive" }),
    },
  });

  const ativos   = (mercados as MercadoPatrocinado[]).filter((m) => m.status === "ativo").length;
  const pausados = (mercados as MercadoPatrocinado[]).filter((m) => m.status === "pausado").length;

  const filtered = (mercados as MercadoPatrocinado[]).filter((m) => {
    if (filtro.nome && !m.nomeExibicao.toLowerCase().includes(filtro.nome.toLowerCase()) && !m.nomeMercado.toLowerCase().includes(filtro.nome.toLowerCase())) return false;
    if (filtro.status && m.status !== filtro.status) return false;
    return true;
  });

  return (
    <motion.div key="mercados" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">

      {/* ── Cabeçalho premium ── */}
      <div className="rounded-2xl p-4 text-white" style={{ background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 60%, #4c1d95 100%)" }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">🎯</span>
              <h2 className="text-base font-black text-white">Mídia Local & Patrocinados</h2>
            </div>
            <p className="text-indigo-200 text-xs">Gerencie campanhas de mercados parceiros no app</p>
            <div className="flex gap-3 mt-2">
              <span className="text-xs font-bold text-white bg-white/20 px-2 py-0.5 rounded-full">
                {ativos} ativas
              </span>
              {pausados > 0 && (
                <span className="text-xs font-bold text-amber-200 bg-white/10 px-2 py-0.5 rounded-full">
                  {pausados} pausadas
                </span>
              )}
              <span className="text-xs text-indigo-300">{mercados.length} total</span>
            </div>
          </div>
          <button
            onClick={() => setModal({ mode: "create" })}
            className="shrink-0 text-sm font-black px-4 py-2 rounded-xl transition-all hover:scale-105"
            style={{ background: "#84cc16", color: "#1e1b4b" }}
          >
            + Nova Campanha
          </button>
        </div>
      </div>

      {/* ── View toggle ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex rounded-xl border border-gray-200 overflow-hidden text-xs font-bold bg-white">
          <button
            onClick={() => setView("lista")}
            className={cn("px-4 py-2 transition-colors", view === "lista" ? "text-white" : "text-gray-500 hover:bg-gray-50")}
            style={view === "lista" ? { background: "#1e1b4b" } : {}}
          >
            📋 Campanhas
          </button>
          <button
            onClick={() => setView("analytics")}
            className={cn("px-4 py-2 transition-colors border-l border-gray-200", view === "analytics" ? "text-white" : "text-gray-500 hover:bg-gray-50")}
            style={view === "analytics" ? { background: "#1e1b4b" } : {}}
          >
            📊 Analytics
          </button>
        </div>

        {view === "lista" && (
          <>
            <input
              type="text"
              placeholder="🔍 Buscar campanha..."
              value={filtro.nome}
              onChange={(e) => setFiltro((f) => ({ ...f, nome: e.target.value }))}
              className="text-xs border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200 bg-white text-gray-700 w-44"
            />
            <select
              value={filtro.status}
              onChange={(e) => setFiltro((f) => ({ ...f, status: e.target.value }))}
              className="text-xs border border-gray-200 rounded-xl px-3 py-2 focus:outline-none bg-white text-gray-700"
            >
              <option value="">Todos</option>
              <option value="ativo">✅ Ativas</option>
              <option value="pausado">⏸ Pausadas</option>
              <option value="expirado">❌ Expiradas</option>
            </select>
          </>
        )}
      </div>

      {view === "analytics" ? (
        <ComercialDashboard />
      ) : isLoading ? (
        <LoadingSkeleton />
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <div className="text-5xl">🏪</div>
          <p className="text-base font-bold text-gray-700">Nenhuma campanha cadastrada</p>
          <p className="text-sm text-gray-400">Clique em "Nova Campanha" para começar</p>
          <button
            onClick={() => setModal({ mode: "create" })}
            className="mt-2 text-sm font-bold px-5 py-2.5 rounded-xl text-white transition-colors hover:opacity-90"
            style={{ background: "#1e1b4b" }}
          >
            + Criar primeira campanha
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((m: MercadoPatrocinado) => {
            const plano = PLANOS_CONFIG.find((p) => p.id === m.planoPatrocinio) ?? PLANOS_CONFIG[0];
            const urgente = m.diasRestantes <= 3 && m.status === "ativo";
            return (
              <div
                key={m.id}
                className={cn(
                  "bg-white rounded-2xl border shadow-sm overflow-hidden transition-all",
                  m.status === "expirado" ? "opacity-50 border-gray-100" : "border-gray-100 hover:shadow-md",
                  urgente && "border-red-200"
                )}
              >
                {/* Top accent bar */}
                <div
                  className="h-1 w-full"
                  style={{ background: m.status === "ativo" ? "#84cc16" : m.status === "pausado" ? "#f59e0b" : "#d1d5db" }}
                />

                <div className="p-4">
                  <div className="flex items-start gap-3">
                    {/* Logo */}
                    {m.logoUrl ? (
                      <img src={m.logoUrl} alt={m.nomeExibicao} className="w-12 h-12 rounded-xl object-cover shrink-0 border border-gray-100" />
                    ) : (
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0 border border-gray-100" style={{ background: "#f5f3ff" }}>
                        🏪
                      </div>
                    )}

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <p className="font-black text-gray-900 text-sm">{m.nomeExibicao}</p>
                        <span className={cn("text-[10px] font-black px-2 py-0.5 rounded-full", plano.cor.badge)}>
                          {plano.emoji} {plano.nome}
                        </span>
                        <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", STATUS_BADGE[m.status] ?? "bg-gray-100 text-gray-500")}>
                          {m.status === "ativo" ? "● Ativo" : m.status === "pausado" ? "⏸ Pausado" : "✕ Expirado"}
                        </span>
                        {m.modoTeste && (
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">
                            🧪 TESTE
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mb-2">{m.nomeMercado} · {m.cidade}{m.bairro ? ` · ${m.bairro}` : ""}</p>

                      {/* KPI row */}
                      <div className="flex gap-3 flex-wrap">
                        <div className="text-center">
                          <p className="text-sm font-black text-gray-800">{m.totalExibicoes.toLocaleString("pt-BR")}</p>
                          <p className="text-[9px] text-gray-400 uppercase tracking-wide">Impressões</p>
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-black text-gray-800">{m.totalCliques.toLocaleString("pt-BR")}</p>
                          <p className="text-[9px] text-gray-400 uppercase tracking-wide">Cliques</p>
                        </div>
                        <div className="text-center">
                          <p className={cn("text-sm font-black", m.ctr >= 5 ? "text-lime-600" : m.ctr >= 1 ? "text-amber-600" : "text-gray-400")}>
                            {m.ctr.toFixed(1)}%
                          </p>
                          <p className="text-[9px] text-gray-400 uppercase tracking-wide">CTR</p>
                        </div>
                        <div className="text-center">
                          <p className={cn("text-sm font-black", urgente ? "text-red-600" : "text-gray-800")}>
                            {m.status === "ativo" ? (m.diasRestantes === 0 ? "Hoje" : `${m.diasRestantes}d`) : new Date(m.dataFim).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                          </p>
                          <p className="text-[9px] text-gray-400 uppercase tracking-wide">{m.status === "ativo" ? "Restantes" : "Encerrou"}</p>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <button
                        onClick={() => setModal({ mode: "edit", data: m })}
                        className="text-xs font-bold px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
                      >
                        ✏️ Editar
                      </button>
                      <button
                        onClick={() => setExtendModal({ id: m.id, nome: m.nomeExibicao })}
                        className="text-xs font-bold px-3 py-1.5 rounded-lg bg-violet-50 text-violet-600 hover:bg-violet-100 transition-colors"
                      >
                        📅 +Dias
                      </button>
                      {m.status === "ativo" ? (
                        <button
                          onClick={() => atualizarStatus({ id: m.id, data: { status: "pausado" } })}
                          className="text-xs font-bold px-3 py-1.5 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 transition-colors"
                        >
                          ⏸ Pausar
                        </button>
                      ) : m.status === "pausado" ? (
                        <button
                          onClick={() => atualizarStatus({ id: m.id, data: { status: "ativo" } })}
                          className="text-xs font-bold px-3 py-1.5 rounded-lg bg-lime-50 text-lime-700 hover:bg-lime-100 transition-colors"
                        >
                          ▶ Ativar
                        </button>
                      ) : null}
                      <button
                        onClick={() => { setMercConfirmAction({ msg: `Encerrar campanha "${m.nomeExibicao}"?`, onConfirm: () => excluir({ id: m.id }) }); }}
                        className="text-xs font-bold px-3 py-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                      >
                        ✕
                      </button>
                      {m.modoTeste && m.status === "ativo" && (
                        <button
                          onClick={() => { setMercConfirmAction({ msg: `Desativar campanha de teste "${m.nomeExibicao}"?`, onConfirm: () => atualizarStatus({ id: m.id, data: { status: "pausado" } }) }); }}
                          className="text-xs font-bold px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors border border-amber-200 text-center"
                        >
                          🧪 Desativar
                        </button>
                      )}
                    </div>
                  </div>

                  {urgente && (
                    <div className="mt-3 flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      <span className="text-sm">⚠️</span>
                      <p className="text-xs font-bold text-red-700">
                        {m.diasRestantes === 0 ? "Campanha expira hoje!" : `Expira em ${m.diasRestantes} dia${m.diasRestantes > 1 ? "s" : ""}!`}
                        <button onClick={() => setExtendModal({ id: m.id, nome: m.nomeExibicao })} className="ml-2 underline">
                          Renovar agora
                        </button>
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <MercadoModal
          mode={modal.mode}
          data={modal.data}
          onClose={() => setModal(null)}
          onSave={(body) => {
            if (modal.mode === "create") criar({ data: body });
            else if (modal.data) atualizar({ id: modal.data.id, data: body });
          }}
        />
      )}
      {extendModal && (
        <ExtendModal
          nome={extendModal.nome}
          onClose={() => setExtendModal(null)}
          onConfirm={(dias) => extender({ id: extendModal.id, data: { dias } })}
        />
      )}
      {/* Confirmação local (substitui confirm()) */}
      {mercConfirmAction && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl p-6 shadow-xl max-w-sm w-full mx-4">
            <p className="text-sm font-bold text-gray-800 mb-4">{mercConfirmAction.msg}</p>
            <div className="flex gap-3">
              <button onClick={() => setMercConfirmAction(null)} className="flex-1 py-2 rounded-xl border text-sm font-bold text-gray-600">Cancelar</button>
              <button onClick={() => { mercConfirmAction.onConfirm(); setMercConfirmAction(null); }} className="flex-1 py-2 rounded-xl bg-red-500 text-white text-sm font-bold">Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ── Extend Modal ────────────────────────────────────────────────────────────────
function ExtendModal({
  nome,
  onClose,
  onConfirm,
}: {
  nome: string;
  onClose: () => void;
  onConfirm: (dias: number) => void;
}) {
  const [dias, setDias] = useState(30);
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-gray-900">📅 Estender Campanha</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <p className="text-sm text-gray-500">
          Estendendo: <span className="font-semibold text-gray-800">{nome}</span>
        </p>
        <div>
          <label className="text-xs font-bold text-gray-600 block mb-2">Dias a adicionar</label>
          <div className="flex items-center gap-2">
            {[7, 15, 30, 60, 90].map((d) => (
              <button
                key={d}
                onClick={() => setDias(d)}
                className={cn(
                  "text-xs font-bold px-2 py-1.5 rounded-lg border transition-colors",
                  dias === d ? "bg-purple-600 text-white border-purple-600" : "bg-white text-gray-600 hover:bg-gray-50"
                )}
              >
                {d}d
              </button>
            ))}
          </div>
          <input
            type="number"
            min={1}
            max={365}
            value={dias}
            onChange={(e) => setDias(Number(e.target.value))}
            className="mt-2 w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-300"
            placeholder="ou digite manualmente..."
          />
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 text-sm font-bold px-4 py-2 rounded-lg border text-gray-600 hover:bg-gray-50 transition-colors">
            Cancelar
          </button>
          <button
            onClick={() => dias >= 1 && dias <= 365 && onConfirm(dias)}
            className="flex-1 text-sm font-bold px-4 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors"
          >
            + {dias} dias
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ComercialDashboard ───────────────────────────────────────────────────────────
function ComercialDashboard() {
  const [periodo, setPeriodo] = useState(7);
  const [cidade, setCidade] = useState("");

  const params = { periodo, ...(cidade ? { cidade } : {}) };
  const { data, isLoading, error } = useGetComercialAnalytics(params);

  const analytics = data as ComercialAnalytics | undefined;

  // Helper for CSS bar chart
  function CssBar({ value, max, color = "bg-lime-500", label }: { value: number; max: number; color?: string; label?: string }) {
    const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
    return (
      <div className="flex items-center gap-2 min-w-0">
        {label && <span className="text-[10px] text-gray-500 w-6 text-right shrink-0">{label}</span>}
        <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
          <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[10px] text-gray-600 w-8 text-right shrink-0">{value}</span>
      </div>
    );
  }

  if (isLoading) return <LoadingSkeleton />;
  if (error || !analytics) return <EmptyState msg="Erro ao carregar analytics comercial." />;

  const kpis = analytics.kpis;
  const evolucao = analytics.evolucaoDiaria ?? [];
  const porHora = analytics.cliquePorHora ?? [];
  const porBairro = analytics.ctrPorBairro ?? [];
  const ranking = analytics.ranking ?? [];
  const dispositivos = analytics.dispositivoSplit ?? [];

  const maxEvolucaoImpr = Math.max(...evolucao.map((r) => r.impressoes), 1);
  const maxEvolucaoCliq = Math.max(...evolucao.map((r) => r.cliques), 1);
  const maxHoraCliq = Math.max(...porHora.map((r) => r.cliques), 1);

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex rounded-lg border overflow-hidden text-xs font-bold">
          {[7, 30, 90].map((p) => (
            <button
              key={p}
              onClick={() => setPeriodo(p)}
              className={cn("px-3 py-1.5 transition-colors", periodo === p ? "bg-gray-900 text-white" : "bg-white text-gray-500 hover:bg-gray-50", p !== 7 && "border-l")}
            >
              {p}d
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Filtrar por cidade..."
          value={cidade}
          onChange={(e) => setCidade(e.target.value)}
          className="text-xs border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white w-40"
        />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: "Impressões", value: kpis.totalImpressoes.toLocaleString("pt-BR"), icon: "👁", color: "bg-blue-50 border-blue-100" },
          { label: "Cliques", value: kpis.totalCliques.toLocaleString("pt-BR"), icon: "👆", color: "bg-lime-50 border-lime-100" },
          { label: "CTR Médio", value: `${kpis.ctrMedio.toFixed(1)}%`, icon: "📈", color: "bg-purple-50 border-purple-100" },
          { label: "Ativas", value: kpis.campanhasAtivas.toString(), icon: "✅", color: "bg-green-50 border-green-100" },
          { label: "Pausadas", value: kpis.campanhasPausadas.toString(), icon: "⏸", color: "bg-amber-50 border-amber-100" },
          { label: "Expiradas", value: kpis.campanhasExpiradas.toString(), icon: "❌", color: "bg-gray-50 border-gray-100" },
        ].map((k) => (
          <div key={k.label} className={cn("rounded-xl border p-3 space-y-1", k.color)}>
            <div className="text-xl">{k.icon}</div>
            <div className="text-lg font-bold text-gray-900">{k.value}</div>
            <div className="text-[11px] text-gray-500">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Evolução Diária */}
      {evolucao.length > 0 && (
        <div className="bg-white rounded-xl border p-4 space-y-3">
          <h3 className="text-sm font-bold text-gray-800">📅 Evolução Diária</h3>
          <div className="space-y-1.5">
            {evolucao.map((r) => (
              <div key={r.data} className="space-y-0.5">
                <div className="text-[10px] text-gray-400 font-medium">
                  {new Date(r.data + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" })}
                  <span className="ml-2 text-gray-300">CTR {r.ctr.toFixed(1)}%</span>
                </div>
                <CssBar value={r.impressoes} max={maxEvolucaoImpr} color="bg-blue-400" />
                <CssBar value={r.cliques} max={maxEvolucaoCliq} color="bg-lime-500" />
              </div>
            ))}
          </div>
          <div className="flex gap-3 text-[10px] text-gray-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />Impressões</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-lime-500 inline-block" />Cliques</span>
          </div>
        </div>
      )}

      {/* Cliques por Hora + Dispositivos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {porHora.length > 0 && (
          <div className="bg-white rounded-xl border p-4 space-y-3">
            <h3 className="text-sm font-bold text-gray-800">🕐 Cliques por Hora</h3>
            <div className="space-y-1">
              {[6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,0,1,2,3,4,5].map((h) => {
                const row = porHora.find((r) => r.hora === h);
                return (
                  <CssBar
                    key={h}
                    value={row?.cliques ?? 0}
                    max={maxHoraCliq}
                    color="bg-purple-500"
                    label={`${String(h).padStart(2, "0")}h`}
                  />
                );
              })}
            </div>
          </div>
        )}

        {dispositivos.length > 0 && (
          <div className="bg-white rounded-xl border p-4 space-y-3">
            <h3 className="text-sm font-bold text-gray-800">📱 Dispositivos</h3>
            <div className="space-y-3">
              {dispositivos.map((d) => (
                <div key={d.dispositivo} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium text-gray-700 capitalize">
                      {d.dispositivo === "mobile" ? "📱 Mobile" : "🖥 Web"}
                    </span>
                    <span className="text-gray-500">{d.percentual}% · {d.total.toLocaleString("pt-BR")} eventos</span>
                  </div>
                  <div className="bg-gray-100 rounded-full h-3 overflow-hidden">
                    <div
                      className={cn("h-full rounded-full", d.dispositivo === "mobile" ? "bg-indigo-500" : "bg-cyan-500")}
                      style={{ width: `${d.percentual}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Ranking de Bairros */}
            {porBairro.length > 0 && (
              <div className="mt-4 pt-4 border-t space-y-2">
                <h4 className="text-xs font-bold text-gray-600 uppercase tracking-wide">CTR por Bairro</h4>
                <div className="space-y-1.5">
                  {porBairro.slice(0, 6).map((b, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-gray-700 truncate max-w-[60%]">
                        {b.bairro ? `${b.bairro} · ${b.cidade}` : b.cidade}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-gray-400">{b.cliques}clq</span>
                        <span className={cn(
                          "font-bold",
                          b.ctr >= 5 ? "text-lime-600" : b.ctr >= 1 ? "text-amber-600" : "text-gray-400"
                        )}>
                          {b.ctr.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Ranking de Campanhas */}
      {ranking.length > 0 && (
        <div className="bg-white rounded-xl border p-4 space-y-3">
          <h3 className="text-sm font-bold text-gray-800">🏆 Ranking de Campanhas</h3>
          <div className="space-y-2">
            {ranking.map((r, i) => (
              <div key={r.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                <span className={cn(
                  "text-sm font-black w-6 text-center shrink-0",
                  i === 0 ? "text-yellow-500" : i === 1 ? "text-gray-400" : i === 2 ? "text-amber-600" : "text-gray-300"
                )}>
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{r.nomeExibicao}</p>
                  <p className="text-[11px] text-gray-400">{r.cidade}</p>
                </div>
                <div className="text-right shrink-0 space-y-0.5">
                  <p className="text-xs text-gray-500">{r.impressoes.toLocaleString("pt-BR")} impressões</p>
                  <p className="text-xs font-bold text-gray-700">{r.cliques.toLocaleString("pt-BR")} cliques</p>
                </div>
                <div className="shrink-0 text-right">
                  <span className={cn(
                    "text-sm font-black",
                    r.ctr >= 5 ? "text-lime-600" : r.ctr >= 2 ? "text-amber-500" : "text-gray-400"
                  )}>
                    {r.ctr.toFixed(1)}%
                  </span>
                  <p className="text-[10px] text-gray-400">CTR</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state for no data */}
      {evolucao.length === 0 && ranking.length === 0 && (
        <div className="bg-white rounded-xl border p-8 text-center space-y-2">
          <div className="text-4xl">📊</div>
          <p className="text-sm font-semibold text-gray-700">Sem dados no período</p>
          <p className="text-xs text-gray-400">Quando houver impressões e cliques registrados, as métricas aparecerão aqui.</p>
        </div>
      )}
    </div>
  );
}

// ── MercadoModal — wizard multi-passo ──────────────────────────────────────────
type MercadoSugerido = {
  id: number;
  nome: string;
  bairro?: string | null;
  cidade?: string | null;
  lat?: number | null;
  lng?: number | null;
};

const STEP_LABELS = ["Dados", "Plano", "Campanha", "Preview"];

function WizardStepper({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-0 px-6 py-3 border-b bg-gray-50">
      {STEP_LABELS.map((label, i) => (
        <div key={i} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center gap-0.5">
            <div
              className={cn(
                "w-7 h-7 rounded-full flex items-center justify-center text-xs font-black transition-all",
                i < step
                  ? "text-white"
                  : i === step
                  ? "text-white ring-2 ring-offset-1"
                  : "bg-gray-200 text-gray-400"
              )}
              style={i <= step ? { background: i < step ? "#84cc16" : "#1e1b4b" } : {}}
            >
              {i < step ? "✓" : i + 1}
            </div>
            <span className={cn("text-[9px] font-bold uppercase tracking-wide", i === step ? "text-indigo-900" : "text-gray-400")}>
              {label}
            </span>
          </div>
          {i < total - 1 && (
            <div className="flex-1 h-0.5 mx-1 mb-3" style={{ background: i < step ? "#84cc16" : "#e5e7eb" }} />
          )}
        </div>
      ))}
    </div>
  );
}

function MercadoModal({
  mode,
  data,
  onClose,
  onSave,
}: {
  mode: "create" | "edit";
  data?: MercadoPatrocinado;
  onClose: () => void;
  onSave: (body: CreateMercadoPatrocinadoBody) => void;
}) {
  const toDateInput = (iso?: string) => iso ? iso.slice(0, 10) : "";
  const today = new Date().toISOString().slice(0, 10);
  const in30 = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);

  const [step, setStep] = useState(0);
  const [searchQ, setSearchQ] = useState(data?.nomeMercado ?? "");
  const [sugestoes, setSugestoes] = useState<MercadoSugerido[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSugestoes, setShowSugestoes] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [form, setForm] = useState({
    nomeMercado:           data?.nomeMercado ?? "",
    nomeExibicao:          data?.nomeExibicao ?? "",
    logoUrl:               data?.logoUrl ?? "",
    cidade:                data?.cidade ?? "",
    bairro:                data?.bairro ?? "",
    latitude:              data?.latitude ?? undefined as number | undefined,
    longitude:             data?.longitude ?? undefined as number | undefined,
    planoPatrocinio:       (data?.planoPatrocinio ?? "basico") as PlanoId,
    dataInicio:            toDateInput(data?.dataInicio) || today,
    dataFim:               toDateInput(data?.dataFim) || in30,
    limiteExibicoesDiarias: data?.limiteExibicoesDiarias ?? undefined as number | undefined,
    nomeCampanha:          "",
    observacoes:           data?.observacoes ?? "",
  });

  const selectedPlano = PLANOS_CONFIG.find((p) => p.id === form.planoPatrocinio) ?? PLANOS_CONFIG[0];

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function doSearch(q: string) {
    if (!q.trim()) { setSugestoes([]); return; }
    setSearching(true);
    fetch(`/api/mercados/buscar?q=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then((rows: MercadoSugerido[]) => { setSugestoes(rows ?? []); setShowSugestoes(true); })
      .catch(() => {})
      .finally(() => setSearching(false));
  }

  function onSearchChange(v: string) {
    setSearchQ(v);
    set("nomeMercado", v);
    if (!form.nomeExibicao || form.nomeExibicao === form.nomeMercado) set("nomeExibicao", v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => doSearch(v), 300);
  }

  function pickSugestao(s: MercadoSugerido) {
    setSearchQ(s.nome);
    setShowSugestoes(false);
    setForm((f) => ({
      ...f,
      nomeMercado: s.nome,
      nomeExibicao: f.nomeExibicao || s.nome,
      cidade: s.cidade ?? f.cidade,
      bairro: s.bairro ?? f.bairro,
      latitude: s.lat ?? f.latitude,
      longitude: s.lng ?? f.longitude,
    }));
  }

  function canAdvance() {
    if (step === 0) return !!(form.nomeMercado.trim() && form.nomeExibicao.trim() && form.cidade.trim());
    if (step === 1) return !!form.planoPatrocinio;
    if (step === 2) return !!(form.dataInicio && form.dataFim && form.dataFim >= form.dataInicio);
    return true;
  }

  function handleSave() {
    const obs = [form.nomeCampanha ? `Campanha: ${form.nomeCampanha}` : "", form.observacoes].filter(Boolean).join("\n").trim();
    onSave({
      nomeMercado: form.nomeMercado,
      nomeExibicao: form.nomeExibicao,
      logoUrl: form.logoUrl || undefined,
      cidade: form.cidade,
      bairro: form.bairro || undefined,
      latitude: form.latitude,
      longitude: form.longitude,
      planoPatrocinio: form.planoPatrocinio,
      dataInicio: form.dataInicio,
      dataFim: form.dataFim,
      prioridade: selectedPlano.prioridade,
      limiteExibicoesDiarias: form.limiteExibicoesDiarias,
      observacoes: obs || undefined,
    });
  }

  const durDias = form.dataInicio && form.dataFim
    ? Math.max(0, Math.round((new Date(form.dataFim).getTime() - new Date(form.dataInicio).getTime()) / 86400_000))
    : 0;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-4 overflow-hidden text-gray-900">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4" style={{ background: "#1e1b4b" }}>
          <div>
            <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest">
              {mode === "create" ? "Nova campanha" : "Editar campanha"}
            </p>
            <h3 className="text-base font-black text-white">
              {step === 0 && "Dados do Mercado"}
              {step === 1 && "Escolha o Plano"}
              {step === 2 && "Período da Campanha"}
              {step === 3 && "Preview ao Vivo"}
            </h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white text-xl font-bold transition-colors">
            ×
          </button>
        </div>

        {/* ── Progress bar ── */}
        <div className="h-1 bg-indigo-100">
          <div
            className="h-full transition-all duration-500"
            style={{ width: `${((step + 1) / 4) * 100}%`, background: "#84cc16" }}
          />
        </div>

        {/* ── Stepper ── */}
        <WizardStepper step={step} total={4} />

        {/* ── Step content ── */}
        <div className="px-6 py-5 space-y-4 max-h-[55vh] overflow-y-auto">

          {/* ── Passo 1: Dados ── */}
          {step === 0 && (
            <div className="space-y-3">
              {/* Smart search */}
              <div className="relative">
                <label className="text-xs font-black text-gray-600 block mb-1.5">
                  🔍 Buscar mercado <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    value={searchQ}
                    onChange={(e) => onSearchChange(e.target.value)}
                    onFocus={() => sugestoes.length > 0 && setShowSugestoes(true)}
                    onBlur={() => setTimeout(() => setShowSugestoes(false), 180)}
                    placeholder="Digite o nome do mercado..."
                    className="w-full text-sm border-2 border-indigo-100 focus:border-indigo-400 rounded-xl px-4 py-2.5 focus:outline-none bg-indigo-50/30 pr-10"
                  />
                  {searching && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 animate-pulse">⏳</span>
                  )}
                </div>
                {showSugestoes && sugestoes.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
                    {sugestoes.slice(0, 6).map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => pickSugestao(s)}
                        className="w-full text-left px-4 py-2.5 hover:bg-indigo-50 transition-colors border-b border-gray-50 last:border-0"
                      >
                        <p className="text-sm font-semibold text-gray-800">{s.nome}</p>
                        <p className="text-xs text-gray-400">
                          {[s.bairro, s.cidade].filter(Boolean).join(" · ")}
                          {s.lat != null && <span className="ml-1 text-lime-600">📍</span>}
                        </p>
                      </button>
                    ))}
                    <div className="px-4 py-2 bg-gray-50 border-t">
                      <p className="text-[10px] text-gray-400">Não encontrou? Preencha os campos abaixo</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Nome exibição */}
              <div>
                <label className="text-xs font-black text-gray-600 block mb-1.5">
                  Nome de exibição no app <span className="text-red-500">*</span>
                </label>
                <input
                  value={form.nomeExibicao}
                  onChange={(e) => set("nomeExibicao", e.target.value)}
                  placeholder='Ex: "Carrefour — Preços Imbatíveis"'
                  className="w-full text-sm border-2 border-gray-100 focus:border-indigo-300 rounded-xl px-4 py-2.5 focus:outline-none"
                />
                <p className="text-[10px] text-gray-400 mt-1">Este é o nome que os usuários verão no app</p>
              </div>

              {/* Cidade + Bairro */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-black text-gray-600 block mb-1.5">
                    Cidade <span className="text-red-500">*</span>
                  </label>
                  <input
                    value={form.cidade}
                    onChange={(e) => set("cidade", e.target.value)}
                    placeholder="São Paulo"
                    className="w-full text-sm border-2 border-gray-100 focus:border-indigo-300 rounded-xl px-3 py-2.5 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-black text-gray-600 block mb-1.5">Bairro</label>
                  <input
                    value={form.bairro}
                    onChange={(e) => set("bairro", e.target.value)}
                    placeholder="Moema"
                    className="w-full text-sm border-2 border-gray-100 focus:border-indigo-300 rounded-xl px-3 py-2.5 focus:outline-none"
                  />
                </div>
              </div>

              {/* Logo URL */}
              <div>
                <label className="text-xs font-black text-gray-600 block mb-1.5">Logo URL</label>
                <input
                  value={form.logoUrl}
                  onChange={(e) => set("logoUrl", e.target.value)}
                  placeholder="https://exemplo.com/logo.png"
                  className="w-full text-sm border-2 border-gray-100 focus:border-indigo-300 rounded-xl px-4 py-2.5 focus:outline-none"
                />
              </div>

              {/* Coords info */}
              {form.latitude != null && form.longitude != null && (
                <div className="flex items-center gap-2 bg-lime-50 border border-lime-200 rounded-xl px-3 py-2">
                  <span className="text-sm">📍</span>
                  <p className="text-xs text-lime-700 font-semibold">
                    Localização definida: {form.latitude.toFixed(4)}, {form.longitude.toFixed(4)}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Passo 2: Plano ── */}
          {step === 1 && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">Escolha o plano que melhor atende ao mercado parceiro:</p>
              <div className="grid grid-cols-1 gap-3">
                {PLANOS_CONFIG.map((plano) => {
                  const isSelected = form.planoPatrocinio === plano.id;
                  return (
                    <button
                      key={plano.id}
                      type="button"
                      onClick={() => set("planoPatrocinio", plano.id as PlanoId)}
                      className={cn(
                        "w-full text-left rounded-2xl border-2 p-4 transition-all",
                        isSelected ? "shadow-md scale-[1.01]" : "hover:border-gray-300"
                      )}
                      style={isSelected ? { borderColor: plano.cor.border, background: plano.cor.bg } : { borderColor: "#e5e7eb", background: "white" }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{plano.emoji}</span>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-black text-gray-900">{plano.nome}</p>
                              {plano.id === "premium" && (
                                <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full" style={{ background: "#f59e0b", color: "white" }}>
                                  POPULAR
                                </span>
                              )}
                              {plano.id === "ultra" && (
                                <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full" style={{ background: "#7c3aed", color: "white" }}>
                                  TOP
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-500">{plano.subtitulo} · {plano.alcance}</p>
                          </div>
                        </div>
                        <div
                          className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5")}
                          style={isSelected ? { borderColor: plano.cor.border, background: plano.cor.border } : { borderColor: "#d1d5db" }}
                        >
                          {isSelected && <span className="text-white text-[10px] font-black">✓</span>}
                        </div>
                      </div>

                      <div className="mt-3 space-y-1">
                        {plano.features.map((f) => (
                          <div key={f} className="flex items-center gap-1.5 text-xs text-gray-700">
                            <span style={{ color: plano.cor.border }}>✓</span> {f}
                          </div>
                        ))}
                        {plano.bloqueado.map((f) => (
                          <div key={f} className="flex items-center gap-1.5 text-xs text-gray-300">
                            <span>✕</span> {f}
                          </div>
                        ))}
                      </div>

                      <div className="mt-2 pt-2 border-t border-dashed" style={{ borderColor: isSelected ? plano.cor.border + "40" : "#f3f4f6" }}>
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-wide">
                          Prioridade automática: {plano.prioridade}/10
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Passo 3: Campanha ── */}
          {step === 2 && (
            <div className="space-y-4">
              {/* Nome da campanha */}
              <div>
                <label className="text-xs font-black text-gray-600 block mb-1.5">
                  Nome da campanha <span className="text-gray-400 font-normal">(opcional)</span>
                </label>
                <input
                  value={form.nomeCampanha}
                  onChange={(e) => set("nomeCampanha", e.target.value)}
                  placeholder='Ex: "Festival da Carne", "Semana do Leite"'
                  className="w-full text-sm border-2 border-gray-100 focus:border-indigo-300 rounded-xl px-4 py-2.5 focus:outline-none"
                />
                <p className="text-[10px] text-gray-400 mt-1">Aparece como referência interna nas notas</p>
              </div>

              {/* Período */}
              <div>
                <label className="text-xs font-black text-gray-600 block mb-2">
                  Período da campanha <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2 mb-2">
                  {[7, 15, 30, 60, 90].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => {
                        const fim = new Date(Date.now() + d * 86400_000).toISOString().slice(0, 10);
                        set("dataInicio", today);
                        set("dataFim", fim);
                      }}
                      className={cn(
                        "text-xs font-bold px-2.5 py-1.5 rounded-lg border transition-colors",
                        form.dataFim === new Date(new Date(form.dataInicio).getTime() + d * 86400_000).toISOString().slice(0, 10)
                          ? "text-white border-transparent"
                          : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                      )}
                      style={form.dataFim === new Date(new Date(form.dataInicio).getTime() + d * 86400_000).toISOString().slice(0, 10) ? { background: "#1e1b4b" } : {}}
                    >
                      {d}d
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 block mb-1">Início</label>
                    <input
                      type="date"
                      value={form.dataInicio}
                      onChange={(e) => set("dataInicio", e.target.value)}
                      className="w-full text-sm border-2 border-gray-100 focus:border-indigo-300 rounded-xl px-3 py-2.5 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 block mb-1">Fim</label>
                    <input
                      type="date"
                      value={form.dataFim}
                      onChange={(e) => set("dataFim", e.target.value)}
                      min={form.dataInicio}
                      className="w-full text-sm border-2 border-gray-100 focus:border-indigo-300 rounded-xl px-3 py-2.5 focus:outline-none"
                    />
                  </div>
                </div>
                {durDias > 0 && (
                  <p className="text-xs text-indigo-600 font-bold mt-2">
                    ⏱ Duração: {durDias} dias
                  </p>
                )}
              </div>

              {/* Limite diário */}
              <div>
                <label className="text-xs font-black text-gray-600 block mb-1.5">
                  Limite diário de exibições <span className="text-gray-400 font-normal">(deixe em branco = sem limite)</span>
                </label>
                <input
                  type="number"
                  min={1}
                  value={form.limiteExibicoesDiarias ?? ""}
                  onChange={(e) => set("limiteExibicoesDiarias", e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="Ex: 500"
                  className="w-full text-sm border-2 border-gray-100 focus:border-indigo-300 rounded-xl px-4 py-2.5 focus:outline-none"
                />
              </div>

              {/* Obs internas */}
              <div>
                <label className="text-xs font-black text-gray-600 block mb-1.5">Notas internas</label>
                <textarea
                  value={form.observacoes}
                  onChange={(e) => set("observacoes", e.target.value)}
                  rows={2}
                  placeholder="WhatsApp do contato, Instagram, observações gerais..."
                  className="w-full text-sm border-2 border-gray-100 focus:border-indigo-300 rounded-xl px-4 py-2.5 focus:outline-none resize-none"
                />
              </div>
            </div>
          )}

          {/* ── Passo 4: Preview ── */}
          {step === 3 && (
            <div className="space-y-4">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Como aparecerá no app</p>

              {/* Mock feed card */}
              <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 p-3">
                <p className="text-[9px] text-gray-400 uppercase tracking-widest font-bold mb-2 text-center">— FEED DO USUÁRIO —</p>
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
                  <div className="flex items-center gap-3">
                    {form.logoUrl ? (
                      <img src={form.logoUrl} alt="" className="w-11 h-11 rounded-xl object-cover border border-gray-100" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    ) : (
                      <div className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl border border-gray-100" style={{ background: selectedPlano.cor.bg }}>
                        🏪
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-black text-gray-900 truncate">{form.nomeExibicao || "Nome do Mercado"}</p>
                        <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded-full", selectedPlano.cor.badge)}>
                          {selectedPlano.emoji} {selectedPlano.nome}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400">{form.cidade || "Cidade"}{form.bairro ? ` · ${form.bairro}` : ""}</p>
                    </div>
                    <span className="shrink-0 text-[9px] font-bold px-2 py-1 rounded-full bg-indigo-50 text-indigo-500">
                      Patrocinado
                    </span>
                  </div>
                </div>
              </div>

              {/* Resumo */}
              <div className="rounded-xl border border-gray-100 divide-y divide-gray-50">
                {[
                  { label: "Mercado", val: form.nomeMercado || "—" },
                  { label: "Plano", val: `${selectedPlano.emoji} ${selectedPlano.nome} (prioridade ${selectedPlano.prioridade})` },
                  { label: "Período", val: durDias > 0 ? `${new Date(form.dataInicio).toLocaleDateString("pt-BR")} → ${new Date(form.dataFim).toLocaleDateString("pt-BR")} (${durDias}d)` : "—" },
                  { label: "Localização", val: [form.cidade, form.bairro].filter(Boolean).join(" · ") || "—" },
                  ...(form.nomeCampanha ? [{ label: "Campanha", val: form.nomeCampanha }] : []),
                  ...(form.limiteExibicoesDiarias ? [{ label: "Limite/dia", val: `${form.limiteExibicoesDiarias} exibições` }] : []),
                ].map(({ label, val }) => (
                  <div key={label} className="flex justify-between items-center px-3 py-2 text-xs">
                    <span className="text-gray-500 font-bold">{label}</span>
                    <span className="text-gray-800 font-semibold text-right max-w-[60%] truncate">{val}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer navegação ── */}
        <div className="px-6 py-4 border-t bg-gray-50 flex gap-2">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="px-4 py-2.5 text-sm font-bold rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors"
            >
              ← Voltar
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-sm font-bold rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors"
            >
              Cancelar
            </button>
          )}

          {step < 3 ? (
            <button
              type="button"
              disabled={!canAdvance()}
              onClick={() => setStep((s) => s + 1)}
              className={cn(
                "flex-1 py-2.5 text-sm font-black rounded-xl transition-all",
                canAdvance() ? "text-white hover:opacity-90" : "bg-gray-100 text-gray-400 cursor-not-allowed"
              )}
              style={canAdvance() ? { background: "#1e1b4b" } : {}}
            >
              Próximo →
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSave}
              className="flex-1 py-2.5 text-sm font-black rounded-xl text-white hover:opacity-90 transition-all"
              style={{ background: "#84cc16", color: "#1e1b4b" }}
            >
              {mode === "create" ? "🚀 Criar Campanha" : "✅ Salvar Alterações"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── DicionarioTab ─────────────────────────────────────────────────────────────

const DICT_CATEGORIES = [
  "Alimentos", "Bebidas", "Limpeza", "Higiene", "Carnes",
  "Hortifruti", "Bebê", "Pet", "Laticínios", "Padaria", "Congelados", "Outros",
];

interface DicionarioItem {
  id: number;
  termo: string;
  categoria: string;
  tags: string | null;
  quantidade_confirmacoes: number;
  confianca: string;
  fonte: string;
  ultima_atualizacao: string;
}

function DicionarioTab() {
  const [items, setItems]   = useState<DicionarioItem[]>([]);
  const [total, setTotal]   = useState(0);
  const [page, setPage]     = useState(1);
  const [pages, setPages]   = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [editId, setEditId]   = useState<number | null>(null);
  const [editCat, setEditCat] = useState("");
  const [editTags, setEditTags] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [addTermo, setAddTermo] = useState("");
  const [addCat, setAddCat]   = useState("Outros");
  const [addTags, setAddTags] = useState("");
  const [saving, setSaving]   = useState(false);
  const [dicConfirmAction, setDicConfirmAction] = useState<{ msg: string; onConfirm: () => void } | null>(null);

  const token = getAdminToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["x-admin-token"] = token;

  const fetchItems = async (p: number, s: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p) });
      if (s) params.set("search", s);
      const res = await fetch(`/api/admin/dicionario?${params}`, { headers, credentials: "include" });
      const data: { items: DicionarioItem[]; total: number; pages: number } = await res.json();
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
      setPages(data.pages ?? 1);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchItems(1, ""); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchItems(1, search);
  };

  const handleDelete = (id: number) => {
    setDicConfirmAction({
      msg: "Remover este termo do dicionário?",
      onConfirm: async () => {
        await fetch(`/api/admin/dicionario/${id}`, { method: "DELETE", headers, credentials: "include" });
        fetchItems(page, search);
      },
    });
  };

  const startEdit = (item: DicionarioItem) => {
    setEditId(item.id);
    setEditCat(item.categoria);
    setEditTags(item.tags ?? "");
  };

  const handleEditSave = async () => {
    if (!editId) return;
    setSaving(true);
    try {
      await fetch(`/api/admin/dicionario/${editId}`, {
        method: "PUT", headers, credentials: "include",
        body: JSON.stringify({ categoria: editCat, tags: editTags }),
      });
      setEditId(null);
      fetchItems(page, search);
    } finally { setSaving(false); }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addTermo.trim()) return;
    setSaving(true);
    try {
      await fetch("/api/admin/dicionario", {
        method: "POST", headers, credentials: "include",
        body: JSON.stringify({ termo: addTermo.trim(), categoria: addCat, tags: addTags }),
      });
      setShowAdd(false);
      setAddTermo(""); setAddCat("Outros"); setAddTags("");
      fetchItems(1, search);
    } finally { setSaving(false); }
  };

  const confiancaColor = (c: string) =>
    c === "alta"  ? "text-green-600 bg-green-50"  :
    c === "media" ? "text-amber-600 bg-amber-50" :
                    "text-gray-400 bg-gray-100";

  return (
    <motion.div key="dicionario" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-base font-bold text-gray-800">Dicionário Inteligente</h2>
          <p className="text-xs text-gray-400">{total} termos aprendidos pela comunidade</p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="px-3 py-1.5 rounded-lg bg-lime-500 text-white text-xs font-bold hover:bg-lime-400 transition-colors"
        >
          + Novo termo
        </button>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2 mb-4">
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar termo..."
          className="flex-1 h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:border-lime-400"
        />
        <button type="submit" className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200">Buscar</button>
      </form>

      {/* Add form */}
      <AnimatePresence>
        {showAdd && (
          <motion.form
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            onSubmit={handleAdd}
            className="mb-4 p-4 bg-lime-50 rounded-xl border border-lime-200 space-y-3 overflow-hidden"
          >
            <div className="grid grid-cols-2 gap-3">
              <input
                value={addTermo} onChange={(e) => setAddTermo(e.target.value)}
                placeholder="Termo (ex: coxao mole)" required
                className="h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:border-lime-400"
              />
              <select value={addCat} onChange={(e) => setAddCat(e.target.value)} className="h-9 rounded-lg border border-gray-200 px-2 text-sm focus:outline-none bg-white">
                {DICT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <input
                value={addTags} onChange={(e) => setAddTags(e.target.value)}
                placeholder="Tags separadas por vírgula (ex: proteína,congelado)"
                className="flex-1 h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:border-lime-400"
              />
              <button type="submit" disabled={saving} className="px-4 py-1.5 rounded-lg bg-lime-500 text-white text-sm font-bold hover:bg-lime-400 disabled:opacity-60">{saving ? "..." : "Salvar"}</button>
              <button type="button" onClick={() => setShowAdd(false)} className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-sm hover:bg-gray-200">✕</button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Table */}
      {loading ? <LoadingSkeleton /> : items.length === 0 ? (
        <EmptyState msg="Nenhum termo no dicionário ainda. Os termos são aprendidos automaticamente conforme a comunidade publica ofertas." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-[11px] font-semibold uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2 text-left">Termo</th>
                <th className="px-3 py-2 text-left">Categoria</th>
                <th className="px-3 py-2 text-left">Tags</th>
                <th className="px-2 py-2 text-center">Conf.</th>
                <th className="px-2 py-2 text-center">Count</th>
                <th className="px-2 py-2 text-center">Fonte</th>
                <th className="px-3 py-2 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-xs text-gray-700">{item.termo}</td>
                  <td className="px-3 py-2">
                    {editId === item.id
                      ? <select value={editCat} onChange={(e) => setEditCat(e.target.value)} className="h-7 rounded border border-gray-200 px-1 text-xs bg-white">
                          {DICT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      : <span className="text-xs text-gray-700">{item.categoria}</span>
                    }
                  </td>
                  <td className="px-3 py-2">
                    {editId === item.id
                      ? <input value={editTags} onChange={(e) => setEditTags(e.target.value)} placeholder="tag1,tag2" className="h-7 rounded border border-gray-200 px-2 text-xs w-28 focus:outline-none" />
                      : <span className="text-xs text-gray-400">{item.tags || "–"}</span>
                    }
                  </td>
                  <td className="px-2 py-2 text-center">
                    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${confiancaColor(item.confianca)}`}>{item.confianca}</span>
                  </td>
                  <td className="px-2 py-2 text-center text-xs text-gray-500">{item.quantidade_confirmacoes}</td>
                  <td className="px-2 py-2 text-center">
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${item.fonte === "admin" ? "bg-violet-50 text-violet-600" : item.fonte === "ia" ? "bg-blue-50 text-blue-600" : "bg-gray-50 text-gray-500"}`}>
                      {item.fonte}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    {editId === item.id
                      ? <span className="flex items-center gap-1 justify-center">
                          <button onClick={handleEditSave} disabled={saving} className="px-2 py-0.5 rounded bg-lime-500 text-white text-xs font-bold hover:bg-lime-400 disabled:opacity-60">✓</button>
                          <button onClick={() => setEditId(null)} className="px-2 py-0.5 rounded bg-gray-100 text-gray-600 text-xs hover:bg-gray-200">✕</button>
                        </span>
                      : <span className="flex items-center gap-1 justify-center">
                          <button onClick={() => startEdit(item)} className="px-2 py-0.5 rounded bg-gray-100 text-gray-600 text-xs hover:bg-gray-200">✏️</button>
                          <button onClick={() => handleDelete(item.id)} className="px-2 py-0.5 rounded bg-red-50 text-red-500 text-xs hover:bg-red-100">🗑️</button>
                        </span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          {Array.from({ length: pages }, (_, i) => i + 1)
            .slice(Math.max(0, page - 3), page + 2)
            .map((p) => (
              <button key={p} onClick={() => { setPage(p); fetchItems(p, search); }}
                className={`w-8 h-8 rounded-lg text-sm font-medium ${p === page ? "bg-lime-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                {p}
              </button>
            ))}
        </div>
      )}

      {/* Confirmação local */}
      {dicConfirmAction && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl p-6 shadow-xl max-w-sm w-full mx-4">
            <p className="text-sm font-bold text-gray-800 mb-4">{dicConfirmAction.msg}</p>
            <div className="flex gap-3">
              <button onClick={() => setDicConfirmAction(null)} className="flex-1 py-2 rounded-xl border text-sm font-bold text-gray-600">Cancelar</button>
              <button onClick={() => { void dicConfirmAction.onConfirm(); setDicConfirmAction(null); }} className="flex-1 py-2 rounded-xl bg-red-500 text-white text-sm font-bold">Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
