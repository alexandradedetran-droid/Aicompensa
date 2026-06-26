import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, MapPin, Store, Plus, Loader2, ChevronRight,
  AlertCircle, Check, X, Navigation,
} from "lucide-react";
import { haversine, getMercadosRecentes, saveMercadoRecente, type ConfirmedMarket } from "@/lib/geo";

type ApiMarket = {
  id?: number;
  nome: string;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  endereco?: string | null;
  lat?: number | null;
  lng?: number | null;
  distanciaMetros?: number;
  usosTotal?: number;
};

type Stage = "loading" | "list" | "searching" | "manual" | "confirming";

type Props = {
  userCoords: { lat: number; lng: number } | null;
  photoSource: "camera" | "galeria" | null;
  onConfirm: (market: ConfirmedMarket) => void;
};

const BASE = import.meta.env.BASE_URL;
function apiUrl(path: string) {
  return `${BASE}api/${path}`.replace(/\/+/g, "/").replace(/^\/api/, "/api");
}

function fmtDist(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

export function MarketPicker({ userCoords, photoSource, onConfirm }: Props) {
  const [stage, setStage]               = useState<Stage>("loading");
  const [markets, setMarkets]           = useState<ApiMarket[]>([]);
  const [recentes, setRecentes]         = useState<ConfirmedMarket[]>([]);
  const [query, setQuery]               = useState("");
  const [searchResults, setSearchResults] = useState<ApiMarket[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchOnline, setSearchOnline] = useState(false);
  const [selected, setSelected]         = useState<ApiMarket | null>(null);
  const [distWarning, setDistWarning]   = useState(false);
  const [coordsLocal, setCoordsLocal]   = useState<{ lat: number; lng: number } | null>(userCoords);
  const [locating, setLocating]         = useState(!userCoords);

  // Manual form state
  const [manualNome, setManualNome]       = useState("");
  const [manualBairro, setManualBairro]   = useState("");
  const [manualCidade, setManualCidade]   = useState("");
  const [manualEndereco, setManualEndereco] = useState("");
  const [manualLat, setManualLat]         = useState<number | null>(null);
  const [manualLng, setManualLng]         = useState<number | null>(null);
  const [manualLocating, setManualLocating] = useState(false);
  const [manualSaving, setManualSaving]   = useState(false);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // If no coords on mount, request GPS once
  useEffect(() => {
    if (!coordsLocal && navigator.geolocation) {
      setLocating(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCoordsLocal({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setLocating(false);
        },
        () => {
          setLocating(false);
          setStage("list");
        },
        { timeout: 8000, enableHighAccuracy: false },
      );
    }
    setRecentes(getMercadosRecentes());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch nearby markets when coords become available
  useEffect(() => {
    if (!coordsLocal) return;
    setStage("loading");
    fetch(apiUrl(`mercados/proximos?lat=${coordsLocal.lat}&lng=${coordsLocal.lng}`), {
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: ApiMarket[]) => { setMarkets(data); setStage("list"); })
      .catch(() => setStage("list"));
  }, [coordsLocal]);

  // Debounced search — passes user coords to backend for Nominatim hint
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!query.trim()) {
      setSearchResults([]);
      setSearchLoading(false);
      setSearchOnline(false);
      return;
    }
    setSearchLoading(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const coordParam = coordsLocal
          ? `&lat=${coordsLocal.lat}&lng=${coordsLocal.lng}`
          : "";
        const r = await fetch(
          apiUrl(`mercados/buscar?q=${encodeURIComponent(query)}${coordParam}`),
          { credentials: "include" },
        );
        const data: ApiMarket[] = r.ok ? await r.json() : [];
        setSearchResults(data);
        setSearchOnline(data.length > 0);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 400);
  }, [query, coordsLocal]);

  const handleSelect = (m: ApiMarket) => {
    setSelected(m);
    if (coordsLocal && m.lat && m.lng) {
      const dist = haversine(coordsLocal.lat, coordsLocal.lng, m.lat, m.lng);
      setDistWarning(dist > 2000);
    } else {
      setDistWarning(false);
    }
    setStage("confirming");
  };

  const handleConfirm = (market: ApiMarket) => {
    const confirmed: ConfirmedMarket = {
      nome:             market.nome,
      bairro:           market.bairro  ?? "",
      cidade:           market.cidade  ?? "",
      endereco:         market.endereco ?? undefined,
      lat:              market.lat  ?? undefined,
      lng:              market.lng  ?? undefined,
      distanciaMetros:  market.distanciaMetros,
    };
    saveMercadoRecente(confirmed);
    if (market.id) {
      fetch(apiUrl(`mercados/${market.id}/uso`), {
        method: "POST", credentials: "include",
      }).catch(() => {});
    }
    onConfirm(confirmed);
  };

  // Navigate to manual stage, pre-filling name from search query
  const goToManual = () => {
    setManualNome(query.trim());
    setManualBairro("");
    setManualCidade("");
    setManualEndereco("");
    setManualLat(null);
    setManualLng(null);
    setStage("manual");
  };

  // GPS for the market location (not the user's personal location)
  const captureMarketGps = () => {
    if (!navigator.geolocation) return;
    setManualLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setManualLat(lat);
        setManualLng(lng);
        setManualLocating(false);
        // Auto-fill bairro/cidade via reverse geocode
        try {
          const r = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=pt-BR`,
            { headers: { "User-Agent": "AiCompensa/1.0" } },
          );
          if (r.ok) {
            const d = await r.json() as { address?: Record<string, string> };
            const addr = d.address ?? {};
            const bairro = addr.suburb ?? addr.neighbourhood ?? addr.district ?? "";
            const cidade  = addr.city   ?? addr.town          ?? addr.municipality ?? "";
            if (bairro && !manualBairro) setManualBairro(bairro);
            if (cidade  && !manualCidade) setManualCidade(cidade);
          }
        } catch { /* best-effort */ }
      },
      () => setManualLocating(false),
      { timeout: 10000, enableHighAccuracy: true },
    );
  };

  const handleManualSubmit = async () => {
    if (!manualNome.trim()) return;
    setManualSaving(true);
    try {
      const body: Record<string, unknown> = {
        nome:     manualNome.trim(),
        bairro:   manualBairro.trim()   || null,
        cidade:   manualCidade.trim()   || null,
        endereco: manualEndereco.trim() || null,
        lat:      manualLat,
        lng:      manualLng,
      };
      const r = await fetch(apiUrl("mercados/manual"), {
        method:  "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      const savedRow: ApiMarket = r.ok ? await r.json() : { nome: manualNome.trim() };
      handleConfirm({
        ...savedRow,
        nome:     manualNome.trim(),
        bairro:   manualBairro.trim()   || null,
        cidade:   manualCidade.trim()   || null,
        endereco: manualEndereco.trim() || null,
        lat:      manualLat,
        lng:      manualLng,
      });
    } catch {
      // fallback: confirm without saving
      handleConfirm({
        nome:     manualNome.trim(),
        bairro:   manualBairro.trim()   || null,
        cidade:   manualCidade.trim()   || null,
        endereco: manualEndereco.trim() || null,
        lat:      manualLat,
        lng:      manualLng,
      });
    } finally {
      setManualSaving(false);
    }
  };

  const displayList = query.trim() ? searchResults : markets;
  const showRecentes = !query.trim() && recentes.length > 0 && stage !== "confirming" && stage !== "manual";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-amber-500/40 bg-amber-500/8 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-start gap-2.5 px-4 pt-4 pb-3 border-b border-amber-500/20">
        <span className="text-amber-400 text-base shrink-0 mt-0.5">🏪</span>
        <div className="flex-1 min-w-0">
          <p className="text-amber-300 text-sm font-bold">Em qual mercado você está?</p>
          <p className="text-amber-400/70 text-[11px] mt-0.5 leading-relaxed">
            {photoSource === "galeria"
              ? "Foto da galeria — confirme o mercado manualmente."
              : "Confirme o mercado para associar a localização correta à oferta."}
            {" "}Sua localização pessoal nunca é publicada.
          </p>
        </div>
      </div>

      <div className="px-4 pb-4 pt-3 space-y-3">

        {/* ── Confirming stage ── */}
        <AnimatePresence>
          {stage === "confirming" && selected && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="space-y-2"
            >
              {distWarning && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 flex items-start gap-2">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-amber-300 text-xs">
                    Você parece estar longe deste mercado
                    {selected.distanciaMetros ? ` (${fmtDist(selected.distanciaMetros)})` : ""}.{" "}
                    Confirma mesmo assim?
                  </p>
                </div>
              )}
              <div className="rounded-xl border border-[#F2C14E]/25 bg-[#F2C14E]/8 px-3 py-2.5 space-y-0.5">
                <p className="text-[#F2C14E] text-xs font-bold flex items-center gap-1.5">
                  <Store className="h-3.5 w-3.5 shrink-0" />
                  {selected.nome}
                </p>
                {(selected.endereco || selected.bairro || selected.cidade) && (
                  <p className="text-slate-500 text-[11px] ml-5">
                    {[selected.endereco, selected.bairro, selected.cidade].filter(Boolean).join(" · ")}
                  </p>
                )}
                {selected.lat && (
                  <p className="text-[#D4A017] text-[10px] ml-5 flex items-center gap-1">
                    <MapPin className="h-2.5 w-2.5" /> GPS do mercado disponível
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => { setStage(query.trim() ? "searching" : "list"); setSelected(null); }}
                  className="h-9 rounded-xl bg-[#0d0620] border border-[#3a1867] text-slate-400 text-xs font-bold flex items-center justify-center gap-1"
                >
                  <X className="h-3 w-3" /> Voltar
                </button>
                <button
                  type="button"
                  onClick={() => handleConfirm(selected)}
                  className="h-9 rounded-xl bg-[#F2C14E]/15 border border-[#F2C14E]/35 text-[#F2C14E] text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  <Check className="h-3.5 w-3.5" /> Confirmar
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── List / Search stage ── */}
        {stage !== "confirming" && stage !== "manual" && (
          <>
            {/* Search input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
              <input
                type="text"
                value={query}
                onChange={(e) => { setQuery(e.target.value); if (e.target.value) setStage("searching"); }}
                placeholder="Buscar por nome: Comper, Carrefour..."
                className="w-full bg-[#0d0620] text-white rounded-xl pl-9 pr-8 py-2.5 text-sm outline-none border border-[#3a1867] focus:border-amber-500/50 placeholder:text-slate-600 transition-colors"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => { setQuery(""); setSearchResults([]); setStage("list"); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              {searchLoading && !query && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 animate-spin" />
              )}
            </div>

            <div className="space-y-1.5">
              {/* Loading nearby */}
              {stage === "loading" && (
                <div className="flex items-center gap-2 py-3 text-slate-500 text-xs">
                  <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                  {locating ? "Detectando sua localização..." : "Buscando mercados próximos..."}
                </div>
              )}

              {/* Search spinner */}
              {stage === "searching" && searchLoading && (
                <div className="flex items-center gap-2 py-2 text-slate-500 text-xs">
                  <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                  Buscando "{query}"...
                </div>
              )}

              {/* Online indicator */}
              {stage === "searching" && !searchLoading && searchOnline && searchResults.length > 0 && (
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-600 flex items-center gap-1">
                  <Search className="h-2.5 w-2.5" /> Resultados para "{query}"
                </p>
              )}

              {/* Recently used */}
              {showRecentes && (
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">Usados recentemente</p>
                  {recentes.map((m, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleSelect(m as ApiMarket)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-[#0d0620] border border-[#3a1867] hover:border-amber-500/30 transition-colors text-left"
                    >
                      <Store className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-xs font-bold truncate">{m.nome}</p>
                        {(m.bairro || m.cidade) && (
                          <p className="text-slate-600 text-[10px] truncate">
                            {[m.bairro, m.cidade].filter(Boolean).join(" · ")}
                          </p>
                        )}
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 text-slate-600 shrink-0" />
                    </button>
                  ))}
                </div>
              )}

              {/* Nearby or search results */}
              {displayList.length > 0 && (
                <div className="space-y-1">
                  {!query.trim() && (
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                      Mercados próximos {coordsLocal ? "" : "(sem GPS)"}
                    </p>
                  )}
                  {displayList.map((m, i) => (
                    <button
                      key={m.id ?? i}
                      type="button"
                      onClick={() => handleSelect(m)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-[#0d0620] border border-[#3a1867] hover:border-amber-500/30 transition-colors text-left"
                    >
                      <MapPin className="h-3.5 w-3.5 text-amber-400/70 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-xs font-bold truncate">{m.nome}</p>
                        <p className="text-slate-600 text-[10px] truncate">
                          {[m.endereco, m.bairro, m.cidade].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      {m.distanciaMetros !== undefined && (
                        <span className="text-[10px] text-slate-500 shrink-0 font-mono">
                          {fmtDist(m.distanciaMetros)}
                        </span>
                      )}
                      <ChevronRight className="h-3.5 w-3.5 text-slate-600 shrink-0" />
                    </button>
                  ))}
                </div>
              )}

              {/* Empty state after search */}
              {query.trim() && !searchLoading && searchResults.length === 0 && (
                <p className="text-slate-600 text-xs text-center py-2">
                  Nenhum resultado para "{query}".
                </p>
              )}

              {/* No nearby markets */}
              {!query.trim() && stage === "list" && markets.length === 0 && !locating && (
                <p className="text-slate-600 text-xs py-1">
                  Nenhum mercado encontrado próximo. Use a busca ou cadastre abaixo.
                </p>
              )}

              {/* Outro mercado / cadastrar novo */}
              <button
                type="button"
                onClick={goToManual}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-[#0d0620] border border-dashed border-[#3a1867] hover:border-amber-500/30 transition-colors text-left"
              >
                <Plus className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                <span className="text-slate-400 text-xs font-bold">
                  {query.trim() ? `Cadastrar "${query}" como novo mercado` : "Outro mercado / cadastrar novo"}
                </span>
              </button>
            </div>
          </>
        )}

        {/* ── Manual entry form ── */}
        {stage === "manual" && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-2.5"
          >
            <p className="text-slate-400 text-xs font-bold">Cadastrar mercado</p>

            {/* Nome */}
            <input
              type="text"
              value={manualNome}
              onChange={(e) => setManualNome(e.target.value)}
              placeholder="Nome do mercado *"
              className="w-full bg-[#0d0620] text-white rounded-xl px-3 py-2.5 text-sm outline-none border border-[#3a1867] focus:border-[#F2C14E]/50 placeholder:text-slate-600 transition-colors"
            />

            {/* Endereço */}
            <input
              type="text"
              value={manualEndereco}
              onChange={(e) => setManualEndereco(e.target.value)}
              placeholder="Endereço (opcional)"
              className="w-full bg-[#0d0620] text-white rounded-xl px-3 py-2.5 text-sm outline-none border border-[#3a1867] focus:border-[#F2C14E]/50 placeholder:text-slate-600 transition-colors"
            />

            {/* Bairro + Cidade */}
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={manualBairro}
                onChange={(e) => setManualBairro(e.target.value)}
                placeholder="Bairro *"
                className="bg-[#0d0620] text-white rounded-xl px-3 py-2.5 text-sm outline-none border border-[#3a1867] focus:border-[#F2C14E]/50 placeholder:text-slate-600 transition-colors"
              />
              <input
                type="text"
                value={manualCidade}
                onChange={(e) => setManualCidade(e.target.value)}
                placeholder="Cidade *"
                className="bg-[#0d0620] text-white rounded-xl px-3 py-2.5 text-sm outline-none border border-[#3a1867] focus:border-[#F2C14E]/50 placeholder:text-slate-600 transition-colors"
              />
            </div>

            {/* GPS do mercado */}
            <button
              type="button"
              disabled={manualLocating}
              onClick={captureMarketGps}
              className={[
                "w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-colors",
                manualLat
                  ? "bg-[#F2C14E]/15 border border-[#F2C14E]/35 text-[#F2C14E]"
                  : "bg-[#0d0620] border border-[#3a1867] text-slate-400 hover:border-amber-500/40",
              ].join(" ")}
            >
              {manualLocating
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Capturando GPS...</>
                : manualLat
                  ? <><Check className="h-3.5 w-3.5" /> GPS do mercado capturado ✓</>
                  : <><Navigation className="h-3.5 w-3.5" /> Adicionar localização do mercado (GPS)</>
              }
            </button>
            <p className="text-slate-600 text-[10px] -mt-1 text-center">
              Só para identificar o endereço do mercado — sua localização pessoal nunca é salva.
            </p>

            {/* Actions */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setStage("list")}
                className="h-9 rounded-xl bg-[#0d0620] border border-[#3a1867] text-slate-400 text-xs font-bold"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={!manualNome.trim() || !manualBairro.trim() || !manualCidade.trim() || manualSaving}
                onClick={handleManualSubmit}
                className="h-9 rounded-xl bg-[#F2C14E]/15 border border-[#F2C14E]/35 text-[#F2C14E] text-xs font-bold disabled:opacity-40 flex items-center justify-center gap-1.5"
              >
                {manualSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Confirmar
              </button>
            </div>
          </motion.div>
        )}

        <p className="text-amber-500/50 text-[10px] text-center">
          Somente o endereço do mercado aparece publicamente — nunca sua localização pessoal.
        </p>
      </div>
    </motion.div>
  );
}
