import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, MapPin, Navigation } from "lucide-react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Oferta } from "@workspace/api-client-react";

// ── Custom marker icons via DivIcon (avoids bundler URL issues) ───────────────

const ofertaIcon = L.divIcon({
  className: "",
  html: `<div style="width:28px;height:28px;background:#10b981;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid white;box-shadow:0 3px 10px rgba(0,0,0,0.35)"></div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  popupAnchor: [0, -32],
});

const userIcon = L.divIcon({
  className: "",
  html: `<div style="width:18px;height:18px;background:#3b82f6;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(59,130,246,0.6)"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

// ── Recenter helper component ──────────────────────────────────────────────────

function RecenterMap({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, 13, { animate: true });
  }, [map, center[0], center[1]]);
  return null;
}

// ── Helper ─────────────────────────────────────────────────────────────────────

const R = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

function rotaUrl(o: Oferta) {
  if (o.latitude != null && o.longitude != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${o.latitude},${o.longitude}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${o.mercado} ${o.bairro ?? ""} ${o.cidade}`)}`;
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface MapModalProps {
  open: boolean;
  onClose: () => void;
  ofertas: Oferta[];
  userCoords: { lat: number; lng: number } | null;
}

// Brazil center as safe fallback
const BRAZIL_CENTER: [number, number] = [-14.235, -51.9253];

export function MapModal({ open, onClose, ofertas, userCoords }: MapModalProps) {
  const ofertasNoMapa = ofertas.filter(
    (o) => o.latitude != null && o.longitude != null,
  );

  // Determine initial center
  const center: [number, number] = userCoords
    ? [userCoords.lat, userCoords.lng]
    : ofertasNoMapa.length > 0
      ? [ofertasNoMapa[0].latitude!, ofertasNoMapa[0].longitude!]
      : BRAZIL_CENTER;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal sheet */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            className="fixed inset-x-0 bottom-0 z-[301] mx-auto max-w-lg"
            style={{ height: "80dvh" }}
          >
            <div className="flex flex-col h-full bg-[#0f172a] rounded-t-3xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e293b] shrink-0">
                <div>
                  <h3 className="text-white font-black text-base">Ofertas no mapa</h3>
                  <p className="text-slate-400 text-xs mt-0.5">
                    {ofertasNoMapa.length > 0
                      ? `${ofertasNoMapa.length} ${ofertasNoMapa.length === 1 ? "oferta localizada" : "ofertas localizadas"}`
                      : "Nenhuma oferta com localização cadastrada"}
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="h-8 w-8 rounded-full bg-[#1e293b] border border-[#334155] flex items-center justify-center text-slate-400 hover:text-white transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Map */}
              <div className="flex-1 relative">
                {ofertasNoMapa.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3 px-8 text-center">
                    <MapPin className="h-12 w-12 text-slate-600" />
                    <p className="text-slate-400 text-sm leading-relaxed">
                      Nenhuma oferta ainda tem coordenadas cadastradas. Ao publicar uma oferta, ative a localização para ela aparecer aqui.
                    </p>
                  </div>
                ) : (
                  <MapContainer
                    center={center}
                    zoom={13}
                    className="w-full h-full"
                    zoomControl={false}
                  >
                    <TileLayer
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      attribution='&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>'
                    />

                    <RecenterMap center={center} />

                    {/* User location marker */}
                    {userCoords && (
                      <Marker
                        position={[userCoords.lat, userCoords.lng]}
                        icon={userIcon}
                      >
                        <Popup>
                          <div className="text-xs font-semibold">📍 Você está aqui</div>
                        </Popup>
                      </Marker>
                    )}

                    {/* Offer markers */}
                    {ofertasNoMapa.map((o) => (
                      <Marker
                        key={o.id}
                        position={[o.latitude!, o.longitude!]}
                        icon={ofertaIcon}
                      >
                        <Popup minWidth={220}>
                          <div className="text-sm">
                            <p className="font-black text-slate-900 mb-0.5">{o.produto}</p>
                            <p className="text-emerald-700 font-black text-xl leading-none mb-1">
                              {R(o.preco)}
                            </p>
                            <p className="text-slate-600 text-xs mb-0.5">
                              🏪 {o.mercado}
                            </p>
                            {(o.bairro || o.cidade) && (
                              <p className="text-slate-500 text-xs mb-1">
                                📍 {[o.bairro, o.cidade].filter(Boolean).join(", ")}
                              </p>
                            )}
                            {o.distancia != null && (
                              <p className="text-xs text-emerald-600 font-semibold mb-2">
                                {o.distancia.toFixed(1)} km de você
                              </p>
                            )}
                            <a
                              href={rotaUrl(o)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs font-bold text-white bg-emerald-600 px-3 py-1.5 rounded-lg hover:bg-emerald-500 transition-colors w-full justify-center"
                            >
                              <Navigation size={12} />
                              Ver rota
                            </a>
                          </div>
                        </Popup>
                      </Marker>
                    ))}
                  </MapContainer>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
