import { formatBytes } from "@/lib/utils";
import { WebTransferLimitCode, formatResetDate } from "@/lib/web-transfer-limit";
import type { WebTransferNotice } from "@/store/web-transfer-notice";

/** How many refused files the dialog names before it says "and N more". */
export const NOTICE_LIST_MAX = 3;

/** A message key under `app.webLimit` plus its values. */
export interface NoticeText {
  key: string;
  values?: Record<string, string | number>;
}

/** Everything the dialog says, ready to translate. */
export interface NoticeCopy {
  title: NoticeText;
  body: NoticeText;
  /** "Open the app, then drop the file there.", when there are files to drop. */
  hint?: NoticeText;
  /** The refused files to name, already sized for reading. */
  list: { name: string; size: string }[];
  /** Refused files left out of `list`. */
  more: number;
}

/** What the "use the desktop app" dialog says for one notice. */
export function noticeCopy(notice: WebTransferNotice): NoticeCopy {
  const limit = formatBytes(notice.limitBytes);
  const count = notice.files.length;
  const hint = count > 0 ? { key: "hint", values: { count } } : undefined;

  if (notice.code === WebTransferLimitCode.AllowanceExceeded) {
    const used = formatBytes(Math.min(notice.usedBytes ?? notice.limitBytes, notice.limitBytes));
    return {
      title: { key: "allowanceTitle" },
      body: notice.resetsAt
        ? {
            key: "allowanceBody",
            values: { used, limit, date: formatResetDate(notice.resetsAt) },
          }
        : { key: "allowanceBodyNoDate", values: { used, limit } },
      hint,
      list: [],
      more: 0,
    };
  }

  if (count === 1) {
    const [file] = notice.files;
    return {
      title: { key: "tooBigTitle" },
      body: { key: "tooBigBody", values: { name: file.name, size: formatBytes(file.size), limit } },
      hint,
      list: [],
      more: 0,
    };
  }

  const list = notice.files
    .slice(0, NOTICE_LIST_MAX)
    .map((f) => ({ name: f.name, size: formatBytes(f.size) }));
  return {
    title: count > 1 ? { key: "tooBigManyTitle", values: { count } } : { key: "tooBigTitle" },
    body: { key: "capBody", values: { limit } },
    hint,
    list,
    more: Math.max(0, count - NOTICE_LIST_MAX),
  };
}
