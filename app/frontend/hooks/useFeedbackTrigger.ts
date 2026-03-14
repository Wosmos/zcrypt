"use client";

import { useState, useEffect, useCallback } from "react";
import { getFeedbackStatus } from "@/lib/api";

const DISMISSED_KEY = "zcrypt_feedback_dismissed";
const MIN_USAGE_BYTES = 500 * 1024 * 1024; // 500 MB

/**
 * Determines whether to show the feedback modal.
 * Triggers when:
 * - User hasn't submitted feedback before
 * - User hasn't dismissed in this session
 * - User has used >= 500 MB or >= 50% of quota
 */
export function useFeedbackTrigger(usedBytes: number, quotaBytes: number) {
  const [showFeedback, setShowFeedback] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // Don't re-check if already checked
    if (checked) return;

    // Check if dismissed in this session
    if (sessionStorage.getItem(DISMISSED_KEY)) {
      setChecked(true);
      return;
    }

    // Check usage thresholds
    const usageAbsolute = usedBytes >= MIN_USAGE_BYTES;
    const usagePercent = quotaBytes > 0 && usedBytes / quotaBytes >= 0.5;

    if (!usageAbsolute && !usagePercent) {
      setChecked(true);
      return;
    }

    // Check server-side if already submitted
    getFeedbackStatus()
      .then(({ submitted }) => {
        if (!submitted) {
          setShowFeedback(true);
        }
      })
      .catch(() => {
        // Silently fail — don't nag on network errors
      })
      .finally(() => setChecked(true));
  }, [usedBytes, quotaBytes, checked]);

  const dismiss = useCallback(() => {
    setShowFeedback(false);
    sessionStorage.setItem(DISMISSED_KEY, "1");
  }, []);

  const markSubmitted = useCallback(() => {
    setShowFeedback(false);
    sessionStorage.setItem(DISMISSED_KEY, "1");
  }, []);

  return { showFeedback, dismiss, markSubmitted };
}
