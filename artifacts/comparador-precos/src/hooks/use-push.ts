import { useState, useEffect, useCallback } from "react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const STORAGE_KEY = "push-subscribed-v1";

export type PushPermission = "default" | "granted" | "denied" | "unsupported";

async function getVapidKey(): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/api/push/vapid-key`, { credentials: "include" });
    if (!res.ok) return null;
    const data = (await res.json()) as { publicKey?: string };
    return data.publicKey ?? null;
  } catch {
    return null;
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

async function registerPush(): Promise<"subscribed" | "already" | "denied" | "error"> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "error";

  const vapidKey = await getVapidKey();
  if (!vapidKey) return "error";

  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") return "denied";

  try {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      localStorage.setItem(STORAGE_KEY, "1");
      return "already";
    }

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey) as unknown as ArrayBuffer,
    });

    const json = sub.toJSON() as {
      endpoint: string;
      keys?: { p256dh?: string; auth?: string };
    };

    await fetch(`${BASE}/api/push/subscribe`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
    });

    localStorage.setItem(STORAGE_KEY, "1");
    return "subscribed";
  } catch {
    return "error";
  }
}

async function unregisterPush(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    await fetch(`${BASE}/api/push/unsubscribe`, {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint }),
    });
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function usePush() {
  const [permission, setPermission] = useState<PushPermission>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const supported = "PushManager" in window && "serviceWorker" in navigator && "Notification" in window;

  useEffect(() => {
    if (!supported) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission as PushPermission);
    setSubscribed(!!localStorage.getItem(STORAGE_KEY));
  }, [supported]);

  const subscribe = useCallback(async () => {
    setLoading(true);
    const result = await registerPush();
    setLoading(false);
    if (result === "subscribed" || result === "already") {
      setSubscribed(true);
      setPermission("granted");
    } else if (result === "denied") {
      setPermission("denied");
    }
    return result;
  }, []);

  const unsubscribe = useCallback(async () => {
    setLoading(true);
    await unregisterPush();
    setLoading(false);
    setSubscribed(false);
  }, []);

  return { supported, permission, subscribed, loading, subscribe, unsubscribe };
}
