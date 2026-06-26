import { useState, useMemo, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MapPin, Loader2, CheckCircle,
  AlertTriangle, Store, Clock, PlusCircle, BarChart2, Heart, Share2,
  MoreVertical, Pencil, XCircle, Trash2, EyeOff, MessageCircle,
  Eye, Flame, Zap, Users, TrendingUp, ShoppingCart, X as XIcon,
} from "lucide-react";
import { useQueryClient, useInfiniteQuery, useQuery, keepPreviousData } from "@tanstack/react-query";
import { formatDistance, isPast, differenceInMinutes } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import {
  listOfertas,
  useCreateAlerta,
  useLikeOferta,
  useValidarOferta,
  useDenunciarOferta,
  useListFavoritos,
  getListFavoritosQueryKey,
  useSaveFavorito,
  useRemoveFavorito,
  useEncerrarOferta,
  useExcluirOferta,
  useNaoEncontreiOferta,
  useUpdateOferta,
  type Oferta,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { getCurrentUser } from "@/lib/current-user";
import { cn } from "@/lib/utils";
import { useLoginPrompt } from "@/lib/login-prompt";
import { loadCoords, saveCoords } from "@/lib/distance";
import { OfertaModal, CATEGORY_CONFIG, getCategoryUnit } from "@/components/oferta-modal";
import { AindaCompensaBar } from "@/components/offer-card";
import { CommentsBottomSheet } from "@/components/CommentsBottomSheet";
import { OfferCardPremium } from "@/components/OfferCardPremium";
import { ComparacaoModal } from "@/components/comparacao-modal";
import { groupOfertas, type GrupoOferta } from "@/lib/group-ofertas";
import { getProductDisplay } from "@/lib/visual-priority";
import { useSeo } from "@/lib/seo";
import { matchTier } from "@workspace/synonyms";

/* ── helpers ──────────────────────────────────────────────────────────────── */

const R = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

/** Extracts the error message from an API error response. */
function apiErr(err: unknown): string {
  const data = (err as { data?: { error?: string } } | undefined)?.data;
  return data?.error ?? "Erro inesperado. Tente novamente.";
}

type StatusKey = "nova" | "validada" | "suspeita" | "expirada";

const STATUS: Record<StatusKey, { label: string; color: string; dot: string }> = {
  nova:     { label: "Novo",     color: "bg-amber-100 text-amber-700",     dot: "🟡" },
  validada: { label: "Validado", color: "bg-amber-100 text-amber-700", dot: "🟢" },
  suspeita: { label: "Suspeito", color: "bg-red-100 text-red-700",         dot: "🔴" },
  expirada: { label: "Expirado", color: "bg-gray-100 text-gray-500",       dot: "⚫" },
};

/* ── EditOfertaModal ──────────────────────────────────────────────────────── */
function EditOfertaModal({
  oferta,
  onClose,
  onSuccess,
}: {
  oferta: Oferta;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [preco, setPreco] = useState(String(oferta.preco));
  const [produto, setProduto] = useState(oferta.produto);
  const [mercado, setMercado] = useState(oferta.mercado);
  const [categoria, setCategoria] = useState(oferta.categoria);
  const updateMutation = useUpdateOferta();

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const precoNum = parseFloat(preco.replace(",", "."));
    if (isNaN(precoNum) || precoNum <= 0) { toast.error("Preço inválido"); return; }
    updateMutation.mutate(
      { id: oferta.id, data: { preco: precoNum, produto: produto.trim(), mercado: mercado.trim(), categoria } },
      {
        onSuccess: () => { toast.success("Oferta atualizada!"); onSuccess(); onClose(); },
        onError: () => toast.error("Erro ao atualizar. Tente novamente."),
      },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="rounded-2xl shadow-xl w-full max-w-sm mx-4 p-5 space-y-4"
        style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-black text-base text-[#111827]">✏️ Editar oferta</h2>
          <button onClick={onClose} className="text-[#9CA3AF] hover:text-[#374151] p-1 text-lg">✕</button>
        </div>
        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest">Produto</label>
            <input
              value={produto}
              onChange={(e) => setProduto(e.target.value)}
              className="w-full mt-1 rounded-xl px-3 py-2.5 text-sm text-[#111827] bg-[#F9FAFB] border border-[#E5E7EB] focus:outline-none focus:ring-2 focus:ring-[#F2C14E]/50 focus:border-[#F2C14E] placeholder:text-[#D1D5DB]"
              required
            />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest">Preço (R$)</label>
              <input
                value={preco}
                onChange={(e) => setPreco(e.target.value)}
                type="text"
                inputMode="decimal"
                className="w-full mt-1 rounded-xl px-3 py-2.5 text-sm text-[#111827] bg-[#F9FAFB] border border-[#E5E7EB] focus:outline-none focus:ring-2 focus:ring-[#F2C14E]/50 focus:border-[#F2C14E]"
                required
              />
            </div>
            <div className="flex-1">
              <label className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest">Categoria</label>
              <input
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                className="w-full mt-1 rounded-xl px-3 py-2.5 text-sm text-[#111827] bg-[#F9FAFB] border border-[#E5E7EB] focus:outline-none focus:ring-2 focus:ring-[#F2C14E]/50 focus:border-[#F2C14E]"
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest">Mercado</label>
            <input
              value={mercado}
              onChange={(e) => setMercado(e.target.value)}
              className="w-full mt-1 rounded-xl px-3 py-2.5 text-sm text-[#111827] bg-[#F9FAFB] border border-[#E5E7EB] focus:outline-none focus:ring-2 focus:ring-[#F2C14E]/50 focus:border-[#F2C14E]"
              required
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 h-11 rounded-xl border border-[#E5E7EB] text-sm font-bold text-[#6B7280] hover:bg-[#F3F4F6] transition-all">Cancelar</button>
            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="flex-1 h-11 rounded-xl text-sm font-black text-[#111827] transition-all disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, #F2C14E 0%, #E6A817 100%)" }}
            >
              {updateMutation.isPending ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const CAT_DEFAULT = { emoji: "🛒", bg: "#F3F4F6" };
function getCat(cat: string) {
  const c = CATEGORY_CONFIG[cat];
  if (!c) return CAT_DEFAULT;
  return { emoji: c.emoji, bg: "#F3F4F6" };
}

/* ── SkeletonCard — light shimmer ─────────────────────────────────────────── */
function SkeletonCard({ delay = 0 }: { delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay }}
      className="rounded-2xl overflow-hidden border"
      style={{ background: "#FFFFFF", borderColor: "#E5E7EB" }}
    >
      <div className="flex gap-3 p-3.5">
        <div className="shrink-0 w-[88px] h-[88px] rounded-xl skeleton-shimmer" />
        <div className="flex-1 space-y-2 py-1">
          <div className="h-3 w-24 rounded-full skeleton-shimmer" />
          <div className="h-4 w-40 rounded-full skeleton-shimmer" />
          <div className="h-3 w-28 rounded-full skeleton-shimmer" />
          <div className="h-6 w-20 rounded-full skeleton-shimmer mt-1" />
        </div>
      </div>
      <div className="flex gap-2 px-3.5 pb-3.5">
        <div className="h-9 flex-1 rounded-xl skeleton-shimmer" />
        <div className="h-9 w-20 rounded-xl skeleton-shimmer" />
        <div className="h-9 w-9 rounded-xl skeleton-shimmer" />
      </div>
    </motion.div>
  );
}

/* ── DestaquesRegiaoCard — light premium carousel card ────────────────────── */
function DestaquesRegiaoCard({ oferta, onClick }: { oferta: Oferta; onClick: () => void }) {
  const cat = getCat(oferta.categoria);
  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="relative rounded-2xl overflow-hidden cursor-pointer shrink-0"
      style={{
        width: 175,
        background: "#FFFFFF",
        border: "1.5px solid #E5E7EB",
        boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
      }}
    >
      {/* Gold banner */}
      <div
        className="flex items-center gap-1 px-3 py-1.5"
        style={{ background: "linear-gradient(90deg, #F2C14E 0%, #E6A817 100%)" }}
      >
        <span className="text-[10px] font-black tracking-widest uppercase text-[#111827]">⭐ Patrocinado</span>
      </div>
      <div className="p-3 flex flex-col gap-1.5">
        {/* Thumbnail */}
        <div
          className="w-full h-20 rounded-xl overflow-hidden flex items-center justify-center relative"
          style={{ background: "#F3F4F6" }}
        >
          {(oferta.imagemExibicao ?? oferta.fotoUrl) ? (
            <img
              src={(oferta.imagemExibicao ?? oferta.fotoUrl)!}
              alt={oferta.produto}
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover"
              onError={(e) => {
                const el = e.target as HTMLImageElement;
                el.style.display = "none";
                (el.parentElement as HTMLDivElement).innerHTML =
                  `<span style="font-size:34px;line-height:1">${cat.emoji}</span>`;
              }}
            />
          ) : (
            <span style={{ fontSize: 34, lineHeight: 1 }}>{cat.emoji}</span>
          )}
        </div>
        {/* Product */}
        <p className="text-[#111827] font-bold text-[12px] leading-tight line-clamp-2">{oferta.produto}</p>
        <p className="text-[#9CA3AF] text-[10px] flex items-center gap-1">
          <Store className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate">{oferta.mercado}</span>
        </p>
        {/* Price */}
        <p className="font-black text-xl leading-none" style={{ color: "#16A34A" }}>
          {R(oferta.preco)}
        </p>
        {oferta.validacoes > 0 && (
          <p className="text-[9px] font-bold text-[#16A34A]/70 flex items-center gap-0.5">
            <CheckCircle className="h-2.5 w-2.5" />{oferta.validacoes} confirmaram
          </p>
        )}
      </div>
    </motion.div>
  );
}

/* ── GrupoCard — premium dark social feed card ────────────────────────────── */
interface GrupoCardProps {
  grupo: GrupoOferta;
  index: number;
  onOpenModal: (o: Oferta) => void;
  onCompare: (g: GrupoOferta) => void;
  isSaved: boolean;
  onSave: () => void;
}

function GrupoCard({ grupo, index, onOpenModal, onCompare, isSaved, onSave }: GrupoCardProps) {
  const oferta        = grupo.best;
  const isMulti       = grupo.count > 1;
  const queryClient   = useQueryClient();
  const { requireLogin } = useLoginPrompt();
  const currentUser   = getCurrentUser();
  const isOwner       = !!currentUser && oferta.usuarioId === currentUser.id;

  const [showOwnerMenu, setShowOwnerMenu] = useState(false);
  const [commentsOpen, setCommentsOpen]   = useState(false);
  const [editingOferta, setEditingOferta] = useState<Oferta | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["ofertas"] });

  const likeMutation        = useLikeOferta();
  const validarMutation     = useValidarOferta();
  const denunciarMutation   = useDenunciarOferta();
  const encerrarMutation    = useEncerrarOferta();
  const excluirMutation     = useExcluirOferta();
  const naoEncontreiMutation = useNaoEncontreiOferta();

  const isEncerrada      = oferta.status === "encerrada" as string;
  const isPodeTerAcabado = oferta.status === "pode_ter_acabado" as string;

  const doEncerrar = () => {
    if (!confirm("Marcar esta promoção como encerrada?")) return;
    encerrarMutation.mutate({ id: oferta.id }, {
      onSuccess: () => { invalidate(); toast.success("Oferta marcada como encerrada."); setShowOwnerMenu(false); },
      onError: (err) => toast.error(apiErr(err)),
    });
  };

  const doExcluir = () => {
    const ageMs = Date.now() - new Date(oferta.dataCriacao).getTime();
    const withinGrace = ageMs < 10 * 60 * 1000;
    const msg = withinGrace
      ? "Excluir esta oferta permanentemente?"
      : "Após 10 minutos não é possível excluir permanentemente. A oferta será ocultada do feed mas o histórico será mantido. Continuar?";
    if (!confirm(msg)) return;
    excluirMutation.mutate({ id: oferta.id }, {
      onSuccess: (data) => {
        invalidate();
        const d = data as { deleted?: boolean };
        toast.success(d.deleted ? "Oferta excluída." : "Oferta ocultada do feed.");
        setShowOwnerMenu(false);
      },
      onError: (err) => toast.error(apiErr(err)),
    });
  };

  const doNaoEncontrei = () => {
    naoEncontreiMutation.mutate({ id: oferta.id, data: {} }, {
      onSuccess: (data) => {
        invalidate();
        const d = data as { statusUsuario?: string };
        if (d.statusUsuario === "pode_ter_acabado") {
          toast.warning("⚠️ Oferta marcada como possivelmente encerrada pela comunidade.");
        } else {
          toast.info("Obrigado pelo aviso!");
        }
      },
      onError: (err) => toast.error(apiErr(err)),
    });
  };

  const doLike = () => {
    const user = getCurrentUser();
    if (!user) return;
    likeMutation.mutate({ id: oferta.id, data: {} }, {
      onSuccess: invalidate,
      onError: (err) => toast.error(apiErr(err)),
    });
  };

  const doValidar = () => {
    const user = getCurrentUser();
    if (!user) return;
    validarMutation.mutate({ id: oferta.id, data: {} }, {
      onSuccess: () => { invalidate(); toast.success("Validado! +2 pontos para quem publicou."); },
      onError: (err) => toast.error(apiErr(err)),
    });
  };

  const doDenunciar = () => {
    const user = getCurrentUser();
    if (!user) return;
    denunciarMutation.mutate({ id: oferta.id, data: {} }, {
      onSuccess: (u) => {
        invalidate();
        u.status === "suspeita"
          ? toast.warning("Oferta marcada como suspeita.")
          : toast.info("Denúncia registrada.");
      },
      onError: (err) => toast.error(apiErr(err)),
    });
  };

  const handleLike         = (e: React.MouseEvent) => { e.stopPropagation(); requireLogin(doLike); };
  const handleValidar      = (e: React.MouseEvent) => { e.stopPropagation(); requireLogin(doValidar); };
  const handleDenunciar    = (e: React.MouseEvent) => { e.stopPropagation(); requireLogin(doDenunciar); };
  const handleCompare      = (e: React.MouseEvent) => { e.stopPropagation(); onCompare(grupo); };
  const handleEncerrar     = (e: React.MouseEvent) => { e.stopPropagation(); requireLogin(doEncerrar); };
  const handleExcluir      = (e: React.MouseEvent) => { e.stopPropagation(); requireLogin(doExcluir); };
  const handleNaoEncontrei = (e: React.MouseEvent) => { e.stopPropagation(); requireLogin(doNaoEncontrei); };
  const handleOwnerMenu    = (e: React.MouseEvent) => { e.stopPropagation(); setShowOwnerMenu((v) => !v); };
  const handleCardClick    = () => isMulti ? onCompare(grupo) : onOpenModal(oferta);

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const text = `🛒 ${oferta.produto} por ${R(oferta.preco)} em ${oferta.mercado}${oferta.bairro ? ` (${oferta.bairro})` : ""}`;
    const url = window.location.origin;
    try {
      if (navigator.share) {
        await navigator.share({ title: "AíCompensa", text, url });
      } else {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        toast.success("Copiado para a área de transferência!");
      }
    } catch {
      // user cancelled share dialog
    }
  };

  const s         = isEncerrada
    ? { label: "Encerrada", color: "bg-gray-100 text-gray-500", dot: "🔴" }
    : isPodeTerAcabado
      ? { label: "Pode ter acabado", color: "bg-orange-100 text-orange-600", dot: "⚠️" }
      : (STATUS[oferta.status as StatusKey] ?? STATUS.nova);
  const isNew     = differenceInMinutes(new Date(), new Date(oferta.dataCriacao)) < 60;
  const expired   = oferta.status === "expirada";
  const timeAgo   = formatDistance(new Date(oferta.dataCriacao), new Date(), { addSuffix: true, locale: ptBR });
  const cat       = getCat(oferta.categoria);
  const score     = oferta.score ?? 0;

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
    "Estagiário da Economia":    "🎒",
    "Assistente de Ofertas":     "🔎",
    "Bacharel das Compras":      "🎓",
    "Especialista das Gôndolas": "🏪",
    "Mestre das Pechinchas":     "💰",
    "Doutor da Economia":        "🔬",
    "PhD do Supermercado":       "🏆",
  };

  // Social proof — deterministic pseudo-random "vendo agora" per offer
  const viewingNow = useMemo(() => {
    const seed = (oferta.id * 31 + oferta.curtidas * 17 + oferta.validacoes * 7) % 18;
    return seed + (oferta.confirmacoes >= 3 ? 9 : 4);
  }, [oferta.id, oferta.curtidas, oferta.validacoes, oferta.confirmacoes]);

  // Comment count — derived from social engagement as a proxy
  const commentCount = useMemo(() => {
    const eng = oferta.validacoes + oferta.curtidas + oferta.confirmacoes;
    if (eng === 0) return 0;
    const seed = (oferta.id * 13 + oferta.validacoes * 5 + oferta.curtidas * 3) % 14;
    return seed + 2;
  }, [oferta.id, oferta.validacoes, oferta.curtidas, oferta.confirmacoes]);

  // Comment preview teaser — derived from real offer state
  const commentPreview: string | null = recentlyConfirmed
    ? "✅ Confirmado agora — ainda estava nesse valor"
    : (oferta.confirmacoes ?? 0) >= 3
      ? "🔥 Galera confirmou esse preço várias vezes"
      : (oferta.curtidas ?? 0) >= 3
        ? "❤️ Muito curtido pela comunidade"
        : commentCount >= 4
          ? "💬 Veja o que a comunidade está dizendo"
          : null;

  // Card glow type
  const isHot   = oferta.superOferta || (score >= 8 && oferta.confirmacoes >= 3);
  const isTrust = oferta.confiancaLabel === "Alta confiança" && oferta.confirmacoes >= 3;

  const cardBorder = oferta.patrocinada
    ? "#F2C14E"
    : isHot
      ? "#FDE68A"
      : isTrust && !oferta.patrocinada
        ? "#E5E7EB"
        : "#E5E7EB";

  const cardShadow = oferta.patrocinada
    ? "0 4px 20px rgba(242,193,78,0.15), 0 2px 8px rgba(0,0,0,0.06)"
    : isHot
      ? "0 4px 16px rgba(242,193,78,0.1), 0 2px 8px rgba(0,0,0,0.06)"
      : "0 2px 8px rgba(0,0,0,0.06)";

  const cardBg = oferta.patrocinada
    ? "#FFFBEB"
    : isEncerrada
      ? "#F9FAFB"
      : "#FFFFFF";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.22, delay: Math.min(index * 0.04, 0.2) }}
      whileTap={{ scale: 0.985 }}
    >
      {editingOferta && (
        <EditOfertaModal
          oferta={editingOferta}
          onClose={() => setEditingOferta(null)}
          onSuccess={invalidate}
        />
      )}
      <motion.div
        onClick={handleCardClick}
        className={cn(
          "relative rounded-2xl overflow-hidden cursor-pointer",
          isEncerrada && "opacity-65",
        )}
        style={{
          background: cardBg,
          border: `1.5px solid ${cardBorder}`,
          boxShadow: cardShadow,
        }}
        animate={oferta.patrocinada ? {
          boxShadow: [
            "0 0 20px rgba(255,215,0,0.1), 0 4px 20px rgba(0,0,0,0.45)",
            "0 0 38px rgba(255,215,0,0.22), 0 4px 20px rgba(0,0,0,0.45)",
            "0 0 20px rgba(255,215,0,0.1), 0 4px 20px rgba(0,0,0,0.45)",
          ],
        } : isHot ? {
          boxShadow: [
            "0 0 16px rgba(242,193,78,0.08), 0 4px 18px rgba(0,0,0,0.4)",
            "0 0 28px rgba(242,193,78,0.18), 0 4px 18px rgba(0,0,0,0.4)",
            "0 0 16px rgba(242,193,78,0.08), 0 4px 18px rgba(0,0,0,0.4)",
          ],
        } : undefined}
        transition={oferta.patrocinada || isHot ? {
          duration: 2, repeat: Infinity, repeatDelay: 3, ease: "easeInOut",
        } : undefined}
      >
        {/* ── Sponsored: subtle gold top border ──────────────────────────── */}
        {oferta.patrocinada && (
          <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: "linear-gradient(90deg, #F2C14E, #E6A817)" }} />
        )}

        {/* ── Sponsored gold banner ──────────────────────────────────────── */}
        {oferta.patrocinada && (
          <div
            className="flex items-center justify-between px-3 py-1.5"
            style={{ background: "linear-gradient(90deg, #F2C14E 0%, #E6A817 100%)" }}
          >
            <span className="text-[10px] font-black tracking-widest uppercase text-[#111827]">
              ⭐ OFERTA PATROCINADA
            </span>
            <span className="text-[9px] font-black text-[#111827]/60 uppercase tracking-wide">💎 Premium</span>
          </div>
        )}
        {/* ── Featured banner ────────────────────────────────────────────── */}
        {oferta.destacada && !oferta.patrocinada && (
          <div
            className="flex items-center gap-1.5 px-3.5 py-1.5"
            style={{ background: "#FFFBEB", borderBottom: "1px solid #FDE68A" }}
          >
            <span className="text-[10px] font-black tracking-wider uppercase" style={{ color: "#92400E" }}>
              ⭐ Destaque da Comunidade
            </span>
          </div>
        )}

        {/* ── Main content row ───────────────────────────────────────────── */}
        <div className="flex gap-3 p-3">

          {/* ── Thumbnail ───────────────────────────────────────────────── */}
          <div
            className="shrink-0 rounded-xl overflow-hidden flex items-center justify-center relative"
            style={{
              width: oferta.patrocinada ? 88 : 88,
              height: oferta.patrocinada ? 88 : 88,
              background: "#F3F4F6",
              border: "1px solid #E5E7EB",
            }}
          >
            {(oferta.imagemExibicao ?? oferta.fotoUrl) ? (
              <img
                src={(oferta.imagemExibicao ?? oferta.fotoUrl)!}
                alt={oferta.produto}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover"
                onError={(e) => {
                  const el = e.target as HTMLImageElement;
                  el.style.display = "none";
                  (el.parentElement as HTMLDivElement).innerHTML =
                    `<span style="font-size:34px;line-height:1">${cat.emoji}</span>`;
                }}
              />
            ) : (
              <span style={{ fontSize: oferta.patrocinada ? 36 : 30, lineHeight: 1 }}>{cat.emoji}</span>
            )}
            {/* Multi-market count badge */}
            {isMulti && (
              <div
                className="absolute bottom-0 right-0 text-[9px] font-black px-1.5 py-0.5 rounded-tl-lg leading-none text-black"
                style={{ background: "#F2C14E" }}
              >
                {grupo.count}×
              </div>
            )}
            {/* Hot glow overlay */}
            {isHot && (
              <div className="absolute inset-0 pointer-events-none rounded-xl" style={{ boxShadow: "inset 0 0 14px rgba(242,193,78,0.2)" }} />
            )}
          </div>

          {/* ── Info ────────────────────────────────────────────────────── */}
          <div className="flex-1 min-w-0 flex flex-col gap-0.5">

            {/* ── Priority badges ─────────────────────────────────────── */}
            {(() => {
              type Badge = { text: string; bg: string; color: string; glow?: string; animate?: boolean };
              const candidates: Array<Badge | false> = [
                oferta.superOferta && {
                  text: "⚡ SUPER OFERTA",
                  bg: "#F2C14E", color: "#111827",
                  animate: true,
                },
                (score < 0 || oferta.status === "suspeita") && {
                  text: "⚠️ Suspeita",
                  bg: "#FEF2F2", color: "#DC2626",
                },
                isEncerrada && {
                  text: "🔴 Encerrada",
                  bg: "#F1F5F9", color: "#64748B",
                },
                isPodeTerAcabado && {
                  text: "⚠️ Pode ter acabado",
                  bg: "#FFF7ED", color: "#C2410C",
                },
                recentlyConfirmed && {
                  text: `🔥 há ${ultimaConf! < 1 ? "<1" : ultimaConf} min`,
                  bg: "#FEF3C7", color: "#92400E",
                  animate: true,
                },
                (oferta.confiancaLabel === "Alta confiança" && (oferta.confirmacoes ?? 0) >= 3) && {
                  text: "🛡️ Alta confiança",
                  bg: "#DCFCE7", color: "#15803D",
                },
                isMulti && {
                  text: `🏪 ${grupo.count} mercados`,
                  bg: "#EDE9FE", color: "#6D28D9",
                },
                (grupo.totalConfirmacoes >= 2) && {
                  text: `👥 ${grupo.totalConfirmacoes} confirmadas`,
                  bg: "#DCFCE7", color: "#15803D",
                },
                oferta.validityLabel === "Possivelmente expirada" && {
                  text: "⏳ Possivelmente expirada",
                  bg: "#FEF3C7", color: "#92400E",
                },
                !isEncerrada && !isPodeTerAcabado && {
                  text: `${s.dot} ${s.label}`,
                  bg: "#F3F4F6", color: "#6B7280",
                },
                isNew && !recentlyConfirmed && !isMulti && {
                  text: "✨ Novo",
                  bg: "#EFF6FF", color: "#1D4ED8",
                },
                oferta.confiancaLabel === "Confiável" && !isMulti && {
                  text: "✓ Confiável",
                  bg: "#DCFCE7", color: "#15803D",
                },
              ];

              const top2 = candidates.filter((b): b is Badge => !!b).slice(0, 2);
              if (!top2.length) return null;
              return (
                <div className="flex gap-1 mb-0.5 flex-wrap">
                  {top2.map((b, i) =>
                    b.animate ? (
                      <motion.span
                        key={i}
                        initial={{ scale: 0.9 }}
                        animate={{ scale: [1, 1.04, 1] }}
                        transition={{ duration: 1.8, repeat: Infinity, repeatType: "reverse" }}
                        className="text-[10px] font-black px-2 py-0.5 rounded-full"
                        style={{
                          background: b.bg,
                          color: b.color,
                          boxShadow: b.glow ? `0 0 8px ${b.glow}` : undefined,
                        }}
                      >
                        {b.text}
                      </motion.span>
                    ) : (
                      <span
                        key={i}
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{
                          background: b.bg,
                          color: b.color,
                          boxShadow: b.glow ? `0 0 6px ${b.glow}` : undefined,
                        }}
                      >
                        {b.text}
                      </span>
                    )
                  )}
                </div>
              );
            })()}

            {/* Product name */}
            {(() => {
              const { primary, secondary } = getProductDisplay(oferta.produto, oferta.marca, oferta.categoria);
              return (
                <>
                  <p className="font-bold text-sm leading-snug line-clamp-1 text-[#111827]">{primary}</p>
                  {secondary && <p className="text-[11px] leading-tight line-clamp-1" style={{ color: "#9CA3AF" }}>{secondary}</p>}
                </>
              );
            })()}

            {/* Store + tipo badge */}
            <p className="text-[11px] flex items-center gap-1 leading-none flex-wrap mt-0.5" style={{ color: "#9CA3AF" }}>
              <Store className="h-3 w-3 shrink-0" />
              <span className="truncate font-medium">
                {oferta.mercado}{isMulti ? " e outros" : ""}
              </span>
              {oferta.tipoOrigem === "presencial" && (
                <span
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                  style={{ background: "#FEF3C7", color: "#92400E" }}
                >📸 Presencial</span>
              )}
              {oferta.tipoOrigem === "encarte" && (
                <span
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                  style={{ background: "#EDE9FE", color: "#6D28D9" }}
                >📰 Encarte</span>
              )}
            </p>

            {/* Distance */}
            {oferta.distancia != null && (
              <p className="text-[11px] font-bold flex items-center gap-1 leading-none mt-0.5" style={{ color: "#F2C14E" }}>
                <MapPin className="h-3 w-3 shrink-0" />
                {oferta.distancia < 1
                  ? `${Math.round(oferta.distancia * 1000)} m de você`
                  : `${oferta.distancia.toFixed(1)} km de você`}
              </p>
            )}

            {/* ── Price hero ─────────────────────────────────────────── */}
            <div className="flex items-baseline gap-1.5 mt-1.5">
              {showRefPrice && (
                <span className="text-xs line-through font-semibold" style={{ color: "#D1D5DB" }}>
                  {R(referencePrice!)}
                </span>
              )}
              <span
                className="font-black leading-none tracking-tight"
                style={{
                  fontSize: oferta.patrocinada ? "28px" : showRefPrice ? "22px" : "24px",
                  color: "#16A34A",
                }}
              >
                {R(oferta.preco)}
                {getCategoryUnit(oferta.categoria) && (
                  <span style={{ fontSize: "11px", fontWeight: 700, marginLeft: "2px" }}>{getCategoryUnit(oferta.categoria)}</span>
                )}
              </span>
              {showRefPrice && (
                <span
                  className="text-[10px] font-black px-1.5 py-0.5 rounded-full"
                  style={{ background: "#DCFCE7", color: "#15803D" }}
                >
                  🏆 Melhor preço
                </span>
              )}
              {hasSavings && (
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: "#DCFCE7", color: "#15803D" }}
                >
                  -{R(grupo.savings)}
                </span>
              )}
            </div>

            {/* Expiry warning */}
            {validadeDate && isExpiringSoon && !isPast(validadeDate) && (
              <p className="text-[10px] font-bold flex items-center gap-1 mt-0.5" style={{ color: "#fb923c" }}>
                <Clock className="h-3 w-3" /> Últimas horas!
              </p>
            )}

            {/* ── Activity / social proof strip ──────────────────────── */}
            <div className="flex items-center gap-2.5 mt-1.5 flex-wrap">
              {/* Viewing now */}
              <span className="flex items-center gap-0.5 text-[10px] font-semibold" style={{ color: "#D1D5DB" }}>
                <Eye className="h-2.5 w-2.5" />{viewingNow}
              </span>
              {/* Curtidas */}
              <span className="flex items-center gap-0.5 text-[10px] font-semibold" style={{ color: "#D1D5DB" }}>
                <Heart className="h-2.5 w-2.5" />{oferta.curtidas}
              </span>
              {/* Validações */}
              <span className="flex items-center gap-0.5 text-[10px] font-semibold" style={{ color: oferta.validacoes > 0 ? "#16A34A" : "#D1D5DB" }}>
                <CheckCircle className="h-2.5 w-2.5" />{oferta.validacoes}
              </span>
              {/* Confirmações */}
              {grupo.totalConfirmacoes > 0 && (
                <span className="flex items-center gap-0.5 text-[10px] font-bold" style={{ color: "#6B7280" }}>
                  <Users className="h-2.5 w-2.5" />{grupo.totalConfirmacoes}
                </span>
              )}
              {/* Author */}
              {!isMulti && (
                <span className="flex items-center gap-0.5 text-[10px] font-medium ml-auto" style={{ color: "#9CA3AF" }}>
                  {NIVEL_EMOJI[oferta.nivelUsuario ?? "Bronze"] ?? "🏅"} {oferta.usuario?.split(" ")[0]}
                </span>
              )}
              <span className="flex items-center gap-0.5 text-[10px]" style={{ color: "#9CA3AF", marginLeft: !isMulti ? undefined : "auto" }}>
                <Clock className="h-2.5 w-2.5" />{timeAgo}
              </span>
            </div>
          </div>
        </div>

        {/* ── Suspect warning ─────────────────────────────────────────────── */}
        {oferta.status === "suspeita" && (
          <div className="mx-3 mb-2 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold"
            style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#DC2626" }}>
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Preço denunciado pela comunidade. Confirme antes de ir.
          </div>
        )}

        {/* ── Community confirmation proof bar ────────────────────────────── */}
        {oferta.confirmacoes >= 3 && oferta.status !== "suspeita" && oferta.status !== "expirada" && (
          <div
            className="mx-3 mb-2 flex items-center gap-2 rounded-xl px-3 py-2"
            style={{ background: "#DCFCE7", border: "1px solid #BBF7D0" }}
          >
            <motion.div
              animate={{ scale: [1, 1.15, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <CheckCircle className="h-3.5 w-3.5 shrink-0" style={{ color: "#16A34A" }} />
            </motion.div>
            <span className="text-xs font-bold" style={{ color: "#15803D" }}>
              {oferta.confirmacoes} {oferta.confirmacoes === 1 ? "pessoa confirmou" : "pessoas confirmaram"} este preço
            </span>
            {oferta.confiancaLabel === "Alta confiança" && (
              <span className="ml-auto text-[10px] font-black whitespace-nowrap shrink-0" style={{ color: "#15803D" }}>✓ Confiável</span>
            )}
          </div>
        )}

        {/* ── "Pode ter acabado" warning ───────────────────────────────────── */}
        {isPodeTerAcabado && (
          <div className="mx-3 mb-2 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold"
            style={{ background: "#FFF7ED", border: "1px solid #FED7AA", color: "#C2410C" }}>
            <EyeOff className="h-3.5 w-3.5 shrink-0" />
            ⚠️ Vários usuários não encontraram mais esta promoção
          </div>
        )}

        {/* ── Encerrada banner ─────────────────────────────────────────────── */}
        {isEncerrada && (
          <div className="mx-3 mb-2 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold"
            style={{ background: "#F1F5F9", border: "1px solid #E2E8F0", color: "#64748B" }}>
            <XCircle className="h-3.5 w-3.5 shrink-0" />
            Promoção encerrada pelo publicador
          </div>
        )}

        {/* ── Action buttons ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-1.5 px-3 pb-3">

          {/* ❤ Curtir */}
          <button
            onClick={handleLike}
            disabled={likeMutation.isPending}
            className="flex items-center gap-1.5 h-10 px-3 rounded-xl text-xs font-bold transition-all active:scale-95 shrink-0"
            style={{ background: "#F3F4F6", border: "1px solid #E5E7EB", color: "#6B7280" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#FFF7ED"; e.currentTarget.style.color = "#C2410C"; e.currentTarget.style.borderColor = "#FED7AA"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "#F3F4F6"; e.currentTarget.style.color = "#6B7280"; e.currentTarget.style.borderColor = "#E5E7EB"; }}
          >
            <Heart className="h-3.5 w-3.5" />
            <span>{oferta.curtidas}</span>
          </button>

          {/* ✔ Confirmar / 📊 Comparar — main CTA */}
          {isMulti ? (
            <button
              onClick={handleCompare}
              className="flex-1 h-10 rounded-xl flex items-center justify-center gap-1.5 text-xs font-black transition-all active:scale-95 text-black"
              style={{
                background: "linear-gradient(135deg, #F2C14E, #D4A017)",
                boxShadow: "0 0 16px rgba(242,193,78,0.3), 0 2px 8px rgba(0,0,0,0.3)",
              }}
            >
              <BarChart2 className="h-3.5 w-3.5" />
              Comparar {grupo.count} preços
            </button>
          ) : (
            <button
              onClick={handleValidar}
              disabled={validarMutation.isPending || expired}
              className={cn(
                "flex-1 h-10 rounded-xl flex items-center justify-center gap-1.5 text-xs font-bold transition-all active:scale-95",
                validarMutation.isPending && "opacity-60",
              )}
              style={expired ? {
                background: "#F3F4F6",
                border: "1px solid #E5E7EB",
                color: "#D1D5DB",
                cursor: "not-allowed",
              } : {
                background: "linear-gradient(135deg, #F2C14E 0%, #E6A817 100%)",
                color: "#111827",
                boxShadow: "0 3px 10px rgba(242,193,78,0.35)",
              }}
            >
              <CheckCircle className="h-3.5 w-3.5" />
              Confirmar
              {oferta.validacoes > 0 && (
                <span
                  className="text-[10px] font-black px-1.5 py-0.5 rounded-full"
                  style={expired ? { background: "#E5E7EB", color: "#9CA3AF" } : { background: "rgba(255,255,255,0.35)", color: "#111827" }}
                >
                  {oferta.validacoes}
                </span>
              )}
            </button>
          )}

          {/* 💬 Comentários — with badge count */}
          <button
            onClick={(e) => { e.stopPropagation(); setCommentsOpen(true); }}
            title="Comentários"
            className="relative h-10 w-10 shrink-0 flex items-center justify-center rounded-xl transition-all active:scale-95"
            style={{ background: "#F3F4F6", border: "1px solid #E5E7EB", color: "#6B7280" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#EDE9FE"; e.currentTarget.style.color = "#6D28D9"; e.currentTarget.style.borderColor = "#DDD6FE"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "#F3F4F6"; e.currentTarget.style.color = "#6B7280"; e.currentTarget.style.borderColor = "#E5E7EB"; }}
          >
            <MessageCircle className="h-3.5 w-3.5" />
            {commentCount > 0 && (
              <span
                className="absolute -top-1.5 -right-1.5 text-[8px] font-black rounded-full flex items-center justify-center leading-none text-white pointer-events-none"
                style={{ background: "#6D28D9", minWidth: "15px", height: "15px", padding: "0 3px" }}
              >
                {commentCount > 9 ? "9+" : commentCount}
              </span>
            )}
          </button>

          {/* ↗ Compartilhar */}
          <button
            onClick={handleShare}
            title="Compartilhar"
            className="h-10 w-10 shrink-0 flex items-center justify-center rounded-xl transition-all active:scale-95"
            style={{ background: "#F3F4F6", border: "1px solid #E5E7EB", color: "#6B7280" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#EFF6FF"; e.currentTarget.style.color = "#1D4ED8"; e.currentTarget.style.borderColor = "#BFDBFE"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "#F3F4F6"; e.currentTarget.style.color = "#6B7280"; e.currentTarget.style.borderColor = "#E5E7EB"; }}
          >
            <Share2 className="h-3.5 w-3.5" />
          </button>

          {/* ⋯ Mais — overflow menu */}
          <div className="relative shrink-0">
            <button
              onClick={handleOwnerMenu}
              title="Mais opções"
              className="h-10 w-10 flex items-center justify-center rounded-xl transition-all active:scale-95"
              style={{ background: "#F3F4F6", border: "1px solid #E5E7EB", color: "#9CA3AF" }}
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </button>

            {showOwnerMenu && (
              <div
                className="absolute right-0 bottom-12 z-30 rounded-2xl shadow-lg py-1.5 min-w-[185px]"
                style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", boxShadow: "0 8px 24px rgba(0,0,0,0.12)" }}
                onClick={(e) => e.stopPropagation()}
              >
                {onSave && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onSave(); setShowOwnerMenu(false); }}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold transition-colors"
                    style={{ color: isSaved ? "#BE185D" : "#374151" }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "#F9FAFB"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                  >
                    <Heart className={cn("h-4 w-4", isSaved && "fill-pink-600")} />
                    {isSaved ? "Remover favorito" : "Salvar oferta"}
                  </button>
                )}
                {!isOwner && !isMulti && !isEncerrada && (
                  <button
                    onClick={(e) => { e.stopPropagation(); requireLogin(doNaoEncontrei); setShowOwnerMenu(false); }}
                    disabled={naoEncontreiMutation.isPending}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50"
                    style={{ color: isPodeTerAcabado ? "#C2410C" : "#374151" }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "#FFF7ED"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                  >
                    <EyeOff className="h-4 w-4" />
                    Não encontrei mais
                  </button>
                )}
                {!isOwner && (
                  <button
                    onClick={(e) => { e.stopPropagation(); requireLogin(doDenunciar); setShowOwnerMenu(false); }}
                    disabled={denunciarMutation.isPending}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50"
                    style={{ color: "#374151" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "#FEF2F2"; e.currentTarget.style.color = "#DC2626"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#374151"; }}
                  >
                    <AlertTriangle className="h-4 w-4" />
                    Reportar preço
                  </button>
                )}
                {isOwner && (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowOwnerMenu(false); setEditingOferta(oferta); }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold transition-colors"
                      style={{ color: "#374151" }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "#F9FAFB"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                    >
                      <Pencil className="h-4 w-4 text-[#9CA3AF]" />
                      Editar oferta
                    </button>
                    {!isEncerrada && (
                      <button
                        onClick={handleEncerrar}
                        disabled={encerrarMutation.isPending}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50"
                        style={{ color: "#C2410C" }}
                        onMouseEnter={(e) => e.currentTarget.style.background = "#FFF7ED"}
                        onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                      >
                        <XCircle className="h-4 w-4" />
                        Promoção acabou
                      </button>
                    )}
                    <button
                      onClick={handleExcluir}
                      disabled={excluirMutation.isPending}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50"
                      style={{ color: "#DC2626" }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "#FEF2F2"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                    >
                      <Trash2 className="h-4 w-4" />
                      Excluir
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Comment preview teaser ──────────────────────────────────────── */}
        {commentPreview && (
          <div
            className="flex items-center gap-1.5 px-3 pb-2 cursor-pointer"
            onClick={(e) => { e.stopPropagation(); setCommentsOpen(true); }}
          >
            <MessageCircle className="h-2.5 w-2.5 shrink-0" style={{ color: "#6D28D9" }} />
            <span className="text-[10px] truncate flex-1" style={{ color: "#9CA3AF" }}>
              {commentPreview}
            </span>
            <span
              className="text-[8px] font-black px-1.5 py-0.5 rounded-full shrink-0"
              style={{ background: "#EDE9FE", color: "#6D28D9" }}
            >
              🔥 ativo
            </span>
          </div>
        )}

        {/* ── Ainda compensa? ─────────────────────────────────────────────── */}
        <AindaCompensaBar oferta={oferta} onInvalidate={invalidate} />

        <CommentsBottomSheet
          ofertaId={oferta.id}
          ofertaNome={oferta.produto}
          open={commentsOpen}
          onClose={() => setCommentsOpen(false)}
        />
      </motion.div>
    </motion.div>
  );
}

/* ── Raio options ────────────────────────────────────────────────────────────── */

const RAIO_OPTIONS = [1, 3, 5, 10, 25] as const;
type RaioValue = (typeof RAIO_OPTIONS)[number];
const INITIAL_VISIBLE_COUNT = 10;

/* ── Sort chips — Row 1 ──────────────────────────────────────────────────────── */

const SORT_CHIPS = [
  { label: "Todos",     value: "__all__",      emoji: "🛒" },
  { label: "Recente",   value: "__recente__",  emoji: "🆕" },
  { label: "Bombando",  value: "__trending__", emoji: "🔥" },
  { label: "Promoções", value: "__promo__",    emoji: "📊" },
];

/* ── Category chips — Row 2 ──────────────────────────────────────────────────── */

const CAT_CHIPS = [
  { label: "Todas",      value: "__cat_all__", emoji: "🛒" },
  { label: "Açougue",    value: "Carnes",      emoji: "🥩" },
  { label: "Hortifruti", value: "Hortifruti",  emoji: "🥬" },
  { label: "Limpeza",    value: "Limpeza",     emoji: "🧴" },
  { label: "Bebidas",    value: "Bebidas",     emoji: "🍺" },
  { label: "Padaria",    value: "Padaria",     emoji: "🍞" },
  { label: "Laticínios", value: "Laticínios",  emoji: "🥛" },
  { label: "Mercearia",  value: "Alimentos",   emoji: "🍚" },
  { label: "Higiene",    value: "Higiene",     emoji: "🪥" },
  { label: "Bebê",       value: "Bebê",        emoji: "👶" },
  { label: "Pet",        value: "Pet",         emoji: "🐶" },
  { label: "Congelados", value: "Congelados",  emoji: "❄️" },
  { label: "Outros",     value: "Outros",      emoji: "📦" },
];

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default function Ofertas() {
  useSeo({
    title: "Ofertas",
    description: "Compare preços de supermercado em tempo real. Veja ofertas confirmadas pela comunidade, filtre por categoria e encontre o melhor preço perto de você.",
    url: "https://aicompensa.com.br/ofertas",
  });
  const [, setLocation] = useLocation();
  const [search, setSearch]         = useState("");
  const [chip, setChip]             = useState("__all__");
  const [catFilter, setCatFilter]   = useState("__cat_all__");
  const [raio, setRaio]             = useState<RaioValue>(5);
  const [coords, setCoords]         = useState<{ lat: number; lng: number } | null>(() => loadCoords());
  const [isLocating, setIsLocating] = useState(false);
  const [modalOferta, setModalOferta]   = useState<Oferta | null>(null);
  const [compareGrupo, setCompareGrupo] = useState<GrupoOferta | null>(null);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT);
  const [filtrandoLista, setFiltrandoLista] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // ── Scroll position preservation ──────────────────────────────────────────
  const SCROLL_KEY = "ofertas_scroll_y";
  useEffect(() => {
    const saved = sessionStorage.getItem(SCROLL_KEY);
    if (!saved) return;
    sessionStorage.removeItem(SCROLL_KEY);
    const y = parseInt(saved, 10);
    if (isNaN(y) || y <= 0) return;
    const id = requestAnimationFrame(() => window.scrollTo({ top: y, behavior: "instant" as ScrollBehavior }));
    return () => cancelAnimationFrame(id);
  }, []);
  useEffect(() => () => {
    if (window.scrollY > 0) sessionStorage.setItem(SCROLL_KEY, String(window.scrollY));
  }, []);

  const queryClient = useQueryClient();
  const { requireLogin } = useLoginPrompt();
  const likeMutation      = useLikeOferta();
  const validarMutation   = useValidarOferta();
  const denunciarMutation = useDenunciarOferta();
  const saveMutation      = useSaveFavorito();
  const removeMutation    = useRemoveFavorito();

  const currentUser = getCurrentUser();

  const { data: savedIds } = useListFavoritos({
    query: {
      queryKey: getListFavoritosQueryKey(),
      enabled: !!currentUser,
    },
  });
  const savedSet = useMemo(() => new Set(savedIds ?? []), [savedIds]);

  const invalidateFavoritos = () =>
    queryClient.invalidateQueries({ queryKey: getListFavoritosQueryKey() });

  const createAlertaMutation = useCreateAlerta();
  const handleAddAlerta = () => {
    requireLogin(() => {
      createAlertaMutation.mutate(
        { data: { produto: search, precoAlvo: 0 } },
        {
          onSuccess: () =>
            toast.success(`🔔 Alerta criado! Avisaremos quando "${search}" for publicado.`),
          onError: () =>
            toast.error("Não foi possível criar o alerta. Tente novamente."),
        },
      );
    });
  };

  const { data: popularData } = useQuery({
    queryKey: ["produtos-populares"],
    queryFn: () =>
      fetch("/api/produtos/populares").then(
        (r) => r.json() as Promise<{ termos: string[] }>,
      ),
    staleTime: 10 * 60_000,
    gcTime: 15 * 60_000,
  });
  const popularTermos = popularData?.termos ?? [];

  const isPromo     = chip === "__promo__";
  const isTrending  = chip === "__trending__";
  const isRecente   = chip === "__recente__";

  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const ordenar: "preco" | "distancia" | "validacoes" | "recente" | "score" | "trending" =
    isTrending ? "trending" : isRecente ? "recente" : isPromo ? "validacoes" : "score";

  const viewSignature = useMemo(
    () =>
      JSON.stringify({
        search: debouncedSearch,
        catFilter,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        raio: coords ? raio : null,
        ordenar,
      }),
    [debouncedSearch, catFilter, coords?.lat, coords?.lng, raio, ordenar],
  );

  const queryParams = useMemo(() => ({
    produto:   debouncedSearch || undefined,
    categoria: catFilter !== "__cat_all__" ? catFilter : undefined,
    lat:       coords?.lat,
    lng:       coords?.lng,
    raio:      coords ? raio : undefined,
    ordenar,
  }), [debouncedSearch, catFilter, coords, raio, ordenar]);

  const {
    data,
    isLoading,
    isError,
    isFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["ofertas", queryParams],
    queryFn: ({ pageParam }) =>
      listOfertas({ ...queryParams, cursor: (pageParam as string | null) ?? undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor : null),
    staleTime: 30_000,
    // Keeps previous data visible while a new query (different filters) is loading,
    // avoiding the full-skeleton flash on every filter/category change.
    placeholderData: keepPreviousData,
    // Poll every 15s while any catalog image is still being generated; stop when all done.
    refetchInterval: (query) => {
      const pages = (query.state.data as { pages?: Array<{ items?: unknown[] }> } | undefined)?.pages ?? [];
      const hasGenerating = pages.some((p) =>
        (p.items ?? []).some((o) => {
          const s = (o as { produtoCatalogo?: { statusImagem?: string } }).produtoCatalogo?.statusImagem;
          return s === "pendente" || s === "gerando";
        }),
      );
      return hasGenerating ? 15_000 : false;
    },
  });

  const ofertas      = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data]);
  const grupos       = useMemo(() => groupOfertas(ofertas), [ofertas]);
  const patrocinadas = useMemo(() => ofertas.filter((o) => o.patrocinada).slice(0, 3), [ofertas]);

  const listaItens = useMemo<string[]>(() => {
    try {
      const raw = localStorage.getItem("comparador_lista_compras");
      if (!raw) return [];
      const parsed = JSON.parse(raw) as { nome?: string }[];
      return Array.isArray(parsed) ? parsed.map((i) => i.nome ?? "").filter(Boolean) : [];
    } catch { return []; }
  }, []);

  const gruposComLista = useMemo(
    () => listaItens.length === 0
      ? []
      : grupos.filter(
          (g) => !!g.best && listaItens.some((item) => matchTier(g.best!.produto, item) > 0),
        ),
    [grupos, listaItens],
  );

  const visibleGrupos = useMemo(
    () => filtrandoLista ? gruposComLista : grupos.slice(0, visibleCount),
    [grupos, visibleCount, filtrandoLista, gruposComLista],
  );

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_COUNT);
    setFiltrandoLista(false);
  }, [viewSignature]);

  useEffect(() => {
    if (visibleCount >= grupos.length) return;

    const bumpVisibleCount = () => {
      setVisibleCount((current) =>
        Math.min(current + INITIAL_VISIBLE_COUNT, grupos.length),
      );
    };

    const win = window as Window & {
      requestIdleCallback?: (
        callback: IdleRequestCallback,
        options?: { timeout: number }
      ) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    if (win.requestIdleCallback) {
      const id = win.requestIdleCallback(bumpVisibleCount, { timeout: 800 });
      return () => win.cancelIdleCallback?.(id);
    }

    const id = window.setTimeout(bumpVisibleCount, 250);
    return () => window.clearTimeout(id);
  }, [viewSignature, visibleCount, grupos.length]);

  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;

        if (visibleCount < grupos.length) {
          setVisibleCount((current) =>
            Math.min(current + INITIAL_VISIBLE_COUNT, grupos.length),
          );
          return;
        }

        if (hasNextPage && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { threshold: 0.1 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [
    viewSignature,
    visibleCount,
    grupos.length,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  ]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["ofertas"] });

  const doModalLike = () => {
    if (!modalOferta) return;
    const user = getCurrentUser();
    if (!user) return;
    likeMutation.mutate({ id: modalOferta.id, data: {} }, {
      onSuccess: invalidate,
      onError: (err) => toast.error(apiErr(err)),
    });
  };

  const doModalValidar = () => {
    if (!modalOferta) return;
    const user = getCurrentUser();
    if (!user) return;
    validarMutation.mutate({ id: modalOferta.id, data: {} }, {
      onSuccess: () => { invalidate(); toast.success("Validado! +2 pontos para quem publicou."); },
      onError: (err) => toast.error(apiErr(err)),
    });
  };

  const doModalDenunciar = () => {
    if (!modalOferta) return;
    const user = getCurrentUser();
    if (!user) return;
    denunciarMutation.mutate({ id: modalOferta.id, data: {} }, {
      onSuccess: (u) => {
        invalidate();
        u.status === "suspeita"
          ? toast.warning("Oferta marcada como suspeita.")
          : toast.info("Denúncia registrada.");
      },
      onError: (err) => toast.error(apiErr(err)),
    });
  };

  const openModal            = (o: Oferta) => setModalOferta(o);
  const handleModalLike      = () => requireLogin(doModalLike);
  const handleModalValidar   = () => requireLogin(doModalValidar);
  const handleModalDenunciar = () => requireLogin(doModalDenunciar);

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
      validarMutation.mutate({ id: o.id, data: {} }, {
        onSuccess: () => { invalidate(); toast.success("Validado! +2 pontos para quem publicou."); },
        onError: (err) => toast.error(apiErr(err)),
      });
    });
  };

  const handleCompareLike = (o: Oferta) => {
    requireLogin(() => {
      likeMutation.mutate({ id: o.id, data: {} }, {
        onSuccess: invalidate,
        onError: (err) => toast.error(apiErr(err)),
      });
    });
  };

  const handleCompareDenunciar = (o: Oferta) => {
    requireLogin(() => {
      denunciarMutation.mutate({ id: o.id, data: {} }, {
        onSuccess: (u) => {
          invalidate();
          u.status === "suspeita"
            ? toast.warning("Oferta marcada como suspeita.")
            : toast.info("Denúncia registrada.");
        },
        onError: (err) => toast.error(apiErr(err)),
      });
    });
  };

  const handleSave = (g: GrupoOferta) => {
    requireLogin(() => {
      if (!currentUser) return;
      if (!g.best) return;
      const ofertaId = g.best.id;
      if (savedSet.has(ofertaId)) {
        removeMutation.mutate(
          { ofertaId },
          {
            onSuccess: () => { invalidateFavoritos(); toast.success("Removido dos favoritos."); },
            onError: (err) => toast.error(apiErr(err)),
          },
        );
      } else {
        saveMutation.mutate(
          { data: { ofertaId } },
          {
            onSuccess: () => { invalidateFavoritos(); toast.success("❤️ Salvo nos favoritos!"); },
            onError: (err) => toast.error(apiErr(err)),
          },
        );
      }
    });
  };

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
    <div className="flex flex-col min-h-full bg-background">

      {/* ── Search + filters header (light) ─────────────────────────────── */}
      <PageHeader
        theme="light"
        showSearch
        searchValue={search}
        onSearchChange={setSearch}
        searchRight={
          <button
            onClick={handleLocate}
            disabled={isLocating}
            className="flex items-center justify-center rounded-xl transition-all active:scale-95"
            style={{
              minHeight: "44px", minWidth: "44px",
              background: coords ? "#FFFBEB" : "#F3F4F6",
              border: coords ? "1.5px solid #F2C14E" : "1px solid #E5E7EB",
              color: coords ? "#92610A" : "#6B7280",
            }}
            title={coords ? "Localização ativa" : "Ativar localização"}
          >
            {isLocating ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
          </button>
        }
      >
        {/* ── Sort chips ────────────────────────────────────────────────── */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar px-4 pb-2">
          {SORT_CHIPS.map((c) => {
            const active = chip === c.value;
            const isBombando = c.value === "__trending__";
            const isNovo = c.value === "__recente__";
            return (
              <button
                key={c.value}
                onClick={() => setChip(c.value)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-black whitespace-nowrap transition-all shrink-0"
                style={active && isBombando ? {
                  background: "linear-gradient(135deg, #ea580c, #c2410c)",
                  color: "#fff",
                  boxShadow: "0 0 14px rgba(234,88,12,0.4)",
                } : active && isNovo ? {
                  background: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
                  color: "#fff",
                  boxShadow: "0 0 14px rgba(59,130,246,0.4)",
                } : active ? {
                  background: "linear-gradient(135deg, #F2C14E, #D4A017)",
                  color: "#000",
                  boxShadow: "0 0 14px rgba(242,193,78,0.35)",
                } : isBombando ? {
                  background: "#FFF7ED",
                  border: "1px solid #FED7AA",
                  color: "#C2410C",
                } : isNovo ? {
                  background: "#EFF6FF",
                  border: "1px solid #BFDBFE",
                  color: "#1D4ED8",
                } : {
                  background: "#F3F4F6",
                  border: "1px solid #E5E7EB",
                  color: "#6B7280",
                }}
              >
                <span>{c.emoji}</span>
                {c.label}
              </button>
            );
          })}
        </div>

        {/* ── Category chips ──────────────────────────────────────────────── */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar px-4 pb-2">
          {CAT_CHIPS.map((c) => {
            const active = catFilter === c.value;
            return (
              <button
                key={c.value}
                onClick={() => setCatFilter(c.value)}
                className="flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-bold whitespace-nowrap transition-all shrink-0"
                style={active ? {
                  background: "linear-gradient(135deg, #F2C14E, #E6A817)",
                  color: "#111827",
                  boxShadow: "0 2px 8px rgba(242,193,78,0.35)",
                } : {
                  background: "#F3F4F6",
                  border: "1px solid #E5E7EB",
                  color: "#6B7280",
                }}
              >
                <span className="text-sm leading-none">{c.emoji}</span>
                {c.label}
              </button>
            );
          })}
        </div>

        {/* ── Raio chips — only when location active ─────────────────────── */}
        {coords && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar px-4 pb-2">
            <span className="text-[10px] font-bold self-center whitespace-nowrap shrink-0" style={{ color: "#9CA3AF" }}>
              📍 Raio:
            </span>
            {RAIO_OPTIONS.map((r) => {
              const active = raio === r;
              return (
                <button
                  key={r}
                  onClick={() => setRaio(r)}
                  className="flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap transition-all shrink-0"
                  style={active ? {
                    background: "rgba(242,193,78,0.2)",
                    border: "1px solid rgba(242,193,78,0.4)",
                    color: "#F2C14E",
                    boxShadow: "0 0 8px rgba(242,193,78,0.2)",
                  } : {
                    background: "#F3F4F6",
                    border: "1px solid #E5E7EB",
                    color: "#6B7280",
                  }}
                >
                  {r} km
                </button>
              );
            })}
          </div>
        )}
      </PageHeader>

      {/* ── Count strip ─────────────────────────────────────────────────── */}
      {!isLoading && grupos.length > 0 && (
        <div className="px-4 pt-2 pb-1 flex items-center justify-between gap-2 flex-wrap">
          <p className="text-[11px] font-medium" style={{ color: "#9CA3AF" }}>
            <TrendingUp className="h-3 w-3 inline mr-1 mb-0.5" />
            {grupos.length} {grupos.length === 1 ? "produto" : "produtos"}
            {ofertas.length > grupos.length ? ` · ${ofertas.length} ofertas` : ""}
            {coords && " · por distância"}
            {hasNextPage && " · carregando…"}
          </p>
          <div className="flex items-center gap-1.5 shrink-0">
            {catFilter !== "__cat_all__" && (() => {
              const cat = CAT_CHIPS.find((c) => c.value === catFilter);
              return cat ? (
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
                  style={{ background: "#FEF3C7", color: "#92400E", border: "1px solid #FDE68A" }}
                >
                  {cat.emoji} {cat.label}
                  <button
                    onClick={() => setCatFilter("__cat_all__")}
                    className="ml-0.5 opacity-70 hover:opacity-100"
                    aria-label="Limpar categoria"
                  >✕</button>
                </span>
              ) : null;
            })()}
            {isPromo && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
                style={{ background: "rgba(234,88,12,0.15)", color: "#fb923c" }}>
                <Flame className="h-2.5 w-2.5" /> Mais validadas
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Live activity ticker ─────────────────────────────────────────── */}
      {!isLoading && grupos.length > 0 && (() => {
        const acts: string[] = [];
        grupos
          .filter((g) => (g.best.confirmacoes ?? 0) >= 2)
          .slice(0, 2)
          .forEach((g) => acts.push(`✅ ${g.best.confirmacoes} confirmaram "${g.best.produto.split(" ")[0]}"`));
        const recentCount = grupos.filter((g) =>
          differenceInMinutes(new Date(), new Date(g.best.dataCriacao)) < 120
        ).length;
        if (recentCount > 0) acts.push(`🆕 ${recentCount} nova${recentCount > 1 ? "s" : ""} recentemente`);
        if (grupos.some((g) => g.best.superOferta)) acts.push("⚡ Super oferta disponível");
        if (acts.length === 0) return null;
        return (
          <div className="flex items-center gap-3 px-4 pb-2 overflow-x-auto no-scrollbar">
            <motion.div
              className="flex items-center gap-0.5 shrink-0"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "#16A34A" }} />
              <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: "#16A34A" }}>ao vivo</span>
            </motion.div>
            {acts.map((a, i) => (
              <span key={i} className="text-[10px] whitespace-nowrap shrink-0 font-medium" style={{ color: "#9CA3AF" }}>
                {a}
              </span>
            ))}
          </div>
        );
      })()}

      {/* ── Feed content ─────────────────────────────────────────────────── */}
      <div className="flex-1 px-3 pb-4 space-y-2.5">
        {isLoading ? (
          <div className="space-y-2.5 pt-2">
            {debouncedSearch && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-2 px-1 pb-1"
              >
                <motion.span
                  animate={{ rotate: [0, 20, -20, 0] }}
                  transition={{ repeat: Infinity, duration: 1.4, ease: "easeInOut" }}
                  className="text-lg"
                >🔍</motion.span>
                <span className="text-sm font-medium" style={{ color: "#9CA3AF" }}>
                  Buscando melhores ofertas de{" "}
                  <strong className="text-[#111827]">"{debouncedSearch}"</strong>…
                </span>
              </motion.div>
            )}
            {[0, 1, 2, 3].map((i) => <SkeletonCard key={i} delay={i * 0.07} />)}
          </div>
        ) : isError ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center text-center py-20 px-6"
          >
            <div className="text-5xl mb-4">📡</div>
            <h3 className="font-black text-lg text-[#111827] mb-1">Erro de conexão</h3>
            <p className="text-sm mb-6" style={{ color: "#9CA3AF" }}>
              Não conseguimos carregar as ofertas. Verifique sua conexão e tente novamente.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="rounded-2xl h-11 px-6 font-bold text-sm text-black"
              style={{ background: "#F2C14E", boxShadow: "0 0 16px rgba(242,193,78,0.3)" }}
            >
              Tentar novamente
            </button>
          </motion.div>
        ) : !grupos.length && isFetching && debouncedSearch ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center py-20 gap-3"
          >
            <motion.span
              animate={{ rotate: [0, 20, -20, 0] }}
              transition={{ repeat: Infinity, duration: 1.4, ease: "easeInOut" }}
              className="text-5xl"
            >🔍</motion.span>
            <p className="text-sm font-semibold" style={{ color: "#9CA3AF" }}>
              Buscando melhores ofertas…
            </p>
          </motion.div>
        ) : !grupos.length ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28 }}
            className="flex flex-col items-center pt-8 pb-6 px-2"
          >
            {debouncedSearch ? (
              <div className="w-full max-w-sm">
                <div
                  className="rounded-3xl p-6 text-center border"
                  style={{ background: "#FFFFFF", borderColor: "#E5E7EB", boxShadow: "0 4px 16px rgba(0,0,0,0.06)" }}
                >
                  <div
                    className="mx-auto mb-4 w-20 h-20 rounded-[22px] flex items-center justify-center"
                    style={{ background: "#F3F4F6", border: "2px dashed #D1D5DB" }}
                  >
                    <span className="text-4xl">🔍</span>
                  </div>
                  <h3 className="font-black text-xl text-[#111827] mb-1">
                    Produto não encontrado
                  </h3>
                  <p className="text-sm leading-relaxed mb-6" style={{ color: "#9CA3AF" }}>
                    Não encontramos ofertas de{" "}
                    <strong className="text-[#111827]">"{search}"</strong>{" "}
                    perto de você.
                  </p>
                  <button
                    onClick={() => requireLogin(() => setLocation("/publicar"))}
                    className="w-full rounded-2xl px-4 py-3.5 mb-3 text-left flex items-start gap-3 active:scale-[0.98] transition-all text-black"
                    style={{
                      background: "linear-gradient(135deg, #F2C14E, #D4A017)",
                      boxShadow: "0 0 20px rgba(242,193,78,0.3), 0 4px 12px rgba(0,0,0,0.3)",
                    }}
                  >
                    <span className="text-xl mt-0.5">📝</span>
                    <div className="min-w-0">
                      <p className="font-black text-sm leading-tight">Publicar oferta</p>
                      <p className="text-xs opacity-70 mt-0.5 leading-snug">
                        Encontrou esse produto? Compartilhe e ganhe{" "}
                        <strong className="opacity-100">+10 pts</strong>
                      </p>
                    </div>
                  </button>
                  <button
                    onClick={handleAddAlerta}
                    disabled={createAlertaMutation.isPending}
                    className="w-full rounded-2xl px-4 py-3.5 text-left flex items-start gap-3 active:scale-[0.98] transition-all disabled:opacity-60"
                    style={{
                      background: "#F3F4F6",
                      border: "1px solid #E5E7EB",
                    }}
                  >
                    <span className="text-xl mt-0.5">
                      {createAlertaMutation.isPending ? "⏳" : "🛒"}
                    </span>
                    <div className="min-w-0">
                      <p className="font-black text-sm text-[#111827] leading-tight">
                        Adicionar na lista
                      </p>
                      <p className="text-xs mt-0.5 leading-snug" style={{ color: "#9CA3AF" }}>
                        Receba alerta quando alguém publicar essa oferta
                      </p>
                    </div>
                  </button>
                </div>
                {popularTermos.length > 0 && (
                  <div className="mt-6">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-center mb-3" style={{ color: "#9CA3AF" }}>
                      Você quis dizer?
                    </p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {popularTermos
                        .filter((t) => t.toLowerCase() !== search.toLowerCase())
                        .slice(0, 6)
                        .map((t) => (
                          <button
                            key={t}
                            onClick={() => setSearch(t)}
                            className="px-3.5 py-1.5 rounded-full text-xs font-bold transition-all"
                            style={{
                              background: "#F3F4F6",
                              border: "1px solid #E5E7EB",
                              color: "#6B7280",
                            }}
                          >
                            {t}
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            ) : catFilter !== "__cat_all__" ? (
              <>
                <div className="text-5xl mb-4">
                  {CAT_CHIPS.find((c) => c.value === catFilter)?.emoji ?? "🔍"}
                </div>
                <h3 className="font-black text-lg text-[#111827] mb-1">
                  Nenhuma oferta nessa categoria
                </h3>
                <p className="text-sm mb-6 text-center" style={{ color: "#9CA3AF" }}>
                  Não há ofertas de{" "}
                  <strong className="text-[#111827]">{CAT_CHIPS.find((c) => c.value === catFilter)?.label}</strong>{" "}
                  no momento.
                </p>
                <div className="flex flex-col gap-2 w-full max-w-xs">
                  <button
                    onClick={() => setCatFilter("__cat_all__")}
                    className="rounded-2xl h-11 px-6 font-bold text-sm transition-all"
                    style={{ background: "#F3F4F6", border: "1px solid #E5E7EB", color: "#6B7280" }}
                  >
                    🛒 Ver todas as categorias
                  </button>
                  <button
                    onClick={() => requireLogin(() => setLocation("/publicar"))}
                    className="rounded-2xl h-11 px-6 font-bold text-sm text-black transition-all"
                    style={{ background: "#F2C14E", boxShadow: "0 0 16px rgba(242,193,78,0.3)" }}
                  >
                    <PlusCircle className="h-4 w-4 inline mr-2 mb-0.5" />
                    Publicar oferta
                  </button>
                </div>
              </>
            ) : coords ? (
              <>
                <div className="text-5xl mb-4">📍</div>
                <h3 className="font-black text-lg text-[#111827] mb-1 text-center">
                  Sem ofertas na sua região
                </h3>
                <p className="text-sm mb-6 text-center" style={{ color: "#9CA3AF" }}>
                  Nenhuma oferta em {raio} km. Aumente o raio ou desative a localização.
                </p>
                <div className="flex flex-col gap-2 w-full max-w-xs">
                  <button
                    onClick={() => { setCoords(null); saveCoords(null); }}
                    className="rounded-2xl h-11 px-6 font-bold text-sm transition-all"
                    style={{ background: "#F3F4F6", border: "1px solid #E5E7EB", color: "#6B7280" }}
                  >
                    <MapPin className="h-4 w-4 inline mr-2 mb-0.5" />
                    Ver todas as ofertas
                  </button>
                  <button
                    onClick={() => requireLogin(() => setLocation("/publicar"))}
                    className="rounded-2xl h-11 px-6 font-bold text-sm text-black transition-all"
                    style={{ background: "#F2C14E", boxShadow: "0 0 16px rgba(242,193,78,0.3)" }}
                  >
                    <PlusCircle className="h-4 w-4 inline mr-2 mb-0.5" />
                    Publicar oferta na minha região
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="text-5xl mb-4">🔍</div>
                <h3 className="font-black text-lg text-[#111827] mb-1">
                  Nenhuma oferta por aqui ainda
                </h3>
                <p className="text-sm mb-6 text-center" style={{ color: "#9CA3AF" }}>
                  Seja o primeiro a publicar uma oferta e ajude a comunidade!
                </p>
                <button
                  onClick={() => requireLogin(() => setLocation("/publicar"))}
                  className="rounded-2xl h-12 px-6 font-bold text-sm text-black transition-all flex items-center gap-2"
                  style={{ background: "#F2C14E", boxShadow: "0 0 20px rgba(242,193,78,0.35)" }}
                >
                  <PlusCircle className="h-4 w-4" />
                  Publicar primeira oferta
                </button>
              </>
            )}
          </motion.div>
        ) : (
          <>
            {/* ── ⭐ Destaques patrocinados — horizontal carousel ──── */}
            {patrocinadas.length > 0 && (
              <div className="mb-3">
                <div className="flex items-center gap-2 mb-2.5 px-0.5">
                  <motion.div
                    animate={{ opacity: [0.7, 1, 0.7] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <Zap className="h-3.5 w-3.5" style={{ color: "#F2C14E" }} />
                  </motion.div>
                  <p className="text-[11px] font-black tracking-widest uppercase" style={{ color: "#92400E" }}>
                    Destaques da região
                  </p>
                </div>
                <div
                  className="flex gap-3 overflow-x-auto pb-2 -mx-3 px-3"
                  style={{ scrollSnapType: "x mandatory" }}
                >
                  {patrocinadas.map((o) => (
                    <div key={o.id} style={{ scrollSnapAlign: "start" }}>
                      <DestaquesRegiaoCard oferta={o} onClick={() => openModal(o)} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Feed divider ──────────────────────────────────────── */}
            {patrocinadas.length > 0 && (
              <div className="flex items-center gap-2 mb-1 px-0.5">
                <div className="flex-1 h-px" style={{ background: "#E5E7EB" }} />
                <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: "#9CA3AF" }}>
                  feed da comunidade
                </span>
                <div className="flex-1 h-px" style={{ background: "#E5E7EB" }} />
              </div>
            )}

            {/* ── Lista match alert ─────────────────────────────────── */}
            {gruposComLista.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22 }}
                className="rounded-2xl overflow-hidden mb-1"
                style={{
                  background: filtrandoLista
                    ? "linear-gradient(135deg, rgba(34,197,94,0.22) 0%, rgba(16,185,129,0.14) 100%)"
                    : "linear-gradient(135deg, rgba(34,197,94,0.14) 0%, rgba(16,185,129,0.08) 100%)",
                  border: `1.5px solid ${filtrandoLista ? "rgba(74,222,128,0.45)" : "rgba(74,222,128,0.28)"}`,
                  boxShadow: filtrandoLista ? "0 0 20px rgba(34,197,94,0.15)" : undefined,
                }}
              >
                <div className="flex items-center gap-3 px-3.5 py-2.5">
                  <div
                    className="shrink-0 flex items-center justify-center rounded-xl"
                    style={{ width: 34, height: 34, background: "rgba(34,197,94,0.18)" }}
                  >
                    <ShoppingCart size={16} style={{ color: "#4ade80" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-black leading-tight" style={{ color: "#4ade80" }}>
                      {filtrandoLista
                        ? `Mostrando ${gruposComLista.length} oferta${gruposComLista.length !== 1 ? "s" : ""} da sua lista`
                        : `Encontramos ${gruposComLista.length} oferta${gruposComLista.length !== 1 ? "s" : ""} da sua lista`}
                    </p>
                    {!filtrandoLista && (
                      <p className="text-[10px] mt-0.5" style={{ color: "rgba(74,222,128,0.65)" }}>
                        Toque para ver apenas essas ofertas
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => setFiltrandoLista((v) => !v)}
                      className="rounded-xl px-3 py-1.5 text-[11px] font-black transition-all"
                      style={{
                        background: filtrandoLista ? "rgba(34,197,94,0.25)" : "rgba(34,197,94,0.9)",
                        color: filtrandoLista ? "#4ade80" : "#052e16",
                        border: filtrandoLista ? "1px solid rgba(74,222,128,0.5)" : "none",
                      }}
                    >
                      {filtrandoLista ? "Ver todas" : "Ver lista"}
                    </button>
                    {filtrandoLista && (
                      <button
                        onClick={() => setFiltrandoLista(false)}
                        className="rounded-xl p-1.5 transition-all"
                        style={{ background: "#E5E7EB" }}
                      >
                        <XIcon size={12} style={{ color: "#6B7280" }} />
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            <AnimatePresence mode="popLayout">
              <div
                className="space-y-2.5"
                style={{ transition: "opacity 0.25s ease", opacity: isFetching && !isLoading ? 0.55 : 1 }}
              >
                {visibleGrupos.filter((grupo) => grupo?.best).map((grupo, idx) => (
                  <div key={grupo.key} className="feed-item">
                    <OfferCardPremium
                      grupo={grupo}
                      index={idx}
                      onOpenModal={openModal}
                      onCompare={openComparison}
                      isSaved={!!grupo.best && savedSet.has(grupo.best.id)}
                      onSave={() => handleSave(grupo)}
                      listaItemNome={listaItens.length > 0 && grupo.best
                        ? (listaItens.find((item) => matchTier(grupo.best!.produto, item) > 0) ?? undefined)
                        : undefined}
                    />
                  </div>
                ))}
              </div>
            </AnimatePresence>

            <div ref={loadMoreRef} className="h-4" />
            {isFetchingNextPage && (
              <div className="flex justify-center py-3">
                <Loader2 className="h-5 w-5 animate-spin" style={{ color: "rgba(242,193,78,0.5)" }} />
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Floating publish button ──────────────────────────────────────── */}
      {!isLoading && grupos.length > 0 && (
        <div className="sticky bottom-20 sm:bottom-6 mt-14 px-4 pb-2 pointer-events-none">
          <div className="flex justify-end pointer-events-auto">
            <Link href="/publicar">
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="flex items-center gap-2 px-5 py-3 rounded-full text-sm font-black text-black active:scale-95 transition-all"
                style={{
                  background: "linear-gradient(135deg, #F2C14E, #D4A017)",
                  boxShadow: "0 0 24px rgba(242,193,78,0.45), 0 4px 16px rgba(0,0,0,0.4)",
                }}
              >
                <PlusCircle className="h-4 w-4" />
                Publicar oferta
              </motion.button>
            </Link>
          </div>
        </div>
      )}

      {/* ── Detail modal ─────────────────────────────────────────────────── */}
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

      {/* ── Comparison modal ─────────────────────────────────────────────── */}
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
