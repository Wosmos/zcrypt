import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleSuggestion } from "@/components/i18n/locale-suggestion";

const setLocale = vi.fn();
vi.mock("@/components/providers/i18n-provider", () => ({
  useLocaleControl: () => ({ locale: "en", setLocale }),
}));

function mockCountry(country: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ country }), { status: 200 })),
  );
}

async function renderBar() {
  await act(async () => {
    render(<LocaleSuggestion />);
  });
}

describe("LocaleSuggestion", () => {
  beforeEach(() => {
    localStorage.clear();
    setLocale.mockReset();
    window.history.replaceState(null, "", "/");
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("suggests Arabic in Arabic for a visitor from the UAE and switches on click", async () => {
    mockCountry("AE");
    await renderBar();
    expect(screen.getByText("zcrypt متاح باللغة العربية.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "التبديل إلى العربية" }));
    expect(setLocale).toHaveBeenCalledWith("ar");
    expect(localStorage.getItem("zcrypt-locale-hint-dismissed")).toBe("1");
  });

  it("suggests Urdu for Pakistan", async () => {
    mockCountry("PK");
    await renderBar();
    expect(screen.getByText("zcrypt اردو میں بھی دستیاب ہے۔")).toBeInTheDocument();
  });

  it("stays hidden for a country without a supported language", async () => {
    mockCountry("US");
    await renderBar();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("stays hidden once dismissed or when the visitor already picked a language", async () => {
    mockCountry("FR");
    localStorage.setItem("zcrypt-locale-hint-dismissed", "1");
    await renderBar();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    cleanup();

    localStorage.clear();
    localStorage.setItem("zcrypt-locale", "en");
    await renderBar();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("closing hides the bar for good", async () => {
    mockCountry("DE");
    await renderBar();
    fireEvent.click(screen.getByRole("button", { name: "Schließen" }));
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(localStorage.getItem("zcrypt-locale-hint-dismissed")).toBe("1");
    expect(setLocale).not.toHaveBeenCalled();
  });

  it("uses ?zc_country= for testing without calling the server", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    window.history.replaceState(null, "", "/?zc_country=mx");
    await renderBar();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getByText("zcrypt también está disponible en español.")).toBeInTheDocument();
  });
});
