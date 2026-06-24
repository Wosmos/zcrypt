"use client";

import { useEffect, useState } from "react";
import { adminListFeedback, type AdminFeedbackResponse } from "@/lib/api";
import { Star, MessageSquare } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { SkeletonRow } from "@/components/ui/skeletons";

const PAGE_SIZE = 10;

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={cn(
            "h-3.5 w-3.5",
            star <= rating
              ? "fill-amber-400 text-amber-400"
              : "text-[var(--color-border-hover)]"
          )}
        />
      ))}
    </div>
  );
}

export function FeedbackList() {
  const [data, setData] = useState<AdminFeedbackResponse | null>(null);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchPage = async (offset: number) => {
    setLoading(true);
    try {
      const res = await adminListFeedback(PAGE_SIZE, offset);
      setData(res);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPage(page * PAGE_SIZE);
  }, [page]);

  const feedback = data?.feedback ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const avgRating = feedback.length > 0
    ? feedback.reduce((sum, f) => sum + f.rating, 0) / feedback.length
    : 0;

  return (
    <div className="panel overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-[var(--color-border)] p-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10">
          <MessageSquare className="h-4 w-4 text-amber-500" />
        </div>
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-[var(--color-text)]">User feedback</h3>
          <p className="text-xs text-[var(--color-text-muted)]">
            <span className="tabular-nums">{total}</span> response{total !== 1 ? "s" : ""}
            {avgRating > 0 && (
              <span className="ml-2">
                Avg: <span className="font-semibold text-amber-500 tabular-nums">{avgRating.toFixed(1)}</span>/5
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="divide-y divide-[var(--color-border)] px-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : feedback.length === 0 ? (
        <EmptyState
          icon={<MessageSquare className="h-7 w-7 text-[var(--color-text-muted)]" />}
          title="No feedback yet"
          description="When users submit feedback, their ratings and messages will appear here."
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-1)]">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
                    User
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
                    Rating
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
                    Message
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody>
                {feedback.map((f) => (
                  <tr
                    key={f.id}
                    className="border-b border-[var(--color-border)] transition-colors last:border-0 hover:bg-[var(--color-surface-1)]"
                  >
                    <td className="px-4 py-3.5">
                      <p className="text-sm font-medium text-[var(--color-text)]">{f.username}</p>
                      <p className="truncate text-xs text-[var(--color-text-muted)]">{f.email}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex justify-center">
                        <Stars rating={f.rating} />
                      </div>
                    </td>
                    <td className="max-w-xs px-4 py-3.5">
                      <p className="truncate text-sm text-[var(--color-text-secondary)]">
                        {f.message || <span className="italic text-[var(--color-text-muted)]">No message</span>}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-right text-xs text-[var(--color-text-muted)] tabular-nums">
                      {new Date(f.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card layout */}
          <div className="divide-y divide-[var(--color-border)] sm:hidden">
            {feedback.map((f) => (
              <div key={f.id} className="space-y-2 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--color-text)]">{f.username}</p>
                    <p className="truncate text-xs text-[var(--color-text-muted)]">{f.email}</p>
                  </div>
                  <div className="flex flex-shrink-0 flex-col items-end gap-1">
                    <Stars rating={f.rating} />
                    <span className="text-[10px] text-[var(--color-text-muted)] tabular-nums">
                      {new Date(f.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                {f.message && (
                  <p className="line-clamp-3 text-sm text-[var(--color-text-secondary)]">{f.message}</p>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="border-t border-[var(--color-border)] px-4 py-3">
          <Pagination
            currentPage={page + 1}
            totalPages={totalPages}
            onPageChange={(p) => setPage(p - 1)}
            totalItems={total}
            pageSize={PAGE_SIZE}
          />
        </div>
      )}
    </div>
  );
}
