"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Download, Upload } from "@/lib/icons";
import type { FileMetadata } from "@/types";
import { toast } from "@/store/toast";

interface ExportImportProps {
  files: FileMetadata[];
}

interface VaultExport {
  version: 1;
  exported_at: string;
  file_count: number;
  files: FileMetadata[];
}

export function ExportImport({ files }: ExportImportProps) {
  const t = useTranslations("app.exportImport");
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = useCallback(() => {
    const exportData: VaultExport = {
      version: 1,
      exported_at: new Date().toISOString(),
      file_count: files.length,
      files,
    };

    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `zcrypt-vault-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);

    toast.success(t("exported", { count: files.length }));
  }, [files, t]);

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleImportFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setImporting(true);
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result as string) as VaultExport;
          if (!data.version || !data.files || !Array.isArray(data.files)) {
            toast.error(t("invalidFile"));
            return;
          }
          // For now, just show the data: actual import would need backend support
          toast.success(
            t("found", {
              count: data.files.length,
              date: data.exported_at
                ? new Date(data.exported_at).toLocaleDateString()
                : t("unknownDate"),
            }),
          );
        } catch {
          toast.error(t("parseFailed"));
        } finally {
          setImporting(false);
          if (fileInputRef.current) fileInputRef.current.value = "";
        }
      };
      reader.readAsText(file);
    },
    [t],
  );

  return (
    <section className="card flex h-full flex-col gap-3 p-4">
      <div>
        <h2 className="text-sm font-semibold">{t("title")}</h2>
        <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{t("subtitle")}</p>
      </div>
      <div className="mt-auto flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleExport}
          disabled={files.length === 0}
          className="flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-1)] px-3 py-2 text-xs font-medium transition-colors hover:bg-[var(--color-surface-2)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Download className="h-3.5 w-3.5" />
          {t("exportButton", { count: files.length })}
        </button>
        <button
          type="button"
          onClick={handleImportClick}
          disabled={importing}
          className="flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-xs font-medium text-cyan-600 transition-colors hover:bg-cyan-500/10 disabled:opacity-40 dark:text-cyan-400"
        >
          <Upload className="h-3.5 w-3.5" />
          {importing ? t("importing") : t("importButton")}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleImportFile}
        />
      </div>
    </section>
  );
}
