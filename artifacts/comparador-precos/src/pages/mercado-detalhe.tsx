import { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Building2, MapPin, Clock, Package,
  AlertTriangle, Tag, Heart, Share2, Navigation, ChevronRight, Search, X,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Link, useParams } from "wouter";
import { toast } from "sonner";
import {
  useGetMercado,
  getGetMercadoQueryKey,
  useListMercadoOfertas,
  getListMercadoOfertasQueryKey,
  type Oferta,
} from "@workspace/api-client-react";
import { OfertaModal, CATEGORY_CONFIG } from "@/components/oferta-modal";
import { useSeo } from "@/lib/seo";
import { resolveMarketBrandAsset, getBannerGradient } from "@/lib/market-brand-assets";
import { setMercadoAtual } from "@/lib/mercado-atual";
import { useCidadeAtiva, findRegiaoByCity, makeRegiaoFromCity } from "@/lib/cidade-ativa";

const R = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

const CAT_EMOJI = (cat: string) => CATEGORY_CONFIG[cat]?.emoji ?? "🛒";

/* ── Skeleton ────────────────────────────────────────────────────────────── */
function Skeleton({ className }: { className?: string }) {
  return <div className={`skeleton-shimmer rounded-full ${className ?? ""}`} />;
}

function HeaderSkeleton() {
  return (
    <div>
      <div className="h-[200px] skeleton-shimmer" />
      <div className="px-4 pb-4" style={{ paddingTop: 48 }}>
        <Skeleton className="h-6 w-44 mb-2" />
        <Skeleton className="h-3.5 w-32 mb-1.5" />
        <Skeleton className="h-3 w-24 mb-4" />
        <div className="flex gap-2">
          <div className="h-10 w-24 rounded-xl skeleton-shimmer" />
          <div className="h-10 w-20 rounded-xl skeleton-shimmer" />
          <div className="h-10 w-24 rounded-xl skeleton-shimmer" />
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

/* ── OfertaRow ───────────────────────────────────────────────────────────── */
function OfertaRow({
  oferta,
  index,
  onOpen,
}: {
  oferta: Oferta;
  index: number;
  onOpen: () => void;
}) {
  const emoji = CAT_EMOJI(oferta.categoria);
  const timeAgo = formatDistanceToNow(new Date(oferta.dataCriacao), {
    addSuffix: true,
    locale: ptBR,
  });

  return (
    <motion.button
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, delay: Math.min(index * 0.03, 0.2) }}
      onClick={onOpen}
      className="w-full flex items-center gap-3 px-4 py-3 text-left border-b transition-colors"
      style={{ borderColor: "#F3F4F6", background: "transparent" }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "#FAFAFA";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "transparent";
      }}
    >
      {/* Thumbnail 56×56 */}
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

      {/* Produto + tempo */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-[#0B1023] truncate leading-snug">
          {oferta.produto}
        </p>
        <p className="text-[10px] text-[#9CA3AF] flex items-center gap-1 mt-0.5">
          <Clock className="h-2.5 w-2.5 shrink-0" />
          {timeAgo}
        </p>
      </div>

      {/* Preço */}
      <div className="shrink-0 flex items-center gap-1">
        <span className="text-sm font-black" style={{ color: "#16A34A" }}>
          {R(oferta.preco)}
        </span>
        <ChevronRight className="h-3.5 w-3.5" style={{ color: "#D1D5DB" }} />
      </div>
    </motion.button>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export default function MercadoDetalhe() {
  const params = useParams<{ id: string }>();
  const id = parseInt(params.id ?? "0", 10);

  const [modalOferta, setModalOferta] = useState<Oferta | null>(null);
  const [categoriaAtiva, setCategoriaAtiva] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [crossCityDismissed, setCrossCityDismissed] = useState(false);
  const [uploadState, setUploadState] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { cidadeAtiva, setCidade } = useCidadeAtiva();

  const {
    data: mercado,
    isLoading: loadingMercado,
    isError: errorMercado,
  } = useGetMercado(id, {
    query: { queryKey: getGetMercadoQueryKey(id), enabled: id > 0 },
  });

  const {
    data: ofertasData,
    isLoading: loadingOfertas,
  } = useListMercadoOfertas(id, undefined, {
    query: { queryKey: getListMercadoOfertasQueryKey(id), enabled: id > 0 },
  });

  useSeo({
    title: mercado?.nome ?? "Mercado",
    description: mercado
      ? `Veja todas as ${mercado.totalOfertas} ofertas do ${mercado.nome} em ${mercado.cidade ?? "sua cidade"}.`
      : "Detalhes do mercado",
    url: `https://aicompensa.com.br/mercados/${id}`,
  });

  const ofertas = ofertasData?.items ?? [];

  // Derive category counts from the SAME array used for filtering.
  // Using mercado.totalPorCategoria (unbounded backend count) would show e.g. 23
  // while the paginated list has 0 — because the 23 offers may not be in the first page.
  const categoriaContagem = useMemo(() => {
    const counts = new Map<string, number>();
    for (const o of ofertas) {
      counts.set(o.categoria, (counts.get(o.categoria) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([categoria, total]) => ({ categoria, total }));
  }, [ofertas]);

  const ofertasFiltradas = useMemo(() => {
    let result = ofertas;
    if (categoriaAtiva) {
      result = result.filter((o) => o.categoria === categoriaAtiva);
    }
    const q = busca.trim().toLowerCase();
    if (q) {
      result = result.filter((o) => o.produto.toLowerCase().includes(q));
    }
    return result;
  }, [ofertas, categoriaAtiva, busca, categoriaContagem]);

  async function handleFachadaFile(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione uma imagem.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Imagem muito grande. Máximo 8 MB.");
      return;
    }
    setUploadState("uploading");
    try {
      const reader = new FileReader();
      const base64: string = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await fetch(`/api/mercados/${id}/fotos/proposta`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ imageBase64: base64 }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Erro no upload.");
      }
      setUploadState("success");
    } catch (err: any) {
      setUploadState("error");
      toast.error(err?.message ?? "Não foi possível enviar a foto. Tente novamente.");
    }
  }

  const brand = mercado ? resolveMarketBrandAsset(mercado.nome) : null;
  const resolvedLogoUrl = mercado
    ? (mercado.logoUrl ?? brand?.logoUrl ?? null)
    : null;
  const brandColor = brand?.brandColor ?? "#10B981";
  const gradient = getBannerGradient(brand, brandColor);
  const fachadaUrl = mercado?.fachadaUrl ?? brand?.fachadaUrl ?? null;

  useEffect(() => {
    if (!mercado) return;
    setMercadoAtual({
      mercadoId: mercado.id ?? null,
      nome: mercado.nome,
      bairro: mercado.bairro ?? null,
      cidade: mercado.cidade ?? null,
      logoUrl: resolvedLogoUrl,
    });
  }, [mercado?.id]);

  const ultimaAtualizacao = mercado?.ultimaOfertaEm
    ? formatDistanceToNow(new Date(mercado.ultimaOfertaEm), { addSuffix: true, locale: ptBR })
    : null;
  const localidade = mercado
    ? [mercado.bairro, mercado.cidade, mercado.estado].filter(Boolean).join(", ")
    : "";
  const categoriaTop = categoriaContagem[0]?.categoria ?? mercado?.totalPorCategoria[0]?.categoria ?? null;

  const temFiltro = !!categoriaAtiva || busca.trim().length > 0;

  return (
    <div className="flex flex-col min-h-full bg-background">
      {/* ── Cabeçalho fixo ─────────────────────────────────────────────── */}
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
              style={{
                minHeight: "44px",
                minWidth: "44px",
                background: "#F3F4F6",
                border: "1px solid #E5E7EB",
              }}
              aria-label="Voltar"
            >
              <ArrowLeft className="h-4 w-4 text-[#374151]" />
            </button>
          </Link>
          <div className="flex-1 min-w-0">
            <p className="font-black text-[#0B1023] truncate text-sm leading-tight">
              {mercado?.nome ?? (loadingMercado ? "Carregando…" : "Mercado")}
            </p>
            {localidade && (
              <p className="text-[10px] text-[#9CA3AF] truncate">{localidade}</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Cross-region banner ───────────────────────────────────────── */}
      {!crossCityDismissed && mercado && cidadeAtiva && mercado.cidade &&
        !cidadeAtiva.cidadesIncluidas.some(
          (c) => c.toLowerCase() === mercado.cidade!.toLowerCase(),
        ) && (
        <div
          className="mx-4 mt-3 rounded-2xl px-4 py-3 flex items-start gap-3"
          style={{ background: "rgba(242,193,78,0.12)", border: "1.5px solid rgba(242,193,78,0.35)" }}
        >
          <MapPin className="h-4 w-4 text-[#F2C14E] shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-[#0B1023] text-sm font-bold leading-snug">
              Este mercado fica em {mercado.cidade}
            </p>
            <p className="text-[#6B7280] text-[11px] mt-0.5">
              Você está vendo ofertas de outra região.
            </p>
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => {
                  const regiao = findRegiaoByCity(mercado.cidade!) ?? makeRegiaoFromCity(mercado.cidade!, mercado.estado ?? "MT");
                  setCidade({
                    cidade: regiao.cidadePrimaria,
                    estado: regiao.estado,
                    regiaoId: regiao.id,
                    regiaoNome: regiao.nome,
                    cidadesIncluidas: regiao.cidadesIncluidas,
                    origem: "manual",
                  });
                  setCrossCityDismissed(true);
                }}
                className="text-[11px] font-black px-3 py-1.5 rounded-lg text-[#0B1023] active:scale-95 transition-all"
                style={{ background: "#F2C14E" }}
              >
                Ver {mercado.cidade}
              </button>
              <button
                onClick={() => setCrossCityDismissed(true)}
                className="text-[11px] font-bold px-3 py-1.5 rounded-lg text-[#6B7280] active:scale-95 transition-all"
                style={{ background: "rgba(0,0,0,0.06)" }}
              >
                Continuar na {cidadeAtiva.regiaoNome}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Upload colaborativo — quando não há fachada ───────────────────── */}
      {!fachadaUrl && mercado && !errorMercado && (
        <div
          className="mx-4 mt-3 rounded-2xl px-4 py-3 flex items-start gap-3"
          style={{ background: "rgba(22,163,74,0.07)", border: "1.5px dashed rgba(22,163,74,0.3)" }}
        >
          <span className="text-lg shrink-0 mt-0.5">📸</span>
          <div className="flex-1 min-w-0">
            {uploadState === "success" ? (
              <>
                <p className="text-[#0B1023] text-sm font-bold leading-snug">Foto enviada com sucesso!</p>
                <p className="text-[#6B7280] text-[11px] mt-0.5 leading-snug">
                  Nossa equipe irá analisá-la. Se aprovada, você receberá sua recompensa.
                </p>
              </>
            ) : (
              <>
                <p className="text-[#0B1023] text-sm font-bold leading-snug">Ajude a comunidade</p>
                <p className="text-[#6B7280] text-[11px] mt-0.5 leading-snug">
                  Este mercado ainda não tem foto da fachada. Envie uma foto real e ganhe{" "}
                  <span className="font-black text-emerald-600">+50 pontos</span>.
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFachadaFile(file);
                    e.target.value = "";
                  }}
                />
                <button
                  disabled={uploadState === "uploading"}
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-2 text-[11px] font-black px-3 py-1.5 rounded-lg text-white active:scale-95 transition-all disabled:opacity-60"
                  style={{ background: "#16A34A" }}
                >
                  {uploadState === "uploading" ? "Enviando..." : "Enviar foto"}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Erro de carregamento ────────────────────────────────────────── */}
      {errorMercado && (
        <div className="flex flex-col items-center justify-center flex-1 py-20 gap-4 px-6">
          <div className="w-20 h-20 rounded-3xl flex items-center justify-center" style={{ background: "#FEF2F2" }}>
            <AlertTriangle className="h-9 w-9" style={{ color: "#EF4444" }} />
          </div>
          <div className="text-center">
            <p className="text-base font-black text-[#0B1023]">Mercado não encontrado</p>
            <p className="text-sm text-[#6B7280] mt-1">
              Este mercado pode ter sido removido ou o link está incorreto.
            </p>
          </div>
          <Link href="/mercados">
            <button
              className="flex items-center gap-2 text-sm font-bold px-5 py-3 rounded-2xl transition-all active:scale-95"
              style={{ background: "#16A34A", color: "#FFFFFF" }}
            >
              <ArrowLeft className="h-4 w-4" />
              Ver todos os mercados
            </button>
          </Link>
        </div>
      )}

      {/* ── Conteúdo principal ─────────────────────────────────────────── */}
      {!errorMercado && (
        <>
          {/* ── Info do mercado ────────────────────────────────────────── */}
          {loadingMercado ? (
            <HeaderSkeleton />
          ) : mercado ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="overflow-hidden"
            >
              {/* ── Hero banner ── */}
              <div className="relative overflow-hidden" style={{ height: 200 }}>
                {fachadaUrl ? (
                  <img
                    src={fachadaUrl}
                    alt=""
                    aria-hidden
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0" style={{ background: gradient }} />
                )}
                {/* Overlay de profundidade */}
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(to bottom, rgba(0,0,0,0.06) 0%, rgba(0,0,0,0.58) 100%)",
                  }}
                />

                {/* Logo centralizado na borda inferior */}
                <div
                  className="absolute left-1/2 -translate-x-1/2"
                  style={{ bottom: -32 }}
                >
                  <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center overflow-hidden"
                    style={{
                      background: "#FFFFFF",
                      boxShadow: "0 6px 24px rgba(0,0,0,0.24)",
                      border: "3px solid #FFFFFF",
                    }}
                  >
                    {resolvedLogoUrl ? (
                      <img
                        src={resolvedLogoUrl}
                        alt={mercado.nome}
                        loading="lazy"
                        className="w-full h-full object-contain p-1.5"
                        onError={(e) => {
                          const el = e.target as HTMLImageElement;
                          el.style.display = "none";
                          (el.parentElement as HTMLDivElement).innerHTML =
                            `<span style="font-size:26px">🏪</span>`;
                        }}
                      />
                    ) : (
                      <Building2 className="h-7 w-7" style={{ color: brandColor }} />
                    )}
                  </div>
                </div>
              </div>

              {/* ── Info section ── */}
              <div className="px-4 pb-3" style={{ paddingTop: 48 }}>
                <h1 className="font-black text-[#0B1023] text-xl leading-tight">
                  {mercado.nome}
                </h1>
                {localidade && (
                  <p className="text-sm text-[#9CA3AF] flex items-center gap-1 mt-1">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    {localidade}
                  </p>
                )}
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  <span className="text-sm font-black" style={{ color: "#16A34A" }}>
                    {mercado.totalOfertas} {mercado.totalOfertas === 1 ? "oferta" : "ofertas"}
                  </span>
                  {categoriaTop && (
                    <>
                      <span className="text-[#E5E7EB] text-[10px]">·</span>
                      <span className="text-xs text-[#9CA3AF]">
                        {CAT_EMOJI(categoriaTop)} mais em {categoriaTop}
                      </span>
                    </>
                  )}
                  {ultimaAtualizacao && (
                    <>
                      <span className="text-[#E5E7EB] text-[10px]">·</span>
                      <p className="text-xs text-[#9CA3AF] flex items-center gap-1">
                        <Clock className="h-3 w-3 shrink-0" />
                        {ultimaAtualizacao}
                      </p>
                    </>
                  )}
                </div>

                {/* ── Ações ── */}
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => toast("Em breve: você poderá traçar rota até este mercado.")}
                    className="flex items-center gap-1.5 px-3.5 h-10 rounded-xl text-xs font-bold transition-all active:scale-95"
                    style={{ background: brandColor, color: "#FFFFFF" }}
                  >
                    <Navigation className="h-3.5 w-3.5" />
                    Ver rota
                  </button>
                  <button
                    onClick={() => toast("Em breve: você poderá favoritar este mercado.")}
                    className="flex items-center gap-1.5 px-3.5 h-10 rounded-xl text-xs font-bold transition-all active:scale-95"
                    style={{ background: "#F3F4F6", border: "1px solid #E5E7EB", color: "#6B7280" }}
                  >
                    <Heart className="h-3.5 w-3.5" />
                    Favoritar
                  </button>
                  <button
                    onClick={async () => {
                      const text = `${mercado.nome} — ${mercado.totalOfertas} ofertas disponíveis\nhttps://aicompensa.com.br/mercados/${mercado.id}`;
                      try {
                        if (navigator.share) {
                          await navigator.share({ title: mercado.nome, text, url: `https://aicompensa.com.br/mercados/${mercado.id}` });
                        } else {
                          await navigator.clipboard.writeText(text);
                          toast("Link copiado!");
                        }
                      } catch {
                        // user cancelled
                      }
                    }}
                    className="flex items-center gap-1.5 px-3.5 h-10 rounded-xl text-xs font-bold transition-all active:scale-95"
                    style={{ background: "#F3F4F6", border: "1px solid #E5E7EB", color: "#6B7280" }}
                  >
                    <Share2 className="h-3.5 w-3.5" />
                    Compartilhar
                  </button>
                </div>
              </div>
            </motion.div>
          ) : null}

          {/* ── Categorias clicáveis ────────────────────────────────────── */}
          {mercado && categoriaContagem.length > 0 && (
            <div className="pb-3">
              <p className="text-[10px] font-black text-[#9CA3AF] uppercase tracking-widest mb-2 flex items-center gap-1.5 px-4">
                <Tag className="h-3 w-3" />
                Por categoria
              </p>
              {/* Scroll horizontal — sem padding-right para não cortar o último chip */}
              <div className="flex gap-2 overflow-x-auto pl-4 pr-4 pb-1" style={{ scrollbarWidth: "none" }}>
                {/* Chip "Todas" */}
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

                {categoriaContagem.map((cat) => {
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

          {/* ── Busca local ────────────────────────────────────────────── */}
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

          {/* ── Divisor ────────────────────────────────────────────────── */}
          {mercado && (
            <div
              className="mx-4 mb-1"
              style={{ height: "1px", background: "#F3F4F6" }}
            />
          )}

          {/* ── Lista de ofertas ────────────────────────────────────────── */}
          <div className="flex-1">
            {mercado && (
              <p className="text-[10px] font-black text-[#9CA3AF] uppercase tracking-widest px-4 py-3 flex items-center gap-1.5">
                <Package className="h-3 w-3" />
                {temFiltro
                  ? `${ofertasFiltradas.length} ${ofertasFiltradas.length === 1 ? "resultado" : "resultados"}`
                  : "Ofertas do mercado"}
              </p>
            )}

            {/* Skeleton ofertas */}
            {loadingOfertas && (
              <>
                {[0, 1, 2, 3, 4].map((i) => (
                  <OfertaRowSkeleton key={i} delay={i * 0.05} />
                ))}
              </>
            )}

            {/* Lista filtrada */}
            {!loadingOfertas && (
              <AnimatePresence>
                {ofertasFiltradas.length > 0
                  ? ofertasFiltradas.map((o, i) => (
                      <OfertaRow
                        key={o.id}
                        oferta={o}
                        index={i}
                        onOpen={() => setModalOferta(o)}
                      />
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
                            <p className="text-sm font-bold text-[#6B7280] text-center">
                              Nenhum resultado encontrado.
                            </p>
                            <p className="text-[11px] text-[#9CA3AF] text-center">
                              Tente outro termo ou limpe os filtros.
                            </p>
                            <button
                              onClick={() => { setCategoriaAtiva(null); setBusca(""); }}
                              className="text-xs font-bold px-4 py-2 rounded-xl mt-1 transition-all active:scale-95"
                              style={{ background: "#F3F4F6", border: "1px solid #E5E7EB", color: "#374151" }}
                            >
                              Limpar filtros
                            </button>
                          </>
                        ) : (
                          <>
                            <p className="text-sm font-bold text-[#6B7280] text-center">
                              Nenhuma oferta encontrada.
                            </p>
                            <p className="text-[11px] text-[#9CA3AF] text-center">
                              Seja o primeiro a publicar uma oferta aqui!
                            </p>
                          </>
                        )}
                      </motion.div>
                    )}
              </AnimatePresence>
            )}

            <div className="h-6" />
          </div>
        </>
      )}

      {/* ── Modal de detalhe da oferta ──────────────────────────────────── */}
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
