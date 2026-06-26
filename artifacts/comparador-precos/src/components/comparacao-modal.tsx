import { useRef, useEffect, useState, useMemo } from "react";
import {
  X, Navigation, CheckCircle, MapPin, Clock,
  ThumbsUp, AlertTriangle, User, ArrowUpDown,
} from "lucide-react";
import { format, formatDistance, isPast, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { type Oferta } from "@workspace/api-client-react";
import { CATEGORY_CONFIG, getCategoryUnit, hasPesoVolumeNoNome } from "@/components/oferta-modal";
import { type GrupoOferta, ofertaCompareScore } from "@/lib/group-ofertas";

const R = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

function rotaUrl(o: Oferta): string {
  if (o.latitude != null && o.longitude != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${o.latitude},${o.longitude}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${o.mercado} ${o.bairro ?? ""} ${o.cidade ?? ""}`,
  )}`;
}

const NIVEL_EMOJI: Record<string, string> = {
  "Estagiário da Economia":    "🎒",
  "Assistente de Ofertas":     "🔎",
  "Bacharel das Compras":      "🎓",
  "Especialista das Gôndolas": "🏪",
  "Mestre das Pechinchas":     "💰",
  "Doutor da Economia":        "🔬",
  "PhD do Supermercado":       "🏆",
};

type StatusKey = "nova" | "validada" | "suspeita" | "expirada";
const STATUS_BADGE: Record<StatusKey, { label: string; bg: string; color: string }> = {
  nova:     { label: "Novo",     bg: "#fef3c7", color: "#b45309" },
  validada: { label: "Validado", bg: "#dcfce7", color: "#15803d" },
  suspeita: { label: "Suspeito", bg: "#fee2e2", color: "#b91c1c" },
  expirada: { label: "Expirado", bg: "#f1f5f9", color: "#64748b" },
};

type SortMode = "score" | "preco" | "validacoes" | "distancia" | "recente";

const SORT_OPTIONS: { key: SortMode; label: string }[] = [
  { key: "score",      label: "Melhor" },
  { key: "preco",      label: "Menor preço" },
  { key: "validacoes", label: "Mais validações" },
  { key: "distancia",  label: "Mais próximo" },
  { key: "recente",    label: "Mais recente" },
];

interface ComparacaoModalProps {
  grupo: GrupoOferta | null;
  onClose: () => void;
  onOpenDetail: (o: Oferta) => void;
  onValidar: (o: Oferta) => void;
  onLike: (o: Oferta) => void;
  onDenunciar: (o: Oferta) => void;
  isValidating: boolean;
}

export function ComparacaoModal({
  grupo,
  onClose,
  onOpenDetail,
  onValidar,
  onLike,
  onDenunciar,
  isValidating,
}: ComparacaoModalProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [sortMode, setSortMode] = useState<SortMode>("score");

  // Re-sort offers based on selected sort
  const sortedOfertas = useMemo(() => {
    if (!grupo) return [];
    const list = [...grupo.ofertas];
    switch (sortMode) {
      case "preco":      return list.sort((a, b) => a.preco - b.preco);
      case "validacoes": return list.sort((a, b) => b.validacoes - a.validacoes);
      case "distancia":  return list.sort((a, b) => (a.distancia ?? Infinity) - (b.distancia ?? Infinity));
      case "recente":    return list.sort((a, b) => new Date(b.dataCriacao).getTime() - new Date(a.dataCriacao).getTime());
      default:           return list.sort((a, b) => ofertaCompareScore(a) - ofertaCompareScore(b));
    }
  }, [grupo, sortMode]);

  useEffect(() => {
    if (grupo) {
      setSortMode("score");
      scrollRef.current?.scrollTo({ top: 0 });
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [grupo]);

  useEffect(() => {
    if (!grupo) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [grupo, onClose]);

  if (!grupo) return null;

  const cat = CATEGORY_CONFIG[grupo.categoria] ?? { emoji: "🛒", bg: "#f1f5f9" };
  const { savings, minPreco, maxPreco, count, produto } = grupo;
  const unit = hasPesoVolumeNoNome(produto) ? "" : getCategoryUnit(grupo.categoria);
  const ofertas = sortedOfertas;
  const savingsPct = maxPreco > 0 ? Math.round((savings / maxPreco) * 100) : 0;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 920,
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
        }}
      />

      {/* Sheet */}
      <div
        ref={scrollRef}
        data-testid="comparacao-modal"
        style={{
          position: "fixed", bottom: 0, left: 0, right: 0,
          zIndex: 930, maxHeight: "92dvh", overflowY: "auto",
          background: "#fff", borderRadius: "24px 24px 0 0",
          boxShadow: "0 -12px 60px rgba(0,0,0,0.3)",
          animation: "cmpSlideUp 0.3s cubic-bezier(0.22,1,0.36,1) both",
        }}
      >
        <style>{`
          @keyframes cmpSlideUp {
            from { transform: translateY(100%); opacity: 0; }
            to   { transform: translateY(0);    opacity: 1; }
          }
        `}</style>

        {/* ── Sticky header ── */}
        <div style={{
          position: "sticky", top: 0, background: "#fff", zIndex: 1,
          padding: "16px 18px 12px", borderBottom: "1px solid #e2e8f0",
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div style={{
              width: 46, height: 46, borderRadius: 13, background: cat.bg,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 26, flexShrink: 0,
            }}>
              {cat.emoji}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{
                margin: "0 0 1px", fontSize: 10, fontWeight: 700,
                color: "#64748b", textTransform: "uppercase", letterSpacing: 0.6,
              }}>
                Comparação de preços
              </p>
              <h2 style={{
                margin: 0, fontSize: 18, fontWeight: 900, color: "#130926",
                lineHeight: 1.2, overflow: "hidden",
                textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {produto}
              </h2>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "#64748b" }}>
                {count} {count === 1 ? "mercado encontrado" : "mercados encontrados"}
              </p>
            </div>

            <button
              onClick={onClose}
              aria-label="Fechar comparação"
              data-testid="comparacao-close"
              style={{
                width: 32, height: 32, borderRadius: "50%",
                background: "#f1f5f9", border: "none",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", flexShrink: 0,
              }}
            >
              <X size={15} color="#64748b" />
            </button>
          </div>
        </div>

        {/* ── Sort pills ── */}
        {count > 1 && (
          <div style={{
            display: "flex", gap: 6, overflowX: "auto", padding: "10px 16px 0",
            scrollbarWidth: "none",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
              <ArrowUpDown size={11} color="#94a3b8" />
              <span style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700 }}>Ordenar:</span>
            </div>
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setSortMode(opt.key)}
                style={{
                  flexShrink: 0, padding: "5px 10px", borderRadius: 100,
                  fontSize: 11, fontWeight: 700, cursor: "pointer",
                  border: sortMode === opt.key ? "none" : "1px solid #e2e8f0",
                  background: sortMode === opt.key ? "#130926" : "#f8fafc",
                  color: sortMode === opt.key ? "white" : "#64748b",
                  transition: "all 0.15s",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {/* ── Price range summary ── */}
        {count > 1 && (
          <div style={{
            margin: "12px 16px 0",
            background: "#f8fafc", border: "1px solid #e2e8f0",
            borderRadius: 14, padding: "10px 14px",
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <div>
              <p style={{ margin: 0, fontSize: 10, color: "#94a3b8", fontWeight: 600 }}>Menor preço</p>
              <p style={{ margin: 0, fontSize: 20, fontWeight: 900, color: "#84cc16", lineHeight: 1 }}>
                {R(minPreco)}{unit && <span style={{ fontSize: 11 }}>{unit}</span>}
              </p>
            </div>
            <div style={{ textAlign: "center" }}>
              {savings > 0.01 && savingsPct >= 3 && (
                <>
                  <p style={{ margin: 0, fontSize: 10, color: "#94a3b8", fontWeight: 600 }}>Economia</p>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 900, color: "#65a30d" }}>
                    💰 {R(savings)}
                  </p>
                  <p style={{ margin: 0, fontSize: 9, color: "#16a34a" }}>{savingsPct}% de diferença</p>
                </>
              )}
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ margin: 0, fontSize: 10, color: "#94a3b8", fontWeight: 600 }}>Maior preço</p>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#94a3b8", lineHeight: 1 }}>
                {R(maxPreco)}{unit && <span style={{ fontSize: 10 }}>{unit}</span>}
              </p>
            </div>
          </div>
        )}

        {/* ── Offers list ── */}
        <div style={{ padding: "12px 16px 40px", display: "flex", flexDirection: "column", gap: 10 }}>
          {ofertas.map((o, idx) => {
            const isBest  = idx === 0;
            const expired = o.status === "expirada";
            const st      = STATUS_BADGE[o.status as StatusKey] ?? STATUS_BADGE.nova;
            const timeAgo = formatDistance(new Date(o.dataCriacao), new Date(), { addSuffix: true, locale: ptBR });
            const rota    = rotaUrl(o);
            const diffVsBest = o.preco - minPreco;
            const validadeDate = o.validade ? new Date(o.validade) : null;
            const validadeText = validadeDate
              ? isPast(validadeDate)
                ? "Expirado"
                : differenceInDays(validadeDate, new Date()) <= 2
                  ? `Expira em ${differenceInDays(validadeDate, new Date()) + 1}d`
                  : `Válido até ${format(validadeDate, "dd/MM", { locale: ptBR })}`
              : null;
            const nivelEmoji = NIVEL_EMOJI[o.nivelUsuario ?? "Bronze"] ?? "🟤";

            return (
              <div
                key={o.id}
                style={{
                  background: isBest ? "#f0fdf4" : "#f8fafc",
                  border: isBest ? "1.5px solid #86efac" : "1px solid #e2e8f0",
                  borderRadius: 18, padding: "13px 14px",
                  opacity: expired ? 0.7 : 1,
                }}
              >
                {/* Row 1: rank + store + price — clickable for detail */}
                <div
                  onClick={() => onOpenDetail(o)}
                  style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 7, cursor: "pointer" }}
                >
                  {/* Rank */}
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%",
                    background: isBest ? "#84cc16" : "#e2e8f0",
                    color: isBest ? "white" : "#64748b",
                    fontWeight: 900, fontSize: 13,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0, marginTop: 1,
                  }}>
                    {idx + 1}
                  </div>

                  {/* Store + location + badges */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 800, fontSize: 15, color: "#130926" }}>
                        {o.mercado}
                      </span>
                      {isBest && !expired && (
                        <span style={{
                          fontSize: 10, fontWeight: 800, color: "#15803d",
                          background: "#dcfce7", padding: "2px 8px", borderRadius: 100,
                        }}>
                          ✓ Melhor preço
                        </span>
                      )}
                      <span style={{
                        fontSize: 10, fontWeight: 700, color: st.color,
                        background: st.bg, padding: "2px 7px", borderRadius: 100,
                      }}>
                        {st.label}
                      </span>
                    </div>
                    {(o.bairro || o.cidade) && (
                      <p style={{ margin: "2px 0 0", fontSize: 11, color: "#64748b" }}>
                        {[o.bairro, o.cidade].filter(Boolean).join(", ")}
                      </p>
                    )}
                  </div>

                  {/* Price */}
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <span style={{
                      fontSize: 21, fontWeight: 900,
                      color: isBest ? "#84cc16" : "#130926",
                      display: "block", lineHeight: 1,
                    }}>
                      {R(o.preco)}
                      {unit && <span style={{ fontSize: 11, fontWeight: 700, marginLeft: 1 }}>{unit}</span>}
                    </span>
                    {!isBest && diffVsBest > 0.01 && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, color: "#ef4444",
                        display: "block", marginTop: 2,
                      }}>
                        +{R(diffVsBest)} a mais
                      </span>
                    )}
                  </div>
                </div>

                {/* Row 2: meta strip */}
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                  flexWrap: "wrap", marginBottom: 10, paddingLeft: 38,
                }}>
                  {o.distancia != null && (
                    <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, fontWeight: 700, color: "#84cc16" }}>
                      <MapPin size={10} />
                      {o.distancia < 1 ? `${Math.round(o.distancia * 1000)} m` : `${o.distancia.toFixed(1)} km`}
                    </span>
                  )}
                  <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "#64748b" }}>
                    <CheckCircle size={10} color="#84cc16" />
                    {o.validacoes} validações
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "#64748b" }}>
                    <ThumbsUp size={10} />
                    {o.curtidas}
                  </span>
                  {o.denuncias > 0 && (
                    <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "#ef4444" }}>
                      <AlertTriangle size={10} />
                      {o.denuncias} denúncias
                    </span>
                  )}
                  {validadeText && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: isPast(validadeDate!) ? "#ef4444" : "#94a3b8" }}>
                      📅 {validadeText}
                    </span>
                  )}
                  <span style={{ display: "flex", alignItems: "center", gap: 2, fontSize: 10, color: "#94a3b8", marginLeft: "auto" }}>
                    <User size={9} />
                    {nivelEmoji} {o.usuario?.split(" ")[0] ?? "Usuário"}
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 2, fontSize: 10, color: "#94a3b8" }}>
                    <Clock size={9} />
                    {timeAgo}
                  </span>
                </div>

                {/* Row 3: action buttons */}
                <div style={{ display: "flex", gap: 6, paddingLeft: 38 }}>
                  {/* Ver rota */}
                  <a
                    href={rota}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      padding: "9px 10px", borderRadius: 11,
                      background: "#130926", color: "white",
                      fontWeight: 700, fontSize: 11,
                      textDecoration: "none",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                      flexShrink: 0,
                    }}
                  >
                    <Navigation size={12} /> Rota
                  </a>

                  {/* Confirmar / validar */}
                  <button
                    data-testid={`cmp-confirmar-${o.id}`}
                    onClick={(e) => { e.stopPropagation(); onValidar(o); }}
                    disabled={isValidating || expired}
                    style={{
                      flex: 2, padding: "9px 0", borderRadius: 11,
                      background: expired ? "#e2e8f0" : "#84cc16",
                      color: expired ? "#94a3b8" : "white",
                      border: "none", fontWeight: 700, fontSize: 11,
                      cursor: expired || isValidating ? "not-allowed" : "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                    }}
                  >
                    <CheckCircle size={12} /> Confirmar
                  </button>

                  {/* Curtir */}
                  <button
                    data-testid={`cmp-curtir-${o.id}`}
                    onClick={(e) => { e.stopPropagation(); onLike(o); }}
                    style={{
                      flex: 1, padding: "9px 0", borderRadius: 11,
                      background: "#f0fdf4", border: "1px solid #86efac",
                      color: "#15803d", fontWeight: 700, fontSize: 11,
                      cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 3,
                    }}
                  >
                    <ThumbsUp size={12} /> {o.curtidas}
                  </button>

                  {/* Denunciar */}
                  <button
                    data-testid={`cmp-denunciar-${o.id}`}
                    onClick={(e) => { e.stopPropagation(); onDenunciar(o); }}
                    title="Reportar preço incorreto"
                    style={{
                      padding: "9px 10px", borderRadius: 11,
                      background: "#fff0f0", border: "1px solid #fecaca",
                      color: "#ef4444", fontWeight: 700, fontSize: 11,
                      cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <AlertTriangle size={12} />
                  </button>
                </div>

                {/* Tap hint */}
                <p style={{ margin: "8px 0 0 38px", fontSize: 9, color: "#94a3b8" }}>
                  Toque no nome/preço para ver todos os detalhes
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
