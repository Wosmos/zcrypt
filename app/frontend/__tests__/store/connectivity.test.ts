import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

type Mod = typeof import("@/store/connectivity");

const fetchMock = vi.fn();
let onLine = true;
let connection: Record<string, unknown> | undefined;

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

async function load(): Promise<Mod> {
  vi.resetModules();
  return import("@/store/connectivity");
}

/** Let the probe's awaited fetch/json chain settle. */
async function settle() {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  onLine = true;
  connection = undefined;
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => onLine });
  Object.defineProperty(navigator, "connection", { configurable: true, get: () => connection });
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("connectionStatus", () => {
  it("ranks offline over down over maintenance over slow", async () => {
    const { connectionStatus } = await load();
    expect(connectionStatus({ online: false, backend: "down", slow: true })).toBe("offline");
    expect(connectionStatus({ online: true, backend: "down", slow: true })).toBe("down");
    expect(connectionStatus({ online: true, backend: "maintenance", slow: true })).toBe("maintenance");
    expect(connectionStatus({ online: true, backend: "up", slow: true })).toBe("slow");
    expect(connectionStatus({ online: true, backend: "unknown", slow: false })).toBe("ok");
  });
});

describe("probing the backend", () => {
  it("marks the backend up and polls again a minute later", async () => {
    const m = await load();
    fetchMock.mockResolvedValue(jsonRes({ status: "ok" }));
    const stop = m.startConnectivity();
    await settle();

    const s = m.useConnectivityStore.getState();
    expect(s.backend).toBe("up");
    expect(s.online).toBe(true);
    expect(s.failures).toBe(0);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/health");
    expect(s.nextRetryAt).toBe(Date.now() + m.UP_INTERVAL_MS);

    await vi.advanceTimersByTimeAsync(m.UP_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    stop();
    expect(m.useConnectivityStore.getState().nextRetryAt).toBeNull();
  });

  it("reads maintenance from the body or a 503, and down from other errors", async () => {
    const m = await load();
    fetchMock.mockResolvedValueOnce(jsonRes({ status: "maintenance" }));
    await m.useConnectivityStore.getState().check();
    expect(m.useConnectivityStore.getState().backend).toBe("maintenance");

    fetchMock.mockResolvedValueOnce(new Response("", { status: 503 }));
    await m.useConnectivityStore.getState().check();
    expect(m.useConnectivityStore.getState().backend).toBe("maintenance");

    fetchMock.mockResolvedValueOnce(new Response("", { status: 502 })).mockResolvedValueOnce(new Response(""));
    await m.useConnectivityStore.getState().check();
    expect(m.useConnectivityStore.getState().backend).toBe("down");

    fetchMock.mockResolvedValueOnce(new Response("not json"));
    await m.useConnectivityStore.getState().check();
    expect(m.useConnectivityStore.getState().backend).toBe("up");
  });

  it("blames the servers when only the API fails, and backs off", async () => {
    const m = await load();
    fetchMock.mockImplementation((url: string) =>
      url.startsWith("/favicon.svg") ? Promise.resolve(new Response("")) : Promise.reject(new TypeError("x")),
    );
    const stop = m.startConnectivity();
    await settle();
    let s = m.useConnectivityStore.getState();
    expect(s.backend).toBe("down");
    expect(s.online).toBe(true);
    expect(s.nextRetryAt).toBe(Date.now() + m.DOWN_BACKOFF_MS[0]);

    await vi.advanceTimersByTimeAsync(m.DOWN_BACKOFF_MS[0]);
    s = m.useConnectivityStore.getState();
    expect(s.failures).toBe(2);
    expect(s.nextRetryAt).toBe(Date.now() + m.DOWN_BACKOFF_MS[1]);
    stop();
  });

  it("caps the backoff at the last step", async () => {
    const m = await load();
    fetchMock.mockResolvedValue(new Response("", { status: 500 }));
    m.useConnectivityStore.setState({ failures: 20 });
    const stop = m.startConnectivity();
    await settle();
    const last = m.DOWN_BACKOFF_MS[m.DOWN_BACKOFF_MS.length - 1];
    expect(m.useConnectivityStore.getState().nextRetryAt).toBe(Date.now() + last);
    stop();
  });

  it("blames the user's internet when our own origin fails too", async () => {
    const m = await load();
    m.useConnectivityStore.setState({ backend: "up" });
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await m.useConnectivityStore.getState().check();
    const s = m.useConnectivityStore.getState();
    expect(s.online).toBe(false);
    expect(s.backend).toBe("up");
  });

  it("gives up on a probe that hangs past the timeout", async () => {
    const m = await load();
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(new Error("aborted")))),
    );
    const pending = m.useConnectivityStore.getState().check();
    await vi.advanceTimersByTimeAsync(m.PROBE_TIMEOUT_MS * 2);
    await pending;
    expect(m.useConnectivityStore.getState().online).toBe(false);
  });

  it("skips the network entirely when the browser says offline", async () => {
    const m = await load();
    onLine = false;
    await m.useConnectivityStore.getState().check();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(m.useConnectivityStore.getState().online).toBe(false);
    expect(m.useConnectivityStore.getState().failures).toBe(1);
  });

  it("does not stack probes while one is running", async () => {
    const m = await load();
    m.useConnectivityStore.setState({ checking: true });
    await m.useConnectivityStore.getState().check();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("flags a recovery after an outage, but not on the first good probe", async () => {
    const m = await load();
    fetchMock.mockResolvedValue(jsonRes({ status: "ok" }));
    await m.useConnectivityStore.getState().check();
    expect(m.useConnectivityStore.getState().recoveredAt).toBeNull();

    m.useConnectivityStore.setState({ backend: "down" });
    await m.useConnectivityStore.getState().check();
    expect(m.useConnectivityStore.getState().recoveredAt).toBe(Date.now());
  });

  it("calls a healthy but slow round trip slow", async () => {
    const m = await load();
    const now = vi.spyOn(Date, "now");
    now.mockReturnValueOnce(0).mockReturnValueOnce(m.SLOW_RTT_MS + 1);
    fetchMock.mockResolvedValue(jsonRes({ status: "ok" }));
    await m.useConnectivityStore.getState().check();
    expect(m.useConnectivityStore.getState().slow).toBe(true);
  });

  it("calls a 2g link slow even when the probe is quick", async () => {
    const m = await load();
    connection = { effectiveType: "2g" };
    fetchMock.mockResolvedValue(jsonRes({ status: "ok" }));
    await m.useConnectivityStore.getState().check();
    expect(m.useConnectivityStore.getState().slow).toBe(true);
  });
});

