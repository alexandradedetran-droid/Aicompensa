import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Building2, Store, Clock, Package,
  AlertTriangle, Tag, Bell, Heart, TrendingUp, ChevronRight, Search, X,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Link, useParams } from "wouter";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { OfertaModal, CATEGORY_CONFIG } from "@/components/oferta-modal";
import { resolveMarketBrandAsset } from "@/lib/market-brand-assets";
import { useSeo } from "@/lib/seo";
import type { MercadoDetail, MercadoOfertasResponse, Oferta } from "@workspace/api-client-react";

const R = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

const CAT_EMOJI = (cat: string) => CATEGORY_CONFIG[cat]?.emoji ?? "🛒";

function Skeleton({ className }: { className?: string }) {
  return <div className={`skeleton-shimmer rounded-full ${className ?? ""}`} />;
}

function HeaderSkeleton() {
  return (
    <div className="px-4 py-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-16 h-16 rounded-2xl skeleton-shimmer shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-28" />
        </div>
      </div>
    </div>
  );
}

function OfertaRowSkeleton({ delay = 0 }: { delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay }}
      className="flex items-center gap-3 px-4 py-3 border-b"
      style={{ borderColor: "#F3F4F6" }}
    >
      <div className="w-14 h-14 rounded-xl skeleton-shimmer shrink-0" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-36" />
        <Skeleton className="h-2.5 w-20" />
      </div>
      <Skeleton className="h-5 w-14 rounded-lg" />
    </motion.div>
  );
}

