"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Star } from "@/lib/icons";
import { getMyReview, submitReview } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";
import { toast } from "@/store/toast";

const QUOTE_MAX = 280;
const NAME_MAX = 40;

interface ReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReviewDialog({ open, onOpenChange }: ReviewDialogProps) {
  const user = useAuthStore((s) => s.user);
  const fallbackName = user?.display_name || user?.username || "";
  const { data: existing } = useQuery({
    queryKey: qk.myReview,
    queryFn: getMyReview,
    enabled: open && !!user,
  });

  const [rating, setRating] = useState(0);
  const [quote, setQuote] = useState("");
  const [name, setName] = useState(fallbackName);
  const [publicOk, setPublicOk] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRating(existing?.rating ?? 0);
    setQuote(existing?.quote ?? "");
    setName(existing?.display_name || fallbackName);
    setPublicOk(existing?.public_ok ?? false);
  }, [open, existing, fallbackName]);

  const canSubmit = rating > 0 && quote.trim() !== "" && name.trim() !== "" && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await submitReview({
        rating,
        quote: quote.trim(),
        display_name: name.trim(),
        public_ok: publicOk,
      });
      toast.success(
        publicOk
          ? "Thanks. It will show on the site once we've read it."
          : "Thanks for the review.",
      );
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send your review");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl border-[var(--color-border)] bg-[var(--color-surface)]">
        <DialogHeader>
          <DialogTitle>Rate zcrypt</DialogTitle>
          <DialogDescription>
            Honest is better than nice. Only reviews you allow on the website are ever shown there,
            and only after we have read them.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div role="radiogroup" aria-label="Rating" className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} ${n === 1 ? "star" : "stars"}`}
                onClick={() => setRating(n)}
                className="rounded-md p-1 outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40"
              >
                <Star
                  className={cn(
                    "h-7 w-7 transition-colors",
                    n <= rating
                      ? "[&_path]:fill-current text-[var(--color-accent)]"
                      : "text-[var(--color-text-muted)]",
                  )}
                />
              </button>
            ))}
          </div>

          <div>
            <Textarea
              value={quote}
              onChange={(e) => setQuote(e.target.value)}
              maxLength={QUOTE_MAX}
              rows={4}
              placeholder="What do you like, or not like, about zcrypt?"
              aria-label="Your review"
            />
            <p className="mt-1 text-right text-[11px] text-[var(--color-text-muted)] tabular-nums">
              {quote.length}/{QUOTE_MAX}
            </p>
          </div>

          <Input
            label="Display name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={NAME_MAX}
            placeholder="How your name should appear"
          />

          <label className="flex cursor-pointer items-start gap-2.5 text-sm text-[var(--color-text-secondary)]">
            <Checkbox
              checked={publicOk}
              onCheckedChange={(v) => setPublicOk(v === true)}
              className="mt-0.5"
            />
            OK to show on the website
          </label>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={!canSubmit}>
            {submitting ? "Sending..." : existing ? "Update review" : "Send review"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
