"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Star, Send, Heart } from "@/lib/icons";
import { submitFeedback } from "@/lib/api";
import { toast } from "@/store/toast";
import { Textarea } from "@/components/ui/textarea";

interface FeedbackModalProps {
  open: boolean;
  onClose: () => void;
  onSubmitted: () => void;
}

export function FeedbackModal({ open, onClose, onSubmitted }: FeedbackModalProps) {
  const [rating, setRating] = useState(0);
  const [hoveredStar, setHoveredStar] = useState(0);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (rating === 0) return;
    setSubmitting(true);
    try {
      await submitFeedback({
        rating,
        message,
        context: `dashboard`,
      });
      setSubmitted(true);
      onSubmitted();
      setTimeout(() => {
        onClose();
        // Reset state after close animation
        setTimeout(() => {
          setSubmitted(false);
          setRating(0);
          setMessage("");
        }, 300);
      }, 2000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit feedback");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDismiss = () => {
    onClose();
    setTimeout(() => {
      setRating(0);
      setMessage("");
      setSubmitted(false);
    }, 300);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleDismiss}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md"
          >
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-2xl">
              {submitted ? (
                /* Thank You State */
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center py-8"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", delay: 0.1 }}
                    className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-cyan-500/10 mb-4"
                  >
                    <Heart className="h-8 w-8 text-cyan-500" />
                  </motion.div>
                  <h3 className="text-xl font-bold">Thank you!</h3>
                  <p className="text-sm text-[var(--color-text-secondary)] mt-2">
                    Your feedback helps us build a better product.
                  </p>
                </motion.div>
              ) : (
                <>
                  {/* Header */}
                  <div className="flex items-start justify-between mb-6">
                    <div>
                      <h3 className="text-lg font-bold">How are we doing?</h3>
                      <p className="text-sm text-[var(--color-text-secondary)] mt-1">
                        We&apos;d love to hear your thoughts on zcrypt.
                      </p>
                    </div>
                    <button
                      onClick={handleDismiss}
                      className="p-1.5 rounded-lg hover:bg-[var(--color-bg)] transition-colors"
                    >
                      <X className="h-4 w-4 text-[var(--color-text-muted)]" />
                    </button>
                  </div>

                  {/* Star Rating */}
                  <div className="flex items-center justify-center gap-2 mb-6">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        onMouseEnter={() => setHoveredStar(star)}
                        onMouseLeave={() => setHoveredStar(0)}
                        onClick={() => setRating(star)}
                        className="p-1 transition-transform hover:scale-110"
                      >
                        <Star
                          className={`h-8 w-8 transition-colors ${
                            star <= (hoveredStar || rating)
                              ? "fill-amber-400 text-amber-400"
                              : "text-slate-300 dark:text-slate-600"
                          }`}
                        />
                      </button>
                    ))}
                  </div>

                  {/* Message */}
                  <Textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Tell us what you think... (optional)"
                    rows={3}
                    className="bg-[var(--color-bg)] px-4 py-3 resize-none focus:ring-cyan-500/30 focus:border-[var(--color-border)]"
                  />

                  {/* Actions */}
                  <div className="flex items-center justify-between mt-4">
                    <button
                      onClick={handleDismiss}
                      className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
                    >
                      Maybe later
                    </button>
                    <button
                      onClick={handleSubmit}
                      disabled={rating === 0 || submitting}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-500 text-white text-sm font-semibold hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {submitting ? (
                        "Sending..."
                      ) : (
                        <>
                          Submit <Send className="h-3.5 w-3.5" />
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
