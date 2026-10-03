import { createEventSource } from "@/lib/api";
import { tryRefreshToken } from "@/lib/auth-fetch";
import { useAuthStore } from "@/store/auth";

/**
 * One shared /api/events connection per tab. Every consumer subscribes to the
 * event types it cares about and the stream fans them out, instead of each
 * opening its own EventSource. Each connection first trades the access token
 * for a single-use ticket; a failed ticket request backs off like a dropped
 * stream.
 *
 * EventSource never exposes the HTTP status, so an expired access token looks
 * like any other drop. Before every reconnect the token is checked and
 * refreshed when it is expired or about to be, otherwise a tab that slept past
 * the token lifetime would 401 on every retry forever.
 */

type Handler = (e: MessageEvent) => void;

export interface StreamObserver {
  /** reconnected is false on the first open of a connection cycle. */
  onOpen?: (reconnected: boolean) => void;
  /** failures counts consecutive drops before this one (0 on the first). */
  onError?: (failures: number) => void;
}

const BASE_DELAY = 1_000;
const MAX_RECONNECT_DELAY = 30_000;
const EXPIRY_SKEW_MS = 30_000;

const handlers = new Map<string, Set<Handler>>();
const observers = new Set<StreamObserver>();
let subscribers = 0;
let es: EventSource | null = null;
let attached = new Set<string>();
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let attempt = 0;
let hadConnection = false;
let generation = 0;

function dispatch(type: string): Handler {
  return (e) => handlers.get(type)?.forEach((h) => h(e));
}

function attach(type: string) {
  if (!es || attached.has(type)) return;
  attached.add(type);
  es.addEventListener(type, dispatch(type) as EventListener);
}

export function tokenExpiresSoon(token: string, now = Date.now()): boolean {
  try {
    const payload = token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/");
    const { exp } = JSON.parse(atob(payload)) as { exp?: number };
    return typeof exp === "number" && exp * 1000 - now < EXPIRY_SKEW_MS;
  } catch {
    return false;
  }
}

async function refreshIfStale(): Promise<void> {
  const { accessToken } = useAuthStore.getState();
  if (accessToken && tokenExpiresSoon(accessToken)) await tryRefreshToken();
}

function scheduleReconnect() {
  const failures = attempt;
  observers.forEach((o) => o.onError?.(failures));
  const delay = Math.min(BASE_DELAY * 2 ** attempt, MAX_RECONNECT_DELAY);
  attempt++;
  const gen = generation;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void refreshIfStale().then(() => {
      if (gen === generation) void connect();
    });
  }, delay);
}

async function connect() {
  const gen = generation;
  let source: EventSource;
  try {
    source = await createEventSource();
  } catch {
    if (gen === generation) scheduleReconnect();
    return;
  }
  if (gen !== generation) {
    source.close();
    return;
  }
  es = source;
  attached = new Set();
  for (const type of handlers.keys()) attach(type);

  source.onopen = () => {
    const reconnected = hadConnection;
    hadConnection = true;
    attempt = 0;
    observers.forEach((o) => o.onOpen?.(reconnected));
  };

  source.onerror = () => {
    source.close();
    if (es !== source) return;
    es = null;
    scheduleReconnect();
  };
}

function teardown() {
  generation++;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  es?.close();
  es = null;
  attempt = 0;
  hadConnection = false;
}

/** Subscribe to named SSE events; returns the unsubscribe. */
export function subscribeEvents(
  listeners: Record<string, Handler>,
  observer: StreamObserver = {},
): () => void {
  const entries = Object.entries(listeners);
  for (const [type, h] of entries) {
    let set = handlers.get(type);
    if (!set) handlers.set(type, (set = new Set()));
    set.add(h);
    attach(type);
  }
  observers.add(observer);
  subscribers++;
  if (subscribers === 1) void connect();

  let active = true;
  return () => {
    if (!active) return;
    active = false;
    for (const [type, h] of entries) {
      const set = handlers.get(type)!;
      set.delete(h);
      if (set.size === 0) handlers.delete(type);
    }
    observers.delete(observer);
    subscribers--;
    if (subscribers === 0) teardown();
  };
}
