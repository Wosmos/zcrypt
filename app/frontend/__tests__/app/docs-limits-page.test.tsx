import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/docs/limits",
  useRouter: () => ({ push: vi.fn() }),
}));
vi.stubGlobal(
  "IntersectionObserver",
  class {
    observe() {}
    disconnect() {}
    unobserve() {}
  },
);

import LimitsDocPage from "../../app/(marketing)/docs/limits/page";
import { docsNav } from "@/lib/data";

describe("Limits & transfer allowance docs page", () => {
  it("explains storage, both windows, what counts and the blocked-Telegram pause", () => {
    const { container } = render(<LimitsDocPage />);
    const text = container.textContent ?? "";
    expect(text).toContain("zcrypt doesn't cap them");
    expect(text).toContain("5 GB per day");
    expect(text).toContain("20 GB per month");
    expect(text).toContain("People downloading your share links");
    expect(text).toContain("every 10 seconds");
    expect(text).not.toMatch(/desktop app has no limit/i);
  });

  it("is listed in the docs navigation under Transfers", () => {
    const transfers = docsNav.find((g) => g.title === "Transfers");
    expect(transfers?.links.map((l) => l.href)).toContain("/docs/limits");
  });
});
