import { motion } from "framer-motion";
import { Loader2, Star } from "lucide-react";
import { useGetRanking, getGetRankingQueryKey } from "@workspace/api-client-react";

const NIVEL: Record<string, { color: string; bg: string }> = {
  Iniciante:    { color: "text-slate-600",   bg: "bg-slate-100"   },
  Explorador:   { color: "text-blue-600",    bg: "bg-blue-100"    },
  "Caçador":    { color: "text-emerald-700", bg: "bg-emerald-100" },
  Especialista: { color: "text-amber-700",   bg: "bg-amber-100"   },
  Mestre:       { color: "text-orange-700",  bg: "bg-orange-100"  },
  Lenda:        { color: "text-purple-700",  bg: "bg-purple-100"  },
};

const PODIUM_COLORS = [
  { border: "#94A3B8", bg: "#F1F5F9", label: "#64748B" },  // 2nd — silver
  { border: "#F59E0B", bg: "#FFFBEB", label: "#B45309" },  // 1st — gold
  { border: "#B45309", bg: "#FEF3C7", label: "#92400E" },  // 3rd — bronze
];
const MEDAL_EMOJI = ["🥇", "🥈", "🥉"];

export default function Ranking() {
  const { data: ranking, isLoading } = useGetRanking({
    query: { queryKey: getGetRankingQueryKey() },
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col min-h-full bg-[#0f172a]"
    >
      {/* Header */}
      <div className="px-5 pt-6 pb-4">
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1">Comunidade</p>
        <h1 className="text-white font-black text-2xl leading-tight">Ranking de Caçadores</h1>
        <p className="text-slate-400 text-sm mt-1">Quem mais ajuda a comunidade a economizar</p>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-400 mb-3" />
          <p className="text-slate-400 text-sm">Carregando ranking...</p>
        </div>
      ) : !ranking || ranking.length === 0 ? (
        <div className="mx-4 p-10 text-center rounded-3xl bg-[#1e293b] border border-[#334155]">
          <p className="text-slate-400">O ranking ainda está vazio.</p>
        </div>
      ) : (
        <div className="px-4 pb-6 space-y-4">
          {/* ── Premium podium ── */}
          {ranking.length >= 3 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="rounded-3xl border border-yellow-900/40 overflow-hidden"
              style={{ background: "linear-gradient(135deg, #1a1000 0%, #2d1f00 50%, #1a1500 100%)", boxShadow: "0 8px 40px rgba(251,191,36,0.12)" }}
            >
              <div className="px-4 pt-5 pb-2 text-center">
                <div className="text-3xl mb-1">🏆</div>
                <p className="text-yellow-500 text-xs font-bold uppercase tracking-widest">Top Caçadores</p>
              </div>

              {/* Podium columns: 2nd | 1st | 3rd */}
              <div className="grid grid-cols-3 gap-2 px-3 pb-4 items-end">
                {([ranking[1], ranking[0], ranking[2]] as typeof ranking).map((user, podiumIdx) => {
                  const realIdx = [1, 0, 2][podiumIdx];
                  const heights = ["h-16", "h-24", "h-12"];
                  const pc = PODIUM_COLORS[podiumIdx];
                  if (!user) return <div key={podiumIdx} />;
                  return (
                    <motion.div
                      key={user.id}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.15 + podiumIdx * 0.08 }}
                      className="flex flex-col items-center gap-1.5"
                    >
                      {/* Avatar */}
                      <div className="h-11 w-11 rounded-full flex items-center justify-center font-black text-sm border-2"
                           style={{ borderColor: pc.border, background: pc.bg, color: pc.label }}>
                        {user.nome.substring(0, 2).toUpperCase()}
                      </div>
                      <p className="text-white text-[10px] font-bold text-center leading-tight truncate w-full px-1">{user.nome}</p>
                      <p className="text-yellow-400 text-[11px] font-black">{user.pontos} pts</p>
                      {/* Podium bar */}
                      <div className={`w-full rounded-t-2xl flex flex-col items-center justify-end pb-2 ${heights[podiumIdx]}`}
                           style={{ background: `${pc.bg}22`, border: `1px solid ${pc.border}44` }}>
                        <span className="text-xl">{MEDAL_EMOJI[realIdx ?? 0]}</span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* ── Full list ── */}
          <div className="space-y-2.5">
            {ranking.map((user, index) => {
              const cfg = NIVEL[user.nivel] ?? NIVEL["Bronze"];
              const isTop3 = index < 3;
              return (
                <motion.div
                  key={user.id}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 + index * 0.05 }}
                >
                  <div
                    className={`bg-white rounded-2xl p-4 flex items-center gap-3 ${isTop3 ? "border-l-4" : ""}`}
                    style={isTop3 ? { borderLeftColor: ["#F59E0B", "#94A3B8", "#B45309"][index], boxShadow: "0 2px 12px rgba(0,0,0,0.08)" } : { boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}
                  >
                    {/* Position */}
                    <div className="w-8 text-center shrink-0">
                      {index < 3
                        ? <span className="text-xl">{MEDAL_EMOJI[index]}</span>
                        : <span className="text-slate-400 font-bold text-sm">#{index + 1}</span>
                      }
                    </div>

                    {/* Avatar */}
                    <div className="h-10 w-10 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-700 font-black text-sm shrink-0">
                      {user.nome.substring(0, 2).toUpperCase()}
                    </div>

                    {/* Name + level */}
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-slate-900 text-sm truncate">{user.nome}</div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
                        {user.nivel}
                      </span>
                    </div>

                    {/* Points */}
                    <div className="text-right shrink-0">
                      <div className="font-black text-lg text-slate-900 flex items-center gap-1 justify-end">
                        {user.pontos}
                        <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                      </div>
                      <p className="text-[10px] text-slate-400">pontos</p>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}
    </motion.div>
  );
}
