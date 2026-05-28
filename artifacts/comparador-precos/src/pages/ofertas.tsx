import { useState, useMemo, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, MapPin, Loader2, ThumbsUp, CheckCircle,
  AlertTriangle, Store, Clock, PlusCircle, BarChart2, Heart, Share2,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistance, isPast, differenceInMinutes } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import {
  useListOfertas,
  getListOfertasQueryKey,
  useLikeOferta,
  useValidarOferta,
  useDenunciarOferta,
  useListFavoritos,
  getListFavoritosQueryKey,
  useSaveFavorito,
  useRemoveFavorito,
  type Oferta,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/current-user";
import { cn } from "@/lib/utils";
import { useLoginPrompt } from "@/lib/login-prompt";
import { loadCoords, saveCoords } from "@/lib/distance";
import { OfertaModal, CATEGORY_CONFIG, getCategoryUnit } from "@/components/oferta-modal";
import { ComparacaoModal } from "@/components/comparacao-modal";
import { groupOfertas, type GrupoOferta } from "@/lib/group-ofertas";

/* ── helpers ──────────────────────────────────────────────────────────────── */

const R = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

type StatusKey = "nova" | "validada" | "suspeita" | "expirada";

const STATUS: Record<StatusKey, { label: string; color: string; dot: string }> = {
  nova:     { label: "Novo",     color: "bg-amber-100 text-amber-700",     dot: "🟡" },
  validada: { label: "Validado", color: "bg-emerald-100 text-emerald-700", dot: "🟢" },
  suspeita: { label: "Suspeito", color: "bg-red-100 text-red-700",         dot: "🔴" },
  expirada: { label: "Expirado", color: "bg-gray-100 text-gray-500",       dot: "⚫" },
};

const CAT_DEFAULT = { emoji: "🛒", bg: "#f1f5f9" };
function getCat(cat: string) {
  return CATEGORY_CONFIG[cat] ?? CAT_DEFAULT;
}

/* ── Skeleton ─────────────────────────────────────────────────────────────── */

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl p-3.5 flex gap-3 shadow-sm border border-slate-100 overflow-hidden">
      <div className="w-[72px] h-[72px] rounded-xl skeleton-shimmer-light shrink-0" />
      <div className="flex-1 space-y-2 min-w-0">
        <div className="flex gap-1.5">
          <div className="h-4 skeleton-shimmer-light rounded-full w-16" />
          <div className="h-4 skeleton-shimmer-light rounded-full w-20" />
        </div>
        <div className="h-4 skeleton-shimmer-light rounded-lg w-2/3" />
        <div className="h-3 skeleton-shimmer-light rounded-lg w-1/2" />
        <div className="h-8 skeleton-shimmer-light rounded-lg w-1/3" />
        <div className="flex gap-2">
          <div className="h-9 skeleton-shimmer-light rounded-xl flex-1" />
          <div className="h-9 skeleton-shimmer-light rounded-xl flex-[2]" />
          <div className="h-9 w-9 skeleton-shimmer-light rounded-xl shrink-0" />
        </div>
      </div>
    </div>
  );
}

/* ── GrupoCard ────────────────────────────────────────────────────────────── */

interface GrupoCardProps {
  grupo: GrupoOferta;
  index: number;
  onOpenModal: (o: Oferta) => void;
  onCompare: (g: GrupoOferta) => void;
  isSaved?: boolean;
  onSave?: () => void;
}

