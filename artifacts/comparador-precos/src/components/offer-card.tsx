import { format, isPast, differenceInMinutes, differenceInHours, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQueryClient } from "@tanstack/react-query";
import { MapPin, ThumbsUp, CheckCircle, AlertTriangle, Store, Clock, Flame, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Oferta, useLikeOferta, useValidarOferta, useDenunciarOferta, getListOfertasQueryKey,
} from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { getCurrentUser } from "@/lib/current-user";
import { useLoginPrompt } from "@/lib/login-prompt";

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
  // Current levels
  Iniciante: "🌱", Explorador: "🔍", Caçador: "🎯",
  Especialista: "⭐", Mestre: "🏆", Lenda: "💎",
  // Legacy fallbacks
  Bronze: "🟤", Prata: "⚪", Ouro: "🟡", Diamante: "💎",
};

export function OfferCard({ oferta, index }: OfferCardProps) {
  const queryClient       = useQueryClient();
  const { requireLogin }  = useLoginPrompt();
  const likeMutation      = useLikeOferta();
  const validarMutation   = useValidarOferta();
  const denunciarMutation = useDenunciarOferta();

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

  const handleLike      = () => requireLogin(doLike);
  const handleValidar   = () => requireLogin(doValidar);
  const handleDenunciar = () => requireLogin(doDenunciar);

  const expired        = oferta.status === "expirada";
  const isSuspect      = oferta.status === "suspeita" || oferta.denuncias >= 3;
  const mins           = differenceInMinutes(new Date(), new Date(oferta.dataCriacao));
  const isVeryRecent   = mins < 30;
  const isRecent       = mins < 120;
  const confirmadoHoje = ehHoje(oferta.ultimaValidacaoEm);
  const isHotOffer     = confirmadoHoje && oferta.validacoes >= 3;
  const validadeDate   = oferta.validade ? new Date(oferta.validade) : null;
  const isExpiringSoon =
    validadeDate && !isPast(validadeDate) &&
    validadeDate.getTime() - Date.now() < 2 * 24 * 60 * 60 * 1000;

  // Trust signal: primary status badge
  type Badge = { label: string; cls: string };
  const statusBadge: Badge = (() => {
    if (expired)     return { label: "⚫ Expirada",          cls: "bg-gray-100 text-gray-500 border-gray-200" };
    if (isSuspect)   return { label: "🔴 Suspeita",          cls: "bg-red-50 text-red-700 border-red-200" };
    if (isHotOffer)  return { label: "🔥 Em alta hoje",      cls: "bg-orange-50 text-orange-700 border-orange-200" };
    if (confirmadoHoje) return { label: "✅ Confirmado hoje", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    if (oferta.status === "validada") return { label: "🟢 Validado",   cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    if (isVeryRecent) return { label: "⚡ Recém postado",   cls: "bg-blue-50 text-blue-700 border-blue-200" };
    return { label: "🟡 Novo",                                cls: "bg-amber-50 text-amber-700 border-amber-200" };
  })();

  // Secondary tags (compact)
  const secondaryBadges: Badge[] = [];
  if (!expired && !isSuspect) {
    if (isRecent && !isVeryRecent && !confirmadoHoje) {
      secondaryBadges.push({ label: "Recente", cls: "bg-blue-50 text-blue-600 border-blue-100" });
    }
    if (oferta.validacoes >= 2 && !confirmadoHoje) {
      secondaryBadges.push({ label: `${oferta.validacoes} mercados validaram`, cls: "bg-slate-50 text-slate-600 border-slate-200" });
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
          isSuspect && "border-red-200 bg-red-50/30",
          expired && "opacity-60",
          !isSuspect && !expired && "border-transparent",
        )}
        style={{ boxShadow: isSuspect ? "none" : "0 2px 16px rgba(0,0,0,0.09)" }}
      >
        <div className="flex gap-3.5 p-4 pb-3">
          {/* Left: image */}
          <div className="shrink-0 w-[72px] h-[72px] rounded-2xl overflow-hidden bg-slate-50 border border-slate-100 flex items-center justify-center">
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
            {/* Primary badge */}
            <div className="flex flex-wrap items-center gap-1">
              <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border leading-tight", statusBadge.cls)}>
                {statusBadge.label}
              </span>
              {secondaryBadges.length > 0 && (
                <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full border leading-tight", secondaryBadges[0].cls)}>
                  {secondaryBadges[0].label}
                </span>
              )}
            </div>

            {/* Product name */}
            <h3 className="font-black text-[15px] text-slate-900 leading-tight line-clamp-1">{oferta.produto}</h3>

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
                <span className={cn("font-bold ml-auto shrink-0", oferta.distancia < 1.5 ? "text-emerald-600" : oferta.distancia < 5 ? "text-amber-600" : "text-slate-400")}>
                  📍 {oferta.distancia.toFixed(1)} km
                </span>
              )}
            </div>

            {/* BIG price — maximum visual priority */}
            <div className="flex items-baseline gap-1.5">
              <div
                className="text-[30px] font-black leading-none tracking-tight"
                style={{ color: isSuspect ? "#b91c1c" : "#059669" }}
              >
                {R(oferta.preco)}
              </div>
              {oferta.categoria && (
                <span className="text-[11px] text-slate-400 font-medium">{oferta.categoria}</span>
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
                <ThumbsUp className="h-3 w-3" /> {oferta.curtidas}
              </span>
              <span className="flex items-center gap-0.5 text-emerald-500">
                <CheckCircle className="h-3 w-3" /> {oferta.validacoes}
              </span>
              {oferta.denuncias > 0 && (
                <span className="flex items-center gap-0.5 text-red-400">
                  <AlertTriangle className="h-3 w-3" /> {oferta.denuncias}
                </span>
              )}
              <span className="flex items-center gap-0.5 font-medium text-slate-500">
                {NIVEL_EMOJI[oferta.nivelUsuario ?? "Iniciante"] ?? "🌱"}{" "}
                {oferta.usuario?.split(" ")[0]}
              </span>
              <span className="ml-auto flex items-center gap-0.5 font-medium text-slate-400">
                <Clock className="h-3 w-3" />
                {tempoPostado(oferta.dataCriacao)}
              </span>
            </div>
          </div>
        </div>

        {/* Suspect warning banner */}
        {isSuspect && !expired && (
          <div className="mx-4 mb-2 flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>Preço denunciado por usuários. Confirme antes de ir ao mercado.</span>
          </div>
        )}

        {/* Hot offer indicator */}
        {isHotOffer && !isSuspect && !expired && (
          <div className="mx-4 mb-2 flex items-center gap-1.5 bg-orange-50 border border-orange-200 rounded-xl px-3 py-1.5 text-xs text-orange-700 font-semibold">
            <Flame className="h-3 w-3 text-orange-500" />
            Muito validada hoje — preço confiável!
          </div>
        )}

        {/* Action row */}
        <div className="flex gap-2 px-4 pb-4">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-9 rounded-2xl text-xs font-bold gap-1 border-slate-200 text-slate-500 hover:border-emerald-300 hover:text-emerald-700 hover:bg-emerald-50 active:scale-95 transition-all"
            onClick={handleLike}
            disabled={likeMutation.isPending}
          >
            <ThumbsUp className="h-3.5 w-3.5" />
            {oferta.curtidas > 0 ? oferta.curtidas : "Curtir"}
          </Button>

          <Button
            size="sm"
            className="flex-[2] h-9 rounded-2xl text-xs font-bold gap-1 shadow-none active:scale-95 transition-all"
            style={
              expired || isSuspect
                ? { background: "#e2e8f0", color: "#64748b" }
                : { background: "linear-gradient(135deg,#059669,#10b981)", color: "white" }
            }
            onClick={handleValidar}
            disabled={validarMutation.isPending || expired}
          >
            <CheckCircle className="h-3.5 w-3.5" />
            {expired ? "Expirada" : isSuspect ? "Verificar preço" : "Confirmar preço"}
            {!expired && (
              <span className={cn(
                "px-1.5 py-0.5 rounded-full text-[10px] font-black",
                isSuspect ? "bg-red-100 text-red-600" : "bg-white/25"
              )}>
                {oferta.validacoes}
              </span>
            )}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="w-9 h-9 rounded-2xl text-slate-400 hover:text-red-500 hover:bg-red-50 px-0 shrink-0 active:scale-95 transition-all"
            title="Denunciar preço incorreto"
            onClick={handleDenunciar}
            disabled={denunciarMutation.isPending}
          >
            <AlertTriangle className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
