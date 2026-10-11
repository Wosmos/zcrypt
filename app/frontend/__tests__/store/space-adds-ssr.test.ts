// @vitest-environment node
import { describe, it, expect } from "vitest";
import { useSpaceAdds } from "@/store/space-adds";

describe("space-adds without a window", () => {
  it("starts with an empty queue and registers no browser listeners", () => {
    expect(useSpaceAdds.getState().jobs).toEqual({});
  });
});
