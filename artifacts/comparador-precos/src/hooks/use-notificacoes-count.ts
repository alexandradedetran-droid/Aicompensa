import { useState, useEffect, useCallback } from "react";
import { customFetch } from "@workspace/api-client-react";
import { getCurrentUser } from "@/lib/current-user";

let globalCount = 0;
const listeners = new Set<(n: number) => void>();

function broadcast(n: number) {
  globalCount = n;
  listeners.forEach(fn => fn(n));
}

/** Called from notificacoes page after marking all as read. */
export function resetNotifCount() {
  broadcast(0);
}

export function useNotificacoesCount() {
  const [count, setCount] = useState(globalCount);

  useEffect(() => {
    listeners.add(setCount);
    return () => { listeners.delete(setCount); };
  }, []);

  const refresh = useCallback(async () => {
    if (!getCurrentUser()) return;
    try {
      const data = await customFetch<{ naoLidas: number }>("/api/notificacoes?limit=1");
      broadcast(data.naoLidas ?? 0);
    } catch {}
  }, []);

  // Fetch on mount and every 2 minutes
  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 2 * 60_000);
    return () => clearInterval(id);
  }, [refresh]);

  // Re-fetch when tab becomes visible
  useEffect(() => {
    function onVisible() { if (document.visibilityState === "visible") void refresh(); }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  return count;
}
