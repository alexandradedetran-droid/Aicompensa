import { createContext, useContext } from "react";

// ── Regiões conhecidas ─────────────────────────────────────────────────────────

export interface Regiao {
  id: string;
  nome: string;
  estado: string;
  cidadePrimaria: string;
  cidadesIncluidas: string[];
}

export const REGIOES: Regiao[] = [
  {
    id: "grande-cuiaba",
    nome: "Grande Cuiabá",
    estado: "MT",
    cidadePrimaria: "Cuiabá",
    cidadesIncluidas: ["Cuiabá", "Várzea Grande"],
  },
  {
    id: "sinop",
    nome: "Sinop",
    estado: "MT",
    cidadePrimaria: "Sinop",
    cidadesIncluidas: ["Sinop"],
  },
  {
    id: "rondonopolis",
    nome: "Rondonópolis",
    estado: "MT",
    cidadePrimaria: "Rondonópolis",
    cidadesIncluidas: ["Rondonópolis"],
  },
  {
    id: "sorriso",
    nome: "Sorriso",
    estado: "MT",
    cidadePrimaria: "Sorriso",
    cidadesIncluidas: ["Sorriso"],
  },
  {
    id: "lucas-do-rio-verde",
    nome: "Lucas do Rio Verde",
    estado: "MT",
    cidadePrimaria: "Lucas do Rio Verde",
    cidadesIncluidas: ["Lucas do Rio Verde"],
  },
  {
    id: "tangara-da-serra",
    nome: "Tangará da Serra",
    estado: "MT",
    cidadePrimaria: "Tangará da Serra",
    cidadesIncluidas: ["Tangará da Serra"],
  },
  {
    id: "alta-floresta",
    nome: "Alta Floresta",
    estado: "MT",
    cidadePrimaria: "Alta Floresta",
    cidadesIncluidas: ["Alta Floresta"],
  },
  {
    id: "barra-do-garcas",
    nome: "Barra do Garças",
    estado: "MT",
    cidadePrimaria: "Barra do Garças",
    cidadesIncluidas: ["Barra do Garças"],
  },
  {
    id: "caceres",
    nome: "Cáceres",
    estado: "MT",
    cidadePrimaria: "Cáceres",
    cidadesIncluidas: ["Cáceres"],
  },
];

/** Find the region containing a given city (case-insensitive) */
export function findRegiaoByCity(cidade: string): Regiao | undefined {
  const normalized = cidade.trim().toLowerCase();
  return REGIOES.find((r) =>
    r.cidadesIncluidas.some((c) => c.toLowerCase() === normalized),
  );
}

/** Build a fallback Regiao for an unknown city */
export function makeRegiaoFromCity(cidade: string, estado = "MT"): Regiao {
  const slug = cidade
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
  return {
    id: slug,
    nome: cidade,
    estado,
    cidadePrimaria: cidade,
    cidadesIncluidas: [cidade],
  };
}

// ── CidadeAtiva data structure ─────────────────────────────────────────────────

export interface CidadeAtiva {
  cidade: string;
  estado: string;
  regiaoId: string;
  regiaoNome: string;
  cidadesIncluidas: string[];
  origem: "gps" | "manual";
  latitude?: number;
  longitude?: number;
  atualizadoEm: number;
}

const KEY = "cidade_ativa_v2";

export function getCidadeAtiva(): CidadeAtiva | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CidadeAtiva;
    if (
      !parsed.cidade ||
      !parsed.regiaoId ||
      !Array.isArray(parsed.cidadesIncluidas) ||
      typeof parsed.atualizadoEm !== "number"
    ) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setCidadeAtiva(cidade: Omit<CidadeAtiva, "atualizadoEm">): void {
  try {
    const data: CidadeAtiva = { ...cidade, atualizadoEm: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

export function clearCidadeAtiva(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

// ── React context ─────────────────────────────────────────────────────────────

export interface CidadeAtivaContextValue {
  cidadeAtiva: CidadeAtiva | null;
  setCidade: (c: Omit<CidadeAtiva, "atualizadoEm">) => void;
  clearCidade: () => void;
  showSelector: boolean;
  setShowSelector: (v: boolean) => void;
}

export const CidadeAtivaContext = createContext<CidadeAtivaContextValue>({
  cidadeAtiva: null,
  setCidade: () => undefined,
  clearCidade: () => undefined,
  showSelector: false,
  setShowSelector: () => undefined,
});

export function useCidadeAtiva(): CidadeAtivaContextValue {
  return useContext(CidadeAtivaContext);
}
