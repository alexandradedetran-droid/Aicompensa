import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { getAdminToken } from "@/lib/admin-auth";
import { getCurrentUser } from "@/lib/current-user";
import { cn } from "@/lib/utils";

// ── Auth-aware fetch ──────────────────────────────────────────────────────────
function admFetch(path: string, opts: RequestInit = {}) {
  const token = getAdminToken();
  const user = getCurrentUser();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["x-admin-token"] = token;
  if (user?.apiToken) headers["Authorization"] = `Bearer ${user.apiToken}`;
  return fetch(path, {
    ...opts,
    credentials: "include",
    headers: { ...headers, ...(opts.headers as Record<string, string> | undefined ?? {}) },
  });
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface AdminSorteio {
  id: number;
  premio: string;
  descricao: string | null;
  dataFim: string;
  ativo: boolean;
  status: "ativo" | "encerrado" | "cancelado";
  criadoEm: string;
  participantesCount: number;
  ganhador: { nome: string; dataSorteio: string } | null;
}

interface Participante {
  id: number;
  usuarioId: number;
  nome: string;
  pontos: number;
  bloqueado: boolean;
  cuponsUsados: number;
  criadoEm: string;
}

interface CupomTx {
  id: number;
  usuarioId: number;
  nomeUsuario: string;
  delta: number;
  tipo: string;
  referenciaId: number | null;
  criadoEm: string;
}

interface RankingUser {
  id: number;
  nome: string;
  pontos: number;
  bloqueado: boolean;
  totalOfertas: number;
  cupons7d: number;
  saldoCupons: number;
  suspeito: boolean;
}

interface MissaoConfigItem {
  tipo: string;
  ativo: boolean;
  descricao: string;
  meta: number;
  premioPontos: number;
  premioCupons: number;
  missaoDoDia: boolean;
  ativosHoje: number;
  concluidasHoje: number;
}

interface AdminLogItem {
  id: number;
  adminNome: string;
  acao: string;
  usuarioAfetadoId: number | null;
  usuarioAfetadoNome: string | null;
  detalhes: string | null;
  motivo: string | null;
  criadoEm: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(dt: string) {
  return new Date(dt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
function fmtDate(dt: string) {
  return new Date(dt).toLocaleDateString("pt-BR");
}
const STATUS_COLORS = {
  ativo: "bg-green-100 text-green-700",
  encerrado: "bg-gray-100 text-gray-600",
  cancelado: "bg-red-100 text-red-700",
};
const TIPO_LABELS: Record<string, string> = {
  publicacao: "Publicação",
  confirmacao: "Confirmação",
  bonus_dia: "Bônus dia",
  compartilhamento: "Compartilhamento",
  missao: "Missão",
  missao_compartilhar: "Missão compartilhar",
  sorteio: "Sorteio / Admin",
  convite: "Convite",
};

// ── Sub-tab nav ───────────────────────────────────────────────────────────────
type SubTab = "dashboard" | "sorteios" | "participantes" | "validar" | "ranking" | "missoes" | "campanhas" | "catalogo" | "historico" | "logs";
const SUB_TABS: { id: SubTab; icon: string; label: string }[] = [
  { id: "dashboard",     icon: "📊", label: "Dashboard"    },
  { id: "campanhas",     icon: "🚀", label: "Campanhas"    },
  { id: "catalogo",      icon: "🎁", label: "Catálogo"     },
  { id: "sorteios",      icon: "🎫", label: "Sorteios"     },
  { id: "participantes", icon: "👥", label: "Participantes" },
  { id: "validar",       icon: "🔍", label: "Validar"       },
  { id: "ranking",       icon: "🏆", label: "Ranking"       },
  { id: "missoes",       icon: "🎯", label: "Missões"       },
  { id: "historico",     icon: "📜", label: "Histórico"     },
  { id: "logs",          icon: "📋", label: "Logs"          },
];

// ── Enums / labels ────────────────────────────────────────────────────────────
const PERIOCIDADE_LABELS: Record<string, string> = {
  diaria:     "📅 Diária",
  semanal:    "📆 Semanal",
  mensal:     "🗓️ Mensal",
  temporaria: "⏳ Temporária",
  especial:   "⭐ Especial",
  sazonal:    "🌊 Sazonal",
};
const TIPO_ACAO_LABELS: Record<string, string> = {
  publicar:           "🛒 Publicar oferta",
  confirmar:          "✅ Confirmar preço",
  publicar_categoria: "📦 Publicar categoria",
  publicar_mercado:   "🏪 Publicar mercado",
  compartilhar:       "📤 Compartilhar",
  qualquer:           "🌟 Qualquer ação",
};
const CATALOGO_TIPO_LABELS: Record<string, string> = {
  recompensa: "🎁 Recompensa",
  cupom:      "🎫 Cupom",
  bonus:      "⚡ Bônus",
  premiacao:  "🏆 Premiação",
};
const CATALOGO_STATUS_COLORS: Record<string, string> = {
  ativo:    "bg-green-100 text-green-700",
  inativo:  "bg-gray-100 text-gray-500",
  esgotado: "bg-red-100 text-red-700",
};

// ── Shared form input ─────────────────────────────────────────────────────────
function FInput({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-bold text-gray-600 block mb-1">{label}</label>
      {children}
    </div>
  );
}
const iCls = "w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400";

// ── Types for new features ─────────────────────────────────────────────────────
interface MissaoCampanha {
  id: number;
  titulo: string;
  descricao: string | null;
  periocidade: string;
  tipoAcao: string;
  meta: number;
  categoriaAlvo: string | null;
  mercadoAlvo: string | null;
  premioPontos: number;
  premioCupons: number;
  multiplicadorPontos: number;
  limitePorUsuario: number;
  badge: string;
  dataInicio: string;
  dataFim: string | null;
  ativo: boolean;
  criadoEm: string;
}

interface RecompensaCatalogo {
  id: number;
  nome: string;
  descricao: string | null;
  tipo: string;
  custoPontos: number;
  quantidadeDisponivel: number | null;
  validade: string | null;
  imagemUrl: string | null;
  status: string;
  criadoEm: string;
}

interface DashboardStats {
  totalCampanhasAtivas: number;
  totalSorteiosAtivos: number;
  totalRecompensasAtivas: number;
  pontosDistribuidos7d: number;
  cuponsEmitidos7d: number;
  missoesConcluidasHoje: number;
  usuariosAtivos7d: number;
  topMissoesConcluidaHoje: { tipo: string; concluidas: number; total: number }[];
  topUsuariosAtivos: { id: number; nome: string; pontos: number; totalOfertas: number; cupons7d: number }[];
}

// ── Shared empty / loading ────────────────────────────────────────────────────
function Loading() {
  return <div className="text-center py-10 text-gray-400 text-sm">Carregando…</div>;
}
function Empty({ msg }: { msg: string }) {
  return <div className="text-center py-10 text-gray-400 text-sm">{msg}</div>;
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. SORTEIOS sub-tab
// ══════════════════════════════════════════════════════════════════════════════
function SorteiosSubTab({ onGoToSorteios }: { onGoToSorteios?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-lime-50 flex items-center justify-center text-3xl mb-4">🎲</div>
      <h3 className="font-black text-gray-800 text-base mb-2">Sorteios estão na aba dedicada</h3>
      <p className="text-sm text-gray-500 max-w-xs leading-relaxed mb-6">
        O gerenciamento de sorteios — criação, regras de participação, importação de participantes e realização — está na aba <strong>Sorteios</strong> no menu lateral.
      </p>
      <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 text-left max-w-sm w-full mb-6">
        <p className="text-xs font-black text-gray-700 mb-2">O que você encontra em Sorteios:</p>
        <ul className="space-y-1 text-xs text-gray-500">
          <li>🎫 Criar sorteios com 7 regras de participação</li>
          <li>👥 Lista de participantes com probabilidade individual</li>
          <li>🔄 Importar e recalcular participantes em tempo real</li>
          <li>🎲 Realizar sorteio com resultado detalhado</li>
          <li>✏️ Alterar regra de participação após criação</li>
          <li>❌ Cancelar sorteio</li>
        </ul>
      </div>
      {onGoToSorteios && (
        <button
          onClick={onGoToSorteios}
          className="bg-lime-400 text-lime-900 font-black text-sm px-6 py-3 rounded-xl active:scale-95 transition-all hover:bg-lime-500"
        >
          🎲 Ir para Sorteios
        </button>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. PARTICIPANTES + SORTEAR sub-tab
// ══════════════════════════════════════════════════════════════════════════════
function ParticipantesSubTab() {
  const qc = useQueryClient();
  const [sorteioId, setSorteioId] = useState<number | null>(null);
  const [winner, setWinner] = useState<{ nome: string; premio: string; dataSorteio: string } | null>(null);
  const [motivo, setMotivo] = useState("");
  const [confirmarResortear, setConfirmarResortear] = useState<string | null>(null);

  const { data: sorteios = [] } = useQuery<AdminSorteio[]>({
    queryKey: ["admin", "recompensas", "sorteios"],
    queryFn: async () => {
      const r = await admFetch("/api/admin/recompensas/sorteios");
      return r.json() as Promise<AdminSorteio[]>;
    },
  });

  const { data: participantes = [], isLoading } = useQuery<Participante[]>({
    queryKey: ["admin", "recompensas", "participantes", sorteioId],
    enabled: sorteioId !== null,
    queryFn: async () => {
      const r = await admFetch(`/api/admin/recompensas/sorteios/${sorteioId}/participantes`);
      if (!r.ok) throw new Error("Erro ao carregar participantes");
      return r.json() as Promise<Participante[]>;
    },
  });

  const sortearMut = useMutation({
    mutationFn: async ({ confirmar }: { confirmar?: boolean }) => {
      const r = await admFetch(`/api/admin/recompensas/sorteios/${sorteioId}/sortear`, {
        method: "POST",
        body: JSON.stringify({ confirmar: confirmar ?? false, motivo: motivo || undefined }),
      });
      const data = await r.json() as { error?: string; ganhadorExistente?: string; ganhador?: { nome: string }; premio?: string; dataSorteio?: string };
      if (r.status === 409 && data.ganhadorExistente) {
        setConfirmarResortear(data.ganhadorExistente);
        return null;
      }
      if (!r.ok) throw new Error(data.error ?? "Erro ao sortear");
      return data;
    },
    onSuccess: (data) => {
      if (!data) return;
      setWinner({ nome: data.ganhador!.nome, premio: data.premio!, dataSorteio: data.dataSorteio! });
      setConfirmarResortear(null);
      qc.invalidateQueries({ queryKey: ["admin", "recompensas", "sorteios"] });
      qc.invalidateQueries({ queryKey: ["admin", "recompensas", "logs"] });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const totalTickets = participantes.reduce((acc, p) => acc + p.cuponsUsados, 0);

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-end flex-wrap">
        <div className="flex-1 min-w-48">
          <label className="text-xs font-bold text-gray-600 block mb-1">Selecionar Sorteio</label>
          <select value={sorteioId ?? ""} onChange={(e) => setSorteioId(e.target.value ? Number(e.target.value) : null)} className="w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white">
            <option value="">— escolha um sorteio —</option>
            {sorteios.map((s) => (
              <option key={s.id} value={s.id}>{s.premio} ({s.status}) — {s.participantesCount} participantes</option>
            ))}
          </select>
        </div>
      </div>

      {sorteioId && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-violet-50 border border-violet-100 rounded-xl p-3 text-center">
              <p className="text-2xl font-black text-violet-700">{participantes.length}</p>
              <p className="text-xs text-violet-500 font-semibold mt-0.5">Participantes</p>
            </div>
            <div className="bg-lime-50 border border-lime-100 rounded-xl p-3 text-center">
              <p className="text-2xl font-black text-lime-700">{totalTickets}</p>
              <p className="text-xs text-lime-600 font-semibold mt-0.5">Total de Tickets</p>
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-center">
              <p className="text-2xl font-black text-amber-700">{participantes.filter((p) => p.bloqueado).length}</p>
              <p className="text-xs text-amber-600 font-semibold mt-0.5">Bloqueados</p>
            </div>
          </div>

          {/* Draw section */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
            <p className="text-sm font-bold text-gray-700">🎲 Realizar Sorteio</p>
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Motivo / Observação (opcional)</label>
              <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex: Sorteio semana 21/05/2026" className="w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400" />
            </div>
            <button
              onClick={() => { if (confirm(`Sortear vencedor entre ${participantes.filter((p) => !p.bloqueado).length} participantes elegíveis (${totalTickets} tickets)?`)) sortearMut.mutate({}); }}
              disabled={sortearMut.isPending || participantes.length === 0}
              className="w-full font-black py-3 rounded-xl bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition-colors text-sm shadow"
            >
              {sortearMut.isPending ? "Sorteando…" : "🎰 Sortear Vencedor"}
            </button>
            <p className="text-xs text-gray-400">Usuários bloqueados são excluídos automaticamente. Seleção proporcional ao nº de cupons.</p>
          </div>

          {/* Participants table */}
          {isLoading ? <Loading /> : participantes.length === 0 ? <Empty msg="Nenhum participante neste sorteio." /> : (
            <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wide">
                    <th className="px-4 py-3 text-left">Usuário</th>
                    <th className="px-4 py-3 text-center">Cupons</th>
                    <th className="px-4 py-3 text-center">Pontos</th>
                    <th className="px-4 py-3 text-center">% Chance</th>
                    <th className="px-4 py-3 text-left">Entrou em</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {participantes.map((p) => (
                    <tr key={p.id} className={cn("hover:bg-gray-50 transition-colors", p.bloqueado && "bg-red-50 opacity-60")}>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-900">{p.nome}</p>
                        {p.bloqueado && <span className="text-xs text-red-500 font-bold">🚫 Bloqueado</span>}
                      </td>
                      <td className="px-4 py-3 text-center font-black text-violet-700">{p.cuponsUsados}</td>
                      <td className="px-4 py-3 text-center text-gray-600">{p.pontos.toLocaleString("pt-BR")}</td>
                      <td className="px-4 py-3 text-center text-lime-700 font-bold">
                        {totalTickets > 0 ? `${((p.cuponsUsados / totalTickets) * 100).toFixed(1)}%` : "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{fmt(p.criadoEm)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Re-sortear confirmation modal */}
      {confirmarResortear && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 text-center">
            <p className="text-3xl mb-3">⚠️</p>
            <h3 className="font-black text-gray-900 mb-2">Sorteio já realizado</h3>
            <p className="text-sm text-gray-600 mb-4">O ganhador atual é <strong>{confirmarResortear}</strong>. Deseja sortear novamente e substituir?</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmarResortear(null)} className="flex-1 text-sm font-bold px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">Não</button>
              <button onClick={() => sortearMut.mutate({ confirmar: true })} className="flex-1 text-sm font-bold px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600">Sim, sortear de novo</button>
            </div>
          </div>
        </div>
      )}

      {/* Winner celebration modal */}
      {winner && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-8 text-center">
            <p className="text-5xl mb-4">🏆</p>
            <h3 className="font-black text-gray-900 text-xl mb-1">Vencedor Sorteado!</h3>
            <p className="text-3xl font-black text-violet-700 mb-2">{winner.nome}</p>
            <p className="text-sm text-gray-500 mb-1">Prêmio: <strong>{winner.premio}</strong></p>
            <p className="text-xs text-gray-400 mb-6">Sorteado em {fmt(winner.dataSorteio)}</p>
            <button onClick={() => setWinner(null)} className="w-full text-sm font-bold px-4 py-3 rounded-xl bg-violet-600 text-white hover:bg-violet-700 transition-colors">
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 3. VALIDAR sub-tab (coupons + points adjustment)
// ══════════════════════════════════════════════════════════════════════════════
function ValidarSubTab() {
  const qc = useQueryClient();
  const [apenasRecentes, setApenasRecentes] = useState(false);
  const [tipoFiltro, setTipoFiltro] = useState("todos");
  const [motivoRemover, setMotivoRemover] = useState<Record<number, string>>({});

  // Points adjustment form
  const [ajuste, setAjuste] = useState({ usuarioId: "", delta: "", motivo: "" });
  const [ajusteResult, setAjusteResult] = useState<{ pontosAnteriores: number; pontosAtuais: number; nome?: string } | null>(null);

  const params = new URLSearchParams();
  params.set("limit", "150");
  if (tipoFiltro !== "todos") params.set("tipo", tipoFiltro);
  if (apenasRecentes) params.set("recentes", "1");

  const { data: cupons = [], isLoading, refetch } = useQuery<CupomTx[]>({
    queryKey: ["admin", "recompensas", "cupons", tipoFiltro, apenasRecentes],
    queryFn: async () => {
      const r = await admFetch(`/api/admin/recompensas/cupons?${params.toString()}`);
      if (!r.ok) throw new Error("Erro");
      return r.json() as Promise<CupomTx[]>;
    },
  });

  const removerMut = useMutation({
    mutationFn: async ({ id, motivo }: { id: number; motivo: string }) => {
      const r = await admFetch(`/api/admin/recompensas/cupons/${id}`, {
        method: "DELETE", body: JSON.stringify({ motivo }),
      });
      if (!r.ok) throw new Error("Erro ao remover");
    },
    onSuccess: (_, { id }) => {
      toast({ title: "✅ Cupom removido (entrada compensatória registrada)" });
      setMotivoRemover((m) => { const c = { ...m }; delete c[id]; return c; });
      void refetch();
      qc.invalidateQueries({ queryKey: ["admin", "recompensas", "logs"] });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const ajustarMut = useMutation({
    mutationFn: async () => {
      const r = await admFetch(`/api/admin/recompensas/usuarios/${ajuste.usuarioId}/ajustar-pontos`, {
        method: "POST", body: JSON.stringify({ delta: Number(ajuste.delta), motivo: ajuste.motivo }),
      });
      const data = await r.json() as { error?: string; pontosAnteriores?: number; pontosAtuais?: number };
      if (!r.ok) throw new Error(data.error ?? "Erro");
      return data;
    },
    onSuccess: (data) => {
      toast({ title: `✅ Pontos ajustados: ${data.pontosAnteriores} → ${data.pontosAtuais}` });
      setAjusteResult({ pontosAnteriores: data.pontosAnteriores!, pontosAtuais: data.pontosAtuais! });
      setAjuste({ usuarioId: "", delta: "", motivo: "" });
      qc.invalidateQueries({ queryKey: ["admin", "recompensas", "logs"] });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      {/* Points adjustment */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <h4 className="font-bold text-gray-800 mb-3">⚖️ Ajuste Manual de Pontos</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-bold text-gray-600 block mb-1">ID do Usuário</label>
            <input type="number" min={1} value={ajuste.usuarioId} onChange={(e) => setAjuste((a) => ({ ...a, usuarioId: e.target.value }))} className="w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400" placeholder="123" />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-600 block mb-1">Delta (+ ou -)</label>
            <input type="number" value={ajuste.delta} onChange={(e) => setAjuste((a) => ({ ...a, delta: e.target.value }))} className="w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400" placeholder="-50 ou +100" />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-600 block mb-1">Motivo *</label>
            <input value={ajuste.motivo} onChange={(e) => setAjuste((a) => ({ ...a, motivo: e.target.value }))} className="w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400" placeholder="Fraude detectada" />
          </div>
        </div>
        <button
          onClick={() => ajustarMut.mutate()}
          disabled={ajustarMut.isPending || !ajuste.usuarioId || !ajuste.delta || !ajuste.motivo}
          className="mt-3 text-sm font-bold px-5 py-2 rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 transition-colors"
        >
          {ajustarMut.isPending ? "Aplicando…" : "Aplicar Ajuste"}
        </button>
        {ajusteResult && (
          <p className="mt-2 text-xs text-amber-700 font-semibold">
            ✅ {ajusteResult.pontosAnteriores.toLocaleString("pt-BR")} → {ajusteResult.pontosAtuais.toLocaleString("pt-BR")} pts
          </p>
        )}
      </div>

      {/* Coupon transactions */}
      <div>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h4 className="font-bold text-gray-800">📋 Histórico de Cupons</h4>
          <div className="flex gap-2 items-center flex-wrap">
            <select value={tipoFiltro} onChange={(e) => setTipoFiltro(e.target.value)} className="text-xs border rounded-lg px-2 py-1.5 bg-white focus:outline-none">
              <option value="todos">Todos os tipos</option>
              <option value="publicacao">Publicação</option>
              <option value="confirmacao">Confirmação</option>
              <option value="bonus_dia">Bônus dia</option>
              <option value="missao">Missão</option>
              <option value="compartilhamento">Compartilhamento</option>
              <option value="sorteio">Sorteio / Admin</option>
            </select>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 cursor-pointer">
              <input type="checkbox" checked={apenasRecentes} onChange={(e) => setApenasRecentes(e.target.checked)} className="rounded" />
              Últimos 7 dias
            </label>
          </div>
        </div>

        {isLoading ? <Loading /> : cupons.length === 0 ? <Empty msg="Nenhuma transação encontrada." /> : (
          <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wide">
                  <th className="px-3 py-3 text-left">Usuário</th>
                  <th className="px-3 py-3 text-center">Delta</th>
                  <th className="px-3 py-3 text-left">Tipo</th>
                  <th className="px-3 py-3 text-left">Data</th>
                  <th className="px-3 py-3 text-left">Motivo / Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {cupons.map((c) => (
                  <tr key={c.id} className={cn("hover:bg-gray-50 transition-colors", c.delta < 0 && "bg-red-50/50")}>
                    <td className="px-3 py-2.5">
                      <p className="font-semibold text-gray-900">{c.nomeUsuario}</p>
                      <p className="text-xs text-gray-400">ID #{c.usuarioId}</p>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={cn("font-black text-base", c.delta > 0 ? "text-lime-600" : "text-red-500")}>
                        {c.delta > 0 ? `+${c.delta}` : c.delta}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
                        {TIPO_LABELS[c.tipo] ?? c.tipo}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-gray-500 text-xs">{fmt(c.criadoEm)}</td>
                    <td className="px-3 py-2.5">
                      {c.delta > 0 && (
                        <div className="flex gap-1 items-center">
                          <input
                            value={motivoRemover[c.id] ?? ""}
                            onChange={(e) => setMotivoRemover((m) => ({ ...m, [c.id]: e.target.value }))}
                            className="text-xs border rounded px-2 py-1 w-32 focus:outline-none focus:ring-1 focus:ring-red-300"
                            placeholder="motivo"
                          />
                          <button
                            disabled={!motivoRemover[c.id] || removerMut.isPending}
                            onClick={() => { if (confirm(`Remover cupom +${c.delta} de ${c.nomeUsuario}?`)) removerMut.mutate({ id: c.id, motivo: motivoRemover[c.id] ?? "" }); }}
                            className="text-xs px-2 py-1 rounded bg-red-100 text-red-600 hover:bg-red-200 font-semibold disabled:opacity-40 transition-colors"
                          >
                            Remover
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 4. RANKING sub-tab
// ══════════════════════════════════════════════════════════════════════════════
function RankingSubTab() {
  const qc = useQueryClient();

  const { data: users = [], isLoading } = useQuery<RankingUser[]>({
    queryKey: ["admin", "recompensas", "ranking"],
    queryFn: async () => {
      const r = await admFetch("/api/admin/recompensas/ranking");
      if (!r.ok) throw new Error("Erro");
      return r.json() as Promise<RankingUser[]>;
    },
  });

  const bloquearMut = useMutation({
    mutationFn: async (id: number) => {
      const r = await admFetch(`/api/admin/usuarios/${id}/bloquear`, { method: "POST" });
      if (!r.ok) throw new Error("Erro ao bloquear");
    },
    onSuccess: () => { toast({ title: "Usuário bloqueado" }); qc.invalidateQueries({ queryKey: ["admin", "recompensas", "ranking"] }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const suspeitos = users.filter((u) => u.suspeito);
  const top = users.filter((u) => !u.suspeito).slice(0, 20);

  return (
    <div className="space-y-6">
      {/* Suspicious users */}
      {suspeitos.length > 0 && (
        <div>
          <h4 className="font-bold text-red-700 mb-2 flex items-center gap-1.5">🚨 Usuários Suspeitos <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full font-black">{suspeitos.length}</span></h4>
          <p className="text-xs text-gray-500 mb-3">Critério: mais de 15 cupons ganhos nos últimos 7 dias com menos de 3 ofertas publicadas.</p>
          <div className="overflow-x-auto rounded-xl border border-red-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-red-50 text-xs font-bold text-red-600 uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">Usuário</th>
                  <th className="px-4 py-3 text-center">Cupons 7d</th>
                  <th className="px-4 py-3 text-center">Ofertas</th>
                  <th className="px-4 py-3 text-center">Saldo</th>
                  <th className="px-4 py-3 text-center">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {suspeitos.map((u) => (
                  <tr key={u.id} className="bg-red-50/50 hover:bg-red-50">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900">{u.nome}</p>
                      <p className="text-xs text-gray-400">ID #{u.id} · {u.pontos} pts</p>
                    </td>
                    <td className="px-4 py-3 text-center font-black text-red-600">{u.cupons7d}</td>
                    <td className="px-4 py-3 text-center text-gray-600">{u.totalOfertas}</td>
                    <td className="px-4 py-3 text-center font-semibold">{u.saldoCupons}</td>
                    <td className="px-4 py-3 text-center">
                      {!u.bloqueado ? (
                        <button onClick={() => { if (confirm(`Bloquear ${u.nome} por atividade suspeita?`)) bloquearMut.mutate(u.id); }} className="text-xs px-3 py-1 rounded-lg bg-red-500 text-white hover:bg-red-600 font-bold transition-colors">
                          🚫 Bloquear
                        </button>
                      ) : <span className="text-xs text-red-400 font-bold">Bloqueado</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top 20 */}
      <div>
        <h4 className="font-bold text-gray-800 mb-3">🏆 Top Usuários por Saldo de Cupons</h4>
        {isLoading ? <Loading /> : (
          <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">#</th>
                  <th className="px-4 py-3 text-left">Usuário</th>
                  <th className="px-4 py-3 text-center">Saldo Cupons</th>
                  <th className="px-4 py-3 text-center">Cupons 7d</th>
                  <th className="px-4 py-3 text-center">Ofertas</th>
                  <th className="px-4 py-3 text-center">Pontos</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {top.map((u, i) => (
                  <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-black text-gray-400 text-base">{i + 1}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900">{u.nome}</p>
                      <p className="text-xs text-gray-400">ID #{u.id}</p>
                    </td>
                    <td className="px-4 py-3 text-center font-black text-violet-600">{u.saldoCupons}</td>
                    <td className="px-4 py-3 text-center text-lime-700 font-semibold">+{u.cupons7d}</td>
                    <td className="px-4 py-3 text-center text-gray-600">{u.totalOfertas}</td>
                    <td className="px-4 py-3 text-center text-gray-600">{u.pontos.toLocaleString("pt-BR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 5. MISSÕES sub-tab
// ══════════════════════════════════════════════════════════════════════════════
function MissoesSubTab() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<MissaoConfigItem>>({});

  const { data: missoes = [], isLoading } = useQuery<MissaoConfigItem[]>({
    queryKey: ["admin", "recompensas", "missoes"],
    queryFn: async () => {
      const r = await admFetch("/api/admin/recompensas/missoes");
      if (!r.ok) throw new Error("Erro");
      return r.json() as Promise<MissaoConfigItem[]>;
    },
  });

  const updateMut = useMutation({
    mutationFn: async ({ tipo, data }: { tipo: string; data: Partial<MissaoConfigItem> }) => {
      const r = await admFetch(`/api/admin/recompensas/missoes/${tipo}`, {
        method: "PATCH", body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Erro ao salvar");
    },
    onSuccess: (_, { tipo }) => {
      toast({ title: "✅ Missão atualizada" });
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["admin", "recompensas", "missoes"] });
      qc.invalidateQueries({ queryKey: ["admin", "recompensas", "logs"] });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const toggleAtivo = (m: MissaoConfigItem) => {
    updateMut.mutate({ tipo: m.tipo, data: { ativo: !m.ativo } });
  };

  const toggleMissaoDoDia = (m: MissaoConfigItem) => {
    updateMut.mutate({ tipo: m.tipo, data: { missaoDoDia: !m.missaoDoDia } });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-gray-800">Missões Diárias ({missoes.length})</h3>
        <p className="text-xs text-gray-500">Mudanças aplicam-se a novos dias (não afetam missões já geradas hoje)</p>
      </div>

      {isLoading ? <Loading /> : (
        <div className="space-y-2">
          {missoes.map((m) => (
            <div key={m.tipo} className={cn("rounded-xl border bg-white shadow-sm overflow-hidden", !m.ativo && "opacity-60")}>
              <div className="flex items-start gap-3 p-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900 text-sm">{m.descricao}</p>
                    {m.missaoDoDia && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">⭐ Missão do Dia</span>}
                    {!m.ativo && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-bold">Desativada</span>}
                  </div>
                  <div className="flex gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                    <span>Meta: <strong>{m.meta}x</strong></span>
                    <span>Prêmio: <strong>{m.premioPontos}pts + {m.premioCupons} cupom(ns)</strong></span>
                    <span>Hoje: <strong>{m.ativosHoje}</strong> ativos, <strong>{m.concluidasHoje}</strong> concluídas</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 font-mono">{m.tipo}</p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={() => { setEditing(m.tipo); setEditForm({ premioPontos: m.premioPontos, premioCupons: m.premioCupons, meta: m.meta, descricao: m.descricao }); }}
                    className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 font-semibold transition-colors"
                  >✏️ Editar</button>
                  <button
                    onClick={() => toggleMissaoDoDia(m)}
                    className={cn("text-xs px-2 py-1 rounded font-semibold transition-colors", m.missaoDoDia ? "bg-amber-100 text-amber-700 hover:bg-amber-200" : "bg-gray-100 text-gray-500 hover:bg-gray-200")}
                  >{m.missaoDoDia ? "⭐ DoDia" : "☆ DoDia"}</button>
                  <button
                    onClick={() => toggleAtivo(m)}
                    className={cn("text-xs px-3 py-1 rounded font-bold transition-colors", m.ativo ? "bg-red-100 text-red-600 hover:bg-red-200" : "bg-green-100 text-green-700 hover:bg-green-200")}
                  >{m.ativo ? "Desativar" : "Ativar"}</button>
                </div>
              </div>

              {/* Inline edit form */}
              {editing === m.tipo && (
                <div className="border-t bg-gray-50 p-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                    <div>
                      <label className="text-xs font-bold text-gray-600 block mb-1">Pts Prêmio</label>
                      <input type="number" min={0} value={editForm.premioPontos ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, premioPontos: Number(e.target.value) }))} className="w-full text-sm border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-400" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-600 block mb-1">Cupons Prêmio</label>
                      <input type="number" min={0} value={editForm.premioCupons ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, premioCupons: Number(e.target.value) }))} className="w-full text-sm border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-400" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-600 block mb-1">Meta</label>
                      <input type="number" min={1} value={editForm.meta ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, meta: Number(e.target.value) }))} className="w-full text-sm border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-400" />
                    </div>
                    <div className="col-span-2 sm:col-span-1 flex items-end gap-1.5">
                      <button type="button" onClick={() => setEditing(null)} className="flex-1 text-xs font-bold px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100">Cancelar</button>
                      <button type="button" onClick={() => updateMut.mutate({ tipo: m.tipo, data: editForm })} disabled={updateMut.isPending} className="flex-1 text-xs font-bold px-3 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-60">Salvar</button>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-600 block mb-1">Descrição</label>
                    <input value={editForm.descricao ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, descricao: e.target.value }))} className="w-full text-sm border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-400" />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 6. HISTÓRICO sub-tab
// ══════════════════════════════════════════════════════════════════════════════
function HistoricoSubTab() {
  const { data: sorteios = [], isLoading } = useQuery<AdminSorteio[]>({
    queryKey: ["admin", "recompensas", "sorteios"],
    queryFn: async () => {
      const r = await admFetch("/api/admin/recompensas/sorteios");
      return r.json() as Promise<AdminSorteio[]>;
    },
  });

  const passados = sorteios.filter((s) => s.status !== "ativo");

  return (
    <div>
      <h3 className="font-bold text-gray-800 mb-4">Histórico de Sorteios ({passados.length})</h3>
      {isLoading ? <Loading /> : passados.length === 0 ? <Empty msg="Nenhum sorteio encerrado ou cancelado ainda." /> : (
        <div className="space-y-3">
          {passados.map((s) => (
            <div key={s.id} className={cn("rounded-xl border bg-white shadow-sm p-4", s.status === "cancelado" && "opacity-60 border-dashed")}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="font-bold text-gray-900">{s.premio}</p>
                    <span className={cn("px-2 py-0.5 rounded-full text-xs font-bold", STATUS_COLORS[s.status])}>{s.status}</span>
                  </div>
                  {s.descricao && <p className="text-xs text-gray-500 mb-1">{s.descricao}</p>}
                  <div className="flex gap-3 text-xs text-gray-400 flex-wrap">
                    <span>Data: {fmtDate(s.dataFim)}</span>
                    <span>{s.participantesCount} participantes</span>
                    <span>Criado: {fmt(s.criadoEm)}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {s.ganhador ? (
                    <div className="text-right">
                      <p className="text-xs text-gray-500">🏆 Vencedor</p>
                      <p className="font-black text-lime-700">{s.ganhador.nome}</p>
                      <p className="text-xs text-gray-400">{fmt(s.ganhador.dataSorteio)}</p>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400 italic">{s.status === "cancelado" ? "Cancelado sem sorteio" : "Sem ganhador registrado"}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 7. LOGS sub-tab
// ══════════════════════════════════════════════════════════════════════════════
const ACAO_LABELS: Record<string, { label: string; color: string }> = {
  criar_sorteio:          { label: "Criar Sorteio",      color: "bg-green-100 text-green-700" },
  alterar_status_sorteio: { label: "Alterar Status",     color: "bg-blue-100 text-blue-700" },
  sortear_vencedor:       { label: "Sortear Vencedor",   color: "bg-violet-100 text-violet-700" },
  remover_cupom:          { label: "Remover Cupom",      color: "bg-red-100 text-red-700" },
  ajustar_pontos:         { label: "Ajuste de Pontos",   color: "bg-amber-100 text-amber-700" },
  editar_missao:          { label: "Editar Missão",      color: "bg-gray-100 text-gray-600" },
};

function LogsSubTab() {
  const [limite, setLimite] = useState(100);
  const [filtroAcao, setFiltroAcao] = useState("todas");

  const { data: logs = [], isLoading } = useQuery<AdminLogItem[]>({
    queryKey: ["admin", "recompensas", "logs", limite],
    queryFn: async () => {
      const r = await admFetch(`/api/admin/recompensas/logs?limit=${limite}`);
      if (!r.ok) throw new Error("Erro");
      return r.json() as Promise<AdminLogItem[]>;
    },
  });

  const filtered = filtroAcao === "todas" ? logs : logs.filter((l) => l.acao === filtroAcao);

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="font-bold text-gray-800">Log de Ações Admin ({filtered.length})</h3>
        <div className="flex gap-2 items-center">
          <select value={filtroAcao} onChange={(e) => setFiltroAcao(e.target.value)} className="text-xs border rounded-lg px-2 py-1.5 bg-white focus:outline-none">
            <option value="todas">Todas as ações</option>
            {Object.entries(ACAO_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <select value={limite} onChange={(e) => setLimite(Number(e.target.value))} className="text-xs border rounded-lg px-2 py-1.5 bg-white focus:outline-none">
            <option value={50}>50 registros</option>
            <option value={100}>100 registros</option>
            <option value={250}>250 registros</option>
            <option value={500}>500 registros</option>
          </select>
        </div>
      </div>

      {isLoading ? <Loading /> : filtered.length === 0 ? <Empty msg="Nenhuma ação registrada ainda." /> : (
        <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3 text-left">Data</th>
                <th className="px-4 py-3 text-left">Admin</th>
                <th className="px-4 py-3 text-left">Ação</th>
                <th className="px-4 py-3 text-left">Usuário Afetado</th>
                <th className="px-4 py-3 text-left">Motivo / Detalhes</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((l) => {
                const ac = ACAO_LABELS[l.acao];
                let detalhesObj: Record<string, unknown> | null = null;
                try { if (l.detalhes) detalhesObj = JSON.parse(l.detalhes) as Record<string, unknown>; } catch { /* ignore */ }
                return (
                  <tr key={l.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{fmt(l.criadoEm)}</td>
                    <td className="px-4 py-3 font-semibold text-gray-700">{l.adminNome}</td>
                    <td className="px-4 py-3">
                      <span className={cn("px-2 py-0.5 rounded-full text-xs font-bold", ac?.color ?? "bg-gray-100 text-gray-600")}>
                        {ac?.label ?? l.acao}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {l.usuarioAfetadoNome ? (
                        <div>
                          <p className="font-semibold text-gray-900">{l.usuarioAfetadoNome}</p>
                          {l.usuarioAfetadoId && <p className="text-xs text-gray-400">ID #{l.usuarioAfetadoId}</p>}
                        </div>
                      ) : <span className="text-gray-400 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-xs">
                      {l.motivo && <p className="text-gray-600 font-medium mb-0.5">{l.motivo}</p>}
                      {detalhesObj && (
                        <p className="text-gray-400 font-mono line-clamp-2">
                          {Object.entries(detalhesObj).map(([k, v]) => `${k}:${String(v)}`).join(" · ")}
                        </p>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// DASHBOARD sub-tab — Parte 3
// ══════════════════════════════════════════════════════════════════════════════
function DashboardSubTab() {
  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["admin", "recompensas", "dashboard"],
    queryFn: async () => {
      const r = await admFetch("/api/admin/recompensas/dashboard");
      if (!r.ok) throw new Error("Erro ao carregar dashboard");
      return r.json() as Promise<DashboardStats>;
    },
    refetchInterval: 60_000,
  });

  if (isLoading) return <Loading />;
  if (!stats) return <Empty msg="Sem dados" />;

  const cards = [
    { icon: "🚀", label: "Campanhas ativas",      value: stats.totalCampanhasAtivas,    color: "bg-violet-50 border-violet-200 text-violet-700" },
    { icon: "🎫", label: "Sorteios ativos",        value: stats.totalSorteiosAtivos,     color: "bg-amber-50 border-amber-200 text-amber-700"   },
    { icon: "🎁", label: "Recompensas no catálogo",value: stats.totalRecompensasAtivas,  color: "bg-green-50 border-green-200 text-green-700"   },
    { icon: "🎯", label: "Missões concluídas hoje",value: stats.missoesConcluidasHoje,   color: "bg-blue-50 border-blue-200 text-blue-700"      },
    { icon: "👥", label: "Usuários ativos (7d)",   value: stats.usuariosAtivos7d,        color: "bg-pink-50 border-pink-200 text-pink-700"      },
    { icon: "🎟️",label: "Cupons emitidos (7d)",   value: stats.cuponsEmitidos7d,        color: "bg-orange-50 border-orange-200 text-orange-700"},
  ];

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {cards.map((c) => (
          <div key={c.label} className={cn("rounded-2xl border p-4 flex flex-col gap-1", c.color)}>
            <span className="text-2xl">{c.icon}</span>
            <p className="text-2xl font-black">{c.value.toLocaleString("pt-BR")}</p>
            <p className="text-xs font-semibold opacity-80">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Top missões hoje */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <h4 className="font-bold text-gray-800 mb-3 text-sm">🎯 Missões mais concluídas hoje</h4>
          {stats.topMissoesConcluidaHoje.length === 0
            ? <p className="text-gray-400 text-xs">Nenhuma missão ativa hoje</p>
            : (
              <div className="space-y-2">
                {stats.topMissoesConcluidaHoje.map((m) => (
                  <div key={m.tipo} className="flex items-center gap-2">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-700 truncate">{m.tipo}</p>
                      <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1">
                        <div
                          className="bg-violet-500 h-1.5 rounded-full transition-all"
                          style={{ width: m.total > 0 ? `${Math.min(100, (m.concluidas / m.total) * 100)}%` : "0%" }}
                        />
                      </div>
                    </div>
                    <span className="text-xs font-bold text-violet-700 shrink-0">{m.concluidas}/{m.total}</span>
                  </div>
                ))}
              </div>
            )
          }
        </div>

        {/* Top usuários */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <h4 className="font-bold text-gray-800 mb-3 text-sm">🏆 Usuários mais ativos</h4>
          {stats.topUsuariosAtivos.length === 0
            ? <p className="text-gray-400 text-xs">Sem dados ainda</p>
            : (
              <div className="space-y-2">
                {stats.topUsuariosAtivos.map((u, i) => (
                  <div key={u.id} className="flex items-center gap-2">
                    <span className="text-base shrink-0">{["🥇","🥈","🥉","4️⃣","5️⃣"][i]}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{u.nome}</p>
                      <p className="text-xs text-gray-400">{u.pontos.toLocaleString("pt-BR")} pts · {u.totalOfertas} ofertas (30d)</p>
                    </div>
                    {u.cupons7d > 0 && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-bold shrink-0">+{u.cupons7d}🎟️</span>}
                  </div>
                ))}
              </div>
            )
          }
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CAMPANHAS sub-tab — Parte 1: Missões configuráveis
// ══════════════════════════════════════════════════════════════════════════════
const CAMPANHA_BLANK = {
  titulo: "", descricao: "", periocidade: "diaria" as const,
  tipoAcao: "publicar" as const, meta: 1, categoriaAlvo: "", mercadoAlvo: "",
  premioPontos: 10, premioCupons: 1, multiplicadorPontos: 1, limitePorUsuario: 1,
  badge: "🎯", dataInicio: new Date().toISOString().slice(0, 16),
  dataFim: "", ativo: true,
};

function CampanhasSubTab() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<MissaoCampanha | null>(null);
  const [form, setForm] = useState({ ...CAMPANHA_BLANK });

  const { data: campanhas = [], isLoading } = useQuery<MissaoCampanha[]>({
    queryKey: ["admin", "recompensas", "campanhas"],
    queryFn: async () => {
      const r = await admFetch("/api/admin/recompensas/campanhas");
      if (!r.ok) throw new Error("Erro ao carregar campanhas");
      return r.json() as Promise<MissaoCampanha[]>;
    },
  });

  const inv = () => {
    qc.invalidateQueries({ queryKey: ["admin", "recompensas", "campanhas"] });
    qc.invalidateQueries({ queryKey: ["admin", "recompensas", "dashboard"] });
  };

  const criarMut = useMutation({
    mutationFn: async (data: typeof form) => {
      const body = {
        ...data,
        dataInicio: data.dataInicio || new Date().toISOString(),
        dataFim: data.dataFim || undefined,
        categoriaAlvo: data.categoriaAlvo || undefined,
        mercadoAlvo: data.mercadoAlvo || undefined,
      };
      const r = await admFetch("/api/admin/recompensas/campanhas", { method: "POST", body: JSON.stringify(body) });
      if (!r.ok) { const e = await r.json() as { error: string }; throw new Error(e.error); }
    },
    onSuccess: () => { toast({ title: "✅ Campanha criada" }); setShowForm(false); setForm({ ...CAMPANHA_BLANK }); inv(); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const editarMut = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<typeof form> }) => {
      const body = {
        ...data,
        dataFim: data.dataFim || null,
        categoriaAlvo: data.categoriaAlvo || null,
        mercadoAlvo: data.mercadoAlvo || null,
      };
      const r = await admFetch(`/api/admin/recompensas/campanhas/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      if (!r.ok) { const e = await r.json() as { error: string }; throw new Error(e.error); }
    },
    onSuccess: () => { toast({ title: "✅ Campanha salva" }); setEditing(null); inv(); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const excluirMut = useMutation({
    mutationFn: async (id: number) => {
      const r = await admFetch(`/api/admin/recompensas/campanhas/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Erro ao excluir");
    },
    onSuccess: () => { toast({ title: "🗑️ Campanha excluída" }); inv(); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const toggleAtivo = (c: MissaoCampanha) =>
    editarMut.mutate({ id: c.id, data: { ativo: !c.ativo } });

  function openEdit(c: MissaoCampanha) {
    setEditing(c);
    setForm({
      titulo: c.titulo, descricao: c.descricao ?? "", periocidade: c.periocidade as typeof form.periocidade,
      tipoAcao: c.tipoAcao as typeof form.tipoAcao, meta: c.meta,
      categoriaAlvo: c.categoriaAlvo ?? "", mercadoAlvo: c.mercadoAlvo ?? "",
      premioPontos: c.premioPontos, premioCupons: c.premioCupons,
      multiplicadorPontos: c.multiplicadorPontos, limitePorUsuario: c.limitePorUsuario,
      badge: c.badge, dataInicio: c.dataInicio.slice(0, 16),
      dataFim: c.dataFim ? c.dataFim.slice(0, 16) : "", ativo: c.ativo,
    });
    setShowForm(true);
  }

  const activeForm = editing ? (data: typeof form) => editarMut.mutate({ id: editing.id, data }) : (data: typeof form) => criarMut.mutate(data);
  const isPending = criarMut.isPending || editarMut.isPending;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-gray-800">Campanhas de Missões ({campanhas.length})</h3>
        <button
          onClick={() => { setEditing(null); setForm({ ...CAMPANHA_BLANK }); setShowForm(!showForm); }}
          className="text-xs font-bold px-3 py-1.5 rounded-xl bg-violet-600 text-white hover:bg-violet-700 transition-colors"
        >
          {showForm && !editing ? "✕ Cancelar" : "+ Nova Campanha"}
        </button>
      </div>

      {/* Create / Edit form */}
      {showForm && (
        <div className="mb-5 bg-white border border-violet-200 rounded-2xl p-5 shadow-sm">
          <h4 className="font-bold text-violet-700 mb-4 text-sm">
            {editing ? `✏️ Editar: ${editing.titulo}` : "🚀 Nova Campanha de Missão"}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <FInput label="Título *">
              <input value={form.titulo} onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))} placeholder="Ex: Missão Relâmpago" className={iCls} />
            </FInput>
            <FInput label="Badge / Ícone">
              <input value={form.badge} onChange={(e) => setForm((f) => ({ ...f, badge: e.target.value }))} placeholder="🎯" className={iCls} />
            </FInput>
            <FInput label="Periodicidade">
              <select value={form.periocidade} onChange={(e) => setForm((f) => ({ ...f, periocidade: e.target.value as typeof form.periocidade }))} className={iCls}>
                {Object.entries(PERIOCIDADE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </FInput>
            <FInput label="Tipo de ação">
              <select value={form.tipoAcao} onChange={(e) => setForm((f) => ({ ...f, tipoAcao: e.target.value as typeof form.tipoAcao }))} className={iCls}>
                {Object.entries(TIPO_ACAO_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </FInput>
            <FInput label="Meta (quantidade)">
              <input type="number" min={1} value={form.meta} onChange={(e) => setForm((f) => ({ ...f, meta: Number(e.target.value) }))} className={iCls} />
            </FInput>
            <FInput label="Limite por usuário">
              <input type="number" min={1} value={form.limitePorUsuario} onChange={(e) => setForm((f) => ({ ...f, limitePorUsuario: Number(e.target.value) }))} className={iCls} />
            </FInput>
            <FInput label="Pontos de prêmio">
              <input type="number" min={0} value={form.premioPontos} onChange={(e) => setForm((f) => ({ ...f, premioPontos: Number(e.target.value) }))} className={iCls} />
            </FInput>
            <FInput label="Cupons de prêmio">
              <input type="number" min={0} value={form.premioCupons} onChange={(e) => setForm((f) => ({ ...f, premioCupons: Number(e.target.value) }))} className={iCls} />
            </FInput>
            <FInput label="Multiplicador de pontos">
              <input type="number" min={0.1} max={10} step={0.1} value={form.multiplicadorPontos} onChange={(e) => setForm((f) => ({ ...f, multiplicadorPontos: Number(e.target.value) }))} className={iCls} />
            </FInput>
            <FInput label="Início">
              <input type="datetime-local" value={form.dataInicio} onChange={(e) => setForm((f) => ({ ...f, dataInicio: e.target.value }))} className={iCls} />
            </FInput>
            <FInput label="Encerramento (opcional)">
              <input type="datetime-local" value={form.dataFim} onChange={(e) => setForm((f) => ({ ...f, dataFim: e.target.value }))} className={iCls} />
            </FInput>
            <FInput label="Categoria alvo (opcional)">
              <input value={form.categoriaAlvo} onChange={(e) => setForm((f) => ({ ...f, categoriaAlvo: e.target.value }))} placeholder="Ex: Hortifruti" className={iCls} />
            </FInput>
            <FInput label="Mercado alvo (opcional)">
              <input value={form.mercadoAlvo} onChange={(e) => setForm((f) => ({ ...f, mercadoAlvo: e.target.value }))} placeholder="Ex: Assaí" className={iCls} />
            </FInput>
            <FInput label="Ativo">
              <select value={form.ativo ? "1" : "0"} onChange={(e) => setForm((f) => ({ ...f, ativo: e.target.value === "1" }))} className={iCls}>
                <option value="1">✅ Ativo</option>
                <option value="0">⏸️ Inativo</option>
              </select>
            </FInput>
          </div>
          <FInput label="Descrição">
            <textarea rows={2} value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} placeholder="Descrição exibida ao usuário…" className={cn(iCls, "resize-none")} />
          </FInput>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => { setShowForm(false); setEditing(null); }} className="text-xs font-bold px-4 py-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50">Cancelar</button>
            <button onClick={() => activeForm(form)} disabled={isPending || !form.titulo} className="text-xs font-bold px-4 py-2 rounded-xl bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-60">
              {isPending ? "Salvando…" : editing ? "Salvar alterações" : "Criar campanha"}
            </button>
          </div>
        </div>
      )}

      {isLoading ? <Loading /> : campanhas.length === 0 ? <Empty msg="Nenhuma campanha criada ainda. Crie a primeira acima!" /> : (
        <div className="space-y-2">
          {campanhas.map((c) => {
            const isExpired = c.dataFim && new Date(c.dataFim) < new Date();
            return (
              <div key={c.id} className={cn("rounded-2xl border bg-white shadow-sm overflow-hidden", (!c.ativo || isExpired) && "opacity-60")}>
                <div className="flex items-start gap-3 p-4">
                  <span className="text-2xl shrink-0 mt-0.5">{c.badge}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-gray-900">{c.titulo}</p>
                      <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-bold">{PERIOCIDADE_LABELS[c.periocidade] ?? c.periocidade}</span>
                      {!c.ativo && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-bold">Inativa</span>}
                      {isExpired && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold">Encerrada</span>}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{c.descricao}</p>
                    <div className="flex gap-3 mt-1.5 text-xs text-gray-500 flex-wrap">
                      <span>{TIPO_ACAO_LABELS[c.tipoAcao] ?? c.tipoAcao}</span>
                      <span>Meta: <strong>{c.meta}x</strong></span>
                      <span>Prêmio: <strong>{c.premioPontos}pts + {c.premioCupons}🎟️</strong></span>
                      {c.multiplicadorPontos !== 1 && <span>Mult: <strong>{c.multiplicadorPontos}×</strong></span>}
                      {c.categoriaAlvo && <span>Cat: <strong>{c.categoriaAlvo}</strong></span>}
                      {c.mercadoAlvo && <span>Mercado: <strong>{c.mercadoAlvo}</strong></span>}
                    </div>
                    <div className="flex gap-3 mt-1 text-xs text-gray-400 flex-wrap">
                      <span>Início: {fmtDate(c.dataInicio)}</span>
                      {c.dataFim && <span>Fim: {fmtDate(c.dataFim)}</span>}
                      <span>Limite/usuário: {c.limitePorUsuario}x</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <button onClick={() => openEdit(c)} className="text-xs px-2 py-1 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 font-semibold">✏️ Editar</button>
                    <button onClick={() => toggleAtivo(c)} className={cn("text-xs px-2 py-1 rounded-lg font-bold", c.ativo ? "bg-amber-100 text-amber-700 hover:bg-amber-200" : "bg-green-100 text-green-700 hover:bg-green-200")}>
                      {c.ativo ? "⏸️" : "▶️"}
                    </button>
                    <button onClick={() => { if (confirm(`Excluir "${c.titulo}"?`)) excluirMut.mutate(c.id); }} className="text-xs px-2 py-1 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 font-bold">🗑️</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CATÁLOGO sub-tab — Parte 2: Recompensas
// ══════════════════════════════════════════════════════════════════════════════
const CATALOGO_BLANK: {
  nome: string; descricao: string; tipo: "recompensa" | "cupom" | "bonus" | "premiacao";
  custoPontos: number; quantidadeDisponivel: string | number;
  validade: string; imagemUrl: string; status: "ativo" | "inativo" | "esgotado";
} = {
  nome: "", descricao: "", tipo: "recompensa",
  custoPontos: 100, quantidadeDisponivel: "",
  validade: "", imagemUrl: "", status: "ativo",
};

function CatalogoSubTab() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<RecompensaCatalogo | null>(null);
  const [form, setForm] = useState({ ...CATALOGO_BLANK });

  const { data: itens = [], isLoading } = useQuery<RecompensaCatalogo[]>({
    queryKey: ["admin", "recompensas", "catalogo"],
    queryFn: async () => {
      const r = await admFetch("/api/admin/recompensas/catalogo");
      if (!r.ok) throw new Error("Erro ao carregar catálogo");
      return r.json() as Promise<RecompensaCatalogo[]>;
    },
  });

  const inv = () => {
    qc.invalidateQueries({ queryKey: ["admin", "recompensas", "catalogo"] });
    qc.invalidateQueries({ queryKey: ["admin", "recompensas", "dashboard"] });
  };

  const criarMut = useMutation({
    mutationFn: async (data: typeof form) => {
      const body = {
        ...data,
        quantidadeDisponivel: data.quantidadeDisponivel !== "" ? Number(data.quantidadeDisponivel) : undefined,
        validade: data.validade || undefined,
        imagemUrl: data.imagemUrl || undefined,
        descricao: data.descricao || undefined,
      };
      const r = await admFetch("/api/admin/recompensas/catalogo", { method: "POST", body: JSON.stringify(body) });
      if (!r.ok) { const e = await r.json() as { error: string }; throw new Error(e.error); }
    },
    onSuccess: () => { toast({ title: "✅ Recompensa criada" }); setShowForm(false); setForm({ ...CATALOGO_BLANK }); setEditing(null); inv(); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const editarMut = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<typeof form> }) => {
      const body = {
        ...data,
        quantidadeDisponivel: data.quantidadeDisponivel !== "" ? Number(data.quantidadeDisponivel) : null,
        validade: data.validade || null,
        imagemUrl: data.imagemUrl || null,
      };
      const r = await admFetch(`/api/admin/recompensas/catalogo/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      if (!r.ok) { const e = await r.json() as { error: string }; throw new Error(e.error); }
    },
    onSuccess: () => { toast({ title: "✅ Recompensa salva" }); setEditing(null); setShowForm(false); inv(); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const excluirMut = useMutation({
    mutationFn: async (id: number) => {
      const r = await admFetch(`/api/admin/recompensas/catalogo/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Erro ao excluir");
    },
    onSuccess: () => { toast({ title: "🗑️ Recompensa removida" }); inv(); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  function openEdit(item: RecompensaCatalogo) {
    setEditing(item);
    setForm({
      nome: item.nome, descricao: item.descricao ?? "", tipo: item.tipo as typeof form.tipo,
      custoPontos: item.custoPontos,
      quantidadeDisponivel: item.quantidadeDisponivel ?? "",
      validade: item.validade ? item.validade.slice(0, 16) : "",
      imagemUrl: item.imagemUrl ?? "", status: item.status as typeof form.status,
    });
    setShowForm(true);
  }

  const activeForm = editing
    ? (data: typeof form) => editarMut.mutate({ id: editing.id, data })
    : (data: typeof form) => criarMut.mutate(data);
  const isPending = criarMut.isPending || editarMut.isPending;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-gray-800">Catálogo de Recompensas ({itens.length})</h3>
        <button
          onClick={() => { setEditing(null); setForm({ ...CATALOGO_BLANK }); setShowForm(!showForm); }}
          className="text-xs font-bold px-3 py-1.5 rounded-xl bg-violet-600 text-white hover:bg-violet-700 transition-colors"
        >
          {showForm && !editing ? "✕ Cancelar" : "+ Nova Recompensa"}
        </button>
      </div>

      {/* Create / Edit form */}
      {showForm && (
        <div className="mb-5 bg-white border border-violet-200 rounded-2xl p-5 shadow-sm">
          <h4 className="font-bold text-violet-700 mb-4 text-sm">
            {editing ? `✏️ Editar: ${editing.nome}` : "🎁 Nova Recompensa no Catálogo"}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <FInput label="Nome *">
              <input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} placeholder="Ex: Desconto Exclusivo 10%" className={iCls} />
            </FInput>
            <FInput label="Tipo">
              <select value={form.tipo} onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value as typeof form.tipo }))} className={iCls}>
                {Object.entries(CATALOGO_TIPO_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </FInput>
            <FInput label="Custo em pontos">
              <input type="number" min={0} value={form.custoPontos} onChange={(e) => setForm((f) => ({ ...f, custoPontos: Number(e.target.value) }))} className={iCls} />
            </FInput>
            <FInput label="Quantidade disponível (vazio = ilimitado)">
              <input type="number" min={1} value={form.quantidadeDisponivel} onChange={(e) => setForm((f) => ({ ...f, quantidadeDisponivel: e.target.value }))} placeholder="Ilimitado" className={iCls} />
            </FInput>
            <FInput label="Validade (opcional)">
              <input type="datetime-local" value={form.validade} onChange={(e) => setForm((f) => ({ ...f, validade: e.target.value }))} className={iCls} />
            </FInput>
            <FInput label="Status">
              <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as typeof form.status }))} className={iCls}>
                <option value="ativo">✅ Ativo</option>
                <option value="inativo">⏸️ Inativo</option>
                <option value="esgotado">❌ Esgotado</option>
              </select>
            </FInput>
            <div className="sm:col-span-2">
              <FInput label="URL da imagem (opcional)">
                <input value={form.imagemUrl} onChange={(e) => setForm((f) => ({ ...f, imagemUrl: e.target.value }))} placeholder="https://…" className={iCls} />
              </FInput>
            </div>
          </div>
          <FInput label="Descrição">
            <textarea rows={2} value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} placeholder="Detalhes da recompensa…" className={cn(iCls, "resize-none")} />
          </FInput>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => { setShowForm(false); setEditing(null); }} className="text-xs font-bold px-4 py-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50">Cancelar</button>
            <button onClick={() => activeForm(form)} disabled={isPending || !form.nome} className="text-xs font-bold px-4 py-2 rounded-xl bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-60">
              {isPending ? "Salvando…" : editing ? "Salvar alterações" : "Adicionar ao catálogo"}
            </button>
          </div>
        </div>
      )}

      {isLoading ? <Loading /> : itens.length === 0 ? <Empty msg="Catálogo vazio. Adicione a primeira recompensa acima!" /> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {itens.map((item) => {
            const expired = item.validade && new Date(item.validade) < new Date();
            return (
              <div key={item.id} className={cn("bg-white rounded-2xl border shadow-sm overflow-hidden", item.status !== "ativo" && "opacity-60")}>
                {item.imagemUrl && (
                  <img src={item.imagemUrl} alt={item.nome} className="w-full h-28 object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                )}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-gray-900">{item.nome}</p>
                        <span className={cn("text-xs px-2 py-0.5 rounded-full font-bold", CATALOGO_STATUS_COLORS[item.status] ?? "bg-gray-100 text-gray-500")}>
                          {item.status === "ativo" ? "Ativo" : item.status === "inativo" ? "Inativo" : "Esgotado"}
                        </span>
                        {expired && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold">Expirado</span>}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{item.descricao}</p>
                      <div className="flex gap-3 mt-2 text-xs text-gray-500 flex-wrap">
                        <span className="font-bold text-violet-700">{item.custoPontos.toLocaleString("pt-BR")} pts</span>
                        <span>{CATALOGO_TIPO_LABELS[item.tipo] ?? item.tipo}</span>
                        {item.quantidadeDisponivel != null && <span>Qtd: <strong>{item.quantidadeDisponivel}</strong></span>}
                        {item.validade && <span>Válido até: {fmtDate(item.validade)}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1.5 mt-3">
                    <button onClick={() => openEdit(item)} className="flex-1 text-xs font-bold px-2 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200">✏️ Editar</button>
                    <button
                      onClick={() => editarMut.mutate({ id: item.id, data: { status: item.status === "ativo" ? "inativo" : "ativo" } })}
                      className={cn("flex-1 text-xs font-bold px-2 py-1.5 rounded-lg", item.status === "ativo" ? "bg-amber-100 text-amber-700 hover:bg-amber-200" : "bg-green-100 text-green-700 hover:bg-green-200")}
                    >
                      {item.status === "ativo" ? "⏸️ Pausar" : "▶️ Ativar"}
                    </button>
                    <button onClick={() => { if (confirm(`Remover "${item.nome}" do catálogo?`)) excluirMut.mutate(item.id); }} className="text-xs font-bold px-2 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100">🗑️</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ROOT COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
export default function AdminRecompensasTab({ onGoToSorteios }: { onGoToSorteios?: () => void }) {
  const [subTab, setSubTab] = useState<SubTab>("dashboard");

  return (
    <div>
      {/* Sub-tab navigation */}
      <div className="flex flex-wrap gap-1.5 mb-6 p-1 bg-gray-100 rounded-xl">
        {SUB_TABS.map((st) => (
          <button
            key={st.id}
            onClick={() => setSubTab(st.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors",
              subTab === st.id
                ? "bg-white text-violet-700 shadow-sm"
                : "text-gray-500 hover:text-gray-700 hover:bg-white/50",
            )}
          >
            <span>{st.icon}</span>
            <span>{st.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      {subTab === "dashboard"     && <DashboardSubTab />}
      {subTab === "campanhas"     && <CampanhasSubTab />}
      {subTab === "catalogo"      && <CatalogoSubTab />}
      {subTab === "sorteios"      && <SorteiosSubTab onGoToSorteios={onGoToSorteios} />}
      {subTab === "participantes" && <ParticipantesSubTab />}
      {subTab === "validar"       && <ValidarSubTab />}
      {subTab === "ranking"       && <RankingSubTab />}
      {subTab === "missoes"       && <MissoesSubTab />}
      {subTab === "historico"     && <HistoricoSubTab />}
      {subTab === "logs"          && <LogsSubTab />}
    </div>
  );
}
