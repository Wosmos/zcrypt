import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  usePathname: () => "/changelog",
  useRouter: () => ({ push: vi.fn() }),
}));

import ChangelogPage from "@/app/(marketing)/changelog/page";
import VersionPage, { generateStaticParams, generateMetadata } from "@/app/(marketing)/changelog/[version]/page";
import sitemap from "@/app/sitemap";
import { RELEASES } from "@/lib/changelog";

afterEach(cleanup);

describe("/changelog", () => {
  it("lists every version newest first with grouped items", () => {
    const { container } = render(<ChangelogPage />);
    expect(screen.getByRole("heading", { level: 1, name: /What's new/ })).toBeInTheDocument();
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toContain("A tour, a bug button, a tidier vault");
    expect(container.querySelector("#v0\\.1\\.7")).not.toBeNull();
    expect(screen.getByText("Upcoming")).toBeInTheDocument();
    expect(screen.getByText("Latest")).toBeInTheDocument();
    expect(container.querySelectorAll('[data-kind="security"]').length).toBeGreaterThan(3);
    expect(screen.getByRole("link", { name: /Download zcrypt/ })).toHaveAttribute("href", "/download");
  });
});

describe("/changelog/[version]", () => {
  it("renders one version with neighbours", async () => {
    render(await VersionPage({ params: Promise.resolve({ version: "0.1.7" }) }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "A tour, a bug button, a tidier vault",
    );
    expect(screen.getByRole("link", { name: /v0\.1\.6/ })).toHaveAttribute("href", "/changelog/0.1.6");
    expect(screen.getByRole("link", { name: /v0\.1\.8/ })).toHaveAttribute("href", "/changelog/0.1.8");
  });

  it("404s for unknown versions", async () => {
    await expect(VersionPage({ params: Promise.resolve({ version: "9.9.9" }) })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(await generateMetadata({ params: Promise.resolve({ version: "9.9.9" }) })).toEqual({});
  });

  it("has static params and metadata for every version", async () => {
    expect(generateStaticParams().map((p) => p.version)).toEqual(RELEASES.map((r) => r.version));
    const meta = await generateMetadata({ params: Promise.resolve({ version: "0.1.7" }) });
    expect(meta.alternates?.canonical).toMatch(/\/changelog\/0\.1\.7$/);
    expect(String(meta.title)).toContain("0.1.7");
  });

  it("is in the sitemap", () => {
    const urls = sitemap().map((s) => s.url);
    expect(urls.some((u) => u.endsWith("/changelog"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/changelog/0.1.7"))).toBe(true);
  });
});
