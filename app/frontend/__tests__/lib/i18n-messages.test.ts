/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { LOCALES } from "@/lib/i18n";
import en from "@/messages/en.json";
import ar from "@/messages/ar.json";
import de from "@/messages/de.json";
import es from "@/messages/es.json";
import fr from "@/messages/fr.json";
import ru from "@/messages/ru.json";
import ur from "@/messages/ur.json";
import zh from "@/messages/zh.json";

type Tree = { [key: string]: string | Tree };

const flatten = (tree: Tree, prefix = ""): Record<string, string> =>
  Object.entries(tree).reduce<Record<string, string>>((out, [key, value]) => {
    const path = prefix + key;
    if (typeof value === "string") out[path] = value;
    else Object.assign(out, flatten(value, `${path}.`));
    return out;
  }, {});

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)(?=[,}])/g)].map((m) => m[1]).sort();
const tags = (s: string) => [...s.matchAll(/<(\w+)>/g)].map((m) => m[1]).sort();

const sectionFiles = import.meta.glob<{ default: Tree }>("../../messages/{sections,site}/*/*.json", {
  eager: true,
});
const sectionTree = (code: string): Tree =>
  Object.entries(sectionFiles)
    .filter(([path]) => path.endsWith(`/${code}.json`))
    .reduce<Tree>((out, [, mod]) => ({ ...out, ...mod.default }), {});
const withSections = (code: string, tree: Tree): Tree => {
  const out: Tree = { ...tree };
  for (const [ns, value] of Object.entries(sectionTree(code))) {
    const current = out[ns];
    out[ns] =
      current && typeof current === "object" && typeof value === "object"
        ? { ...current, ...value }
        : value;
  }
  return out;
};

const catalogs: Record<string, Tree> = Object.fromEntries(
  Object.entries({ ar, de, es, fr, ru, ur, zh }).map(([code, tree]) => [
    code,
    withSections(code, tree as Tree),
  ]),
);
const base = flatten(withSections("en", en as Tree));

describe("message catalogs", () => {
  it("ships a catalog for every non-default locale", () => {
    const codes = LOCALES.map((l) => l.code).filter((c) => c !== "en");
    expect(Object.keys(catalogs).sort()).toEqual([...codes].sort());
  });

  for (const [code, catalog] of Object.entries(catalogs)) {
    describe(code, () => {
      const flat = flatten(catalog);

      it("has exactly the english keys", () => {
        expect(Object.keys(flat).sort()).toEqual(Object.keys(base).sort());
      });

      it("keeps every argument and rich-text tag of the english source", () => {
        for (const [key, source] of Object.entries(base)) {
          expect(placeholders(flat[key]), `${code}:${key} args`).toEqual(placeholders(source));
          expect(tags(flat[key]), `${code}:${key} tags`).toEqual(tags(source));
        }
      });

      it("has no empty strings and no em dashes", () => {
        for (const [key, value] of Object.entries(flat)) {
          expect(value.trim(), `${code}:${key}`).not.toBe("");
          expect(value, `${code}:${key}`).not.toContain("—");
        }
      });
    });
  }
});
