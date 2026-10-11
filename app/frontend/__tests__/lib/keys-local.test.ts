import { describe, it, expect, beforeEach } from "vitest";
import { localFingerprint } from "@/lib/keys";
import { useKeysStore } from "@/store/keys";

describe("localFingerprint", () => {
  beforeEach(() => useKeysStore.getState().reset());

  it("is null until the keypair is ready", () => {
    useKeysStore.setState({ ready: false, fingerprint: "AAAA-BBBB" });
    expect(localFingerprint()).toBeNull();
  });

  it("returns the locally computed fingerprint once ready", () => {
    useKeysStore.setState({ ready: true, fingerprint: "AAAA-BBBB" });
    expect(localFingerprint()).toBe("AAAA-BBBB");
  });
});
