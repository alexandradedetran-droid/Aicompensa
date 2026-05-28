import { useState, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  MapPin, Store, ChevronRight, TrendingDown, Users, Flame, Heart,
  Bell, Navigation, Map as MapIcon, Loader2, Clock, CheckCircle, Star, ShoppingCart, BarChart2, Share2,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetStats, getGetStatsQueryKey,
  useListOfertas, getListOfertasQueryKey,
  useGetAlertaMatches, getGetAlertaMatchesQueryKey,
  useGetEconomiaDiaria, getGetEconomiaDiariaQueryKey,
  useValidarOferta, useLikeOferta, useDenunciarOferta,
  type Oferta,
} from "@workspace/api-client-react";
import { isToday, differenceInMinutes } from "date-fns";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/current-user";
import { useLoginPrompt } from "@/lib/login-prompt";
import { MapModal } from "@/components/map-modal";
import { OfertaModal, CATEGORY_CONFIG, getCategoryUnit } from "@/components/oferta-modal";
import { ComparacaoModal } from "@/components/comparacao-modal";
import { groupOfertas, type GrupoOferta } from "@/lib/group-ofertas";
import { RadarSection, LocationPromptBanner } from "@/components/radar-section";
import { loadCoords, saveCoords } from "@/lib/distance";
import { toast } from "sonner";

// ── Helpers ───────────────────────────────────────────────────────────────────

const R = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

function plural(n: number, singular: string, pluralWord: string) {
  return `${n} ${n === 1 ? singular : pluralWord}`;
}

/** Estimated travel time in minutes at ~20 km/h (urban average) */
function tempoMin(km: number): number {
  return Math.max(1, Math.round(km * 3));
}

/** Google Maps directions or search URL for an offer */
function rotaUrl(o: Oferta): string {
  if (o.latitude != null && o.longitude != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${o.latitude},${o.longitude}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${o.mercado} ${o.bairro ?? ""} ${o.cidade}`)}`;
}

/**
 * Adjusted score: penalizes distance so nearby cheap offers rank above
 * distant cheap ones. Lower is better.
 */
function adjustedScore(o: Oferta): number {
  if (o.status === "expirada") return Infinity;
  const d = o.distancia ?? 0;
  return o.preco * (1 + 0.15 * d);
}

/** "Atualizado há X min/h" or "Confirmado hoje" */
function timeAgoShort(iso: string): string {
  const mins = differenceInMinutes(new Date(), new Date(iso));
  if (mins < 1) return "Agora";
  if (mins < 60) return `${mins}min atrás`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h atrás`;
  return "Ontem";
}

// ── Greeting ─────────────────────────────────────────────────────────────────

function Greeting({
  coords,
  isLocating,
  onLocate,
}: {
  coords: { lat: number; lng: number } | null;
  isLocating: boolean;
  onLocate: () => void;
}) {
  const h = new Date().getHours();
  const text  = h < 12 ? "Bom dia"  : h < 18 ? "Boa tarde"  : "Boa noite";
  const emoji = h < 12 ? "☀️"       : h < 18 ? "🌤️"         : "🌙";

  return (
    <div className="flex items-center justify-between px-5 pt-5 pb-3">
      <div>
        <p className="text-slate-400 text-xs font-medium uppercase tracking-widest">
          {emoji} {text}
        </p>
        <h1 className="text-white font-black text-lg leading-tight">
          Economize no mercado
        </h1>
      </div>
      <button
        onClick={onLocate}
        disabled={isLocating}
        className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold border transition-all ${
          coords
            ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300"
            : "bg-[#1e293b] border-[#334155] text-slate-300 hover:border-emerald-500/40"
        }`}
      >
        {isLocating ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <MapPin className={`h-3.5 w-3.5 ${coords ? "text-emerald-400" : "text-slate-400"}`} />
        )}
        {coords ? "Localizado" : "Localizar"}
      </button>
    </div>
  );
}

// ── Hero card ─────────────────────────────────────────────────────────────────

