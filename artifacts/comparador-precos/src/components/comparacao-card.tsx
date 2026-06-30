import { useGetComparacao, getGetComparacaoQueryKey, type RankingItem } from "@workspace/api-client-react";

const R = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

function medalLabel(posicao: number): string {
  if (posicao === 1) return "🥇";
  if (posicao === 2) return "🥈";
  if (posicao === 3) return "🥉";
  return `${posicao}º`;
}

function RankingRow({ item }: { item: RankingItem }) {
  const isBest = item.posicao === 1;
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 14px",
      background: isBest ? "#f0fdf4" : item.isOfertaAtual ? "#FFFBEB" : "#f8fafc",
      borderBottom: "1px solid #e2e8f0",
      borderLeft: isBest ? "3px solid #16A34A" : item.isOfertaAtual ? "3px solid #F2C14E" : "3px solid transparent",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <span style={{ fontSize: 16, flexShrink: 0, minWidth: 22, textAlign: "center" }}>
          {medalLabel(item.posicao)}
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" as const }}>
            <span style={{
              fontSize: 13, fontWeight: 800, color: "#130926",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
            }}>
              {item.mercado}
            </span>
            {item.isOfertaAtual && (
              <span style={{
                fontSize: 10, fontWeight: 800, color: "#B45309",
                background: "#FEF3C7", padding: "1px 7px", borderRadius: 100,
                flexShrink: 0,
              }}>
                Oferta atual
              </span>
            )}
          </div>
          {item.distanciaKm != null && (
            <span style={{ fontSize: 11, color: "#9CA3AF" }}>{item.distanciaKm} km</span>
          )}
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 8 }}>
        <span style={{
          fontSize: 15, fontWeight: 900,
          color: isBest ? "#16A34A" : "#130926",
          display: "block",
        }}>
          {R(item.preco)}
        </span>
        {item.diferencaValor > 0 && (
          <span style={{ fontSize: 10, color: "#DC2626", fontWeight: 700 }}>
            +{R(item.diferencaValor)}
          </span>
        )}
      </div>
    </div>
  );
}

