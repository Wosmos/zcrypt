import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { AuditEvent, QuotaInfo } from "@/types";

const h = vi.hoisted(() => ({
  quota: undefined as QuotaInfo | undefined,
  handlers: {} as Record<string, (e: MessageEvent) => void>,
  unsubscribe: vi.fn(),
  user: { id: "u1" } as { id: string } | null,
  signIn: vi.fn(),
  full: vi.fn(),
}));
vi.mock("@/store/quota", () => ({ useQuotaQuery: () => ({ data: h.quota }) }));
vi.mock("@/lib/event-stream", () => ({
  subscribeEvents: (handlers: Record<string, (e: MessageEvent) => void>) => {
    h.handlers = handlers;
    return h.unsubscribe;
  },
}));
vi.mock("@/store/auth", () => ({ useAuthStore: { getState: () => ({ user: h.user }) } }));
vi.mock("@/lib/announce", () => ({ announceNewSignIn: h.signIn, announceStorageFull: h.full }));

import { isForeignSignIn, isStorageFull, useAlertEvents } from "@/hooks/useAlertEvents";

function quota(used: number, cap: number, unlimited = false): QuotaInfo {
  return {
    used_bytes: used,
    quota_bytes: cap,
    is_unlimited: unlimited,
    has_personal_key: false,
    plan: "free",
    max_concurrent_uploads: 2,
    max_file_size: 0,
    can_upload: true,
    allows_byob: true,
  };
}

function audit(over: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: "a1",
    user_id: "u1",
    event_type: "login",
    ip: "1.2.3.0",
    user_agent: "Mozilla/5.0 (Windows NT 10.0) Chrome/120",
    metadata: {},
    created_at: "2026-10-25T10:00:00Z",
    ...over,
  };
}

beforeEach(() => {
  h.quota = undefined;
  h.user = { id: "u1" };
  h.signIn.mockClear();
  h.full.mockClear();
});

describe("isStorageFull", () => {
  it("is true only for a capped account at or over its cap", () => {
    expect(isStorageFull(null)).toBe(false);
    expect(isStorageFull(quota(10, 10, true))).toBe(false);
    expect(isStorageFull(quota(10, 0))).toBe(false);
    expect(isStorageFull(quota(9, 10))).toBe(false);
    expect(isStorageFull(quota(10, 10))).toBe(true);
  });
});

describe("isForeignSignIn", () => {
  it("matches sign-ins to this account from another browser", () => {
    expect(isForeignSignIn(audit(), "u1", "this-browser")).toBe(true);
    expect(isForeignSignIn(audit({ event_type: "magic_link_used" }), "u1", "x")).toBe(true);
    expect(isForeignSignIn(audit({ event_type: "file_delete" }), "u1", "x")).toBe(false);
    expect(isForeignSignIn(audit(), undefined, "x")).toBe(false);
    expect(isForeignSignIn(audit({ user_id: "someone-else" }), "u1", "x")).toBe(false);
    expect(isForeignSignIn(audit({ user_agent: "same" }), "u1", "same")).toBe(false);
  });
});

describe("useAlertEvents", () => {
  it("announces storage full only when it fills up while watched", () => {
    h.quota = quota(10, 10);
    const { rerender, unmount } = renderHook(() => useAlertEvents());
    expect(h.full).not.toHaveBeenCalled();

    h.quota = quota(5, 10);
    rerender();
    h.quota = quota(10, 10);
    rerender();
    expect(h.full).toHaveBeenCalledTimes(1);

    h.quota = { ...quota(11, 10) };
    rerender();
    expect(h.full).toHaveBeenCalledTimes(1);
    unmount();
    expect(h.unsubscribe).toHaveBeenCalled();
  });

  it("waits for the quota to load", () => {
    renderHook(() => useAlertEvents());
    expect(h.full).not.toHaveBeenCalled();
  });

  it("announces a sign-in from another device with a short device label", () => {
    renderHook(() => useAlertEvents());
    h.handlers.audit({ data: JSON.stringify(audit()) } as MessageEvent);
    expect(h.signIn).toHaveBeenCalledWith("Chrome · Windows");

    h.signIn.mockClear();
    h.handlers.audit({ data: "{not json" } as MessageEvent);
    h.user = null;
    h.handlers.audit({ data: JSON.stringify(audit()) } as MessageEvent);
    expect(h.signIn).not.toHaveBeenCalled();
  });
});
