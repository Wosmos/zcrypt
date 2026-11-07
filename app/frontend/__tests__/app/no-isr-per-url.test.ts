import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const APP_DIR = join(__dirname, "..", "..", "app");
const ROUTE_FILE = /^(page|layout)\.(web\.)?(tsx|ts|jsx|js)$/;

function webRouteFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return webRouteFiles(path);
    return ROUTE_FILE.test(entry.name) ? [path] : [];
  });
}

describe("web build routes", () => {
  it("only use generateStaticParams with a closed param list, so no URL becomes its own ISR page", () => {
    const open = webRouteFiles(APP_DIR)
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return (
          /generateStaticParams/.test(source) && !/export const dynamicParams = false/.test(source)
        );
      })
      .map((file) => relative(APP_DIR, file));

    expect(open).toEqual([]);
  });

  it("finds the token routes it is meant to guard", () => {
    const files = webRouteFiles(APP_DIR).map((file) => relative(APP_DIR, file));
    expect(files).toContain(join("s", "[token]", "layout.web.tsx"));
  });
});
