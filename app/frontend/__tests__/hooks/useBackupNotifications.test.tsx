import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const h = vi.hoisted(() => ({ invoke: vi.fn(async () => {}) }));
vi.mock("@/lib/tauri", () => ({ isTauri: true, tauriInvoke: h.invoke }));

import { useBackupNotifications } from "@/hooks/useBackupNotifications";
import { backupTemplates, pushBackupNotifications } from "@/lib/backup-notifications";
import { DEFAULT_SOUND_PREFS, usePreferencesStore } from "@/store/preferences";

describe("useBackupNotifications", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    h.invoke.mockClear();
    usePreferencesStore.setState({ sound: DEFAULT_SOUND_PREFS });
  });
  afterEach(() => vi.useRealTimers());

  it("sends the choice and the templates on start", () => {
    renderHook(() => useBackupNotifications());
    expect(h.invoke).toHaveBeenCalledWith("set_backup_notifications", {
      prefs: { success: true, problems: true, templates: backupTemplates() },
    });
    expect(backupTemplates().files_from_other).toBe("{n} files backed up from {folder}");
  });

  it("sends the choice and templates once more after the language catalog settles", () => {
    renderHook(() => useBackupNotifications());
    h.invoke.mockClear();

    act(() => {
      vi.advanceTimersByTime(1_499);
    });
    expect(h.invoke).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(h.invoke).toHaveBeenCalledTimes(1);
    expect(h.invoke).toHaveBeenCalledWith("set_backup_notifications", {
      prefs: { success: true, problems: true, templates: backupTemplates() },
    });
  });

  it("does not send the delayed copy after it is unmounted", () => {
    const { unmount } = renderHook(() => useBackupNotifications());
    h.invoke.mockClear();
    unmount();

    act(() => {
      vi.advanceTimersByTime(5_000);
    });

    expect(h.invoke).not.toHaveBeenCalled();
  });

  it("sends again when the transfers or problems switch changes", () => {
    renderHook(() => useBackupNotifications());
    h.invoke.mockClear();
    act(() => usePreferencesStore.getState().setSoundArea("transfers", false));
    expect(h.invoke).toHaveBeenCalledWith("set_backup_notifications", {
      prefs: expect.objectContaining({ success: false, problems: true }),
    });
    h.invoke.mockClear();
    act(() => usePreferencesStore.getState().setSoundArea("problems", false));
    expect(h.invoke).toHaveBeenCalledWith("set_backup_notifications", {
      prefs: expect.objectContaining({ success: false, problems: false }),
    });
  });

  it("ignores a shell that refuses the command", async () => {
    h.invoke.mockRejectedValueOnce(new Error("no such command"));
    await expect(pushBackupNotifications(true, true)).resolves.toBeUndefined();
  });
});
