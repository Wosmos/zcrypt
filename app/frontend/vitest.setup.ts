import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Components read their text through next-intl. Tests render them without the
// app's provider, so hand every component an English translator built from the
// same catalogs the app merges (base, app sections and site sections).
vi.mock("next-intl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-intl")>();
  const { mergeMessages } = await import("@/lib/i18n");
  const { APP_SECTIONS_EN } = await import("@/messages/app-sections");
  const { SITE_SECTIONS_EN } = await import("@/messages/site-sections");
  const base = (await import("@/messages/en.json")).default as Record<string, unknown>;
  const messages = [...APP_SECTIONS_EN, ...SITE_SECTIONS_EN].reduce(
    (acc, section) => mergeMessages(acc, section),
    base,
  );
  return {
    ...actual,
    useTranslations: (namespace?: string) =>
      actual.createTranslator({ locale: "en", messages, namespace } as never),
    useMessages: () => messages,
    useLocale: () => "en",
  };
});
