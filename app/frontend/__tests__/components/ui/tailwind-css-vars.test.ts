import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../../..");
const DIRS = ["components", "app", "hooks", "lib"];
const BARE_VAR = /-\[--[a-z][\w-]*\]/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

/** Tailwind v4 reads `max-h-[--x]` as the literal value `--x`, which the browser drops; it must be `max-h-[var(--x)]`. */
describe("Tailwind arbitrary values", () => {
  it("never use a bare CSS custom property", () => {
    const offenders = DIRS.flatMap((d) => sourceFiles(path.join(ROOT, d))).flatMap((file) =>
      (readFileSync(file, "utf8").match(BARE_VAR) ?? []).map((m) => `${path.relative(ROOT, file)}: ${m}`),
    );
    expect(offenders).toEqual([]);
  });
});
