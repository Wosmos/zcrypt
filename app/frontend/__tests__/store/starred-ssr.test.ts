// @vitest-environment node
import { describe, it, expect } from "vitest";
import { useAuthStore } from "@/store/auth";
import { useStarredStore } from "@/store/starred";

describe("useStarredStore without a window", () => {
  it("starts empty instead of touching localStorage", () => {
    useAuthStore.setState({ user: { id: "u1" } as never });
    useStarredStore.getState().sync("u1");
    expect(useStarredStore.getState().ids).toEqual([]);
  });
});