describe("events and reports", () => {
  it("reacts to offline, online, visibility and link changes", async () => {
    const m = await load();
    const target = new EventTarget();
    connection = Object.assign(target, { effectiveType: "4g" }) as unknown as Record<string, unknown>;
    fetchMock.mockResolvedValue(jsonRes({ status: "ok" }));
    const stop = m.startConnectivity();
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event("offline"));
    expect(m.useConnectivityStore.getState().online).toBe(false);
    expect(m.useConnectivityStore.getState().nextRetryAt).toBe(Date.now() + m.DOWN_BACKOFF_MS[0]);

    window.dispatchEvent(new Event("online"));
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(m.useConnectivityStore.getState().online).toBe(true);

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(3);

    (connection as unknown as { effectiveType: string }).effectiveType = "slow-2g";
    target.dispatchEvent(new Event("change"));
    expect(m.useConnectivityStore.getState().slow).toBe(true);

    stop();
    window.dispatchEvent(new Event("online"));
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("keeps watching until the last subscriber stops", async () => {
    const m = await load();
    fetchMock.mockResolvedValue(jsonRes({ status: "ok" }));
    const stopA = m.startConnectivity();
    const stopB = m.startConnectivity();
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    stopA();
    expect(m.useConnectivityStore.getState().nextRetryAt).not.toBeNull();
    stopB();
    expect(m.useConnectivityStore.getState().nextRetryAt).toBeNull();
  });

  it("ignores reports nobody is watching", async () => {
    const m = await load();
    m.reportConnectivityFailure();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("re-probes once shortly after a burst of failed requests", async () => {
    const m = await load();
    fetchMock.mockResolvedValue(jsonRes({ status: "ok" }));
    const stop = m.startConnectivity();
    await settle();
    m.reportConnectivityFailure();
    m.reportConnectivityFailure();
    await vi.advanceTimersByTimeAsync(1_500);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    m.reportConnectivityFailure();
    stop();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
