// @ts-nocheck
/**
 * Cursor helpers for keyset / cursor-based pagination.
 *
 * Cursor format (opaque to clients):
 *   base64url( JSON.stringify({ val: number, id: number }) )
 *
 * `val` is the sort-key value of the last item on the current page:
 *  - score ordering  → score_cache value
 *  - preco ordering  → Math.round(preco * 100)   (cents, avoids float drift)
 *  - recente         → dataCriacao.getTime()       (ms epoch)
 *  - validacoes      → validacoes count
 */

export interface CursorPayload {
  val: number;
  id: number;
}

export function encodeCursor(val: number, id: number): string {
  return Buffer.from(JSON.stringify({ val, id } satisfies CursorPayload)).toString("base64url");
}

export function decodeCursor(cursor: string): CursorPayload | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      "val" in parsed &&
      "id" in parsed &&
      typeof (parsed as CursorPayload).val === "number" &&
      typeof (parsed as CursorPayload).id === "number"
    ) {
      return parsed as CursorPayload;
    }
    return null;
  } catch {
    return null;
  }
}
