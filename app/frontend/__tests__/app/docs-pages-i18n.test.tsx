import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/docs",
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

const pages = import.meta.glob(
  [
    "../../app/\\(marketing\\)/docs/*/page.tsx",
    "../../app/\\(marketing\\)/docs/page.tsx",
    "../../app/\\(marketing\\)/privacy/page.tsx",
    "../../app/\\(marketing\\)/terms/page.tsx",
  ],
  { eager: true },
) as Record<string, { default: () => React.ReactElement }>;

describe("docs and legal pages", () => {
  it("finds the pages", () => {
    expect(Object.keys(pages).length).toBeGreaterThan(40);
  });

  for (const [path, mod] of Object.entries(pages)) {
    it(`renders ${path} with every message key resolved`, () => {
      const errors: unknown[] = [];
      const spy = vi.spyOn(console, "error").mockImplementation((...a) => {
        errors.push(a);
      });
      const Page = mod.default;
      const { container } = render(<Page />);
      spy.mockRestore();
      expect(errors).toEqual([]);
      expect(container.textContent).not.toMatch(/\b(docs|legal)\.[a-z0-9-]+\.[a-z0-9.-]+/i);
    });
  }
});
