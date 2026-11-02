import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { UserTable } from "@/components/admin/user-table";
import { resetAdminLists, useAdminList } from "@/hooks/useAdminList";
import { Role, type AdminUser } from "@/types";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/api", () => ({
  adminDeleteUser: vi.fn(),
  adminSetUserPlan: vi.fn(),
  adminSetUserQuota: vi.fn(),
  adminSetUserRole: vi.fn(),
  adminBulkUsers: vi.fn(),
}));
vi.mock("@/store/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const user = (over: Partial<AdminUser>): AdminUser => ({
  id: "u1",
  email: "alice@example.com",
  username: "alice",
  role: Role.User,
  plan: "free",
  email_verified: true,
  totp_enabled: false,
  file_count: 3,
  total_size: 2048,
  storage_quota: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  signup_country: "DE",
  signup_region: "",
  signup_city: "",
  last_country: "PK",
  last_region: "Punjab",
  last_city: "Lahore",
  last_ip_prefix: "10.0.0.0",
  last_seen_at: new Date().toISOString(),
  last_user_agent: "",
  last_device: "Chrome on Linux",
  session_count: 1,
  platforms: [],
  ...over,
});

function renderTable(users: AdminUser[]) {
  const list = renderHook(() => useAdminList("users-test", { sort: "created_at" })).result.current;
  return render(
    <UserTable
      list={list}
      users={users}
      total={users.length}
      loading={false}
      fetching={false}
      error={false}
      onRetry={vi.fn()}
      currentUserId="me"
      defaultQuotaBytes={0}
      planConfigs={[]}
      countries={[{ country: "PK", count: 1 }]}
      onRefresh={vi.fn()}
    />,
  );
}

describe("UserTable", () => {
  beforeEach(() => {
    resetAdminLists();
    push.mockClear();
  });
  afterEach(cleanup);

  it("shows country, place and where the user signed up", () => {
    renderTable([user({})]);
    const t = screen.getByRole("table");
    expect(within(t).getByText("PK")).toBeInTheDocument();
    expect(within(t).getByText("Pakistan")).toBeInTheDocument();
    expect(within(t).getByText(/Lahore, Punjab/)).toHaveTextContent("Signed up from DE");
  });

  it("shows which platforms the user connected and how", () => {
    renderTable([
      user({
        platforms: [
          { platform: "telegram", account: "vault_bot", via: "web", shared: false, connected_at: null },
          { platform: "github", account: "octo", via: "app", shared: false, connected_at: null },
        ],
      }),
    ]);
    const t = screen.getByRole("table");
    expect(within(t).getByText(/Telegram · vault_bot · saved on the server/)).toBeInTheDocument();
    expect(within(t).getByText(/GitHub · octo · used by the desktop or Android app/)).toBeInTheDocument();
  });

  it("says when the user has no platform at all", () => {
    renderTable([user({})]);
    expect(within(screen.getByRole("table")).getByText("No own platform")).toBeInTheDocument();
  });

  it("marks the admin's shared storage apart from the user's own accounts", () => {
    renderTable([
      user({
        platforms: [
          { platform: "huggingface", account: "Mine", via: "web", shared: false, connected_at: null },
          { platform: "telegram", account: "admin_bot", via: "shared", shared: false, connected_at: null },
        ],
      }),
    ]);
    const t = screen.getByRole("table");
    expect(within(t).getByText(/Hugging Face · Mine · saved on the server/)).toBeInTheDocument();
    expect(within(t).getByText("Shared")).toHaveTextContent(/Telegram · admin_bot · admin's shared storage/);
  });

  it("says unknown when no country was ever seen", () => {
    renderTable([user({ last_country: "", signup_country: "", last_city: "", last_region: "" })]);
    expect(within(screen.getByRole("table")).getByText("Unknown")).toBeInTheDocument();
  });

  it("links the row to the user's page", () => {
    renderTable([user({})]);
    const t = screen.getByRole("table");
    const link = within(t).getByRole("link");
    expect(link).toHaveAttribute("href", "/admin/users/u1");
    fireEvent.click(within(link.closest("tr")!).getByText("3"));
    expect(push).toHaveBeenCalledWith("/admin/users/u1");
  });

  it("offers the user actions in a menu and confirms a delete by name", async () => {
    renderTable([user({})]);
    const t = screen.getByRole("table");
    fireEvent.pointerDown(within(t).getByRole("button", { name: "Row actions" }), { button: 0, ctrlKey: false });
    const del = await screen.findByRole("menuitem", { name: "Delete user" });
    expect(screen.getByRole("menuitem", { name: "Change plan" })).toBeInTheDocument();
    fireEvent.click(del);
    expect(await screen.findByText(/permanently deleted/)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
