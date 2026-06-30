// @ts-nocheck
/**
 * Offer quality score — measures how complete, trustworthy, and fresh an offer is.
 * Combines completeness signals, engagement, and author reliability.
 *
 * qualityScore:     0–100, shown as a "signal strength" badge in the UI.
 * authorReliability: 0–100, based on author experience relative to offers published.
 * confiancaLabel:   Human-readable label for feed trust indicators.
 */

export interface QualityInfo {
  qualityScore: number;
  authorReliability: number;
  confiancaLabel: string;
}

export function computeQuality(
  r: {
    fotoUrl: string | null;
    marca: string | null;
    bairro: string | null;
    cidade: string | null;
    latitude: number | null;
    longitude: number | null;
    validacoes: number;
    confirmacoes: number;
    denuncias: number;
    dataCriacao: Date;
    ultimaConfirmacaoEm: Date | null;
    tipoOrigem?: string | null;
  },
  autorPontos: number,
): QualityInfo {
  let score = 0;

  // ── Completeness (0–50 pts) ──────────────────────────────────────────────────
  if (r.fotoUrl) score += 25;
  if (r.marca) score += 5;
  if (r.bairro) score += 10;
  if (r.cidade) score += 5;
  if (r.latitude != null && r.longitude != null) score += 5;

  // ── Engagement (0–30 pts, capped) ───────────────────────────────────────────
  score += Math.min(30, r.validacoes * 3 + r.confirmacoes * 5);

  // ── Recency bonus (0–10 pts) ─────────────────────────────────────────────────
  const ageHours = (Date.now() - r.dataCriacao.getTime()) / 3_600_000;
  if (ageHours < 24) score += 10;
  else if (ageHours < 168) score += 5;

  // ── Recent confirmation bonus (0–10 pts) ─────────────────────────────────────
  if (r.ultimaConfirmacaoEm) {
    const confHours = (Date.now() - r.ultimaConfirmacaoEm.getTime()) / 3_600_000;
    if (confHours < 12) score += 10;
    else if (confHours < 48) score += 5;
  }

  // ── Gallery origin penalty (needs community validation to build trust) ───────
  if (r.tipoOrigem === "galeria") score -= 10;

  // ── Penalty for reports ──────────────────────────────────────────────────────
  score -= r.denuncias * 10;

  const qualityScore = Math.min(100, Math.max(0, score));

  // ── Author reliability ───────────────────────────────────────────────────────
  // Based on total points — Iniciante (0–49) maps to low reliability.
  // Each 100 points ≈ 10 reliability points. Capped at 100.
  const authorReliability = Math.min(100, Math.round(autorPontos / 10));

  // ── Confidence label ─────────────────────────────────────────────────────────
  let confiancaLabel: string;
  if (qualityScore >= 80 && r.denuncias === 0) {
    confiancaLabel = "Alta confiança";
  } else if (qualityScore >= 55 && r.denuncias <= 1) {
    confiancaLabel = "Confiável";
  } else if (r.denuncias >= 2) {
    confiancaLabel = "Questionável";
  } else if (r.tipoOrigem === "galeria" && r.validacoes === 0 && r.confirmacoes === 0) {
    confiancaLabel = "Aguardando validação";
  } else {
    confiancaLabel = "Nova";
  }

  return { qualityScore, authorReliability, confiancaLabel };
}
