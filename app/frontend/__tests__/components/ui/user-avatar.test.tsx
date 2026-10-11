import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";

const getUserAvatarBlob = vi.fn();
vi.mock("@/lib/api", () => ({
  getUserAvatarBlob: (id: string) => getUserAvatarBlob(id),
}));

import { UserAvatar } from "@/components/ui/user-avatar";
import { clearAvatarCache } from "@/lib/avatar-cache";

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
    expect(screen.getByText("A")).toBeInTheDocument();
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
    expect(screen.getByText("A")).toBeInTheDocument();
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
