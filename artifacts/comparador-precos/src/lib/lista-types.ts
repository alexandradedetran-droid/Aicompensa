export interface ListaItem {
  id: string;
  nome: string;
  adicionadoEm: string;
  quantidade?: number;
}

// ─── localStorage keys ────────────────────────────────────────────────────────
export const LISTA_KEY       = "comparador_lista_compras";
export const CHECKED_KEY     = "comparador_lista_checked";
export const LISTA_NOME_KEY  = "comparador_grupo_nome";
export const LISTA_EMOJI_KEY = "comparador_grupo_emoji";

// ─── Persistence helpers ──────────────────────────────────────────────────────
export function loadItens(): ListaItem[] {
  try { return JSON.parse(localStorage.getItem(LISTA_KEY) ?? "[]"); }
  catch { return []; }
}

export function saveItens(items: ListaItem[]) {
  localStorage.setItem(LISTA_KEY, JSON.stringify(items));
}

export function loadChecked(): Set<string> {
  try { return new Set<string>(JSON.parse(localStorage.getItem(CHECKED_KEY) ?? "[]")); }
  catch { return new Set(); }
}

export function saveChecked(s: Set<string>) {
  localStorage.setItem(CHECKED_KEY, JSON.stringify([...s]));
}

export function getListaNome(): string {
  return localStorage.getItem(LISTA_NOME_KEY) ?? "Minha Lista";
}

export function getListaEmoji(): string {
  return localStorage.getItem(LISTA_EMOJI_KEY) ?? "🛒";
}

export function setListaNome(n: string) {
  localStorage.setItem(LISTA_NOME_KEY, n);
}

export function setListaEmoji(e: string) {
  localStorage.setItem(LISTA_EMOJI_KEY, e);
}
