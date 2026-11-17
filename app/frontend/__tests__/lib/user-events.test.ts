import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  background: false,
  notify: vi.fn(async (_e: unknown) => true),
  info: vi.fn(),
  warning: vi.fn(),
  areas: { transfers: true, sharing: true, security: true, problems: true },
  cache: new Map<string, unknown>(),
}));

vi.mock("@/lib/sounds", () => ({ isInBackground: () => h.background }));
vi.mock("@/store/toast", () => ({ toast: { info: h.info, warning: h.warning } }));
vi.mock("@/store/preferences", () => ({
  usePreferencesStore: { getState: () => ({ sound: { areas: h.areas }, notify: { thumbnails: false } }) },
}));
vi.mock("@/lib/api", () => ({ getSharedVault: vi.fn(async () => { throw new Error("offline"); }) }));
vi.mock("@/lib/query-client", () => ({
  queryClient: {
    getQueryData: (key: readonly unknown[]) => h.cache.get(JSON.stringify(key)),
    fetchQuery: async () => {
      throw new Error("offline");
    },
  },
}));
vi.mock("@/lib/spaces", () => ({
  loadSpaceKey: vi.fn(async () => new Uint8Array(32)),
  openSpaceText: vi.fn(async (_k: Uint8Array, v: string) => v.replace("s1:", "")),
}));
vi.mock("@/lib/notify", async () => {
  const real = await vi.importActual<typeof import("@/lib/notify")>("@/lib/notify");
  return { ...real, notify: h.notify };
});

import { deliverUserEvent, describeUserEvent, parseUserEvent, type UserEvent } from "@/lib/user-events";
import { describeNotification } from "@/lib/notify";

function event(type: string, data: Record<string, string>, url = "/spaces"): UserEvent {
  return { type, data, url };
}

const navigate = vi.fn();

beforeEach(() => {
  h.background = false;
  h.areas.sharing = true;
  h.cache.clear();
  h.cache.set(JSON.stringify(["space", "s1"]), { id: "s1", name: "s1:Trip" });
  vi.clearAllMocks();
});

async function copy(e: UserEvent) {
  const model = await describeUserEvent(e);
  return model && describeNotification(model, false);
}

describe("parseUserEvent", () => {
  it("reads the SSE body and rejects junk", () => {
    expect(parseUserEvent("memberLeft", '{"type":"memberLeft","data":{"space_id":"s1"},"url":"/spaces"}')).toEqual({
      type: "memberLeft",
      data: { space_id: "s1" },
      url: "/spaces",
    });
    expect(parseUserEvent("memberLeft", "{nope")).toBeNull();
  });
});

describe("delivery rule", () => {
  it("shows a toast and no system notification while zcrypt is in view", async () => {
    const out = await deliverUserEvent(event("memberLeft", { space_id: "s1", username: "Wasif" }), navigate);
    expect(out).toBe("toast");
    expect(h.info).toHaveBeenCalledTimes(1);
    expect(h.info.mock.calls[0][0]).toBe("Wasif left Trip");
    expect(h.notify).not.toHaveBeenCalled();
  });

  it("sends a system notification and no toast while zcrypt is hidden", async () => {
    h.background = true;
    const out = await deliverUserEvent(event("memberLeft", { space_id: "s1", username: "Wasif" }), navigate);
    expect(out).toBe("notification");
    expect(h.notify).toHaveBeenCalledWith(expect.objectContaining({ type: "memberLeft", name: "Wasif", space: "Trip" }));
    expect(h.info).not.toHaveBeenCalled();
    expect(h.warning).not.toHaveBeenCalled();
  });

  it("does nothing when the Sharing and Spaces switch is off", async () => {
    h.areas.sharing = false;
    expect(await deliverUserEvent(event("memberLeft", { space_id: "s1", username: "W" }), navigate)).toBe("skipped");
    expect(h.info).not.toHaveBeenCalled();
    expect(h.notify).not.toHaveBeenCalled();
  });

  it("a toast click goes to the event url", async () => {
    await deliverUserEvent(event("memberJoined", { space_id: "s1", username: "Wasif" }, "/spaces"), navigate);
    const action = h.info.mock.calls[0][1] as { onClick: () => void };
    action.onClick();
    expect(navigate).toHaveBeenCalledWith("/spaces");
  });

  it("warns for a new sign-in", async () => {
    await deliverUserEvent(event("newSignIn", { device: "Chrome on Mac" }, "/settings?tab=sessions"), navigate);
    expect(h.warning.mock.calls[0][0]).toBe("New sign-in to your account");
    expect(h.info).not.toHaveBeenCalled();
  });
});

describe("copy and url per event", () => {
  it.each([
    ["inviteReceived", { space_id: "s1", role: "viewer" }, "You were invited to Trip", "/spaces"],
    ["invitePending", { username: "Wasif" }, "Wasif invited you to a Space", "/spaces"],
    ["memberJoined", { space_id: "s1", username: "Wasif" }, "Wasif joined Trip", "/spaces"],
    ["memberLeft", { space_id: "s1", username: "Wasif" }, "Wasif left Trip", "/spaces"],
    ["roleChanged", { space_id: "s1", role: "editor" }, "Your role in Trip is now Editor", "/spaces"],
    ["filesAdded", { space_id: "s1", username: "Wasif", count: "12" }, "Wasif added 12 files to Trip", "/spaces"],
    ["filesAdded", { space_id: "s1", username: "Wasif", count: "1" }, "Wasif added 1 file to Trip", "/spaces"],
    ["newSignIn", { device: "Chrome" }, "New sign-in to your account", "/settings?tab=sessions"],
    ["linkViewed", {}, "Someone opened your link", "/tools"],
  ])("%s", async (type, data, title, url) => {
    const out = await copy(event(type, data as Record<string, string>, url));
    expect(out).toMatchObject({ title, url });
  });

  it("names a removed or deleted Space from the cache, not the network", async () => {
    expect(await copy(event("memberRemoved", { space_id: "s1" }))).toMatchObject({
      title: "You were removed from Trip",
    });
    expect(await copy(event("spaceDeleted", { space_id: "s1" }))).toMatchObject({ title: "Trip was deleted" });
  });

  it("falls back to a generic name when the Space is unknown", async () => {
    expect(await copy(event("spaceDeleted", { space_id: "zzz" }))).toMatchObject({ title: "a Space was deleted" });
    expect(await copy(event("memberLeft", { space_id: "zzz" }))).toMatchObject({ title: "Someone left a Space" });
  });

  it("uses one tag for the live event and its push", async () => {
    const out = await copy(event("memberLeft", { space_id: "s1", user_id: "u9", username: "W" }));
    expect(out?.tag).toBe("zcrypt-memberLeft-s1-u9");
    expect(out?.renotify).toBe(false);
  });

  it("ignores a url that leaves the app", async () => {
    expect((await copy(event("memberLeft", { space_id: "s1" }, "https://evil.example/")))?.url).toBe("/spaces");
  });
});
