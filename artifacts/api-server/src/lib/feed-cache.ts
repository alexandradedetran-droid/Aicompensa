// @ts-nocheck
/**
 * Lightweight TTL cache for public feed pages.
 * Never cache authenticated/personalised endpoints.
 * Default TTL: 30 s — keeps the feed snappy while allowing price updates to
 * propagate quickly after any user interaction invalidates the cache.
 */

interface CacheEntry<T> {
  data: T;
  ts: number;
}

function makeMultiKeyCache<T>(ttlMs: number) {
  const store = new Map<string, CacheEntry<T>>();

  return {
    get(key: string): T | null {
      const entry = store.get(key);
      if (!entry) return null;
      if (Date.now() - entry.ts >= ttlMs) {
        store.delete(key);
        return null;
      }
      return entry.data;
    },

    set(key: string, data: T) {
      store.set(key, { data, ts: Date.now() });
    },

    /** Invalidate a specific key, or all keys when called with no argument. */
    invalidate(key?: string) {
      if (key !== undefined) {
        store.delete(key);
      } else {
        store.clear();
      }
    },
  };
}

/** Public feed cache — 30 s TTL. Key format: `feed:{ordenar}` */
export const feedCache = makeMultiKeyCache<object>(30_000);
