import { Users, FileText, Database, GitBranch, AlertTriangle } from "@/lib/icons";
import { formatBytes } from "@/lib/utils";
import { StatCard } from "@/components/ui/stat-card";
import type { SystemStats } from "@/types";

function DurabilityAlert({ stats }: { stats: SystemStats }) {
  const degraded = stats.degraded_files ?? 0;
  const damaged = stats.damaged_files ?? 0;
  const stuck = stats.stuck_chunks ?? 0;
  if (degraded + damaged + stuck === 0) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-[var(--color-text)]"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
      <div>
        <p className="font-medium">Some user data is not safely stored</p>
        <p className="mt-0.5 text-[var(--color-text-secondary)]">
          {damaged.toLocaleString()} damaged file{damaged === 1 ? "" : "s"} (missing on the
          platform), {degraded.toLocaleString()} not backed up, {stuck.toLocaleString()} chunk
          {stuck === 1 ? "" : "s"} out of sync retries. Run a reconcile for the affected users.
        </p>
      </div>
    </div>
  );
}

export function SystemStatsCards({ stats }: { stats: SystemStats }) {
  return (
    <div className="space-y-4">
      <DurabilityAlert stats={stats} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Total users"
          value={stats.total_users.toLocaleString()}
          icon={Users}
          accent
        />
        <StatCard label="Total files" value={stats.total_files.toLocaleString()} icon={FileText} />
        <StatCard label="Total storage" value={formatBytes(stats.total_size)} icon={Database} />
        <StatCard label="Total repos" value={stats.total_repos.toLocaleString()} icon={GitBranch} />
      </div>
    </div>
  );
}
