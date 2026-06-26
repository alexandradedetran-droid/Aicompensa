import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { X, ThumbsUp, CheckCircle, AlertTriangle, Navigation, Calendar, Clock, MapPin, Maximize2 } from "lucide-react";
import { formatDistance, differenceInMinutes } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetHistoricoPrecos,
  getGetHistoricoPrecosQueryKey,
  type Oferta,
} from "@workspace/api-client-react";
import { AindaCompensaBar } from "@/components/offer-card";
import { getProductDisplay } from "@/lib/visual-priority";

/* ── helpers ──────────────────────────────────────────────────────────────── */

const R = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

export const CATEGORY_CONFIG: Record<string, { emoji: string; bg: string; priceUnit?: string }> = {
  "Alimentos":  { emoji: "🍚", bg: "#fef3c7" },
  "Bebidas":    { emoji: "🧃", bg: "#dbeafe" },
  "Limpeza":    { emoji: "🧹", bg: "#cffafe" },
  "Carnes":     { emoji: "🥩", bg: "#fee2e2", priceUnit: "/kg" },
  "Higiene":    { emoji: "🪥", bg: "#ede9fe" },
  "Hortifruti": { emoji: "🥦", bg: "#d1fae5", priceUnit: "/kg" },
  "Pet":        { emoji: "🐾", bg: "#ffedd5" },
  "Laticínios": { emoji: "🧀", bg: "#fef9c3" },
  "Padaria":    { emoji: "🍞", bg: "#fde68a" },
  "Açougue":    { emoji: "🥩", bg: "#fee2e2", priceUnit: "/kg" },
  "Frios":      { emoji: "🧊", bg: "#e0f2fe" },
};
const CAT_DEFAULT = { emoji: "🛒", bg: "#f1f5f9" };

export function getCategoryUnit(categoria: string): string {
  return CATEGORY_CONFIG[categoria]?.priceUnit ?? "";
}

/**
 * Returns true when the product name already contains a weight or volume
 * (e.g. "1kg", "500g", "2L", "1,5L", "350ml", "200 ml").
 * When true the price suffix (/kg) should be suppressed to avoid redundancy
 * like "Hemmer 1kg — R$ 17,85/kg".
 */
export function hasPesoVolumeNoNome(produto: string): boolean {
  return /\d+[.,]?\d*\s*(kg|g|ml|l|litros?|gramas?|quilos?|quilogramas?|mililitros?)\b/i.test(produto);
}

function getCat(cat: string) {
  return CATEGORY_CONFIG[cat] ?? CAT_DEFAULT;
}

/* ── Mini map helpers ─────────────────────────────────────────────────────── */

