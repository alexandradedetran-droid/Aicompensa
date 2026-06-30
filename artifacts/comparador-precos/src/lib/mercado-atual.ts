import type { ConfirmedMarket } from "./geo";

export interface MercadoAtual {
  mercadoId: number | null;
  nome: string;
  bairro: string;
  cidade: string;
  logoUrl: string | null;
  salvoEm: number;
}

const KEY = "mercado_atual_v1";
const FRESH_MS = 6 * 60 * 60 * 1000; // 6 hours

export function getMercadoAtual(): MercadoAtual | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MercadoAtual;
    if (!parsed.nome || typeof parsed.salvoEm !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setMercadoAtual(mercado: {
  mercadoId?: number | null;
  nome: string;
  bairro?: string | null;
  cidade?: string | null;
  logoUrl?: string | null;
}): void {
  try {
    const data: MercadoAtual = {
      mercadoId: mercado.mercadoId ?? null,
      nome: mercado.nome,
      bairro: mercado.bairro ?? "",
      cidade: mercado.cidade ?? "",
      logoUrl: mercado.logoUrl ?? null,
      salvoEm: Date.now(),
    };
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // ignore storage errors
  }
}

export function clearMercadoAtual(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

export function isMercadoAtualFresh(mercado: MercadoAtual): boolean {
  return Date.now() - mercado.salvoEm < FRESH_MS;
}

export function mercadoAtualToConfirmed(mercado: MercadoAtual): ConfirmedMarket {
  return {
    nome: mercado.nome,
    bairro: mercado.bairro,
    cidade: mercado.cidade,
    mercadoId: mercado.mercadoId ?? undefined,
  };
}
