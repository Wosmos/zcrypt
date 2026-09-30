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

const catalogs: Record<string, Tree> = { ar, de, es, fr, ru, ur, zh };
const base = flatten(en as Tree);

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
