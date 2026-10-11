// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const script = path.resolve(__dirname, "../../../../scripts/release-notes.sh");
const run = (cwd: string, tag: string) =>
  execFileSync("bash", [script, tag], { cwd, encoding: "utf8" });

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd });

describe("release-notes.sh", () => {
  it("prints the curated entry when the version has one", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "rn-"));
    git(dir, "init", "-q");
    writeFileSync(path.join(dir, "a"), "1");
    git(dir, "add", ".");
    git(dir, "commit", "-qm", "feat: something raw");
    git(dir, "tag", "v0.1.7");
    const out = run(dir, "v0.1.7");
    expect(out).toContain("New\n- A short guided tour");
    expect(out).toContain("Security\n- Two-factor");
    expect(out).not.toContain("something raw");
  });

  it("falls back to commit subjects without a curated entry", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "rn-"));
    git(dir, "init", "-q");
    writeFileSync(path.join(dir, "a"), "1");
    git(dir, "add", ".");
    git(dir, "commit", "-qm", "chore: start");
    git(dir, "tag", "v9.9.8");
    writeFileSync(path.join(dir, "a"), "2");
    git(dir, "commit", "-qam", "feat: shiny thing");
    writeFileSync(path.join(dir, "a"), "3");
    git(dir, "commit", "-qam", "fix: broken thing");
    git(dir, "tag", "v9.9.9");
    const out = run(dir, "v9.9.9");
    expect(out).toContain("New\n- Shiny thing");
    expect(out).toContain("Fixed\n- Broken thing");
  });
});