function PriceRanking({ ranking, isLoading, precoAtual }: {
  ranking: RankingItem[];
  isLoading: boolean;
  precoAtual: number;
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <p style={{
        margin: "0 0 10px",
        fontSize: 12, fontWeight: 700, color: "#64748b",
        textTransform: "uppercase" as const, letterSpacing: 0.5,
      }}>
        🏪 Ranking de preços
      </p>

      {isLoading ? (
        <div style={{
          background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 14,
          padding: "12px 16px", display: "flex", alignItems: "center", gap: 10,
        }}>
          <style>{`@keyframes ranking-spin { to { transform: rotate(360deg); } }`}</style>
          <div style={{
            width: 16, height: 16, borderRadius: "50%",
            border: "2px solid #E5E7EB", borderTopColor: "#F2C14E",
            animation: "ranking-spin 0.8s linear infinite", flexShrink: 0,
          }} />
          <span style={{ fontSize: 13, color: "#9CA3AF", fontWeight: 600 }}>
            Buscando preços da região...
          </span>
        </div>
      ) : ranking.length === 0 ? (
        <div style={{
          background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 14,
          padding: "12px 16px", display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{ fontSize: 14 }}>🔍</span>
          <p style={{ margin: 0, fontSize: 12, color: "#9CA3AF", fontWeight: 600 }}>
            Não há mercados suficientes para montar um ranking.
          </p>
        </div>
      ) : (
        <>
          <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid #e2e8f0" }}>
            {ranking.map((item) => (
              <RankingRow key={`${item.mercado}-${item.posicao}`} item={item} />
            ))}
          </div>

          {/* Economia máxima possível */}
          {(() => {
            const melhorPreco = ranking[0]!.preco;
            const economiaMax = Math.round((precoAtual - melhorPreco) * 100) / 100;
            if (economiaMax <= 0 || ranking[0]!.isOfertaAtual) return null;
            return (
              <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{
                  fontSize: 12, fontWeight: 800, color: "#15803D",
                  background: "#DCFCE7", padding: "4px 12px", borderRadius: 100,
                }}>
                  💰 Economia máxima possível: {R(economiaMax)}
                </span>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}

interface ComparacaoCardProps {
  ofertaId: number;
}

export function ComparacaoCard({ ofertaId }: ComparacaoCardProps) {
  const { data, isLoading } = useGetComparacao(ofertaId, {
    query: { queryKey: getGetComparacaoQueryKey(ofertaId), staleTime: 5 * 60 * 1000 },
  });

  return (
    <>
      {/* ── Status card ─────────────────────────────────────────── */}
      {isLoading ? (
        <div style={{
          marginBottom: 20,
          background: "#F9FAFB",
          border: "1px solid #E5E7EB",
          borderRadius: 16,
          padding: "14px 16px",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}>
          <style>{`@keyframes comparacao-spin { to { transform: rotate(360deg); } }`}</style>
          <div style={{
            width: 18, height: 18, borderRadius: "50%",
            border: "2.5px solid #E5E7EB",
            borderTopColor: "#F2C14E",
            animation: "comparacao-spin 0.8s linear infinite",
            flexShrink: 0,
          }} />
          <span style={{ fontSize: 13, color: "#9CA3AF", fontWeight: 600 }}>
            Comparando preços na região...
          </span>
        </div>
      ) : !data || data.status === "INSUFFICIENT_DATA" ? (
        <div style={{
          marginBottom: 20,
          background: "#F9FAFB",
          border: "1px solid #E5E7EB",
          borderRadius: 16,
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}>
          <span style={{ fontSize: 15 }}>🔍</span>
          <p style={{ margin: 0, fontSize: 12, color: "#9CA3AF", fontWeight: 600 }}>
            Ainda não há ofertas suficientes para comparação.
          </p>
        </div>
      ) : data.status === "CURRENT_IS_BEST" ? (
        <div style={{
          marginBottom: 20,
          background: "#F0FDF4",
          border: "1.5px solid #BBF7D0",
          borderRadius: 16,
          padding: "14px 16px",
        }}>
          <p style={{ margin: "0 0 4px", fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase" as const, letterSpacing: 0.5 }}>
            🏆 Comparação de mercados
          </p>
          <p style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 800, color: "#16A34A" }}>
            Melhor preço da região
          </p>
          <p style={{ margin: 0, fontSize: 12, color: "#6B7280" }}>
            Você já está vendo a melhor oferta disponível.
          </p>
          {data.mercadosComparados > 0 && (
            <p style={{ margin: "6px 0 0", fontSize: 11, color: "#9CA3AF" }}>
              {data.mercadosComparados} {data.mercadosComparados === 1 ? "mercado comparado" : "mercados comparados"}
            </p>
          )}
        </div>
      ) : (
        // HAS_BETTER_PRICE
        <div style={{
          marginBottom: 20,
          background: "#FFFBEB",
          border: "1.5px solid #FCD34D",
          borderRadius: 16,
          padding: "14px 16px",
        }}>
          <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase" as const, letterSpacing: 0.5 }}>
            💡 Melhor preço encontrado
          </p>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" as const, gap: 6 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "#0B1023", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                {data.mercado!.nome}
              </p>
              {(data.mercado!.cidade || data.distanciaKm != null) && (
                <p style={{ margin: "2px 0 0", fontSize: 12, color: "#6B7280" }}>
                  {[data.mercado!.cidade, data.distanciaKm != null ? `${data.distanciaKm} km` : null].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
            <span style={{ fontSize: 24, fontWeight: 900, color: "#16A34A", lineHeight: 1, flexShrink: 0 }}>
              {R(data.melhorPreco!)}
            </span>
          </div>

          <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #FCD34D" }}>
            <span style={{
              display: "inline-block",
              fontSize: 13, fontWeight: 800,
              color: "#15803D", background: "#DCFCE7",
              padding: "4px 12px", borderRadius: 100,
            }}>
              💰 Economia: {R(data.economiaValor!)} ({data.economiaPercentual}%)
            </span>
          </div>

          {data.mercadosComparados > 0 && (
            <p style={{ margin: "8px 0 0", fontSize: 11, color: "#9CA3AF" }}>
              {data.mercadosComparados} {data.mercadosComparados === 1 ? "mercado comparado" : "mercados comparados"}
            </p>
          )}
        </div>
      )}

      {/* ── Price ranking ────────────────────────────────────────── */}
      <PriceRanking
        ranking={data?.ranking ?? []}
        isLoading={isLoading}
        precoAtual={data?.precoAtual ?? 0}
      />
    </>
  );
}
