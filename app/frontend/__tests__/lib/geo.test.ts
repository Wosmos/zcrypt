import { afterEach, describe, expect, it } from "vitest";
import { countryName, displayCountry, formatPlace, signupCountryIfMoved } from "@/lib/geo";

const user = (over: Partial<Parameters<typeof displayCountry>[0]> = {}) => ({
  last_country: "",
  last_region: "",
  last_city: "",
  signup_country: "",
  ...over,
});

describe("geo", () => {
  afterEach(() => {
    document.documentElement.lang = "en";
  });

  it("names a country in the page language and caches the formatter", () => {
    document.documentElement.lang = "en";
    expect(countryName("de")).toBe("Germany");
    expect(countryName("DE")).toBe("Germany");
    document.documentElement.lang = "de";
    expect(countryName("DE")).toBe("Deutschland");
  });

  it("falls back to the code, and to nothing for no code", () => {
    expect(countryName("")).toBe("");
    expect(countryName("AA")).toBe("AA");
    expect(countryName("not a code")).toBe("not a code");
  });

  it("joins only the known parts of a place", () => {
    expect(formatPlace("Lahore", "PB")).toBe("Lahore, PB");
    expect(formatPlace("", "PB")).toBe("PB");
    expect(formatPlace("", "")).toBe("");
  });

  it("prefers the last sign-in country and reports a move from the signup one", () => {
    expect(displayCountry(user({ last_country: "PK", signup_country: "DE" }))).toBe("PK");
    expect(displayCountry(user({ signup_country: "DE" }))).toBe("DE");
    expect(signupCountryIfMoved(user({ last_country: "PK", signup_country: "DE" }))).toBe("DE");
    expect(signupCountryIfMoved(user({ last_country: "DE", signup_country: "DE" }))).toBe("");
    expect(signupCountryIfMoved(user({ signup_country: "DE" }))).toBe("");
    expect(signupCountryIfMoved(user({ last_country: "DE" }))).toBe("");
  });
});
