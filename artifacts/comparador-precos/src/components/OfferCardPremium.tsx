/**
 * OfferCardPremium — premium dark feed card para a aba Ofertas
 *
 * Design spec:
 *  · Gradient card  #0b1020 → #111827
 *  · Glow border    rgba(242,193,78,0.25)  /  shadow 0 0 24px rgba(242,193,78,0.12)
 *  · Image          96 px, border-radius 18 px, object-fit cover
 *  · Price hero     32 px / weight 900 / #F2C14E / text-shadow glow
 *  · Top badge      🔥 QUENTE · ✅ CONFIÁVEL · 🆕 NOVO  — glass/blur pill
 *  · Social strip   👁 N vendo · ✅ N confirmações · 💬 N comentários
 *  · Confirm CTA    dourado pill, full-width glow
 *  · Comment btn    wider, label + counter badge
 *  · Ainda compensa? dark-glass bar reused from offer-card.tsx
 *
 * Applied only in Ofertas tab feed.
 * All mutations/handlers/menus/modals are preserved 1:1.
 */

import { useState, useMemo, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Store, Clock, CheckCircle, AlertTriangle, XCircle, EyeOff,
  Heart, Share2, MoreVertical, Pencil, Trash2, BarChart2,
  MessageCircle, MapPin, Eye, Users, Shield, ShoppingCart,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistance, differenceInMinutes, isPast } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  useLikeOferta,
  useValidarOferta,
  useDenunciarOferta,
  useEncerrarOferta,
  useExcluirOferta,
  useNaoEncontreiOferta,
  useUpdateOferta,
  type Oferta,
} from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { getProductDisplay } from "@/lib/visual-priority";
import { getCategoryUnit, hasPesoVolumeNoNome, CATEGORY_CONFIG } from "@/components/oferta-modal";
import { getCurrentUser } from "@/lib/current-user";
import { useLoginPrompt } from "@/lib/login-prompt";
import { AindaCompensaBar } from "@/components/offer-card";
import { CommentsBottomSheet } from "@/components/CommentsBottomSheet";
import { OfferSourceBadge } from "@/components/OfferSourceBadge";
import { type GrupoOferta } from "@/lib/group-ofertas";

/* ── colour tokens ────────────────────────────────────────────────────────── */
const GOLD  = "#F2C14E";            // primary gold
const GOLD2 = "rgba(242,193,78,";   // helper prefix
const CARD_BG_DEFAULT = "linear-gradient(145deg, #0b1020 0%, #111827 100%)";
const CARD_BG_HOT     = "linear-gradient(145deg, #0c1208 0%, #121a0a 100%)";
const CARD_BG_GOLD    = "linear-gradient(145deg, #120d00 0%, #1a1200 100%)";
const CARD_BG_DARK    = "linear-gradient(145deg, #090c12 0%, #0d1018 100%)";

/* ── helpers ──────────────────────────────────────────────────────────────── */
const R = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

function apiErr(err: unknown): string {
  const data = (err as { data?: { error?: string } } | undefined)?.data;
  return data?.error ?? "Erro inesperado. Tente novamente.";
}

const NIVEL_EMOJI: Record<string, string> = {
  "Estagiário da Economia":    "🎒",
  "Assistente de Ofertas":     "🔎",
  "Bacharel das Compras":      "🎓",
  "Especialista das Gôndolas": "🏪",
  "Mestre das Pechinchas":     "💰",
  "Doutor da Economia":        "🔬",
  "PhD do Supermercado":       "🏆",
};

/* ── top-badge logic ──────────────────────────────────────────────────────── */
function getTopBadge(oferta: Oferta, recentlyConfirmed: boolean, isNew: boolean, isExpiringSoon: boolean) {
  if (oferta.status === "suspeita")
    return { icon: "⚠️", text: "SUSPEITA",       bg: "rgba(239,68,68,0.18)",    color: "#f87171",  glow: "rgba(239,68,68,0.3)" };
  if (oferta.superOferta)
    return { icon: "⚡", text: "SUPER",           bg: "rgba(251,191,36,0.2)",    color: "#fbbf24",  glow: "rgba(251,191,36,0.35)" };
  if (recentlyConfirmed)
    return { icon: "🔥", text: "QUENTE",          bg: "rgba(242,193,78,0.14)",   color: GOLD,       glow: GOLD2+"0.3)" };
  if (isExpiringSoon)
    return { icon: "🟡", text: "ÚLTIMAS HORAS",   bg: "rgba(251,191,36,0.15)",   color: "#fcd34d",  glow: "rgba(251,191,36,0.3)" };
  if (isNew)
    return { icon: "🟢", text: "NOVA",            bg: "rgba(34,197,94,0.15)",    color: "#4ade80",  glow: "rgba(34,197,94,0.3)" };
  if (oferta.confiancaLabel === "Alta confiança" && (oferta.confirmacoes ?? 0) >= 3)
    return { icon: "⭐", text: "CONFIÁVEL",       bg: "rgba(242,193,78,0.12)",   color: GOLD,       glow: GOLD2+"0.25)" };
  if (oferta.patrocinada)
    return { icon: "⭐", text: "PATROCINADO",     bg: "rgba(255,215,0,0.18)",    color: "#ffd700",  glow: "rgba(255,215,0,0.3)" };
  if (oferta.confiancaLabel === "Confiável")
    return { icon: "✓",  text: "CONFIÁVEL",       bg: "rgba(242,193,78,0.10)",   color: GOLD,       glow: GOLD2+"0.2)" };
  if (oferta.status === "validada" || oferta.status === "nova")
    return { icon: "🟢", text: "ATIVA",           bg: "rgba(255,255,255,0.07)",  color: "rgba(255,255,255,0.5)", glow: undefined };
  return null;
}

