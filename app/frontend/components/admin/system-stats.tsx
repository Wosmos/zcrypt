"use client";

import { Users, FileText, Database, GitBranch } from "lucide-react";
import { formatBytes } from "@/lib/utils";
import type { SystemStats } from "@/types";

export function SystemStatsCards({ stats }: { stats: SystemStats }) {
  const cards = [
    {
      label: "Total Users",
      value: stats.total_users.toLocaleString(),
      icon: Users,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      label: "Total Files",
      value: stats.total_files.toLocaleString(),
      icon: FileText,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
    },
    {
      label: "Total Storage",
      value: formatBytes(stats.total_size),
      icon: Database,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
    },
    {
      label: "Total Repos",
      value: stats.total_repos.toLocaleString(),
      icon: GitBranch,
      color: "text-purple-500",
      bg: "bg-purple-500/10",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map(({ label, value, icon: Icon, color, bg }) => (
        <div
          key={label}
          className="card px-5 py-4 flex items-center gap-4"
        >
          <div className={`flex items-center justify-center h-10 w-10 rounded-xl ${bg} flex-shrink-0`}>
            <Icon className={`h-5 w-5 ${color}`} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-[var(--color-text-muted)] uppercase tracking-wider font-medium">
              {label}
            </p>
            <p className="text-lg font-bold tabular-nums truncate">{value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
