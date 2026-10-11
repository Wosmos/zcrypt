import { Globe, Monitor, Smartphone } from "@/lib/icons";
import { desktopEngine } from "@/lib/data";
import type { ReactNode } from "react";
import { pageText, related, cta, hero, type HeroData, type CtaData, type RelatedItem } from "./t";

export interface AppsPageData {
  hero: HeroData;
  sharedCoreNote: ReactNode;
  surfacesSection: { eyebrow: ReactNode; heading: ReactNode; subheading: ReactNode };
  surfaces: {
    Icon: typeof Globe;
    name: ReactNode;
    tagline: ReactNode;
    desc: ReactNode;
    points: ReactNode[];
    href: string;
    cta: ReactNode;
    badge?: ReactNode;
  }[];
  comparisonSection: {
    eyebrow: ReactNode;
    heading: ReactNode;
    subheading: ReactNode;
    footnote: ReactNode;
  };
  comparison: { surface: ReactNode; bestFor: ReactNode; install: ReactNode; runsOn: ReactNode }[];
  related: RelatedItem[];
  cta: CtaData;
}

const tx = pageText("apps");
const engine = { name: desktopEngine.name, language: desktopEngine.language };

function surface(
  id: "web" | "desktop" | "android",
  Icon: typeof Globe,
  href: string,
  withEngine: boolean,
  badge?: ReactNode,
) {
  const v = withEngine ? engine : undefined;
  return {
    Icon,
    name: tx(`surfaces.${id}.name`),
    tagline: tx(`surfaces.${id}.tagline`),
    desc: tx(`surfaces.${id}.desc`, v),
    points: [1, 2, 3, 4].map((n) => tx(`surfaces.${id}.point${n}`)),
    href,
    cta: tx(`surfaces.${id}.cta`),
    badge,
  };
}

function row(id: "web" | "desktop" | "android") {
  return {
    surface: tx(`surfaces.${id}.name`),
    bestFor: tx(`compare.${id}.bestFor`),
    install: tx(`compare.${id}.install`),
    runsOn: tx(`compare.${id}.runsOn`),
  };
}

export const apps: AppsPageData = {
  hero: hero(tx, tx("hero.secondaryLabel"), "/download"),
  sharedCoreNote: tx("sharedCore", engine),
  surfacesSection: {
    eyebrow: tx("surfaces.eyebrow"),
    heading: tx("surfaces.heading"),
    subheading: tx("surfaces.subheading"),
  },
  surfaces: [
    surface("web", Globe, "/docs/web-app", false),
    surface("desktop", Monitor, "/docs/desktop-app", true),
    surface("android", Smartphone, "/docs/android-app", true, pageText("common")("beta")),
  ],
  comparisonSection: {
    eyebrow: tx("compare.eyebrow"),
    heading: tx("compare.heading"),
    subheading: tx("compare.subheading"),
    footnote: tx("compare.footnote"),
  },
  comparison: [row("web"), row("desktop"), row("android")],
  related: related(tx, [
    ["/features/encrypted-drive", "drive"],
    ["/docs/android-app", "android"],
    ["/docs/desktop-app", "desktop"],
  ]),
  cta: cta(tx),
};
