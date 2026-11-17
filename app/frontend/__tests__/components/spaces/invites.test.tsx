import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { createTranslator } from "next-intl";
import spacesEn from "@/messages/sections/spaces/en.json";
import { ApiError } from "@/lib/http-error";
import { inviteErrorMessage, inviteSuccessMessage, NoSpaceKeyError } from "@/components/spaces/invites";
import { PendingBadge } from "@/components/spaces/space-ui";
import { SpaceRole } from "@/types";

vi.mock("@/lib/spaces", () => ({ loadSpaceKey: vi.fn(), shareSpace: vi.fn() }));

const t = createTranslator({
  locale: "en",
  messages: spacesEn,
  namespace: "spaces",
} as never) as unknown as (k: string, v?: Record<string, string | number>) => string;

const err = (code: string, status = 400) => new ApiError("x", status, 0, "", code);

describe("inviteErrorMessage", () => {
  it.each([
    ["not_found", "No zcrypt account uses this email."],
    ["rate_limited", "Too many lookups. Try again in a few minutes."],
    ["invalid_email", "Enter a valid email."],
    ["self_invite", "That's you."],
    ["already_member", "Already a member."],
    ["already_invited", "Already invited."],
    ["forbidden", "Only the owner or an admin can invite."],
    ["invalid_role", "Failed to add member"],
    ["", "Failed to add member"],
  ])("maps %s", (code, text) => {
    expect(inviteErrorMessage(err(code), t)).toBe(text);
  });

  it("keeps the generic text for a network failure and the no-key text for a legacy Space", () => {
    expect(inviteErrorMessage(new TypeError("Failed to fetch"), t)).toBe("Failed to add member");
    expect(inviteErrorMessage(new NoSpaceKeyError(), t)).toContain("no key you can share");
  });
});

describe("inviteSuccessMessage", () => {
  it("names the email and the localized role for an active invite", () => {
    expect(inviteSuccessMessage({ status: "active" } as never, "a@b.co", SpaceRole.Viewer, t)).toBe(
      "Invited a@b.co as Viewer",
    );
  });

  it("says they join once they unlock their vault for a pending invite", () => {
    expect(inviteSuccessMessage({ status: "pending" }, "a@b.co", SpaceRole.Editor, t)).toBe(
      "Invited. They'll join once they unlock their vault.",
    );
  });
});

describe("PendingBadge", () => {
  it("labels a member who has not joined yet", () => {
    render(<PendingBadge />);
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });
});
