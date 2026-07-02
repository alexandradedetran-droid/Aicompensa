import { useState, useMemo, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  MapPin, Store, ChevronRight, TrendingDown, Users, Flame, Heart,
  Bell, ShieldCheck, Navigation, Loader2, CheckCircle, ShoppingCart, BarChart2, Share2,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { usePush } from "@/hooks/use-push";
import {
  useGetStats, getGetStatsQueryKey,
  useListOfertas, getListOfertasQueryKey,
  useGetAlertaMatches, getGetAlertaMatchesQueryKey,
  useGetEconomiaDiaria, getGetEconomiaDiariaQueryKey,
  useGetTrending, getGetTrendingQueryKey,
  useValidarOferta, useLikeOferta, useDenunciarOferta,
  useGetMercadosPatrocinadosFeed,
  getGetMercadosPatrocinadosFeedQueryKey,
  useRegistrarImpressaoMercado,
  useRegistrarCliqueMercado,
  type Oferta,
  type MercadoFeed,
} from "@workspace/api-client-react";
import { isToday, differenceInMinutes } from "date-fns";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getCurrentUser } from "@/lib/current-user";
import { useLayout } from "@/components/layout-context";
import { useLoginPrompt } from "@/lib/login-prompt";
import { MapModal } from "@/components/map-modal";
import { OfertaModal, CATEGORY_CONFIG, getCategoryUnit, hasPesoVolumeNoNome } from "@/components/oferta-modal";
import { ComparacaoModal } from "@/components/comparacao-modal";
import { groupOfertas, type GrupoOferta } from "@/lib/group-ofertas";
import { getProductDisplay } from "@/lib/visual-priority";
import { RadarSection } from "@/components/radar-section";
import { loadCoords, saveCoords, calculateDistanceKm } from "@/lib/distance";
import { toast } from "sonner";
import { useSeo } from "@/lib/seo";
import { OfferSourceBadge } from "@/components/OfferSourceBadge";

// ── Helpers ───────────────────────────────────────────────────────────────────

const R = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

/** Extracts the error message from an API error response. */
function apiErr(err: unknown): string {
  const data = (err as { data?: { error?: string } } | undefined)?.data;
  return data?.error ?? "Erro inesperado. Tente novamente.";
}

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
  onPublicar,
  economiaTotal,
}: {
  coords: { lat: number; lng: number } | null;
  isLocating: boolean;
  onLocate: () => void;
  onPublicar: () => void;
  economiaTotal?: number;
}) {
  const h = new Date().getHours();
  const text  = h < 12 ? "Bom dia"  : h < 18 ? "Boa tarde"  : "Boa noite";
  const emoji = h < 12 ? "☀️"       : h < 18 ? "🌤️"         : "🌙";
  const { notifCount, setNotifOpen, isAdmin } = useLayout();
  const currentUser = getCurrentUser();
  const firstName = currentUser?.nome?.split(" ")[0] ?? null;
  const Fmt = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

  return (
    <div className="px-4 pt-5 pb-3">
      {/* Top row: greeting + controls */}
      <div className="flex items-start gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-[#6B7280] text-[10px] font-semibold uppercase tracking-[0.15em] mb-1">
            {emoji} {text}
          </p>
          <h1 className="text-[#111827] font-black text-[18px] leading-snug">
            {firstName ? `Olá, ${firstName}!` : <>Descubra onde<br />realmente compensa</>}
          </h1>
        </div>
        <div className="flex items-center gap-1.5 mt-1 shrink-0">
          {/* Localizar */}
          <button
            onClick={onLocate}
            disabled={isLocating}
            className={`flex items-center gap-1.5 rounded-xl px-2.5 text-[11px] font-medium border transition-all ${
              coords
                ? "border-[#F2C14E] text-[#92610A]"
                : "border-[#E5E7EB] text-[#6B7280] hover:border-[#D1D5DB]"
            }`}
            style={{ background: coords ? "#FFFBEB" : "#F9FAFB", minHeight: "44px" }}
          >
            {isLocating ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <MapPin className={`h-3 w-3 ${coords ? "text-[#F2C14E]" : "text-[#9CA3AF]"}`} />
            )}
            {coords ? "Localizado" : "Localizar"}
          </button>

          {/* Bell — only for logged-in users */}
          {currentUser && (
            <button
              onClick={() => setNotifOpen(true)}
              className="relative flex items-center justify-center rounded-xl transition-all active:scale-90"
              style={{
                minHeight: "44px",
                minWidth: "44px",
                background: "#F3F4F6",
                border: "1px solid #E5E7EB",
              }}
              aria-label="Notificações"
            >
              <Bell
                className={`h-[17px] w-[17px] transition-colors ${notifCount > 0 ? "text-[#F2C14E]" : "text-[#6B7280]"}`}
              />
              {notifCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] bg-red-500 text-white text-[8px] font-black rounded-full flex items-center justify-center px-0.5 leading-none">
                  {notifCount > 9 ? "9+" : notifCount}
                </span>
              )}
            </button>
          )}

          {/* Admin shield */}
          {isAdmin && (
            <Link href="/admin">
              <button
                className="flex items-center justify-center rounded-xl transition-all active:scale-90"
                style={{
                  minHeight: "44px",
                  minWidth: "44px",
                  background: "#FFFBEB",
                  border: "1px solid #FDE68A",
                }}
                aria-label="Painel Admin"
              >
                <ShieldCheck className="h-[17px] w-[17px]" style={{ color: "#F2C14E" }} />
              </button>
            </Link>
          )}
        </div>
      </div>

      {/* ── Live activity pill (V3) — replaces "Comunidade Economizou" ── */}
      <div className="flex items-center justify-between mb-3">
        <div
          className="flex items-center gap-2 rounded-2xl px-4 py-2.5"
          style={{ background: "#F0FDF4", border: "1.5px solid #BBF7D0" }}
        >
          <span className="text-[11px] font-bold text-[#16A34A] flex items-center gap-1.5">
            <span
              style={{
                display: "inline-block",
                width: 6, height: 6,
                background: "#16A34A",
                borderRadius: "50%",
                animation: "live-pulse 1.5s infinite",
              }}
            />
            AO VIVO
          </span>
          <span className="text-[20px] font-black text-[#111827] leading-none">
            {economiaTotal != null && economiaTotal > 0
              ? Fmt(economiaTotal)
              : "Ofertas ao vivo"}
          </span>
          <span className="text-[11px] text-[#6B7280] font-medium">
            {economiaTotal != null && economiaTotal > 0
              ? "economizados esse mês"
              : "perto de você"}
          </span>
        </div>
      </div>

      {/* ── CTAs ── */}
      <div className="flex flex-col gap-2">
        {/* Primário: Ver ofertas */}
        <Link href="/ofertas">
          <motion.div
            whileTap={{ scale: 0.97 }}
            transition={{ type: "spring", stiffness: 500, damping: 28 }}
            className="w-full flex items-center justify-between rounded-2xl px-4 py-3 cursor-pointer"
            style={{
              background: "linear-gradient(135deg, #d4ff40 0%, #F2C14E 45%, #F2C14E 100%)",
              boxShadow:
                "0 4px 18px rgba(242,193,78,0.28), 0 1px 4px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.25)",
            }}
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <span
                className="flex items-center justify-center rounded-full shrink-0 text-base"
                style={{
                  width: "30px",
                  height: "30px",
                  background: "rgba(0,0,0,0.15)",
                  boxShadow: "inset 0 1px 2px rgba(0,0,0,0.18)",
                }}
              >
                🔍
              </span>
              <div className="text-left leading-none flex-1 min-w-0">
                <p className="font-black text-[13px]" style={{ color: "#111827" }}>
                  Ver ofertas perto de mim
                </p>
                <p className="text-[11px] font-semibold mt-[3px] truncate" style={{ color: "#92400E" }}>
                  {coords ? "Com base na sua localização" : "Ofertas confirmadas pela comunidade"}
                </p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "#111827" }} />
          </motion.div>
        </Link>

        {/* Secundário: Publicar */}
        <motion.button
          type="button"
          onClick={onPublicar}
          whileTap={{ scale: 0.97 }}
          transition={{ type: "spring", stiffness: 500, damping: 28 }}
          className="w-full flex items-center justify-between rounded-2xl px-4 py-2.5 active:brightness-95 transition-[filter]"
          style={{
            background: "#fff",
            border: "1.5px solid #E5E7EB",
          }}
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <span className="text-base shrink-0">📸</span>
            <div className="text-left leading-none flex-1 min-w-0">
              <p className="font-bold text-[13px] text-[#111827]">Publicar oferta</p>
              <p className="text-[11px] font-medium mt-[3px] truncate text-[#6B7280]">
                Encontrou uma promoção? · <span className="text-[#F2C14E] font-bold">+10 pts</span>
              </p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-[#9CA3AF]" />
        </motion.button>
      </div>
    </div>
  );
}

// ── Smart carousel: scoring & badges ─────────────────────────────────────────

const ESSENTIAL_KW = [
  "arroz","feijao","cafe","leite","carne","frango","ovo","oleo","acucar",
  "papel higienico","fralda","queijo","manteiga","margarina","pao",
];
const MEDIUM_KW = [
  "refrigerante","detergente","shampoo","bolacha","biscoito","sabao",
  "limpeza","iogurte","suco","achocolatado","molho","macarrao",
];

