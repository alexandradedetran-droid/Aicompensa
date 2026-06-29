/** Haversine distance in metres between two GPS points. */
export function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

/** Reverse-geocode lat/lng via Nominatim. Returns bairro + cidade strings. */
export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<{ bairro: string; cidade: string }> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=pt-BR`,
      { headers: { "User-Agent": "AiCompensa/1.0 (aicompensa.com.br)" } },
    );
    if (!res.ok) return { bairro: "", cidade: "" };
    const data = (await res.json()) as { address?: Record<string, string> };
    const addr = data.address ?? {};
    const bairro =
      addr.suburb ?? addr.neighbourhood ?? addr.district ?? addr.quarter ?? addr.hamlet ?? "";
    const cidade =
      addr.city ?? addr.town ?? addr.municipality ?? addr.county ?? addr.state_district ?? "";
    return { bairro, cidade };
  } catch {
    return { bairro: "", cidade: "" };
  }
}

/** A market confirmed by the user when publishing an offer. */
export type ConfirmedMarket = {
  nome: string;
  bairro: string;
  cidade: string;
  endereco?: string;
  lat?: number;
  lng?: number;
  distanciaMetros?: number;
  mercadoId?: number;
};

const RECENTES_KEY = "mercados_recentes_v1";
const MAX_RECENTES = 5;

export function getMercadosRecentes(): ConfirmedMarket[] {
  try {
    const raw = localStorage.getItem(RECENTES_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ConfirmedMarket[];
  } catch {
    return [];
  }
}

export function saveMercadoRecente(market: ConfirmedMarket): void {
  try {
    const existing = getMercadosRecentes().filter(
      (m) => m.nome.toLowerCase() !== market.nome.toLowerCase(),
    );
    const updated = [market, ...existing].slice(0, MAX_RECENTES);
    localStorage.setItem(RECENTES_KEY, JSON.stringify(updated));
  } catch {
    // ignore storage errors
  }
}
