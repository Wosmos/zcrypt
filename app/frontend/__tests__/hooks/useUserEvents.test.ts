import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const h = vi.hoisted(() => ({
  handlers: {} as Record<string, (e: MessageEvent) => void>,
  unsubscribe: vi.fn(),
  deliver: vi.fn(async () => "toast"),
  push: vi.fn(),
  sync: vi.fn(),
  handOff: vi.fn(async () => {}),
}));
vi.mock("@/lib/space-handoff", () => ({ handOffForSpace: h.handOff }));
vi.mock("@/lib/space-sync", async () => {
  const real = await vi.importActual<typeof import("@/lib/space-sync")>("@/lib/space-sync");
  return { ...real, syncSpaceEvent: h.sync };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: h.push }) }));
vi.mock("@/lib/event-stream", () => ({
  subscribeEvents: (handlers: Record<string, (e: MessageEvent) => void>) => {
    h.handlers = handlers;
    return h.unsubscribe;
  },
}));
vi.mock("@/lib/user-events", async () => {
  const real = await vi.importActual<typeof import("@/lib/user-events")>("@/lib/user-events");
  return { ...real, deliverUserEvent: h.deliver };
});

import { useUserEvents } from "@/hooks/useUserEvents";

beforeEach(() => vi.clearAllMocks());

describe("useUserEvents", () => {
  it("listens for every notice type and hands a parsed event to delivery", () => {
    renderHook(() => useUserEvents());
    expect(Object.keys(h.handlers).sort()).toEqual(
      [
        "filesAdded", "inviteReceived", "invitePending", "linkViewed", "memberJoined",
        "memberLeft", "memberRemoved", "newSignIn", "roleChanged", "spaceDeleted",
        "spaceKeyNeeded", "spaceMembersChanged",
      ].sort(),
    );
    h.handlers.memberLeft({ data: '{"type":"memberLeft","data":{"space_id":"s1"},"url":"/spaces"}' } as MessageEvent);
    expect(h.deliver).toHaveBeenCalledWith(
      { type: "memberLeft", data: { space_id: "s1" }, url: "/spaces" },
      expect.any(Function),
    );
    h.handlers.memberLeft({ data: "{nope" } as MessageEvent);
    expect(h.deliver).toHaveBeenCalledTimes(1);
  });

  it("refreshes Space data on a members-changed signal without telling the person", () => {
    renderHook(() => useUserEvents());
    h.handlers.spaceMembersChanged({ data: '{"type":"spaceMembersChanged","data":{"space_id":"s1"},"url":"/spaces"}' } as MessageEvent);
    expect(h.sync).toHaveBeenCalledWith(
      { type: "spaceMembersChanged", data: { space_id: "s1" }, url: "/spaces" },
      window.location,
      expect.any(Function),
    );
    expect(h.deliver).not.toHaveBeenCalled();
  });

  it("hands the Space key over on a key-needed signal, silently", () => {
    renderHook(() => useUserEvents());
    h.handlers.spaceKeyNeeded({ data: '{"type":"spaceKeyNeeded","data":{"space_id":"s1","user_id":"u2"},"url":"/spaces"}' } as MessageEvent);
    expect(h.handOff).toHaveBeenCalledWith("s1");
    expect(h.deliver).not.toHaveBeenCalled();
  });

  it("ignores a key-needed signal that carries no Space id", () => {
    renderHook(() => useUserEvents());
    h.handlers.spaceKeyNeeded({ data: '{"type":"spaceKeyNeeded","data":{},"url":""}' } as MessageEvent);
    expect(h.handOff).not.toHaveBeenCalled();
    expect(h.deliver).not.toHaveBeenCalled();
  });

  it("both tells the person and refreshes on a member leaving", () => {
    renderHook(() => useUserEvents());
    h.handlers.memberLeft({ data: '{"type":"memberLeft","data":{"space_id":"s1"},"url":"/spaces"}' } as MessageEvent);
    expect(h.deliver).toHaveBeenCalledTimes(1);
    expect(h.sync).toHaveBeenCalledTimes(1);
  });

  it("navigates through the router and unsubscribes on unmount", () => {
    const { unmount } = renderHook(() => useUserEvents());
    h.handlers.newSignIn({ data: '{"type":"newSignIn","data":{},"url":"/settings"}' } as MessageEvent);
    (h.deliver.mock.calls[0] as unknown as [unknown, (u: string) => void])[1]("/spaces");
    expect(h.push).toHaveBeenCalledWith("/spaces");
    unmount();
    expect(h.unsubscribe).toHaveBeenCalled();
  });
});
