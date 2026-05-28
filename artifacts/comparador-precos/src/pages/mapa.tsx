import { useState, useEffect, useRef, useCallback } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Navigation, MapPin, Loader2, RefreshCw, X, Store } from "lucide-react";
import { useLocation } from "wouter";
import { useListOfertas, type Oferta } from "@workspace/api-client-react";
import { formatDistance, loadCoords, saveCoords } from "@/lib/distance";

/* ── helpers ──────────────────────────────────────────────────────────────── */

const R = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

const BRAZIL_CENTER: [number, number] = [-14.235, -51.9253];
const BRAZIL_ZOOM = 4;

function priceColor(price: number, min: number, max: number): string {
  if (max === min) return "#10b981";
  const ratio = (price - min) / (max - min);
  if (ratio < 0.34) return "#10b981";
  if (ratio < 0.67) return "#f59e0b";
  return "#ef4444";
}

function makeOfertaIcon(color: string, selected: boolean) {
  const size = selected ? 44 : 36;
  return L.divIcon({
    className: "",
    html: `<div style="
      width:${size}px;height:${size}px;
      background:${color};
      border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      border:${selected ? "3px" : "2.5px"} solid white;
      box-shadow:${selected ? "0 0 0 3px " + color + "66," : ""}0 3px 12px rgba(0,0,0,0.40);
      transition:all 0.15s;
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -(size + 4)],
  });
}

const userIcon = L.divIcon({
  className: "",
  html: `
    <div style="position:relative;width:22px;height:22px;">
      <div style="
        position:absolute;inset:0;
        background:rgba(59,130,246,0.25);
        border-radius:50%;
        animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite;
      "></div>
      <div style="
        position:absolute;inset:3px;
        background:#3b82f6;
        border-radius:50%;
        border:2.5px solid white;
        box-shadow:0 2px 8px rgba(59,130,246,0.7);
      "></div>
    </div>
    <style>@keyframes ping{75%,100%{transform:scale(2);opacity:0}}</style>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

/* ── RecenterMap ─────────────────────────────────────────────────────────── */

function RecenterMap({ target }: { target: [number, number] | null }) {
  const map = useMap();
  const prevRef = useRef<[number, number] | null>(null);

  useEffect(() => {
    if (!target) return;
    const prev = prevRef.current;
    if (!prev || prev[0] !== target[0] || prev[1] !== target[1]) {
      map.setView(target, 15, { animate: true });
      prevRef.current = target;
    }
  }, [map, target]);

  return null;
}

/* ── OfertaMarker ────────────────────────────────────────────────────────── */

function OfertaMarker({
  oferta,
  color,
  selected,
  onSelect,
}: {
  oferta: Oferta;
  color: string;
  selected: boolean;
  onSelect: (o: Oferta) => void;
}) {
  const icon = makeOfertaIcon(color, selected);

  return (
    <Marker
      position={[oferta.latitude!, oferta.longitude!]}
      icon={icon}
      eventHandlers={{ click: () => onSelect(oferta) }}
    />
  );
}

/* ── OfertaSheet ─────────────────────────────────────────────────────────── */

function OfertaSheet({
  oferta,
  color,
  onClose,
  userCoords,
}: {
  oferta: Oferta | null;
  color: string;
  onClose: () => void;
  userCoords: { lat: number; lng: number } | null;
}) {
  const [, setLocation] = useLocation();

  if (!oferta) return null;

  // Client-side distance if server didn't compute it
  const distKm =
    oferta.distancia ??
    (userCoords && oferta.latitude != null && oferta.longitude != null
      ? (() => {
          const R = 6371;
          const dLat = ((oferta.latitude - userCoords.lat) * Math.PI) / 180;
          const dLng = ((oferta.longitude - userCoords.lng) * Math.PI) / 180;
          const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos((userCoords.lat * Math.PI) / 180) *
              Math.cos((oferta.latitude * Math.PI) / 180) *
              Math.sin(dLng / 2) ** 2;
          return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        })()
      : null);

  const distLabel = distKm != null ? formatDistance(distKm) : null;
  const isClose   = distKm != null && distKm <= 1;
  const valeViagem = distKm != null && distKm > 1 && distKm <= 5 && oferta.validacoes >= 3;

  const priceLabel =
    color === "#10b981"
      ? "🟢 Preço baixo"
      : color === "#f59e0b"
        ? "🟡 Preço médio"
        : "🔴 Preço alto";

  const priceTextColor =
    color === "#10b981" ? "#047857" : color === "#f59e0b" ? "#92400e" : "#b91c1c";

  const priceBg =
    color === "#10b981" ? "#d1fae5" : color === "#f59e0b" ? "#fef3c7" : "#fee2e2";

  const rotaUrl =
    oferta.latitude != null && oferta.longitude != null
      ? `https://www.google.com/maps/dir/?api=1&destination=${oferta.latitude},${oferta.longitude}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          `${oferta.mercado} ${oferta.cidade ?? ""}`,
        )}`;

  return (
    <>
      {/* Backdrop — tap to dismiss */}
      <div
        data-testid="sheet-backdrop"
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 700,
          background: "transparent",
        }}
      />

      {/* Sheet panel */}
      <div
        data-testid="oferta-sheet"
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 800,
          background: "#fff",
          borderRadius: "20px 20px 0 0",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.35)",
          padding: "0 0 env(safe-area-inset-bottom,0)",
          overflow: "hidden",
          animation: "slideUp 0.25s cubic-bezier(0.22,1,0.36,1) both",
        }}
      >
        <style>{`
          @keyframes slideUp {
            from { transform: translateY(100%); opacity: 0; }
            to   { transform: translateY(0);    opacity: 1; }
          }
        `}</style>

        {/* Drag handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 0" }}>
          <div style={{ width: 36, height: 4, borderRadius: 100, background: "#e2e8f0" }} />
        </div>

        {/* Close button */}
        <button
          aria-label="Fechar"
          onClick={onClose}
          style={{
            position: "absolute",
            top: 10,
            right: 14,
            width: 30,
            height: 30,
            borderRadius: "50%",
            background: "#f1f5f9",
            border: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <X size={14} color="#64748b" />
        </button>

        {/* Content */}
        <div style={{ padding: "10px 16px 20px" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            {/* Photo */}
            <div style={{
              width: 72, height: 72, borderRadius: 12,
              background: "#f1f5f9", overflow: "hidden", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {oferta.fotoUrl ? (
                <img
                  src={oferta.fotoUrl}
                  alt={oferta.produto}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <Store size={28} color="#cbd5e1" />
              )}
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontWeight: 800, fontSize: 16, color: "#0f172a", lineHeight: 1.3 }}>
                {oferta.produto}
              </p>
              <p style={{ margin: "4px 0 0", fontWeight: 900, fontSize: 22, color: priceTextColor, lineHeight: 1 }}>
                {R(oferta.preco)}
              </p>
            </div>
          </div>

          {/* Details */}
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 4 }}>
            <p style={{ margin: 0, fontSize: 13, color: "#475569" }}>
              🏪 <strong>{oferta.mercado}</strong>
            </p>
            {(oferta.bairro || oferta.cidade) && (
              <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>
                📍 {[oferta.bairro, oferta.cidade].filter(Boolean).join(", ")}
              </p>
            )}
            {distLabel && (
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#10b981" }}>
                {distLabel}
              </p>
            )}
          </div>

          {/* Badges row */}
          <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
            <span style={{
              fontSize: 12, fontWeight: 700,
              padding: "4px 10px", borderRadius: 100,
              background: priceBg, color: priceTextColor,
            }}>
              {priceLabel}
            </span>
            {isClose && (
              <span style={{
                fontSize: 11, fontWeight: 800,
                padding: "4px 10px", borderRadius: 100,
                background: "#dcfce7", color: "#166534",
              }}>
                📍 Perto de você
              </span>
            )}
            {valeViagem && (
              <span style={{
                fontSize: 11, fontWeight: 800,
                padding: "4px 10px", borderRadius: 100,
                background: "#dbeafe", color: "#1d4ed8",
              }}>
                ✈️ Vale a viagem
              </span>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button
              data-testid="ver-oferta-btn"
              onClick={() => setLocation("/ofertas")}
              style={{
                flex: 1, fontSize: 14, fontWeight: 800,
                color: "white", background: "#10b981",
                border: "none", padding: "13px 0",
                borderRadius: 12, cursor: "pointer",
              }}
            >
              Ver oferta
            </button>
            <a
              data-testid="rota-btn"
              href={rotaUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                fontSize: 14, fontWeight: 800,
                color: "white", background: "#1e293b",
                padding: "13px 18px", borderRadius: 12,
                textDecoration: "none",
              }}
            >
              <Navigation size={14} />
              Rota
            </a>
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Main page ───────────────────────────────────────────────────────────── */

export default function Mapa() {
  const { data, isLoading } = useListOfertas();
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(() => loadCoords());
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [recenterTarget, setRecenterTarget] = useState<[number, number] | null>(null);
  const [selectedOferta, setSelectedOferta] = useState<Oferta | null>(null);

  const ofertas: Oferta[] = (data ?? []).filter(
    (o) => o.latitude != null && o.longitude != null && o.status !== "expirada",
  );

  const prices = ofertas.map((o) => o.preco);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 0;

  const getColor = (o: Oferta) => priceColor(o.preco, minPrice, maxPrice);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocError("Geolocalização não disponível no seu dispositivo.");
      return;
    }
    setLocating(true);
    setLocError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserCoords(coords);
        saveCoords(coords);
        setRecenterTarget([coords.lat, coords.lng]);
        setLocating(false);
      },
      () => {
        setLocError("Não foi possível obter sua localização. Verifique as permissões.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, []);

  const initialCenter: [number, number] =
    userCoords
      ? [userCoords.lat, userCoords.lng]
      : ofertas.length > 0
        ? [ofertas[0].latitude!, ofertas[0].longitude!]
        : BRAZIL_CENTER;

  const initialZoom = ofertas.length > 0 ? 13 : BRAZIL_ZOOM;

  return (
    <div style={{ height: "calc(100dvh - 80px)", position: "relative" }}>

      {/* ── MAP ─────────────────────────────────────────────────────────── */}
      <div style={{ position: "absolute", inset: 0 }}>
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full bg-[#0f172a] gap-3">
            <Loader2 className="h-8 w-8 text-emerald-400 animate-spin" />
            <span className="text-slate-400 text-sm">Carregando ofertas...</span>
          </div>
        ) : (
          <MapContainer
            center={initialCenter}
            zoom={initialZoom}
            style={{ width: "100%", height: "100%" }}
            zoomControl={false}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>'
            />
            <RecenterMap target={recenterTarget} />

            {/* User marker */}
            {userCoords && (
              <Marker
                position={[userCoords.lat, userCoords.lng]}
                icon={userIcon}
                eventHandlers={{ click: () => setSelectedOferta(null) }}
              />
            )}

            {/* Offer markers */}
            {ofertas.map((o) => (
              <OfertaMarker
                key={o.id}
                oferta={o}
                color={getColor(o)}
                selected={selectedOferta?.id === o.id}
                onSelect={setSelectedOferta}
              />
            ))}
          </MapContainer>
        )}

        {/* Empty state */}
        {!isLoading && ofertas.length === 0 && (
          <div style={{
            position: "absolute", inset: 0, zIndex: 10,
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", background: "rgba(15,23,42,0.85)",
            gap: 12, padding: "0 32px", textAlign: "center",
          }}>
            <MapPin className="h-14 w-14 text-slate-500" />
            <p className="text-slate-300 text-sm leading-relaxed font-medium">
              Nenhuma oferta com localização ainda.
              <br />
              Ative a localização ao publicar uma oferta.
            </p>
          </div>
        )}

        {/* ── Offer bottom sheet ───────────────────────────────────────── */}
        <OfertaSheet
          oferta={selectedOferta}
          color={selectedOferta ? getColor(selectedOferta) : "#10b981"}
          onClose={() => setSelectedOferta(null)}
          userCoords={userCoords}
        />

        {/* ── "Ofertas perto de mim" button ──────────────────────────── */}
        {!selectedOferta && (
          <div style={{
            position: "absolute", bottom: 20, left: 0, right: 0,
            display: "flex", justifyContent: "center",
            zIndex: 500, pointerEvents: "none",
          }}>
            <button
              data-testid="perto-de-mim-btn"
              onClick={() => {
                if (userCoords) {
                  setRecenterTarget([userCoords.lat + 0.00001, userCoords.lng]);
                  setTimeout(() => setRecenterTarget([userCoords.lat, userCoords.lng]), 50);
                } else {
                  requestLocation();
                }
              }}
              disabled={locating}
              style={{
                pointerEvents: "all",
                display: "flex", alignItems: "center", gap: 8,
                background: locating ? "#1e293b" : "#10b981",
                color: "white", border: "none", borderRadius: 100,
                padding: "13px 24px", fontWeight: 800, fontSize: 14,
                cursor: locating ? "not-allowed" : "pointer",
                boxShadow: "0 8px 32px rgba(16,185,129,0.45)",
                transition: "all 0.2s",
              }}
            >
              {locating ? (
                <><Loader2 size={16} className="animate-spin" /> Localizando...</>
              ) : (
                <>{userCoords ? <Navigation size={16} /> : <RefreshCw size={16} />} Ofertas perto de mim</>
              )}
            </button>
          </div>
        )}

        {/* Location error */}
        {locError && (
          <div style={{
            position: "absolute", top: 72, left: 16, right: 16,
            background: "#1e293b", borderRadius: 12, padding: "10px 14px",
            fontSize: 12, color: "#fca5a5", zIndex: 500,
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)", border: "1px solid #ef444440",
          }}>
            ⚠️ {locError}
          </div>
        )}
      </div>

      {/* ── Top pill counter (floats over map) ────────────────────────── */}
      <div style={{
        position: "absolute", top: 16, left: 0, right: 0,
        display: "flex", justifyContent: "center",
        zIndex: 600, pointerEvents: "none",
      }}>
        <div style={{
          pointerEvents: "all",
          background: "rgba(15,23,42,0.90)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderRadius: 100, padding: "9px 18px",
          display: "flex", alignItems: "center", gap: 10,
          boxShadow: "0 4px 24px rgba(0,0,0,0.55)",
          border: "1px solid rgba(255,255,255,0.10)",
        }}>
          <MapPin style={{ width: 14, height: 14, color: "#34d399", flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9", whiteSpace: "nowrap" }}>
            {isLoading
              ? "Carregando..."
              : `${ofertas.length} ${ofertas.length === 1 ? "oferta no mapa" : "ofertas no mapa"}`}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginLeft: 2 }}>
            {["#10b981", "#f59e0b", "#ef4444"].map((bg) => (
              <span key={bg} style={{
                width: 9, height: 9, borderRadius: "50%",
                background: bg, display: "inline-block", flexShrink: 0,
              }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
