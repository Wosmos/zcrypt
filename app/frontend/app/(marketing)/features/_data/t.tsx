import type { ReactNode } from "react";
import { T } from "@/components/i18n/t";

type Values = Record<string, string | number>;
type Tx = (path: string, values?: Values) => ReactNode;

export function pageText(page: string): Tx {
  return (path, values) => <T k={`site.features.${page}.${path}`} values={values} />;
}

export const commonText = pageText("common");

export interface RelatedItem {
  href: string;
  title: ReactNode;
  desc: ReactNode;
}

export function related(tx: Tx, items: [href: string, id: string][]): RelatedItem[] {
  return items.map(([href, id]) => ({
    href,
    title: tx(`related.${id}.title`),
    desc: tx(`related.${id}.desc`),
  }));
}

export interface HeroData {
  eyebrow: ReactNode;
  title: ReactNode;
  subtext: ReactNode;
  secondaryLabel: ReactNode;
  secondaryHref: string;
}

export interface CtaData {
  heading: ReactNode;
  subtext: ReactNode;
}

export interface TieInData {
  eyebrow: ReactNode;
  heading: ReactNode;
  body: ReactNode;
  checklistItems: ReactNode[];
  linkLabel: ReactNode;
  linkHref: string;
}

/** The sections every features/* page has; pages extend it with their own. */
export interface FeaturePageData<I> {
  hero: HeroData;
  capabilitiesSection: SectionData;
  capabilities: CapabilityData<I>[];
  tieIn: TieInData;
  related: RelatedItem[];
  cta: CtaData;
}

export interface SectionData {
  heading: ReactNode;
  subheading: ReactNode;
}

export interface CapabilityData<I> {
  Icon: I;
  title: ReactNode;
  desc: ReactNode;
}

export function hero(tx: Tx, secondary: ReactNode, secondaryHref: string): HeroData {
  return {
    eyebrow: tx("hero.eyebrow"),
    title: tx("hero.title"),
    subtext: tx("hero.subtext"),
    secondaryLabel: secondary,
    secondaryHref,
  };
}

export function section(tx: Tx, prefix: string): SectionData {
  return { heading: tx(`${prefix}.heading`), subheading: tx(`${prefix}.subheading`) };
}

export function caps<I>(
  tx: Tx,
  prefix: string,
  rows: [id: string, Icon: I][],
): CapabilityData<I>[] {
  return rows.map(([id, Icon]) => ({
    Icon,
    title: tx(`${prefix}.${id}.title`),
    desc: tx(`${prefix}.${id}.desc`),
  }));
}

export function cta(tx: Tx): CtaData {
  return { heading: tx("cta.heading"), subtext: tx("cta.subtext") };
}

export function checklist(tx: Tx, prefix: string, count: number): ReactNode[] {
  return Array.from({ length: count }, (_, i) => tx(`${prefix}${i + 1}`));
}
