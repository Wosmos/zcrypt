import { describe, it, expect } from "vitest";
import { EVENT_LABELS, EVENT_ICONS, eventColorClass } from "@/lib/audit-events";
import { LogIn, UserPlus, Trash2, Shield } from "@/lib/icons";

describe("EVENT_LABELS", () => {
  it("has Title-Case labels for representative event types", () => {
    expect(EVENT_LABELS.login).toBe("User Login");
    expect(EVENT_LABELS.login_failed).toBe("Login Failed");
    expect(EVENT_LABELS["2fa_enable"]).toBe("2FA Enabled");
    expect(EVENT_LABELS.admin_role_change).toBe("Role Changed");
  });
});

describe("EVENT_ICONS", () => {
  it("maps event types to their icon components", () => {
    expect(EVENT_ICONS.login).toBe(LogIn);
    expect(EVENT_ICONS.register).toBe(UserPlus);
    expect(EVENT_ICONS.file_delete).toBe(Trash2);
    expect(EVENT_ICONS["2fa_enable"]).toBe(Shield);
  });
});

describe("eventColorClass", () => {
  it("returns the borderless base classes by default", () => {
    expect(eventColorClass("login")).toBe("bg-blue-500/10 text-blue-600 dark:text-blue-400");
  });

  it("appends the matching border token when { border: true }", () => {
    expect(eventColorClass("login", { border: true })).toBe(
      "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
    );
  });

  it("explicitly opting out of border returns the base classes", () => {
    expect(eventColorClass("file_delete", { border: false })).toBe(
      "bg-red-500/10 text-red-600 dark:text-red-400"
    );
  });

  it("falls back to the default color for an unknown type", () => {
    expect(eventColorClass("mystery_event")).toBe(
      "bg-slate-500/10 text-slate-600 dark:text-slate-400"
    );
  });

  it("falls back to the default color + default border for an unknown type with border", () => {
    expect(eventColorClass("mystery_event", { border: true })).toBe(
      "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20"
    );
  });
});
