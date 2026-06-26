import { motion } from "framer-motion";
import { Loader2, Star, Trophy, Calendar, TrendingUp } from "lucide-react";
import { useGetRanking, getGetRankingQueryKey, GetRankingPeriodo } from "@workspace/api-client-react";
import { getCurrentUser } from "@/lib/current-user";
import { useSeo } from "@/lib/seo";

/* ── runtime shape (backend sends posicao + ofertasSemana beyond the typed schema) ── */
type RankUser = {
  id: number;
  nome: string;
  pontos: number;
  nivel: string;
  posicao?: number;
  ofertasSemana?: number;
};

const MEDAL = ["🥇", "🥈", "🥉"];

const PODIUM_CFG = [
  /* 2nd — silver */  { borderColor: "rgba(148,163,184,0.55)", bg: "rgba(148,163,184,0.07)", valueColor: "#94a3b8", barH: 56 },
  /* 1st — gold   */  { borderColor: "rgba(251,191,36,0.75)",  bg: "rgba(251,191,36,0.11)",  valueColor: "#fbbf24", barH: 88 },
  /* 3rd — bronze */  { borderColor: "rgba(180,83,9,0.55)",    bg: "rgba(180,83,9,0.07)",    valueColor: "#d97706", barH: 40 },
];

const NIVEL_COLOR: Record<string, string> = {
  "Estagiário da Economia":    "#64748b",
  "Assistente de Ofertas":     "#60a5fa",
  "Bacharel das Compras":      "#f59e0b",
  "Especialista das Gôndolas": "#f59e0b",
  "Mestre das Pechinchas":     "#fb923c",
  "Doutor da Economia":        "#a78bfa",
  "PhD do Supermercado":       "#facc15",
};

function initials(nome: string) {
  return nome.trim().substring(0, 2).toUpperCase();
}

function ordinal(n: number) {
  return `${n}º`;
}

