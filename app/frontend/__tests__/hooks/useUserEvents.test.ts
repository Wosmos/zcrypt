import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const h = vi.hoisted(() => ({
  handlers: {} as Record<string, (e: MessageEvent) => void>,
  unsubscribe: vi.fn(),
  deliver: vi.fn(async () => "toast"),
  push: vi.fn(),
}));
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

  it("navigates through the router and unsubscribes on unmount", () => {
    const { unmount } = renderHook(() => useUserEvents());
    h.handlers.newSignIn({ data: '{"type":"newSignIn","data":{},"url":"/settings"}' } as MessageEvent);
    (h.deliver.mock.calls[0] as unknown as [unknown, (u: string) => void])[1]("/spaces");
    expect(h.push).toHaveBeenCalledWith("/spaces");
    unmount();
    expect(h.unsubscribe).toHaveBeenCalled();
  });
});
