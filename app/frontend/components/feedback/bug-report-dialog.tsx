"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Image as ImageIcon, X } from "@/lib/icons";
import { submitBugReport } from "@/lib/api";
import { collectBugContext, downscaleToJpeg } from "@/lib/bug-report";
import { toast } from "@/store/toast";

const MAX_LEN = 5000;

interface BugReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BugReportDialog({ open, onOpenChange }: BugReportDialogProps) {
  const pathname = usePathname();
  const [description, setDescription] = useState("");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setDescription("");
      setScreenshot(null);
    }
  }, [open]);

  const attach = async (file: Blob) => {
    setProcessing(true);
    try {
      setScreenshot(await downscaleToJpeg(file));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not attach that image");
    } finally {
      setProcessing(false);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"));
    const file = item?.getAsFile();
    if (!file) return;
    e.preventDefault();
    void attach(file);
  };

  const handleSubmit = async () => {
    const text = description.trim();
    if (!text || submitting || processing) return;
    setSubmitting(true);
    try {
      await submitBugReport({
        description: text,
        ...(screenshot ? { screenshot } : {}),
        ...(await collectBugContext(pathname)),
      });
      toast.success("Bug report sent. Thank you.");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send the report");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md rounded-2xl border-[var(--color-border)] bg-[var(--color-surface)]"
        onPaste={handlePaste}
      >
        <DialogHeader>
          <DialogTitle>Report a bug</DialogTitle>
          <DialogDescription>
            Tell us what went wrong. Your app version, platform and current page are attached
            automatically. Nothing from your vault is ever included.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={MAX_LEN}
              rows={5}
              placeholder="What happened, and what did you expect instead?"
              aria-label="Bug description"
              autoFocus
            />
            <p className="mt-1 text-right text-[11px] text-[var(--color-text-muted)] tabular-nums">
              {description.length}/{MAX_LEN}
            </p>
          </div>

          {screenshot ? (
            <div className="relative overflow-hidden rounded-xl border border-[var(--color-border)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={screenshot}
                alt="Attached screenshot"
                className="max-h-44 w-full object-contain"
              />
              <button
                type="button"
                onClick={() => setScreenshot(null)}
                aria-label="Remove screenshot"
                className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={processing}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--color-border-hover)] px-3 py-4 text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-1)] disabled:opacity-50"
            >
              <ImageIcon className="h-4 w-4" />
              {processing ? "Processing image..." : "Add a screenshot (choose a file or paste one)"}
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void attach(file);
            }}
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={!description.trim() || submitting || processing}
          >
            {submitting ? "Sending..." : "Send report"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
