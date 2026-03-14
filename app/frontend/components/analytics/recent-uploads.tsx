"use client";

import { formatBytes, formatDate, getFileTypeInfo } from "@/lib/utils";
import type { FileMetadata } from "@/types";
import {
  File, FileText, Image, Video, Music, Archive, Code, Cog, Table,
} from "@/lib/icons";

interface RecentUploadsProps {
  files: FileMetadata[];
}

const iconMap: Record<string, typeof File> = {
  File, FileText, Image, Video, Music, Archive, Code, Cog, Table,
};

export function RecentUploads({ files }: RecentUploadsProps) {
  const recent = [...files]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 8);

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--color-border)]">
        <h3 className="text-sm font-semibold">Recent Uploads</h3>
      </div>

      {recent.length === 0 ? (
        <div className="flex items-center justify-center h-[120px] text-sm text-[var(--color-text-muted)]">
          No uploads yet
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="text-left px-5 py-3 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Name</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Date</th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Size</th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Saved</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((file) => {
                  const typeInfo = getFileTypeInfo(file.original_name);
                  const Icon = iconMap[typeInfo.icon] || File;
                  const savings = file.original_size > 0
                    ? ((1 - file.encrypted_size / file.original_size) * 100).toFixed(0)
                    : "0";

                  return (
                    <tr key={file.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-1)] transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`flex items-center justify-center h-8 w-8 rounded-lg ${typeInfo.bg}`}>
                            <Icon className={`h-4 w-4 ${typeInfo.color}`} />
                          </div>
                          <span className="font-medium truncate max-w-[200px]">{file.original_name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-[var(--color-text-secondary)]">{formatDate(file.created_at)}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{formatBytes(file.original_size)}</td>
                      <td className="px-5 py-3 text-right">
                        <span className="text-cyan-500 font-medium">{savings}%</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile list */}
          <div className="sm:hidden divide-y divide-[var(--color-border)]">
            {recent.map((file) => {
              const typeInfo = getFileTypeInfo(file.original_name);
              const Icon = iconMap[typeInfo.icon] || File;

              return (
                <div key={file.id} className="flex items-center gap-3 px-5 py-3">
                  <div className={`flex items-center justify-center h-8 w-8 rounded-lg flex-shrink-0 ${typeInfo.bg}`}>
                    <Icon className={`h-4 w-4 ${typeInfo.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.original_name}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {formatBytes(file.original_size)} &middot; {formatDate(file.created_at)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
