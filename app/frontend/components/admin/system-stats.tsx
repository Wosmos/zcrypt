import { Users, FileText, Database, GitBranch } from "@/lib/icons";
import { formatBytes } from "@/lib/utils";
import { StatCard } from "@/components/ui/stat-card";
import type { SystemStats } from "@/types";

export function SystemStatsCards({ stats }: { stats: SystemStats }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard
        label="Total users"
        value={stats.total_users.toLocaleString()}
        icon={Users}
        accent
      />
      <StatCard
        label="Total files"
        value={stats.total_files.toLocaleString()}
        icon={FileText}
      />
      <StatCard
        label="Total storage"
        value={formatBytes(stats.total_size)}
        icon={Database}
      />
      <StatCard
        label="Total repos"
        value={stats.total_repos.toLocaleString()}
        icon={GitBranch}
      />
    </div>
  );
}