const pinIcon = L.divIcon({
  className: "",
  html: `<div style="width:24px;height:24px;background:#F2C14E;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.35)"></div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 24],
});

function InvalidateSize() {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 100);
    return () => clearTimeout(t);
  }, [map]);
  return null;
}

/* ── Photo Lightbox ───────────────────────────────────────────────────────── */

function PhotoLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const [scale, setScale]   = useState(1);
  const lastDist            = useRef<number | null>(null);
  const lastScale           = useRef(1);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  const dist = (t: React.TouchList) =>
    Math.hypot(t[0]!.clientX - t[1]!.clientX, t[0]!.clientY - t[1]!.clientY);

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) { lastDist.current = dist(e.touches); lastScale.current = scale; }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length !== 2 || lastDist.current === null) return;
    e.preventDefault();
    setScale(Math.min(6, Math.max(1, lastScale.current * (dist(e.touches) / lastDist.current))));
  };
  const onTouchEnd = () => { lastDist.current = null; };
  const resetZoom  = () => setScale(1);

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget && scale <= 1) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 9995,
        background: "rgba(0,0,0,0.97)",
        display: "flex", alignItems: "center", justifyContent: "center",
        touchAction: "none",
      }}
    >
      <img
        src={src}
        alt={alt}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          maxWidth: "100vw", maxHeight: "100dvh",
          objectFit: "contain",
          transform: `scale(${scale})`,
          transformOrigin: "center",
          transition: scale === 1 ? "transform 0.22s ease" : "none",
          userSelect: "none",
          cursor: scale > 1 ? "grab" : "zoom-in",
        } as React.CSSProperties}
      />

      {/* Close */}
      <button
        onClick={onClose}
        aria-label="Fechar"
        style={{
          position: "absolute", top: 16, right: 16,
          width: 40, height: 40, borderRadius: "50%",
          background: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.22)",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", color: "white",
        }}
      >
        <X size={20} />
      </button>

      {/* Hint / reset */}
      <div style={{
        position: "absolute", bottom: 28, left: "50%", transform: "translateX(-50%)",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
      }}>
        {scale > 1 ? (
          <button
            onClick={resetZoom}
            style={{
              background: "rgba(255,255,255,0.18)", border: "1px solid rgba(255,255,255,0.3)",
              borderRadius: 100, padding: "6px 18px",
              fontSize: 12, color: "white", cursor: "pointer",
            }}
          >
            Resetar zoom
          </button>
        ) : (
          <span style={{
            background: "rgba(0,0,0,0.4)", borderRadius: 100, padding: "5px 14px",
            fontSize: 11, color: "rgba(255,255,255,0.55)", pointerEvents: "none",
          }}>
            Pinça para zoom · toque fora para fechar
          </span>
        )}
      </div>
    </div>
  );
}

/* ── Props ────────────────────────────────────────────────────────────────── */

interface OfertaModalProps {
  oferta: Oferta | null;
  referencePrice: number | null;
  onClose: () => void;
  onLike: () => void;
  onValidar: () => void;
  onDenunciar: () => void;
  isLiking: boolean;
  isValidating: boolean;
  isDenouncing: boolean;
}

/* ── OfertaModal ──────────────────────────────────────────────────────────── */

export function OfertaModal({
  oferta,
  referencePrice,
  onClose,
  onLike,
  onValidar,
  onDenunciar,
  isLiking,
  isValidating,
  isDenouncing,
}: OfertaModalProps) {
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [photoFullscreen, setPhotoFullscreen] = useState(false);

  useEffect(() => {
    if (oferta) {
      scrollRef.current?.scrollTo({ top: 0 });
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [oferta]);

  useEffect(() => {
    if (!oferta) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [oferta, onClose]);

  const { data: historico = [] } = useGetHistoricoPrecos(
    { produto: oferta?.produto ?? "" },
    {
      query: {
        queryKey: getGetHistoricoPrecosQueryKey({ produto: oferta?.produto ?? "" }),
        enabled: !!oferta,
      },
    }
  );

  if (!oferta) return null;

  const cat = getCat(oferta.categoria);
  const hasMap = oferta.latitude != null && oferta.longitude != null;
  const timeAgo = formatDistance(new Date(oferta.dataCriacao), new Date(), { addSuffix: true, locale: ptBR });
  const minsAgo = differenceInMinutes(new Date(), new Date(oferta.dataCriacao));
  const showRefPrice = referencePrice != null && referencePrice > oferta.preco;

  const ultimaConf = oferta.ultimaValidacaoEm
    ? differenceInMinutes(new Date(), new Date(oferta.ultimaValidacaoEm))
    : null;

  const rotaUrl = hasMap
    ? `https://www.google.com/maps/dir/?api=1&destination=${oferta.latitude},${oferta.longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${oferta.mercado} ${oferta.cidade ?? ""}`)}`;

  const statusColor =
    oferta.status === "validada" ? "#F2C14E"
    : oferta.status === "suspeita" ? "#ef4444"
    : "#f59e0b";

  const statusLabel =
    oferta.status === "validada" ? "✅ Validado"
    : oferta.status === "suspeita" ? "⚠️ Suspeito"
    : oferta.status === "expirada" ? "⚫ Expirado"
    : "🟡 Novo";

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 900,
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
        }}
      />

      {/* Sheet */}
      <div
        ref={scrollRef}
        data-testid="oferta-modal"
        style={{
          position: "fixed",
          bottom: 0, left: 0, right: 0,
          zIndex: 910,
          maxHeight: "92dvh",
          overflowY: "auto",
          background: "#fff",
          borderRadius: "24px 24px 0 0",
          boxShadow: "0 -12px 60px rgba(0,0,0,0.3)",
          animation: "modalSlideUp 0.3s cubic-bezier(0.22,1,0.36,1) both",
        }}
      >
        <style>{`
          @keyframes modalSlideUp {
            from { transform:translateY(100%); opacity:0; }
            to   { transform:translateY(0);    opacity:1; }
          }
        `}</style>

        {/* ── Hero photo / category art ──────────────────────────────── */}
        <div style={{
          position: "relative", width: "100%", height: 260,
          background: oferta.fotoUrl ? "#111" : cat.bg,
          flexShrink: 0, overflow: "hidden",
        }}>
          {oferta.fotoUrl ? (
            <>
              {/* Blurred background — same photo, scaled up + darkened */}
              <img
                src={oferta.fotoUrl}
                alt=""
                aria-hidden
                style={{
                  position: "absolute", inset: 0,
                  width: "100%", height: "100%",
                  objectFit: "cover",
                  filter: "blur(22px) brightness(0.38) saturate(1.4)",
                  transform: "scale(1.12)",
                  pointerEvents: "none",
                }}
              />

              {/* Main image — object-contain so nothing is cropped */}
              <button
                onClick={() => setPhotoFullscreen(true)}
                aria-label="Ver foto em tela cheia"
                style={{
                  position: "absolute", inset: 0,
                  width: "100%", height: "100%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "none", border: "none", padding: 0, cursor: "zoom-in",
                }}
              >
                <img
                  src={oferta.fotoUrl}
                  alt={oferta.produto}
                  style={{
                    maxWidth: "100%", maxHeight: "100%",
                    objectFit: "contain", display: "block",
                    filter: "drop-shadow(0 4px 28px rgba(0,0,0,0.55))",
                  }}
                  onError={(e) => {
                    const btn = (e.target as HTMLImageElement).parentElement!;
                    btn.style.display = "none";
                  }}
                />
              </button>

              {/* Expand to fullscreen button */}
              <button
                onClick={() => setPhotoFullscreen(true)}
                aria-label="Tela cheia"
                style={{
                  position: "absolute", top: 14, left: 14,
                  width: 32, height: 32, borderRadius: "50%",
                  background: "rgba(0,0,0,0.45)", border: "1px solid rgba(255,255,255,0.15)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", color: "white",
                }}
              >
                <Maximize2 size={14} />
              </button>
            </>
          ) : (
            <div style={{
              width: "100%", height: "100%",
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 6,
            }}>
              <span style={{ fontSize: 64, lineHeight: 1 }}>{cat.emoji}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", letterSpacing: 1 }}>
                {oferta.categoria.toUpperCase()}
              </span>
            </div>
          )}

          {/* Gradient overlay — subtle bottom vignette */}
          <div style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            background: "linear-gradient(to bottom, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.28) 100%)",
          }} />

          {/* Close */}
          <button
            onClick={onClose}
            aria-label="Fechar"
            data-testid="modal-close"
            style={{
              position: "absolute", top: 14, right: 14,
              width: 34, height: 34, borderRadius: "50%",
              background: "rgba(0,0,0,0.4)", border: "none",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", color: "white",
            }}
          >
            <X size={16} />
          </button>

          {/* Status badge */}
          <div style={{
            position: "absolute", bottom: 12, left: 14,
            background: "white", borderRadius: 100,
            padding: "4px 10px", fontSize: 11, fontWeight: 800,
            color: statusColor, boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
          }}>
            {statusLabel}
          </div>

          {/* "🔥 Confirmado há X min" badge */}
          {ultimaConf !== null && ultimaConf < 60 && (
            <div style={{
              position: "absolute", bottom: 12, right: 14,
              background: "#ef4444", borderRadius: 100,
              padding: "4px 10px", fontSize: 11, fontWeight: 800, color: "white",
              boxShadow: "0 2px 8px rgba(239,68,68,0.4)",
            }}>
              🔥 Confirmado há {ultimaConf < 1 ? "< 1" : ultimaConf} min
            </div>
          )}
        </div>

        {/* ── Content ───────────────────────────────────────────────── */}
        <div style={{ padding: "18px 20px 32px" }}>

          {/* Product hierarchy: categoria → marca → produto */}
          <div style={{ marginBottom: 14, display: "flex", flexDirection: "column", gap: 2 }}>
            {/* 1. Categoria — pequena, discreta */}
            <span style={{
              fontSize: 10, fontWeight: 700, color: "#94a3b8",
              textTransform: "uppercase", letterSpacing: 1.2,
              lineHeight: 1,
            }}>
              {oferta.categoria}
            </span>

            {/* 2. Produto/Marca — hierarquia inteligente por categoria */}
            {(() => {
              const { primary, secondary } = getProductDisplay(oferta.produto, oferta.marca, oferta.categoria);
              return (
                <>
                  <h2 style={{ margin: "4px 0 0", fontSize: secondary ? 22 : 23, fontWeight: 900, color: "#130926", lineHeight: 1.15, letterSpacing: -0.3 }}>
                    {primary}
                  </h2>
                  {secondary && (
                    <p style={{ margin: "3px 0 0", fontSize: 14, fontWeight: 500, color: "#64748b", lineHeight: 1.3 }}>
                      {secondary}
                    </p>
                  )}
                </>
              );
            })()}
          </div>

          {/* Price block */}
          <div style={{
            background: "#f0fdf4", border: "1.5px solid #bbf7d0",
            borderRadius: 16, padding: "14px 16px", marginBottom: 16,
          }}>
            {showRefPrice && (
              <p style={{ margin: "0 0 2px", fontSize: 13, color: "#94a3b8", textDecoration: "line-through", fontWeight: 600 }}>
                DE {R(referencePrice!)}
              </p>
            )}
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              {showRefPrice && (
                <span style={{ fontSize: 12, fontWeight: 800, color: "#F2C14E", background: "#dcfce7", padding: "2px 8px", borderRadius: 100 }}>
                  POR
                </span>
              )}
              <span style={{ fontSize: 34, fontWeight: 900, color: "#F2C14E", lineHeight: 1 }}>
                {R(oferta.preco)}
                {oferta.unidade && oferta.unidade !== "un" && (
                  <span style={{ fontSize: 16, fontWeight: 700, marginLeft: 2, opacity: 0.8 }}>
                    /{oferta.unidade}
                  </span>
                )}
              </span>
            </div>
            {showRefPrice && (
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "#16a34a", fontWeight: 700 }}>
                💰 Economia de {R(referencePrice! - oferta.preco)} comparado a outros mercados
              </p>
            )}
          </div>

          {/* Store + location */}
          <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 34, height: 34, borderRadius: 10,
                background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                <span style={{ fontSize: 18 }}>🏪</span>
              </div>
              <div>
                <p style={{ margin: 0, fontWeight: 800, fontSize: 15, color: "#130926" }}>{oferta.mercado}</p>
                {(oferta.bairro || oferta.cidade) && (
                  <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
                    {[oferta.bairro, oferta.cidade].filter(Boolean).join(", ")}
                  </p>
                )}
              </div>
            </div>

            {oferta.distancia != null && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <MapPin size={14} color="#F2C14E" />
                <span style={{ fontSize: 13, fontWeight: 700, color: "#F2C14E" }}>
                  {oferta.distancia < 1
                    ? `${Math.round(oferta.distancia * 1000)} m de você`
                    : `${oferta.distancia.toFixed(1)} km de você`}
                </span>
              </div>
            )}
          </div>

          {/* ── Mini map ──────────────────────────────────────────────── */}
          {hasMap ? (
            <div style={{ marginBottom: 16 }}>
              <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 }}>
                📍 Localização
              </p>
              <div style={{ height: 140, borderRadius: 16, overflow: "hidden", border: "1px solid #e2e8f0" }}>
                <MapContainer
                  center={[oferta.latitude!, oferta.longitude!]}
                  zoom={15}
                  style={{ width: "100%", height: "100%" }}
                  zoomControl={false}
                  scrollWheelZoom={false}
                  dragging={false}
                >
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  <InvalidateSize />
                  <Marker position={[oferta.latitude!, oferta.longitude!]} icon={pinIcon} />
                </MapContainer>
              </div>
              <a
                href={rotaUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  marginTop: 8, padding: "10px 0", borderRadius: 12,
                  background: "#130926", color: "white",
                  fontWeight: 700, fontSize: 13, textDecoration: "none",
                }}
              >
                <Navigation size={14} />
                Ver rota no Google Maps
              </a>
            </div>
          ) : (
            <div style={{ marginBottom: 16 }}>
              <a
                href={rotaUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  padding: "12px 0", borderRadius: 12,
                  background: "#130926", color: "white",
                  fontWeight: 700, fontSize: 13, textDecoration: "none",
                }}
              >
                <Navigation size={14} />
                Ver rota no Google Maps
              </a>
            </div>
          )}

          {/* ── Stats grid ───────────────────────────────────────────── */}
          <div style={{ marginBottom: 20 }}>
            <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 }}>
              📊 Estatísticas
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
              {[
                { icon: "✅", label: "Confirmações", value: oferta.validacoes },
                { icon: "👍", label: "Curtidas",     value: oferta.curtidas   },
                { icon: "⚠️",  label: "Denúncias",   value: oferta.denuncias  },
              ].map(({ icon, label, value }) => (
                <div key={label} style={{
                  background: "#f8fafc", borderRadius: 12, padding: "10px 8px", textAlign: "center",
                  border: "1px solid #e2e8f0",
                }}>
                  <span style={{ fontSize: 20, display: "block", marginBottom: 2 }}>{icon}</span>
                  <span style={{ fontSize: 18, fontWeight: 900, color: "#130926", display: "block", lineHeight: 1 }}>
                    {value}
                  </span>
                  <span style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600 }}>{label}</span>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#64748b" }}>
                <Calendar size={14} color="#94a3b8" />
                <span>
                  Publicado {minsAgo < 60
                    ? `há ${minsAgo < 1 ? "< 1" : minsAgo} min`
                    : timeAgo}
                </span>
              </div>
              {oferta.ultimaValidacaoEm && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#64748b" }}>
                  <Clock size={14} color="#94a3b8" />
                  <span>
                    Última confirmação {formatDistance(new Date(oferta.ultimaValidacaoEm), new Date(), { addSuffix: true, locale: ptBR })}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* ── Histórico de preço ────────────────────────────────────── */}
          {historico.length >= 2 && (() => {
            const oldest = historico[historico.length - 1];
            const newest = historico[0];
            const diff   = oldest.preco - newest.preco;
            const pct    = oldest.preco > 0 ? Math.round((diff / oldest.preco) * 100) : 0;
            const caiu   = diff > 0;
            const subiu  = diff < 0;

            return (
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 }}>
                    📉 Histórico de preço
                  </p>
                  {caiu && (
                    <span style={{ fontSize: 11, fontWeight: 800, color: "#16a34a", background: "#dcfce7", padding: "3px 10px", borderRadius: 100 }}>
                      ↓ {pct}% mais barato
                    </span>
                  )}
                  {subiu && (
                    <span style={{ fontSize: 11, fontWeight: 800, color: "#dc2626", background: "#fee2e2", padding: "3px 10px", borderRadius: 100 }}>
                      ↑ {Math.abs(pct)}% mais caro
                    </span>
                  )}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 0, borderRadius: 14, overflow: "hidden", border: "1px solid #e2e8f0" }}>
                  {historico.slice(0, 6).map((h, i) => {
                    const isFirst   = i === 0;
                    const isLowest  = h.preco === Math.min(...historico.map((x) => x.preco));
                    const isHighest = h.preco === Math.max(...historico.map((x) => x.preco));
                    const dateStr   = new Date(h.dataCriacao).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
                    return (
                      <div key={`${h.dataCriacao}-${i}`} style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "10px 14px",
                        background: isFirst ? "#f0fdf4" : "#f8fafc",
                        borderBottom: i < Math.min(historico.length, 6) - 1 ? "1px solid #e2e8f0" : "none",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 11, color: "#94a3b8", minWidth: 50 }}>{dateStr}</span>
                          <span style={{ fontSize: 11, color: "#64748b", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {h.mercado}
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {isLowest && <span style={{ fontSize: 10, fontWeight: 800, color: "#16a34a", background: "#dcfce7", padding: "2px 6px", borderRadius: 100 }}>MIN</span>}
                          {isHighest && historico.length > 1 && <span style={{ fontSize: 10, fontWeight: 800, color: "#dc2626", background: "#fee2e2", padding: "2px 6px", borderRadius: 100 }}>MAX</span>}
                          <span style={{ fontSize: 14, fontWeight: 900, color: isFirst ? "#F2C14E" : "#130926" }}>
                            {R(h.preco)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* ── Action buttons ────────────────────────────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button
              data-testid="modal-confirmar"
              onClick={onValidar}
              disabled={isValidating || oferta.status === "expirada"}
              style={{
                width: "100%", padding: "15px 0", borderRadius: 14,
                background: isValidating || oferta.status === "expirada" ? "#e2e8f0" : "#F2C14E",
                color: isValidating || oferta.status === "expirada" ? "#94a3b8" : "white",
                border: "none", fontSize: 15, fontWeight: 800,
                cursor: isValidating || oferta.status === "expirada" ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                boxShadow: oferta.status !== "expirada" ? "0 4px 20px rgba(242,193,78,0.35)" : "none",
                transition: "all 0.2s",
              }}
            >
              <CheckCircle size={18} />
              Confirmar preço (+2 pts)
            </button>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                data-testid="modal-curtir"
                onClick={onLike}
                disabled={isLiking}
                style={{
                  flex: 1, padding: "13px 0", borderRadius: 14,
                  background: "#f0fdf4", color: "#F2C14E",
                  border: "2px solid #bbf7d0", fontSize: 14, fontWeight: 800,
                  cursor: isLiking ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  transition: "all 0.2s",
                }}
              >
                <ThumbsUp size={16} />
                Curtir
              </button>

              <button
                data-testid="modal-reportar"
                onClick={onDenunciar}
                disabled={isDenouncing}
                style={{
                  flex: 1, padding: "13px 0", borderRadius: 14,
                  background: "#fff5f5", color: "#ef4444",
                  border: "2px solid #fecaca", fontSize: 14, fontWeight: 800,
                  cursor: isDenouncing ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  transition: "all 0.2s",
                }}
              >
                <AlertTriangle size={16} />
                Reportar
              </button>
            </div>
          </div>

          {/* ── Ainda compensa? ──────────────────────────────────────── */}
          <AindaCompensaBar
            oferta={oferta}
            onInvalidate={() => queryClient.invalidateQueries({ queryKey: ["ofertas"] })}
          />
        </div>
      </div>

      {/* ── Photo lightbox ──────────────────────────────────────────── */}
      {photoFullscreen && oferta.fotoUrl && (
        <PhotoLightbox
          src={oferta.fotoUrl}
          alt={oferta.produto}
          onClose={() => setPhotoFullscreen(false)}
        />
      )}
    </>
  );
}