function OfertaRow({ oferta, index, onOpen }: { oferta: Oferta; index: number; onOpen: () => void }) {
  const emoji = CAT_EMOJI(oferta.categoria);
  const timeAgo = formatDistanceToNow(new Date(oferta.dataCriacao), { addSuffix: true, locale: ptBR });

  return (
    <motion.button
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, delay: Math.min(index * 0.03, 0.2) }}
      onClick={onOpen}
      className="w-full flex items-center gap-3 px-4 py-3 text-left border-b transition-colors"
      style={{ borderColor: "#F3F4F6", background: "transparent" }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#FAFAFA"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
    >
      <div
        className="shrink-0 w-14 h-14 rounded-xl overflow-hidden flex items-center justify-center text-xl"
        style={{ background: "#F3F4F6" }}
      >
        {(oferta.imagemExibicao ?? oferta.fotoUrl) ? (
          <img
            src={(oferta.imagemExibicao ?? oferta.fotoUrl)!}
            alt={oferta.produto}
            loading="lazy"
            className={oferta.fotoUrl ? "w-full h-full object-cover" : "w-full h-full object-contain p-1"}
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <span>{emoji}</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-[#0B1023] truncate leading-snug">{oferta.produto}</p>
        <p className="text-[10px] text-[#9CA3AF] flex items-center gap-1 mt-0.5">
          <Clock className="h-2.5 w-2.5 shrink-0" />
          {timeAgo}
        </p>
      </div>
      <div className="shrink-0 flex items-center gap-1">
        <span className="text-sm font-black" style={{ color: "#16A34A" }}>{R(oferta.preco)}</span>
        <ChevronRight className="h-3.5 w-3.5" style={{ color: "#D1D5DB" }} />
      </div>
    </motion.button>
  );
}

export default function MercadoLegacy() {
  const params = useParams<{ legacyKey: string }>();
  const legacyKey = params.legacyKey ?? "";

  const [modalOferta, setModalOferta] = useState<Oferta | null>(null);
  const [categoriaAtiva, setCategoriaAtiva] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

  const {
    data: mercado,
    isLoading: loadingMercado,
    isError: errorMercado,
  } = useQuery<MercadoDetail>({
    queryKey: ["mercado-legacy", legacyKey],
    queryFn: ({ signal }) =>
      customFetch<MercadoDetail>(`/api/mercados/legacy/${legacyKey}`, { signal }),
    enabled: !!legacyKey,
  });

  const {
    data: ofertasData,
    isLoading: loadingOfertas,
  } = useQuery<MercadoOfertasResponse>({
    queryKey: ["mercado-legacy-ofertas", legacyKey],
    queryFn: ({ signal }) =>
      customFetch<MercadoOfertasResponse>(`/api/mercados/legacy/${legacyKey}/ofertas`, { signal }),
    enabled: !!legacyKey,
  });

  useSeo({
    title: mercado?.nome ?? "Mercado",
    description: mercado
      ? `Veja todas as ${mercado.totalOfertas} ofertas disponíveis em ${mercado.nome}${mercado.cidade ? ` em ${mercado.cidade}` : ""}.`
      : "Detalhes do mercado",
    url: `https://aicompensa.com.br/mercados/legacy/${legacyKey}`,
  });

  const ofertas = ofertasData?.items ?? [];

  const ofertasFiltradas = useMemo(() => {
    let result = ofertas;
    if (categoriaAtiva) result = result.filter((o) => o.categoria === categoriaAtiva);
    const q = busca.trim().toLowerCase();
    if (q) result = result.filter((o) => o.produto.toLowerCase().includes(q));
    return result;
  }, [ofertas, categoriaAtiva, busca]);

  const ultimaAtualizacao = mercado?.ultimaOfertaEm
    ? formatDistanceToNow(new Date(mercado.ultimaOfertaEm), { addSuffix: true, locale: ptBR })
    : null;
  const localidade = mercado
    ? [mercado.bairro, mercado.cidade, mercado.estado].filter(Boolean).join(", ")
    : "";
  const categoriaTop = mercado?.totalPorCategoria?.[0]?.categoria ?? null;
  const resolvedLogoUrl = mercado
    ? (mercado.logoUrl ?? resolveMarketBrandAsset(mercado.nome)?.logoUrl ?? null)
    : null;
  const temFiltro = !!categoriaAtiva || busca.trim().length > 0;

  return (
    <div className="flex flex-col min-h-full bg-background">
      {/* Cabeçalho */}
      <div
        className="sticky top-0 z-40"
        style={{
          background: "#FFFFFF",
          borderBottom: "1px solid #E5E7EB",
          boxShadow: "0 1px 8px rgba(0,0,0,0.06)",
          paddingTop: "env(safe-area-inset-top, 0px)",
        }}
      >
        <div
          className="flex items-center gap-3 px-4"
          style={{ minHeight: "60px", paddingTop: "8px", paddingBottom: "8px" }}
        >
          <Link href="/mercados">
            <button
              className="flex items-center justify-center rounded-xl transition-all active:scale-90 shrink-0"
              style={{ minHeight: "44px", minWidth: "44px", background: "#F3F4F6", border: "1px solid #E5E7EB" }}
              aria-label="Voltar"
            >
              <ArrowLeft className="h-4 w-4 text-[#374151]" />
            </button>
          </Link>
          <div className="flex-1 min-w-0">
            <p className="font-black text-[#0B1023] truncate text-sm leading-tight">
              {mercado?.nome ?? (loadingMercado ? "Carregando…" : "Mercado")}
            </p>
            {localidade && <p className="text-[10px] text-[#9CA3AF] truncate">{localidade}</p>}
          </div>
        </div>
      </div>

      {errorMercado && (
        <div className="flex flex-col items-center justify-center py-20 gap-3 px-4">
          <AlertTriangle className="h-10 w-10" style={{ color: "#D1D5DB" }} />
          <p className="text-sm font-bold text-[#6B7280] text-center">Mercado não encontrado.</p>
          <Link href="/mercados">
            <button
              className="text-xs font-bold px-4 py-2 rounded-xl"
              style={{ background: "#F3F4F6", border: "1px solid #E5E7EB", color: "#374151" }}
            >
              ← Voltar para Mercados
            </button>
          </Link>
        </div>
      )}

      {!errorMercado && (
        <>
          {/* Info do mercado */}
          {loadingMercado ? (
            <HeaderSkeleton />
          ) : mercado ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-4 py-4">
              <div className="flex items-start gap-3">
                <div
                  className="shrink-0 w-16 h-16 rounded-2xl flex items-center justify-center overflow-hidden"
                  style={{ background: "#F9FAFB", border: "1px solid #E5E7EB" }}
                >
                  {resolvedLogoUrl ? (
                    <img
                      src={resolvedLogoUrl}
                      alt={mercado.nome}
                      className="w-full h-full object-contain p-1"
                      onError={(e) => {
                        const el = e.target as HTMLImageElement;
                        el.style.display = "none";
                        (el.parentElement as HTMLDivElement).innerHTML = `<span style="font-size:28px">🏪</span>`;
                      }}
                    />
                  ) : (
                    <Building2 className="h-7 w-7" style={{ color: "#D1D5DB" }} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="font-black text-[#0B1023] text-lg leading-tight">{mercado.nome}</h1>
                    <span
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                      style={{ background: "#F3F4F6", color: "#9CA3AF", border: "1px solid #E5E7EB" }}
                    >
                      não verificado
                    </span>
                  </div>
                  {localidade && (
                    <p className="text-xs text-[#9CA3AF] flex items-center gap-1 mt-0.5">
                      <Store className="h-3 w-3 shrink-0" />
                      {localidade}
                    </p>
                  )}
                  {ultimaAtualizacao && (
                    <p className="text-[10px] text-[#9CA3AF] flex items-center gap-1 mt-0.5">
                      <Clock className="h-2.5 w-2.5 shrink-0" />
                      Atualizado {ultimaAtualizacao}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className="text-[11px] font-black" style={{ color: "#16A34A" }}>
                      {mercado.totalOfertas} {mercado.totalOfertas === 1 ? "oferta" : "ofertas"} disponíveis
                    </span>
                    {categoriaTop && (
                      <>
                        <span className="text-[#E5E7EB] text-[10px]">·</span>
                        <span className="text-[10px] text-[#9CA3AF]">
                          {CAT_EMOJI(categoriaTop)} mais em {categoriaTop}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => toast("Em breve: você poderá favoritar este mercado.")}
                  className="flex items-center gap-1.5 px-3 h-9 rounded-xl text-xs font-bold transition-all active:scale-95"
                  style={{ background: "#F3F4F6", border: "1px solid #E5E7EB", color: "#6B7280" }}
                >
                  <Heart className="h-3.5 w-3.5" />
                  Favoritar
                </button>
                <button
                  onClick={() => toast("Em breve: você poderá criar alertas para este mercado.")}
                  className="flex items-center gap-1.5 px-3 h-9 rounded-xl text-xs font-bold transition-all active:scale-95"
                  style={{ background: "#F3F4F6", border: "1px solid #E5E7EB", color: "#6B7280" }}
                >
                  <Bell className="h-3.5 w-3.5" />
                  Alerta
                </button>
                <button
                  onClick={() => toast("Em breve: você verá a economia média deste mercado.")}
                  className="flex items-center gap-1.5 px-3 h-9 rounded-xl text-xs font-bold transition-all active:scale-95"
                  style={{ background: "#F3F4F6", border: "1px solid #E5E7EB", color: "#6B7280" }}
                >
                  <TrendingUp className="h-3.5 w-3.5" />
                  Economia
                </button>
              </div>
            </motion.div>
          ) : null}

          {/* Categorias */}
          {mercado && mercado.totalPorCategoria && mercado.totalPorCategoria.length > 0 && (
            <div className="pb-3">
              <p className="text-[10px] font-black text-[#9CA3AF] uppercase tracking-widest mb-2 flex items-center gap-1.5 px-4">
                <Tag className="h-3 w-3" />
                Por categoria
              </p>
              <div className="flex gap-2 overflow-x-auto pl-4 pr-4 pb-1" style={{ scrollbarWidth: "none" }}>
                <button
                  onClick={() => setCategoriaAtiva(null)}
                  className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all active:scale-95"
                  style={
                    categoriaAtiva === null
                      ? { background: "#16A34A", color: "#FFFFFF", border: "1px solid #16A34A" }
                      : { background: "#F3F4F6", color: "#374151", border: "1px solid transparent" }
                  }
                >
                  Todas
                </button>
                {mercado.totalPorCategoria.map((cat) => {
                  const ativa = categoriaAtiva === cat.categoria;
                  return (
                    <button
                      key={cat.categoria}
                      onClick={() => setCategoriaAtiva(ativa ? null : cat.categoria)}
                      className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all active:scale-95"
                      style={
                        ativa
                          ? { background: "#16A34A", color: "#FFFFFF", border: "1px solid #16A34A" }
                          : { background: "#F3F4F6", color: "#374151", border: "1px solid transparent" }
                      }
                    >
                      <span>{CAT_EMOJI(cat.categoria)}</span>
                      <span>{cat.categoria}</span>
                      <span
                        className="text-[9px] font-black px-1.5 py-0.5 rounded-full"
                        style={
                          ativa
                            ? { background: "rgba(255,255,255,0.25)", color: "#FFFFFF" }
                            : { background: "#E5E7EB", color: "#6B7280" }
                        }
                      >
                        {cat.total}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Busca local */}
          {mercado && (
            <div className="px-4 pb-3">
              <div
                className="flex items-center gap-2 px-3 rounded-xl"
                style={{ background: "#F3F4F6", border: "1px solid #E5E7EB", height: "40px" }}
              >
                <Search className="h-3.5 w-3.5 shrink-0" style={{ color: "#9CA3AF" }} />
                <input
                  type="text"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar produto neste mercado"
                  className="flex-1 bg-transparent text-sm text-[#0B1023] placeholder-[#9CA3AF] outline-none min-w-0"
                />
                {busca && (
                  <button
                    onClick={() => setBusca("")}
                    className="shrink-0 flex items-center justify-center w-5 h-5 rounded-full active:scale-90 transition-transform"
                    style={{ background: "#D1D5DB" }}
                    aria-label="Limpar busca"
                  >
                    <X className="h-3 w-3 text-[#6B7280]" />
                  </button>
                )}
              </div>
            </div>
          )}

          {mercado && <div className="mx-4 mb-1" style={{ height: "1px", background: "#F3F4F6" }} />}

          {/* Lista de ofertas */}
          <div className="flex-1">
            {mercado && (
              <p className="text-[10px] font-black text-[#9CA3AF] uppercase tracking-widest px-4 py-3 flex items-center gap-1.5">
                <Package className="h-3 w-3" />
                {temFiltro
                  ? `${ofertasFiltradas.length} ${ofertasFiltradas.length === 1 ? "resultado" : "resultados"}`
                  : "Ofertas do mercado"}
              </p>
            )}

            {loadingOfertas && (
              <>{[0, 1, 2, 3, 4].map((i) => <OfertaRowSkeleton key={i} delay={i * 0.05} />)}</>
            )}

            {!loadingOfertas && (
              <AnimatePresence>
                {ofertasFiltradas.length > 0
                  ? ofertasFiltradas.map((o, i) => (
                      <OfertaRow key={o.id} oferta={o} index={i} onOpen={() => setModalOferta(o)} />
                    ))
                  : !loadingMercado && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex flex-col items-center justify-center py-12 gap-3 px-4"
                      >
                        <Package className="h-9 w-9" style={{ color: "#D1D5DB" }} />
                        {temFiltro ? (
                          <>
                            <p className="text-sm font-bold text-[#6B7280] text-center">Nenhum resultado encontrado.</p>
                            <button
                              onClick={() => { setCategoriaAtiva(null); setBusca(""); }}
                              className="text-xs font-bold px-4 py-2 rounded-xl mt-1 transition-all active:scale-95"
                              style={{ background: "#F3F4F6", border: "1px solid #E5E7EB", color: "#374151" }}
                            >
                              Limpar filtros
                            </button>
                          </>
                        ) : (
                          <p className="text-sm font-bold text-[#6B7280] text-center">Nenhuma oferta encontrada.</p>
                        )}
                      </motion.div>
                    )}
              </AnimatePresence>
            )}
            <div className="h-6" />
          </div>
        </>
      )}

      {modalOferta && (
        <OfertaModal
          oferta={modalOferta}
          referencePrice={null}
          onClose={() => setModalOferta(null)}
          onLike={() => {}}
          onValidar={() => {}}
          onDenunciar={() => {}}
          isLiking={false}
          isValidating={false}
          isDenouncing={false}
        />
      )}
    </div>
  );
}
