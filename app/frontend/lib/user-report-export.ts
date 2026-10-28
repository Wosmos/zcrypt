import type { AdminUserReport, JourneyEvent } from "@/lib/api";

/** Translated text the printable summary needs; the caller supplies it. */
export interface ReportLabels {
  title: string;
  generated: string;
  account: string;
  activity: string;
  risks: string;
  noRisks: string;
  sessions: string;
  noSessions: string;
  journey: string;
  noJourney: string;
  filesByType: string;
  platforms: string;
  none: string;
  /** Label/value rows for the account and activity tables, already formatted. */
  accountRows: [string, string][];
  activityRows: [string, string][];
  riskLabel: (code: string, value?: number) => string;
  severityLabel: (severity: string) => string;
  sessionLine: (s: AdminUserReport["sessions"][number]) => string;
  eventLine: (e: JourneyEvent) => string;
  date: (iso: string) => string;
  bytes: (n: number) => string;
}

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escapes text for HTML content and attribute values. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** The machine-readable export: the report plus the journey that was loaded. */
export function buildReportJson(report: AdminUserReport, journey: JourneyEvent[]): string {
  return JSON.stringify({ ...report, journey }, null, 2);
}

function table(rows: [string, string][]): string {
  return `<table>${rows
    .map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`)
    .join("")}</table>`;
}

function list(items: string[], empty: string): string {
  if (items.length === 0) return `<p class="muted">${escapeHtml(empty)}</p>`;
  return `<ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`;
}

/** A self-contained printable HTML summary of a user's report and journey. */
export function buildReportHtml(
  report: AdminUserReport,
  journey: JourneyEvent[],
  l: ReportLabels,
): string {
  const u = report.user;
  const breakdown = (rows: AdminUserReport["stats"]["files_by_type"]) =>
    rows.map((r) => `${r.label}: ${r.count} (${l.bytes(r.bytes)})`);
  return `<!doctype html>
<html lang="${escapeHtml(document.documentElement.lang || "en")}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(`${l.title}: ${u.username}`)}</title>
<style>
body{font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:#111;margin:40px auto;max-width:760px;padding:0 20px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;margin:28px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px}
.muted{color:#666}table{border-collapse:collapse;width:100%}th,td{text-align:start;padding:4px 8px 4px 0;vertical-align:top}
th{font-weight:500;color:#555;width:40%}ul{margin:0;padding-inline-start:18px}li{margin:2px 0}
@media print{body{margin:0}}
</style>
</head>
<body>
<h1>${escapeHtml(u.username)}</h1>
<p class="muted">${escapeHtml(u.email)} &middot; ${escapeHtml(l.generated)} ${escapeHtml(l.date(report.generated_at))}</p>
<h2>${escapeHtml(l.account)}</h2>
${table(l.accountRows)}
<h2>${escapeHtml(l.activity)}</h2>
${table(l.activityRows)}
<h2>${escapeHtml(l.risks)}</h2>
${list(
  report.risk_flags.map((f) => `${l.severityLabel(f.severity)}: ${l.riskLabel(f.code, f.value)}`),
  l.noRisks,
)}
<h2>${escapeHtml(l.filesByType)}</h2>
${list(breakdown(report.stats.files_by_type), l.none)}
<h2>${escapeHtml(l.platforms)}</h2>
${list(breakdown(report.stats.platforms), l.none)}
<h2>${escapeHtml(l.sessions)}</h2>
${list(report.sessions.map(l.sessionLine), l.noSessions)}
<h2>${escapeHtml(l.journey)}</h2>
${list(journey.map(l.eventLine), l.noJourney)}
</body>
</html>`;
}
