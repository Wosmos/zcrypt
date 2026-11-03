/** The query parameter that names the open settings tab, as in `/settings?tab=storage`. */
export const SETTINGS_TAB_PARAM = "tab";

const LEGACY_PARAM = "section";

/** The tab a settings link asks for. `?section=` is still read for older links. */
export function requestedSettingsTab(params: Pick<URLSearchParams, "get">): string | null {
  return params.get(SETTINGS_TAB_PARAM) ?? params.get(LEGACY_PARAM);
}

/** The current address with `tab` set to the open tab, or dropped when none is open. */
export function settingsTabHref(href: string, tab: string | null): string {
  const url = new URL(href);
  url.searchParams.delete(LEGACY_PARAM);
  if (tab) url.searchParams.set(SETTINGS_TAB_PARAM, tab);
  else url.searchParams.delete(SETTINGS_TAB_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}
