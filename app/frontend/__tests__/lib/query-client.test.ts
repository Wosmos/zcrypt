import { describe, it, expect } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";

describe("queryClient", () => {
  it("is a QueryClient instance", () => {
    expect(queryClient).toBeInstanceOf(QueryClient);
  });

  it("configures the shared 30s staleTime / 5m gcTime freshness window", () => {
    const defaults = queryClient.getDefaultOptions();
    expect(defaults.queries?.staleTime).toBe(30_000);
    expect(defaults.queries?.gcTime).toBe(5 * 60_000);
    expect(defaults.queries?.retry).toBe(1);
  });

  it("disables refetch-on-focus but keeps refetch-on-reconnect", () => {
    const defaults = queryClient.getDefaultOptions();
    expect(defaults.queries?.refetchOnWindowFocus).toBe(false);
    expect(defaults.queries?.refetchOnReconnect).toBe(true);
  });

  it("is a singleton shared across every import", async () => {
    const mod = await import("@/lib/query-client");
    expect(mod.queryClient).toBe(queryClient);
  });
});