function HeroCard({
  oferta,
  avgPreco,
  onCompare,
}: {
  oferta: Oferta;
  avgPreco: number | null;
  onCompare: () => void;
}) {
  const savings    = avgPreco && avgPreco > oferta.preco ? avgPreco - oferta.preco : null;
  const savingsPct = savings && avgPreco ? Math.round((savings / avgPreco) * 100) : null;
  const hasDistance = oferta.distancia != null;
  const timeEstimate = hasDistance ? tempoMin(oferta.distancia!) : null;

  return (
    <div
      className="rounded-3xl overflow-hidden relative"
      style={{
        background: "linear-gradient(135deg, #065f46 0%, #059669 55%, #10b981 100%)",
        boxShadow: "0 8px 40px rgba(5,150,105,0.4)",
      }}
    >
      {/* Decorative circles */}
      <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/[0.07] pointer-events-none" />
      <div className="absolute top-20 -right-6 w-24 h-24 rounded-full bg-white/[0.05] pointer-events-none" />

      <div className="relative p-5">
        {/* Label */}
        <p className="text-white/70 text-[10px] font-bold uppercase tracking-[0.12em] mb-2 flex items-center gap-1.5">
          <Flame className="h-3 w-3" /> Melhor oferta perto de você
        </p>

        {/* Main content row */}
        <div className="flex gap-3">
          {/* Foto */}
          {oferta.fotoUrl && (
            <div className="shrink-0 w-20 h-20 rounded-2xl overflow-hidden bg-black/20">
              <img
                src={oferta.fotoUrl}
                alt={oferta.produto}
                className="w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            </div>
          )}

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h2 className="text-white font-black text-xl leading-tight line-clamp-2 mb-0.5">
              {oferta.produto}
            </h2>
            {oferta.marca && (
              <p className="text-white/60 text-xs mb-1">{oferta.marca}</p>
            )}
            <div className="text-[11px] text-white/70 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="flex items-center gap-1 font-semibold text-white/85">
                <Store className="h-3 w-3" /> {oferta.mercado}
              </span>
              {(oferta.bairro || oferta.cidade) && (
                <span className="flex items-center gap-0.5">
                  <MapPin className="h-3 w-3 shrink-0" />
                  {[oferta.bairro, oferta.cidade].filter(Boolean).join(", ")}
                </span>
              )}
              {hasDistance && (
                <>
                  <span className="flex items-center gap-1 font-bold text-white">
                    📍 {oferta.distancia!.toFixed(1)} km
                  </span>
                  {timeEstimate && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> ≈ {timeEstimate} min
                    </span>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Price column */}
          <div className="shrink-0 text-right">
            <div className="text-[36px] font-black text-white leading-none tracking-tight">
              {R(oferta.preco)}
              {getCategoryUnit(oferta.categoria) && (
                <span className="text-[18px] font-bold ml-0.5">{getCategoryUnit(oferta.categoria)}</span>
              )}
            </div>
            <p className="text-white/60 text-[10px] mt-0.5">menor preço</p>
          </div>
        </div>

        {/* Savings badge */}
        {savingsPct !== null && savingsPct >= 5 && (
          <div className="mt-3 inline-flex items-center gap-1.5 bg-white/20 backdrop-blur-sm rounded-full px-3 py-1.5">
            <TrendingDown className="h-3.5 w-3.5 text-white" />
            <span className="text-white font-black text-xs">
              {savingsPct}% mais barato · você economiza {R(savings!)}
            </span>
          </div>
        )}

        {/* Badges + validations */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          {oferta.status === "validada" && (
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-white/20 text-white flex items-center gap-1">
              <CheckCircle className="h-3 w-3" />
              Validado
            </span>
          )}
          <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-white/15 text-white/90">
            {plural(oferta.validacoes, "validação", "validações")}
          </span>
          {oferta.ultimaValidacaoEm && (
            <span className="text-[10px] text-white/60">
              · {timeAgoShort(oferta.ultimaValidacaoEm)}
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div className="mt-4 flex gap-2">
          <a
            href={rotaUrl(oferta)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-1.5 bg-white text-emerald-800 font-black text-xs h-10 rounded-2xl active:scale-95 transition-all"
          >
            <Navigation className="h-3.5 w-3.5" />
            Ver rota
          </a>
          <button
            onClick={onCompare}
            className="flex-1 flex items-center justify-center gap-1.5 bg-white/20 hover:bg-white/30 text-white font-bold text-xs h-10 rounded-2xl active:scale-95 transition-all"
          >
            Comparar preços
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Stats strip ───────────────────────────────────────────────────────────────

function StatsStrip({
  totalOfertas,
  menorPreco,
  bestSavings,
  lider,
}: {
  totalOfertas: number;
  menorPreco: number | null | undefined;
  bestSavings: number | null;
  lider: { nome: string; pontos: number } | null | undefined;
}) {
  const items = [
    { emoji: "🛒", value: String(totalOfertas), label: "Ofertas ativas" },
    { emoji: "💰", value: menorPreco != null ? R(menorPreco) : "—", label: "Menor preço" },
    { emoji: "📉", value: bestSavings != null && bestSavings > 0 ? R(bestSavings) : "—", label: "Economia do dia" },
    { emoji: "🏆", value: lider?.nome?.split(" ")[0] ?? "—", label: "Líder" },
  ];

  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar px-4">
      {items.map(({ emoji, value, label }) => (
        <div
          key={label}
          className="shrink-0 bg-[#1e293b] rounded-2xl p-3 text-center border border-[#334155] min-w-[74px]"
        >
          <div className="text-base mb-1">{emoji}</div>
          <div className="text-xs font-black text-white truncate max-w-[68px]">{value}</div>
          <div className="text-[9px] text-slate-500 font-medium mt-0.5 leading-tight">{label}</div>
        </div>
      ))}
    </div>
  );
}

// ── "Confirmadas hoje" item ───────────────────────────────────────────────────

function ConfirmadaCard({ oferta }: { oferta: Oferta }) {
  return (
    <Link href="/ofertas">
      <div className="bg-[#1e293b] rounded-2xl p-3.5 flex items-center gap-3 border border-emerald-900/40 cursor-pointer active:scale-[0.98] transition-transform">
        <div className="shrink-0 w-12 h-12 rounded-xl overflow-hidden bg-[#0f172a] flex items-center justify-center">
          {oferta.fotoUrl ? (
            <img
              src={oferta.fotoUrl}
              alt={oferta.produto}
              className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            <Store className="h-5 w-5 text-slate-600" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm text-white truncate">{oferta.produto}</p>
          <p className="text-xs text-slate-400 truncate">
            {oferta.mercado}{oferta.bairro ? ` · ${oferta.bairro}` : ""}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
              <CheckCircle className="h-3 w-3" />
              {plural(oferta.validacoes, "validação", "validações")}
            </span>
            {oferta.distancia != null && (
              <span className="text-[10px] text-slate-500">📍 {oferta.distancia.toFixed(1)} km</span>
            )}
            {oferta.ultimaValidacaoEm && (
              <span className="text-[10px] text-slate-600 ml-auto">
                {timeAgoShort(oferta.ultimaValidacaoEm)}
              </span>
            )}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-lg font-black text-emerald-400">
            {R(oferta.preco)}
            {getCategoryUnit(oferta.categoria) && (
              <span className="text-[11px] font-bold ml-0.5">{getCategoryUnit(oferta.categoria)}</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

// ── "Melhor custo-benefício" item ─────────────────────────────────────────────

function BestValueCard({
  grupo,
  rank,
  onCompare,
}: {
  grupo: GrupoOferta;
  rank: number;
  onCompare: (g: GrupoOferta) => void;
}) {
  const oferta = grupo.best;
  const avgPreco =
    grupo.count > 1
      ? grupo.ofertas.reduce((s, o) => s + o.preco, 0) / grupo.count
      : null;
  const savings    = avgPreco && avgPreco > oferta.preco ? avgPreco - oferta.preco : null;
  const savingsPct = savings && avgPreco ? Math.round((savings / avgPreco) * 100) : null;

  const rankColors = [
    "from-yellow-500/20 to-amber-500/10 border-yellow-600/30",
    "from-slate-400/15 to-slate-500/5 border-slate-600/30",
    "from-orange-600/15 to-orange-700/5 border-orange-700/30",
  ];

  return (
    <div
      className={`bg-gradient-to-br ${rankColors[rank] ?? "from-slate-800/40 to-slate-900/20 border-[#334155]"} rounded-2xl p-3.5 border cursor-pointer active:scale-[0.98] transition-transform`}
      onClick={() => onCompare(grupo)}
    >
      <div className="flex items-center gap-3">
        {/* Rank badge */}
        <div className="shrink-0 w-7 h-7 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-xs font-black text-white">
          {rank + 1}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <p className="font-black text-sm text-white truncate">{oferta.produto}</p>
            {grupo.count > 1 && (
              <span className="text-[9px] font-black bg-emerald-500/30 text-emerald-300 px-1.5 py-0.5 rounded-full shrink-0 border border-emerald-500/30">
                {grupo.count} mercados
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 flex-wrap">
            <span className="font-semibold text-slate-300">
              {oferta.mercado}{grupo.count > 1 ? " e outros" : ""}
            </span>
            {oferta.distancia != null && (
              <span>📍 {oferta.distancia.toFixed(1)} km · ⏱️ {tempoMin(oferta.distancia)} min</span>
            )}
          </div>
          {savingsPct !== null && savingsPct >= 3 && (
            <span className="text-[10px] font-bold text-emerald-400">
              ↓ {savingsPct}% vs. média do grupo
            </span>
          )}
        </div>

        {/* Price */}
        <div className="shrink-0 text-right">
          <div className="text-xl font-black text-white">
            {R(oferta.preco)}
            {getCategoryUnit(oferta.categoria) && (
              <span className="text-[11px] font-bold ml-0.5">{getCategoryUnit(oferta.categoria)}</span>
            )}
          </div>
          {grupo.count > 1 ? (
            <div className="text-[10px] text-emerald-400 font-bold mt-0.5">
              Comparar →
            </div>
          ) : (
            oferta.distancia != null && (
              <div className="text-[10px] text-slate-500">{oferta.distancia.toFixed(1)} km</div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

// ── "Melhores comparações do dia" card ───────────────────────────────────────

function ComparacaoCard({
  grupo,
  onCompare,
}: {
  grupo: GrupoOferta;
  onCompare: (g: GrupoOferta) => void;
}) {
  const cat  = CATEGORY_CONFIG[grupo.categoria] ?? { emoji: "🛒", bg: "#1e3a2f" };
  const unit = getCategoryUnit(grupo.categoria);

  return (
    <div
      onClick={() => onCompare(grupo)}
      className="bg-[#1e293b] rounded-2xl p-3.5 flex items-center gap-3 border border-[#334155] cursor-pointer active:scale-[0.98] transition-transform"
    >
      <div
        className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-2xl"
        style={{ background: cat.bg + "33" }}
      >
        {cat.emoji}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <p className="font-black text-sm text-white truncate">{grupo.produto}</p>
          <span className="text-[9px] font-black bg-emerald-500/30 text-emerald-300 px-1.5 py-0.5 rounded-full shrink-0 border border-emerald-500/30">
            🏪 {grupo.count}
          </span>
        </div>
        <p className="text-xs text-slate-400">
          A partir de{" "}
          <span className="font-black text-emerald-400">
            {R(grupo.minPreco)}{unit}
          </span>
        </p>
        {grupo.savings > 0.01 && (
          <p className="text-[10px] font-bold text-emerald-600 mt-0.5">
            💰 Economize até {R(grupo.savings)}{unit}
          </p>
        )}
      </div>

      <ChevronRight className="h-4 w-4 text-slate-600 shrink-0" />
    </div>
  );
}

// ── Mais Curtidas Card ───────────────────────────────────────────────────────

function MaisCurtidasCard({
  oferta,
  onClick,
}: {
  oferta: Oferta;
  onClick: () => void;
}) {
  const R = (n: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

  const CATEGORY_EMOJI: Record<string, string> = {
    Alimentos: "🛒", Bebidas: "🥤", Limpeza: "🧹", Higiene: "🧴",
    Carnes: "🥩", Hortifruti: "🥦", Laticínios: "🧀", Padaria: "🍞",
    Congelados: "❄️", Outros: "📦",
  };

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const text = `🛒 ${oferta.produto} por ${R(oferta.preco)} em ${oferta.mercado}${oferta.bairro ? ` (${oferta.bairro})` : ""}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Comparador de Preços", text, url: window.location.origin });
      } else {
        await navigator.clipboard.writeText(`${text}\n${window.location.origin}`);
      }
    } catch { /* user cancelled */ }
  };

  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden cursor-pointer hover:shadow-md transition-shadow shrink-0"
      style={{ width: 160 }}
    >
      {/* Photo / emoji area */}
      <div
        className="w-full flex items-center justify-center relative"
        style={{ height: 90, background: "#f8fafc" }}
      >
        {oferta.fotoUrl ? (
          <img
            src={oferta.fotoUrl}
            alt={oferta.produto}
            className="w-full h-full object-cover"
            onError={(e) => {
              const el = e.target as HTMLImageElement;
              el.style.display = "none";
            }}
          />
        ) : (
          <span style={{ fontSize: 36 }}>{CATEGORY_EMOJI[oferta.categoria] ?? "📦"}</span>
        )}
        {/* Curtidas bubble */}
        <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 bg-pink-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full shadow-sm">
          <Heart className="h-2.5 w-2.5 fill-white" />
          {oferta.curtidas}
        </div>
      </div>

      <div className="p-2.5">
        <h3 className="text-xs font-black text-slate-900 leading-tight line-clamp-2 mb-1">
          {oferta.produto}
        </h3>
        <p className="text-[11px] text-slate-400 truncate flex items-center gap-0.5 mb-1.5">
          <Store className="h-2.5 w-2.5 shrink-0" /> {oferta.mercado}
        </p>
        <div className="flex items-center justify-between">
          <span className="text-sm font-black text-emerald-600">{R(oferta.preco)}</span>
          <button
            onClick={handleShare}
            className="h-6 w-6 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 hover:text-blue-500 hover:bg-blue-50 transition-colors active:scale-95"
          >
            <Share2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ── Section heading ──────────────────────────────────────────────────────────

function SectionHeading({
  icon: Icon,
  label,
  badge,
}: {
  icon: React.ElementType;
  label: string;
  badge?: string;
}) {
  return (
    <div className="flex items-center justify-between mb-2.5">
      <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-400 flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5" /> {label}
      </p>
      {badge && (
        <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">
          {badge}
        </span>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Home() {
  const [, setLocation] = useLocation();
  const { requireLogin, openPrompt } = useLoginPrompt();
  const currentUser = getCurrentUser();
  const uid = currentUser?.id ?? 0;

  const [coords, setCoords]         = useState<{ lat: number; lng: number } | null>(() => loadCoords());
  const [isLocating, setIsLocating] = useState(false);
  const [mapOpen, setMapOpen]       = useState(false);
  const [compareGrupo, setCompareGrupo] = useState<GrupoOferta | null>(null);
  const [detailOferta, setDetailOferta] = useState<Oferta | null>(null);

  const queryClient     = useQueryClient();
  const likeMutation    = useLikeOferta();
  const validarMutation = useValidarOferta();
  const denunciarMutation = useDenunciarOferta();

  // ── Data fetching ──
  const listParams = useMemo(
    () =>
      coords
        ? { lat: coords.lat, lng: coords.lng, raio: 50, ordenar: "score" as const }
        : { ordenar: "score" as const },
    [coords],
  );

  const { data: stats } = useGetStats({
    query: { queryKey: getGetStatsQueryKey() },
  });
  const { data: allOfertas, isLoading } = useListOfertas(listParams, {
    query: { queryKey: getListOfertasQueryKey(listParams) },
  });
  const { data: alertaMatches } = useGetAlertaMatches(
    { usuarioId: uid },
    { query: { queryKey: getGetAlertaMatchesQueryKey({ usuarioId: uid }), enabled: uid > 0 } },
  );
  const { data: economia } = useGetEconomiaDiaria({
    query: { queryKey: getGetEconomiaDiariaQueryKey() },
  });

  const alertaCount = alertaMatches?.count ?? 0;

  // ── Computed values ──
  const grupos = useMemo(() => groupOfertas(allOfertas ?? []), [allOfertas]);

  const heroGrupo = grupos[0] ?? null;
  const heroOffer = heroGrupo?.best ?? null;

  /** Average price per product name (case-insensitive) for hero savings */
  const avgPrecoMap = useMemo(() => {
    const map = new Map<string, { sum: number; count: number }>();
    for (const o of allOfertas ?? []) {
      const k = o.produto.toLowerCase();
      const cur = map.get(k) ?? { sum: 0, count: 0 };
      map.set(k, { sum: cur.sum + o.preco, count: cur.count + 1 });
    }
    const result = new Map<string, number>();
    for (const [k, { sum, count }] of map) result.set(k, sum / count);
    return result;
  }, [allOfertas]);

  const getAvg = (o: Oferta) => avgPrecoMap.get(o.produto.toLowerCase()) ?? null;

  /** Best savings amount across all offers (for stats strip) */
  const bestSavings = useMemo(() => {
    let best = 0;
    for (const o of allOfertas ?? []) {
      const avg = getAvg(o);
      if (avg && avg > o.preco) best = Math.max(best, avg - o.preco);
    }
    return best > 0 ? best : null;
  }, [allOfertas, avgPrecoMap]);

  /** Offers validated today, excluding the hero, max 3 */
  const confirmadosHoje = useMemo(
    () =>
      (allOfertas ?? [])
        .filter(
          (o) =>
            o.id !== heroOffer?.id &&
            o.ultimaValidacaoEm &&
            isToday(new Date(o.ultimaValidacaoEm)),
        )
        .slice(0, 3),
    [allOfertas, heroOffer],
  );

  /** Top 3 best-value groups (adjusted score), excluding hero's group */
  const melhorCusto = useMemo(
    () =>
      grupos
        .filter((g) => g.key !== heroGrupo?.key && g.best.status !== "expirada")
        .slice(0, 3),
    [grupos, heroGrupo],
  );

  /** Groups with 2+ markets = "Melhores comparações do dia" (max 5, no hero) */
  const melhoresComparacoes = useMemo(
    () =>
      grupos
        .filter((g) => g.count > 1 && g.key !== heroGrupo?.key)
        .slice(0, 5),
    [grupos, heroGrupo],
  );

  /** Top curtidas — sorted by curtidas desc, min 2, excluding hero, max 5 */
  const maisCurtidas = useMemo(
    () =>
      [...(allOfertas ?? [])]
        .filter((o) => o.curtidas >= 2 && o.id !== heroOffer?.id && o.status !== "expirada")
        .sort((a, b) => b.curtidas - a.curtidas)
        .slice(0, 5),
    [allOfertas, heroOffer],
  );

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListOfertasQueryKey() });

  // ── Geolocation ──
  function handleLocate() {
    if (coords) {
      setCoords(null);
      saveCoords(null);
      toast.info("Localização desativada.");
      return;
    }
    if (!navigator.geolocation) {
      toast.error("Seu navegador não suporta geolocalização.");
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCoords(c);
        saveCoords(c);
        setIsLocating(false);
        toast.success("📍 Localização ativa! Calculando distâncias...");
      },
      () => {
        toast.error("Não foi possível obter a localização. Verifique as permissões.");
        setIsLocating(false);
      },
      { timeout: 10000 },
    );
  }

  // ── Comparison modal actions ──
  const handleCompareValidar = (o: Oferta) => {
    requireLogin(() => {
      const user = getCurrentUser();
      if (!user) return;
      validarMutation.mutate({ id: o.id, data: { usuarioId: user.id } }, {
        onSuccess: () => { invalidate(); toast.success("Validado! +2 pontos para quem publicou."); },
        onError: () => toast.error("Não foi possível validar."),
      });
    });
  };

  const handleCompareLike = (o: Oferta) => {
    requireLogin(() => {
      const user = getCurrentUser();
      if (!user) return;
      likeMutation.mutate({ id: o.id, data: { usuarioId: user.id } }, {
        onSuccess: invalidate,
        onError: () => toast.error("Não foi possível curtir."),
      });
    });
  };

  const handleCompareDenunciar = (o: Oferta) => {
    requireLogin(() => {
      const user = getCurrentUser();
      if (!user) return;
      denunciarMutation.mutate({ id: o.id, data: { usuarioId: user.id } }, {
        onSuccess: (u) => {
          invalidate();
          u.status === "suspeita"
            ? toast.warning("Oferta marcada como suspeita.")
            : toast.info("Denúncia registrada.");
        },
        onError: () => toast.error("Não foi possível denunciar."),
      });
    });
  };

  const handleCompareDetail = (o: Oferta) => {
    setCompareGrupo(null);
    setDetailOferta(o);
  };

  // ── Detail (OfertaModal) actions ──
  const handleDetailLike = () => {
    requireLogin(() => {
      const user = getCurrentUser();
      if (!user || !detailOferta) return;
      likeMutation.mutate({ id: detailOferta.id, data: { usuarioId: user.id } }, {
        onSuccess: invalidate,
        onError: () => toast.error("Não foi possível curtir."),
      });
    });
  };

  const handleDetailValidar = () => {
    requireLogin(() => {
      const user = getCurrentUser();
      if (!user || !detailOferta) return;
      validarMutation.mutate({ id: detailOferta.id, data: { usuarioId: user.id } }, {
        onSuccess: () => { invalidate(); toast.success("Validado! +2 pontos."); },
        onError: () => toast.error("Não foi possível validar."),
      });
    });
  };

  const handleDetailDenunciar = () => {
    requireLogin(() => {
      const user = getCurrentUser();
      if (!user || !detailOferta) return;
      denunciarMutation.mutate({ id: detailOferta.id, data: { usuarioId: user.id } }, {
        onSuccess: (u) => {
          invalidate();
          u.status === "suspeita"
            ? toast.warning("Oferta marcada como suspeita.")
            : toast.info("Denúncia registrada.");
        },
        onError: () => toast.error("Não foi possível denunciar."),
      });
    });
  };

  // ── Render ──
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col min-h-full bg-[#0f172a] gap-5"
    >
      {/* ── Header ── */}
      <Greeting coords={coords} isLocating={isLocating} onLocate={handleLocate} />

      {/* ── Alert banner ── */}
      {alertaCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="mx-4 -mt-3"
        >
          <Link href="/alertas">
            <div className="flex items-center gap-3 bg-emerald-500/15 border border-emerald-500/40 rounded-2xl px-4 py-3 cursor-pointer active:scale-[0.98] transition-transform">
              <Bell className="h-5 w-5 text-emerald-400 shrink-0" />
              <p className="flex-1 text-emerald-300 text-sm font-semibold">
                🔔 Você tem{" "}
                <span className="font-black text-emerald-400">
                  {alertaCount} {alertaCount === 1 ? "oferta" : "ofertas"}
                </span>{" "}
                no seu alerta de preço
              </p>
              <ChevronRight className="h-4 w-4 text-emerald-500 shrink-0" />
            </div>
          </Link>
        </motion.div>
      )}

      {/* ── Hero card ── */}
      <div className="px-4">
        {isLoading ? (
          <div className="h-52 rounded-3xl skeleton-shimmer" />
        ) : heroOffer ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
          >
            <HeroCard
              oferta={heroOffer}
              avgPreco={getAvg(heroOffer)}
              onCompare={() => heroGrupo && setCompareGrupo(heroGrupo)}
            />
          </motion.div>
        ) : null}
      </div>

      {/* ── Stats strip ── */}
      {!isLoading && stats && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.13 }}
          className="pb-1"
        >
          <StatsStrip
            totalOfertas={stats.totalOfertas}
            menorPreco={stats.menorPreco}
            bestSavings={bestSavings}
            lider={stats.lider}
          />
        </motion.div>
      )}

      {/* ── Confirmadas hoje ── */}
      {!isLoading && confirmadosHoje.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16 }}
          className="px-4"
        >
          <SectionHeading
            icon={CheckCircle}
            label="Confirmadas hoje"
            badge={`${plural(confirmadosHoje.length, "validada", "validadas")}`}
          />
          <div className="space-y-2">
            {confirmadosHoje.map((o) => (
              <ConfirmadaCard key={o.id} oferta={o} />
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Radar de Promoções Próximas ── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.17 }}
        className="px-4"
      >
        {coords ? (
          <RadarSection ofertas={allOfertas ?? []} isLoading={isLoading} />
        ) : (
          <LocationPromptBanner isLocating={isLocating} onLocate={handleLocate} />
        )}
      </motion.div>

      {/* ── Melhores comparações do dia ── */}
      {!isLoading && melhoresComparacoes.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.19 }}
          className="px-4"
        >
          <SectionHeading
            icon={BarChart2}
            label="Melhores comparações do dia"
            badge={`${melhoresComparacoes.length} produto${melhoresComparacoes.length > 1 ? "s" : ""}`}
          />
          <div className="space-y-2">
            {melhoresComparacoes.map((g) => (
              <ComparacaoCard
                key={g.key}
                grupo={g}
                onCompare={setCompareGrupo}
              />
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Melhor custo-benefício ── */}
      {!isLoading && melhorCusto.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="px-4"
        >
          <SectionHeading
            icon={Star}
            label="Melhor custo-benefício"
            badge={coords ? "Com distância" : undefined}
          />
          <div className="space-y-2">
            {melhorCusto.map((g, i) => (
              <BestValueCard
                key={g.key}
                grupo={g}
                rank={i}
                onCompare={setCompareGrupo}
              />
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Mais Curtidas ── */}
      {!isLoading && maisCurtidas.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.21 }}
          className="pl-4"
        >
          <div className="pr-4 mb-2.5">
            <SectionHeading
              icon={Heart}
              label="Mais curtidas"
              badge={`${maisCurtidas.length} ofertas`}
            />
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 pr-4" style={{ scrollSnapType: "x mandatory" }}>
            {maisCurtidas.map((o) => (
              <div key={o.id} style={{ scrollSnapAlign: "start" }}>
                <MaisCurtidasCard
                  oferta={o}
                  onClick={() => setDetailOferta(o)}
                />
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* ── CTA buttons ── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.23 }}
        className="px-4 space-y-2.5"
      >
        <div className="grid grid-cols-2 gap-2.5">
          <Button
            onClick={() => setMapOpen(true)}
            className="w-full h-12 text-sm font-bold rounded-2xl gap-2"
            style={{
              background: "linear-gradient(135deg,#1e3a5f,#1e40af)",
              boxShadow: "0 4px 20px rgba(30,64,175,0.35)",
            }}
          >
            <MapIcon className="h-4 w-4" />
            Ver no mapa
          </Button>
          <Button
            variant="outline"
            onClick={() => openPrompt("/publicar")}
            className="w-full h-12 text-sm font-bold rounded-2xl border-[#334155] text-emerald-400 hover:bg-[#1e293b] bg-transparent gap-2"
          >
            💰 Ganhar pontos
          </Button>
        </div>
        <Link href="/lista">
          <div className="w-full h-12 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm cursor-pointer active:scale-[0.98] transition-all"
               style={{ background: "linear-gradient(135deg,#3b0764,#7e22ce)", boxShadow: "0 4px 20px rgba(126,34,206,0.35)" }}>
            <ShoppingCart className="h-4 w-4 text-white" />
            <span className="text-white">📋 Minha lista de compras</span>
          </div>
        </Link>
      </motion.div>

      {/* ── Ranking preview ── */}
      {stats?.lider && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.27 }}
          className="px-4 mb-6"
        >
          <Link href="/ranking">
            <div
              className="rounded-2xl p-4 flex items-center gap-3 cursor-pointer active:scale-[0.98] transition-transform border border-yellow-900/40"
              style={{
                background: "linear-gradient(135deg, #1c1400 0%, #2d1f00 100%)",
                boxShadow: "0 2px 20px rgba(251,191,36,0.08)",
              }}
            >
              <div className="text-3xl">🏆</div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold text-yellow-500 uppercase tracking-widest">
                  Líder do ranking
                </p>
                <p className="font-black text-white">{stats.lider.nome}</p>
                <p className="text-xs text-yellow-700">
                  {stats.lider.pontos} pontos · {stats.lider.nivel}
                </p>
              </div>
              <Users className="h-4 w-4 text-yellow-700 shrink-0" />
            </div>
          </Link>
        </motion.div>
      )}

      {/* ── Economia stats ── */}
      {economia && economia.economiaTotal > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="px-4 mb-2"
        >
          <SectionHeading icon={TrendingDown} label="Economia da comunidade" />
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-[#1e293b] rounded-2xl p-3 text-center border border-[#334155]">
              <div className="text-base mb-0.5">💰</div>
              <div className="text-xs font-black text-emerald-400 truncate">{R(economia.economiaTotal)}</div>
              <div className="text-[9px] text-slate-500 mt-0.5">Economia mapeada</div>
            </div>
            <div className="bg-[#1e293b] rounded-2xl p-3 text-center border border-[#334155]">
              <div className="text-base mb-0.5">🏪</div>
              <div className="text-xs font-black text-white truncate">{economia.mercadoMaisEconomico ?? "—"}</div>
              <div className="text-[9px] text-slate-500 mt-0.5">Mais econômico</div>
            </div>
            <div className="bg-[#1e293b] rounded-2xl p-3 text-center border border-[#334155]">
              <div className="text-base mb-0.5">✅</div>
              <div className="text-xs font-black text-white">{economia.ofertasConfirmadasHoje}</div>
              <div className="text-[9px] text-slate-500 mt-0.5">Confirmadas hoje</div>
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Map modal ── */}
      <MapModal
        open={mapOpen}
        onClose={() => setMapOpen(false)}
        ofertas={allOfertas ?? []}
        userCoords={coords}
      />

      {/* ── Comparison modal ── */}
      <ComparacaoModal
        grupo={compareGrupo}
        onClose={() => setCompareGrupo(null)}
        onOpenDetail={handleCompareDetail}
        onValidar={handleCompareValidar}
        onLike={handleCompareLike}
        onDenunciar={handleCompareDenunciar}
        isValidating={validarMutation.isPending}
      />

      {/* ── Detail modal ── */}
      <OfertaModal
        oferta={detailOferta}
        referencePrice={null}
        onClose={() => setDetailOferta(null)}
        onLike={handleDetailLike}
        onValidar={handleDetailValidar}
        onDenunciar={handleDetailDenunciar}
        isLiking={likeMutation.isPending}
        isValidating={validarMutation.isPending}
        isDenouncing={denunciarMutation.isPending}
      />
    </motion.div>
  );
}
