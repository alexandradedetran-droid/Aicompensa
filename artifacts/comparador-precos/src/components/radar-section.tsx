import { useState, useMemo } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Navigation, MapPin, Loader2, ChevronRight, Radar, PlusCircle } from "lucide-react";
import { type Oferta } from "@workspace/api-client-react";
import { formatDistance, tempoEstimadoMin, getBestValueScore, getRadarBadge } from "@/lib/distance";
import { cn } from "@/lib/utils";

/* ── Helpers ─────────────────────────────────────────────────────────────── */

const R = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

function rotaUrl(o: Oferta): string {
  if (o.latitude != null && o.longitude != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${o.latitude},${o.longitude}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${o.mercado} ${o.bairro ?? ""} ${o.cidade ?? ""}`,
  )}`;
}

/* ── Config ─────────────────────────────────────────────────────────────── */

const RAIO_OPTIONS = [
  { label: "1 km", value: 1 },
  { label: "3 km", value: 3 },
  { label: "5 km", value: 5 },
  { label: "10 km", value: 10 },
  { label: "Qualquer", value: 9999 },
];

type SortKey = "nearest" | "cheapest" | "bestvalue" | "recent" | "validated";

const SORT_OPTIONS: { label: string; value: SortKey }[] = [
  { label: "🧭 Mais perto",    value: "nearest" },
  { label: "💸 Menor preço",   value: "cheapest" },
  { label: "⚖️ Melhor custo",  value: "bestvalue" },
  { label: "🕐 Mais recente",  value: "recent" },
  { label: "✅ Mais validada", value: "validated" },
];

/* ── Badge display ───────────────────────────────────────────────────────── */

function RadarBadgeChip({ badge }: { badge: ReturnType<typeof getRadarBadge> }) {
  if (!badge) return null;
  const config = {
    perto:        { label: "📍 Perto de você", className: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" },
    menor_regiao: { label: "🏆 Menor preço da região", className: "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30" },
    vale_viagem:  { label: "✈️ Vale a viagem", className: "bg-blue-500/20 text-blue-300 border border-blue-500/30" },
  }[badge];
  return (
    <span className={cn("text-[9px] font-black px-2 py-0.5 rounded-full shrink-0", config.className)}>
      {config.label}
    </span>
  );
}

/* ── RadarCard ───────────────────────────────────────────────────────────── */

function RadarCard({ oferta, badge }: { oferta: Oferta; badge: ReturnType<typeof getRadarBadge> }) {
  const dist = oferta.distancia;
  const tempo = dist != null ? tempoEstimadoMin(dist) : null;

  return (
    <div className="bg-[#1e293b] rounded-2xl p-3.5 border border-[#334155] active:scale-[0.98] transition-transform">
      <div className="flex items-start gap-3">
        {/* Photo / Emoji */}
        <div className="shrink-0 w-14 h-14 rounded-xl overflow-hidden bg-[#0f172a] flex items-center justify-center">
          {oferta.fotoUrl ? (
            <img
              src={oferta.fotoUrl}
              alt={oferta.produto}
              className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            <span className="text-2xl">🛒</span>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="font-black text-sm text-white leading-tight truncate">{oferta.produto}</p>
            <p className="text-xl font-black text-emerald-400 shrink-0 leading-none">{R(oferta.preco)}</p>
          </div>

          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className="text-[11px] text-slate-300 font-semibold truncate">
              🏪 {oferta.mercado}
            </span>
            {oferta.bairro && (
              <span className="text-[11px] text-slate-500 truncate">· {oferta.bairro}</span>
            )}
          </div>

          {/* Distance + time */}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {dist != null ? (
              <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-0.5">
                <MapPin className="h-3 w-3" />
                {formatDistance(dist)}
              </span>
            ) : (
              <span className="text-[11px] text-slate-600">Distância indisponível</span>
            )}
            {tempo && (
              <span className="text-[10px] text-slate-500">≈ {tempo} min</span>
            )}
            {oferta.validacoes > 0 && (
              <span className="text-[10px] text-slate-500 ml-auto">
                ✅ {oferta.validacoes} {oferta.validacoes === 1 ? "validação" : "validações"}
              </span>
            )}
          </div>

          {/* Badges */}
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            <RadarBadgeChip badge={badge} />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-3">
        <a
          href={rotaUrl(oferta)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex items-center justify-center gap-1.5 bg-[#0f172a] border border-[#334155] text-slate-300 font-bold text-xs h-9 rounded-xl px-3 active:scale-95 transition-all hover:border-emerald-500/40 hover:text-emerald-400"
        >
          <Navigation className="h-3.5 w-3.5" />
          Rota
        </a>
        <Link href="/ofertas" className="flex-1">
          <button className="w-full flex items-center justify-center gap-1.5 bg-emerald-600/20 border border-emerald-600/40 text-emerald-400 font-bold text-xs h-9 rounded-xl px-3 active:scale-95 transition-all hover:bg-emerald-600/30">
            Ver ofertas
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </Link>
      </div>
    </div>
  );
}

/* ── Empty state ─────────────────────────────────────────────────────────── */

function RadarEmpty({
  raioKm,
  onExpandRaio,
}: {
  raioKm: number;
  onExpandRaio: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-8 px-4 bg-[#1e293b] rounded-2xl border border-[#334155]">
      <Radar className="h-10 w-10 text-slate-600 mb-3" />
      <p className="font-bold text-slate-300 text-sm mb-1">
        Nenhuma promoção encontrada num raio de{" "}
        {raioKm >= 9999 ? "qualquer distância" : `${raioKm} km`}
      </p>
      <p className="text-xs text-slate-500 mb-4">
        Tente ampliar o raio ou seja o primeiro a publicar!
      </p>
      <div className="flex flex-col gap-2 w-full max-w-xs">
        {raioKm < 9999 && (
          <button
            onClick={onExpandRaio}
            className="w-full py-2.5 rounded-xl bg-emerald-600/20 border border-emerald-600/40 text-emerald-400 font-bold text-xs active:scale-95 transition-all"
          >
            🔍 Aumentar raio
          </button>
        )}
        <Link href="/ofertas">
          <button className="w-full py-2.5 rounded-xl bg-[#0f172a] border border-[#334155] text-slate-300 font-bold text-xs active:scale-95 transition-all">
            Ver todas as promoções
          </button>
        </Link>
        <Link href="/publicar">
          <button className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#0f172a] border border-[#334155] text-slate-300 font-bold text-xs active:scale-95 transition-all">
            <PlusCircle className="h-3.5 w-3.5" />
            Publicar uma oferta
          </button>
        </Link>
      </div>
    </div>
  );
}

/* ── Location prompt (no coords) ─────────────────────────────────────────── */

export function LocationPromptBanner({
  isLocating,
  onLocate,
}: {
  isLocating: boolean;
  onLocate: () => void;
}) {
  return (
    <div className="bg-gradient-to-br from-[#0c1f1a] to-[#0f2d24] rounded-2xl p-4 border border-emerald-900/50"
         style={{ boxShadow: "0 4px 24px rgba(16,185,129,0.08)" }}>
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
          <Radar className="h-5 w-5 text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-black text-white text-sm leading-tight mb-1">
            Radar de Promoções Próximas
          </p>
          <p className="text-xs text-slate-400 leading-relaxed">
            Ative a localização para ver promoções e mercados perto de você, com distância e tempo estimado.
          </p>
        </div>
      </div>
      <button
        onClick={onLocate}
        disabled={isLocating}
        className="mt-3 w-full flex items-center justify-center gap-2 h-10 rounded-xl bg-emerald-600 text-white font-bold text-sm active:scale-95 transition-all disabled:opacity-60"
        style={{ boxShadow: "0 4px 16px rgba(16,185,129,0.3)" }}
      >
        {isLocating ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Localizando...</>
        ) : (
          <><MapPin className="h-4 w-4" /> Ativar localização</>
        )}
      </button>
      <p className="text-center text-[10px] text-slate-600 mt-2">
        Você pode continuar usando o app sem localização
      </p>
    </div>
  );
}

/* ── Main RadarSection ───────────────────────────────────────────────────── */

export function RadarSection({
  ofertas,
  isLoading,
}: {
  ofertas: Oferta[];
  isLoading: boolean;
}) {
  const [raioKm, setRaioKm]       = useState(5);
  const [sortKey, setSortKey]     = useState<SortKey>("nearest");

  // Filter by distance
  const nearby = useMemo(
    () => ofertas.filter((o) => o.distancia != null && o.distancia <= raioKm && o.status !== "expirada"),
    [ofertas, raioKm],
  );

  // Sort
  const sorted = useMemo(() => {
    const arr = [...nearby];
    switch (sortKey) {
      case "nearest":   return arr.sort((a, b) => (a.distancia ?? 999) - (b.distancia ?? 999));
      case "cheapest":  return arr.sort((a, b) => a.preco - b.preco);
      case "bestvalue": return arr.sort((a, b) => getBestValueScore(a) - getBestValueScore(b));
      case "recent":    return arr.sort((a, b) => new Date(b.dataCriacao).getTime() - new Date(a.dataCriacao).getTime());
      case "validated": return arr.sort((a, b) => b.validacoes - a.validacoes);
      default:          return arr;
    }
  }, [nearby, sortKey]);

  // Show max 6 in radar preview
  const visible = sorted.slice(0, 6);

  const handleExpandRaio = () => {
    const current = RAIO_OPTIONS.findIndex((o) => o.value === raioKm);
    const next = RAIO_OPTIONS[current + 1];
    if (next) setRaioKm(next.value);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
    >
      {/* Section header */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-400 flex items-center gap-1.5">
          <Radar className="h-3.5 w-3.5" /> Radar de Promoções Próximas
        </p>
        {nearby.length > 0 && (
          <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">
            {nearby.length} {nearby.length === 1 ? "oferta" : "ofertas"}
          </span>
        )}
      </div>

      {/* Raio filter pills */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1 mb-2">
        {RAIO_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setRaioKm(opt.value)}
            className={cn(
              "shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all",
              raioKm === opt.value
                ? "bg-emerald-600 border-emerald-600 text-white"
                : "bg-[#1e293b] border-[#334155] text-slate-400 hover:border-emerald-500/40",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Sort pills */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-2 mb-3">
        {SORT_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setSortKey(opt.value)}
            className={cn(
              "shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all",
              sortKey === opt.value
                ? "bg-[#334155] border-slate-500 text-white"
                : "bg-transparent border-[#334155] text-slate-500 hover:border-slate-500",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Cards */}
      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 bg-[#1e293b] rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <RadarEmpty raioKm={raioKm} onExpandRaio={handleExpandRaio} />
      ) : (
        <div className="space-y-3">
          {visible.map((o) => (
            <RadarCard
              key={o.id}
              oferta={o}
              badge={getRadarBadge(o, nearby)}
            />
          ))}
          {sorted.length > 6 && (
            <Link href="/ofertas">
              <button className="w-full py-3 rounded-2xl border border-[#334155] text-slate-400 font-bold text-xs flex items-center justify-center gap-2 active:scale-95 transition-all hover:border-emerald-500/30 hover:text-emerald-400">
                Ver todas as {sorted.length} ofertas próximas
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </Link>
          )}
        </div>
      )}
    </motion.div>
  );
}
