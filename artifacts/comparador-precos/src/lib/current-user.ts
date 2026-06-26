const STORAGE_KEY = "usuarioAtual";

export interface CurrentUser {
  id: number;
  nome: string;
  email: string;
  cidade: string;
  estado: string;
  pontos?: number;
  apiToken?: string;
  isAdmin?: boolean;
  unlimitedPosts?: boolean;
  ofertasHoje?: number;
  limiteDiario?: number | null;
  semLimite?: boolean;
  motivoSemLimite?: string | null;
  colaboradorPioneiro?: boolean;
}

export function getCurrentUser(): CurrentUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CurrentUser;
  } catch {
    return null;
  }
}

export function setCurrentUser(user: CurrentUser): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

export function clearCurrentUser(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function getApiToken(): string | null {
  return getCurrentUser()?.apiToken ?? null;
}
