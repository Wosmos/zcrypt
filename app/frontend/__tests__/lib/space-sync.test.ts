import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryObserver } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";
import { qk } from "@/lib/query-keys";
import { openSpaceId, syncSpaceEvent } from "@/lib/space-sync";
import type { UserEvent } from "@/lib/user-events";

const ev = (type: string): UserEvent => ({ type, data: { space_id: "s1" }, url: "/spaces" });
const navigate = vi.fn();

function watch(key: readonly unknown[], fn: () => Promise<unknown>) {
  const observer = new QueryObserver(queryClient, { queryKey: key, queryFn: fn });
  const stop = observer.subscribe(() => {});
  return stop;
}

beforeEach(() => {
  queryClient.clear();
  navigate.mockClear();
});

describe("openSpaceId", () => {
  it("reads the id from the path, or from ?id= on the desktop export path", () => {
    expect(openSpaceId("/spaces/s1/settings", "")).toBe("s1");
    expect(openSpaceId("/spaces/_", "?id=s2")).toBe("s2");
    expect(openSpaceId("/spaces/new", "")).toBe("");
    expect(openSpaceId("/dashboard", "")).toBe("");
  });
});

describe("syncSpaceEvent", () => {
  it.each(["spaceMembersChanged", "memberLeft", "memberJoined", "roleChanged"])(
    "refetches the open Space and the list on %s",
    async (type) => {
      const detail = vi.fn(async () => ({ id: "s1", members: [] }));
      const list = vi.fn(async () => []);
      const stops = [watch(qk.space("s1"), detail), watch(qk.spaces, list)];
      await vi.waitFor(() => expect(queryClient.getQueryState(qk.space("s1"))?.status).toBe("success"));
      expect(detail).toHaveBeenCalledTimes(1);
      syncSpaceEvent(ev(type), { pathname: "/spaces/s1", search: "" }, navigate);
      await vi.waitFor(() => expect(detail).toHaveBeenCalledTimes(2));
      expect(list).toHaveBeenCalledTimes(2);
      expect(navigate).not.toHaveBeenCalled();
      stops.forEach((s) => s());
    },
  );

  it.each(["memberRemoved", "spaceDeleted"])("drops the Space and leaves it when open on %s", (type) => {
    queryClient.setQueryData(qk.space("s1"), { id: "s1" });
    syncSpaceEvent(ev(type), { pathname: "/spaces/s1/settings", search: "" }, navigate);
    expect(queryClient.getQueryData(qk.space("s1"))).toBeUndefined();
    expect(navigate).toHaveBeenCalledWith("/spaces");
  });

  it("only drops the cache when another page is open", () => {
    queryClient.setQueryData(qk.space("s1"), { id: "s1" });
    syncSpaceEvent(ev("spaceDeleted"), { pathname: "/dashboard", search: "" }, navigate);
    expect(queryClient.getQueryData(qk.space("s1"))).toBeUndefined();
    expect(navigate).not.toHaveBeenCalled();
    syncSpaceEvent(ev("memberRemoved"), { pathname: "/spaces/other", search: "" }, navigate);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("ignores an event with no space id", () => {
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    syncSpaceEvent({ type: "memberLeft", data: {}, url: "" }, { pathname: "/", search: "" }, navigate);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
