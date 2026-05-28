import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { X, ThumbsUp, CheckCircle, AlertTriangle, Navigation, Calendar, Clock, MapPin } from "lucide-react";
import { formatDistance, differenceInMinutes } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  useGetHistoricoPrecos,
  getGetHistoricoPrecosQueryKey,
  type Oferta,
} from "@workspace/api-client-react";

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

function getCat(cat: string) {
  return CATEGORY_CONFIG[cat] ?? CAT_DEFAULT;
}

/* ── Mini map helpers ─────────────────────────────────────────────────────── */

const pinIcon = L.divIcon({
  className: "",
  html: `<div style="width:24px;height:24px;background:#10b981;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.35)"></div>`,
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
  const scrollRef = useRef<HTMLDivElement>(null);

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
    oferta.status === "validada" ? "#10b981"
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
        <div style={{ position: "relative", width: "100%", height: 200, background: cat.bg, flexShrink: 0 }}>
          {oferta.fotoUrl ? (
            <img
              src={oferta.fotoUrl}
              alt={oferta.produto}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              onError={(e) => {
                const el = e.target as HTMLImageElement;
                el.style.display = "none";
              }}
            />
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

          {/* Gradient overlay */}
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(to bottom, rgba(0,0,0,0.12) 0%, rgba(0,0,0,0) 50%, rgba(0,0,0,0.3) 100%)",
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

          {/* Product + category */}
          <div style={{ marginBottom: 12 }}>
            <span style={{
              fontSize: 11, fontWeight: 700, color: "#64748b",
              textTransform: "uppercase", letterSpacing: 0.5,
            }}>
              {oferta.categoria}{oferta.marca ? ` • ${oferta.marca}` : ""}
            </span>
            <h2 style={{ margin: "2px 0 0", fontSize: 22, fontWeight: 900, color: "#0f172a", lineHeight: 1.2 }}>
              {oferta.produto}
            </h2>
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
                <span style={{ fontSize: 12, fontWeight: 800, color: "#10b981", background: "#dcfce7", padding: "2px 8px", borderRadius: 100 }}>
                  POR
                </span>
              )}
              <span style={{ fontSize: 34, fontWeight: 900, color: "#10b981", lineHeight: 1 }}>
                {R(oferta.preco)}
                {getCategoryUnit(oferta.categoria) && (
                  <span style={{ fontSize: 16, fontWeight: 700, marginLeft: 2 }}>
                    {getCategoryUnit(oferta.categoria)}
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
                <p style={{ margin: 0, fontWeight: 800, fontSize: 15, color: "#0f172a" }}>{oferta.mercado}</p>
                {(oferta.bairro || oferta.cidade) && (
                  <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
                    {[oferta.bairro, oferta.cidade].filter(Boolean).join(", ")}
                  </p>
                )}
              </div>
            </div>

            {oferta.distancia != null && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <MapPin size={14} color="#10b981" />
                <span style={{ fontSize: 13, fontWeight: 700, color: "#10b981" }}>
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
                  background: "#0f172a", color: "white",
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
                  background: "#0f172a", color: "white",
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
                  <span style={{ fontSize: 18, fontWeight: 900, color: "#0f172a", display: "block", lineHeight: 1 }}>
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
                          <span style={{ fontSize: 14, fontWeight: 900, color: isFirst ? "#10b981" : "#0f172a" }}>
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
                background: isValidating || oferta.status === "expirada" ? "#e2e8f0" : "#10b981",
                color: isValidating || oferta.status === "expirada" ? "#94a3b8" : "white",
                border: "none", fontSize: 15, fontWeight: 800,
                cursor: isValidating || oferta.status === "expirada" ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                boxShadow: oferta.status !== "expirada" ? "0 4px 20px rgba(16,185,129,0.35)" : "none",
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
                  background: "#f0fdf4", color: "#10b981",
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
        </div>
      </div>
    </>
  );
}