/* ─────────────────────────────────────────────────────────────────────────── */
export default function Ranking() {
  useSeo({
    title: "Ranking da Comunidade",
    description: "Veja quem são os maiores caçadores de promoção do AíCompensa. Acumule pontos publicando e confirmando ofertas.",
    url: "https://aicompensa.com.br/ranking",
  });

  const { data: rawSemana, isLoading: loadingSemana } = useGetRanking(
    { periodo: GetRankingPeriodo.semana },
    { query: { queryKey: getGetRankingQueryKey({ periodo: GetRankingPeriodo.semana }) } },
  );
  const { data: rawGeral, isLoading: loadingGeral } = useGetRanking(undefined, {
    query: { queryKey: getGetRankingQueryKey() },
  });

  const currentUser = getCurrentUser();
  const isLoading   = loadingSemana || loadingGeral;

  const semana  = (rawSemana  as RankUser[] | undefined) ?? [];
  const geral   = (rawGeral   as RankUser[] | undefined) ?? [];

  const top3Semana  = semana.slice(0, 3);
  const top10Geral  = geral.slice(0, 10);

  /* user's own stats */
  const myGeralIdx  = geral.findIndex((u) => u.id === currentUser?.id);
  const myGeralPos  = myGeralIdx >= 0 ? myGeralIdx + 1 : null;
  const myGeralData = myGeralIdx >= 0 ? geral[myGeralIdx] : null;

  const mySemanaIdx = semana.findIndex((u) => u.id === currentUser?.id);
  const mySemanaPos = mySemanaIdx >= 0 ? mySemanaIdx + 1 : null;
  const mySemanaData = mySemanaIdx >= 0 ? semana[mySemanaIdx] : null;

  /* show "my card" only when logged in and not already visible in top-10 list */
  const myOutsideTop10 = myGeralIdx >= 10;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
      className="flex flex-col min-h-full"
      style={{ background: "#130926" }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="px-5 pt-6 pb-4">
        <p className="text-[11px] font-bold uppercase tracking-widest mb-1" style={{ color: "rgba(255,255,255,0.35)" }}>
          Comunidade
        </p>
        <h1 className="font-black text-2xl leading-tight text-white">Ranking de Pechinchas</h1>
        <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>
          Quem mais ajuda a comunidade a economizar
        </p>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#F2C14E" }} />
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.35)" }}>Carregando ranking…</p>
        </div>
      ) : (
        <div className="px-4 pb-8 space-y-4">

          {/* ── Weekly reward banner ──────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="rounded-2xl px-4 py-3 flex items-center gap-3"
            style={{
              background: "linear-gradient(135deg, rgba(251,191,36,0.13) 0%, rgba(180,83,9,0.09) 100%)",
              border: "1.5px solid rgba(251,191,36,0.22)",
            }}
          >
            <Trophy className="shrink-0 h-5 w-5" style={{ color: "#fbbf24" }} />
            <div className="min-w-0">
              <p className="text-[12px] font-black leading-tight" style={{ color: "#fbbf24" }}>
                Recompensas semanais
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: "rgba(251,191,36,0.65)" }}>
                Os melhores da semana podem ganhar recompensas
              </p>
            </div>
          </motion.div>

          {/* ── Weekly Top 3 ─────────────────────────────────────────────── */}
          {top3Semana.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="rounded-3xl overflow-hidden"
              style={{
                background: "linear-gradient(145deg, #0a1a0e 0%, #0f2214 50%, #091609 100%)",
                border: "1.5px solid rgba(34,197,94,0.2)",
                boxShadow: "0 0 40px rgba(34,197,94,0.07)",
              }}
            >
              {/* section header */}
              <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
                <Calendar className="h-4 w-4 shrink-0" style={{ color: "#4ade80" }} />
                <div>
                  <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: "#4ade80" }}>
                    Top da semana
                  </p>
                  <p className="text-[10px]" style={{ color: "rgba(74,222,128,0.5)" }}>
                    Mais ofertas publicadas nos últimos 7 dias
                  </p>
                </div>
              </div>

              {/* podium: 2nd | 1st | 3rd */}
              <div className="grid grid-cols-3 gap-2 px-3 pb-4 items-end">
                {([top3Semana[1], top3Semana[0], top3Semana[2]] as (RankUser | undefined)[]).map((user, podiumIdx) => {
                  const realRank = [1, 0, 2][podiumIdx]; /* actual 0-based rank */
                  const cfg = PODIUM_CFG[podiumIdx];
                  if (!user) return <div key={podiumIdx} />;
                  return (
                    <motion.div
                      key={user.id}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.18 + podiumIdx * 0.07 }}
                      className="flex flex-col items-center gap-1"
                    >
                      {/* avatar */}
                      <div
                        className="h-11 w-11 rounded-full flex items-center justify-center font-black text-sm border-2"
                        style={{ borderColor: cfg.borderColor, background: cfg.bg, color: cfg.valueColor }}
                      >
                        {initials(user.nome)}
                      </div>
                      <p className="text-white text-[10px] font-bold text-center leading-tight truncate w-full px-1">
                        {user.nome.split(" ")[0]}
                      </p>
                      {user.ofertasSemana != null && (
                        <p className="text-[10px] font-black" style={{ color: cfg.valueColor }}>
                          {user.ofertasSemana} oferta{user.ofertasSemana !== 1 ? "s" : ""}
                        </p>
                      )}
                      {/* podium bar */}
                      <div
                        className="w-full rounded-t-2xl flex items-center justify-center"
                        style={{ height: cfg.barH, background: cfg.bg, border: `1px solid ${cfg.borderColor}` }}
                      >
                        <span className="text-xl">{MEDAL[realRank ?? 0]}</span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {top3Semana.length === 0 && (
            <div
              className="rounded-2xl px-4 py-5 text-center"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.35)" }}>
                Nenhuma oferta publicada esta semana ainda. Seja o primeiro!
              </p>
            </div>
          )}

          {/* ── My stats card (only when logged in) ──────────────────────── */}
          {currentUser && myGeralData && (
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.15 }}
              className="rounded-2xl px-4 py-3 flex items-center gap-3"
              style={{
                background: "linear-gradient(135deg, rgba(242,193,78,0.11) 0%, rgba(212,160,23,0.07) 100%)",
                border: "1.5px solid rgba(242,193,78,0.3)",
                boxShadow: "0 0 24px rgba(242,193,78,0.08)",
              }}
            >
              {/* avatar */}
              <div
                className="h-12 w-12 rounded-full flex items-center justify-center font-black text-base shrink-0"
                style={{ background: "rgba(242,193,78,0.15)", border: "2px solid rgba(242,193,78,0.4)", color: "#F2C14E" }}
              >
                {initials(currentUser.nome)}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-black text-white truncate">{currentUser.nome}</span>
                  <span
                    className="text-[9px] font-black px-1.5 py-0.5 rounded-full shrink-0"
                    style={{ background: "rgba(242,193,78,0.2)", color: "#F2C14E", border: "1px solid rgba(242,193,78,0.3)" }}
                  >
                    Você
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                  {myGeralPos && (
                    <span className="text-[11px] font-bold" style={{ color: "rgba(255,255,255,0.5)" }}>
                      {ordinal(myGeralPos)} geral
                    </span>
                  )}
                  {mySemanaPos && (
                    <span className="text-[11px] font-bold" style={{ color: "#4ade80" }}>
                      {ordinal(mySemanaPos)} semana
                    </span>
                  )}
                  {!mySemanaPos && (
                    <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.25)" }}>
                      Sem ofertas esta semana
                    </span>
                  )}
                </div>
              </div>

              <div className="shrink-0 text-right">
                <div className="flex items-center gap-1 justify-end">
                  <span className="font-black text-xl" style={{ color: "#F2C14E" }}>{myGeralData.pontos}</span>
                  <Star className="h-4 w-4 fill-[#F2C14E]" style={{ color: "#F2C14E" }} />
                </div>
                <p className="text-[10px]" style={{ color: "rgba(242,193,78,0.5)" }}>pontos</p>
              </div>
            </motion.div>
          )}

          {/* ── Top 10 geral ─────────────────────────────────────────────── */}
          <div>
            <div className="flex items-center gap-2 mb-3 px-0.5">
              <TrendingUp className="h-4 w-4 shrink-0" style={{ color: "#F2C14E" }} />
              <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: "#F2C14E" }}>
                Top 10 geral
              </p>
              <div className="flex-1 h-px ml-1" style={{ background: "rgba(242,193,78,0.12)" }} />
            </div>

            <div className="space-y-2">
              {top10Geral.map((user, index) => {
                const isTop3  = index < 3;
                const isMe    = !!currentUser && user.id === currentUser.id;
                const nivelColor = NIVEL_COLOR[user.nivel] ?? "#64748b";
                return (
                  <motion.div
                    key={user.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.12 + index * 0.04 }}
                    className="rounded-2xl px-3.5 py-3 flex items-center gap-3"
                    style={{
                      background: isMe
                        ? "linear-gradient(135deg, rgba(242,193,78,0.1) 0%, rgba(212,160,23,0.06) 100%)"
                        : "rgba(255,255,255,0.03)",
                      border: `1.5px solid ${isMe ? "rgba(242,193,78,0.28)" : isTop3 ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.05)"}`,
                      boxShadow: isMe ? "0 0 16px rgba(242,193,78,0.07)" : undefined,
                    }}
                  >
                    {/* position */}
                    <div className="w-7 text-center shrink-0">
                      {isTop3
                        ? <span className="text-lg leading-none">{MEDAL[index]}</span>
                        : <span className="text-xs font-black" style={{ color: isMe ? "#F2C14E" : "rgba(255,255,255,0.3)" }}>
                            #{index + 1}
                          </span>
                      }
                    </div>

                    {/* avatar */}
                    <div
                      className="h-9 w-9 rounded-full flex items-center justify-center font-black text-xs shrink-0"
                      style={{
                        background: isMe ? "rgba(242,193,78,0.15)" : "rgba(255,255,255,0.06)",
                        border: `1.5px solid ${isMe ? "rgba(242,193,78,0.35)" : "rgba(255,255,255,0.08)"}`,
                        color: isMe ? "#F2C14E" : "rgba(255,255,255,0.55)",
                      }}
                    >
                      {initials(user.nome)}
                    </div>

                    {/* name + level */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-bold text-white truncate">{user.nome}</span>
                        {isMe && (
                          <span
                            className="text-[9px] font-black px-1.5 py-0.5 rounded-full shrink-0"
                            style={{ background: "rgba(242,193,78,0.18)", color: "#F2C14E", border: "1px solid rgba(242,193,78,0.28)" }}
                          >
                            Você
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-semibold" style={{ color: nivelColor }}>
                        {user.nivel}
                      </span>
                    </div>

                    {/* points */}
                    <div className="shrink-0 text-right">
                      <div className="flex items-center gap-1 justify-end">
                        <span className="font-black text-base" style={{ color: isMe ? "#F2C14E" : "rgba(255,255,255,0.85)" }}>
                          {user.pontos}
                        </span>
                        <Star
                          className="h-3.5 w-3.5"
                          style={{ color: isMe ? "#F2C14E" : "rgba(251,191,36,0.7)", fill: isMe ? "#F2C14E" : "rgba(251,191,36,0.7)" }}
                        />
                      </div>
                      <p className="text-[9px]" style={{ color: "rgba(255,255,255,0.25)" }}>pts</p>
                    </div>
                  </motion.div>
                );
              })}

              {/* user outside top 10 — append below the list */}
              {myOutsideTop10 && myGeralData && currentUser && (
                <>
                  <div className="flex items-center gap-2 py-1">
                    <div className="flex-1 h-px border-t border-dashed" style={{ borderColor: "rgba(255,255,255,0.08)" }} />
                    <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.2)" }}>sua posição</span>
                    <div className="flex-1 h-px border-t border-dashed" style={{ borderColor: "rgba(255,255,255,0.08)" }} />
                  </div>
                  <div
                    className="rounded-2xl px-3.5 py-3 flex items-center gap-3"
                    style={{
                      background: "linear-gradient(135deg, rgba(242,193,78,0.1) 0%, rgba(212,160,23,0.06) 100%)",
                      border: "1.5px solid rgba(242,193,78,0.28)",
                    }}
                  >
                    <div className="w-7 text-center shrink-0">
                      <span className="text-xs font-black" style={{ color: "#F2C14E" }}>#{myGeralPos}</span>
                    </div>
                    <div
                      className="h-9 w-9 rounded-full flex items-center justify-center font-black text-xs shrink-0"
                      style={{ background: "rgba(242,193,78,0.15)", border: "1.5px solid rgba(242,193,78,0.35)", color: "#F2C14E" }}
                    >
                      {initials(currentUser.nome)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-white truncate">{currentUser.nome}</span>
                        <span
                          className="text-[9px] font-black px-1.5 py-0.5 rounded-full shrink-0"
                          style={{ background: "rgba(242,193,78,0.18)", color: "#F2C14E", border: "1px solid rgba(242,193,78,0.28)" }}
                        >
                          Você
                        </span>
                      </div>
                      <span className="text-[10px] font-semibold" style={{ color: NIVEL_COLOR[myGeralData.nivel] ?? "#64748b" }}>
                        {myGeralData.nivel}
                      </span>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="flex items-center gap-1 justify-end">
                        <span className="font-black text-base" style={{ color: "#F2C14E" }}>{myGeralData.pontos}</span>
                        <Star className="h-3.5 w-3.5 fill-[#F2C14E]" style={{ color: "#F2C14E" }} />
                      </div>
                      <p className="text-[9px]" style={{ color: "rgba(255,255,255,0.25)" }}>pts</p>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
