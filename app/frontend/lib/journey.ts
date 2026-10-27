import type { JourneyEvent, JourneyFamily } from "@/lib/api";

/** Journey families in the order the filter shows them. */
export const JOURNEY_FAMILIES: JourneyFamily[] = [
  "auth",
  "security",
  "files",
  "sharing",
  "storage",
  "admin",
  "account",
];

/** The local calendar day of a timestamp, as YYYY-MM-DD. */
export function localDay(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Groups newest-first events by local day, keeping their order. */
export function groupByDay(events: JourneyEvent[]): { day: string; events: JourneyEvent[] }[] {
  const out: { day: string; events: JourneyEvent[] }[] = [];
  for (const e of events) {
    const day = localDay(e.created_at);
    const last = out[out.length - 1];
    if (last?.day === day) last.events.push(e);
    else out.push({ day, events: [e] });
  }
  return out;
}

/** A string field of an event's metadata, or "" when absent. */
export function metaText(e: JourneyEvent, key: string): string {
  const v = e.metadata?.[key];
  return typeof v === "string" || typeof v === "number" ? String(v) : "";
}
