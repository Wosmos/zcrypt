import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const sounds = vi.hoisted(() => ({ previewSound: vi.fn() }));
vi.mock("@/lib/sounds", () => ({
  previewSound: sounds.previewSound,
  SOUND_EVENTS: ["done", "headsUp", "problem"],
}));

import { NotificationSettings } from "@/components/settings/notification-prefs";
import { DEFAULT_SOUND_PREFS, usePreferencesStore } from "@/store/preferences";

describe("NotificationSettings", () => {
  beforeEach(() => {
    sounds.previewSound.mockClear();
    usePreferencesStore.setState({ sound: DEFAULT_SOUND_PREFS });
  });
  afterEach(cleanup);

  const sound = () => usePreferencesStore.getState().sound;

  it("turns every sound off and on with the master switch", () => {
    render(<NotificationSettings />);
    const master = screen.getByRole("switch", { name: "Sounds" });
    expect(master).toBeChecked();
    fireEvent.click(master);
    expect(sound().enabled).toBe(false);
    expect(document.querySelector("fieldset")).toBeDisabled();
    fireEvent.click(master);
    expect(sound().enabled).toBe(true);
  });

  it("picks a set and plays the finished cue for it", () => {
    render(<NotificationSettings />);
    expect(screen.getByRole("radio", { name: /Soft/ })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: /Glass/ }));
    expect(sound().set).toBe("glass");
    expect(sounds.previewSound).toHaveBeenCalledWith("done", "glass");
    expect(screen.getByRole("radio", { name: /Glass/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /Soft/ })).toHaveAttribute("aria-checked", "false");
  });

  it("previews each event", () => {
    render(<NotificationSettings />);
    fireEvent.click(screen.getByRole("button", { name: "Play the Heads up sound" }));
    fireEvent.click(screen.getByRole("button", { name: "Play the Problem sound" }));
    fireEvent.click(screen.getByRole("button", { name: "Play the Finished sound" }));
    expect(sounds.previewSound.mock.calls.map((c) => c[0])).toEqual(["headsUp", "problem", "done"]);
  });

  it("switches each area independently", () => {
    render(<NotificationSettings />);
    fireEvent.click(screen.getByRole("switch", { name: "Security" }));
    expect(sound().areas).toEqual({ transfers: true, sharing: true, security: false, problems: true });
    fireEvent.click(screen.getByRole("switch", { name: "Uploads and downloads" }));
    fireEvent.click(screen.getByRole("switch", { name: "Sharing and Spaces" }));
    fireEvent.click(screen.getByRole("switch", { name: "Problems" }));
    expect(Object.values(sound().areas).every((on) => !on)).toBe(true);
  });

  it("toggles vibrate and only in the background", () => {
    render(<NotificationSettings />);
    fireEvent.click(screen.getByRole("switch", { name: "Vibrate on phone" }));
    fireEvent.click(screen.getByRole("switch", { name: "Only in the background" }));
    expect(sound()).toMatchObject({ vibrate: false, backgroundOnly: false });
  });

  it("renders the slot for the operating system notification controls", () => {
    render(<NotificationSettings notificationsExtra={<div data-testid="os-slot">OS</div>} />);
    expect(within(document.body).getByTestId("os-slot")).toBeInTheDocument();
  });

  it("renders without the slot", () => {
    render(<NotificationSettings />);
    expect(screen.queryByTestId("os-slot")).toBeNull();
  });
});
