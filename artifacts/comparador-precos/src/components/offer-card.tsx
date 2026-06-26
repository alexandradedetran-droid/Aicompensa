import { useState } from "react";
import { useLocation } from "wouter";
import { format, isPast, differenceInMinutes, differenceInHours, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQueryClient } from "@tanstack/react-query";
import { MapPin, CheckCircle, AlertTriangle, Store, Clock, Flame, Shield, Users, MessageCircle, Heart, Share2 } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Oferta, useLikeOferta, useValidarOferta, useDenunciarOferta, useConfirmarPreco, useRenovarOferta, getListOfertasQueryKey,
} from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { getProductDisplay } from "@/lib/visual-priority";
import { getCurrentUser } from "@/lib/current-user";
import { useLoginPrompt } from "@/lib/login-prompt";
import { CommentsBottomSheet } from "@/components/CommentsBottomSheet";

/* ── AindaCompensaBar ─────────────────────────────────────────────────────── */

interface AindaCompensaBarProps {
  oferta: Oferta;
  onInvalidate: () => void;
}

export function AindaCompensaBar({ oferta, onInvalidate }: AindaCompensaBarProps) {
  const { requireLogin }      = useLoginPrompt();
  const [, setLocation]       = useLocation();
  const [naoOpen, setNaoOpen] = useState(false);
  const [voted, setVoted]     = useState(false);
  const confirmarMutation     = useConfirmarPreco();
  const denunciarMutation     = useDenunciarOferta();

  if (oferta.status === "expirada") return null;

  const confirmacoes  = oferta.confirmacoes ?? 0;
  const ultimaConfMin = oferta.ultimaConfirmacaoEm
    ? differenceInMinutes(new Date(), new Date(oferta.ultimaConfirmacaoEm))
    : null;

  const doSim = () =>
    confirmarMutation.mutate(
      { id: oferta.id, data: {} },
      {
        onSuccess: () => {
          onInvalidate();
          toast.success("✅ Confirmado! +3 pontos para quem publicou.");
        },
        onError: (err) => {
          const msg = (err as { data?: { error?: string } })?.data?.error;
          if ((err as { status?: number })?.status === 409) {
            toast.info("Você já confirmou esta oferta.");
          } else {
            toast.error(msg ?? "Não foi possível confirmar.");
          }
        },
      },
    );

  const doEncerrar = () =>
    denunciarMutation.mutate(
      { id: oferta.id, data: {} },
      {
        onSuccess: () => {
          setNaoOpen(false);
          setVoted(true);
          // Refresh feed after a short delay so user sees the thank-you feedback
          setTimeout(onInvalidate, 2500);
        },
        onError: (err) => {
          if ((err as { status?: number })?.status === 409) {
            toast.info("Você já votou nesta oferta.");
            setNaoOpen(false);
          } else {
            toast.error("Não foi possível registrar. Tente novamente.");
          }
        },
      },
    );

  const pos = oferta.confirmacoes ?? 0;
  const neg = oferta.denuncias ?? 0;
  const hasPct = pos + neg >= 2;
  const pct = hasPct ? Math.round((pos / (pos + neg)) * 100) : null;

  return (
    <div
      className="mx-3 mb-3 rounded-xl overflow-hidden"
      style={{
        border: "1px solid #E5E7EB",
        background: "#FEFCE8",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {voted ? (
        <div
          className="flex items-center gap-2 px-3 py-2.5"
          style={{ background: "rgba(168,85,247,0.1)" }}
        >
          <span className="text-lg leading-none">🙏</span>
          <span className="text-[11px] font-semibold flex-1" style={{ color: "#c084fc" }}>
            Obrigado! Vamos validar com a comunidade.
          </span>
        </div>
      ) : !naoOpen ? (
        <div
          className="flex items-center gap-2 px-3 py-2"
          style={{ background: "#FEFCE8" }}
        >
          {/* Label + % badge */}
          <div className="flex-1 flex items-center gap-1.5 min-w-0">
            <span className="text-[11px] font-bold shrink-0" style={{ color: "#A16207" }}>
              💬 Ainda compensa?
            </span>
            {pct !== null && (
              <span
                className="text-[9px] font-black px-1.5 py-0.5 rounded-full shrink-0"
                style={{
                  background: pct >= 70 ? "#DCFCE7" : "#FFF7ED",
                  color: pct >= 70 ? "#15803D" : "#C2410C",
                  border: pct >= 70 ? "1px solid #BBF7D0" : "1px solid #FED7AA",
                }}
              >
                {pct}% dizem sim
              </span>
            )}
            {confirmacoes > 0 && pct === null && (
              <span className="text-[10px] font-semibold whitespace-nowrap shrink-0" style={{ color: "#6B7280" }}>
                {confirmacoes} {confirmacoes === 1 ? "confirmou" : "confirmaram"}
                {ultimaConfMin !== null && ultimaConfMin < 120
                  ? ` · há ${ultimaConfMin < 1 ? "< 1" : ultimaConfMin}min`
                  : ""}
              </span>
            )}
          </div>

          {/* SIM */}
          <button
            onClick={(e) => { e.stopPropagation(); requireLogin(doSim); }}
            disabled={confirmarMutation.isPending}
            className="px-3 py-1.5 rounded-lg text-[11px] font-black active:scale-95 transition-all disabled:opacity-50 shrink-0 text-black"
            style={{
              background: confirmarMutation.isPending
                ? "#a07010"
                : "linear-gradient(135deg, #F2C14E, #D4A017)",
              boxShadow: "0 0 12px rgba(242,193,78,0.35), 0 2px 4px rgba(0,0,0,0.2)",
            }}
          >
            {confirmarMutation.isPending ? "..." : "✅ SIM"}
          </button>

          {/* NÃO */}
          <button
            onClick={(e) => { e.stopPropagation(); requireLogin(() => setNaoOpen(true)); }}
            className="px-3 py-1.5 rounded-lg text-[11px] font-black active:scale-95 transition-all shrink-0"
            style={{
              background: "#fff",
              border: "1px solid #E5E7EB",
              color: "#6B7280",
            }}
          >
            ✗ NÃO
          </button>
        </div>
      ) : (
        <div
          className="flex items-center gap-2 px-3 py-2.5"
          style={{ background: "#FFF7ED", borderTop: "1px solid #FED7AA" }}
        >
          <span className="text-[11px] font-semibold flex-1" style={{ color: "#C2410C" }}>O que aconteceu?</span>
          <button
            onClick={(e) => { e.stopPropagation(); doEncerrar(); }}
            disabled={denunciarMutation.isPending}
            className="px-2.5 py-1.5 rounded-lg text-[11px] font-black text-white active:scale-95 transition-all disabled:opacity-50 shrink-0"
            style={{ background: "#EA580C" }}
          >
            {denunciarMutation.isPending ? "..." : "Acabou"}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setLocation("/publicar"); }}
            className="px-2.5 py-1.5 rounded-lg text-[11px] font-black active:scale-95 transition-all shrink-0"
            style={{ background: "#fff", border: "1px solid #FED7AA", color: "#C2410C" }}
          >
            Novo preço
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setNaoOpen(false); }}
            className="text-sm font-bold px-1 shrink-0 transition-colors"
            style={{ color: "#9CA3AF" }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

/* ── OfferCard ────────────────────────────────────────────────────────────── */

interface OfferCardProps {
  oferta: Oferta;
  index: number;
}

const R = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

function tempoPostado(iso: string): string {
  const d = new Date(iso);
  const mins  = differenceInMinutes(new Date(), d);
  const hours = differenceInHours(new Date(), d);
  if (mins < 1)  return "Agora";
  if (mins < 60) return `${mins}min atrás`;
  if (hours < 24) return `${hours}h atrás`;
  if (isYesterday(d)) return "Ontem";
  return format(d, "dd/MM", { locale: ptBR });
}

function ehHoje(iso: string | null | undefined): boolean {
  if (!iso) return false;
  return isToday(new Date(iso));
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

export function OfferCard({ oferta, index }: OfferCardProps) {
  const queryClient       = useQueryClient();
  const { requireLogin }  = useLoginPrompt();
  const likeMutation      = useLikeOferta();
  const validarMutation   = useValidarOferta();
  const denunciarMutation = useDenunciarOferta();
  const renovarMutation   = useRenovarOferta();
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [likeAnimating, setLikeAnimating] = useState(false);

  const me = getCurrentUser();
  const isOwner = me?.id === oferta.usuarioId;

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListOfertasQueryKey() });

  const doLike = () => {
    const user = getCurrentUser();
    if (!user) return;
    setLikeAnimating(true);
    likeMutation.mutate({ id: oferta.id, data: {} }, {
      onSuccess: invalidate,
      onError: (err) => {
        if ((err as { status?: number })?.status === 409) {
          toast.info("Você já curtiu esta oferta.");
        } else {
          toast.error("Não foi possível curtir. Tente novamente.");
        }
      },
    });
  };

  const doValidar = () => {
    const user = getCurrentUser();
    if (!user) return;
    validarMutation.mutate({ id: oferta.id, data: {} }, {
      onSuccess: () => { invalidate(); toast.success("Validado! +2 pontos para quem publicou."); },
      onError: () => toast.error("Não foi possível validar."),
    });
  };

  const doDenunciar = () => {
    const user = getCurrentUser();
    if (!user) return;
    denunciarMutation.mutate({ id: oferta.id, data: {} }, {
      onSuccess: (u) => {
        invalidate();
        if (u.status === "expirada") {
          toast.warning("Oferta encerrada pela comunidade.");
        } else if (u.status === "suspeita") {
          toast.info("Voto registrado. Oferta marcada como possivelmente indisponível.");
        } else {
          toast.info("Obrigado! Vamos validar com a comunidade.");
        }
      },
      onError: (err) => {
        if ((err as { status?: number })?.status === 409) {
          toast.info("Você já votou nesta oferta.");
        } else {
          toast.error("Não foi possível registrar.");
        }
      },
    });
  };

  const handleLike      = () => requireLogin(doLike);
  const handleValidar   = () => requireLogin(doValidar);
  const handleDenunciar = () => requireLogin(doDenunciar);

  const handleRenovar = () => requireLogin(() => {
    renovarMutation.mutate({ id: oferta.id }, {
      onSuccess: () => { invalidate(); toast.success("✅ Oferta renovada! Validade estendida."); },
      onError: (err) => {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
        toast.error(msg ?? "Não foi possível renovar.");
      },
    });
  });

  const handleShare = async () => {
    const R2 = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
    const text = `🛒 ${oferta.produto} por ${R2(oferta.preco)} em ${oferta.mercado}${oferta.bairro ? ` (${oferta.bairro})` : ""}`;
    const url = window.location.origin;
    try {
      if (navigator.share) {
        await navigator.share({ title: "AíCompensa", text, url });
      } else {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        toast.success("Copiado para a área de transferência!");
      }
    } catch {
      // user cancelled
    }
  };

  const expired              = oferta.status === "expirada";
  const isCommunityClose     = expired && (oferta.denuncias ?? 0) >= 3;
  const isSuspect            = oferta.status === "suspeita";
  const mins                 = differenceInMinutes(new Date(), new Date(oferta.dataCriacao));
  const isVeryRecent         = mins < 30;
  const isRecent             = mins < 120;
  const confirmadoHoje       = ehHoje(oferta.ultimaValidacaoEm);
  const isHotOffer           = confirmadoHoje && oferta.validacoes >= 3;
  const validadeDate         = oferta.validade ? new Date(oferta.validade) : null;
  const isExpiringSoon       =
    validadeDate && !isPast(validadeDate) &&
    validadeDate.getTime() - Date.now() < 2 * 24 * 60 * 60 * 1000;

  // Validity / quality signals from backend
  const validityLabel    = oferta.validityLabel;
  const confiancaLabel   = oferta.confiancaLabel;
  const isAltaConfianca  = confiancaLabel === "Alta confiança";
  const isConfiavel      = confiancaLabel === "Confiável";
  const isQuestionavel   = confiancaLabel === "Questionável";
  const isRecentlyConf   = validityLabel === "Recém confirmada";
  const isExpirando      = validityLabel === "Expirando";
  const isDesatualizada  =
    validityLabel === "Possivelmente expirada" || validityLabel === "Desatualizada";
  const renovacoesRestantes = 3 - ((oferta as Oferta & { renovacoes?: number }).renovacoes ?? 0);
  const podeRenovar = isOwner && !isCommunityClose && renovacoesRestantes > 0 &&
    (expired || isExpirando || isDesatualizada);
  const totalEngajamento = (oferta.confirmacoes ?? 0) + oferta.validacoes;

  // Trust signal: primary status badge — V3 branded system
  type Badge = { label: string; cls: string };
  const statusBadge: Badge = (() => {
    if (isCommunityClose)   return { label: "🔴 Encerrada pela comunidade", cls: "bg-red-50 text-red-700 border-red-200" };
    if (expired)            return { label: "⏱ Expirada",                  cls: "bg-gray-100 text-gray-500 border-gray-200" };
    if (isSuspect)          return { label: "⚠️ Em validação",              cls: "bg-amber-50 text-amber-700 border-amber-200" };
    if (isHotOffer)         return { label: "🔥 Melhor preço",             cls: "bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]" };
    if (isRecentlyConf)     return { label: "⭐ Super Confirmada",         cls: "bg-[#F2C14E] text-[#111827] border-[#E6A817]" };
    if (confirmadoHoje)     return { label: "✅ Confirmada hoje",           cls: "bg-green-50 text-green-700 border-green-200" };
    if (oferta.status === "validada") return { label: "✅ Confirmada",     cls: "bg-green-50 text-green-700 border-green-200" };
    if (isExpirando)        return { label: "🟡 Expirando",                 cls: "bg-amber-50 text-amber-700 border-amber-200" };
    if (isDesatualizada)    return { label: "⏰ Desatualizada",             cls: "bg-slate-100 text-slate-500 border-slate-200" };
    if (isVeryRecent)       return { label: "⚡ Recém postada",             cls: "bg-blue-50 text-blue-700 border-blue-200" };
    return                          { label: "🟢 Ativa",                    cls: "bg-green-50 text-green-700 border-green-200" };
  })();

  // Secondary tags (compact)
  const secondaryBadges: Badge[] = [];
  if (!expired && !isSuspect) {
    if (isRecent && !isVeryRecent && !confirmadoHoje && !isRecentlyConf) {
      secondaryBadges.push({ label: "Recente", cls: "bg-blue-50 text-blue-600 border-blue-100" });
    }
    if (oferta.validacoes >= 2 && !confirmadoHoje) {
      secondaryBadges.push({ label: `${oferta.validacoes} validaram`, cls: "bg-slate-50 text-slate-600 border-slate-200" });
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.2, delay: Math.min(index * 0.04, 0.3) }}
      whileTap={{ scale: 0.985 }}
    >
      <div
        className={cn(
          "bg-white rounded-[20px] overflow-hidden border transition-shadow hover:shadow-lg",
          isCommunityClose && "border-red-200 bg-red-50/30",
          isSuspect && !isCommunityClose && "border-amber-200 bg-amber-50/20",
          expired && "opacity-60",
          !isSuspect && !expired && !isCommunityClose && "border-transparent",
        )}
        style={{ boxShadow: (isSuspect || isCommunityClose) ? "none" : "0 2px 16px rgba(0,0,0,0.09)" }}
      >
        <div className="flex gap-3.5 p-4 pb-3">
          {/* Left: image — 88px V3 */}
          <div className="shrink-0 w-[88px] h-[88px] rounded-2xl overflow-hidden bg-slate-50 border border-slate-100 flex items-center justify-center">
            {oferta.fotoUrl ? (
              <img
                src={oferta.fotoUrl}
                alt={oferta.produto}
                loading="lazy"
                className="w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            ) : (
              <Store className="h-7 w-7 text-slate-300" />
            )}
          </div>

          {/* Right: info */}
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            {/* Primary badge + trust badge */}
            <div className="flex flex-wrap items-center gap-1">
              <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border leading-tight", statusBadge.cls)}>
                {statusBadge.label}
              </span>
              {/* Trust signal — only if meaningful */}
              {!expired && !isSuspect && isAltaConfianca && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full border leading-tight bg-purple-50 text-purple-700 border-purple-200">
                  <Shield className="h-2.5 w-2.5" /> Alta confiança
                </span>
              )}
              {!expired && !isSuspect && !isAltaConfianca && isConfiavel && secondaryBadges.length === 0 && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border leading-tight bg-slate-50 text-slate-600 border-slate-200">
                  Confiável
                </span>
              )}
              {!expired && isQuestionavel && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border leading-tight bg-amber-50 text-amber-700 border-amber-200">
                  ⚠️ Verificar
                </span>
              )}
              {secondaryBadges.length > 0 && !isAltaConfianca && !isConfiavel && (
                <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full border leading-tight", secondaryBadges[0]!.cls)}>
                  {secondaryBadges[0]!.label}
                </span>
              )}
            </div>

            {/* Suspeita — community validation notice */}
            {isSuspect && (
              <p className="text-[10px] text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg px-2 py-1 leading-tight">
                Esta oferta ainda precisa de confirmações da comunidade
              </p>
            )}

            {/* Product name — intelligent brand/produto hierarchy */}
            {(() => {
              const { primary, secondary } = getProductDisplay(oferta.produto, oferta.marca, oferta.categoria);
              return (
                <>
                  <p className="font-black text-[15px] text-slate-900 leading-none line-clamp-1">{primary}</p>
                  {secondary && <p className="text-[11px] text-slate-500 leading-tight line-clamp-1">{secondary}</p>}
                </>
              );
            })()}

            {/* Mercado + location */}
            <div className="flex items-center gap-1 text-xs text-slate-500 flex-wrap">
              <Store className="h-3 w-3 shrink-0 text-slate-400" />
              <span className="font-semibold text-slate-700 truncate">{oferta.mercado}</span>
              {(oferta.bairro || oferta.cidade) && (
                <>
                  <span className="text-slate-300">·</span>
                  <span className="text-slate-400 truncate">
                    {oferta.bairro ?? oferta.cidade}
                  </span>
                </>
              )}
              {oferta.distancia != null && (
                <span className={cn("font-bold ml-auto shrink-0", oferta.distancia < 1.5 ? "text-[#B8900E]" : oferta.distancia < 5 ? "text-amber-600" : "text-slate-400")}>
                  📍 {oferta.distancia.toFixed(1)} km
                </span>
              )}
            </div>

            {/* BIG price — green for active, red for expired */}
            <div className="flex items-baseline gap-1">
              <div
                className="text-[28px] font-black leading-none tracking-tight"
                style={{ color: expired ? "#DC2626" : isSuspect ? "#A16207" : "#16A34A" }}
              >
                {R(oferta.preco)}
              </div>
              {oferta.unidade && oferta.unidade !== "un" && (
                <span className="text-[13px] font-bold" style={{ color: expired ? "#DC2626" : isSuspect ? "#A16207" : "#16A34A", opacity: 0.75 }}>
                  /{oferta.unidade}
                </span>
              )}
            </div>

            {/* Urgency / expiry */}
            {validadeDate && isExpiringSoon && !isPast(validadeDate) && (
              <p className="text-[10px] font-bold text-orange-600 flex items-center gap-1">
                <Clock className="h-3 w-3" /> Últimas horas!
              </p>
            )}

            {/* Footer: social proof + time + poster level */}
            <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
              <span className="flex items-center gap-0.5">
                <Heart className="h-3 w-3" /> {oferta.curtidas}
              </span>
              <span className="flex items-center gap-0.5 text-green-600">
                <CheckCircle className="h-3 w-3" /> {oferta.validacoes}
              </span>
              {/* Community confirmations — highlight if notable */}
              {(oferta.confirmacoes ?? 0) > 0 && (
                <span className={cn(
                  "flex items-center gap-0.5 font-semibold",
                  (oferta.confirmacoes ?? 0) >= 3 ? "text-[#F2C14E]" : "text-slate-400"
                )}>
                  <Users className="h-3 w-3" />
                  {oferta.confirmacoes}
                  {(oferta.confirmacoes ?? 0) >= 3 && " ✓"}
                </span>
              )}
              {oferta.denuncias > 0 && (
                <span className="flex items-center gap-0.5 text-red-400">
                  <AlertTriangle className="h-3 w-3" /> {oferta.denuncias}
                </span>
              )}
              <span className="flex items-center gap-0.5 font-medium text-slate-500">
                {NIVEL_EMOJI[oferta.nivelUsuario ?? "Estagiário da Economia"] ?? "🎒"}{" "}
                {oferta.usuario?.split(" ")[0]}
              </span>
              <span className="ml-auto flex items-center gap-0.5 font-medium text-slate-400">
                <Clock className="h-3 w-3" />
                {tempoPostado(oferta.dataCriacao)}
              </span>
            </div>
          </div>
        </div>

        {/* Community warning banners */}
        {isCommunityClose && (
          <div className="mx-4 mb-2 flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>A comunidade indicou que esta oferta não está mais disponível.</span>
          </div>
        )}
        {isSuspect && !isCommunityClose && (
          <div className="mx-4 mb-2 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>Usuários indicaram que este produto pode estar indisponível. Confirme antes de ir.</span>
          </div>
        )}

        {/* Community social proof banner — shows for high-engagement offers */}
        {!isSuspect && !expired && totalEngajamento >= 5 && (
          <div className="mx-4 mb-2 flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold"
               style={{ background: "#DCFCE7", color: "#15803D", border: "1px solid #BBF7D0" }}>
            <Users className="h-3 w-3" />
            {totalEngajamento} pessoas confirmaram este preço
          </div>
        )}

        {/* Hot offer indicator */}
        {isHotOffer && !isSuspect && !expired && totalEngajamento < 5 && (
          <div className="mx-4 mb-2 flex items-center gap-1.5 bg-orange-50 border border-orange-200 rounded-xl px-3 py-1.5 text-xs text-orange-700 font-semibold">
            <Flame className="h-3 w-3 text-orange-500" />
            Muito validada hoje — preço confiável!
          </div>
        )}

        {/* 🔄 Renovar banner — só para o dono quando expirando/expirada */}
        {podeRenovar && (
          <div className="mx-4 mb-2 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold bg-amber-50 border border-amber-200 text-amber-700">
            <span>⏰</span>
            <span className="flex-1">
              {expired ? "Sua oferta expirou." : "Sua oferta está expirando."}
              {" "}<strong>{renovacoesRestantes}x</strong> renovação{renovacoesRestantes !== 1 ? "ões" : ""} restante{renovacoesRestantes !== 1 ? "s" : ""}.
            </span>
            <button
              onClick={handleRenovar}
              disabled={renovarMutation.isPending}
              className="shrink-0 bg-amber-500 text-white text-xs font-bold px-2.5 py-1 rounded-lg active:scale-95 transition-all disabled:opacity-50"
            >
              {renovarMutation.isPending ? "..." : "🔄 Renovar"}
            </button>
          </div>
        )}

        {/* Action row — 4 compact icons */}
        <div className="flex items-center gap-2 px-4 pb-4">
          {/* ❤ Curtir */}
          <motion.button
            onClick={handleLike}
            disabled={likeMutation.isPending}
            animate={likeAnimating ? { scale: [1, 1.38, 0.92, 1] } : {}}
            transition={{ duration: 0.38, ease: "easeInOut" }}
            onAnimationComplete={() => setLikeAnimating(false)}
            className={cn(
              "flex items-center gap-1.5 h-10 px-3 rounded-2xl border text-xs font-bold transition-colors active:scale-95",
              likeAnimating
                ? "bg-red-50 border-red-300 text-red-500"
                : "bg-gray-50 border-gray-200 text-slate-500 hover:bg-red-50 hover:border-red-200 hover:text-red-500",
              likeMutation.isPending && "opacity-50 cursor-not-allowed",
            )}
          >
            <motion.span
              animate={likeAnimating ? { color: "#ef4444" } : {}}
              transition={{ duration: 0.2 }}
            >
              <Heart className="h-4 w-4" />
            </motion.span>
            {oferta.curtidas > 0 && <span>{oferta.curtidas}</span>}
          </motion.button>

          {/* ✔ Confirmar — gold CTA (V3 design) */}
          <button
            onClick={handleValidar}
            disabled={validarMutation.isPending || expired}
            className={cn(
              "flex-1 h-10 rounded-2xl flex items-center justify-center gap-1.5 text-[13px] font-black transition-all active:scale-95",
              expired || isSuspect
                ? "bg-gray-100 text-gray-400 border border-gray-200"
                : "text-[#111827]",
              validarMutation.isPending && "opacity-60",
            )}
            style={(!expired && !isSuspect) ? {
              background: "linear-gradient(135deg, #F2C14E 0%, #E6A817 100%)",
              boxShadow: "0 3px 10px rgba(242,193,78,0.35)",
            } : undefined}
          >
            <CheckCircle className="h-3.5 w-3.5" />
            <span>{expired ? "Expirada" : isSuspect ? "Verificar" : "Confirmar preço"}</span>
            {!expired && oferta.validacoes > 0 && (
              <span className={cn(
                "px-1.5 py-0.5 rounded-full text-[10px] font-black",
                isSuspect ? "bg-red-100 text-red-600" : "bg-black/10",
              )}>
                {oferta.validacoes}
              </span>
            )}
          </button>

          {/* 💬 Comentários */}
          <button
            onClick={(e) => { e.stopPropagation(); setCommentsOpen(true); }}
            title="Comentários"
            className="h-10 w-10 flex items-center justify-center rounded-2xl border border-gray-200 text-slate-400 hover:text-violet-600 hover:border-violet-300 hover:bg-violet-50 active:scale-95 transition-all shrink-0"
          >
            <MessageCircle className="h-4 w-4" />
          </button>

          {/* ↗ Compartilhar */}
          <button
            onClick={handleShare}
            title="Compartilhar"
            className="h-10 w-10 flex items-center justify-center rounded-2xl border border-gray-200 text-slate-400 hover:text-blue-500 hover:border-blue-300 hover:bg-blue-50 active:scale-95 transition-all shrink-0"
          >
            <Share2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <CommentsBottomSheet
        ofertaId={oferta.id}
        ofertaNome={oferta.produto}
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
      />
    </motion.div>
  );
}
