/**
 * Lightweight analytics utility.
 * Tracks page views and key events in memory (extend to send to your analytics backend).
 */

type EventName =
  | "page_view"
  | "offer_viewed"
  | "offer_liked"
  | "offer_validated"
  | "offer_reported"
  | "offer_shared"
  | "offer_published"
  | "search_performed"
  | "location_granted"
  | "location_denied"
  | "pwa_install_accepted"
  | "pwa_install_dismissed"
  | "login"
  | "register"
  | "logout";

interface EventPayload {
  name: EventName;
  props?: Record<string, string | number | boolean>;
  ts: number;
}

// In-memory queue (could be flushed to /api/analytics in a future iteration)
const queue: EventPayload[] = [];
const MAX_QUEUE = 100;

function push(name: EventName, props?: Record<string, string | number | boolean>) {
  if (queue.length >= MAX_QUEUE) queue.shift();
  queue.push({ name, props, ts: Date.now() });
  // Emit as custom DOM event so any listener can pick it up
  try {
    window.dispatchEvent(new CustomEvent("analytics", { detail: { name, props } }));
  } catch {
    // SSR or restricted env
  }
}

export const analytics = {
  /** Track a page view */
  page(path: string) {
    push("page_view", { path });
  },

  /** Track any named event with optional props */
  track(name: EventName, props?: Record<string, string | number | boolean>) {
    push(name, props);
  },

  /** Return all queued events (read-only) */
  getQueue(): Readonly<EventPayload[]> {
    return queue;
  },
};

export type { EventName };
