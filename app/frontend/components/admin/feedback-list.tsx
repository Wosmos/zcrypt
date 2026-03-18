"use client";

import { useEffect, useState } from "react";
import { adminListFeedback, type AdminFeedbackResponse } from "@/lib/api";
import { Star, MessageSquare, ChevronLeft, ChevronRight } from "@/lib/icons";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;

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

  // Compute average rating
  const avgRating = feedback.length > 0
    ? feedback.reduce((sum, f) => sum + f.rating, 0) / feedback.length
    : 0;

  const Stars = ({ rating }: { rating: number }) => (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={cn(
            "h-3.5 w-3.5",
            star <= rating
              ? "fill-amber-400 text-amber-400"
              : "text-slate-300 dark:text-slate-600"
          )}
        />
      ))}
    </div>
  );

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-amber-500/10">
            <MessageSquare className="h-4 w-4 text-amber-500" />
          </div>
          <div>
            <h3 className="text-sm font-bold">User Feedback</h3>
            <p className="text-xs text-[var(--color-text-muted)]">
              {total} response{total !== 1 ? "s" : ""}
              {avgRating > 0 && (
                <span className="ml-2">
                  Avg: <span className="text-amber-500 font-semibold">{avgRating.toFixed(1)}</span>/5
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="p-8 text-center text-sm text-[var(--color-text-muted)]">
          Loading feedback...
        </div>
      ) : feedback.length === 0 ? (
        <div className="p-8 text-center text-sm text-[var(--color-text-muted)]">
          No feedback submitted yet.
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="text-left text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider py-3 px-4">
                    User
                  </th>
                  <th className="text-center text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider py-3 px-4">
                    Rating
                  </th>
                  <th className="text-left text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider py-3 px-4">
                    Message
                  </th>
                  <th className="text-right text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider py-3 px-4">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody>
                {feedback.map((f) => (
                  <tr key={f.id} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="py-3 px-4">
                      <div>
                        <span className="text-sm font-medium text-[var(--color-text)]">
                          {f.username}
                        </span>
                        <p className="text-xs text-[var(--color-text-muted)]">{f.email}</p>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex justify-center">
                        <Stars rating={f.rating} />
                      </div>
                    </td>
                    <td className="py-3 px-4 max-w-xs">
                      <p className="text-sm text-[var(--color-text-secondary)] truncate">
                        {f.message || <span className="italic text-[var(--color-text-muted)]">No message</span>}
                      </p>
                    </td>
                    <td className="py-3 px-4 text-right text-xs text-[var(--color-text-muted)] whitespace-nowrap">
                      {new Date(f.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card layout */}
          <div className="sm:hidden divide-y divide-[var(--color-border)]">
            {feedback.map((f) => (
              <div key={f.id} className="p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{f.username}</p>
                    <p className="text-xs text-[var(--color-text-muted)] truncate">{f.email}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <Stars rating={f.rating} />
                    <span className="text-[10px] text-[var(--color-text-muted)]">
                      {new Date(f.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                {f.message && (
                  <p className="text-sm text-[var(--color-text-secondary)] line-clamp-3">
                    {f.message}
                  </p>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--color-border)]">
          <span className="text-xs text-[var(--color-text-muted)]">
            Page {page + 1} of {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-1.5 rounded-lg hover:bg-[var(--color-surface-1)] disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="p-1.5 rounded-lg hover:bg-[var(--color-surface-1)] disabled:opacity-30 transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
