import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { usePassphraseStore } from "./passphrase";

describe("usePassphraseStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    usePassphraseStore.getState().clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should start with null passphrase", () => {
    expect(usePassphraseStore.getState().getPassphrase()).toBeNull();
  });

  it("should store and retrieve passphrase", () => {
    usePassphraseStore.getState().setPassphrase("mypass", 15);
    expect(usePassphraseStore.getState().getPassphrase()).toBe("mypass");
  });

  it("should return remaining minutes", () => {
    usePassphraseStore.getState().setPassphrase("mypass", 10);
    expect(usePassphraseStore.getState().getRemainingMinutes()).toBe(10);
  });

  it("should expire after TTL via getPassphrase check", () => {
    usePassphraseStore.getState().setPassphrase("mypass", 5);
    expect(usePassphraseStore.getState().getPassphrase()).toBe("mypass");

    // Advance past TTL
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    expect(usePassphraseStore.getState().getPassphrase()).toBeNull();
  });

  it("should auto-clear via timer", () => {
    usePassphraseStore.getState().setPassphrase("mypass", 1);
    expect(usePassphraseStore.getState().cachedPassphrase).toBe("mypass");

    // Advance timer to trigger auto-clear
    vi.advanceTimersByTime(1 * 60 * 1000);
    expect(usePassphraseStore.getState().cachedPassphrase).toBeNull();
  });

  it("should clear passphrase manually", () => {
    usePassphraseStore.getState().setPassphrase("mypass");
    usePassphraseStore.getState().clear();
    expect(usePassphraseStore.getState().getPassphrase()).toBeNull();
  });

  it("should return 0 remaining minutes when not set", () => {
    expect(usePassphraseStore.getState().getRemainingMinutes()).toBe(0);
  });
});
