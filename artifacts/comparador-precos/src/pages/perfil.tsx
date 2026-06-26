import { motion } from "framer-motion";
import { User, Star, ShoppingBag, CheckCircle, Loader2, LogOut, Heart, Flame, Trophy, Award, HelpCircle, FileText, Shield, Bell, BellOff, Smartphone, Settings, ChevronRight, Copy, Share2, Users } from "lucide-react";
import { useLocation, Link } from "wouter";
import {
  useGetPerfil, getGetPerfilQueryKey,
  useListFavoritos, getListFavoritosQueryKey,
} from "@workspace/api-client-react";
import { getCurrentUser, clearCurrentUser } from "@/lib/current-user";
import { useSeo } from "@/lib/seo";
import { LoginGate } from "@/lib/login-prompt";
import { usePush } from "@/hooks/use-push";
import { toast } from "@/hooks/use-toast";

const NIVEL: Record<string, { color: string; bg: string; gradient: string; min: number; max: number | null; desc: string }> = {
  "Estagiário da Economia":    { color: "text-slate-600",  bg: "bg-slate-100",   gradient: "from-slate-400 to-slate-500",     min: 0,    max: 49,   desc: "Começando a descobrir onde economizar." },
  "Assistente de Ofertas":     { color: "text-blue-600",   bg: "bg-blue-100",    gradient: "from-blue-400 to-cyan-500",        min: 50,   max: 149,  desc: "Já sabe encontrar boas oportunidades." },
  "Bacharel das Compras":      { color: "text-amber-700",bg: "bg-amber-100", gradient: "from-[#F2C14E] to-green-500",   min: 150,  max: 299,  desc: "Compra melhor e ajuda a comunidade." },
  "Especialista das Gôndolas": { color: "text-amber-700",  bg: "bg-amber-100",   gradient: "from-amber-400 to-orange-400",    min: 300,  max: 599,  desc: "Conhece os preços da região." },
  "Mestre das Pechinchas":     { color: "text-orange-700", bg: "bg-orange-100",  gradient: "from-orange-400 to-red-500",      min: 600,  max: 999,  desc: "Referência em economia no app." },
  "Doutor da Economia":        { color: "text-purple-700", bg: "bg-purple-100",  gradient: "from-purple-500 to-violet-600",   min: 1000, max: 2499, desc: "Alta confiança e grandes contribuições." },
  "PhD do Supermercado":       { color: "text-yellow-700", bg: "bg-yellow-100",  gradient: "from-yellow-400 to-amber-500",    min: 2500, max: null, desc: "Elite da economia doméstica." },
};