function norm(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function productWeight(produto: string): number {
  const n = norm(produto);
  if (ESSENTIAL_KW.some((kw) => n.includes(kw))) return 40;
  if (MEDIUM_KW.some((kw) => n.includes(kw)))    return 24;
  return 8;
}

function carouselScore(
  o: Oferta,
  avgPreco: number | null,
  coords: { lat: number; lng: number } | null,
): number {
  let s = productWeight(o.produto);

  // Admin-highlighted offers always float to the top
  if (o.destacada && !o.patrocinada) s += 1000;

  // Economy %: up to +30
  if (avgPreco && avgPreco > o.preco) {
    s += Math.min(30, Math.round(((avgPreco - o.preco) / avgPreco) * 100));
  }

  // Proximity: up to +20
  if (o.distancia != null) {
    if      (o.distancia < 1)  s += 20;
    else if (o.distancia < 3)  s += 15;
    else if (o.distancia < 5)  s += 10;
    else if (o.distancia < 10) s += 5;
  } else if (!coords) {
    s += 8; // neutral when location unavailable
  }

  // Recency: up to +15
  const ageH = (Date.now() - new Date(o.dataCriacao).getTime()) / 3_600_000;
  s += ageH < 2 ? 15 : ageH < 6 ? 10 : ageH < 24 ? 5 : 0;

  // Engagement (confirmações + validações + curtidas): up to +25
  s += Math.min(25, o.confirmacoes * 5 + o.validacoes * 3 + o.curtidas);

  // Author reliability: up to +10
  s += Math.min(10, (o.authorReliability ?? 0) / 10);

  return s;
}

type CarouselBadge = { emoji: string; label: string; color: string; bg: string };

function pickBadge(
  o: Oferta,
  flags: { isClosest: boolean; isMostConfirmed: boolean; isBestPrice: boolean },
): CarouselBadge {
  // Admin-highlighted offer — always show destaque badge
  if (o.destacada && !o.patrocinada)
    return { emoji: "⭐", label: "Destaque",          color: "#facc15", bg: "rgba(250,204,21,0.18)"  };

  const ageH = (Date.now() - new Date(o.dataCriacao).getTime()) / 3_600_000;
  if (ageH < 2)
    return { emoji: "⚡", label: "Recém postado",   color: "#fcd34d", bg: "rgba(252,211,77,0.16)"  };
  if (flags.isMostConfirmed && o.confirmacoes >= 3)
    return { emoji: "✅", label: "Mais confirmado",  color: "#34d399", bg: "rgba(52,211,153,0.14)" };
  if (flags.isBestPrice)
    return { emoji: "🏆", label: "Melhor preço",    color: "#F2C14E", bg: "rgba(242,193,78,0.14)" };
  if (o.confirmacoes + o.validacoes >= 5)
    return { emoji: "🔥", label: "Bombando",         color: "#fb923c", bg: "rgba(251,146,60,0.14)"  };
  if (flags.isClosest && o.distancia != null)
    return { emoji: "📍", label: "Mais perto",      color: "#a78bfa", bg: "rgba(167,139,250,0.14)" };
  return   { emoji: "🏷️", label: "Oferta ativa",   color: "#94a3b8", bg: "rgba(148,163,184,0.12)" };
}

// ── Hot offer card (carousel item) ───────────────────────────────────────────

function HotOfferCard({
  oferta,
  avgPreco,
  badge,
  onClick,
}: {
  oferta: Oferta;
  avgPreco: number | null;
  badge: CarouselBadge;
  onClick: () => void;
}) {
  const savings    = avgPreco && avgPreco > oferta.preco ? avgPreco - oferta.preco : null;
  const savingsPct = savings && avgPreco ? Math.round((savings / avgPreco) * 100) : null;

  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="shrink-0 flex flex-col overflow-hidden cursor-pointer"
      style={{
        width: "78vw",
        maxWidth: 300,
        borderRadius: 22,
        background: "#fff",
        border: oferta.destacada && !oferta.patrocinada
          ? "2px solid #F2C14E"
          : "1px solid #E5E7EB",
        boxShadow: oferta.destacada && !oferta.patrocinada
          ? "0 4px 24px rgba(242,193,78,0.20), 0 2px 10px rgba(0,0,0,0.06)"
          : "0 4px 16px rgba(0,0,0,0.08)",
      }}
    >
      {/* Photo */}
      <div className="relative w-full overflow-hidden shrink-0" style={{ height: 140 }}>
        {(oferta.imagemExibicao ?? oferta.fotoUrl) ? (
          <img
            src={(oferta.imagemExibicao ?? oferta.fotoUrl)!}
            alt={oferta.produto}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ background: "linear-gradient(135deg,#f3f4f6,#e5e7eb)" }}>
            <span style={{ fontSize: 40 }}>🛒</span>
          </div>
        )}
        {/* Bottom gradient */}
        <div
          className="absolute inset-x-0 bottom-0 pointer-events-none"
          style={{ height: 50, background: "linear-gradient(to top, rgba(0,0,0,0.55), transparent)" }}
        />
        {/* Badge */}
        <div className="absolute top-2.5 left-2.5 flex flex-col gap-1">
          <span
            className="flex items-center gap-1 text-[10px] font-black px-2 py-[3px] rounded-full backdrop-blur-sm"
            style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.color}33` }}
          >
            {badge.emoji} {badge.label}
          </span>
          {["Bebidas", "Alimentos", "Carnes", "Hortifruti"].includes(oferta.categoria) && (
            <span
              className="flex items-center gap-1 text-[9px] font-black px-1.5 py-[2px] rounded-full backdrop-blur-sm"
              style={{ background: "rgba(34,197,94,0.18)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.3)" }}
            >
              ⚽ Oferta da Copa
            </span>
          )}
        </div>
        {/* Distance pill */}
        {oferta.distancia != null && (
          <div className="absolute bottom-2 right-2.5">
            <span className="text-[9px] font-bold text-white/80 flex items-center gap-0.5">
              <MapPin style={{ width: 9, height: 9 }} className="shrink-0" />
              {oferta.distancia.toFixed(1)} km
            </span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-col gap-1 px-3 pt-2.5 pb-3">
        {(() => {
          const { primary, secondary } = getProductDisplay(oferta.produto, oferta.marca, oferta.categoria);
          return (
            <>
              <p className="text-[#111827] font-black text-sm leading-tight line-clamp-1">{primary}</p>
              {secondary && <p className="text-[#6B7280] text-[10px] leading-tight line-clamp-1 -mt-0.5">{secondary}</p>}
            </>
          );
        })()}
        <div className="flex items-center gap-2 mt-1">
          <OfferSourceBadge mercadoNome={(oferta as any).mercadoNome ?? oferta.mercado} mercadoLogoUrl={(oferta as any).mercadoLogoUrl} usuarioNome={(oferta as any).usuarioNome ?? (oferta as any).autorNome ?? oferta.usuario} size="sm" />
          {oferta.bairro && <p className="text-[#6B7280] text-[11px] font-medium truncate">{oferta.bairro}</p>}
        </div>
        <div className="flex items-end justify-between mt-1.5">
          <div>
            <span className="text-[#16A34A] font-black text-xl leading-none">{R(oferta.preco)}</span>
            {savingsPct != null && savingsPct >= 5 && (
              <p className="text-[9px] text-[#15803D] font-semibold mt-0.5 leading-none truncate">
                -{savingsPct}% · economize {R(savings!)}
              </p>
            )}
          </div>
          {(oferta.confirmacoes > 0 || oferta.validacoes > 0) && (
            <span className="text-[9px] text-[#6B7280] font-semibold flex items-center gap-0.5 pb-0.5">
              <CheckCircle style={{ width: 9, height: 9, color: "#16A34A" }} />
              {oferta.confirmacoes + oferta.validacoes}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ── Featured best offer card ──────────────────────────────────────────────────

function FeaturedOfferCard({
  oferta,
  avgPreco,
  onDetail,
}: {
  oferta: Oferta;
  avgPreco: number | null;
  onDetail: () => void;
}) {
  const savings    = avgPreco && avgPreco > oferta.preco ? avgPreco - oferta.preco : null;
  const savingsPct = savings && avgPreco ? Math.round((savings / avgPreco) * 100) : null;
  const { primary, secondary } = getProductDisplay(oferta.produto, oferta.marca, oferta.categoria);
  const totalConf = oferta.confirmacoes + oferta.validacoes;

  return (
    <motion.div
      whileTap={{ scale: 0.98 }}
      onClick={onDetail}
      className="rounded-[22px] overflow-hidden cursor-pointer"
      style={{
        background: "#fff",
        boxShadow: "0 8px 32px rgba(0,0,0,.11)",
      }}
    >
      {/* Photo — 200px hero with price overlay */}
      <div
        className="relative w-full overflow-hidden"
        style={{ height: (oferta.imagemExibicao ?? oferta.fotoUrl) ? 200 : 100 }}
      >
        {(oferta.imagemExibicao ?? oferta.fotoUrl) ? (
          <img
            src={(oferta.imagemExibicao ?? oferta.fotoUrl)!}
            alt={oferta.produto}
            loading="lazy"
            className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ background: "#F3F4F6" }}>
            <span style={{ fontSize: 64 }}>🛒</span>
          </div>
        )}
        {/* Dark overlay for text readability */}
        <div className="absolute inset-x-0 bottom-0" style={{ height: "60%", background: "linear-gradient(to top, rgba(0,0,0,0.80), transparent)" }} />

        {/* Confirmation badge */}
        {totalConf >= 3 && (
          <div
            className="absolute top-3 left-3 flex items-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-full"
            style={{ background: "#F2C14E", color: "#111827" }}
          >
            ⭐ Super Confirmada · {totalConf}×
          </div>
        )}

        {/* Distance */}
        {oferta.distancia != null && (
          <div
            className="absolute top-3 right-3 flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full"
            style={{ background: "rgba(0,0,0,0.45)", color: "#fff", backdropFilter: "blur(6px)" }}
          >
            <MapPin className="h-2.5 w-2.5" />
            {oferta.distancia < 1 ? `${Math.round(oferta.distancia * 1000)}m` : `${oferta.distancia.toFixed(1)} km`}
          </div>
        )}

        {/* Price overlay */}
        <div className="absolute bottom-3 left-4" style={{ zIndex: 2 }}>
          <div
            className="font-black leading-none tracking-tight"
            style={{ fontSize: 48, color: "#fff", letterSpacing: "-2px", textShadow: "0 4px 16px rgba(0,0,0,.4)" }}
          >
            {R(oferta.preco)}
          </div>
          {savingsPct != null && savingsPct >= 5 && (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs font-black px-2 py-0.5 rounded-lg" style={{ background: "#22C55E", color: "#fff" }}>
                -{savingsPct}%
              </span>
              <span className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.80)" }}>
                economize {R(savings!)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-4">
        <p className="text-[#111827] font-black text-[17px] leading-tight line-clamp-1">{primary}</p>
        {secondary && <p className="text-[#6B7280] text-xs leading-tight line-clamp-1 mt-0.5">{secondary}</p>}
        <div className="flex items-center gap-2 mt-1 mb-3">
          <OfferSourceBadge mercadoNome={(oferta as any).mercadoNome ?? oferta.mercado} mercadoLogoUrl={(oferta as any).mercadoLogoUrl} usuarioNome={(oferta as any).usuarioNome ?? (oferta as any).autorNome ?? oferta.usuario} size="sm" />
          {oferta.bairro && <p className="text-[#6B7280] text-[12px] font-medium truncate">{oferta.bairro}</p>}
        </div>

        <div className="flex gap-2">
          {/* Gold confirm button */}
          <button
            onClick={(e) => { e.stopPropagation(); onDetail(); }}
            className="flex-1 flex items-center justify-center gap-1.5 font-black text-[14px] h-12 rounded-[14px] active:scale-95 transition-all"
            style={{
              background: "linear-gradient(135deg,#F2C14E,#E6A817)",
              color: "#111827",
              boxShadow: "0 4px 12px rgba(242,193,78,.35)",
            }}
          >
            <CheckCircle className="h-4 w-4" />
            Confirmar preço
          </button>
          <a
            href={rotaUrl(oferta)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center justify-center gap-1 text-[13px] font-bold h-12 px-4 rounded-[14px] active:scale-95 transition-all"
            style={{ background: "#F3F4F6", color: "#374151", border: "1px solid #E5E7EB" }}
          >
            <Navigation className="h-3.5 w-3.5" />
            Rota
          </a>
        </div>
      </div>
    </motion.div>
  );
}

// ── Produto em alta card ───────────────────────────────────────────────────────

const PRODUTO_ALTA_EMOJI: Record<string, string> = {
  Alimentos: "🍚", Bebidas: "🧃", Limpeza: "🧹", Carnes: "🥩",
  Higiene: "🪥", Hortifruti: "🥦", Padaria: "🍞", Laticínios: "🧀",
  Congelados: "❄️", Pet: "🐾", Outros: "📦",
};

function ProdutoEmAltaCard({
  produto,
  categoria,
  engagement,
  onPress,
}: {
  produto: string;
  categoria: string;
  engagement: number;
  preco: number;
  mercado: string;
  onPress?: () => void;
}) {
  const emoji = PRODUTO_ALTA_EMOJI[categoria] ?? "📦";
  return (
    <button
      onClick={onPress}
      className="shrink-0 flex items-center gap-2 rounded-full px-3 py-1.5 active:scale-95 transition-transform"
      style={{
        scrollSnapAlign: "start",
        background: "#fff",
        border: "1.5px solid #E5E7EB",
      }}
    >
      <span className="text-base leading-none">{emoji}</span>
      <span className="text-[12px] font-semibold text-[#111827] whitespace-nowrap">{produto}</span>
      <span className="text-[10px] font-black text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded-full whitespace-nowrap">
        📈 {engagement}
      </span>
    </button>
  );
}

// ── Hot offers carousel ───────────────────────────────────────────────────────

function HotOffersCarousel({
  offers,
  avgPrecoMap,
  coords,
  isLoading,
  feedError,
  onOfertaClick,
  onPublicar,
  label,
}: {
  offers: Oferta[];
  avgPrecoMap: Map<string, number>;
  coords: { lat: number; lng: number } | null;
  isLoading: boolean;
  feedError: boolean;
  onOfertaClick: (o: Oferta) => void;
  onPublicar: () => void;
  label?: string;
}) {
  if (feedError) {
    return (
      <div className="px-4">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-[#E5E7EB] bg-white px-6 py-10 text-center" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
          <span className="text-4xl">📡</span>
          <p className="text-[#374151] font-bold text-sm mb-1">Sem conexão com o servidor</p>
          <p className="text-[#9CA3AF] text-xs">Verifique sua internet e tente novamente.</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-1 px-5 py-2 rounded-xl text-xs font-black text-[#111827] active:scale-95 transition-all"
            style={{ background: "linear-gradient(135deg,#F2C14E,#E6A817)" }}
          >
            Recarregar
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="pl-4 flex gap-3 overflow-hidden">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="shrink-0 skeleton-shimmer"
            style={{ width: "78vw", maxWidth: 300, height: 232, borderRadius: 22 }}
          />
        ))}
      </div>
    );
  }

  if (offers.length === 0) {
    return (
      <div className="px-4">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-[#E5E7EB] bg-white px-6 py-10 text-center" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
          <span className="text-4xl">🛒</span>
          <p className="text-[#374151] font-bold text-sm mb-1">Nenhuma oferta ainda</p>
          <p className="text-[#9CA3AF] text-xs">Seja o primeiro a publicar uma promoção na sua região!</p>
          <button
            onClick={onPublicar}
            className="mt-1 px-5 py-2 rounded-xl text-xs font-black text-[#111827] active:scale-95 transition-all"
            style={{ background: "linear-gradient(135deg,#F2C14E,#E6A817)" }}
          >
            Publicar oferta
          </button>
        </div>
      </div>
    );
  }

  const maxConf = Math.max(...offers.map((o) => o.confirmacoes));
  const minDist = Math.min(...offers.map((o) => o.distancia ?? Infinity));
  const minPrice = Math.min(...offers.map((o) => o.preco));

  return (
    <div>
      {/* Header row */}
      <div className="px-4 mb-3 flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-wider text-[#92400E] flex items-center gap-1.5">
          <Flame className="h-3.5 w-3.5 text-[#F2C14E]" />
          {label ?? (coords ? "Ofertas quentes perto de você" : "Ofertas quentes agora")}
        </p>
        <Link href="/ofertas">
          <span className="text-[10px] font-bold bg-[#FEF3C7] text-[#92400E] px-2 py-0.5 rounded-full cursor-pointer hover:bg-[#FDE68A] transition-colors">
            Ver tudo →
          </span>
        </Link>
      </div>

      {/* Scrollable cards */}
      <div
        className="flex gap-3 overflow-x-auto pb-2 pl-4"
        style={{
          scrollSnapType: "x mandatory",
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >
        {offers.map((o) => {
          const avgP  = avgPrecoMap.get(o.produto.toLowerCase()) ?? null;
          const badge = pickBadge(o, {
            isClosest:       o.distancia != null && o.distancia === minDist,
            isMostConfirmed: o.confirmacoes === maxConf,
            isBestPrice:     o.preco === minPrice,
          });
          return (
            <div key={o.id} style={{ scrollSnapAlign: "start" }}>
              <HotOfferCard
                oferta={o}
                avgPreco={avgP}
                badge={badge}
                onClick={() => onOfertaClick(o)}
              />
            </div>
          );
        })}
        {/* Trailing spacer */}
        <div className="shrink-0 w-4" aria-hidden />
      </div>
    </div>
  );
}

// ── Stats strip ───────────────────────────────────────────────────────────────

function StatsStrip({
  economiaTotal,
  pessoasAjudadas,
  ofertasConfirmadasHoje,
  userPontos,
}: {
  economiaTotal?: number | null;
  pessoasAjudadas?: number | null;
  ofertasConfirmadasHoje?: number | null;
  userPontos?: number | null;
}) {
  const items = [
    {
      show: economiaTotal != null && economiaTotal > 0,
      emoji: "💸",
      value: economiaTotal != null && economiaTotal > 0 ? R(economiaTotal) : "",
      label: "Economia gerada",
    },
    {
      show: pessoasAjudadas != null && pessoasAjudadas > 0,
      emoji: "🙋",
      value: pessoasAjudadas != null && pessoasAjudadas > 0 ? pessoasAjudadas.toLocaleString("pt-BR") : "",
      label: "Pessoas ajudadas",
    },
    {
      show: ofertasConfirmadasHoje != null && ofertasConfirmadasHoje > 0,
      emoji: "✅",
      value: ofertasConfirmadasHoje != null ? String(ofertasConfirmadasHoje) : "",
      label: "Confirmadas hoje",
    },
    {
      show: userPontos != null && userPontos > 0,
      emoji: "⭐",
      value: userPontos != null ? `${userPontos} pts` : "",
      label: "Seus pontos",
    },
  ].filter((i) => i.show);

  return (
    <div
      className="mx-4 rounded-[18px] flex"
      style={{ background: "#fff", boxShadow: "0 2px 10px rgba(0,0,0,0.06)" }}
    >
      {items.map(({ emoji, value, label }, i) => (
        <div
          key={label}
          className="flex-1 text-center py-4 relative"
          style={i > 0 ? { borderLeft: "1px solid #F3F4F6" } : undefined}
        >
          <div className="text-[20px] leading-none mb-1">{emoji}</div>
          <div className="text-[18px] font-black text-[#F2C14E] leading-none whitespace-nowrap">{value}</div>
          <div className="text-[9px] text-[#9CA3AF] font-semibold mt-1 leading-tight">{label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Patrocinada card (⭐ OFERTAS EM DESTAQUE) ─────────────────────────────────

function PatrocinadaCard({ oferta, onClick }: { oferta: Oferta; onClick: () => void }) {
  const { primary } = getProductDisplay(oferta.produto, oferta.marca, oferta.categoria);
  const distLabel = oferta.distancia != null
    ? oferta.distancia < 1
      ? `${Math.round(oferta.distancia * 1000)} m`
      : `${oferta.distancia.toFixed(1)} km`
    : null;
  const confirmaLabel = oferta.confirmacoes >= 1
    ? `${oferta.confirmacoes} confirmação${oferta.confirmacoes > 1 ? "ões" : ""}`
    : "Nova oferta";
  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="relative shrink-0 rounded-2xl overflow-hidden cursor-pointer"
      style={{
        width: 210,
        border: "2px solid #F2C14E",
        boxShadow: "0 4px 16px rgba(242,193,78,0.22)",
        background: "#FFFFFF",
      }}
    >
      {/* Shimmer sweep — brilho dourado passando na borda */}
      <motion.div
        className="absolute inset-0 pointer-events-none z-10"
        style={{
          background: "linear-gradient(105deg, transparent 30%, rgba(242,193,78,.18) 50%, transparent 70%)",
        }}
        animate={{ x: ["-150%", "150%"] }}
        transition={{ duration: 7, repeat: Infinity, ease: "linear", repeatDelay: 1.5 }}
      />
      <div className="relative w-full flex items-center justify-center" style={{ height: 115 }}>
        {(oferta.imagemExibicao ?? oferta.fotoUrl) ? (
          <img
            src={(oferta.imagemExibicao ?? oferta.fotoUrl)!}
            alt={oferta.produto}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <span style={{ fontSize: 40 }}>🛒</span>
        )}
        <div
          className="absolute top-1.5 left-1.5 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full text-amber-900"
          style={{ background: "#FFE9A8" }}
        >
          ⭐ PATROCINADO
        </div>
      </div>
      <div className="p-2.5">
        <p className="text-[12px] font-bold text-[#111827] line-clamp-1 leading-tight mb-0.5">{primary}</p>
        <div className="mb-1"><OfferSourceBadge mercadoNome={(oferta as any).mercadoNome ?? oferta.mercado} mercadoLogoUrl={(oferta as any).mercadoLogoUrl} usuarioNome={(oferta as any).usuarioNome ?? (oferta as any).autorNome ?? oferta.usuario} size="sm" /></div>
        <p
          className="leading-none mb-2"
          style={{ fontSize: 21, fontWeight: 800, color: "#16A34A" }}
        >
          {R(oferta.preco)}
        </p>
        <button
          onClick={(e) => { e.stopPropagation(); onClick(); }}
          className="w-full text-[10px] font-bold py-1.5 rounded-lg text-[#111827] mb-2 active:opacity-80"
          style={{ background: "linear-gradient(135deg,#F2C14E,#E6A817)" }}
        >
          ⭐ Ver oferta agora
        </button>
        <div className="flex items-center gap-2 flex-wrap">
          {distLabel && <p className="text-[9px] text-[#9CA3AF]">📍 {distLabel}</p>}
          <p className="text-[9px] text-[#9CA3AF]">👥 {confirmaLabel}</p>
        </div>
      </div>
    </motion.div>
  );
}

// ── Trending card (Bombando perto de você) ────────────────────────────────────

function TrendingCard({
  oferta,
  onClick,
  avgPreco,
}: {
  oferta: Oferta;
  onClick: () => void;
  avgPreco?: number | null;
}) {
  const ageMin = differenceInMinutes(new Date(), new Date(oferta.dataCriacao));
  const activityLabel =
    oferta.ultimaConfirmacaoEm
      ? `Conf. ${differenceInMinutes(new Date(), new Date(oferta.ultimaConfirmacaoEm))}min atrás`
      : oferta.ultimaValidacaoEm
        ? `Val. ${differenceInMinutes(new Date(), new Date(oferta.ultimaValidacaoEm))}min atrás`
        : `Pub. há ${ageMin < 60 ? `${ageMin}min` : `${Math.round(ageMin / 60)}h`}`;

  const economia =
    avgPreco != null && avgPreco > oferta.preco
      ? Math.round(((avgPreco - oferta.preco) / avgPreco) * 100)
      : null;

  const distLabel =
    oferta.distancia != null
      ? oferta.distancia < 1
        ? `${Math.round(oferta.distancia * 1000)}m`
        : `${oferta.distancia.toFixed(1)}km`
      : null;

  const totalEngagement = oferta.confirmacoes + oferta.validacoes;

  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="shrink-0 rounded-2xl overflow-hidden cursor-pointer transition-opacity hover:opacity-90"
      style={{ width: 196, background: "#FFFFFF", border: "1px solid #E5E7EB", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}
    >
      <div className="relative w-full flex items-center justify-center" style={{ height: 118, background: "#F3F4F6" }}>
        {(oferta.imagemExibicao ?? oferta.fotoUrl) ? (
          <img
            src={(oferta.imagemExibicao ?? oferta.fotoUrl)!}
            alt={oferta.produto}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <span style={{ fontSize: 38 }}>🛒</span>
        )}
        {/* Economy badge */}
        {economia != null && economia > 0 && (
          <div
            className="absolute top-2 left-2 text-[10px] font-black px-2 py-0.5 rounded-full"
            style={{ background: "rgba(34,197,94,0.85)", color: "#fff" }}
          >
            -{economia}% vs. média
          </div>
        )}
        {oferta.superOferta && (
          <div className="absolute top-2 right-2 bg-yellow-400 text-yellow-900 text-[9px] font-black px-1.5 py-0.5 rounded-full shadow-sm">
            ⚡ SUPER
          </div>
        )}
      </div>
      <div className="p-3 pt-2.5">
        {(() => {
          const { primary, secondary } = getProductDisplay(oferta.produto, oferta.marca, oferta.categoria);
          return (
            <>
              <p className="text-[12px] font-bold text-[#111827] line-clamp-1 leading-tight">{primary}</p>
              {secondary && <p className="text-[10px] text-[#9CA3AF] truncate leading-tight">{secondary}</p>}
            </>
          );
        })()}
        <div className="mt-0.5 mb-2"><OfferSourceBadge mercadoNome={(oferta as any).mercadoNome ?? oferta.mercado} mercadoLogoUrl={(oferta as any).mercadoLogoUrl} usuarioNome={(oferta as any).usuarioNome ?? (oferta as any).autorNome ?? oferta.usuario} size="sm" /></div>
        <p
          className="leading-none mb-2.5"
          style={{ fontSize: 20, fontWeight: 800, color: "#16A34A" }}
        >
          {R(oferta.preco)}
        </p>
        {/* Highlights row */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {distLabel && (
            <span className="text-[10px] font-semibold text-[#6D28D9] bg-[#EDE9FE] px-2 py-0.5 rounded-full">
              📍 {distLabel}
            </span>
          )}
          {totalEngagement > 0 && (
            <span className="text-[10px] font-semibold text-[#15803D] bg-[#DCFCE7] px-2 py-0.5 rounded-full">
              ✅ {totalEngagement} validações
            </span>
          )}
        </div>
        <p className="text-[9px] text-[#9CA3AF] mt-1.5 truncate">{activityLabel}</p>
      </div>
    </motion.div>
  );
}

// ── "Confirmadas hoje" item ───────────────────────────────────────────────────

function ConfirmadaCard({ oferta }: { oferta: Oferta }) {
  return (
    <Link href="/ofertas">
      <div className="rounded-xl p-3 flex items-center gap-3 cursor-pointer active:scale-[0.98] transition-transform" style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}>
        <div className="shrink-0 w-11 h-11 rounded-lg overflow-hidden bg-[#F3F4F6] flex items-center justify-center">
          {(oferta.imagemExibicao ?? oferta.fotoUrl) ? (
            <img
              src={(oferta.imagemExibicao ?? oferta.fotoUrl)!}
              alt={oferta.produto}
              className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            <Store className="h-4 w-4 text-slate-600" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          {(() => {
            const { primary, secondary } = getProductDisplay(oferta.produto, oferta.marca, oferta.categoria);
            return (
              <>
                <p className="font-bold text-sm text-[#111827] truncate leading-tight">{primary}</p>
                {secondary && <p className="text-[10px] text-[#9CA3AF] truncate leading-tight">{secondary}</p>}
              </>
            );
          })()}
          <div className="mt-0.5 flex items-center gap-2">
            <OfferSourceBadge mercadoNome={(oferta as any).mercadoNome ?? oferta.mercado} mercadoLogoUrl={(oferta as any).mercadoLogoUrl} usuarioNome={(oferta as any).usuarioNome ?? (oferta as any).autorNome ?? oferta.usuario} size="sm" />
            {oferta.bairro && <span className="text-[11px] text-[#9CA3AF] truncate">{oferta.bairro}</span>}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] text-[#16A34A] flex items-center gap-0.5">
              <CheckCircle className="h-2.5 w-2.5" />
              {oferta.validacoes}
            </span>
            {oferta.ultimaValidacaoEm && (
              <span className="text-[10px] text-[#9CA3AF]">
                {timeAgoShort(oferta.ultimaValidacaoEm)}
              </span>
            )}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-base font-black text-[#16A34A]">
            {R(oferta.preco)}
            {getCategoryUnit(oferta.categoria) && !hasPesoVolumeNoNome(oferta.produto) && (
              <span className="text-[10px] font-bold ml-0.5">{getCategoryUnit(oferta.categoria)}</span>
            )}
          </div>
          {oferta.distancia != null && (
            <p className="text-[9px] text-[#9CA3AF] mt-0.5">{oferta.distancia.toFixed(1)} km</p>
          )}
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
    { bg: "#FFFBEB", border: "#FDE68A" },
    { bg: "#F9FAFB", border: "#E5E7EB" },
    { bg: "#FFF7ED", border: "#FED7AA" },
  ];

  const rankStyle = rankColors[rank] ?? { bg: "#FFFFFF", border: "#E5E7EB" };

  return (
    <div
      className="rounded-xl p-3 border cursor-pointer active:scale-[0.98] transition-transform"
      style={{ background: rankStyle.bg, borderColor: rankStyle.border }}
      onClick={() => onCompare(grupo)}
    >
      <div className="flex items-center gap-3">
        {/* Rank badge */}
        <div className="shrink-0 w-6 h-6 rounded-full bg-[#F3F4F6] flex items-center justify-center text-[11px] font-bold text-[#6B7280]">
          {rank + 1}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            {(() => {
              const { primary, secondary } = getProductDisplay(oferta.produto, oferta.marca, oferta.categoria);
              return secondary ? (
                <div className="flex-1 min-w-0">
                  <p className="font-black text-sm text-[#111827] truncate leading-none">{primary}</p>
                  <p className="text-[10px] text-[#9CA3AF] truncate leading-tight">{secondary}</p>
                </div>
              ) : (
                <p className="font-black text-sm text-[#111827] truncate">{primary}</p>
              );
            })()}
            {grupo.count > 1 && (
              <span className="text-[9px] font-black bg-[#FEF3C7] text-[#92400E] px-1.5 py-0.5 rounded-full shrink-0 border border-[#FDE68A]">
                {grupo.count} mercados
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-[#9CA3AF] flex-wrap">
            <OfferSourceBadge mercadoNome={(oferta as any).mercadoNome ?? oferta.mercado} mercadoLogoUrl={(oferta as any).mercadoLogoUrl} usuarioNome={(oferta as any).usuarioNome ?? (oferta as any).autorNome ?? oferta.usuario} size="sm" />
            {grupo.count > 1 && <span className="font-semibold text-[#6B7280]">+ {grupo.count - 1}</span>}
            {oferta.distancia != null && (
              <span>📍 {oferta.distancia.toFixed(1)} km · ⏱️ {tempoMin(oferta.distancia)} min</span>
            )}
          </div>
          {savingsPct !== null && savingsPct >= 3 && (
            <span className="text-[10px] font-bold text-[#16A34A]">
              ↓ {savingsPct}% vs. média do grupo
            </span>
          )}
        </div>

        {/* Price */}
        <div className="shrink-0 text-right">
          <div className="text-xl font-black text-[#16A34A]">
            {R(oferta.preco)}
            {getCategoryUnit(oferta.categoria) && !hasPesoVolumeNoNome(oferta.produto) && (
              <span className="text-[11px] font-bold ml-0.5">{getCategoryUnit(oferta.categoria)}</span>
            )}
          </div>
          {grupo.count > 1 ? (
            <div className="text-[10px] text-[#16A34A] font-bold mt-0.5">
              Comparar →
            </div>
          ) : (
            oferta.distancia != null && (
              <div className="text-[10px] text-[#9CA3AF]">{oferta.distancia.toFixed(1)} km</div>
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
  const cat  = CATEGORY_CONFIG[grupo.categoria] ?? { emoji: "🛒", bg: "#F3F4F6" };
  const unit = hasPesoVolumeNoNome(grupo.produto) ? "" : getCategoryUnit(grupo.categoria);

  return (
    <div
      onClick={() => onCompare(grupo)}
      className="rounded-xl p-3 flex items-center gap-3 cursor-pointer active:scale-[0.98] transition-transform"
      style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}
    >
      <div
        className="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-xl"
        style={{ background: "#F3F4F6" }}
      >
        {cat.emoji}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          {(() => {
            const { primary, secondary } = getProductDisplay(grupo.produto, grupo.best.marca, grupo.best.categoria);
            return secondary ? (
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-[#111827] truncate leading-none">{primary}</p>
                <p className="text-[10px] text-[#9CA3AF] truncate leading-tight">{secondary}</p>
              </div>
            ) : (
              <p className="font-semibold text-sm text-[#111827] truncate">{primary}</p>
            );
          })()}
          <span className="text-[9px] font-medium text-[#9CA3AF] shrink-0">
            {grupo.count} mercados
          </span>
        </div>
        <p className="text-[11px] text-[#6B7280]">
          a partir de{" "}
          <span className="font-bold text-[#16A34A]">
            {R(grupo.minPreco)}{unit}
          </span>
        </p>
        {grupo.savings > 0.01 && (
          <p className="text-[10px] text-[#9CA3AF] mt-0.5">
            economize até {R(grupo.savings)}{unit}
          </p>
        )}
      </div>

      <ChevronRight className="h-3.5 w-3.5 text-[#D1D5DB] shrink-0" />
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
        await navigator.share({ title: "AíCompensa", text, url: window.location.origin });
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
        {(() => {
          const { primary, secondary } = getProductDisplay(oferta.produto, oferta.marca, oferta.categoria);
          return secondary ? (
            <>
              <p className="text-xs font-black text-slate-900 leading-tight line-clamp-1">{primary}</p>
              <p className="text-[10px] text-slate-400 line-clamp-1 leading-tight mb-1">{secondary}</p>
            </>
          ) : (
            <h3 className="text-xs font-black text-slate-900 leading-tight line-clamp-2 mb-1">{primary}</h3>
          );
        })()}
        <div className="mb-1.5"><OfferSourceBadge mercadoNome={(oferta as any).mercadoNome ?? oferta.mercado} mercadoLogoUrl={(oferta as any).mercadoLogoUrl} usuarioNome={(oferta as any).usuarioNome ?? (oferta as any).autorNome ?? oferta.usuario} size="sm" /></div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-black text-[#16A34A]">{R(oferta.preco)}</span>
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

// ── Mercados Patrocinados Section ─────────────────────────────────────────────

function MercadosPatrocinadosSection({
  mercados,
  onSelect,
}: {
  mercados: MercadoFeed[];
  onSelect?: (m: MercadoFeed) => void;
}) {
  const { mutate: registrarImpressao } = useRegistrarImpressaoMercado();
  const { mutate: registrarClique } = useRegistrarCliqueMercado();
  const registrado = useRef(false);

  useEffect(() => {
    if (mercados.length > 0 && !registrado.current) {
      registrado.current = true;
      mercados.forEach((m) => {
        registrarImpressao({ id: m.id, data: { origem: "home" } });
      });
    }
  }, [mercados, registrarImpressao]);

  return (
    <div className="space-y-2">
      {mercados.map((m) => (
        <button
          key={m.id}
          onClick={() => { registrarClique({ id: m.id, data: { origem: "home" } }); onSelect?.(m); }}
          className="w-full flex items-center gap-3 bg-white rounded-2xl p-3.5 border border-[#E5E7EB] cursor-pointer active:scale-[0.98] transition-transform text-left"
          style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}
        >
          {m.logoUrl ? (
            <img
              src={m.logoUrl}
              alt={m.nomeExibicao}
              loading="lazy"
              decoding="async"
              className="w-10 h-10 rounded-xl object-cover shrink-0 border border-[#E5E7EB]"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-[#F3F4F6] flex items-center justify-center text-xl shrink-0">🏪</div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[#111827] font-bold text-sm line-clamp-1">{m.nomeExibicao}</p>
            <p className="text-xs text-[#9CA3AF] mt-0.5">
              {m.cidade}{m.bairro ? ` · ${m.bairro}` : ""}
            </p>
          </div>
          <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] shrink-0 whitespace-nowrap">
            ⭐ PATROCINADO
          </span>
        </button>
      ))}
    </div>
  );
}

// ── Campanha Spotlight Hero Card ──────────────────────────────────────────────

const CATEGORY_EMOJI_MAP: Record<string, string> = {
  Alimentos: "🍚", Bebidas: "🧃", Limpeza: "🧹", Carnes: "🥩",
  Higiene: "🪥", Hortifruti: "🥦", Pet: "🐾", Eletrônicos: "📱",
};

function SponsoredOfferMiniCard({ oferta }: { oferta: Oferta }) {
  const fmt = (n: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
  const emoji = CATEGORY_EMOJI_MAP[oferta.categoria] ?? "🛒";
  return (
    <div
      className="shrink-0 rounded-xl p-3 flex flex-col gap-1.5"
      style={{
        width: "108px",
        scrollSnapAlign: "start",
        background: "#FFFFFF",
        border: "1px solid #E5E7EB",
        boxShadow: "0 2px 6px rgba(0,0,0,0.05)",
      }}
    >
      <span className="text-xl">{emoji}</span>
      <p className="text-[#111827] text-[11px] font-bold line-clamp-2 leading-tight">{oferta.produto}</p>
      <p className="text-[#16A34A] font-black text-sm">{fmt(oferta.preco)}</p>
      <span
        className="text-[8px] font-black px-1.5 py-0.5 rounded-full self-start tracking-wide"
        style={{ background: "#FEF3C7", color: "#92400E", border: "1px solid #FDE68A" }}
      >
        ⭐ OFERTA
      </span>
    </div>
  );
}

function CampanhaSpotlightBanner({
  mercado,
  ofertasPatrocinadas,
  isAdmin,
  onSelect,
}: {
  mercado: MercadoFeed;
  ofertasPatrocinadas: Oferta[];
  isAdmin: boolean;
  onSelect: (m: MercadoFeed) => void;
}) {
  const { mutate: registrarImpressao } = useRegistrarImpressaoMercado();
  const { mutate: registrarClique } = useRegistrarCliqueMercado();
  const registrado = useRef(false);
  const [slideIndex, setSlideIndex] = useState(0);

  const categories = useMemo(() => {
    const cats = [...new Set(ofertasPatrocinadas.map((o) => o.categoria))];
    return cats.length > 0 ? cats : ["Alimentos", "Limpeza", "Hortifruti"];
  }, [ofertasPatrocinadas]);

  useEffect(() => {
    if (!registrado.current) {
      registrado.current = true;
      registrarImpressao({ id: mercado.id, data: { origem: "banner_home" } });
    }
  }, [mercado.id, registrarImpressao]);

  useEffect(() => {
    if (categories.length <= 1) return;
    const t = setInterval(() => setSlideIndex((i) => (i + 1) % categories.length), 3000);
    return () => clearInterval(t);
  }, [categories.length]);

  const currentEmoji = mercado.logoUrl ? null : (CATEGORY_EMOJI_MAP[categories[slideIndex]] ?? "🏪");
  const ofertaCount = ofertasPatrocinadas.length;
  const viewCount = mercado.modoTeste ? 142 + mercado.id * 7 : null;

  return (
    <div className="space-y-2.5">
      {/* ── Hero card ── */}
      <button
        onClick={() => { registrarClique({ id: mercado.id, data: { origem: "banner_home" } }); onSelect(mercado); }}
        className="w-full text-left rounded-3xl overflow-hidden active:scale-[0.985] transition-all duration-200 relative"
        style={{
          background: "#FFFFFF",
          border: "1px solid #E5E7EB",
          boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
        }}
      >
        {/* Top gold bar */}
        <div className="h-[3px] w-full" style={{ background: "linear-gradient(90deg, #F2C14E 0%, #E6A817 100%)" }} />

        <div className="relative p-4">
          {/* Badges row */}
          <div className="flex items-center justify-between mb-3.5">
            <div className="flex items-center gap-2">
              <span
                className="text-[9px] font-black px-2.5 py-1 rounded-full tracking-wider"
                style={{ background: "#FEF3C7", color: "#92400E", border: "1px solid #FDE68A" }}
              >
                ⭐ PARCEIRO PREMIUM
              </span>
              {isAdmin && mercado.modoTeste && (
                <span
                  className="text-[9px] font-black px-2 py-1 rounded-full tracking-wide"
                  style={{ background: "#FEF3C7", color: "#92400E", border: "1px solid #FDE68A" }}
                >
                  🧪 TESTE
                </span>
              )}
            </div>
            <span className="text-[9px] text-[#9CA3AF] font-medium">Publicidade</span>
          </div>

          {/* Main content */}
          <div className="flex items-start gap-4">
            {/* Logo / animated emoji */}
            <div
              className="w-[60px] h-[60px] rounded-2xl flex items-center justify-center shrink-0 overflow-hidden relative"
              style={{
                background: "#F3F4F6",
                border: "1px solid #E5E7EB",
              }}
            >
              {mercado.logoUrl ? (
                <img src={mercado.logoUrl} alt={mercado.nomeExibicao} className="w-full h-full object-cover" />
              ) : (
                <motion.span
                  key={slideIndex}
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.35, ease: "easeOut" }}
                  className="text-3xl"
                >
                  {currentEmoji}
                </motion.span>
              )}
            </div>

            <div className="flex-1 min-w-0 pt-0.5">
              <p className="font-black text-[17px] leading-tight text-[#111827]">
                {mercado.nomeCampanha}
              </p>
              <p className="text-[#374151] font-semibold text-sm mt-0.5">{mercado.nomeExibicao}</p>
              {mercado.descricaoCampanha && (
                <p className="text-[#9CA3AF] text-[11px] mt-1 line-clamp-1">{mercado.descricaoCampanha}</p>
              )}
            </div>
          </div>

          {/* Stats bar */}
          <div
            className="flex items-center gap-0 mt-3.5 rounded-xl px-3 py-2 flex-wrap gap-x-4 gap-y-1"
            style={{ background: "#F9FAFB", border: "1px solid #E5E7EB" }}
          >
            {ofertaCount > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px]">🔥</span>
                <span className="text-[#111827] font-bold text-[11px]">{ofertaCount}</span>
                <span className="text-[#9CA3AF] text-[11px]">ofertas ativas</span>
              </div>
            )}
            {viewCount !== null && (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px]">🛒</span>
                <span className="text-[#111827] font-bold text-[11px]">{viewCount}</span>
                <span className="text-[#9CA3AF] text-[11px]">views hoje</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 ml-auto">
              <span className="text-[11px]">⚡</span>
              <span className="text-[#16A34A] font-bold text-[11px]">Válidas hoje</span>
            </div>
          </div>

          {/* CTA row */}
          <div className="mt-3 flex gap-2">
            <div
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-black text-sm text-[#111827]"
              style={{
                background: "linear-gradient(135deg, #F2C14E 0%, #E6A817 100%)",
                boxShadow: "0 4px 14px rgba(242,193,78,0.35)",
              }}
            >
              ⭐ Ver promoções
            </div>
            <div
              className="flex items-center justify-center w-11 rounded-xl shrink-0"
              style={{ background: "#F3F4F6", border: "1px solid #E5E7EB" }}
            >
              <MapPin className="h-4 w-4 text-[#6B7280]" />
            </div>
          </div>
        </div>
      </button>

      {/* ── Sponsored offers mini carousel ── */}
      {ofertasPatrocinadas.length > 0 && (
        <div className="pl-1">
          <div className="flex items-center gap-2 mb-2 pr-1">
            <span className="text-[9px] font-black tracking-widest text-[#92400E] uppercase">
              🔥 Ofertas da campanha
            </span>
            <div className="flex-1 h-px" style={{ background: "#E5E7EB" }} />
          </div>
          <div
            className="flex gap-2.5 overflow-x-auto pb-1"
            style={{ scrollSnapType: "x mandatory", scrollbarWidth: "none" }}
          >
            {ofertasPatrocinadas.slice(0, 6).map((o) => (
              <SponsoredOfferMiniCard key={o.id} oferta={o} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Mercado Detalhe Modal ──────────────────────────────────────────────────────

function MercadoDetalheModal({
  mercado,
  isAdmin,
  onClose,
}: {
  mercado: MercadoFeed;
  isAdmin: boolean;
  onClose: () => void;
}) {
  const [, setLocation] = useLocation();
  const [seguindo, setSeguindo] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("seguindo_mercados") ?? "[]") as number[];
      return saved.includes(mercado.id);
    } catch { return false; }
  });

  const toggleSeguir = () => {
    setSeguindo((s) => {
      const next = !s;
      try {
        const saved = JSON.parse(localStorage.getItem("seguindo_mercados") ?? "[]") as number[];
        const updated = next
          ? [...saved, mercado.id]
          : saved.filter((id) => id !== mercado.id);
        localStorage.setItem("seguindo_mercados", JSON.stringify(updated));
      } catch {}
      return next;
    });
  };

  const handleVerRota = () => {
    const q = encodeURIComponent(`${mercado.nomeExibicao} ${mercado.bairro ?? ""} ${mercado.cidade}`);
    window.open(`https://www.google.com/maps/search/?api=1&query=${q}`, "_blank");
  };

  const PLANO_LABELS: Record<string, string> = {
    basico: "⭐ Básico",
    local: "⭐⭐ Local",
    premium_local: "💎 Premium Local",
    regional: "🏆 Regional",
    nacional: "🌐 Nacional",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        className="relative w-full max-w-md rounded-t-3xl overflow-hidden"
        style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-[3px] w-full" style={{ background: "linear-gradient(90deg, #F2C14E, #E6A817)" }} />
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-[#E5E7EB]" />
        </div>

        <div className="px-5 pb-8 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-2 flex-wrap">
              {isAdmin && mercado.modoTeste && (
                <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]">
                  🧪 MODO TESTE
                </span>
              )}
              <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]">
                {PLANO_LABELS[mercado.planoPatrocinio] ?? mercado.planoPatrocinio}
              </span>
            </div>
            <button onClick={onClose} className="text-[#9CA3AF] hover:text-[#374151] text-2xl leading-none">×</button>
          </div>

          <div className="flex items-start gap-3">
            <div
              className="w-14 h-14 rounded-xl flex items-center justify-center text-3xl shrink-0"
              style={{ background: "#F3F4F6", border: "1px solid #E5E7EB" }}
            >
              {mercado.logoUrl
                ? <img src={mercado.logoUrl} alt={mercado.nomeExibicao} className="w-full h-full object-cover rounded-xl" />
                : "🏪"}
            </div>
            <div>
              <p className="text-[#111827] font-black text-lg leading-tight">{mercado.nomeExibicao}</p>
              <p className="text-[#9CA3AF] text-sm mt-0.5 flex items-center gap-1">
                <MapPin className="h-3 w-3 shrink-0" />
                {mercado.cidade}{mercado.bairro ? ` · ${mercado.bairro}` : ""}
              </p>
            </div>
          </div>

          {mercado.nomeCampanha && (
            <div
              className="rounded-2xl p-4 space-y-1.5"
              style={{ background: "#FFFBEB", border: "1px solid #FDE68A" }}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[#92400E] font-black text-base">{mercado.nomeCampanha}</span>
                <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-[#FEF3C7] text-[#92400E]">
                  CAMPANHA ATIVA
                </span>
              </div>
              {mercado.descricaoCampanha && (
                <p className="text-[#6B7280] text-sm">{mercado.descricaoCampanha}</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleVerRota}
              className="flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-[#1D4ED8] active:scale-95 transition-transform"
              style={{ background: "#EFF6FF", border: "1px solid #BFDBFE" }}
            >
              <Navigation className="h-4 w-4" />
              Ver rota
            </button>
            <button
              onClick={toggleSeguir}
              className={cn(
                "flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm active:scale-95 transition-transform",
                seguindo ? "text-[#16A34A]" : "text-[#6B7280]"
              )}
              style={seguindo
                ? { background: "#DCFCE7", border: "1px solid #BBF7D0" }
                : { background: "#F3F4F6", border: "1px solid #E5E7EB" }
              }
            >
              <Heart className={cn("h-4 w-4", seguindo && "fill-current")} />
              {seguindo ? "Seguindo ✓" : "Seguir mercado"}
            </button>
          </div>

          <button
            onClick={() => { setLocation("/ofertas"); onClose(); }}
            className="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-xl active:scale-[0.98] transition-transform"
            style={{ background: "#F0FDF4", border: "1px solid #BBF7D0" }}
          >
            <div className="flex items-center gap-2 text-left">
              <ShoppingCart className="h-4 w-4 text-[#16A34A] shrink-0" />
              <span className="text-sm text-[#374151]">
                Ver <span className="text-[#16A34A] font-bold">ofertas desta semana</span> no {mercado.nomeExibicao}
              </span>
            </div>
            <ChevronRight className="h-4 w-4 text-[#9CA3AF] shrink-0" />
          </button>
        </div>
      </motion.div>
    </div>
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
    <div className="flex items-center justify-between mb-1.5">
      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500 flex items-center gap-1.5">
        <Icon className="h-3 w-3" /> {label}
      </p>
      {badge && (
        <span className="text-[10px] font-medium text-slate-600">
          {badge}
        </span>
      )}
    </div>
  );
}

// ── ChegouAgoraCard ───────────────────────────────────────────────────────────

function ChegouAgoraCard({ oferta, onClick }: { oferta: Oferta; onClick: () => void }) {
  const CATEGORY_EMOJI: Record<string, string> = {
    Alimentos: "🍚", Bebidas: "🧃", Limpeza: "🧹", Carnes: "🥩",
    Higiene: "🪥", Hortifruti: "🥦", Pet: "🐾",
  };
  const emoji = CATEGORY_EMOJI[oferta.categoria] ?? "🛒";
  const mins = differenceInMinutes(new Date(), new Date(oferta.dataCriacao));
  const fmt = (n: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

  return (
    <button
      onClick={onClick}
      className="shrink-0 bg-white rounded-2xl border border-amber-200 p-3 flex flex-col gap-1.5 active:scale-95 transition-all hover:shadow-md text-left"
      style={{ width: 140, scrollSnapAlign: "start", boxShadow: "0 2px 10px rgba(0,0,0,0.06)" }}
    >
      <div className="flex items-center justify-between w-full">
        <span className="text-xl">{emoji}</span>
        <span className="text-[9px] font-bold text-red-500 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded-full whitespace-nowrap">
          {mins < 1 ? "Agora" : `${mins}min`}
        </span>
      </div>
      <p className="text-xs font-bold text-slate-900 leading-snug line-clamp-2">{oferta.produto}</p>
      <p className="text-base font-black text-[#16A34A] leading-none">{fmt(oferta.preco)}</p>
      <OfferSourceBadge mercadoNome={(oferta as any).mercadoNome ?? oferta.mercado} mercadoLogoUrl={(oferta as any).mercadoLogoUrl} usuarioNome={(oferta as any).usuarioNome ?? (oferta as any).autorNome ?? oferta.usuario} size="sm" />
    </button>
  );
}

// ── Minha Lista Card ─────────────────────────────────────────────────────────

function MinhaListaCard() {
  const [listaItens] = useState<string[]>(() => {
    try {
      const raw = JSON.parse(
        localStorage.getItem("comparador_lista_compras") ?? "[]",
      ) as { nome: string }[];
      return raw.map((i) => i.nome);
    } catch {
      return [];
    }
  });

  const preview = listaItens.slice(0, 4);
  const total   = listaItens.length;
  const extra   = total - preview.length;

  return (
    <Link href="/lista">
      <motion.div
        whileTap={{ scale: 0.98 }}
        className="rounded-2xl overflow-hidden cursor-pointer"
        style={{
          background: "#FFFFFF",
          border: "1.5px solid #E5E7EB",
          boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
        }}
      >
        <div className="p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280] flex items-center gap-1.5">
              <ShoppingCart className="h-3 w-3 shrink-0" />
              Minha Lista de Compras
            </p>
            {total > 0 && (
              <span
                className="text-[10px] font-bold text-[#16A34A] px-2 py-0.5 rounded-full"
                style={{ background: "#DCFCE7", border: "1px solid #BBF7D0" }}
              >
                {total} {total === 1 ? "item" : "itens"}
              </span>
            )}
          </div>

          {total === 0 ? (
            /* Estado vazio */
            <div className="flex flex-col items-center gap-2 py-3 mb-3 text-center">
              <span className="text-3xl">🛒</span>
              <p className="text-sm font-semibold text-[#374151]">Sua lista está vazia</p>
              <p className="text-[11px] text-[#9CA3AF]">Adicione produtos para não esquecer nada</p>
            </div>
          ) : (
            /* Item pills */
            <div className="flex flex-wrap gap-1.5 mb-3">
              {preview.map((nome) => (
                <span
                  key={nome}
                  className="text-[11px] font-medium text-[#374151] px-2.5 py-1 rounded-lg"
                  style={{ background: "#F3F4F6", border: "1px solid #E5E7EB" }}
                >
                  {nome}
                </span>
              ))}
              {extra > 0 && (
                <span
                  className="text-[11px] font-medium text-[#9CA3AF] px-2.5 py-1 rounded-lg"
                  style={{ background: "#F9FAFB", border: "1px solid #E5E7EB" }}
                >
                  +{extra} mais
                </span>
              )}
            </div>
          )}

          {/* CTA */}
          <div
            className="flex items-center justify-center gap-2 py-2.5 rounded-xl"
            style={{ background: "linear-gradient(135deg, #F2C14E 0%, #E6A817 100%)" }}
          >
            <ShoppingCart className="h-3.5 w-3.5 text-[#111827] shrink-0" />
            <span className="text-[#111827] font-bold text-sm">
              {total === 0 ? "Criar lista" : "Ver lista completa"}
            </span>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}

// ── Top Economizador Card ─────────────────────────────────────────────────────

function TopEconomizadorCard({
  lider,
}: {
  lider: { nome: string; pontos: number; nivel: string };
}) {
  return (
    <Link href="/ranking">
      <motion.div
        whileTap={{ scale: 0.98 }}
        className="rounded-2xl cursor-pointer overflow-hidden"
        style={{
          background: "#FFFFFF",
          border: "1.5px solid #E5E7EB",
          boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
        }}
      >
        {/* top accent bar */}
        <div className="h-0.5 w-full" style={{ background: "linear-gradient(90deg, #F2C14E, #E6A817)" }} />
        <div className="p-4">
          {/* label badge */}
          <span
            className="inline-flex items-center gap-1.5 text-[9px] font-black px-2.5 py-1 rounded-full tracking-widest mb-3"
            style={{ background: "#FEF3C7", color: "#92400E", border: "1px solid #FDE68A" }}
          >
            🥇 TOP ECONOMIZADOR DA SEMANA
          </span>

          {/* leader */}
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl shrink-0">🏆</span>
            <div className="flex-1 min-w-0">
              <p className="font-black text-[#111827] text-base leading-tight truncate">{lider.nome}</p>
              <p className="text-sm font-black text-[#16A34A] leading-tight">{lider.pontos} pontos</p>
            </div>
          </div>

          {/* nivel badge */}
          <div className="mb-3">
            <span
              className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: "#FEF3C7", color: "#92400E", border: "1px solid #FDE68A" }}
            >
              ⭐ {lider.nivel}
            </span>
          </div>

          {/* CTA */}
          <div
            className="flex items-center justify-center gap-2 py-2.5 rounded-xl"
            style={{ background: "linear-gradient(135deg, #F2C14E 0%, #E6A817 100%)" }}
          >
            <span className="text-[#111827] font-bold text-sm">Ver ranking completo</span>
            <ChevronRight className="h-3.5 w-3.5 text-[#111827] shrink-0" />
          </div>
        </div>
      </motion.div>
    </Link>
  );
}

// ── Mercado Sponsored Card (compacto) ────────────────────────────────────────

function MercadoSponsoredCard({
  mercado,
  onSelect,
}: {
  mercado: MercadoFeed;
  onSelect: (m: MercadoFeed) => void;
}) {
  const { mutate: registrarImpressao } = useRegistrarImpressaoMercado();
  const { mutate: registrarClique }   = useRegistrarCliqueMercado();
  const registrado = useRef(false);

  useEffect(() => {
    if (!registrado.current) {
      registrado.current = true;
      registrarImpressao({ id: mercado.id, data: { origem: "home_card" } });
    }
  }, [mercado.id, registrarImpressao]);

  return (
    <button
      onClick={() => {
        registrarClique({ id: mercado.id, data: { origem: "home_card" } });
        onSelect(mercado);
      }}
      className="w-full flex items-center gap-3 rounded-2xl px-3.5 py-3 text-left active:scale-[0.98] transition-transform"
      style={{
        background: "#fff",
        border: "1px solid #E5E7EB",
      }}
    >
      {/* Logo */}
      {mercado.logoUrl ? (
        <img
          src={mercado.logoUrl}
          alt={`Logo de ${mercado.nomeExibicao}`}
          loading="lazy"
          decoding="async"
          className="w-10 h-10 rounded-xl object-cover shrink-0 border border-white/10"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      ) : (
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
          style={{ background: "rgba(168,85,247,0.15)" }}
        >
          🏪
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-[#111827] font-bold text-sm line-clamp-1">{mercado.nomeExibicao}</p>
        <p className="text-[#6B7280] text-[11px] mt-0.5 truncate">
          {mercado.nomeCampanha ?? `${mercado.cidade}${mercado.bairro ? ` · ${mercado.bairro}` : ""}`}
        </p>
      </div>

      {/* Right */}
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className="text-[9px] text-[#9CA3AF] font-medium">Publicidade</span>
        <ChevronRight className="h-3.5 w-3.5 text-[#9CA3AF]" />
      </div>
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Home() {
  useSeo({
    title: "Início",
    description: "Economize no supermercado com o AíCompensa. Veja as melhores ofertas confirmadas pela comunidade, ranking de caçadores de promoção e radar de preços perto de você.",
  });
  const [, setLocation] = useLocation();
  const { requireLogin, openPrompt } = useLoginPrompt();
  const currentUser = getCurrentUser();
  const {
    supported: pushSupported,
      subscribed: pushSubscribed,
        loading: pushLoading,
          subscribe: subscribePush,
          } = usePush();

          const [hidePushBanner, setHidePushBanner] = useState(false);
  const uid = currentUser?.id ?? 0;
  const isAdmin = currentUser?.isAdmin === true;

  const [coords, setCoords]         = useState<{ lat: number; lng: number } | null>(() => loadCoords());
  const [isLocating, setIsLocating] = useState(false);
  const [mapOpen, setMapOpen]       = useState(false);
  const [compareGrupo, setCompareGrupo] = useState<GrupoOferta | null>(null);
  const [detailOferta, setDetailOferta] = useState<Oferta | null>(null);
  const [detalheMercado, setDetalheMercado] = useState<MercadoFeed | null>(null);

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

  const trendingParams = useMemo(
    () => coords ? { lat: coords.lat, lng: coords.lng, limit: 6 } : { limit: 6 },
    [coords],
  );

  const { data: stats } = useGetStats({
    query: { queryKey: getGetStatsQueryKey() },
  });
  const { data: feedPage, isLoading, isError: feedError } = useListOfertas(listParams, {
    query: {
      queryKey: getListOfertasQueryKey(listParams),
      refetchInterval: (query) => {
        const items = (query.state.data as { items?: unknown[] } | undefined)?.items ?? [];
        const hasGenerating = items.some((o) => {
          const s = (o as { produtoCatalogo?: { statusImagem?: string } }).produtoCatalogo?.statusImagem;
          return s === "pendente" || s === "gerando";
        });
        return hasGenerating ? 15_000 : 5 * 60_000;
      },
    },
  });
  const { data: trendingOfertas } = useGetTrending(trendingParams, {
    query: { queryKey: getGetTrendingQueryKey(trendingParams) },
  });
  const { data: alertaMatches } = useGetAlertaMatches({
    query: { queryKey: getGetAlertaMatchesQueryKey(), enabled: uid > 0 },
  });
  const { data: economia } = useGetEconomiaDiaria({
    query: { queryKey: getGetEconomiaDiariaQueryKey() },
  });
  const { data: mercadosPatrocinados = [] } = useGetMercadosPatrocinadosFeed({}, {
    query: { queryKey: getGetMercadosPatrocinadosFeedQueryKey({}), staleTime: 5 * 60_000 },
  });

  const alertaCount = alertaMatches?.count ?? 0;

  // ── Computed values ──
  const allOfertas = feedPage?.items ?? [];

  /**
   * Enrich offers with client-side distance for offers that have lat/lng but
   * whose `distancia` was not computed server-side (e.g. API was called without
   * coords, or offer coords exist but distancia was null).
   */
  const enrichedOfertas = useMemo(() => {
    if (!coords || allOfertas.length === 0) return allOfertas;
    return allOfertas.map((o) => {
      if (o.distancia != null) return o; // already set server-side
      if (o.latitude != null && o.longitude != null) {
        const d = Math.round(
          calculateDistanceKm(coords.lat, coords.lng, o.latitude, o.longitude) * 10,
        ) / 10;
        return { ...o, distancia: d };
      }
      return o; // no coords on offer — distancia stays null
    });
  }, [allOfertas, coords]);

  const grupos = useMemo(() => groupOfertas(allOfertas), [allOfertas]);

  const heroGrupo = grupos[0] ?? null;
  const heroOffer = heroGrupo?.best ?? null;

  /** Average price per product name (case-insensitive) for savings computation */
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

  /** Top 8 hot offers sorted by smart carousel score */
  const hotOffers = useMemo(
    () =>
      [...(allOfertas ?? [])]
        .filter((o) => o.status !== "expirada")
        .map((o) => ({
          oferta: o,
          score:  carouselScore(o, avgPrecoMap.get(o.produto.toLowerCase()) ?? null, coords),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
        .map(({ oferta }) => oferta),
    [allOfertas, avgPrecoMap, coords],
  );

  /** Best savings amount across all offers (for stats strip) */
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

  /** Products with highest engagement today — for "Produtos em Alta" section */
  const produtosEmAlta = useMemo(() => {
    const map = new Map<string, { engagement: number; produto: string; preco: number; mercado: string; categoria: string }>();
    for (const o of allOfertas) {
      if (o.status === "expirada") continue;
      const k = o.produto.toLowerCase().trim();
      const eng = o.confirmacoes + o.validacoes + o.curtidas;
      const existing = map.get(k);
      if (!existing || eng > existing.engagement) {
        map.set(k, { engagement: eng, produto: o.produto, preco: o.preco, mercado: o.mercado, categoria: o.categoria });
      }
    }
    return [...map.values()]
      .filter(v => v.engagement > 0)
      .sort((a, b) => b.engagement - a.engagement)
      .slice(0, 8);
  }, [allOfertas]);

  /** Top curtidas — sorted by curtidas desc, min 2, excluding hero, max 5 */
  const maisCurtidas = useMemo(
    () =>
      [...(allOfertas ?? [])]
        .filter((o) => o.curtidas >= 2 && o.id !== heroOffer?.id && o.status !== "expirada")
        .sort((a, b) => b.curtidas - a.curtidas)
        .slice(0, 5),
    [allOfertas, heroOffer],
  );

  /** Offers posted in the last 30 min, excluding hero, max 6 */
  const chegouAgora = useMemo(
    () =>
      (allOfertas ?? [])
        .filter(
          (o) =>
            o.id !== heroOffer?.id &&
            o.status !== "expirada" &&
            differenceInMinutes(new Date(), new Date(o.dataCriacao)) < 30,
        )
        .slice(0, 6),
    [allOfertas, heroOffer],
  );

  /** Top 3 sponsored offers for the "⭐ OFERTAS EM DESTAQUE" section */
  const patrocinadas = useMemo(
    () => (allOfertas ?? []).filter((o) => o.patrocinada).slice(0, 3),
    [allOfertas],
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
      validarMutation.mutate({ id: o.id, data: {} }, {
        onSuccess: () => { invalidate(); toast.success("Validado! +2 pontos para quem publicou."); },
        onError: (err) => toast.error(apiErr(err)),
      });
    });
  };

  const handleCompareLike = (o: Oferta) => {
    requireLogin(() => {
      const user = getCurrentUser();
      if (!user) return;
      likeMutation.mutate({ id: o.id, data: {} }, {
        onSuccess: invalidate,
        onError: (err) => toast.error(apiErr(err)),
      });
    });
  };

  const handleCompareDenunciar = (o: Oferta) => {
    requireLogin(() => {
      const user = getCurrentUser();
      if (!user) return;
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

  const handleCompareDetail = (o: Oferta) => {
    setCompareGrupo(null);
    setDetailOferta(o);
  };

  // ── Detail (OfertaModal) actions ──
  const handleDetailLike = () => {
    requireLogin(() => {
      const user = getCurrentUser();
      if (!user || !detailOferta) return;
      likeMutation.mutate({ id: detailOferta.id, data: {} }, {
        onSuccess: invalidate,
        onError: (err) => toast.error(apiErr(err)),
      });
    });
  };

  const handleDetailValidar = () => {
    requireLogin(() => {
      const user = getCurrentUser();
      if (!user || !detailOferta) return;
      validarMutation.mutate({ id: detailOferta.id, data: {} }, {
        onSuccess: () => { invalidate(); toast.success("Validado! +2 pontos."); },
        onError: (err) => toast.error(apiErr(err)),
      });
    });
  };

  const handleDetailDenunciar = () => {
    requireLogin(() => {
      const user = getCurrentUser();
      if (!user || !detailOferta) return;
      denunciarMutation.mutate({ id: detailOferta.id, data: {} }, {
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

  // ── Render ──
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col min-h-full bg-background gap-3"
    >
      {/* ── Header ── */}
      <Greeting
        coords={coords}
        isLocating={isLocating}
        onLocate={handleLocate}
        onPublicar={() => { if (getCurrentUser()) { setLocation("/publicar"); } else { openPrompt("/publicar"); } }}
        economiaTotal={economia?.economiaTotal}
      />

      {/* ── Melhor Oferta Perto de Você ── */}
      {isLoading && (
        <div className="px-4">
          <div className="skeleton-shimmer w-full rounded-2xl" style={{ height: 300 }} />
        </div>
      )}
      {feedError && (
        <div className="px-4">
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-[#E5E7EB] bg-white px-6 py-10 text-center" style={{ boxShadow: "0 2px 10px rgba(0,0,0,.06)" }}>
            <span className="text-4xl">📡</span>
            <p className="text-[#111827] font-bold text-sm mb-1">Sem conexão com o servidor</p>
            <p className="text-[#6B7280] text-xs">Verifique sua internet e tente novamente.</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-1 px-5 py-2 rounded-xl text-xs font-black active:scale-95 transition-all"
              style={{ background: "linear-gradient(135deg,#F2C14E,#E6A817)", color: "#111827" }}
            >
              Recarregar
            </button>
          </div>
        </div>
      )}
      {!isLoading && !feedError && hotOffers.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="px-4"
        >
          <div className="mb-2.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-base">⭐</span>
              <p className="text-[13px] font-bold text-[#111827]">
                {coords ? "Melhor oferta perto de você" : "Melhor oferta agora"}
              </p>
            </div>
            <Link href="/ofertas">
              <span className="text-[12px] font-semibold text-[#F2C14E]">Ver todas →</span>
            </Link>
          </div>
          <FeaturedOfferCard
            oferta={hotOffers[0]}
            avgPreco={avgPrecoMap.get(hotOffers[0].produto.toLowerCase()) ?? null}
            onDetail={() => setDetailOferta(hotOffers[0])}
          />
        </motion.div>
      )}

      {/* ── Bombando perto de você ── */}
      {trendingOfertas && trendingOfertas.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16 }}
          className="pl-4"
        >
          <div className="pr-4 mb-2.5 flex items-center justify-between">
            <p className="text-[13px] font-bold text-[#111827] flex items-center gap-1.5">
              <Flame className="h-3.5 w-3.5 text-orange-500" />
              Confirmadas hoje
            </p>
            <Link href="/ofertas">
              <span className="text-[12px] font-semibold text-[#F2C14E]">Ver tudo →</span>
            </Link>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 pr-4" style={{ scrollSnapType: "x mandatory" }}>
            {trendingOfertas.map((o) => (
              <div key={o.id} style={{ scrollSnapAlign: "start" }}>
                <TrendingCard
                  oferta={o}
                  onClick={() => setDetailOferta(o)}
                  avgPreco={avgPrecoMap.get(o.produto.toLowerCase()) ?? null}
                />
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Produtos em Alta Hoje ── */}
      {!isLoading && produtosEmAlta.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.165 }}
          className="pl-4"
        >
          <div className="pr-4 mb-2.5 flex items-center justify-between">
            <p className="text-[13px] font-bold text-[#111827] flex items-center gap-1.5">
              <BarChart2 className="h-3.5 w-3.5 text-[#16A34A]" />
              Produtos em Alta
            </p>
          </div>
          <div
            className="flex gap-2.5 overflow-x-auto pb-2 pr-4"
            style={{ scrollSnapType: "x mandatory", scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {produtosEmAlta.map((p) => (
              <ProdutoEmAltaCard
                key={p.produto}
                {...p}
                onPress={() => setLocation(`/ofertas?q=${encodeURIComponent(p.produto)}`)}
              />
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Banner de Alertas ── */}
      {alertaCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.17 }}
          className="px-4"
        >
          <Link href="/alertas">
            <div
              className="flex items-center gap-3 rounded-2xl px-4 py-3 cursor-pointer active:scale-[0.98] transition-transform"
              style={{
                background: "#DCFCE7",
                border: "1.5px solid #BBF7D0",
                boxShadow: "0 2px 8px rgba(22,163,74,0.08)",
              }}
            >
              <Bell className="h-5 w-5 text-[#16A34A] shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[#14532D] font-bold text-sm leading-tight">
                  {alertaCount === 1 ? "1 produto" : `${alertaCount} produtos`} da sua lista{" "}
                  <span className="text-[#16A34A]">em promoção</span>
                </p>
                <p className="text-[#166534] text-[11px] mt-0.5">Toque para ver os alertas</p>
              </div>
              <ChevronRight className="h-4 w-4 text-[#16A34A] shrink-0" />
            </div>
          </Link>
        </motion.div>
      )}

      {/* ── Minha Lista de Compras ── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18 }}
        className="px-4"
      >
        <MinhaListaCard />
      </motion.div>

      {/* ── Top Economizador da Semana ── */}
      {stats?.lider && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="px-4"
        >
          <TopEconomizadorCard lider={stats.lider} />
        </motion.div>
      )}

      {/* ── Parceiro em Destaque ── */}
      {mercadosPatrocinados.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.21 }}
          className="px-4"
        >
          <MercadoSponsoredCard
            mercado={mercadosPatrocinados[0]}
            onSelect={(m) => setDetalheMercado(m)}
          />
        </motion.div>
      )}

      {/* ── Ganhar pontos ── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.22 }}
        className="px-4 mb-2"
      >
        <Button
          variant="outline"
          onClick={() => requireLogin(() => setLocation("/publicar"))}
          className="w-full h-11 text-sm font-semibold rounded-xl border-[#E5E7EB] text-[#92400E] hover:bg-[#FFFBEB] bg-[#FFFBEB] gap-2"
        >
          💰 Ganhar pontos
        </Button>
      </motion.div>

      {/* ── Economia stats ── */}
      {economia && economia.economiaTotal > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="px-4 mb-2"
        >
          <div className="flex items-center gap-1.5 mb-2">
            <TrendingDown className="h-3 w-3 text-slate-600 shrink-0" />
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              Economia da comunidade
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl p-2 text-center" style={{ background: "#F0FDF4", border: "1px solid #BBF7D0" }}>
              <div className="text-sm mb-0.5">💰</div>
              <div className="text-[10px] font-black text-[#16A34A] truncate">{R(economia.economiaTotal)}</div>
              <div className="text-[8px] text-[#6B7280] mt-0.5">Economia</div>
            </div>
            <div className="rounded-xl p-2 text-center" style={{ background: "#F9FAFB", border: "1px solid #E5E7EB" }}>
              <div className="text-sm mb-0.5">🏪</div>
              <div className="text-[10px] font-black text-[#111827] truncate">{economia.mercadoMaisEconomico ?? "—"}</div>
              <div className="text-[8px] text-[#6B7280] mt-0.5">Mercado líder</div>
            </div>
            <div className="rounded-xl p-2 text-center" style={{ background: "#F9FAFB", border: "1px solid #E5E7EB" }}>
              <div className="text-sm mb-0.5">✅</div>
              <div className="text-[10px] font-black text-[#111827]">{economia.ofertasConfirmadasHoje}</div>
              <div className="text-[8px] text-[#6B7280] mt-0.5">Confirmadas</div>
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

      {/* ── Mercado Detalhe Modal ── */}
      {detalheMercado && (
        <MercadoDetalheModal
          mercado={detalheMercado}
          isAdmin={isAdmin}
          onClose={() => setDetalheMercado(null)}
        />
      )}
    </motion.div>
  );
}
