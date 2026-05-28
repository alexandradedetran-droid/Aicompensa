import { motion } from "framer-motion";
import { User, Star, ShoppingBag, CheckCircle, Loader2, LogOut, Heart, Flame, Trophy, Award } from "lucide-react";
import { useLocation } from "wouter";
import {
  useGetPerfil, getGetPerfilQueryKey,
  useListFavoritos, getListFavoritosQueryKey,
} from "@workspace/api-client-react";
import { getCurrentUser, clearCurrentUser, maskCPF } from "@/lib/current-user";
import { LoginGate } from "@/lib/login-prompt";

const NIVEL: Record<string, { color: string; bg: string; gradient: string; min: number; max: number | null }> = {
  Iniciante:    { color: "text-slate-600",   bg: "bg-slate-100",    gradient: "from-slate-400 to-slate-500",      min: 0,    max: 49   },
  Explorador:   { color: "text-blue-600",    bg: "bg-blue-100",     gradient: "from-blue-400 to-cyan-500",         min: 50,   max: 149  },
  "Caçador":    { color: "text-emerald-700", bg: "bg-emerald-100",  gradient: "from-emerald-400 to-green-500",    min: 150,  max: 299  },
  Especialista: { color: "text-amber-700",   bg: "bg-amber-100",    gradient: "from-amber-400 to-orange-400",     min: 300,  max: 599  },
  Mestre:       { color: "text-orange-700",  bg: "bg-orange-100",   gradient: "from-orange-400 to-red-500",       min: 600,  max: 999  },
  Lenda:        { color: "text-purple-700",  bg: "bg-purple-100",   gradient: "from-purple-500 to-indigo-600",    min: 1000, max: null },
};

const NIVEL_EMOJI: Record<string, string> = {
  Iniciante: "🌱", Explorador: "🔍", "Caçador": "🎯", Especialista: "⭐", Mestre: "🏆", Lenda: "💎",
};

interface AchievementDef {
  id: string;
  emoji: string;
  title: string;
  desc: string;
  unlocked: (p: { totalOfertas: number; totalValidacoesRecebidas: number; pontos: number; streak: number; saved: number }) => boolean;
  rarity: "common" | "rare" | "epic" | "legendary";
}

const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: "first_offer",
    emoji: "🌟",
    title: "Primeira Oferta",
    desc: "Publicou sua primeira oferta",
    unlocked: (p) => p.totalOfertas >= 1,
    rarity: "common",
  },
  {
    id: "hunter",
    emoji: "🎯",
    title: "Caçador",
    desc: "Publicou 5 ou mais ofertas",
    unlocked: (p) => p.totalOfertas >= 5,
    rarity: "common",
  },
  {
    id: "trusted",
    emoji: "🛡️",
    title: "Confiável",
    desc: "Recebeu 5 ou mais validações",
    unlocked: (p) => p.totalValidacoesRecebidas >= 5,
    rarity: "common",
  },
  {
    id: "validator_expert",
    emoji: "💡",
    title: "Validador Expert",
    desc: "Recebeu 20 ou mais validações",
    unlocked: (p) => p.totalValidacoesRecebidas >= 20,
    rarity: "rare",
  },
  {
    id: "active_hunter",
    emoji: "🔥",
    title: "Caçador Ativo",
    desc: "Atingiu 150 pontos ou mais",
    unlocked: (p) => p.pontos >= 150,
    rarity: "rare",
  },
  {
    id: "collector",
    emoji: "📚",
    title: "Colecionador",
    desc: "Salvou 5 ou mais ofertas",
    unlocked: (p) => p.saved >= 5,
    rarity: "common",
  },
  {
    id: "streak_week",
    emoji: "⚡",
    title: "Em Chama",
    desc: "7 dias seguidos de acesso",
    unlocked: (p) => p.streak >= 7,
    rarity: "rare",
  },
  {
    id: "specialist",
    emoji: "🌍",
    title: "Especialista Local",
    desc: "Atingiu 300 pontos",
    unlocked: (p) => p.pontos >= 300,
    rarity: "epic",
  },
  {
    id: "master",
    emoji: "🏅",
    title: "Mestre da Economia",
    desc: "Atingiu 600 pontos",
    unlocked: (p) => p.pontos >= 600,
    rarity: "epic",
  },
  {
    id: "legend",
    emoji: "👑",
    title: "Lenda das Promoções",
    desc: "Atingiu 1000 pontos",
    unlocked: (p) => p.pontos >= 1000,
    rarity: "legendary",
  },
];