const NIVEL_EMOJI: Record<string, string> = {
  "Estagiário da Economia":    "🎒",
  "Assistente de Ofertas":     "🔎",
  "Bacharel das Compras":      "🎓",
  "Especialista das Gôndolas": "🏪",
  "Mestre das Pechinchas":     "💰",
  "Doutor da Economia":        "🔬",
  "PhD do Supermercado":       "🏆",
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
    title: "Caçador de Economia",
    desc: "Publicou 5 ou mais ofertas",
    unlocked: (p) => p.totalOfertas >= 5,
    rarity: "common",
  },
  {
    id: "guardian",
    emoji: "🛡️",
    title: "Guardião das Ofertas",
    desc: "Recebeu 5 ou mais validações",
    unlocked: (p) => p.totalValidacoesRecebidas >= 5,
    rarity: "common",
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
    id: "radar",
    emoji: "📡",
    title: "Radar de Preços",
    desc: "Atingiu 150 pontos ou mais",
    unlocked: (p) => p.pontos >= 150,
    rarity: "rare",
  },
  {
    id: "fiscal",
    emoji: "🔍",
    title: "Fiscal do Mercado",
    desc: "Recebeu 20 ou mais validações",
    unlocked: (p) => p.totalValidacoesRecebidas >= 20,
    rarity: "rare",
  },
  {
    id: "hortifruti",
    emoji: "🥦",
    title: "Mestre do Hortifruti",
    desc: "Publicou 10 ou mais ofertas",
    unlocked: (p) => p.totalOfertas >= 10,
    rarity: "rare",
  },
  {
    id: "streak_week",
    emoji: "☕",
    title: "Rainha do Café",
    desc: "7 dias seguidos de acesso",
    unlocked: (p) => p.streak >= 7,
    rarity: "rare",
  },
  {
    id: "specialist_limpeza",
    emoji: "🧼",
    title: "Especialista em Limpeza",
    desc: "Publicou 20 ou mais ofertas",
    unlocked: (p) => p.totalOfertas >= 20,
    rarity: "epic",
  },
  {
    id: "olho_clinico",
    emoji: "👁️",
    title: "Olho Clínico do Preço",
    desc: "Atingiu 300 pontos",
    unlocked: (p) => p.pontos >= 300,
    rarity: "epic",
  },
  {
    id: "master_economy",
    emoji: "💰",
    title: "Mestre das Pechinchas",
    desc: "Atingiu 600 pontos",
    unlocked: (p) => p.pontos >= 600,
    rarity: "epic",
  },
  {
    id: "phd",
    emoji: "🏆",
    title: "PhD do Supermercado",
    desc: "Atingiu 2500 pontos — elite da economia!",
    unlocked: (p) => p.pontos >= 2500,
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
  useSeo({ title: "Meu Perfil", noIndex: true });
  const [, setLocation] = useLocation();
  const currentUser = getCurrentUser();

  if (!currentUser) {
    return <LoginGate returnTo="/perfil" />;
  }

  const userId = currentUser.id;

  const { data: perfil, isLoading, isError } = useGetPerfil(userId, {
    query: { queryKey: getGetPerfilQueryKey(userId) },
  });

  const { data: savedIds } = useListFavoritos({
    query: { queryKey: getListFavoritosQueryKey() },
  });

  async function handleLogout() {
    try {
      await fetch("/api/usuarios/logout", { method: "POST", credentials: "include" });
    } catch {
      // session will expire naturally
    }
    clearCurrentUser();
    setLocation("/login");
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col min-h-full bg-[#130926]"
    >
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-32">
          <Loader2 className="h-8 w-8 animate-spin text-[#F2C14E] mb-3" />
          <p className="text-slate-400 text-sm">Carregando perfil...</p>
        </div>
      ) : isError ? (
        <div className="mx-4 mt-6 p-10 text-center rounded-3xl bg-[#1d0e36] border border-[#3a1867]">
          <p className="text-4xl mb-3">📡</p>
          <p className="text-slate-300 font-bold mb-1">Erro de conexão</p>
          <p className="text-slate-500 text-sm mt-1">Não foi possível carregar seu perfil. Verifique sua internet e tente novamente.</p>
        </div>
      ) : !perfil ? (
        <div className="mx-4 mt-6 p-10 text-center rounded-3xl bg-[#1d0e36] border border-[#3a1867]">
          <p className="text-slate-400">Perfil não encontrado.</p>
        </div>
      ) : (() => {
        const cfg = NIVEL[perfil.nivel] ?? NIVEL["Estagiário da Economia"]!;
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
                <div className={`h-20 w-20 rounded-3xl flex items-center justify-center bg-gradient-to-br ${cfg.gradient} shadow-md shrink-0`}>
                  <User className="h-9 w-9 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`text-xs font-black px-3 py-1 rounded-full ${cfg.bg} ${cfg.color}`}>
                      {NIVEL_EMOJI[perfil.nivel]} {perfil.nivel}
                    </span>
                    {streakVal >= 2 && (
                      <span className="text-xs font-black px-2.5 py-1 rounded-full bg-orange-100 text-orange-700 flex items-center gap-1">
                        🔥 {streakVal} dias
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400 mb-2 leading-snug">{cfg.desc}</p>
                  {cfg.max !== null ? (
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[10px] text-slate-400">
                        <span>{perfil.pontos} pts</span>
                        {nextLevelName && (
                          <span>→ {nextLevelName} em {(cfg.max! - perfil.pontos)} pts</span>
                        )}
                      </div>
                      <div className="h-2 w-full rounded-full bg-[#1d0e36] overflow-hidden">
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
              <div className="mx-4 mb-4 -mt-12 rounded-2xl p-3.5 flex items-center gap-3 shadow-md"
                   style={{ background: "linear-gradient(135deg,#7c2d12,#ea580c)", boxShadow: "0 4px 16px rgba(234,88,12,0.18)" }}>
                <Flame className="h-8 w-8 text-orange-200 shrink-0" />
                <div>
                  <p className="text-white font-black text-sm leading-tight">
                    {streakVal >= 7 ? "☕ Rainha do Café!" : "Sequência ativa!"}
                  </p>
                  <p className="text-orange-100 text-[11px]">
                    Você acessa há {streakVal} dias seguidos · continue!
                  </p>
                </div>
              </div>
            )}

            {/* ── Elite banner ── */}
            {perfil.pontos >= 600 && !(streakVal >= 3) && (
              <div className="mx-4 mb-4 -mt-12 bg-gradient-to-r from-orange-500 to-red-500 rounded-2xl p-3.5 flex items-center gap-3 shadow-md">
                <Trophy className="h-7 w-7 text-white shrink-0" />
                <div>
                  <p className="text-white font-black text-sm leading-tight">Mestre das Pechinchas</p>
                  <p className="text-orange-100 text-[11px]">Referência em economia no app · {perfil.pontos} pts</p>
                </div>
              </div>
            )}

            {/* ── Stats cards ── */}
            <div className={`px-4 ${(streakVal >= 3 || perfil.pontos >= 600) ? "mt-4" : "-mt-14"} mb-5 grid grid-cols-4 gap-2`}>
              {[
                { icon: Star,        value: perfil.pontos,                   label: "Pontos",     bg: "from-yellow-400 to-orange-400" },
                { icon: ShoppingBag, value: perfil.totalOfertas,              label: "Ofertas",    bg: "from-[#F2C14E] to-green-500" },
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

            {/* ── Impacto na comunidade ── */}
            {(perfil.totalOfertas > 0 || perfil.totalValidacoesRecebidas > 0) && (
              <div className="px-4 mb-5">
                <div className="bg-white rounded-3xl p-4 shadow-sm" style={{ boxShadow: "0 2px 16px rgba(0,0,0,0.08)" }}>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-1.5">
                    🌍 Impacto na comunidade
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-amber-50 rounded-2xl p-3 text-center border border-amber-100">
                      <div className="text-xl mb-1">🙋</div>
                      <div className="text-xl font-black text-slate-900">{perfil.totalValidacoesRecebidas}</div>
                      <div className="text-[10px] text-slate-400 font-medium mt-0.5">pessoas ajudadas</div>
                    </div>
                    <div className="bg-yellow-50 rounded-2xl p-3 text-center border border-yellow-100">
                      <div className="text-xl mb-1">💰</div>
                      <div className="text-sm font-black text-[#B8900E] leading-tight">
                        ~{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(perfil.totalValidacoesRecebidas * 12)}
                      </div>
                      <div className="text-[10px] text-slate-400 font-medium mt-0.5">economia estimada</div>
                    </div>
                    <div className="bg-purple-50 rounded-2xl p-3 text-center border border-purple-100">
                      <div className="text-xl mb-1">📦</div>
                      <div className="text-xl font-black text-slate-900">{perfil.totalOfertas}</div>
                      <div className="text-[10px] text-slate-400 font-medium mt-0.5">ofertas publicadas</div>
                    </div>
                    <div className="bg-green-50 rounded-2xl p-3 text-center border border-green-100">
                      <div className="text-xl mb-1">✅</div>
                      <div className="text-xl font-black text-slate-900">{perfil.totalValidacoesRecebidas}</div>
                      <div className="text-[10px] text-slate-400 font-medium mt-0.5">validações recebidas</div>
                    </div>
                  </div>
                  {perfil.totalOfertas === 0 && (
                    <p className="text-xs text-slate-400 text-center mt-3">
                      Publique ofertas para começar a impactar a comunidade! 🎯
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* ── Publicações hoje ── */}
            {currentUser && currentUser.id === perfil.id && (
              <div className="px-4 mb-5">
                <div className="bg-white rounded-3xl p-4 shadow-sm" style={{ boxShadow: "0 2px 16px rgba(0,0,0,0.08)" }}>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-1.5">
                    📤 Publicações hoje
                  </p>
                  {currentUser.semLimite || currentUser.isAdmin || currentUser.colaboradorPioneiro ? (
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-black text-slate-800">
                          {currentUser.ofertasHoje ?? 0} publicadas hoje
                        </span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          currentUser.isAdmin
                            ? "bg-red-100 text-red-700"
                            : currentUser.colaboradorPioneiro
                              ? "bg-amber-100 text-amber-700"
                              : "bg-purple-100 text-purple-700"
                        }`}>
                          {currentUser.motivoSemLimite
                            ? `✨ ${currentUser.motivoSemLimite}`
                            : currentUser.colaboradorPioneiro
                              ? "🏆 Colaborador Pioneiro"
                              : currentUser.isAdmin
                                ? "🔑 Admin"
                                : "🎓 PhD do Supermercado"}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">Publicação sem limite diário.</p>
                    </div>
                  ) : (() => {
                    const usado = currentUser.ofertasHoje ?? 0;
                    const limite = currentUser.limiteDiario ?? 5;
                    const pct = Math.min((usado / limite) * 100, 100);
                    const quaseNoLimite = usado >= limite - 1 && usado < limite;
                    return (
                      <>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-sm font-black text-slate-800">{usado}/{limite} usadas hoje</span>
                          {quaseNoLimite && (
                            <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
                              ⚠️ Perto do limite
                            </span>
                          )}
                          {usado >= limite && (
                            <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                              🔒 Limite atingido
                            </span>
                          )}
                        </div>
                        <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden mb-2">
                          <div
                            className={`h-full rounded-full transition-all ${pct >= 100 ? "bg-red-400" : pct >= 75 ? "bg-orange-400" : "bg-[#F2C14E]"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <p className="text-[11px] text-slate-400">
                          Seu nível atual permite publicar até {limite} ofertas por dia.
                        </p>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* ── Conquistas ── */}
            <div className="px-4 mb-5">
              <div className="bg-white rounded-3xl p-4 shadow-sm" style={{ boxShadow: "0 2px 16px rgba(0,0,0,0.08)" }}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                    <Award className="h-3.5 w-3.5" /> Conquistas
                  </p>
                  <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
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

            {/* ── Indicação card ── */}
            {currentUser && currentUser.id === perfil.id && (
              <div className="px-4 mb-5">
                <div className="bg-white rounded-3xl p-4 shadow-sm" style={{ boxShadow: "0 2px 16px rgba(0,0,0,0.08)" }}>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5" /> Indique amigos
                    </p>
                    <div className="flex items-center gap-3 text-[11px] text-slate-500 font-semibold">
                      <span>{perfil.amigosIndicados ?? 0} amigo{(perfil.amigosIndicados ?? 0) !== 1 ? "s" : ""}</span>
                      {(perfil.pontosGanhos ?? 0) > 0 && (
                        <span className="text-amber-600 font-bold">+{perfil.pontosGanhos} pts</span>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-slate-500 mb-3 leading-relaxed">
                    Compartilhe seu código e ganhe <span className="font-bold text-slate-700">+100 pontos</span> por cada amigo que se cadastrar.
                  </p>

                  {perfil.codigoIndicacao ? (
                    <>
                      {/* Code display */}
                      <div className="flex items-center gap-3 mb-3 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3">
                        <span className="text-2xl font-black tracking-widest text-slate-900 flex-1 text-center select-all">
                          {perfil.codigoIndicacao}
                        </span>
                      </div>

                      {/* Action buttons */}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => {
                            const link = `https://aicompensa.com.br/cadastro?ref=${perfil.codigoIndicacao}`;
                            navigator.clipboard.writeText(link)
                              .then(() => toast({ title: "Link copiado!", description: `aicompensa.com.br/cadastro?ref=${perfil.codigoIndicacao}` }))
                              .catch(() => toast({ title: "Erro ao copiar", variant: "destructive" }));
                          }}
                          className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors active:scale-95"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          Copiar código
                        </button>

                        <button
                          onClick={() => {
                            const link = `https://aicompensa.com.br/cadastro?ref=${perfil.codigoIndicacao}`;
                            const msg = encodeURIComponent(
                              `Oi! Estou no AíCompensa, app que ajuda a encontrar os melhores preços no supermercado. 🛒\nUse meu código *${perfil.codigoIndicacao}* ao criar sua conta!\n${link}`
                            );
                            window.open(`https://wa.me/?text=${msg}`, "_blank", "noopener,noreferrer");
                          }}
                          className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-colors active:scale-95"
                          style={{ background: "rgba(37,211,102,0.1)", border: "1px solid rgba(37,211,102,0.25)", color: "#16a34a" }}
                        >
                          <Share2 className="h-3.5 w-3.5" />
                          WhatsApp
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-slate-400 text-center py-2">Código sendo gerado...</p>
                  )}
                </div>
              </div>
            )}

            {/* ── Personal info card ── */}
            {currentUser && (
              <div className="px-4 mb-5">
                <div className="bg-white rounded-3xl p-4 shadow-sm" style={{ boxShadow: "0 2px 16px rgba(0,0,0,0.08)" }}>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">Dados pessoais</p>
                  <div className="space-y-3">
                    <InfoRow label="Nome" value={currentUser.nome} />
                    <InfoRow label="E-mail" value={currentUser.email} />
                    <InfoRow label="Cidade" value={`${currentUser.cidade} — ${currentUser.estado}`} />
                  </div>
                </div>
              </div>
            )}

            {/* ── Notificações ── */}
            <NotificacoesCard />

            {/* ── Suporte & Legal group ── */}
            <div className="px-4 mb-3">
              <p
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.25)",
                  marginBottom: 8,
                  paddingLeft: 2,
                }}
              >
                Suporte &amp; Legal
              </p>
              <div
                style={{
                  borderRadius: 20,
                  overflow: "hidden",
                  border: "1px solid rgba(255,255,255,0.07)",
                }}
              >
                {/* Ajuda */}
                <Link href="/ajuda">
                  <div
                    className="flex items-center gap-3 px-4 cursor-pointer"
                    style={{
                      padding: "12px 16px",
                      background: "rgba(255,255,255,0.04)",
                      borderBottom: "1px solid rgba(255,255,255,0.05)",
                      transition: "background 0.15s",
                    }}
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 9,
                        background: "rgba(242,193,78,0.1)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <HelpCircle size={15} style={{ color: "#F2C14E" }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <p className="font-semibold text-sm" style={{ color: "#f1f5f9", lineHeight: 1.2 }}>Ajuda e Suporte</p>
                      <p className="text-xs" style={{ color: "rgba(255,255,255,0.32)", marginTop: 1 }}>FAQ, tutoriais e contato</p>
                    </div>
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="rgba(242,193,78,0.4)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                </Link>

                {/* Termos */}
                <Link href="/termos">
                  <div
                    className="flex items-center gap-3 cursor-pointer"
                    style={{
                      padding: "12px 16px",
                      background: "rgba(255,255,255,0.03)",
                      borderBottom: "1px solid rgba(255,255,255,0.05)",
                      transition: "background 0.15s",
                    }}
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 9,
                        background: "rgba(167,139,250,0.08)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <FileText size={14} style={{ color: "#a78bfa" }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <p className="font-semibold text-sm" style={{ color: "rgba(255,255,255,0.8)", lineHeight: 1.2 }}>Termos de Uso</p>
                      <p className="text-xs" style={{ color: "rgba(255,255,255,0.28)", marginTop: 1 }}>Regras da plataforma</p>
                    </div>
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="rgba(167,139,250,0.3)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                </Link>

                {/* Privacidade */}
                <Link href="/privacidade">
                  <div
                    className="flex items-center gap-3 cursor-pointer"
                    style={{
                      padding: "12px 16px",
                      background: "rgba(255,255,255,0.02)",
                      transition: "background 0.15s",
                    }}
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 9,
                        background: "rgba(96,165,250,0.08)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Shield size={14} style={{ color: "#60a5fa" }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <p className="font-semibold text-sm" style={{ color: "rgba(255,255,255,0.8)", lineHeight: 1.2 }}>Política de Privacidade</p>
                      <p className="text-xs" style={{ color: "rgba(255,255,255,0.28)", marginTop: 1 }}>Como usamos seus dados · LGPD</p>
                    </div>
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="rgba(96,165,250,0.3)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                </Link>
              </div>
            </div>

            {/* ── Admin mode card — only for super admins ── */}
            {currentUser?.isAdmin && (
              <div className="px-4 mb-3">
                <Link href="/admin">
                  <div
                    className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl cursor-pointer transition-all active:scale-[0.98]"
                    style={{
                      background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 60%, #4c1d95 100%)",
                      boxShadow: "0 4px 24px rgba(30,27,75,0.35), 0 0 0 1px rgba(242,193,78,0.15)",
                    }}
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: "#F2C14E" }}
                    >
                      <Shield className="h-5 w-5" style={{ color: "#1e1b4b" }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-white leading-tight">Painel Admin</p>
                      <p className="text-xs mt-0.5" style={{ color: "rgba(199,210,254,0.7)" }}>
                        Acesso instantâneo · Mesma sessão
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span
                        className="text-[9px] font-black px-2 py-0.5 rounded-full"
                        style={{ background: "#F2C14E", color: "#1e1b4b" }}
                      >
                        ADMIN
                      </span>
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                        <path d="M6 4l4 4-4 4" stroke="rgba(199,210,254,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  </div>
                </Link>
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
                           className={`flex items-center gap-2 p-2.5 rounded-xl transition-colors ${
                             isCurrent ? "bg-amber-50 border border-amber-200" :
                             isPast    ? "opacity-50" : ""
                           }`}>
                        <span className={`text-xs font-black px-2.5 py-1 rounded-full shrink-0 ${v.bg} ${v.color}`}>
                          {NIVEL_EMOJI[name]} {name}
                        </span>
                        <span className="text-[10px] text-slate-400 ml-auto shrink-0">
                          {v.max !== null ? `${v.min}–${v.max} pts` : `${v.min}+ pts`}
                        </span>
                        {isCurrent && (
                          <span className="text-[10px] font-bold text-[#B8900E] bg-amber-100 px-2 py-0.5 rounded-full shrink-0">
                            Você
                          </span>
                        )}
                        {isPast && (
                          <span className="text-[10px] shrink-0">✓</span>
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

function NotificacoesCard() {
  const { supported, permission, subscribed, loading, subscribe, unsubscribe } = usePush();

  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && (navigator as { standalone?: boolean }).standalone === true);
  const needsInstall = ios && !standalone;

  async function handleToggle() {
    if (subscribed) {
      await unsubscribe();
      toast({ title: "Notificações desativadas" });
    } else {
      const result = await subscribe();
      if (result === "subscribed") {
        toast({ title: "✅ Notificações ativadas!", description: "Você receberá alertas de preço em tempo real." });
      } else if (result === "denied") {
        toast({ title: "Permissão negada", description: "Ative nas configurações do navegador.", variant: "destructive" });
      }
    }
  }

  return (
    <div className="px-4 mb-5">
      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.25)", marginBottom: 8, paddingLeft: 2 }}>
        Notificações
      </p>
      <div style={{ borderRadius: 20, overflow: "hidden", border: "1px solid rgba(255,255,255,0.07)" }}>
        <div
          className="flex items-center gap-3"
          style={{ padding: "14px 16px", background: "rgba(255,255,255,0.04)" }}
        >
          {/* Icon */}
          <div style={{ width: 36, height: 36, borderRadius: 11, background: subscribed ? "rgba(242,193,78,0.14)" : "rgba(139,92,246,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {subscribed
              ? <Bell size={16} style={{ color: "#F2C14E" }} />
              : <BellOff size={16} style={{ color: "#a78bfa" }} />
            }
          </div>

          {/* Text */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="font-semibold text-sm" style={{ color: "#f1f5f9", lineHeight: 1.2 }}>Alertas de preço</p>
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.32)", marginTop: 2, lineHeight: 1.4 }}>
              {needsInstall
                ? "Instale o app na tela inicial para ativar"
                : subscribed
                  ? "Ativo — você receberá notificações"
                  : permission === "denied"
                    ? "Bloqueado — ative nas configurações do navegador"
                    : !supported
                      ? "Não suportado neste navegador"
                      : "Desativado"}
            </p>
          </div>

          {/* Toggle / action */}
          {needsInstall ? (
            <div style={{ display: "flex", alignItems: "center", gap: 4, color: "rgba(167,139,250,0.6)" }}>
              <Smartphone size={14} />
            </div>
          ) : permission === "denied" || !supported ? (
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>—</span>
          ) : (
            <button
              onClick={handleToggle}
              disabled={loading}
              style={{
                width: 44,
                height: 26,
                borderRadius: 13,
                background: subscribed ? "#F2C14E" : "rgba(255,255,255,0.12)",
                border: "none",
                position: "relative",
                cursor: "pointer",
                transition: "background 0.2s",
                flexShrink: 0,
                opacity: loading ? 0.5 : 1,
              }}
              aria-label={subscribed ? "Desativar notificações" : "Ativar notificações"}
            >
              <span
                style={{
                  position: "absolute",
                  top: 3,
                  left: subscribed ? 21 : 3,
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  background: subscribed ? "#14532d" : "rgba(255,255,255,0.5)",
                  transition: "left 0.2s",
                  display: "block",
                }}
              />
            </button>
          )}
        </div>

        {/* iOS install hint row */}
        {needsInstall && (
          <div style={{ padding: "10px 16px 12px", background: "rgba(139,92,246,0.06)", borderTop: "1px solid rgba(139,92,246,0.12)" }}>
            <p style={{ fontSize: 11, color: "rgba(167,139,250,0.7)", lineHeight: 1.5 }}>
              <span style={{ fontWeight: 700 }}>Como instalar:</span> Toque em <span style={{ fontWeight: 700 }}>Compartilhar ⬆️</span> no Safari, depois em <span style={{ fontWeight: 700 }}>Adicionar à Tela de Início</span>.
            </p>
          </div>
        )}

        {/* Preferences link row */}
        <Link href="/preferencias-notificacoes">
          <div
            className="flex items-center justify-between"
            style={{ padding: "12px 16px", background: "rgba(255,255,255,0.03)", borderTop: "1px solid rgba(255,255,255,0.07)", cursor: "pointer" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Settings size={15} style={{ color: "rgba(255,255,255,0.35)", flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>Preferências de notificação</span>
            </div>
            <ChevronRight size={14} style={{ color: "rgba(255,255,255,0.25)" }} />
          </div>
        </Link>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-slate-100 last:border-0">
      <span className="text-xs text-slate-400 font-medium">{label}</span>
      <span className="text-xs font-bold text-slate-800">{value}</span>
    </div>
  );
}
