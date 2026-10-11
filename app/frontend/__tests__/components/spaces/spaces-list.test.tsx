import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { installDomStubs, renderWithQuery } from "./test-utils";

const { api, nav, auth } = vi.hoisted(() => ({
  api: { listSharedVaults: vi.fn() },
  nav: { push: vi.fn() },
  auth: { user: { id: "u1" } },
}));

vi.mock("@/lib/api", () => api);
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: nav.push }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("@/components/onboarding/tour-provider", () => ({ useAutoTour: () => {} }));
vi.mock("@/store/auth", () => ({
  useAuthStore: Object.assign((sel: (s: typeof auth) => unknown) => sel(auth), {
    getState: () => auth,
  }),
}));
vi.mock("@/lib/query-client", async () => {
  const { QueryClient } = await import("@tanstack/react-query");
  return { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) };
});
vi.mock("@/hooks/useSpaceMeta", () => ({
  useSpaceMeta: (v?: { name: string; description: string }) =>
    v
      ? {
          name: v.name.replace(/^s1:/, "").toUpperCase(),
          description: v.description.replace(/^s1:/, ""),
          ready: true,
        }
      : { name: "", description: "", ready: false },
}));

import { SpacesList } from "@/components/spaces/spaces-list";

const vault = (id: string, name: string, description = "") => ({
  id,
  name,
  description,
  owner_id: "u1",
  file_ids: [],
  created_at: "",
  updated_at: "",
  size_limit_bytes: 0,
  member_count: 2,
  file_count: 3,
  used_bytes: 1024,
  member_preview: [{ user_id: "u1", username: "ada" }],
});

beforeEach(() => {
  installDomStubs();
  nav.push.mockReset();
  api.listSharedVaults.mockResolvedValue([
    vault("a", "s1:atlas", "s1:launch plans"),
    vault("b", "s1:borealis"),
  ]);
});
afterEach(cleanup);

describe("SpacesList", () => {
  it("shows decrypted space names from useSpaceMeta, never the sealed string", async () => {
    renderWithQuery(<SpacesList />);
    expect(await screen.findByText("ATLAS")).toBeInTheDocument();
    expect(screen.getByText("BOREALIS")).toBeInTheDocument();
    expect(screen.queryByText(/s1:/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /new space/i })).toHaveAttribute("href", "/spaces/new");
  });

  it("filters client-side over the decrypted names", async () => {
    renderWithQuery(<SpacesList />);
    await screen.findByText("ATLAS");
    fireEvent.change(screen.getByLabelText("Search spaces"), { target: { value: "boreal" } });
    await waitFor(() => expect(screen.queryByText("ATLAS")).not.toBeInTheDocument());
    expect(screen.getByText("BOREALIS")).toBeInTheDocument();
  });

  it("focuses the search box on / and opens the focused space on Enter", async () => {
    renderWithQuery(<SpacesList />);
    await screen.findByText("ATLAS");
    fireEvent.keyDown(document.body, { key: "/" });
    expect(screen.getByLabelText("Search spaces")).toHaveFocus();

    const options = screen.getAllByRole("option");
    options[0].focus();
    fireEvent.keyDown(options[0], { key: "Enter" });
    expect(nav.push).toHaveBeenCalledWith("/spaces/a");
  });
});
