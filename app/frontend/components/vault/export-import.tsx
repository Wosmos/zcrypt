"use client";

import { useCallback, useRef, useState } from "react";
import { Download, Upload, CheckCircle2, AlertTriangle } from "lucide-react";
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
    a.download = `zpush-vault-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);

    toast.success(`Exported ${files.length} file records`);
  }, [files]);

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleImportFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string) as VaultExport;
        if (!data.version || !data.files || !Array.isArray(data.files)) {
          toast.error("Invalid vault export file");
          return;
        }
        // For now, just show the data — actual import would need backend support
        toast.success(`Found ${data.files.length} file records from ${data.exported_at ? new Date(data.exported_at).toLocaleDateString() : "unknown date"}. Backend import coming soon.`);
      } catch {
        toast.error("Failed to parse export file");
      } finally {
        setImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsText(file);
  }, []);

  return (
    <section className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--color-border)]">
        <h2 className="text-sm font-semibold">Vault Backup</h2>
        <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
          Export your file index to restore on another machine
        </p>
      </div>
      <div className="p-5 flex flex-col sm:flex-row gap-3">
        <button
          onClick={handleExport}
          disabled={files.length === 0}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] text-sm font-medium hover:bg-[var(--color-surface-2)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Download className="h-4 w-4" />
          Export Metadata ({files.length} files)
        </button>
        <button
          onClick={handleImportClick}
          disabled={importing}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-40"
        >
          <Upload className="h-4 w-4" />
          {importing ? "Importing..." : "Import Metadata"}
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