function GrupoCard({ grupo, index, onOpenModal, onCompare, isSaved = false, onSave }: GrupoCardProps) {
  const queryClient   = useQueryClient();
  const { requireLogin } = useLoginPrompt();
  const likeMutation      = useLikeOferta();
  const validarMutation   = useValidarOferta();
  const denunciarMutation = useDenunciarOferta();

  const oferta  = grupo.best;
  const isMulti = grupo.count > 1;

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListOfertasQueryKey() });

  const doLike = () => {
    const user = getCurrentUser();
    if (!user) return;
    likeMutation.mutate({ id: oferta.id, data: { usuarioId: user.id } }, {
      onSuccess: invalidate,
      onError: () => toast.error("Não foi possível curtir."),
    });
  };

  const doValidar = () => {
    const user = getCurrentUser();
    if (!user) return;
    validarMutation.mutate({ id: oferta.id, data: { usuarioId: user.id } }, {
      onSuccess: () => { invalidate(); toast.success("Validado! +2 pontos para quem publicou."); },
      onError: () => toast.error("Não foi possível validar."),
    });
  };

  const doDenunciar = () => {
    const user = getCurrentUser();
    if (!user) return;
    denunciarMutation.mutate({ id: oferta.id, data: { usuarioId: user.id } }, {
      onSuccess: (u) => {
        invalidate();
        u.status === "suspeita"
          ? toast.warning("Oferta marcada como suspeita.")
          : toast.info("Denúncia registrada.");
      },
      onError: () => toast.error("Não foi possível denunciar."),
    });
  };

  const handleLike      = (e: React.MouseEvent) => { e.stopPropagation(); requireLogin(doLike); };
  const handleValidar   = (e: React.MouseEvent) => { e.stopPropagation(); requireLogin(doValidar); };
  const handleDenunciar = (e: React.MouseEvent) => { e.stopPropagation(); requireLogin(doDenunciar); };
  const handleCompare   = (e: React.MouseEvent) => { e.stopPropagation(); onCompare(grupo); };
  const handleCardClick = () => isMulti ? onCompare(grupo) : onOpenModal(oferta);

  const R = (n: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const text = `🛒 ${oferta.produto} por ${R(oferta.preco)} em ${oferta.mercado}${oferta.bairro ? ` (${oferta.bairro})` : ""}`;
    const url = window.location.origin;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Comparador de Preços", text, url });
      } else {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        toast.success("Copiado para a área de transferência!");
      }
    } catch {
      // user cancelled share dialog
    }
  };

  const s         = STATUS[oferta.status as StatusKey] ?? STATUS.nova;
  const isNew     = differenceInMinutes(new Date(), new Date(oferta.dataCriacao)) < 60;
  const expired   = oferta.status === "expirada";
  const timeAgo   = formatDistance(new Date(oferta.dataCriacao), new Date(), { addSuffix: true, locale: ptBR });
  const cat       = getCat(oferta.categoria);
  const score     = oferta.score ?? 0;

  // Use the most recent of validacao or confirmacao timestamps
  const lastActivityMs = [oferta.ultimaValidacaoEm, oferta.ultimaConfirmacaoEm]
    .filter(Boolean)
    .map((d) => new Date(d!).getTime())
    .sort((a, b) => b - a)[0] ?? null;
  const ultimaConf = lastActivityMs !== null ? differenceInMinutes(new Date(), lastActivityMs) : null;
  const recentlyConfirmed = ultimaConf !== null && ultimaConf < 60;

  const hasSavings    = isMulti && grupo.savings > 0.01;
  const showRefPrice  = hasSavings;
  const referencePrice = hasSavings ? grupo.maxPreco : null;

  const validadeDate = oferta.validade ? new Date(oferta.validade) : null;
  const isExpiringSoon =
    validadeDate && !isPast(validadeDate) &&
    validadeDate.getTime() - Date.now() < 2 * 24 * 60 * 60 * 1000;

  const NIVEL_EMOJI: Record<string, string> = {
    Iniciante: "🌱", Explorador: "🔍", "Caçador": "🎯",
    Especialista: "⭐", Mestre: "🏆", Lenda: "💎",
    Bronze: "🟤", Prata: "⚪", Ouro: "🟡", Diamante: "💎",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.22, delay: index * 0.04 }}
      whileTap={{ scale: 0.985 }}
    >
      <div
        onClick={handleCardClick}
        className={cn(
          "bg-white rounded-2xl shadow-sm border overflow-hidden transition-shadow hover:shadow-md cursor-pointer active:scale-[0.99]",
          oferta.status === "suspeita" && "border-red-200 bg-red-50/20",
          oferta.status === "expirada" && "border-gray-200 opacity-70",
          oferta.patrocinada && "border-amber-300 shadow-amber-100",
          oferta.destacada && !oferta.patrocinada && "border-emerald-200 shadow-emerald-50",
        )}
      >
        {/* Sponsored banner */}
        {oferta.patrocinada && (
          <div className="flex items-center gap-1.5 px-3.5 pt-2.5 pb-0">
            <span className="text-[10px] font-black tracking-wider uppercase text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
              ✦ Patrocinado
            </span>
          </div>
        )}
        {/* Featured banner */}
        {oferta.destacada && !oferta.patrocinada && (
          <div className="flex items-center gap-1.5 px-3.5 pt-2.5 pb-0">
            <span className="text-[10px] font-black tracking-wider uppercase text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
              ⭐ Destaque da Comunidade
            </span>
          </div>
        )}
        <div className="flex gap-3 p-3.5">

          {/* ── Thumbnail ─────────────────────────────────────────────── */}
          <div
            className="shrink-0 rounded-xl overflow-hidden flex items-center justify-center relative"
            style={{ width: 72, height: 72, background: cat.bg }}
          >
            {oferta.fotoUrl ? (
              <img
                src={oferta.fotoUrl}
                alt={oferta.produto}
                className="w-full h-full object-cover"
                onError={(e) => {
                  const el = e.target as HTMLImageElement;
                  el.style.display = "none";
                  (el.parentElement as HTMLDivElement).innerHTML =
                    `<span style="font-size:32px;line-height:1">${cat.emoji}</span>`;
                }}
              />
            ) : (
              <span style={{ fontSize: 32, lineHeight: 1 }}>{cat.emoji}</span>
            )}
            {/* Count badge overlay */}
            {isMulti && (
              <div className="absolute bottom-0 right-0 bg-emerald-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded-tl-lg leading-none">
                {grupo.count}×
              </div>
            )}
          </div>

          {/* ── Info ──────────────────────────────────────────────────── */}
          <div className="flex-1 min-w-0 flex flex-col gap-0.5">

            {/* Badges row */}
            <div className="flex flex-wrap gap-1 mb-0.5">
              <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", s.color)}>
                {s.dot} {s.label}
              </span>
              {isMulti && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  🏪 {grupo.count} mercados
                </span>
              )}
              {/* "Confirmado hoje" — within last 24 h */}
              {grupo.confirmadoHoje && !recentlyConfirmed && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                  ✅ Confirmado hoje
                </span>
              )}
              {/* Confirmation count badge */}
              {oferta.confirmacoes > 0 && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100">
                  👥 {oferta.confirmacoes} {oferta.confirmacoes === 1 ? "confirmação" : "confirmações"}
                </span>
              )}
              {recentlyConfirmed && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600">
                  🔥 Confirmado há {ultimaConf! < 1 ? "< 1" : ultimaConf} min
                </span>
              )}
              {isNew && !recentlyConfirmed && oferta.status === "nova" && !isMulti && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
                  ✨ Novo
                </span>
              )}
              {/* "Mais curtido" — highest curtidas in group and > 2 */}
              {isMulti && grupo.maxCurtidas > 2 && oferta.curtidas === grupo.maxCurtidas && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-pink-50 text-pink-600 border border-pink-200">
                  ❤️ Mais curtido
                </span>
              )}
              {/* Trusted user badge */}
              {(oferta.nivelUsuario === "Especialista" || oferta.nivelUsuario === "Mestre" || oferta.nivelUsuario === "Lenda") && !isMulti && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                  ✓ Confiável
                </span>
              )}
              {score < 0 && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-50 text-orange-600">
                  ⚠️ Baixa confiança
                </span>
              )}
            </div>

            {/* Product name */}
            <h3 className="font-bold text-sm leading-snug line-clamp-1 text-[#0f172a]">
              {oferta.produto}
            </h3>

            {/* Store */}
            <p className="text-[11px] text-slate-500 flex items-center gap-1 leading-none">
              <Store className="h-3 w-3 shrink-0" />
              <span className="truncate font-medium">
                {oferta.mercado}{isMulti ? " e outros" : ""}
              </span>
            </p>

            {/* Distance */}
            {oferta.distancia != null && (
              <p className="text-[11px] font-bold text-emerald-600 flex items-center gap-1 leading-none mt-0.5">
                <MapPin className="h-3 w-3 shrink-0" />
                {oferta.distancia < 1
                  ? `${Math.round(oferta.distancia * 1000)} m de você`
                  : `${oferta.distancia.toFixed(1)} km de você`}
              </p>
            )}

            {/* Price */}
            <div className="flex items-baseline gap-1.5 mt-1">
              {showRefPrice && (
                <span className="text-xs text-slate-400 line-through font-semibold">
                  {R(referencePrice!)}
                </span>
              )}
              <span className={cn(
                "font-black leading-none tracking-tight",
                showRefPrice ? "text-xl text-emerald-600" : "text-2xl text-primary",
              )}>
                {R(oferta.preco)}
                {getCategoryUnit(oferta.categoria) && (
                  <span className="text-[11px] font-bold ml-0.5">{getCategoryUnit(oferta.categoria)}</span>
                )}
              </span>
              {showRefPrice && (
                <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-full">
                  🏆 Melhor preço
                </span>
              )}
            </div>

            {/* Savings text */}
            {hasSavings && (
              <p className="text-[10px] font-semibold text-emerald-700 mt-0.5">
                💰 Economize {R(grupo.savings)} vs. o mais caro
              </p>
            )}

            {/* Expiry warning */}
            {validadeDate && isExpiringSoon && !isPast(validadeDate) && (
              <p className="text-[10px] font-semibold text-orange-600 flex items-center gap-1 mt-0.5">
                <Clock className="h-3 w-3" /> Últimas horas!
              </p>
            )}

            {/* Social strip */}
            <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-1">
              <span className="flex items-center gap-0.5">
                <ThumbsUp className="h-3 w-3" />{oferta.curtidas}
              </span>
              <span className="flex items-center gap-0.5">
                <CheckCircle className="h-3 w-3 text-emerald-500" />{oferta.validacoes}
              </span>
              {oferta.confirmacoes > 0 && (
                <span className="flex items-center gap-0.5 text-indigo-500 font-semibold">
                  👥 {oferta.confirmacoes}
                </span>
              )}
              {!isMulti && (
                <span className="flex items-center gap-0.5 font-medium text-slate-500">
                  {NIVEL_EMOJI[oferta.nivelUsuario ?? "Bronze"]} {oferta.usuario?.split(" ")[0]}
                </span>
              )}
              <span className="flex items-center gap-0.5 ml-auto">
                <Clock className="h-3 w-3" />{timeAgo}
              </span>
            </div>
          </div>
        </div>

        {/* Suspect warning */}
        {oferta.status === "suspeita" && (
          <div className="mx-3.5 mb-2 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Preço denunciado pela comunidade. Confirme antes de ir.
          </div>
        )}

        {/* ── Action buttons ──────────────────────────────────────────── */}
        <div className="flex gap-2 px-3.5 pb-3.5">

          {/* Curtir */}
          <button
            onClick={handleLike}
            disabled={likeMutation.isPending}
            className={cn(
              "flex-1 h-9 rounded-xl border flex items-center justify-center gap-1.5",
              "text-xs font-bold transition-all active:scale-95",
              "bg-gray-50 border-gray-200 text-emerald-600",
              "hover:bg-emerald-50 hover:border-emerald-200",
              likeMutation.isPending && "opacity-50 cursor-not-allowed",
            )}
          >
            <ThumbsUp className="h-3.5 w-3.5" />
            <span>{oferta.curtidas}</span>
            Curtir
          </button>

          {/* Centro: Comparar (multi) ou Confirmar (single) */}
          {isMulti ? (
            <button
              onClick={handleCompare}
              className={cn(
                "flex-[2] h-9 rounded-xl flex items-center justify-center gap-1.5",
                "text-xs font-bold transition-all active:scale-95",
                "bg-emerald-600 text-white hover:bg-emerald-500 shadow-sm shadow-emerald-600/20",
              )}
            >
              <BarChart2 className="h-3.5 w-3.5" />
              Comparar {grupo.count} preços
            </button>
          ) : (
            <button
              onClick={handleValidar}
              disabled={validarMutation.isPending || expired}
              className={cn(
                "flex-[2] h-9 rounded-xl flex items-center justify-center gap-1.5",
                "text-xs font-bold transition-all active:scale-95",
                expired
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200",
                validarMutation.isPending && "opacity-60",
              )}
            >
              <CheckCircle className="h-3.5 w-3.5" />
              Confirmar preço
              <span className={cn(
                "text-[10px] font-black px-1.5 py-0.5 rounded-full",
                expired ? "bg-gray-200 text-gray-500" : "bg-emerald-600/15 text-emerald-700",
              )}>
                {oferta.validacoes}
              </span>
            </button>
          )}

          {/* Salvar / Favorito */}
          {onSave && (
            <button
              onClick={(e) => { e.stopPropagation(); onSave(); }}
              title={isSaved ? "Remover dos favoritos" : "Salvar oferta"}
              className={cn(
                "h-9 rounded-xl flex items-center justify-center px-2.5 shrink-0",
                "text-[11px] font-bold transition-all active:scale-95",
                isSaved
                  ? "bg-pink-50 border border-pink-300 text-pink-500"
                  : "bg-gray-50 border border-gray-200 text-slate-400 hover:bg-pink-50 hover:border-pink-200 hover:text-pink-400",
              )}
            >
              <Heart className={cn("h-3.5 w-3.5", isSaved && "fill-pink-500")} />
            </button>
          )}

          {/* Compartilhar */}
          <button
            onClick={handleShare}
            title="Compartilhar oferta"
            className={cn(
              "h-9 rounded-xl flex items-center justify-center px-2.5 shrink-0",
              "text-[11px] font-bold transition-all active:scale-95",
              "bg-gray-50 border border-gray-200 text-slate-400",
              "hover:bg-blue-50 hover:border-blue-200 hover:text-blue-500",
            )}
          >
            <Share2 className="h-3.5 w-3.5" />
          </button>

          {/* Reportar */}
          <button
            onClick={handleDenunciar}
            disabled={denunciarMutation.isPending}
            title="Reportar preço incorreto"
            className={cn(
              "h-9 rounded-xl flex items-center justify-center gap-1 px-2.5 shrink-0",
              "text-[11px] font-bold transition-all active:scale-95",
              "bg-gray-50 border border-gray-200 text-slate-400",
              "hover:bg-red-50 hover:border-red-200 hover:text-red-500",
              denunciarMutation.isPending && "opacity-50 cursor-not-allowed",
            )}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Reportar</span>
          </button>
        </div>
      </div>
    </motion.div>
  );
}