const RARITY_STYLE: Record<string, { border: string; bg: string; label: string }> = {
  common:    { border: "border-slate-200",   bg: "bg-slate-50",    label: "text-slate-400" },
  rare:      { border: "border-blue-200",    bg: "bg-blue-50",     label: "text-blue-500"  },
  epic:      { border: "border-purple-200",  bg: "bg-purple-50",   label: "text-purple-600"},
  legendary: { border: "border-yellow-300",  bg: "bg-yellow-50",   label: "text-yellow-600"},
};

export default function Perfil() {
  const [, setLocation] = useLocation();
  const currentUser = getCurrentUser();

  if (!currentUser) {
    return <LoginGate returnTo="/perfil" />;
  }

  const userId = currentUser.id;

  const { data: perfil, isLoading } = useGetPerfil(userId, {
    query: { queryKey: getGetPerfilQueryKey(userId) },
  });

  const { data: savedIds } = useListFavoritos(
    { usuarioId: userId },
    { query: { queryKey: getListFavoritosQueryKey({ usuarioId: userId }) } },
  );

  function handleLogout() {
    clearCurrentUser();
    setLocation("/login");
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col min-h-full bg-[#0f172a]"
    >
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-32">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-400 mb-3" />
          <p className="text-slate-400 text-sm">Carregando perfil...</p>
        </div>
      ) : !perfil ? (
        <div className="mx-4 mt-6 p-10 text-center rounded-3xl bg-[#1e293b] border border-[#334155]">
          <p className="text-slate-400">Perfil não encontrado.</p>
        </div>
      ) : (() => {
        const cfg = NIVEL[perfil.nivel] ?? NIVEL["Iniciante"]!;
        const progress = cfg.max !== null
          ? Math.min(((perfil.pontos - cfg.min) / (cfg.max - cfg.min)) * 100, 100)
          : 100;
        const levelNames = Object.keys(NIVEL);
        const currentIdx = levelNames.indexOf(perfil.nivel);
        const nextLevelName = currentIdx < levelNames.length - 1 ? levelNames[currentIdx + 1] : null;

        const savedCount = savedIds?.length ?? 0;
        const streakVal = perfil.streak ?? 0;

        const achievementInput = {
          totalOfertas: perfil.totalOfertas,
          totalValidacoesRecebidas: perfil.totalValidacoesRecebidas,
          pontos: perfil.pontos,
          streak: streakVal,
          saved: savedCount,
        };

        const unlockedBadges = ACHIEVEMENTS.filter((a) => a.unlocked(achievementInput));
        const lockedBadges   = ACHIEVEMENTS.filter((a) => !a.unlocked(achievementInput));

        return (
          <>
            {/* ── Hero / avatar ── */}
            <div className="relative px-4 pt-6 pb-20">
              <div className="mb-4">
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1">Meu Perfil</p>
                <h1 className="text-white font-black text-2xl leading-tight">{perfil.nome}</h1>
                {(perfil.cidade || perfil.estado) && (
                  <p className="text-slate-400 text-sm mt-0.5">
                    📍 {[perfil.cidade, perfil.estado].filter(Boolean).join(" — ")}
                  </p>
                )}
              </div>

              {/* Level badge + avatar */}
              <div className="flex items-center gap-4">
                <div className={`h-20 w-20 rounded-3xl flex items-center justify-center bg-gradient-to-br ${cfg.gradient} shadow-lg shrink-0`}>
                  <User className="h-9 w-9 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className={`text-xs font-black px-3 py-1 rounded-full ${cfg.bg} ${cfg.color}`}>
                      {NIVEL_EMOJI[perfil.nivel]} {perfil.nivel}
                    </span>
                    {streakVal >= 2 && (
                      <span className="text-xs font-black px-2.5 py-1 rounded-full bg-orange-100 text-orange-700 flex items-center gap-1">
                        🔥 {streakVal} dias
                      </span>
                    )}
                  </div>
                  {cfg.max !== null ? (
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[10px] text-slate-400">
                        <span>{perfil.pontos} pts</span>
                        {nextLevelName && (
                          <span>→ {nextLevelName} em {(cfg.max! - perfil.pontos)} pts</span>
                        )}
                      </div>
                      <div className="h-2 w-full rounded-full bg-[#1e293b] overflow-hidden">
                        <motion.div
                          className={`h-full rounded-full bg-gradient-to-r ${cfg.gradient}`}
                          initial={{ width: 0 }}
                          animate={{ width: `${progress}%` }}
                          transition={{ duration: 0.9, delay: 0.3, ease: "easeOut" }}
                        />
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400">Nível máximo atingido! 🎉</p>
                  )}
                </div>
              </div>
            </div>

            {/* ── Streak banner ── */}
            {streakVal >= 3 && (
              <div className="mx-4 mb-4 -mt-12 rounded-2xl p-3.5 flex items-center gap-3 shadow-lg"
                   style={{ background: "linear-gradient(135deg,#7c2d12,#ea580c)", boxShadow: "0 8px 24px rgba(234,88,12,0.3)" }}>
                <Flame className="h-8 w-8 text-orange-200 shrink-0" />
                <div>
                  <p className="text-white font-black text-sm leading-tight">
                    {streakVal >= 7 ? "🔥 Em chama!" : "Sequência ativa!"}
                  </p>
                  <p className="text-orange-100 text-[11px]">
                    Você acessa há {streakVal} dias seguidos · continue!
                  </p>
                </div>
              </div>
            )}

            {/* ── Elite badge ── */}
            {perfil.pontos >= 600 && !(streakVal >= 3) && (
              <div className="mx-4 mb-4 -mt-12 bg-gradient-to-r from-orange-500 to-red-500 rounded-2xl p-3.5 flex items-center gap-3 shadow-lg">
                <Trophy className="h-7 w-7 text-white shrink-0" />
                <div>
                  <p className="text-white font-black text-sm leading-tight">Mestre da Economia</p>
                  <p className="text-orange-100 text-[11px]">Top validador da comunidade · {perfil.pontos} pts</p>
                </div>
              </div>
            )}

            {/* ── Stats cards ── */}
            <div className={`px-4 ${(streakVal >= 3 || perfil.pontos >= 600) ? "mt-4" : "-mt-14"} mb-5 grid grid-cols-4 gap-2`}>
              {[
                { icon: Star,        value: perfil.pontos,                   label: "Pontos",     bg: "from-yellow-400 to-orange-400" },
                { icon: ShoppingBag, value: perfil.totalOfertas,              label: "Ofertas",    bg: "from-emerald-400 to-green-500" },
                { icon: CheckCircle, value: perfil.totalValidacoesRecebidas,  label: "Validações", bg: "from-blue-400 to-indigo-500"   },
                { icon: Heart,       value: savedCount,                        label: "Salvos",     bg: "from-pink-400 to-rose-500"     },
              ].map(({ icon: Icon, value, label, bg }) => (
                <div key={label} className="bg-white rounded-2xl p-3.5 text-center shadow-sm"
                     style={{ boxShadow: "0 2px 16px rgba(0,0,0,0.10)" }}>
                  <div className={`inline-flex p-2 rounded-xl bg-gradient-to-br ${bg} mb-2 shadow-sm`}>
                    <Icon className="h-4 w-4 text-white" />
                  </div>
                  <div className="text-2xl font-black text-slate-900">{value}</div>
                  <div className="text-[10px] text-slate-400 font-medium mt-0.5">{label}</div>
                </div>
              ))}
            </div>

            {/* ── Conquistas ── */}
            <div className="px-4 mb-5">
              <div className="bg-white rounded-3xl p-4 shadow-sm" style={{ boxShadow: "0 2px 16px rgba(0,0,0,0.08)" }}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                    <Award className="h-3.5 w-3.5" /> Conquistas
                  </p>
                  <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                    {unlockedBadges.length}/{ACHIEVEMENTS.length}
                  </span>
                </div>

                {unlockedBadges.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4">
                    Publique sua primeira oferta para ganhar conquistas! 🎯
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {unlockedBadges.map((a) => {
                      const rs = RARITY_STYLE[a.rarity];
                      return (
                        <motion.div
                          key={a.id}
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ duration: 0.3 }}
                          className={`flex items-center gap-2.5 p-2.5 rounded-2xl border ${rs.bg} ${rs.border}`}
                        >
                          <span className="text-2xl shrink-0">{a.emoji}</span>
                          <div className="min-w-0">
                            <p className="text-xs font-black text-slate-800 leading-tight truncate">{a.title}</p>
                            <p className="text-[10px] text-slate-500 leading-tight line-clamp-2">{a.desc}</p>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}

                {lockedBadges.length > 0 && (
                  <>
                    <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest mb-2">Bloqueadas</p>
                    <div className="grid grid-cols-3 gap-2">
                      {lockedBadges.slice(0, 6).map((a) => (
                        <div key={a.id} className="flex flex-col items-center gap-1 p-2 rounded-xl bg-slate-50 border border-slate-100 opacity-40">
                          <span className="text-xl grayscale">{a.emoji}</span>
                          <p className="text-[9px] text-slate-500 text-center leading-tight line-clamp-2">{a.title}</p>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* ── Personal info card ── */}
            {currentUser && (
              <div className="px-4 mb-5">
                <div className="bg-white rounded-3xl p-4 shadow-sm" style={{ boxShadow: "0 2px 16px rgba(0,0,0,0.08)" }}>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">Dados pessoais</p>
                  <div className="space-y-3">
                    <InfoRow label="Nome" value={currentUser.nome} />
                    <InfoRow label="Telefone" value={formatTelefone(currentUser.telefone)} />
                    <InfoRow label="CPF" value={maskCPF(currentUser.cpf)} secure />
                    <InfoRow label="Cidade" value={`${currentUser.cidade} — ${currentUser.estado}`} />
                  </div>
                </div>
              </div>
            )}

            {/* ── Logout button ── */}
            <div className="px-4 mb-4">
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border border-red-200 text-red-500 hover:bg-red-50 font-bold text-sm transition-colors bg-white"
                style={{ boxShadow: "0 2px 16px rgba(0,0,0,0.06)" }}
              >
                <LogOut className="h-4 w-4" />
                Sair da conta
              </button>
            </div>

            {/* ── Levels guide ── */}
            <div className="px-4 mb-6">
              <div className="bg-white rounded-3xl p-4 shadow-sm" style={{ boxShadow: "0 2px 16px rgba(0,0,0,0.08)" }}>
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">Progressão de Níveis</p>
                <div className="space-y-2">
                  {Object.entries(NIVEL).map(([name, v]) => {
                    const isCurrent = name === perfil.nivel;
                    const isPast    = v.max !== null && perfil.pontos > (v.max ?? 0);
                    return (
                      <div key={name}
                           className={`flex items-center justify-between p-2.5 rounded-xl transition-colors ${
                             isCurrent ? "bg-emerald-50 border border-emerald-200" :
                             isPast    ? "opacity-50" : ""
                           }`}>
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${v.bg} ${v.color}`}>
                          {NIVEL_EMOJI[name]} {name}
                        </span>
                        <span className="text-xs text-slate-400">
                          {v.max !== null ? `${v.min} – ${v.max} pts` : `${v.min}+ pts`}
                        </span>
                        {isCurrent && (
                          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">
                            Você
                          </span>
                        )}
                        {isPast && (
                          <span className="text-[10px]">✓</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        );
      })()}
    </motion.div>
  );
}

function InfoRow({ label, value, secure }: { label: string; value: string; secure?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-slate-100 last:border-0">
      <span className="text-xs text-slate-400 font-medium">{label}</span>
      <span className={`text-xs font-bold ${secure ? "font-mono text-slate-500" : "text-slate-800"}`}>
        {value}
      </span>
    </div>
  );
}

function formatTelefone(tel: string): string {
  const d = tel.replace(/\D/g, "");
  if (d.length !== 11) return tel;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
