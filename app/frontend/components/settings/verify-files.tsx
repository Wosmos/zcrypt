"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { verifyFiles, type VerifyFilesReport } from "@/lib/api";
import { invalidateFilesViews } from "@/lib/invalidate";
import { Loader2, ShieldCheck } from "@/lib/icons";
import { toast } from "@/store/toast";
import { ButtonRow, SettingGroup } from "@/components/settings/settings-primitives";

type Translate = ReturnType<typeof useTranslations>;

function summary(r: VerifyFilesReport, t: Translate): string {
  const damaged = r.damaged_files.length;
  if (damaged > 0) return t("damaged", { damaged, checked: r.checked_files });
  const intact = t("intact", { checked: r.checked_files });
  return r.unverified_repos > 0
    ? `${intact} ${t("skipped", { count: r.unverified_repos })}`
    : intact;
}

/**
 * "Verify my files": asks the server to list every repo on its platform and
 * compare it to what the vault expects, so lost chunks show up as Damaged files
 * instead of a preview that silently never loads.
 */
export function VerifyFiles() {
  const t = useTranslations("settings.verifyFiles");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const run = async () => {
    if (running) return;
    setRunning(true);
    try {
      const report = await verifyFiles();
      const text = summary(report, t);
      setResult(text);
      if (report.damaged_files.length > 0) toast.error(text);
      else toast.success(text);
      await invalidateFilesViews();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("failed"));
    } finally {
      setRunning(false);
    }
  };

  return (
    <SettingGroup label={t("label")} footnote={t("footnote")}>
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
        title={running ? t("verifying") : t("verify")}
        subtitle={result ?? t("verifyDesc")}
      />
    </SettingGroup>
  );
}
