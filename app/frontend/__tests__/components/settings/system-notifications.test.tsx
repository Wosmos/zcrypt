import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { NotifyPermission, TestResult } from "@/lib/notify";

const n = vi.hoisted(() => ({
  permission: "default" as NotifyPermission,
  homeScreen: false,
  request: vi.fn(async (): Promise<NotifyPermission> => "granted"),
  test: vi.fn(async (): Promise<TestResult> => "shown"),
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/notify", () => ({
  notifyPermission: async () => n.permission,
  requestNotifyPermission: n.request,
  sendTestNotification: n.test,
  needsHomeScreenInstall: () => n.homeScreen,
  hostAppName: () => "Google Chrome",
}));
vi.mock("@/store/toast", () => ({ toast: n.toast }));

import { SystemNotificationSettings } from "@/components/settings/system-notifications";
import { NotificationSettings } from "@/components/settings/notification-prefs";
import { DEFAULT_NOTIFY_PREFS, usePreferencesStore } from "@/store/preferences";

async function renderReady() {
  const view = render(<SystemNotificationSettings />);
  await act(async () => {});
  return view;
}

describe("SystemNotificationSettings", () => {
  beforeEach(() => {
    n.permission = "default";
    n.homeScreen = false;
    n.request.mockClear();
    n.test.mockClear();
    n.test.mockResolvedValue("shown");
    n.toast.success.mockClear();
    n.toast.warning.mockClear();
    n.toast.error.mockClear();
    usePreferencesStore.setState({ notify: DEFAULT_NOTIFY_PREFS });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows the state and turns notifications on from a tap", async () => {
    await renderReady();
    expect(screen.getByText("Notifications on this device")).toBeInTheDocument();
    expect(screen.getByText(/^Off\./)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Turn on notifications" }));
    });
    expect(n.request).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/^On\./)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send a test" }));
    });
    expect(n.test).toHaveBeenCalledWith("Notifications are on", "This is how zcrypt lets you know.");
    expect(n.toast.success).toHaveBeenCalledWith("Test sent", {
      detail:
        "Nothing appeared? Allow Google Chrome in your system's notification settings and turn off Focus or Do Not Disturb.",
    });
  });

  it("waits on the test, then explains a block or a failure", async () => {
    n.permission = "granted";
    let finish: (r: TestResult) => void = () => {};
    n.test.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    await renderReady();
    const button = screen.getByRole("button", { name: "Send a test" });
    await act(async () => {
      fireEvent.click(button);
    });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(n.test).toHaveBeenCalledTimes(1);
    n.permission = "denied";
    await act(async () => finish("no-permission"));
    expect(n.toast.warning).toHaveBeenCalledWith(
      "Blocked. Allow notifications for zcrypt in your browser or system settings.",
    );
    expect(screen.getByText(/^Blocked\./)).toBeInTheDocument();

    n.permission = "granted";
    cleanup();
    n.test.mockResolvedValueOnce("error");
    await renderReady();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send a test" }));
    });
    expect(n.toast.error).toHaveBeenCalledWith(
      "zcrypt couldn't hand the notification to the browser. Reload the page and try again.",
    );
  });

  it("re-reads the permission when the tab comes back", async () => {
    await renderReady();
    n.permission = "granted";
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(screen.getByText(/^On\./)).toBeInTheDocument();
  });

  it("toggles photo previews", async () => {
    n.permission = "granted";
    await renderReady();
    const previews = screen.getByRole("switch", { name: "Show photo previews" });
    expect(previews).toBeChecked();
    fireEvent.click(previews);
    expect(usePreferencesStore.getState().notify.thumbnails).toBe(false);
  });

  it("explains a block without offering a button", async () => {
    n.permission = "denied";
    await renderReady();
    expect(screen.getByText(/^Blocked\./)).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("says when this browser cannot notify and hides previews", async () => {
    n.permission = "unsupported";
    await renderReady();
    expect(screen.getByText("This browser can't show notifications.")).toBeInTheDocument();
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("shows only the Home Screen steps in iPhone Safari", async () => {
    n.homeScreen = true;
    await renderReady();
    expect(screen.getByText(/add zcrypt to your Home Screen: tap Share, then Add to Home Screen/)).toBeInTheDocument();
    expect(screen.queryByText("Notifications on this device")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders nothing until the permission is known, and ignores a late answer after unmount", async () => {
    let answer: (p: NotifyPermission) => void = () => {};
    const notify = await import("@/lib/notify");
    vi.spyOn(notify, "notifyPermission").mockImplementation(
      () => new Promise((resolve) => (answer = resolve)),
    );
    const { container, unmount } = render(<SystemNotificationSettings />);
    expect(container).toBeEmptyDOMElement();
    unmount();
    await act(async () => answer("granted"));
  });

  it("sits in the Notifications section slot", async () => {
    render(<NotificationSettings notificationsExtra={<SystemNotificationSettings />} />);
    await act(async () => {});
    expect(screen.getByText("System notifications")).toBeInTheDocument();
  });
});
