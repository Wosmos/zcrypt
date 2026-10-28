import { intlLocale } from "@/lib/i18n";

const regionNames = new Map<string, Intl.DisplayNames>();

/**
 * A country's name in the page language, from its ISO code. Falls back to the
 * code itself when the runtime has no name for it, and to "" for no code.
 */
export function countryName(code: string): string {
  if (!code) return "";
  const locale = intlLocale();
  let names = regionNames.get(locale);
  if (!names) {
    names = new Intl.DisplayNames([locale], { type: "region", fallback: "none" });
    regionNames.set(locale, names);
  }
  try {
    return names.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

/** "City, Region" with whichever parts are known; "" when neither is. */
export function formatPlace(city: string, region: string): string {
  return [city, region].filter(Boolean).join(", ");
}

export interface Located {
  last_country: string;
  last_region: string;
  last_city: string;
  signup_country: string;
}

/** The country to show for a user: the latest sign-in's, else the signup one. */
export function displayCountry(u: Located): string {
  return u.last_country || u.signup_country;
}

/** The signup country when it differs from where the user signs in now. */
export function signupCountryIfMoved(u: Located): string {
  return u.signup_country && u.last_country && u.signup_country !== u.last_country
    ? u.signup_country
    : "";
}
