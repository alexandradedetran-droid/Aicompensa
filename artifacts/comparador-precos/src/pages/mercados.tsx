import { motion, AnimatePresence } from "framer-motion";
import { Package, Clock, AlertTriangle, Building2, MapPin, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Link } from "wouter";
import { useListMercados } from "@workspace/api-client-react";
import { PageHeader } from "@/components/page-header";
import { useSeo } from "@/lib/seo";
import { resolveMarketBrandAsset, getBannerGradient } from "@/lib/market-brand-assets";
import { setMercadoAtual } from "@/lib/mercado-atual";
import { useCidadeAtiva } from "@/lib/cidade-ativa";

const R = new Intl.NumberFormat("pt-BR").format;

/* ── Skeleton ────────────────────────────────────────────────────────────── */
function MercadoSkeleton({ delay = 0 }: { delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay }}
    >
      <div
        className="rounded-2xl overflow-hidden"
        style={{ border: "1px solid #E5E7EB", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}
      >
        {/* Banner shimmer */}
        <div className="h-[128px] skeleton-shimmer" />
        {/* Info shimmer */}
        <div className="px-4 pb-4 bg-white" style={{ paddingTop: 40 }}>
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex-1 space-y-1.5">
              <div className="h-4 w-44 rounded-full skeleton-shimmer" />
              <div className="h-3 w-28 rounded-full skeleton-shimmer" />
            </div>
            <div className="h-10 w-12 rounded-xl skeleton-shimmer shrink-0" />
          </div>
          <div className="h-3 w-20 rounded-full skeleton-shimmer" />
        </div>
      </div>
    </motion.div>
  );
}

/* ── MercadoCard ─────────────────────────────────────────────────────────── */
interface MercadoCardItem {
  id: number | null;
  legacyKey?: string | null;
  isLegacy?: boolean;
  nome: string;
  cidade?: string | null;
  bairro?: string | null;
  estado?: string | null;
  totalOfertas: number;
  ultimaOfertaEm?: string | null;
  logoUrl?: string | null;
  fachadaUrl?: string | null;
}

