import { useMemo, useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { ChevronLeft, Trophy, Star, Flame, Users } from "lucide-react";
import {
  useListOfertas, getListOfertasQueryKey, useGetStats, getGetStatsQueryKey,
  useLikeOferta, useValidarOferta, useDenunciarOferta,
  type Oferta,
} from "@workspace/api-client-react";
import { OfertaModal } from "@/components/oferta-modal";
import { useSeo } from "@/lib/seo";

const R = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

const COPA_CATEGORIES = ["Bebidas", "Alimentos", "Carnes", "Hortifruti", "Higiene"];

const MEDAL: Record<number, { emoji: string; color: string; bg: string }> = {
  1: { emoji: "🥇", color: "#FFD700", bg: "rgba(255,215,0,0.15)" },
  2: { emoji: "🥈", color: "#C0C0C0", bg: "rgba(192,192,192,0.12)" },
  3: { emoji: "🥉", color: "#CD7F32", bg: "rgba(205,127,50,0.12)" },
};

const CATEGORY_EMOJI: Record<string, string> = {
  Bebidas: "🍺", Alimentos: "🍿", Carnes: "🥩", Hortifruti: "🥦", Higiene: "🪥",
};

export default function RankingCopa() {
  useSeo({
    title: "Ranking da Copa ⚽",
    description: "Veja as melhores ofertas da Copa no AíCompensa. Bebidas, alimentos e tudo que você precisa para a torcida.",
  });

  const [modalOferta, setModalOferta] = useState<Oferta | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const likeMutation      = useLikeOferta();
  const validarMutation   = useValidarOferta();
  const denunciarMutation = useDenunciarOferta();

  const { data: feedPage, isLoading } = useListOfertas(
    { ordenar: "score" },
    { query: { queryKey: getListOfertasQueryKey({ ordenar: "score" }) } },
  );
  const { data: stats } = useGetStats({ query: { queryKey: getGetStatsQueryKey() } });

  const copaOfertas = useMemo(() => {
    const items = feedPage?.items ?? [];
    return items
      .filter((o) => COPA_CATEGORIES.includes(o.categoria))
      .slice(0, 20);
  }, [feedPage]);

  const grouped = useMemo(() => {
    const source = activeCategory
      ? copaOfertas.filter((o) => o.categoria === activeCategory)
      : copaOfertas;
    const map = new Map<string, Oferta>();
    for (const o of source) {
      const key = `${o.produto.toLowerCase()}__${o.mercado.toLowerCase()}`;
      const existing = map.get(key);
      if (!existing || o.preco < existing.preco) {
        map.set(key, o);
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      const scoreA = (a.confirmacoes + a.validacoes) * 10 - a.preco;
      const scoreB = (b.confirmacoes + b.validacoes) * 10 - b.preco;
      return scoreB - scoreA;
    });
  }, [copaOfertas, activeCategory]);

  return (
    <div
      className="min-h-screen pb-24"
      style={{ background: "linear-gradient(160deg, #0d0620 0%, #130926 60%, #0b1020 100%)" }}
    >
      {/* Header */}
      <div
        className="sticky top-0 z-20 flex items-center gap-3 px-4 py-3"
        style={{ background: "rgba(13,6,32,0.92)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(58,24,103,0.4)" }}
      >
        <Link href="/">
          <button className="p-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
            <ChevronLeft className="h-5 w-5 text-white/70" />
          </button>
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-xl">⚽</span>
          <div>
            <p className="text-sm font-black text-white leading-tight">Ranking da Copa</p>
            <p className="text-[10px] text-slate-500">Melhores ofertas para a torcida</p>
          </div>
        </div>
      </div>

      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-4 mt-5 rounded-2xl overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #1a1205 0%, #0d0e05 50%, #0d0620 100%)",
          border: "1.5px solid rgba(242,193,78,0.3)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4), 0 0 24px rgba(242,193,78,0.12)",
        }}
      >
        <div className="px-5 py-5">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-4xl">🏆</span>
            <div>
              <p className="text-lg font-black text-white leading-tight">Copa das Ofertas</p>
              <p className="text-[11px] font-medium" style={{ color: "#F2C14E" }}>Economize na hora do jogo!</p>
            </div>
          </div>
          <div className="flex gap-3">
            {[
              { icon: Flame, label: "Ofertas Copa", value: String(copaOfertas.length) },
              { icon: Users, label: "Categorias", value: String(COPA_CATEGORIES.length) },
              { icon: Star, label: "Confirmadas", value: String(copaOfertas.reduce((s, o) => s + o.confirmacoes, 0)) },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex-1 rounded-xl px-2 py-2 text-center" style={{ background: "rgba(255,255,255,0.05)" }}>
                <Icon className="h-3.5 w-3.5 mx-auto mb-0.5" style={{ color: "#F2C14E" }} />
                <p className="text-sm font-black text-white leading-none">{value}</p>
                <p className="text-[9px] text-slate-500 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Category pills */}
      <div className="flex gap-2 px-4 mt-4 overflow-x-auto no-scrollbar pb-1">
        <button
          onClick={() => setActiveCategory(null)}
          className="shrink-0 text-[11px] font-semibold px-3 py-1 rounded-full"
          style={{
            background: activeCategory === null ? "rgba(242,193,78,0.35)" : "rgba(242,193,78,0.08)",
            color: "#F2C14E",
            border: activeCategory === null ? "1px solid rgba(242,193,78,0.7)" : "1px solid rgba(242,193,78,0.2)",
          }}
        >
          Todas
        </button>
        {COPA_CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
            className="shrink-0 text-[11px] font-semibold px-3 py-1 rounded-full"
            style={{
              background: activeCategory === cat ? "rgba(242,193,78,0.35)" : "rgba(242,193,78,0.08)",
              color: "#F2C14E",
              border: activeCategory === cat ? "1px solid rgba(242,193,78,0.7)" : "1px solid rgba(242,193,78,0.2)",
            }}
          >
            {CATEGORY_EMOJI[cat]} {cat}
          </button>
        ))}
      </div>

      {/* Ranking list */}
      <div className="px-4 mt-5 space-y-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-3">
          <Trophy className="inline h-3 w-3 mr-1" />
          Top Ofertas da Copa
        </p>

        {isLoading && (
          <div className="flex flex-col gap-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="h-16 rounded-2xl animate-pulse"
                style={{ background: "rgba(255,255,255,0.04)" }}
              />
            ))}
          </div>
        )}

        {!isLoading && grouped.length === 0 && (
          <div className="text-center py-16">
            <span className="text-5xl block mb-3">⚽</span>
            <p className="text-sm font-semibold text-white/50">Nenhuma oferta Copa disponível</p>
            <p className="text-xs text-slate-600 mt-1">Publique a primeira oferta para a torcida!</p>
            <Link href="/publicar">
              <button
                className="mt-4 px-6 py-2 rounded-full text-sm font-bold"
                style={{ background: "linear-gradient(135deg, #F2C14E, #D4A017)", color: "#0d0620" }}
              >
                Publicar oferta
              </button>
            </Link>
          </div>
        )}

        {grouped.map((item, idx) => {
          const rank = idx + 1;
          const medal = MEDAL[rank];
          const emoji = CATEGORY_EMOJI[item.categoria] ?? "🛒";
          const total = item.confirmacoes + item.validacoes;

          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.03 }}
              className="flex items-center gap-3 rounded-2xl px-3.5 py-3 cursor-pointer active:opacity-70"
              onClick={() => setModalOferta(item)}
              style={{
                background: medal
                  ? `linear-gradient(135deg, ${medal.bg}, rgba(255,255,255,0.02))`
                  : "rgba(255,255,255,0.03)",
                border: medal
                  ? `1px solid ${medal.color}33`
                  : "1px solid rgba(58,24,103,0.4)",
              }}
            >
              {/* Rank */}
              <div className="w-8 shrink-0 text-center">
                {medal ? (
                  <span className="text-xl">{medal.emoji}</span>
                ) : (
                  <span className="text-sm font-black" style={{ color: "#3a1867" }}>#{rank}</span>
                )}
              </div>

              {/* Emoji */}
              <span className="text-lg shrink-0">{emoji}</span>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white leading-tight truncate">{item.produto}</p>
                <p className="text-[10px] text-slate-500 truncate">{item.mercado}</p>
              </div>

              {/* Price + confirmations */}
              <div className="text-right shrink-0">
                <p className="text-base font-black leading-none" style={{ color: "#F2C14E" }}>
                  {R(item.preco)}
                </p>
                {total > 0 && (
                  <p className="text-[9px] text-slate-600 mt-0.5">✅ {total}</p>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Footer CTA */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="mx-4 mt-8 rounded-2xl px-5 py-4 text-center"
        style={{
          background: "rgba(242,193,78,0.07)",
          border: "1px solid rgba(242,193,78,0.2)",
        }}
      >
        <p className="text-sm font-bold text-white mb-1">Achou uma oferta pra Copa?</p>
        <p className="text-xs text-slate-500 mb-3">Publique e ajude a torcida a economizar!</p>
        <Link href="/publicar">
          <button
            className="px-8 py-2.5 rounded-full text-sm font-black"
            style={{ background: "linear-gradient(135deg, #F2C14E, #D4A017)", color: "#0d0620" }}
          >
            ⚽ Publicar oferta da Copa
          </button>
        </Link>
      </motion.div>

      {stats && (
        <p className="text-center text-[10px] text-slate-700 mt-4 pb-4">
          {stats.totalOfertas} ofertas ativas na plataforma
        </p>
      )}

      <OfertaModal
        oferta={modalOferta}
        referencePrice={null}
        onClose={() => setModalOferta(null)}
        onLike={() => modalOferta && likeMutation.mutate({ id: modalOferta.id, data: {} })}
        onValidar={() => modalOferta && validarMutation.mutate({ id: modalOferta.id, data: {} })}
        onDenunciar={() => modalOferta && denunciarMutation.mutate({ id: modalOferta.id, data: {} })}
        isLiking={likeMutation.isPending}
        isValidating={validarMutation.isPending}
        isDenouncing={denunciarMutation.isPending}
      />
    </div>
  );
}
