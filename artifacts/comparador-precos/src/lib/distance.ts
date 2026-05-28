import { type Oferta } from "@workspace/api-client-react";

/**
 * Haversine formula — straight-line distance in km between two lat/lng points.
 */
export function calculateDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Human-readable distance string.
 * Examples: "850 m de você" | "1,4 km de você" | "Distância indisponível"
 */
export function formatDistance(km: number | null | undefined): string {
  if (km == null) return "Distância indisponível";
  if (km < 1) return `${Math.round(km * 1000)} m de você`;
  return `${km.toFixed(1).replace(".", ",")} km de você`;
}

/**
 * Estimated travel time at ~20 km/h (urban average).
 */
export function tempoEstimadoMin(km: number): number {
  return Math.max(1, Math.round(km * 3));
}

/**
 * Best-value composite score for an offer (LOWER = better).
 *
 * Factors:
 *  - price      (primary driver)
 *  - distance   (penalizes distant offers)
 *  - trust      (validacoes × 2 + curtidas − denuncias × 3)
 *  - expiry     (expired offers always last)
 */
export function getBestValueScore(oferta: Oferta): number {
  if (oferta.status === "expirada") return Infinity;
  const dist = oferta.distancia ?? 0;
  const trust = Math.max(0, oferta.validacoes * 2 + oferta.curtidas - oferta.denuncias * 3);
  return (oferta.preco * (1 + 0.15 * dist)) / (1 + trust * 0.05);
}

/**
 * Radar badge logic — returns a badge key or null.
 *
 * Priority: "perto" > "menor_regiao" > "vale_viagem" > null
 */
export type RadarBadge =
  | "perto"          // ≤ 1 km
  | "menor_regiao"   // cheapest in nearby set for this product
  | "vale_viagem"    // good price even if a bit farther
  | null;

export function getRadarBadge(oferta: Oferta, nearbyGroup: Oferta[]): RadarBadge {
  if (!oferta.distancia) return null;

  if (oferta.distancia <= 1) return "perto";

  const sameProduct = nearbyGroup.filter(
    (o) => o.produto.toLowerCase().trim() === oferta.produto.toLowerCase().trim(),
  );
  if (sameProduct.length > 1) {
    const minPrice = Math.min(...sameProduct.map((o) => o.preco));
    if (oferta.preco <= minPrice) return "menor_regiao";
  }

  // "Vale a viagem" = within 5 km, well validated, good price
  if (oferta.distancia <= 5 && oferta.validacoes >= 3) return "vale_viagem";

  return null;
}

/**
 * Persist user coordinates in localStorage.
 */
const COORDS_KEY = "comparador-user-coords";

export function saveCoords(coords: { lat: number; lng: number } | null) {
  try {
    if (coords) {
      localStorage.setItem(COORDS_KEY, JSON.stringify(coords));
    } else {
      localStorage.removeItem(COORDS_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export function loadCoords(): { lat: number; lng: number } | null {
  try {
    const raw = localStorage.getItem(COORDS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as { lat: number; lng: number };
  } catch {
    return null;
  }
}