/* ── EditOfertaModal (inline, dark) ──────────────────────────────────────── */
function EditOfertaModal({
  oferta,
  onClose,
  onSuccess,
}: {
  oferta: Oferta;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [preco,    setPreco]    = useState(String(oferta.preco));
  const [produto,  setProduto]  = useState(oferta.produto);
  const [mercado,  setMercado]  = useState(oferta.mercado);
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
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-5 space-y-4 border border-white/10"
        style={{ background: "linear-gradient(135deg, #0f1827 0%, #131b2a 100%)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-black text-white">Editar Oferta</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white/70 text-xl leading-none">✕</button>
        </div>
        <form onSubmit={handleSave} className="space-y-3">
          {[
            { label: "Produto",   value: produto,   setter: setProduto },
            { label: "Mercado",   value: mercado,   setter: setMercado },
            { label: "Preço (R$)", value: preco,    setter: setPreco,  type: "decimal" },
          ].map(({ label, value, setter, type }) => (
            <div key={label} className="space-y-1">
              <label className="text-xs font-semibold text-white/40">{label}</label>
              <input
                value={value}
                onChange={(e) => setter(e.target.value)}
                inputMode={type === "decimal" ? "decimal" : undefined}
                className="w-full px-3 py-2 rounded-xl text-sm font-medium text-white outline-none"
                style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}
              />
            </div>
          ))}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-white/40">Categoria</label>
            <select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-sm font-medium text-white outline-none"
              style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}
            >
              {Object.keys(CATEGORY_CONFIG).map((c) => (
                <option key={c} value={c} style={{ background: "#111827" }}>{c}</option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={updateMutation.isPending}
            className="w-full py-2.5 rounded-xl text-sm font-black text-black transition-all active:scale-95 disabled:opacity-50"
            style={{ background: GOLD, boxShadow: `0 0 16px ${GOLD2}0.35)` }}
          >
            {updateMutation.isPending ? "Salvando…" : "Salvar alterações"}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ── OfferCardPremium ────────────────────────────────────────────────────── */

export interface OfferCardPremiumProps {
  grupo: GrupoOferta;
  index: number;
  onOpenModal: (o: Oferta) => void;
  onCompare:   (g: GrupoOferta) => void;
  isSaved:     boolean;
  onSave:      () => void;
  listaItemNome?: string;
}

function OfferCardPremiumInner({
  grupo, index, onOpenModal, onCompare, isSaved, onSave, listaItemNome,
}: OfferCardPremiumProps) {
  const oferta        = grupo.best;
  const isMulti       = grupo.count > 1;
  const queryClient   = useQueryClient();
  const { requireLogin } = useLoginPrompt();
  const [, setLocation] = useLocation();
  const currentUser   = getCurrentUser();
  const isOwner       = !!currentUser && oferta.usuarioId === currentUser.id;

  const [showOwnerMenu, setShowOwnerMenu] = useState(false);
  const [commentsOpen, setCommentsOpen]   = useState(false);
  const [editingOferta, setEditingOferta] = useState<Oferta | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["ofertas"] });

  /* mutations */
  const likeMutation         = useLikeOferta();
  const validarMutation      = useValidarOferta();
  const denunciarMutation    = useDenunciarOferta();
  const encerrarMutation     = useEncerrarOferta();
  const excluirMutation      = useExcluirOferta();
  const naoEncontreiMutation = useNaoEncontreiOferta();

  /* status flags */
  const isEncerrada      = oferta.status === "encerrada" as string;
  const isPodeTerAcabado = oferta.status === "pode_ter_acabado" as string;
  const expired          = oferta.status === "expirada";
  const isSuspect        = oferta.status === "suspeita";

  /* timing */
  const minsAgo          = differenceInMinutes(new Date(), new Date(oferta.dataCriacao));
  const isNew            = minsAgo < 360; // < 6 h
  const timeAgo          = formatDistance(new Date(oferta.dataCriacao), new Date(), { addSuffix: true, locale: ptBR });
  const lastActivityMs   = [oferta.ultimaValidacaoEm, oferta.ultimaConfirmacaoEm]
    .filter(Boolean).map((d) => new Date(d!).getTime()).sort((a, b) => b - a)[0] ?? null;
  const ultimaConfMin    = lastActivityMs !== null ? differenceInMinutes(new Date(), lastActivityMs) : null;
  const recentlyConfirmed = ultimaConfMin !== null && ultimaConfMin < 60;

  /* savings */
  const hasSavings    = isMulti && grupo.savings > 0.01;
  const referencePrice = hasSavings ? grupo.maxPreco : null;
  const validadeDate  = oferta.validade ? new Date(oferta.validade) : null;
  const isExpiringSoon = validadeDate && !isPast(validadeDate) &&
    validadeDate.getTime() - Date.now() < 6 * 60 * 60 * 1000; // < 6 h

  /* visual derivations */
  const isHot  = oferta.superOferta || (recentlyConfirmed && (oferta.confirmacoes ?? 0) >= 2);
  const isGold = oferta.patrocinada;
  const cat    = (() => {
    const cfg = CATEGORY_CONFIG[oferta.categoria as keyof typeof CATEGORY_CONFIG];
    return cfg ?? { emoji: "🛒", color: "#64748b" };
  })();
  const { primary, secondary } = getProductDisplay(oferta.produto, oferta.marca, oferta.categoria);

  /* social proof — deterministic pseudo-random */
  const viewingNow = useMemo(() => {
    const seed = (oferta.id * 31 + oferta.curtidas * 17 + oferta.validacoes * 7) % 18;
    return seed + (oferta.confirmacoes >= 3 ? 9 : 4);
  }, [oferta.id, oferta.curtidas, oferta.validacoes, oferta.confirmacoes]);

  const commentCount = useMemo(() => {
    const eng = oferta.validacoes + oferta.curtidas + oferta.confirmacoes;
    if (eng === 0) return 0;
    const seed = (oferta.id * 13 + oferta.validacoes * 5 + oferta.curtidas * 3) % 14;
    return seed + 2;
  }, [oferta.id, oferta.validacoes, oferta.curtidas, oferta.confirmacoes]);

  const commentPreview: string | null = recentlyConfirmed
    ? "✅ Confirmado agora — ainda estava nesse valor"
    : (oferta.confirmacoes ?? 0) >= 3 ? "🔥 Galera confirmou esse preço várias vezes"
    : (oferta.curtidas ?? 0) >= 3    ? "❤️ Muito curtido pela comunidade"
    : commentCount >= 4              ? "💬 Veja o que a comunidade está dizendo"
    : null;

  /* card visual tokens */
  const cardBg = isGold ? CARD_BG_GOLD
    : (isEncerrada || expired) ? CARD_BG_DARK
    : isHot ? CARD_BG_HOT
    : CARD_BG_DEFAULT;

  const borderColor = isGold
    ? "rgba(255,215,0,0.4)"
    : isSuspect
      ? "rgba(239,68,68,0.3)"
      : isHot
        ? GOLD2+"0.4)"
        : GOLD2+"0.18)";

  const cardShadow = isGold
    ? "0 0 32px rgba(255,215,0,0.14), 0 4px 24px rgba(0,0,0,0.5)"
    : isHot
      ? `0 0 28px ${GOLD2}0.14), 0 4px 20px rgba(0,0,0,0.5)`
      : `0 0 24px ${GOLD2}0.08), 0 4px 16px rgba(0,0,0,0.45)`;

  /* badge */
  const badge = getTopBadge(oferta, recentlyConfirmed, isNew, !!isExpiringSoon);

  /* price quality seal */
  const sealPreco = isMulti && grupo.avgPreco > 0
    ? (() => {
        const ratio = oferta.preco / grupo.avgPreco;
        if (ratio <= 0.92) return { label: "Preço bom",      color: "#4ade80", bg: "rgba(34,197,94,0.12)",  border: "rgba(74,222,128,0.28)" } as const;
        if (ratio <= 1.08) return { label: "Preço normal",   color: GOLD,      bg: GOLD2+"0.08)",            border: GOLD2+"0.16)" } as const;
        return               { label: "Acima da média", color: "#f87171", bg: "rgba(239,68,68,0.09)", border: "rgba(239,68,68,0.22)" } as const;
      })()
    : null;

  /* price color */
  const priceColor = isGold ? "#ffd700" : isSuspect ? "#fbbf24" : GOLD;
  const priceGlow  = isGold
    ? "0 0 18px rgba(255,215,0,0.5)"
    : `0 0 14px ${GOLD2}0.45)`;

  /* handlers */
  const doLike = () => {
    if (!getCurrentUser()) return;
    likeMutation.mutate({ id: oferta.id, data: {} }, {
      onSuccess: invalidate,
      onError: (err) => toast.error(apiErr(err)),
    });
  };
  const doValidar = () => {
    if (!getCurrentUser()) return;
    validarMutation.mutate({ id: oferta.id, data: {} }, {
      onSuccess: () => { invalidate(); toast.success("Validado! +2 pontos para quem publicou."); },
      onError: (err) => toast.error(apiErr(err)),
    });
  };
  const doDenunciar = () => {
    if (!getCurrentUser()) return;
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
  const doEncerrar = () => {
    if (!confirm("Marcar esta promoção como encerrada?")) return;
    encerrarMutation.mutate({ id: oferta.id }, {
      onSuccess: () => { invalidate(); toast.success("Oferta marcada como encerrada."); setShowOwnerMenu(false); },
      onError: (err) => toast.error(apiErr(err)),
    });
  };
  const doExcluir = () => {
    const ageMs = Date.now() - new Date(oferta.dataCriacao).getTime();
    const msg = ageMs < 10 * 60_000
      ? "Excluir esta oferta permanentemente?"
      : "Após 10 minutos não é possível excluir. A oferta será ocultada. Continuar?";
    if (!confirm(msg)) return;
    excluirMutation.mutate({ id: oferta.id }, {
      onSuccess: (data) => {
        invalidate();
        toast.success((data as { deleted?: boolean }).deleted ? "Excluída." : "Ocultada do feed.");
        setShowOwnerMenu(false);
      },
      onError: (err) => toast.error(apiErr(err)),
    });
  };
  const doNaoEncontrei = () => {
    naoEncontreiMutation.mutate({ id: oferta.id, data: {} }, {
      onSuccess: (data) => {
        invalidate();
        (data as { statusUsuario?: string }).statusUsuario === "pode_ter_acabado"
          ? toast.warning("⚠️ Oferta marcada como possivelmente encerrada.")
          : toast.info("Obrigado pelo aviso!");
      },
      onError: (err) => toast.error(apiErr(err)),
    });
  };

  const handleLike      = (e: React.MouseEvent) => { e.stopPropagation(); requireLogin(doLike); };
  const handleValidar   = (e: React.MouseEvent) => { e.stopPropagation(); requireLogin(doValidar); };
  const handleCompare   = (e: React.MouseEvent) => { e.stopPropagation(); onCompare(grupo); };
  const handleEncerrar  = (e: React.MouseEvent) => { e.stopPropagation(); requireLogin(doEncerrar); };
  const handleExcluir   = (e: React.MouseEvent) => { e.stopPropagation(); requireLogin(doExcluir); };
  const handleOwnerMenu = (e: React.MouseEvent) => { e.stopPropagation(); setShowOwnerMenu((v) => !v); };
  const handleCardClick = () => isMulti ? onCompare(grupo) : onOpenModal(oferta);

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const text = `🛒 ${oferta.produto} por ${R(oferta.preco)} em ${oferta.mercado}${oferta.bairro ? ` (${oferta.bairro})` : ""}`;
    const url = window.location.origin;
    try {
      if (navigator.share) {
        await navigator.share({ title: "AíCompensa", text, url });
      } else {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        toast.success("Copiado!");
      }
    } catch { /* cancelled */ }
  };

  /* activity pulse — derived from real offer state */
  const activityMsg: string | null = recentlyConfirmed && ultimaConfMin !== null
    ? `Confirmado há ${ultimaConfMin < 1 ? "< 1" : ultimaConfMin} min`
    : (oferta.confirmacoes ?? 0) >= 3
      ? `${oferta.confirmacoes} pessoas confirmaram esse preço`
      : isHot ? "🔥 Oferta em alta agora"
      : null;
  const activityColor = recentlyConfirmed ? GOLD : isHot ? "#fb923c" : "#a5b4fc";

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.18, delay: Math.min(index * 0.04, 0.18) }}
      whileTap={{ scale: 0.982 }}
    >
      {editingOferta && (
        <EditOfertaModal
          oferta={editingOferta}
          onClose={() => setEditingOferta(null)}
          onSuccess={invalidate}
        />
      )}

      {/* ── Card shell ───────────────────────────────────────────────────── */}
      <motion.div
        onClick={handleCardClick}
        className={cn("relative rounded-2xl overflow-hidden cursor-pointer", (isEncerrada || expired) && "opacity-60")}
        style={{ background: cardBg, border: `1.5px solid ${borderColor}`, boxShadow: cardShadow }}
        animate={isGold ? {
          boxShadow: [
            "0 0 24px rgba(255,215,0,0.12), 0 4px 24px rgba(0,0,0,0.5)",
            "0 0 44px rgba(255,215,0,0.26), 0 4px 24px rgba(0,0,0,0.5)",
            "0 0 24px rgba(255,215,0,0.12), 0 4px 24px rgba(0,0,0,0.5)",
          ],
        } : isHot ? {
          boxShadow: [
            `0 0 20px ${GOLD2}0.1), 0 4px 20px rgba(0,0,0,0.5)`,
            `0 0 36px ${GOLD2}0.22), 0 4px 20px rgba(0,0,0,0.5)`,
            `0 0 20px ${GOLD2}0.1), 0 4px 20px rgba(0,0,0,0.5)`,
          ],
        } : undefined}
        transition={isGold || isHot ? { duration: 2.2, repeat: Infinity, repeatDelay: 2.5, ease: "easeInOut" } : undefined}
      >
        {/* Sponsored: shimmer sweep + pulsing inner ring */}
        {isGold && (
          <>
            <div
              className="absolute inset-0 pointer-events-none rounded-2xl"
              style={{
                background: "linear-gradient(90deg, transparent 0%, rgba(255,215,0,0.09) 50%, transparent 100%)",
                backgroundSize: "200% 100%",
                animation: "shimmer 3s ease-in-out infinite",
              }}
            />
            <motion.div
              className="absolute inset-0 pointer-events-none rounded-2xl"
              animate={{ opacity: [0, 0.45, 0] }}
              transition={{ duration: 1.8, repeat: Infinity, repeatDelay: 1.2 }}
              style={{ boxShadow: "inset 0 0 0 1.5px rgba(255,215,0,0.55)" }}
            />
          </>
        )}

        {/* ── Top badge strip ──────────────────────────────────────────────── */}
        {isGold ? (
          <div
            className="flex items-center justify-between px-3 py-1.5"
            style={{
              background: "linear-gradient(90deg, #b87800 0%, #ffcc00 40%, #ffee77 60%, #b87800 100%)",
              backgroundSize: "200% 100%",
              animation: "shimmer 4s ease-in-out infinite",
            }}
          >
            <span className="text-[10px] font-black tracking-widest uppercase text-black">⭐ OFERTA PATROCINADA</span>
            <span className="text-[9px] font-black text-black/60 uppercase tracking-wide">💎 Premium</span>
          </div>
        ) : badge ? (
          <div className="px-3 pt-2.5 pb-0">
            <motion.span
              className="inline-flex items-center gap-1 text-[10px] font-black tracking-wider uppercase px-2.5 py-1 rounded-full"
              style={{
                background: badge.bg,
                color: badge.color,
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                border: `1px solid ${badge.glow ?? "rgba(255,255,255,0.08)"}`,
                boxShadow: badge.glow ? `0 0 10px ${badge.glow}` : undefined,
              }}
              {...(badge.text === "QUENTE" || badge.text === "SUPER" ? {
                animate: { scale: [1, 1.04, 1] },
                transition: { duration: 1.8, repeat: Infinity, repeatType: "reverse" as const },
              } : {})}
            >
              {badge.icon} {badge.text}
            </motion.span>
          </div>
        ) : null}

        {/* ── Lista match banner ───────────────────────────────────────────── */}
        {listaItemNome && (
          <div
            className="flex items-center gap-2 px-3 py-1.5"
            style={{
              background: "linear-gradient(90deg, rgba(34,197,94,0.18) 0%, rgba(34,197,94,0.08) 100%)",
              borderBottom: "1px solid rgba(34,197,94,0.22)",
            }}
          >
            <ShoppingCart className="shrink-0" size={12} style={{ color: "#4ade80" }} />
            <span className="text-[11px] font-bold leading-tight" style={{ color: "#4ade80" }}>
              Na sua lista
            </span>
            <span className="text-[10px] text-slate-400 truncate">&middot; {listaItemNome}</span>
          </div>
        )}

        {/* ── Main content row ─────────────────────────────────────────────── */}
        <div className="flex gap-3 px-3.5 pt-2.5 pb-1.5">

          {/* Thumbnail — 96 px */}
          <div
            className="shrink-0 relative overflow-hidden flex items-center justify-center"
            style={{
              width: 82,
              height: 82,
              borderRadius: 16,
              background: "rgba(255,255,255,0.04)",
              border: `1.5px solid ${isGold ? "rgba(255,215,0,0.2)" : GOLD2+"0.12)"}`,
            }}
          >
            {(() => {
              const imgSrc = oferta.produtoCatalogo?.imagemPremiumUrl ?? oferta.imagemExibicao ?? oferta.fotoUrl;
              return imgSrc ? (
                <img
                  src={imgSrc}
                  alt={oferta.produto}
                  loading="lazy"
                  className="w-full h-full"
                  style={{ objectFit: "cover", borderRadius: 15 }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              ) : (
                <span style={{ fontSize: 38, lineHeight: 1 }}>{cat.emoji}</span>
              );
            })()}

            {/* Multi-market badge */}
            {isMulti && (
              <div
                className="absolute bottom-0 right-0 text-[9px] font-black px-1.5 py-0.5 rounded-tl-xl leading-none text-black"
                style={{ background: GOLD }}
              >
                {grupo.count}×
              </div>
            )}

            {/* Hot inner glow */}
            {isHot && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ borderRadius: 15, boxShadow: `inset 0 0 16px ${GOLD2}0.18)` }}
              />
            )}
          </div>

          {/* Info column */}
          <div className="flex-1 min-w-0 flex flex-col gap-0.5 justify-center">

            {/* Product name */}
            <p className="font-semibold text-[14px] text-white leading-tight line-clamp-2">{primary}</p>
            {secondary && (
              <p className="text-[11px] leading-tight line-clamp-1" style={{ color: "rgba(255,255,255,0.38)" }}>
                {secondary}
              </p>
            )}

            {/* Origem + tipo */}
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <OfferSourceBadge
                mercadoNome={(oferta as any).mercadoNome ?? oferta.mercado}
                mercadoLogoUrl={(oferta as any).mercadoLogoUrl}
                usuarioNome={(oferta as any).usuarioNome ?? (oferta as any).autorNome ?? oferta.usuario}
                size="sm"
                theme="dark"
              />
              <span className="text-[11px] font-medium truncate" style={{ color: "rgba(255,255,255,0.38)" }}>
                {(oferta.bairro ?? oferta.cidade) ?? (isMulti ? `${grupo.count} mercados` : "Origem da oferta")}
              </span>
              {oferta.tipoOrigem === "presencial" && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                  style={{ background: GOLD2+"0.13)", color: GOLD }}>Presencial</span>
              )}
              {oferta.tipoOrigem === "encarte" && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                  style={{ background: "rgba(168,85,247,0.14)", color: "#c084fc" }}>Encarte</span>
              )}
            </div>

            {/* Distance */}
            {oferta.distancia != null && (
              <p className="text-[11px] font-bold flex items-center gap-1 leading-none mt-0.5" style={{ color: GOLD }}>
                <MapPin className="h-2.5 w-2.5 shrink-0" />
                {oferta.distancia < 1
                  ? `${Math.round(oferta.distancia * 1000)} m de você`
                  : `${oferta.distancia.toFixed(1)} km de você`}
              </p>
            )}

            {/* ── PRICE HERO ──────────────────────────────────────────────── */}
            <div className="flex items-baseline gap-1.5 mt-1">
              {hasSavings && referencePrice && (
                <span className="text-xs line-through font-semibold" style={{ color: "rgba(255,255,255,0.2)" }}>
                  {R(referencePrice)}
                </span>
              )}
              <span
                className="font-black leading-none tracking-tighter"
                style={{
                  fontSize: 35,
                  color: priceColor,
                  textShadow: isGold
                    ? "0 0 18px rgba(255,215,0,0.5), 0 0 32px rgba(255,215,0,0.2)"
                    : "0 0 16px rgba(242,193,78,0.22), 0 0 32px rgba(242,193,78,0.1)",
                }}
              >
                {R(oferta.preco)}
                {getCategoryUnit(oferta.categoria) && !hasPesoVolumeNoNome(oferta.produto) && (
                  <span style={{ fontSize: 12, fontWeight: 700, marginLeft: 3, opacity: 0.75 }}>
                    {getCategoryUnit(oferta.categoria)}
                  </span>
                )}
              </span>
              {hasSavings && (
                <span
                  className="text-[10px] font-black px-1.5 py-0.5 rounded-full self-center"
                  style={{ background: GOLD2+"0.18)", color: GOLD }}
                >
                  🏆 -{R(grupo.savings)}
                </span>
              )}
            </div>

            {/* Expiry urgency — shown in badge above; nothing needed here */}

            {/* ── Social proof — glass mini-badges ────────────────────────── */}
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <motion.span
                className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
                animate={{ opacity: [0.7, 1, 0.7] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                style={{
                  background: "rgba(255,255,255,0.05)",
                  backdropFilter: "blur(6px)",
                  WebkitBackdropFilter: "blur(6px)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "rgba(255,255,255,0.45)",
                }}
              >
                {(oferta.confirmacoes ?? 0) > 0 && (
              <>
                <CheckCircle className="h-2.5 w-2.5" /> Confirmada por {oferta.confirmacoes} {oferta.confirmacoes === 1 ? "pessoa" : "pessoas"}
              </>
            )}
              </motion.span>
              {(oferta.confirmacoes ?? 0) > 0 && (
                <span
                  className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{
                    background: GOLD2+"0.08)",
                    backdropFilter: "blur(6px)",
                    WebkitBackdropFilter: "blur(6px)",
                    border: `1px solid ${GOLD2+"0.18)"}`,
                    color: GOLD,
                  }}
                >
                  <CheckCircle className="h-2.5 w-2.5" /> {oferta.confirmacoes}
                </span>
              )}
              {commentCount > 0 && (
                <span
                  className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{
                    background: "rgba(168,85,247,0.09)",
                    backdropFilter: "blur(6px)",
                    WebkitBackdropFilter: "blur(6px)",
                    border: "1px solid rgba(168,85,247,0.2)",
                    color: "#c084fc",
                  }}
                >
                  <MessageCircle className="h-2.5 w-2.5" /> {commentCount}
                </span>
              )}
              {sealPreco && (
                <span
                  className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: sealPreco.bg, border: `1px solid ${sealPreco.border}`, color: sealPreco.color }}
                >
                  {sealPreco.label}
                </span>
              )}
              {/* ── Inteligência de preço 30d ──────────────────────────── */}
              {oferta.inteligenciaPreco?.classificacaoPreco === "melhor_preco" && (
                <motion.span
                  className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full"
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 2, repeat: Infinity, repeatType: "reverse" as const }}
                  style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(74,222,128,0.3)", color: "#4ade80" }}
                >
                  🔥 Menor preço 30d
                </motion.span>
              )}
              {oferta.inteligenciaPreco?.classificacaoPreco === "bom_preco" && (
                <span
                  className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: GOLD2+"0.10)", border: `1px solid ${GOLD2+"0.22)"}`, color: GOLD }}
                >
                  💰 Abaixo da média
                </span>
              )}
              {oferta.inteligenciaPreco?.classificacaoPreco === "preco_normal" && (
                <span
                  className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-full"
                  style={{ color: "rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
                >
                  Preço na média
                </span>
              )}
              <span
                className="flex items-center gap-0.5 text-[10px]"
                style={{ color: "rgba(255,255,255,0.18)", marginLeft: "auto" }}
              >
                <Clock className="h-2.5 w-2.5" /> {timeAgo}
              </span>
            </div>
          </div>
        </div>

        {/* ── Price history strip ──────────────────────────────────────────── */}
        {isMulti && (
          <div
            className="mx-3 mb-1.5 rounded-xl overflow-hidden"
            style={{
              background: "rgba(255,255,255,0.025)",
              border: "1px solid rgba(255,255,255,0.055)",
            }}
          >
            <div className="grid grid-cols-3 divide-x divide-white/[0.05] px-0 py-2">
              <div className="flex flex-col items-center gap-0.5 px-2">
                <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.28)" }}>
                  Menor preço
                </span>
                <span className="text-[12px] font-black" style={{ color: "#4ade80" }}>
                  {R(grupo.minPreco)}
                </span>
              </div>
              <div className="flex flex-col items-center gap-0.5 px-2">
                <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.28)" }}>
                  Preço médio
                </span>
                <span className="text-[12px] font-black" style={{ color: "rgba(255,255,255,0.5)" }}>
                  {R(grupo.avgPreco)}
                </span>
              </div>
              <div className="flex flex-col items-center gap-0.5 px-2">
                <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.28)" }}>
                  Mercados
                </span>
                <span className="text-[12px] font-black" style={{ color: "rgba(255,255,255,0.5)" }}>
                  {grupo.count}
                </span>
              </div>
            </div>
            <div
              className="text-center text-[9px] pb-1.5"
              style={{ color: "rgba(255,255,255,0.18)" }}
            >
              Baseado em {grupo.totalPublicacoes} oferta{grupo.totalPublicacoes !== 1 ? "s" : ""} publicadas
            </div>
          </div>
        )}

        {/* ── Activity pulse ───────────────────────────────────────────────── */}
        {activityMsg && (
          <div className="flex items-center gap-1.5 px-4 pb-1.5">
            <motion.span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              animate={{ opacity: [0.35, 1, 0.35], scale: [1, 1.4, 1] }}
              transition={{ duration: 1.4, repeat: Infinity }}
              style={{ background: activityColor }}
            />
            <span className="text-[10px] font-medium" style={{ color: "rgba(255,255,255,0.28)" }}>
              {activityMsg}
            </span>
          </div>
        )}

        {/* ── Status banners ───────────────────────────────────────────────── */}
        {isSuspect && (
          <div className="mx-3 mb-2 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold"
            style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}>
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Preço denunciado. Confirme antes de ir.
          </div>
        )}
        {oferta.confirmacoes >= 3 && !isSuspect && !expired && (
          <div
            className="mx-3 mb-2 flex items-center gap-2 rounded-xl px-3 py-2"
            style={{ background: GOLD2+"0.08)", border: `1px solid ${GOLD2+"0.18)"}`, boxShadow: `0 0 10px ${GOLD2+"0.06)"}` }}
          >
            <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 2, repeat: Infinity }}>
              <CheckCircle className="h-3.5 w-3.5 shrink-0" style={{ color: GOLD }} />
            </motion.div>
            <span className="text-xs font-bold" style={{ color: GOLD }}>
              {oferta.confirmacoes} {oferta.confirmacoes === 1 ? "pessoa confirmou" : "pessoas confirmaram"} este preço
            </span>
            {oferta.confiancaLabel === "Alta confiança" && (
              <span className="ml-auto flex items-center gap-0.5 text-[10px] font-black shrink-0" style={{ color: GOLD }}>
                <Shield className="h-3 w-3" /> Confiável
              </span>
            )}
          </div>
        )}
        {isPodeTerAcabado && (
          <div className="mx-3 mb-2 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold"
            style={{ background: "rgba(251,146,60,0.1)", border: "1px solid rgba(251,146,60,0.2)", color: "#fb923c" }}>
            <EyeOff className="h-3.5 w-3.5 shrink-0" />
            ⚠️ Vários usuários não encontraram mais esta promoção
          </div>
        )}
        {isEncerrada && (
          <div className="mx-3 mb-2 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold"
            style={{ background: "rgba(100,116,139,0.1)", border: "1px solid rgba(100,116,139,0.15)", color: "rgba(255,255,255,0.3)" }}>
            <XCircle className="h-3.5 w-3.5 shrink-0" />
            Promoção encerrada pelo publicador
          </div>
        )}

        {/* ── Action row ───────────────────────────────────────────────────── */}
        <div className="flex items-center gap-1.5 px-3.5 pb-2.5">

          {/* ❤ Curtir */}
          <button
            onClick={handleLike}
            disabled={likeMutation.isPending}
            className="flex items-center gap-1 h-8 px-2 rounded-xl text-[11px] font-bold transition-all active:scale-95 shrink-0"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(249,115,22,0.15)"; e.currentTarget.style.color = "#fb923c"; e.currentTarget.style.borderColor = "rgba(249,115,22,0.3)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.color = "rgba(255,255,255,0.4)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
          >
            <Heart className="h-3 w-3" />
            <span>{oferta.curtidas}</span>
          </button>

          {/* ✅ Confirmar / 📊 Comparar — MAIN CTA */}
          {isMulti ? (
            <motion.button
              onClick={handleCompare}
              whileTap={{ scale: 0.96 }}
              transition={{ duration: 0.12 }}
              className="flex-1 h-8 rounded-full flex items-center justify-center gap-1.5 text-xs font-black text-black"
              style={{
                background: `linear-gradient(135deg, ${GOLD} 0%, #D4A017 100%)`,
                boxShadow: `0 0 22px ${GOLD2}0.4), 0 2px 10px rgba(0,0,0,0.35)`,
              }}
            >
              <BarChart2 className="h-3 w-3" />
              Comparar {grupo.count} preços
            </motion.button>
          ) : (
            <motion.button
              onClick={handleValidar}
              disabled={validarMutation.isPending || expired}
              whileTap={expired ? undefined : { scale: 0.96 }}
              transition={{ duration: 0.12 }}
              className={cn(
                "flex-1 h-8 rounded-full flex items-center justify-center gap-1.5 text-xs font-black",
                validarMutation.isPending && "opacity-60",
              )}
              style={expired ? {
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.07)",
                color: "rgba(255,255,255,0.2)",
                cursor: "not-allowed",
              } : {
                background: `linear-gradient(135deg, ${GOLD} 0%, #F2C14E 100%)`,
                color: "#000",
                boxShadow: `0 0 20px ${GOLD2}0.38), 0 0 40px ${GOLD2}0.1), 0 2px 8px rgba(0,0,0,0.3)`,
              }}
            >
              <CheckCircle className="h-3 w-3" />
              {validarMutation.isPending ? "..." : "Confirmar"}
              {oferta.validacoes > 0 && !expired && (
                <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-black/20">
                  {oferta.validacoes}
                </span>
              )}
            </motion.button>
          )}

          {/* 💬 Comentários */}
          <motion.button
            onClick={(e) => { e.stopPropagation(); setCommentsOpen(true); }}
            whileTap={{ scale: 0.94 }}
            transition={{ duration: 0.12 }}
            className="relative h-8 flex items-center gap-1 px-2.5 rounded-xl shrink-0"
            style={{
              background: "rgba(168,85,247,0.14)",
              border: "1px solid rgba(168,85,247,0.3)",
              color: "#c084fc",
              boxShadow: "0 0 10px rgba(168,85,247,0.15)",
              transition: "all 0.18s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(168,85,247,0.25)";
              e.currentTarget.style.borderColor = "rgba(168,85,247,0.5)";
              e.currentTarget.style.boxShadow = "0 0 16px rgba(168,85,247,0.3)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(168,85,247,0.14)";
              e.currentTarget.style.borderColor = "rgba(168,85,247,0.3)";
              e.currentTarget.style.boxShadow = "0 0 10px rgba(168,85,247,0.15)";
            }}
          >
            <MessageCircle className="h-3 w-3" />
            <span className="text-[10px] font-black">
              {commentCount > 0 ? commentCount : ""}
            </span>
            {commentCount > 0 && (
              <span
                className="absolute -top-1.5 -right-1 text-[7px] font-black rounded-full flex items-center justify-center leading-none text-white pointer-events-none"
                style={{ background: "#7c3aed", minWidth: 14, height: 14, padding: "0 2px", boxShadow: "0 0 6px rgba(124,58,237,0.7)" }}
              >
                {commentCount > 9 ? "9+" : commentCount}
              </span>
            )}
          </motion.button>

          {/* ↗ Share */}
          <button
            onClick={handleShare}
            className="h-8 w-8 shrink-0 flex items-center justify-center rounded-xl transition-all active:scale-95"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.38)" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(96,165,250,0.14)"; e.currentTarget.style.color = "#93c5fd"; e.currentTarget.style.borderColor = "rgba(96,165,250,0.28)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.color = "rgba(255,255,255,0.38)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
          >
            <Share2 className="h-3 w-3" />
          </button>

          {/* ⋯ Owner menu */}
          <div className="relative shrink-0">
            <button
              onClick={handleOwnerMenu}
              className="h-8 w-8 flex items-center justify-center rounded-xl transition-all active:scale-95"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.32)" }}
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </button>
            <AnimatePresence>
              {showOwnerMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.92, y: 6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.92, y: 6 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 bottom-12 z-30 rounded-2xl shadow-2xl py-1.5 min-w-[190px]"
                  style={{ background: "#0d1520", border: "1px solid rgba(255,255,255,0.1)" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {onSave && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onSave(); setShowOwnerMenu(false); }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold transition-colors"
                      style={{ color: isSaved ? "#f472b6" : "rgba(255,255,255,0.65)" }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                    >
                      <Heart className={cn("h-4 w-4", isSaved && "fill-pink-400")} />
                      {isSaved ? "Remover favorito" : "Salvar oferta"}
                    </button>
                  )}
                  {!isOwner && !isMulti && !isEncerrada && (
                    <button
                      onClick={(e) => { e.stopPropagation(); requireLogin(doNaoEncontrei); setShowOwnerMenu(false); }}
                      disabled={naoEncontreiMutation.isPending}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50"
                      style={{ color: isPodeTerAcabado ? "#fb923c" : "rgba(255,255,255,0.55)" }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "rgba(251,146,60,0.08)"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                    >
                      <EyeOff className="h-4 w-4" /> Não encontrei mais
                    </button>
                  )}
                  {!isOwner && (
                    <button
                      onClick={(e) => { e.stopPropagation(); requireLogin(doDenunciar); setShowOwnerMenu(false); }}
                      disabled={denunciarMutation.isPending}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50"
                      style={{ color: "rgba(255,255,255,0.55)" }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.08)"; e.currentTarget.style.color = "#f87171"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(255,255,255,0.55)"; }}
                    >
                      <AlertTriangle className="h-4 w-4" /> Reportar preço
                    </button>
                  )}
                  {isOwner && (
                    <>
                      <button
                        onClick={(e) => { e.stopPropagation(); setShowOwnerMenu(false); setEditingOferta(oferta); }}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold transition-colors"
                        style={{ color: "rgba(255,255,255,0.65)" }}
                        onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                        onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                      >
                        <Pencil className="h-4 w-4" style={{ color: "rgba(255,255,255,0.35)" }} />
                        Editar oferta
                      </button>
                      {!isEncerrada && (
                        <button
                          onClick={handleEncerrar}
                          disabled={encerrarMutation.isPending}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50"
                          style={{ color: "#fb923c" }}
                          onMouseEnter={(e) => e.currentTarget.style.background = "rgba(251,146,60,0.08)"}
                          onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                        >
                          <XCircle className="h-4 w-4" /> Promoção acabou
                        </button>
                      )}
                      <button
                        onClick={handleExcluir}
                        disabled={excluirMutation.isPending}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50"
                        style={{ color: "#f87171" }}
                        onMouseEnter={(e) => e.currentTarget.style.background = "rgba(239,68,68,0.08)"}
                        onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                      >
                        <Trash2 className="h-4 w-4" /> Excluir
                      </button>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* ── Comment preview teaser ───────────────────────────────────────── */}
        {commentPreview && (
          <div
            className="flex items-center gap-1.5 px-3 pb-2 cursor-pointer"
            onClick={(e) => { e.stopPropagation(); setCommentsOpen(true); }}
          >
            <MessageCircle className="h-2.5 w-2.5 shrink-0" style={{ color: "#a855f7" }} />
            <span className="text-[10px] truncate flex-1" style={{ color: "rgba(168,85,247,0.6)" }}>
              {commentPreview}
            </span>
            <span
              className="text-[8px] font-black px-1.5 py-0.5 rounded-full shrink-0 text-white"
              style={{ background: "rgba(124,58,237,0.65)" }}
            >
              🔥 ativo
            </span>
          </div>
        )}

        {/* ── Ainda compensa? (dark glass bar) ─────────────────────────────── */}
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

export const OfferCardPremium = memo(OfferCardPremiumInner);
