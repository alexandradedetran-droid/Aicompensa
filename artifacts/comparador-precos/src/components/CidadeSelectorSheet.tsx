import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, X, Search, Loader2, Navigation } from "lucide-react";
import { useCidadeAtiva, REGIOES, findRegiaoByCity, makeRegiaoFromCity, type Regiao } from "@/lib/cidade-ativa";
import { reverseGeocode } from "@/lib/geo";

interface Props {
  open: boolean;
  onClose: () => void;
  /** If true, user cannot dismiss without selecting (first-time flow) */
  required?: boolean;
}

export function CidadeSelectorSheet({ open, onClose, required = false }: Props) {
  const { setCidade } = useCidadeAtiva();
  const [query, setQuery] = useState("");
  const [isLocating, setIsLocating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open]);

  const filtered: Regiao[] = query.trim().length > 0
    ? REGIOES.filter(
        (r) =>
          r.nome.toLowerCase().includes(query.trim().toLowerCase()) ||
          r.cidadesIncluidas.some((c) =>
            c.toLowerCase().includes(query.trim().toLowerCase()),
          ),
      )
    : REGIOES;

  function handleSelect(regiao: Regiao) {
    setCidade({
      cidade: regiao.cidadePrimaria,
      estado: regiao.estado,
      regiaoId: regiao.id,
      regiaoNome: regiao.nome,
      cidadesIncluidas: regiao.cidadesIncluidas,
      origem: "manual",
    });
    onClose();
  }

  async function handleGps() {
    if (!navigator.geolocation) return;
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        const { cidade } = await reverseGeocode(lat, lng);
        if (cidade) {
          const regiao = findRegiaoByCity(cidade) ?? makeRegiaoFromCity(cidade);
          setCidade({
            cidade: regiao.cidadePrimaria,
            estado: regiao.estado,
            regiaoId: regiao.id,
            regiaoNome: regiao.nome,
            cidadesIncluidas: regiao.cidadesIncluidas,
            origem: "gps",
            latitude: lat,
            longitude: lng,
          });
          onClose();
        }
        setIsLocating(false);
      },
      () => setIsLocating(false),
      { timeout: 10000, enableHighAccuracy: false },
    );
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          {!required && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
              onClick={onClose}
            />
          )}

          {/* Sheet */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
            className="fixed bottom-0 left-0 right-0 z-50 rounded-t-[28px] overflow-hidden"
            style={{
              background: "#0F1729",
              border: "1px solid rgba(255,255,255,0.08)",
              paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)",
              maxHeight: "80vh",
            }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-9 h-1 rounded-full bg-white/20" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-2 pb-3">
              <div>
                <h2 className="text-white font-black text-[17px]">Escolha sua região</h2>
                <p className="text-slate-400 text-[12px] mt-0.5">
                  Veja ofertas e mercados da sua região
                </p>
              </div>
              {!required && (
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ background: "rgba(255,255,255,0.08)" }}
                >
                  <X className="h-4 w-4 text-slate-300" />
                </button>
              )}
            </div>

            {/* GPS button */}
            <div className="px-5 mb-3">
              <button
                onClick={handleGps}
                disabled={isLocating}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all active:scale-98"
                style={{
                  background: "rgba(242,193,78,0.12)",
                  border: "1.5px solid rgba(242,193,78,0.35)",
                }}
              >
                {isLocating ? (
                  <Loader2 className="h-4 w-4 text-[#F2C14E] animate-spin shrink-0" />
                ) : (
                  <Navigation className="h-4 w-4 text-[#F2C14E] shrink-0" />
                )}
                <span className="text-[#F2C14E] font-bold text-sm">
                  {isLocating ? "Detectando localização…" : "Usar minha localização atual"}
                </span>
              </button>
            </div>

            {/* Search */}
            <div className="px-5 mb-3">
              <div
                className="flex items-center gap-2 rounded-xl px-3 py-2.5"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                <Search className="h-4 w-4 text-slate-400 shrink-0" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar cidade ou região..."
                  className="flex-1 bg-transparent text-white text-sm outline-none placeholder:text-slate-500"
                />
                {query && (
                  <button onClick={() => setQuery("")}>
                    <X className="h-3.5 w-3.5 text-slate-400" />
                  </button>
                )}
              </div>
            </div>

            {/* Region list */}
            <div className="overflow-y-auto px-5 space-y-2" style={{ maxHeight: "40vh" }}>
              {filtered.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-slate-500 text-sm">Nenhuma região encontrada</p>
                </div>
              ) : (
                filtered.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => handleSelect(r)}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all active:scale-98"
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.06)" }}
                  >
                    <MapPin className="h-4 w-4 text-[#F2C14E] shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-bold text-sm">{r.nome}</p>
                      {r.cidadesIncluidas.length > 1 ? (
                        <p className="text-slate-400 text-[11px] truncate">
                          {r.cidadesIncluidas.join(", ")}
                        </p>
                      ) : (
                        <p className="text-slate-400 text-[11px]">{r.estado}</p>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
