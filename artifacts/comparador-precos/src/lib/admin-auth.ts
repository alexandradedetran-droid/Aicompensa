const TOKEN_KEY  = "adminToken";
const LOGADO_KEY = "adminLogado";
export const ADMIN_TOKEN = "admin-token-demo";

export function isAdminLogado(): boolean {
  return typeof window !== "undefined" &&
    localStorage.getItem(LOGADO_KEY) === "true";
}

export function getAdminToken(): string | null {
  return typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
}

export function setAdminSession(token: string): void {
  localStorage.setItem(LOGADO_KEY, "true");
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAdminSession(): void {
  localStorage.removeItem(LOGADO_KEY);
  localStorage.removeItem(TOKEN_KEY);
}
