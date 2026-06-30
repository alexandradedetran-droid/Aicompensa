import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useLocation } from "wouter";
import {
  Gift,
  Ticket,
  Trophy,
  Star,
  Zap,
  ChevronRight,
  Calendar,
  Users,
  Share2,
  Lock,
  CheckCircle2,
  Crown,
  Flame,
  TrendingUp,
  Medal,
} from "lucide-react";
import { getCurrentUser } from "@/lib/current-user";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Types ─────────────────────────────────────────────────────────────────────
interface MissaoDiaria {
  id: number;
  tipo: string;
  descricao: string;
  meta: number;
  progresso: number;
  concluida: boolean;
  premioPontos: number;
  premioCupons: number;
}

interface SorteioAtual {
  id: number;
  premio: string;
  descricao: string | null;
  dataFim: string;
  totalParticipantes: number;
  jaParticipou: boolean;
  cuponsUsados: number;
}

interface GanhadoresItem {
  nome: string;
  premio: string;
  dataSorteio: string;
}

interface RankingItem {
  posicao: number;
  nome: string;
  pontos: number;
  streak: number;
  ofertasSemana: number;
  isMe: boolean;
}

interface Conquista {
  key: string;
  emoji: string;
  nome: string;
  descricao: string;
  desbloqueada: boolean;
}

interface DashboardData {
  usuario: {
    id: number;
    nome: string;
    pontos: number;
    cupons: number;
    cuponsAtivos: number;
    totalCuponsHistorico: number;
    nivel: string;
    nivelEmoji: string;
    nivelMin: number;
    nivelMax: number | null;
    streak: number;
  };
  missoes: MissaoDiaria[];
  sorteio: SorteioAtual | null;
  ganhadores: GanhadoresItem[];
  rankingSemanal: RankingItem[];
  conquistas: Conquista[];
}

interface HistoricoSorteioItem {
  sorteioId: number;
  nome: string;
  premio: string;
  status: string;
  cuponsUsados: number;
  ganhou: boolean;
  dataFim: string;
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────
async function fetchDashboard(): Promise<DashboardData> {
  const r = await fetch(`${BASE}/api/recompensas/dashboard`, {
    credentials: "include",
  });
  if (!r.ok) throw new Error("Falha ao carregar recompensas");
  return r.json() as Promise<DashboardData>;
}

async function participarSorteio(cuponsParticipacao: number) {
  const r = await fetch(`${BASE}/api/recompensas/sorteio/participar`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cuponsParticipacao }),
  });
  const data = await r.json() as { ok?: boolean; mensagem?: string; error?: string; cuponsRestantes?: number; totalParticipantes?: number };
  if (!r.ok) throw new Error(data.error ?? "Erro ao participar do sorteio");
  return data;
}

async function fetchHistoricoSorteios(): Promise<{ historico: HistoricoSorteioItem[] }> {
  const r = await fetch(`${BASE}/api/recompensas/historico-sorteios`, { credentials: "include" });
  if (!r.ok) return { historico: [] };
  return r.json() as Promise<{ historico: HistoricoSorteioItem[] }>;
}

async function registrarCompartilhamento() {
  const r = await fetch(`${BASE}/api/recompensas/missao/compartilhar`, {
    method: "POST",
    credentials: "include",
  });
  const data = await r.json() as { ok?: boolean; missoesConcluidas?: string[]; error?: string };
  if (!r.ok) throw new Error(data.error ?? "Erro ao registrar compartilhamento");
  return data;
}

// ── Progress calculation ──────────────────────────────────────────────────────
function calcLevelProgress(pontos: number, min: number, max: number | null): number {
  if (max === null) return 100;
  const range = max - min;
  if (range <= 0) return 100;
  return Math.min(100, Math.max(0, ((pontos - min) / range) * 100));
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "short",
  });
}

function daysUntil(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days <= 0) return "hoje";
  if (days === 1) return "amanhã";
  return `em ${days} dias`;
}

