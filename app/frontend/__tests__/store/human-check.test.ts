import { beforeEach, describe, expect, it } from "vitest";
import { useHumanCheck } from "@/store/human-check";

beforeEach(() => useHumanCheck.setState({ hosted: false, pending: null }));

describe("useHumanCheck", () => {
  it("resolves undefined at once when no dialog can run the check", async () => {
    await expect(useHumanCheck.getState().ask()).resolves.toBeUndefined();
    expect(useHumanCheck.getState().pending).toBeNull();
  });

  it("opens the check and resolves with the token it settles with", async () => {
    useHumanCheck.setState({ hosted: true });
    const asked = useHumanCheck.getState().ask();
    expect(useHumanCheck.getState().pending).not.toBeNull();
    useHumanCheck.getState().settle("tok");
    await expect(asked).resolves.toBe("tok");
    expect(useHumanCheck.getState().pending).toBeNull();
  });

  it("a second ask closes the first one empty", async () => {
    useHumanCheck.setState({ hosted: true });
    const first = useHumanCheck.getState().ask();
    const second = useHumanCheck.getState().ask();
    await expect(first).resolves.toBeUndefined();
    useHumanCheck.getState().settle("tok");
    await expect(second).resolves.toBe("tok");
  });

  it("settling with nothing open does nothing", () => {
    expect(() => useHumanCheck.getState().settle("tok")).not.toThrow();
  });
});
