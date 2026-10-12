import { create } from "zustand";
import { isVerySlowLink } from "@/lib/device-profile";

export type BackendState = "unknown" | "up" | "down" | "maintenance";
export type ConnectionStatus = "ok" | "offline" | "down" | "maintenance" | "slow";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export const PROBE_TIMEOUT_MS = 5_000;
export const SLOW_RTT_MS = 2_500;
export const UP_INTERVAL_MS = 60_000;
export const DOWN_BACKOFF_MS = [5_000, 10_000, 20_000, 40_000, 60_000];
const REPORT_DEBOUNCE_MS = 1_500;

interface ConnectivityState {
  /** Browser says online AND our own origin answers. */
  online: boolean;
  backend: BackendState;
  /** 2g / data saver, or the last health round trip was slow. */
  slow: boolean;
  /** Consecutive failed probes; drives the retry backoff. */
  failures: number;
  /** When the next automatic probe runs (ms epoch), for the countdown. */
  nextRetryAt: number | null;
  checking: boolean;
  /** Set when the connection comes back after a failure; the UI flashes "Back online". */
  recoveredAt: number | null;
  check: () => Promise<void>;
  report: () => void;
}

/** One status for the UI, most severe first. */
export function connectionStatus(
  s: Pick<ConnectivityState, "online" | "backend" | "slow">,
): ConnectionStatus {
  if (!s.online) return "offline";
  if (s.backend === "down") return "down";
  if (s.backend === "maintenance") return "maintenance";
  if (s.slow) return "slow";
  return "ok";
}

async function timedFetch(url: string): Promise<{ res: Response | null; ms: number }> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    return { res, ms: Date.now() - started };
  } catch {
    return { res: null, ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

async function probeBackend(): Promise<{ backend: BackendState; ms: number }> {
  const { res, ms } = await timedFetch(`${API_BASE}/api/health`);
  if (!res) return { backend: "down", ms };
  if (!res.ok) return { backend: res.status === 503 ? "maintenance" : "down", ms };
  const body = (await res.json().catch(() => ({}))) as { status?: string };
  return { backend: body.status === "maintenance" ? "maintenance" : "up", ms };
}

/** When the API is unreachable, ask our own origin: if that fails too, the
 *  problem is the user's internet, not our servers. */
async function originReachable(): Promise<boolean> {
  const { res } = await timedFetch(`/favicon.svg?ping=${Date.now()}`);
  return res !== null;
}

let refs = 0;
let pollTimer: ReturnType<typeof setTimeout> | undefined;
let reportTimer: ReturnType<typeof setTimeout> | undefined;

function schedule(delay: number) {
  clearTimeout(pollTimer);
  if (refs === 0) return;
  useConnectivityStore.setState({ nextRetryAt: Date.now() + delay });
  pollTimer = setTimeout(() => void useConnectivityStore.getState().check(), delay);
}

function nextDelay(backend: BackendState, online: boolean, failures: number): number {
  if (online && backend === "up") return UP_INTERVAL_MS;
  return DOWN_BACKOFF_MS[Math.min(Math.max(failures, 1), DOWN_BACKOFF_MS.length) - 1];
}

export const useConnectivityStore = create<ConnectivityState>()((set, get) => ({
  online: true,
  backend: "unknown",
  slow: false,
  failures: 0,
  nextRetryAt: null,
  checking: false,
  recoveredAt: null,

  check: async () => {
    if (get().checking) return;
    const before = get();
    const wasBad = !before.online || before.backend === "down" || before.backend === "maintenance";

    if (!navigator.onLine) {
      set({ online: false, failures: before.failures + 1 });
      schedule(nextDelay(before.backend, false, before.failures + 1));
      return;
    }

    set({ checking: true });
    const { backend, ms } = await probeBackend();
    const online = backend !== "down" || (await originReachable());
    const healthy = online && backend === "up";
    const failures = healthy ? 0 : before.failures + 1;
    set({
      checking: false,
      online,
      backend: online ? backend : before.backend,
      slow: isVerySlowLink() || (healthy && ms > SLOW_RTT_MS),
      failures,
      recoveredAt: healthy && wasBad ? Date.now() : get().recoveredAt,
    });
    schedule(nextDelay(backend, online, failures));
  },

  report: () => {
    // Only meaningful while the UI is watching; a real request failing is a
    // hint to re-probe now instead of waiting for the next poll.
    if (refs === 0 || reportTimer) return;
    reportTimer = setTimeout(() => {
      reportTimer = undefined;
      void get().check();
    }, REPORT_DEBOUNCE_MS);
  },
}));

function onOnline() {
  void useConnectivityStore.getState().check();
}

function onOffline() {
  useConnectivityStore.setState({ online: false });
  schedule(DOWN_BACKOFF_MS[0]);
}

function onVisible() {
  if (document.visibilityState === "visible") void useConnectivityStore.getState().check();
}

function onLinkChange() {
  useConnectivityStore.setState({ slow: isVerySlowLink() });
}

type ConnectionTarget = {
  addEventListener?: EventTarget["addEventListener"];
  removeEventListener?: EventTarget["removeEventListener"];
};

function linkTarget(): ConnectionTarget | undefined {
  return (navigator as Navigator & { connection?: ConnectionTarget }).connection;
}

/** Start watching connectivity; returns the matching stop. Ref-counted so the
 *  banner can mount in several places with one poller. */
export function startConnectivity(): () => void {
  refs++;
  if (refs === 1) {
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    linkTarget()?.addEventListener?.("change", onLinkChange);
    useConnectivityStore.setState({ online: navigator.onLine, slow: isVerySlowLink() });
    void useConnectivityStore.getState().check();
  }
  return () => {
    refs--;
    if (refs > 0) return;
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    document.removeEventListener("visibilitychange", onVisible);
    linkTarget()?.removeEventListener?.("change", onLinkChange);
    clearTimeout(pollTimer);
    clearTimeout(reportTimer);
    pollTimer = undefined;
    reportTimer = undefined;
    useConnectivityStore.setState({ nextRetryAt: null });
  };
}

/** Report a failed API call so the watcher re-probes right away. */
export function reportConnectivityFailure(): void {
  useConnectivityStore.getState().report();
}