/* ── Category chips ─────────────────────────────────────────────────────────── */

const CHIP_CATEGORIES = [
  { label: "Todos",      value: "__all__",    emoji: "🛒" },
  { label: "Alimentos",  value: "Alimentos",  emoji: "🍚" },
  { label: "Bebidas",    value: "Bebidas",    emoji: "🧃" },
  { label: "Limpeza",    value: "Limpeza",    emoji: "🧹" },
  { label: "Carnes",     value: "Carnes",     emoji: "🥩" },
  { label: "Higiene",    value: "Higiene",    emoji: "🪥" },
  { label: "Hortifruti", value: "Hortifruti", emoji: "🥦" },
  { label: "Pet",        value: "Pet",        emoji: "🐾" },
  { label: "Promoções",  value: "__promo__",  emoji: "🔥" },
];

/* ── Page ─────────────────────────────────────────────────────────────────── */

const PAGE_SIZE = 12;

export default function Ofertas() {
  const [, setLocation] = useLocation();
  const [search, setSearch]         = useState("");
  const [chip, setChip]             = useState("__all__");
  const [coords, setCoords]         = useState<{ lat: number; lng: number } | null>(() => loadCoords());
  const [isLocating, setIsLocating] = useState(false);
  const [modalOferta, setModalOferta]   = useState<Oferta | null>(null);
  const [compareGrupo, setCompareGrupo] = useState<GrupoOferta | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const queryClient = useQueryClient();
  const { requireLogin } = useLoginPrompt();
  const likeMutation      = useLikeOferta();
  const validarMutation   = useValidarOferta();
  const denunciarMutation = useDenunciarOferta();
  const saveMutation      = useSaveFavorito();
  const removeMutation    = useRemoveFavorito();

  const currentUser = getCurrentUser();

  // Load user's saved offer IDs
  const { data: savedIds } = useListFavoritos(
    { usuarioId: currentUser?.id ?? 0 },
    {
      query: {
        queryKey: getListFavoritosQueryKey({ usuarioId: currentUser?.id ?? 0 }),
        enabled: !!currentUser,
      },
    },
  );
  const savedSet = useMemo(() => new Set(savedIds ?? []), [savedIds]);

  const invalidateFavoritos = () =>
    queryClient.invalidateQueries({ queryKey: getListFavoritosQueryKey({ usuarioId: currentUser?.id ?? 0 }) });

  const isPromo = chip === "__promo__";
  const params = {
    produto:   search || undefined,
    categoria: !chip.startsWith("__") ? chip : undefined,
    lat:       coords?.lat,
    lng:       coords?.lng,
    raio:      coords ? 5 : undefined,
    ordenar:   isPromo ? ("validacoes" as const) : ("score" as const),
  };

  const { data: ofertas, isLoading } = useListOfertas(params, {
    query: { queryKey: getListOfertasQueryKey(params) },
  });

  const grupos = useMemo(() => groupOfertas(ofertas ?? []), [ofertas]);

  // Reset pagination when filters change
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [search, chip, coords]);

  const visibleGrupos = useMemo(() => grupos.slice(0, visibleCount), [grupos, visibleCount]);
  const hasMore = visibleCount < grupos.length;

  // Intersection observer for infinite scroll
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && hasMore) {
        setVisibleCount((c) => c + PAGE_SIZE);
      }
    }, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListOfertasQueryKey() });

  /* ── Modal actions (detail modal) ─────────────────────────────────────── */
  const doModalLike = () => {
    if (!modalOferta) return;
    const user = getCurrentUser();
    if (!user) return;
    likeMutation.mutate({ id: modalOferta.id, data: { usuarioId: user.id } }, {
      onSuccess: invalidate,
      onError: () => toast.error("Não foi possível curtir."),
    });
  };

  const doModalValidar = () => {
    if (!modalOferta) return;
    const user = getCurrentUser();
    if (!user) return;
    validarMutation.mutate({ id: modalOferta.id, data: { usuarioId: user.id } }, {
      onSuccess: () => { invalidate(); toast.success("Validado! +2 pontos para quem publicou."); },
      onError: () => toast.error("Não foi possível validar."),
    });
  };

  const doModalDenunciar = () => {
    if (!modalOferta) return;
    const user = getCurrentUser();
    if (!user) return;
    denunciarMutation.mutate({ id: modalOferta.id, data: { usuarioId: user.id } }, {
      onSuccess: (u) => {
        invalidate();
        u.status === "suspeita"
          ? toast.warning("Oferta marcada como suspeita.")
          : toast.info("Denúncia registrada.");
      },
      onError: () => toast.error("Não foi possível denunciar."),
    });
  };

  const openModal            = (o: Oferta) => setModalOferta(o);
  const handleModalLike      = () => requireLogin(doModalLike);
  const handleModalValidar   = () => requireLogin(doModalValidar);
  const handleModalDenunciar = () => requireLogin(doModalDenunciar);

  /* ── Comparison modal actions ─────────────────────────────────────────── */
  const openComparison   = (g: GrupoOferta) => setCompareGrupo(g);
  const closeComparison  = () => setCompareGrupo(null);

  const handleCompareDetail = (o: Oferta) => {
    setCompareGrupo(null);
    setModalOferta(o);
  };

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

  /* ── Favoritos ─────────────────────────────────────────────────────── */
  const handleSave = (g: GrupoOferta) => {
    requireLogin(() => {
      if (!currentUser) return;
      const ofertaId = g.best.id;
      if (savedSet.has(ofertaId)) {
        removeMutation.mutate(
          { ofertaId, params: { usuarioId: currentUser.id } },
          {
            onSuccess: () => { invalidateFavoritos(); toast.success("Removido dos favoritos."); },
            onError: () => toast.error("Erro ao remover favorito."),
          },
        );
      } else {
        saveMutation.mutate(
          { data: { usuarioId: currentUser.id, ofertaId } },
          {
            onSuccess: () => { invalidateFavoritos(); toast.success("❤️ Salvo nos favoritos!"); },
            onError: () => toast.error("Erro ao salvar favorito."),
          },
        );
      }
    });
  };

  /* ── Geolocation ─────────────────────────────────────────────────────── */
  const handleLocate = () => {
    if (!navigator.geolocation) { toast.error("Navegador sem suporte a geolocalização."); return; }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCoords(c);
        saveCoords(c);
        setIsLocating(false);
        toast.success("📍 Localização ativa! Mostrando ofertas próximas.");
      },
      () => { toast.error("Não foi possível obter localização."); setIsLocating(false); },
      { timeout: 10000 },
    );
  };

  return (
    <div className="flex flex-col min-h-full bg-gray-50">

      {/* ── Sticky search bar ────────────────────────────────────────── */}
      <div className="sticky top-0 z-40 bg-white border-b border-border shadow-sm px-4 pt-3 pb-3">
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar produto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 h-11 rounded-xl border border-border bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition"
            />
          </div>
          <button
            onClick={handleLocate}
            disabled={isLocating}
            className={cn(
              "h-11 w-11 rounded-xl border flex items-center justify-center shrink-0 transition-all active:scale-95",
              coords
                ? "bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/20"
                : "bg-gray-50 border-border text-muted-foreground hover:border-primary/40 hover:text-primary",
            )}
            title={coords ? "Localização ativa" : "Ativar localização"}
          >
            {isLocating
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <MapPin className="h-4 w-4" />
            }
          </button>
        </div>
      </div>

      {/* ── Category chips ───────────────────────────────────────────── */}
      <div className="bg-white border-b border-border px-4 py-2.5">
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
          {CHIP_CATEGORIES.map((c) => {
            const active = chip === c.value;
            return (
              <button
                key={c.value}
                onClick={() => setChip(c.value)}
                className={cn(
                  "flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all shrink-0 border",
                  active
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-white text-muted-foreground border-border hover:border-primary/40 hover:text-primary",
                )}
              >
                <span>{c.emoji}</span>
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Count strip ──────────────────────────────────────────────── */}
      {!isLoading && grupos.length > 0 && (
        <div className="px-4 py-2 flex items-center justify-between">
          <p className="text-xs text-muted-foreground font-medium">
            {grupos.length} {grupos.length === 1 ? "produto encontrado" : "produtos encontrados"}
            {ofertas && ofertas.length > grupos.length
              ? ` · ${ofertas.length} ofertas no total`
              : ""}
            {coords && " · por distância"}
          </p>
          {isPromo && (
            <span className="text-[10px] font-bold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
              🔥 Mais validadas primeiro
            </span>
          )}
        </div>
      )}

      {/* ── Content ──────────────────────────────────────────────────── */}
      <div className="flex-1 px-4 pb-4 space-y-3">
        {isLoading ? (
          <div className="space-y-3 pt-2">
            {[0, 1, 2, 3].map((i) => <SkeletonCard key={i} />)}
          </div>
        ) : !grupos.length ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center text-center py-20 px-6"
          >
            <div className="text-5xl mb-4">🔍</div>
            <h3 className="font-black text-lg text-foreground mb-1">
              Não encontramos essa oferta ainda.
            </h3>
            <p className="text-sm text-muted-foreground mb-6">
              {search
                ? `Nenhum resultado para "${search}". Seja o primeiro a cadastrar!`
                : "Nenhuma oferta por aqui ainda. Seja o primeiro!"}
            </p>
            <Button
              onClick={() => requireLogin(() => setLocation("/publicar"))}
              className="rounded-2xl h-12 px-6 font-bold shadow-md shadow-primary/20 gap-2"
            >
              <PlusCircle className="h-4 w-4" />
              Publicar primeira oferta
            </Button>
          </motion.div>
        ) : (
          <>
            <AnimatePresence mode="popLayout">
              <div className="space-y-3 pt-1">
                {visibleGrupos.map((grupo, idx) => (
                  <GrupoCard
                    key={grupo.key}
                    grupo={grupo}
                    index={idx}
                    onOpenModal={openModal}
                    onCompare={openComparison}
                    isSaved={savedSet.has(grupo.best.id)}
                    onSave={() => handleSave(grupo)}
                  />
                ))}
              </div>
            </AnimatePresence>
            {/* Intersection observer trigger for infinite scroll */}
            <div ref={loadMoreRef} className="h-4" />
            {hasMore && (
              <div className="flex justify-center py-2">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
          </>
        )}
      </div>

      {/* Bottom FAB */}
      {!isLoading && grupos.length > 0 && (
        <div className="sticky bottom-20 sm:bottom-6 px-4 pb-2 pointer-events-none">
          <div className="flex justify-end pointer-events-auto">
            <Link href="/publicar">
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-3 rounded-full shadow-lg shadow-primary/30 text-sm font-bold active:scale-95 transition-all"
              >
                <PlusCircle className="h-4 w-4" />
                Publicar oferta
              </motion.button>
            </Link>
          </div>
        </div>
      )}

      {/* ── Detail modal ─────────────────────────────────────────────── */}
      <OfertaModal
        oferta={modalOferta}
        referencePrice={null}
        onClose={() => setModalOferta(null)}
        onLike={handleModalLike}
        onValidar={handleModalValidar}
        onDenunciar={handleModalDenunciar}
        isLiking={likeMutation.isPending}
        isValidating={validarMutation.isPending}
        isDenouncing={denunciarMutation.isPending}
      />

      {/* ── Comparison modal ─────────────────────────────────────────── */}
      <ComparacaoModal
        grupo={compareGrupo}
        onClose={closeComparison}
        onOpenDetail={handleCompareDetail}
        onValidar={handleCompareValidar}
        onLike={handleCompareLike}
        onDenunciar={handleCompareDenunciar}
        isValidating={validarMutation.isPending}
      />
    </div>
  );
}
