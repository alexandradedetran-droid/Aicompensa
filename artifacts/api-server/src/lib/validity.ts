// @ts-nocheck
/**
 * Validity scoring system — computes how likely an offer still reflects reality.
 *
 * Each category has a TTL (hours). Score decays based on age vs TTL and time
 * since last confirmation. Offers past their TTL are flagged for auto-expiry.
 */

export const CATEGORY_TTL_HOURS: Record<string, number> = {
  Hortifruti:  72,   // 3 days — fresh produce
  Carnes:      96,   // 4 days — meat
  "Laticínios": 120, // 5 days — dairy
  Padaria:     48,   // 2 days — bakery
  Bebidas:     168,  // 7 days
  Alimentos:   168,  // 7 days
  Limpeza:     240,  // 10 days
  Higiene:     240,  // 10 days
  "Eletrônicos": 720, // 30 days
  Atacado:     336,  // 14 days
  Outros:      168,  // 7 days (default)
};

export type ValidityLabel =
  | "Recém confirmada"
  | "Ativa"
  | "Expirando"
  | "Possivelmente expirada"
  | "Desatualizada";

export interface ValidityInfo {
  validityScore: number;          // 0–100
  validityLabel: ValidityLabel;
  horasDesdeConfirmacao: number | null;
}

export function computeValidity(r: {
  categoria: string;
  dataCriacao: Date;
  ultimaConfirmacaoEm: Date | null;
  ultimaValidacaoEm: Date | null;
  confirmacoes: number;
  validacoes: number;
}): ValidityInfo {
  const ttlHours = CATEGORY_TTL_HOURS[r.categoria] ?? 168;
  const now = Date.now();

  // Most recent community signal
  const lastSignal =
    r.ultimaConfirmacaoEm ??
    r.ultimaValidacaoEm ??
    r.dataCriacao;

  const horasDesdeAtividade = (now - lastSignal.getTime()) / 3_600_000;
  const horasDesdeConfirmacao = r.ultimaConfirmacaoEm
    ? (now - r.ultimaConfirmacaoEm.getTime()) / 3_600_000
    : null;
  const ageHours = (now - r.dataCriacao.getTime()) / 3_600_000;

  // Activity decay: 0 → 1 (how fresh is the last signal relative to half TTL)
  const activityDecay = Math.max(0, 1 - horasDesdeAtividade / (ttlHours * 0.5));
  // Age decay: 0 → 1 (how old vs full TTL)
  const ageDecay = Math.max(0, 1 - ageHours / ttlHours);
  // Engagement bonus (max 0.20): confirmed many times = higher trust
  const engagementBonus = Math.min(0.2, r.confirmacoes * 0.05 + r.validacoes * 0.02);

  const validityScore = Math.round(
    Math.min(100, Math.max(0, (activityDecay * 0.6 + ageDecay * 0.4 + engagementBonus) * 100)),
  );

  let validityLabel: ValidityLabel;
  if (horasDesdeConfirmacao !== null && horasDesdeConfirmacao < 6) {
    validityLabel = "Recém confirmada";
  } else if (validityScore >= 60) {
    validityLabel = "Ativa";
  } else if (validityScore >= 35) {
    validityLabel = "Expirando";
  } else if (validityScore >= 15) {
    validityLabel = "Possivelmente expirada";
  } else {
    validityLabel = "Desatualizada";
  }

  return {
    validityScore,
    validityLabel,
    horasDesdeConfirmacao: horasDesdeConfirmacao != null
      ? Math.round(horasDesdeConfirmacao)
      : null,
  };
}

/**
 * Returns true if an offer should be auto-expired based on category TTL.
 * Offers with many validations receive up to 1.5× extended TTL.
 */
export function isAutoExpired(r: {
  categoria: string;
  dataCriacao: Date;
  ultimaConfirmacaoEm: Date | null;
  validacoes: number;
}): boolean {
  const ttlHours = CATEGORY_TTL_HOURS[r.categoria] ?? 168;
  const lastActivity = r.ultimaConfirmacaoEm ?? r.dataCriacao;
  const ageHours = (Date.now() - lastActivity.getTime()) / 3_600_000;
  // Offers with many validations get up to 1.5× extended TTL
  const ttlMultiplier = Math.min(1.5, 1 + r.validacoes * 0.1);
  return ageHours > ttlHours * ttlMultiplier;
}
