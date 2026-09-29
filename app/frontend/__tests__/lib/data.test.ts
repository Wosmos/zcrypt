import { describe, it, expect } from "vitest";
import {
  bentoFeatures,
  features,
  accentColors,
  steps,
  faqs,
  trustBadges,
  tuiFeatures,
  tuiShortcuts,
  tuiCommands,
  tuiProfiles,
  tuiInstallMethods,
  GITHUB_REPO,
  RELEASES_URL,
  tuiQuickStart,
  docsNav,
} from "@/lib/data";

describe("static content arrays", () => {

  it("bentoFeatures entries carry title, desc, icon, span, and bg", () => {
    expect(bentoFeatures.length).toBeGreaterThan(0);
    for (const f of bentoFeatures) {
      expect(f.title.length).toBeGreaterThan(0);
      expect(f.desc.length).toBeGreaterThan(0);
      expect(f.icon.length).toBeGreaterThan(0);
      expect(f.span.length).toBeGreaterThan(0);
      expect(f.bg.length).toBeGreaterThan(0);
    }
  });

  it("features entries reference a color present in accentColors", () => {
    expect(features.length).toBeGreaterThan(0);
    for (const f of features) {
      expect(accentColors[f.accent]).toBeDefined();
      expect(typeof f.large).toBe("boolean");
    }
  });

  it("accentColors covers cyan, amber, violet, and rose", () => {
    expect(Object.keys(accentColors).sort()).toEqual(["amber", "cyan", "rose", "violet"]);
  });

  it("steps are numbered and non-empty", () => {
    expect(steps.length).toBeGreaterThan(0);
    for (const s of steps) {
      expect(s.num.length).toBeGreaterThan(0);
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.desc.length).toBeGreaterThan(0);
    }
  });

  it("faqs each have a question and an answer", () => {
    expect(faqs.length).toBeGreaterThan(0);
    for (const f of faqs) {
      expect(f.q.length).toBeGreaterThan(0);
      expect(f.a.length).toBeGreaterThan(0);
    }
  });


  it("trustBadges is a non-empty list of strings", () => {
    expect(trustBadges.length).toBeGreaterThan(0);
    for (const b of trustBadges) expect(typeof b).toBe("string");
  });
});

describe("TUI marketing content", () => {
  it("tuiFeatures, tuiShortcuts, tuiCommands, tuiProfiles are populated", () => {
    expect(tuiFeatures.length).toBeGreaterThan(0);
    expect(tuiShortcuts.length).toBeGreaterThan(0);
    expect(tuiCommands.length).toBeGreaterThan(0);
    expect(tuiProfiles.length).toBeGreaterThan(0);
  });

  it("tuiInstallMethods each have a label and command", () => {
    expect(tuiInstallMethods.length).toBeGreaterThan(0);
    for (const m of tuiInstallMethods) {
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.command.length).toBeGreaterThan(0);
      expect(m.note.length).toBeGreaterThan(0);
    }
  });

  it("tuiQuickStart steps are ordered and describe an action", () => {
    expect(tuiQuickStart.length).toBeGreaterThan(0);
    for (const s of tuiQuickStart) {
      expect(s.step.length).toBeGreaterThan(0);
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.desc.length).toBeGreaterThan(0);
    }
  });
});

describe("repo/releases constants", () => {
  it("GITHUB_REPO points at the zcrypt repo and RELEASES_URL derives from it", () => {
    expect(GITHUB_REPO).toBe("https://github.com/Wosmos/zcrypt");
    expect(RELEASES_URL).toBe(`${GITHUB_REPO}/releases`);
  });
});

describe("docsNav", () => {
  it("has at least one group, each with a title, summary, and links", () => {
    expect(docsNav.length).toBeGreaterThan(0);
    for (const group of docsNav) {
      expect(group.title.length).toBeGreaterThan(0);
      expect(group.summary.length).toBeGreaterThan(0);
      expect(group.links.length).toBeGreaterThan(0);
    }
  });

  it("every link has a title, href, and desc", () => {
    for (const group of docsNav) {
      for (const link of group.links) {
        expect(link.title.length).toBeGreaterThan(0);
        expect(link.href.length).toBeGreaterThan(0);
        expect(link.desc.length).toBeGreaterThan(0);
      }
    }
  });

  it("includes the external TUI link with the external flag set", () => {
    const tuiLink = docsNav
      .flatMap((g) => g.links)
      .find((l) => l.href === "/tui");
    expect(tuiLink).toBeDefined();
    expect(tuiLink?.external).toBe(true);
  });

  it("badged links only use Beta, Roadmap, or New", () => {
    const badges = docsNav.flatMap((g) => g.links).map((l) => l.badge).filter(Boolean);
    for (const badge of badges) {
      expect(["Beta", "Roadmap", "New"]).toContain(badge);
    }
  });
});
