import { describe, expect, it } from "vitest";
import { buildReportHtml, buildReportJson, escapeHtml, type ReportLabels } from "@/lib/user-report-export";
import type { AdminUserReport, JourneyEvent } from "@/lib/api";

const report = (over: Partial<AdminUserReport> = {}): AdminUserReport => ({
  user: { username: "<alice>", email: "a@example.com" } as AdminUserReport["user"],
  used_bytes: 10,
  quota_bytes: 0,
  account_age_days: 3,
  stats: {
    days_active: 2,
    last_active_at: null,
    activity: [],
    files_by_type: [{ label: "pdf", count: 2, bytes: 2048 }],
    platforms: [],
    shares: 0,
    spaces: 0,
    failed_signins_7d: 0,
    countries_7d: [],
    sign_ins_7d: 1,
  },
  storage_growth: [],
  sessions: [
    {
      id: "s1",
      ip_prefix: "10.0.0.0",
      user_agent: "",
      device: "Chrome on Linux",
      country: "DE",
      region: "",
      city: "",
      started_at: "",
      last_active: "",
      expires_at: "",
    },
  ],
  risk_flags: [{ code: "failed_signins", severity: "high", value: 6 }],
  generated_at: "2026-10-27T10:00:00Z",
  ...over,
});

const journey: JourneyEvent[] = [
  {
    id: "e1",
    kind: "login",
    family: "auth",
    created_at: "2026-10-27T09:00:00Z",
    ip_prefix: "",
    user_agent: "",
    device: "",
    metadata: {},
  },
];

const labels: ReportLabels = {
  title: "Account report",
  generated: "Generated",
  account: "Account",
  activity: "Activity",
  risks: "Risk flags",
  noRisks: "No risks",
  sessions: "Sessions",
  noSessions: "No sessions",
  journey: "Journey",
  noJourney: "Nothing",
  filesByType: "Files by type",
  platforms: "Platforms",
  none: "None",
  accountRows: [["Email", "a@example.com"]],
  activityRows: [["Days active", "2"]],
  riskLabel: (code, value) => `${code}:${value}`,
  severityLabel: (s) => s.toUpperCase(),
  sessionLine: (s) => `${s.device} ${s.country}`,
  eventLine: (e) => `${e.kind} & more`,
  date: (iso) => iso.slice(0, 10),
  bytes: (n) => `${n} B`,
};

describe("user report export", () => {
  it("escapes every HTML-significant character", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });

  it("puts the journey next to the report in the JSON", () => {
    const parsed = JSON.parse(buildReportJson(report(), journey));
    expect(parsed.journey).toHaveLength(1);
    expect(parsed.user.email).toBe("a@example.com");
  });

  it("renders an escaped, self-contained summary", () => {
    document.documentElement.lang = "de";
    const html = buildReportHtml(report(), journey, labels);
    expect(html).toContain('<html lang="de">');
    expect(html).toContain("<title>Account report: &lt;alice&gt;</title>");
    expect(html).toContain("<h1>&lt;alice&gt;</h1>");
    expect(html).toContain("HIGH: failed_signins:6");
    expect(html).toContain("pdf: 2 (2048 B)");
    expect(html).toContain("<p class=\"muted\">None</p>");
    expect(html).toContain("Chrome on Linux DE");
    expect(html).toContain("login &amp; more");
    expect(html).toContain("Generated 2026-10-27");
    expect(html).not.toContain("<script");
  });

  it("says when there is nothing to list", () => {
    document.documentElement.lang = "";
    const html = buildReportHtml(report({ risk_flags: [], sessions: [] }), [], labels);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("No risks");
    expect(html).toContain("No sessions");
    expect(html).toContain("Nothing");
  });
});
