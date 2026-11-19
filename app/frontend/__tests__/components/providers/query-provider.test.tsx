import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({ revalidate: vi.fn(() => Promise.resolve()) }));

vi.mock("@/lib/client-marker", () => ({ installClientMarker: () => {} }));
vi.mock("@/store/auth", () => ({ cachedUserId: null }));
vi.mock("@/lib/query-client", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/query-client")>();
  return {
    ...real,
    queryPersister: { ...real.queryPersister, restoreClient: () => Promise.resolve(undefined) },
    revalidateRestored: h.revalidate,
  };
});

import { QueryProvider } from "@/components/providers/query-provider";

describe("QueryProvider", () => {
  it("revalidates the restored lists once the persisted cache is restored", async () => {
    render(
      <QueryProvider>
        <div />
      </QueryProvider>,
    );
    await waitFor(() => expect(h.revalidate).toHaveBeenCalledTimes(1));
  });
});
