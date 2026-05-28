const STORAGE_KEY = "usuarioAtual";

export interface CurrentUser {
  id: number;
  nome: string;
  telefone: string;
  cpf: string;
  cidade: string;
  estado: string;
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

export function maskCPF(cpf: string): string {
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11) return cpf;
  return `***.***.*${d.slice(8, 9)}-${d.slice(9)}`;
}
