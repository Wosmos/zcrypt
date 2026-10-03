"use client";

import { useState } from "react";
import { verifyFiles, type VerifyFilesReport } from "@/lib/api";
import { invalidateFilesViews } from "@/lib/invalidate";
import { Loader2, ShieldCheck } from "@/lib/icons";
import { toast } from "@/store/toast";
import { ButtonRow, SettingGroup } from "@/components/settings/settings-primitives";

function summary(r: VerifyFilesReport): string {
  const damaged = r.damaged_files.length;
  if (damaged > 0) {
    return `${damaged} of ${r.checked_files} file${r.checked_files === 1 ? "" : "s"} ${damaged === 1 ? "is" : "are"} missing data. They're marked Damaged: upload them again.`;
  }
  const skipped =
    r.unverified_repos > 0
      ? ` ${r.unverified_repos} repo${r.unverified_repos === 1 ? "" : "s"} (e.g. Telegram) can't be checked.`
      : "";
  return `All ${r.checked_files} checked file${r.checked_files === 1 ? "" : "s"} are intact.${skipped}`;
}

/**
 * "Verify my files": asks the server to list every repo on its platform and
 * compare it to what the vault expects, so lost chunks show up as Damaged files
 * instead of a preview that silently never loads.
 */
export function VerifyFiles() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const run = async () => {
    if (running) return;
    setRunning(true);
    try {
      const report = await verifyFiles();
      const text = summary(report);
      setResult(text);
      if (report.damaged_files.length > 0) toast.error(text);
      else toast.success(text);
      await invalidateFilesViews();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not verify your files");
    } finally {
      setRunning(false);
    }
  };

  return (
    <SettingGroup
      label="File integrity"
      footnote="Checks that every stored piece of every file is still on its platform."
    >
      <ButtonRow
        onClick={run}
        chevron={false}
        icon={
          running ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ShieldCheck className="h-4 w-4" />
          )
        }
        title={running ? "Verifying…" : "Verify my files"}
        subtitle={result ?? "Find files whose data has gone missing from storage"}
      />
    </SettingGroup>
  );
}