function MercadoCard({ m, index }: { m: MercadoCardItem; index: number }) {
  const localidade = [m.bairro, m.cidade].filter(Boolean).join(" · ");
  const ultimaAtualizacao = m.ultimaOfertaEm
    ? formatDistanceToNow(new Date(m.ultimaOfertaEm), { addSuffix: true, locale: ptBR })
    : null;
  const brand = resolveMarketBrandAsset(m.nome);
  const resolvedLogoUrl = m.logoUrl ?? brand?.logoUrl ?? null;
  const brandColor = brand?.brandColor ?? "#6B7280";
  const gradient = getBannerGradient(brand, brandColor);
  const fachadaUrl = m.fachadaUrl ?? brand?.fachadaUrl ?? null;
  const href =
    m.isLegacy && m.legacyKey ? `/mercados/legacy/${m.legacyKey}` : `/mercados/${m.id}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay: Math.min(index * 0.05, 0.3) }}
      whileTap={{ scale: 0.98 }}
    >
      <Link href={href}>
        <div
          onClick={() =>
            setMercadoAtual({
              mercadoId: m.id ?? null,
              nome: m.nome,
              bairro: m.bairro ?? null,
              cidade: m.cidade ?? null,
              logoUrl: resolvedLogoUrl,
            })
          }
          className="rounded-2xl overflow-hidden cursor-pointer"
          style={{
            border: "1px solid #E5E7EB",
            boxShadow: "0 4px 20px rgba(0,0,0,0.09)",
          }}
        >
          {/* ── Banner / Fachada ── */}
          <div className="relative overflow-hidden" style={{ height: 128 }}>
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
                  "linear-gradient(to bottom, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0.52) 100%)",
              }}
            />

            {/* Badge não verificado */}
            {m.isLegacy && (
              <div
                className="absolute top-3 left-3 px-2 py-1 rounded-lg text-[9px] font-bold flex items-center gap-1"
                style={{
                  background: "rgba(0,0,0,0.55)",
                  color: "#E5E7EB",
                  backdropFilter: "blur(4px)",
                }}
              >
                <AlertTriangle className="h-2.5 w-2.5" />
                não verificado
              </div>
            )}

            {/* Logo — sobrepõe a borda banner / info */}
            <div className="absolute left-4" style={{ bottom: -28 }}>
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center overflow-hidden"
                style={{
                  background: "#FFFFFF",
                  boxShadow: "0 4px 16px rgba(0,0,0,0.22)",
                  border: "2.5px solid #FFFFFF",
                }}
              >
                {resolvedLogoUrl ? (
                  <img
                    src={resolvedLogoUrl}
                    alt={m.nome}
                    loading="lazy"
                    className="w-full h-full object-contain p-1.5"
                    onError={(e) => {
                      const el = e.target as HTMLImageElement;
                      el.style.display = "none";
                      (el.parentElement as HTMLDivElement).innerHTML =
                        `<span style="font-size:24px">🏪</span>`;
                    }}
                  />
                ) : (
                  <Building2 className="h-6 w-6" style={{ color: brandColor }} />
                )}
              </div>
            </div>
          </div>

          {/* ── Info ── */}
          <div
            className="px-4 pb-4"
            style={{ background: "#FFFFFF", paddingTop: 40 }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-black text-[#0B1023] text-[15px] leading-tight truncate">
                  {m.nome}
                </p>
                {localidade && (
                  <p className="text-[11px] text-[#9CA3AF] flex items-center gap-1 mt-0.5 truncate">
                    <MapPin className="h-2.5 w-2.5 shrink-0" />
                    {localidade}
                  </p>
                )}
              </div>

              <div className="shrink-0 flex flex-col items-end">
                <span
                  className="text-sm font-black leading-none"
                  style={{ color: m.totalOfertas > 0 ? "#16A34A" : "#9CA3AF" }}
                >
                  {R(m.totalOfertas)}
                </span>
                <span className="text-[9px] text-[#9CA3AF] font-semibold mt-0.5">
                  ofertas
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between mt-2.5">
              {ultimaAtualizacao ? (
                <p className="text-[10px] text-[#9CA3AF] flex items-center gap-1">
                  <Clock className="h-2.5 w-2.5 shrink-0" />
                  {ultimaAtualizacao}
                </p>
              ) : (
                <span />
              )}

              <span
                className="text-[10px] font-black flex items-center gap-0.5"
                style={{ color: brandColor }}
              >
                Ver ofertas
                <ChevronRight className="h-3.5 w-3.5" />
              </span>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export default function Mercados() {
  useSeo({
    title: "Mercados",
    description:
      "Veja todos os supermercados com ofertas cadastradas pela comunidade. Compare preços por mercado e encontre onde comprar mais barato.",
    url: "https://aicompensa.com.br/mercados",
  });

  const { cidadeAtiva, setShowSelector } = useCidadeAtiva();
  const cityParams = cidadeAtiva
    ? { cidades: cidadeAtiva.cidadesIncluidas.join(",") }
    : undefined;
  const { data: mercados, isLoading, isError } = useListMercados(cityParams);

  return (
    <div className="flex flex-col min-h-full bg-[#F4F6F8]">
      <PageHeader theme="light">
        <div className="px-4 pb-3 pt-1">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-black text-[#0B1023]">Mercados</h1>
              <p className="text-[11px] text-[#9CA3AF] mt-0.5">
                {cidadeAtiva
                  ? `Supermercados na ${cidadeAtiva.regiaoNome}`
                  : "Supermercados com ofertas da comunidade"}
              </p>
            </div>
            {cidadeAtiva && (
              <button
                onClick={() => setShowSelector(true)}
                className="text-[11px] font-bold text-[#F2C14E] underline underline-offset-2 shrink-0"
              >
                Trocar região
              </button>
            )}
          </div>
        </div>
      </PageHeader>

      <div className="flex-1 px-4 py-4 space-y-4">
        {/* Loading */}
        {isLoading && (
          <>
            {[0, 1, 2, 3].map((i) => (
              <MercadoSkeleton key={i} delay={i * 0.07} />
            ))}
          </>
        )}

        {/* Erro */}
        {isError && !isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-16 gap-3"
          >
            <AlertTriangle className="h-10 w-10" style={{ color: "#D1D5DB" }} />
            <p className="text-sm font-bold text-[#6B7280] text-center">
              Não foi possível carregar os mercados.
            </p>
            <p className="text-[11px] text-[#9CA3AF] text-center">
              Verifique sua conexão e tente novamente.
            </p>
          </motion.div>
        )}

        {/* Lista */}
        {!isLoading && !isError && mercados && mercados.length > 0 && (
          <AnimatePresence>
            {mercados.map((m, i) => (
              <MercadoCard key={m.id ?? `legacy-${m.legacyKey ?? i}`} m={m} index={i} />
            ))}
          </AnimatePresence>
        )}

        {/* Vazio */}
        {!isLoading && !isError && mercados && mercados.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-16 gap-3"
          >
            <Package className="h-10 w-10" style={{ color: "#D1D5DB" }} />
            <p className="text-sm font-bold text-[#6B7280] text-center">
              Nenhum mercado encontrado.
            </p>
            <p className="text-[11px] text-[#9CA3AF] text-center">
              Publique a primeira oferta e o mercado aparecerá aqui!
            </p>
          </motion.div>
        )}

        <div className="h-4" />
      </div>
    </div>
  );
}