// ── Rank medal ────────────────────────────────────────────────────────────────
function RankMedal({ pos }: { pos: number }) {
  if (pos === 1) return <span className="text-xl">🥇</span>;
  if (pos === 2) return <span className="text-xl">🥈</span>;
  if (pos === 3) return <span className="text-xl">🥉</span>;
  return (
    <span className="text-sm font-black text-slate-400 w-6 text-center">
      {pos}
    </span>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────
function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-xl ${className ?? ""}`}
      style={{ background: "rgba(58,24,103,0.35)" }}
    />
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-4 px-4 pt-6 pb-8">
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-44 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Recompensas() {
  const currentUser = getCurrentUser();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["recompensas"],
    queryFn: fetchDashboard,
    enabled: !!currentUser,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const { data: historicoData } = useQuery({
    queryKey: ["historico-sorteios"],
    queryFn: fetchHistoricoSorteios,
    enabled: !!currentUser,
    staleTime: 60_000,
  });

  const participarMutation = useMutation({
    mutationFn: participarSorteio,
    onSuccess: (res) => {
      toast.success(res.mensagem ?? "Participação registrada! 🍀", {
        description: `${res.cuponsRestantes ?? 0} cupons restantes`,
        duration: 4000,
      });
      void queryClient.invalidateQueries({ queryKey: ["recompensas"] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const compartilharMutation = useMutation({
    mutationFn: async () => {
      const url = window.location.origin;
      const text = "🛒 Economize no supermercado com o AíCompensa! Veja ofertas reais da comunidade.";
      try {
        if (navigator.share) {
          await navigator.share({ title: "AíCompensa", text, url });
        } else {
          await navigator.clipboard.writeText(`${text} ${url}`);
          toast.info("Link copiado!", { description: "Cole e compartilhe com seus amigos." });
        }
      } catch {
        // user cancelled share — still register
      }
      return registrarCompartilhamento();
    },
    onSuccess: (res) => {
      const concluiu = (res.missoesConcluidas?.length ?? 0) > 0;
      if (concluiu) {
        toast.success("🎉 Missão concluída!", {
          description: `+1 cupom ganho por compartilhar`,
        });
      } else {
        toast.success("🎟️ +1 cupom ganho!", {
          description: "Continue compartilhando para completar missões",
        });
      }
      void queryClient.invalidateQueries({ queryKey: ["recompensas"] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  if (!currentUser) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-6 px-6">
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, #4c1d95, #7c3aed)" }}
        >
          <Gift className="h-10 w-10 text-white" />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-black text-white mb-2">Área de Recompensas</h2>
          <p className="text-slate-400 text-sm leading-relaxed">
            Faça login para ver seus pontos, cupons,<br />missões diárias e participar do sorteio.
          </p>
        </div>
        <button
          onClick={() => setLocation("/login")}
          className="px-8 py-3 rounded-xl font-black text-sm text-[#130926]"
          style={{ background: "linear-gradient(135deg, #F2C14E, #D4A017)" }}
        >
          Fazer Login
        </button>
      </div>
    );
  }

  if (isLoading) return <LoadingState />;

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-6">
        <p className="text-slate-400 text-sm text-center">
          Não foi possível carregar as recompensas.<br />Tente novamente.
        </p>
        <button
          onClick={() => void queryClient.invalidateQueries({ queryKey: ["recompensas"] })}
          className="px-6 py-2 rounded-xl text-sm font-bold text-white"
          style={{ background: "#3a1867" }}
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  const { usuario, missoes, sorteio, ganhadores, rankingSemanal, conquistas } = data;
  const levelProgress = calcLevelProgress(usuario.pontos, usuario.nivelMin, usuario.nivelMax);
  const concluidas = missoes.filter((m) => m.concluida).length;
  const desbloqueadas = conquistas.filter((c) => c.desbloqueada).length;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col pb-8"
      style={{ minHeight: "100vh" }}
    >
      {/* ── Header ── */}
      <div className="px-4 pt-5 pb-3">
        <div className="flex items-center gap-2 mb-1">
          <Gift className="h-5 w-5" style={{ color: "#F2C14E" }} />
          <h1 className="text-lg font-black text-white">Recompensas</h1>
        </div>
        <p className="text-xs text-slate-500">Ganhe pontos, cupons e concorra a prêmios</p>
      </div>

      {/* ── Hero card: user profile ── */}
      <div className="px-4 mb-4">
        <motion.div
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.05 }}
          className="relative overflow-hidden rounded-2xl p-5"
          style={{
            background: "linear-gradient(135deg, #1e0d3a 0%, #2d1060 50%, #1a0840 100%)",
            border: "1px solid rgba(139,92,246,0.4)",
            boxShadow: "0 8px 32px rgba(139,92,246,0.15)",
          }}
        >
          {/* Decorative glow */}
          <div
            className="absolute -top-8 -right-8 w-32 h-32 rounded-full pointer-events-none"
            style={{ background: "rgba(242,193,78,0.06)" }}
          />
          <div
            className="absolute -bottom-6 -left-6 w-24 h-24 rounded-full pointer-events-none"
            style={{ background: "rgba(139,92,246,0.08)" }}
          />

          <div className="relative">
            {/* Top row: avatar + name + level */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: "linear-gradient(135deg, #7c3aed, #4c1d95)" }}
                >
                  <span className="text-xl">{usuario.nivelEmoji}</span>
                </div>
                <div>
                  <p className="text-white font-black text-base leading-tight">
                    {usuario.nome.split(" ")[0]}
                  </p>
                  <p className="text-xs font-semibold" style={{ color: "#a78bfa" }}>
                    {usuario.nivel}
                  </p>
                </div>
              </div>
              {usuario.streak > 0 && (
                <div
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full"
                  style={{ background: "rgba(251,146,60,0.15)", border: "1px solid rgba(251,146,60,0.3)" }}
                >
                  <Flame className="h-3 w-3 text-orange-400" />
                  <span className="text-orange-400 text-xs font-black">{usuario.streak}d</span>
                </div>
              )}
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div
                className="rounded-xl p-3 flex items-center gap-2.5"
                style={{ background: "rgba(242,193,78,0.08)", border: "1px solid rgba(242,193,78,0.15)" }}
              >
                <Star className="h-4 w-4 flex-shrink-0" style={{ color: "#F2C14E" }} />
                <div>
                  <p className="text-white font-black text-lg leading-none">{usuario.pontos}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">pontos</p>
                </div>
              </div>
              <div
                className="rounded-xl p-3 flex items-center gap-2.5"
                style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)" }}
              >
                <Ticket className="h-4 w-4 flex-shrink-0" style={{ color: "#c4b5fd" }} />
                <div>
                  <p className="text-white font-black text-lg leading-none">{usuario.cuponsAtivos ?? usuario.cupons}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">cupons ativos</p>
                  {(usuario.totalCuponsHistorico ?? 0) > 0 && (
                    <p className="text-[9px] text-slate-500">{usuario.totalCuponsHistorico} total</p>
                  )}
                </div>
              </div>
            </div>

            {/* Level progress bar */}
            {usuario.nivelMax !== null && (
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-[10px] text-slate-500">
                    {usuario.pontos} / {usuario.nivelMax} pts
                  </span>
                  <span className="text-[10px] font-bold" style={{ color: "#F2C14E" }}>
                    {Math.round(levelProgress)}%
                  </span>
                </div>
                <div
                  className="w-full rounded-full h-2 overflow-hidden"
                  style={{ background: "rgba(58,24,103,0.6)" }}
                >
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${levelProgress}%` }}
                    transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
                    className="h-full rounded-full"
                    style={{ background: "linear-gradient(90deg, #F2C14E, #F2C14E)" }}
                  />
                </div>
                <p className="text-[10px] text-slate-500 mt-1.5">
                  Faltam{" "}
                  <span className="text-white font-bold">
                    {usuario.nivelMax - usuario.pontos} pts
                  </span>{" "}
                  para o próximo nível
                </p>
              </div>
            )}
            {usuario.nivelMax === null && (
              <div className="flex items-center gap-2 mt-1">
                <Crown className="h-4 w-4" style={{ color: "#F2C14E" }} />
                <span className="text-xs font-bold" style={{ color: "#F2C14E" }}>
                  Nível máximo atingido! Você é uma Lenda! 👑
                </span>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* ── Daily missions ── */}
      <section className="px-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4" style={{ color: "#F2C14E" }} />
            <h2 className="text-sm font-black text-white">Missões do Dia</h2>
          </div>
          <span
            className="text-[11px] font-bold px-2 py-0.5 rounded-full"
            style={{
              background: concluidas === missoes.length && missoes.length > 0
                ? "rgba(242,193,78,0.15)"
                : "rgba(58,24,103,0.5)",
              color: concluidas === missoes.length && missoes.length > 0 ? "#F2C14E" : "#a78bfa",
            }}
          >
            {concluidas}/{missoes.length} concluídas
          </span>
        </div>

        <div
          className="rounded-2xl overflow-hidden"
          style={{ border: "1px solid rgba(58,24,103,0.5)", background: "rgba(19,9,38,0.6)" }}
        >
          {missoes.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-sm">
              Carregando missões...
            </div>
          ) : (
            missoes.map((missao, i) => (
              <motion.div
                key={missao.id}
                initial={{ x: -8, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.1 + i * 0.06 }}
                className={`flex items-center gap-3 px-4 py-3.5 ${i < missoes.length - 1 ? "border-b" : ""}`}
                style={{ borderColor: "rgba(58,24,103,0.4)" }}
              >
                {/* Check indicator */}
                <div className="flex-shrink-0">
                  {missao.concluida ? (
                    <CheckCircle2 className="h-5 w-5" style={{ color: "#F2C14E" }} />
                  ) : (
                    <div
                      className="w-5 h-5 rounded-full border-2"
                      style={{ borderColor: "rgba(139,92,246,0.4)" }}
                    />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-xs font-semibold leading-tight ${missao.concluida ? "line-through" : ""}`}
                    style={{ color: missao.concluida ? "#6b7280" : "#e2e8f0" }}
                  >
                    {missao.descricao}
                  </p>
                  {/* Progress bar */}
                  {!missao.concluida && missao.meta > 1 && (
                    <div className="mt-1.5">
                      <div
                        className="h-1 rounded-full overflow-hidden w-full"
                        style={{ background: "rgba(58,24,103,0.5)" }}
                      >
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${(missao.progresso / missao.meta) * 100}%`,
                            background: "linear-gradient(90deg, #7c3aed, #a78bfa)",
                          }}
                        />
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        {missao.progresso}/{missao.meta}
                      </p>
                    </div>
                  )}
                </div>

                {/* Rewards */}
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                    style={{ background: "rgba(242,193,78,0.1)", color: "#F2C14E" }}
                  >
                    +{missao.premioPontos}pts
                  </span>
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                    style={{ background: "rgba(139,92,246,0.12)", color: "#c4b5fd" }}
                  >
                    +{missao.premioCupons}🎟️
                  </span>
                </div>
              </motion.div>
            ))
          )}

          {/* Share mission button */}
          {missoes.some((m) => m.tipo === "compartilhar" && !m.concluida) && (
            <div
              className="px-4 py-3 border-t flex justify-between items-center"
              style={{ borderColor: "rgba(58,24,103,0.4)" }}
            >
              <p className="text-[11px] text-slate-500">
                Compartilhe o app e ganhe +1 cupom
              </p>
              <button
                onClick={() => compartilharMutation.mutate()}
                disabled={compartilharMutation.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all active:scale-95"
                style={{ background: "rgba(139,92,246,0.2)", color: "#c4b5fd", border: "1px solid rgba(139,92,246,0.3)" }}
              >
                <Share2 className="h-3 w-3" />
                {compartilharMutation.isPending ? "..." : "Compartilhar"}
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ── Sorteio da semana ── */}
      {sorteio && (
        <section className="px-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="h-4 w-4" style={{ color: "#fbbf24" }} />
            <h2 className="text-sm font-black text-white">Sorteio da Semana</h2>
          </div>

          <motion.div
            initial={{ y: 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.12 }}
            className="relative overflow-hidden rounded-2xl p-5"
            style={{
              background: "linear-gradient(135deg, #1a0a2e 0%, #2a1060 60%, #1a0a2e 100%)",
              border: "1px solid rgba(251,191,36,0.25)",
              boxShadow: "0 4px 24px rgba(251,191,36,0.08)",
            }}
          >
            {/* Prize glow */}
            <div
              className="absolute -top-6 left-1/2 -translate-x-1/2 w-40 h-20 pointer-events-none"
              style={{ background: "radial-gradient(ellipse, rgba(251,191,36,0.12) 0%, transparent 70%)" }}
            />

            <div className="relative">
              {/* Prize */}
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.3)" }}
                >
                  <span className="text-2xl">🎁</span>
                </div>
                <div>
                  <p className="text-white font-black text-base leading-tight">{sorteio.premio}</p>
                  {sorteio.descricao && (
                    <p className="text-xs text-slate-400 mt-0.5">{sorteio.descricao}</p>
                  )}
                </div>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div
                  className="rounded-xl p-2.5 text-center"
                  style={{ background: "rgba(19,9,38,0.5)" }}
                >
                  <Calendar className="h-4 w-4 mx-auto mb-1 text-slate-400" />
                  <p className="text-white text-xs font-black">{daysUntil(sorteio.dataFim)}</p>
                  <p className="text-[9px] text-slate-500 mt-0.5">{formatDate(sorteio.dataFim)}</p>
                </div>
                <div
                  className="rounded-xl p-2.5 text-center"
                  style={{ background: "rgba(19,9,38,0.5)" }}
                >
                  <Users className="h-4 w-4 mx-auto mb-1 text-slate-400" />
                  <p className="text-white text-xs font-black">{sorteio.totalParticipantes}</p>
                  <p className="text-[9px] text-slate-500 mt-0.5">participantes</p>
                </div>
                <div
                  className="rounded-xl p-2.5 text-center"
                  style={{ background: "rgba(19,9,38,0.5)" }}
                >
                  <Ticket className="h-4 w-4 mx-auto mb-1" style={{ color: "#c4b5fd" }} />
                  <p className="text-white text-xs font-black">{usuario.cuponsAtivos ?? usuario.cupons}</p>
                  <p className="text-[9px] text-slate-500 mt-0.5">cupons ativos</p>
                </div>
              </div>

              {/* CTA */}
              {sorteio.jaParticipou ? (
                <div
                  className="w-full py-3 rounded-xl flex items-center justify-center gap-2"
                  style={{ background: "rgba(242,193,78,0.1)", border: "1px solid rgba(242,193,78,0.25)" }}
                >
                  <CheckCircle2 className="h-4 w-4" style={{ color: "#F2C14E" }} />
                  <span className="text-sm font-black" style={{ color: "#F2C14E" }}>
                    Participando com {sorteio.cuponsUsados} cupom(s)!
                  </span>
                </div>
              ) : (usuario.cuponsAtivos ?? usuario.cupons) >= 1 ? (
                <button
                  onClick={() => participarMutation.mutate(1)}
                  disabled={participarMutation.isPending}
                  className="w-full py-3 rounded-xl font-black text-sm transition-all active:scale-95 flex items-center justify-center gap-2"
                  style={{
                    background: "linear-gradient(135deg, #f59e0b, #fbbf24)",
                    color: "#1a0a2e",
                    opacity: participarMutation.isPending ? 0.7 : 1,
                  }}
                >
                  <Ticket className="h-4 w-4" />
                  {participarMutation.isPending ? "Entrando..." : "Participar com 1 cupom"}
                </button>
              ) : (
                <div>
                  <div
                    className="w-full py-2.5 rounded-xl flex items-center justify-center gap-2 mb-2"
                    style={{ background: "rgba(58,24,103,0.3)", border: "1px solid rgba(58,24,103,0.5)" }}
                  >
                    <Lock className="h-4 w-4 text-slate-500" />
                    <span className="text-sm font-bold text-slate-500">Sem cupons para participar</span>
                  </div>
                  <p className="text-center text-[11px] text-slate-500">
                    Publique ofertas e complete missões para ganhar cupons 🎟️
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        </section>
      )}

      {/* ── Histórico de sorteios ── */}
      {(historicoData?.historico?.length ?? 0) > 0 && (
        <section className="px-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm">📜</span>
            <h2 className="text-sm font-black text-white">Histórico de sorteios</h2>
          </div>
          <div
            className="rounded-2xl overflow-hidden"
            style={{ border: "1px solid rgba(58,24,103,0.5)", background: "rgba(19,9,38,0.6)" }}
          >
            {historicoData!.historico.map((item, i, arr) => (
              <div
                key={item.sorteioId}
                className={`flex items-center justify-between px-4 py-3.5 ${i < arr.length - 1 ? "border-b" : ""}`}
                style={{ borderColor: "rgba(58,24,103,0.3)" }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{
                      background: item.ganhou
                        ? "rgba(251,191,36,0.15)"
                        : "rgba(139,92,246,0.12)",
                    }}
                  >
                    <span className="text-sm">{item.ganhou ? "🏆" : "🎁"}</span>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white">{item.nome}</p>
                    <p className="text-[10px] text-slate-500">
                      {item.cuponsUsados} cupom(s) • {new Date(item.dataFim).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  {item.ganhou ? (
                    <span className="text-[10px] font-black" style={{ color: "#fbbf24" }}>
                      Vencedor 🏆
                    </span>
                  ) : item.status === "encerrado" ? (
                    <span className="text-[10px] text-slate-500">Participou</span>
                  ) : (
                    <span className="text-[10px] font-bold" style={{ color: "#86efac" }}>
                      Ativo
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Como ganhar cupons ── */}
      <section className="px-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Ticket className="h-4 w-4" style={{ color: "#c4b5fd" }} />
          <h2 className="text-sm font-black text-white">Como ganhar cupons</h2>
        </div>
        <div
          className="rounded-2xl overflow-hidden"
          style={{ border: "1px solid rgba(58,24,103,0.5)", background: "rgba(19,9,38,0.6)" }}
        >
          {[
            { emoji: "📸", acao: "Publicar oferta aprovada", cupons: "+1 cupom" },
            { emoji: "✅", acao: "Confirmar preço de oferta", cupons: "+1 cupom" },
            { emoji: "🔆", acao: "Primeira oferta do dia", cupons: "+1 cupom bônus" },
            { emoji: "📤", acao: "Compartilhar o app", cupons: "+1 cupom" },
            { emoji: "🎯", acao: "Completar missão diária", cupons: "até +2 cupons" },
          ].map((item, i, arr) => (
            <div
              key={item.acao}
              className={`flex items-center justify-between px-4 py-3 ${i < arr.length - 1 ? "border-b" : ""}`}
              style={{ borderColor: "rgba(58,24,103,0.3)" }}
            >
              <div className="flex items-center gap-3">
                <span className="text-base">{item.emoji}</span>
                <span className="text-xs text-slate-300">{item.acao}</span>
              </div>
              <span className="text-xs font-bold" style={{ color: "#c4b5fd" }}>
                {item.cupons}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Ranking semanal ── */}
      <section className="px-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" style={{ color: "#F2C14E" }} />
            <h2 className="text-sm font-black text-white">Ranking Semanal</h2>
          </div>
          <span className="text-[10px] text-slate-500">top 10 por pontos</span>
        </div>

        <div
          className="rounded-2xl overflow-hidden"
          style={{ border: "1px solid rgba(58,24,103,0.5)", background: "rgba(19,9,38,0.6)" }}
        >
          <AnimatePresence>
            {rankingSemanal.map((item, i) => (
              <motion.div
                key={item.posicao}
                initial={{ x: -6, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: i * 0.04 }}
                className={`flex items-center gap-3 px-4 py-3 ${i < rankingSemanal.length - 1 ? "border-b" : ""}`}
                style={{
                  borderColor: "rgba(58,24,103,0.3)",
                  background: item.isMe ? "rgba(242,193,78,0.05)" : "transparent",
                }}
              >
                <div className="w-7 flex items-center justify-center flex-shrink-0">
                  <RankMedal pos={item.posicao} />
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className="text-xs font-bold truncate leading-tight"
                    style={{ color: item.isMe ? "#F2C14E" : "#e2e8f0" }}
                  >
                    {item.nome.split(" ")[0]}
                    {item.isMe && (
                      <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full font-black"
                        style={{ background: "rgba(242,193,78,0.15)", color: "#F2C14E" }}>
                        você
                      </span>
                    )}
                  </p>
                  {item.ofertasSemana > 0 && (
                    <p className="text-[10px] text-slate-500">{item.ofertasSemana} oferta(s) essa semana</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs font-black" style={{ color: item.isMe ? "#F2C14E" : "#a78bfa" }}>
                    {item.pontos} pts
                  </p>
                  {item.streak > 0 && (
                    <p className="text-[10px] text-orange-400">🔥 {item.streak}d</p>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </section>

      {/* ── Conquistas ── */}
      <section className="px-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Medal className="h-4 w-4" style={{ color: "#fbbf24" }} />
            <h2 className="text-sm font-black text-white">Conquistas</h2>
          </div>
          <span
            className="text-[11px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: "rgba(251,191,36,0.12)", color: "#fbbf24" }}
          >
            {desbloqueadas}/{conquistas.length}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          {conquistas.map((c, i) => (
            <motion.div
              key={c.key}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.05 + i * 0.04 }}
              className="rounded-xl p-3 flex flex-col items-center text-center relative"
              style={{
                background: c.desbloqueada
                  ? "linear-gradient(135deg, rgba(30,13,58,0.9), rgba(45,16,96,0.9))"
                  : "rgba(19,9,38,0.4)",
                border: c.desbloqueada
                  ? "1px solid rgba(251,191,36,0.3)"
                  : "1px solid rgba(58,24,103,0.3)",
                opacity: c.desbloqueada ? 1 : 0.55,
              }}
            >
              {!c.desbloqueada && (
                <Lock
                  className="absolute top-1.5 right-1.5 h-2.5 w-2.5 text-slate-600"
                />
              )}
              <span className="text-2xl mb-1.5" style={{ filter: c.desbloqueada ? "none" : "grayscale(100%)" }}>
                {c.emoji}
              </span>
              <p
                className="text-[10px] font-bold leading-tight"
                style={{ color: c.desbloqueada ? "#fbbf24" : "#6b7280" }}
              >
                {c.nome}
              </p>
              <p className="text-[9px] text-slate-600 mt-0.5 leading-tight">{c.descricao}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Últimos ganhadores ── */}
      {ganhadores.length > 0 && (
        <section className="px-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Crown className="h-4 w-4" style={{ color: "#fbbf24" }} />
            <h2 className="text-sm font-black text-white">Últimos Ganhadores</h2>
          </div>

          <div
            className="rounded-2xl overflow-hidden"
            style={{ border: "1px solid rgba(58,24,103,0.5)", background: "rgba(19,9,38,0.6)" }}
          >
            {ganhadores.map((g, i) => (
              <div
                key={i}
                className={`flex items-center justify-between px-4 py-3.5 ${i < ganhadores.length - 1 ? "border-b" : ""}`}
                style={{ borderColor: "rgba(58,24,103,0.3)" }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: "rgba(251,191,36,0.12)" }}
                  >
                    <Trophy className="h-4 w-4 text-yellow-400" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white">{g.nome}</p>
                    <p className="text-[10px] text-slate-500">{formatDate(g.dataSorteio)}</p>
                  </div>
                </div>
                <span
                  className="text-xs font-black"
                  style={{ color: "#fbbf24" }}
                >
                  {g.premio}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Points guide ── */}
      <section className="px-4 mb-2">
        <div className="flex items-center gap-2 mb-3">
          <Star className="h-4 w-4" style={{ color: "#F2C14E" }} />
          <h2 className="text-sm font-black text-white">Como ganhar pontos</h2>
        </div>
        <div
          className="rounded-2xl overflow-hidden"
          style={{ border: "1px solid rgba(58,24,103,0.5)", background: "rgba(19,9,38,0.6)" }}
        >
          {[
            { emoji: "📸", acao: "Publicar oferta",          pts: "+10 pts" },
            { emoji: "✅", acao: "Confirmar preço",           pts: "+5 pts"  },
            { emoji: "👍", acao: "Oferta validada",           pts: "+2 pts"  },
            { emoji: "⭐", acao: "Oferta em destaque",        pts: "+15 pts" },
            { emoji: "❤️", acao: "Oferta muito curtida",      pts: "+5 pts"  },
            { emoji: "📤", acao: "Compartilhar oferta",       pts: "+3 pts"  },
          ].map((item, i, arr) => (
            <div
              key={item.acao}
              className={`flex items-center justify-between px-4 py-2.5 ${i < arr.length - 1 ? "border-b" : ""}`}
              style={{ borderColor: "rgba(58,24,103,0.3)" }}
            >
              <div className="flex items-center gap-3">
                <span className="text-sm">{item.emoji}</span>
                <span className="text-xs text-slate-300">{item.acao}</span>
              </div>
              <span className="text-xs font-black" style={{ color: "#F2C14E" }}>
                {item.pts}
              </span>
            </div>
          ))}
        </div>
      </section>
    </motion.div>
  );
}
