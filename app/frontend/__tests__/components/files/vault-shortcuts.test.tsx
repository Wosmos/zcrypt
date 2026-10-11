import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { VaultShortcuts } from "@/components/files/vault-shortcuts";

afterEach(cleanup);

describe("VaultShortcuts", () => {
  it("opens the vault shortcut list with the ? key", () => {
    render(<VaultShortcuts />);
    fireEvent.keyDown(document, { key: "?" });
    expect(screen.getByText("Keyboard shortcuts", { selector: "p" })).toBeTruthy();
    expect(screen.getByText("Rename")).toBeTruthy();
    expect(screen.getByText("Search your vault")).toBeTruthy();
    expect(screen.getByText("Add or remove one file")).toBeTruthy();
  });
});
