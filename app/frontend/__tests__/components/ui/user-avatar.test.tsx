import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";

const getUserAvatarBlob = vi.fn();
vi.mock("@/lib/api", () => ({
  getUserAvatarBlob: (id: string) => getUserAvatarBlob(id),
}));

import { AvatarStack, UserAvatar, initialsOf } from "@/components/ui/user-avatar";
import { clearAvatarCache } from "@/lib/avatar-cache";
import { installDomStubs } from "../spaces/test-utils";

let n = 0;
afterEach(cleanup);

beforeEach(() => {
  clearAvatarCache();
  getUserAvatarBlob.mockReset();
  getUserAvatarBlob.mockResolvedValue(new Blob(["x"], { type: "image/jpeg" }));
  n = 0;
  URL.createObjectURL = vi.fn(() => `blob:mock/${++n}`);
  URL.revokeObjectURL = vi.fn();
});

describe("UserAvatar", () => {
  it("shows the initial and does not fetch when there is no photo", () => {
    const { container } = render(<UserAvatar userId="u1" name="ada" />);
    expect(screen.getByText("AD")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    expect(getUserAvatarBlob).not.toHaveBeenCalled();
  });

  it("fetches once and renders the image", async () => {
    const { container } = render(<UserAvatar userId="u1" name="ada" hasAvatar avatarVersion="v1" />);
    await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
    expect(container.querySelector("img")?.getAttribute("src")).toBe("blob:mock/1");
    expect(getUserAvatarBlob).toHaveBeenCalledTimes(1);
  });

  it("keeps the initial when the fetch fails", async () => {
    getUserAvatarBlob.mockRejectedValue(new Error("404"));
    const { container } = render(<UserAvatar userId="u1" name="ada" hasAvatar avatarVersion="v1" />);
    await waitFor(() => expect(getUserAvatarBlob).toHaveBeenCalled());
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("AD")).toBeInTheDocument();
  });

  it("dedupes two avatars of the same user and version", async () => {
    const { container } = render(
      <>
        <UserAvatar userId="u1" name="ada" hasAvatar avatarVersion="v1" />
        <UserAvatar userId="u1" name="ada" hasAvatar avatarVersion="v1" size="sm" />
      </>,
    );
    await waitFor(() => expect(container.querySelectorAll("img")).toHaveLength(2));
    expect(getUserAvatarBlob).toHaveBeenCalledTimes(1);
  });

  it("refetches and revokes the old url when the version changes", async () => {
    const { container, rerender } = render(
      <UserAvatar userId="u1" name="ada" hasAvatar avatarVersion="v1" />,
    );
    await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
    rerender(<UserAvatar userId="u1" name="ada" hasAvatar avatarVersion="v2" />);
    await waitFor(() =>
      expect(container.querySelector("img")?.getAttribute("src")).toBe("blob:mock/2"),
    );
    expect(getUserAvatarBlob).toHaveBeenCalledTimes(2);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock/1");
  });
});

describe("initialsOf", () => {
  it.each([
    ["Wasif Malik", "WM"],
    ["Wasif Ali Malik", "WM"],
    ["wasif", "WA"],
    ["wendy_cole", "WC"],
    ["w@example.com", "W"],
    ["wo@example.com", "WO"],
    ["  ", "?"],
    ["", "?"],
  ])("%s -> %s", (name, initials) => {
    expect(initialsOf(name)).toBe(initials);
  });
});

describe("UserAvatar initials", () => {
  it("tells two members with the same first letter apart", () => {
    render(
      <>
        <UserAvatar userId="u1" name="Wasif Malik" />
        <UserAvatar userId="u2" name="Wendy Cole" />
      </>,
    );
    expect(screen.getByText("WM")).toBeInTheDocument();
    expect(screen.getByText("WC")).toBeInTheDocument();
  });

  it("keeps one letter at the smallest size and the per-user colour", () => {
    const { container } = render(
      <>
        <UserAvatar userId="u1" name="Wasif Malik" size="xs" />
        <UserAvatar userId="u1" name="Wasif Malik" />
      </>,
    );
    expect(screen.getByText("W")).toBeInTheDocument();
    const [a, b] = Array.from(container.querySelectorAll<HTMLElement>("[aria-hidden]"));
    expect(a!.style.background).not.toBe("");
    expect(a!.style.background).toBe(b!.style.background);
  });
});

describe("AvatarStack names", () => {
  beforeEach(installDomStubs);

  const members = [
    { user_id: "u1", username: "Wasif", email: "wasif@example.com" },
    { user_id: "u2", username: "Wendy", email: "wendy@example.com" },
  ];

  it("shows the member's name and email on focus", async () => {
    render(<AvatarStack members={members} total={2} />);
    fireEvent.focus(screen.getByText("WA").closest("[tabindex]")!);
    expect((await screen.findAllByText("Wasif")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("wasif@example.com")).length).toBeGreaterThan(0);
    expect(screen.queryByText("wendy@example.com")).toBeNull();
  });

  it("shows the name after a tap on a touch screen, then hides it", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<AvatarStack members={members} total={2} />);
    fireEvent.click(screen.getByText("WE").closest("[tabindex]")!);
    expect((await screen.findAllByText("wendy@example.com")).length).toBeGreaterThan(0);
    await vi.advanceTimersByTimeAsync(3000);
    await waitFor(() => expect(screen.queryByText("wendy@example.com")).toBeNull());
    vi.useRealTimers();
  });
});
