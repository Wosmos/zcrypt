"use client";

import { useState, useEffect } from "react";
import { motion } from "motion/react";
import Link from "next/link";
import {
  getDeadManSwitch,
  setupDeadManSwitch,
  checkinDeadManSwitch,
  deleteDeadManSwitch,
} from "@/lib/api";
import type { DeadManSwitch } from "@/types";
import { formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { StatCard } from "@/components/ui/stat-card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { LogoSpinner } from "@/components/ui/logo-spinner";
import {
  ArrowLeft,
  ShieldAlert,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Mail,
  User,
  RefreshCw,
} from "@/lib/icons";

function daysUntil(date: string): number {
  const diff = new Date(date).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

const TIMEOUT_OPTIONS = [7, 14, 30, 60, 90, 180, 365];

export function DeadManContent() {
  const [dms, setDms] = useState<DeadManSwitch | null>(null);
  const [loading, setLoading] = useState(true);
  const [notConfigured, setNotConfigured] = useState(false);

  const [contactEmail, setContactEmail] = useState("");
  const [contactName, setContactName] = useState("");
  const [timeoutDays, setTimeoutDays] = useState(90);
  const [message, setMessage] = useState("");
  const [includeFiles, setIncludeFiles] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [checkinLoading, setCheckinLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    getDeadManSwitch()
      .then((data) => {
        if (data && data.id) {
          setDms(data);
          setContactEmail(data.contact_email);
          setContactName(data.contact_name);
          setTimeoutDays(data.timeout_days);
          setMessage(data.message);
          setIncludeFiles(data.include_files);
        } else {
          setNotConfigured(true);
        }
      })
      .catch(() => setNotConfigured(true))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setError("");
    setSuccess("");
    if (!contactEmail.trim()) {
      setError("Contact email is required");
      return;
    }
    if (timeoutDays < 7 || timeoutDays > 365) {
      setError("Timeout must be between 7 and 365 days");
      return;
    }
    setSaving(true);
    try {
      const result = await setupDeadManSwitch({
        contact_email: contactEmail.trim(),
        contact_name: contactName.trim(),
        timeout_days: timeoutDays,
        message: message.trim(),
        include_files: includeFiles,
      });
      setDms(result);
      setNotConfigured(false);
      setSuccess("Dead man's switch saved successfully");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleCheckin = async () => {
    setCheckinLoading(true);
    setSuccess("");
    setError("");
    try {
      await checkinDeadManSwitch();
      const data = await getDeadManSwitch();
      if (data && data.id) setDms(data);
      setSuccess("Check-in successful — timer reset.");
    } catch {
      setError("Check-in failed");
    } finally {
      setCheckinLoading(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError("");
    try {
      await deleteDeadManSwitch();
      setDms(null);
      setNotConfigured(true);
      setContactEmail("");
      setContactName("");
      setTimeoutDays(90);
      setMessage("");
      setIncludeFiles(false);
      setConfirmDelete(false);
      setSuccess("Dead man's switch deleted.");
    } catch {
      setError("Failed to delete");
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LogoSpinner size="md" speed="fast" />
      </div>
    );
  }

  const deadlineDate = dms
    ? new Date(new Date(dms.last_checkin).getTime() + dms.timeout_days * 86400000).toISOString()
    : null;
  const daysLeft = deadlineDate ? daysUntil(deadlineDate) : 0;
  const daysAccent: "danger" | "warn" | "ok" =
    daysLeft <= 7 ? "danger" : daysLeft <= 30 ? "warn" : "ok";

  return (
    <div className="mx-auto max-w-2xl space-y-6 animate-fade-in">
      <Link
        href="/settings"
        className="inline-flex items-center gap-1.5 rounded text-xs text-[var(--color-text-muted)] outline-none transition-colors hover:text-[var(--color-text)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40"
      >
        <ArrowLeft className="h-3 w-3" /> Back to settings
      </Link>

      <PageHeader
        eyebrow="Privacy"
        title="Dead man's switch"
        description="Automatically notify a trusted contact if you stop checking in. Your check-in resets every time you log in."
      />

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-3 text-sm text-red-500 dark:text-red-400"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-3 text-sm text-emerald-600 dark:text-emerald-400"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Triggered banner */}
      {dms?.triggered && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/5 p-4">
          <ShieldAlert className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500 dark:text-red-400" />
          <div>
            <p className="text-sm font-medium text-red-500 dark:text-red-400">Switch triggered</p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-secondary)]">
              Your dead man&apos;s switch was triggered on{" "}
              {dms.triggered_at ? formatDateTime(dms.triggered_at) : "an unknown date"}. Your contact (
              {dms.contact_email}) has been notified.
            </p>
          </div>
        </div>
      )}

      {/* Status */}
      {dms && !dms.triggered && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="panel p-6"
        >
          <Section
            title="Status"
            actions={
              <Badge
                variant="outline"
                className={
                  dms.enabled
                    ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                }
              >
                {dms.enabled ? "Active" : "Paused"}
              </Badge>
            }
          >
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <StatCard
                  label="Days until trigger"
                  value={`${daysLeft}d`}
                  icon={Clock}
                  accent={daysAccent === "ok"}
                  hint={`Timeout: ${dms.timeout_days} days`}
                  className={
                    daysAccent === "danger"
                      ? "ring-1 ring-red-500/30"
                      : daysAccent === "warn"
                        ? "ring-1 ring-amber-500/30"
                        : undefined
                  }
                />
                <StatCard
                  label="Contact"
                  value={
                    <span className="block truncate text-base font-semibold">
                      {dms.contact_name || dms.contact_email}
                    </span>
                  }
                  icon={dms.contact_name ? User : Mail}
                  hint={`Last check-in: ${formatDateTime(dms.last_checkin)}`}
                />
              </div>
              <Button onClick={handleCheckin} disabled={checkinLoading} className="w-full">
                {checkinLoading ? (
                  <span className="flex items-center gap-2">
                    <LogoSpinner size={14} speed="fast" /> Checking in...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <RefreshCw className="h-4 w-4" /> Check in now
                  </span>
                )}
              </Button>
            </div>
          </Section>
        </motion.div>
      )}

      {/* Configuration form */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.05 }}
        className="panel p-6"
      >
        <Section
          title={notConfigured ? "Configure" : "Update configuration"}
          description="Set who gets notified and how long you can stay silent before the switch fires."
        >
          <div className="space-y-4">
            <Input
              type="email"
              label="Contact email *"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="trusted-contact@example.com"
            />
            <Input
              type="text"
              label="Contact name"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="Jane Doe"
            />
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="dms-timeout"
                className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]"
              >
                Timeout (days)
              </label>
              <select
                id="dms-timeout"
                value={timeoutDays}
                onChange={(e) => setTimeoutDays(Number(e.target.value))}
                className="h-10 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 text-sm text-[var(--color-text)] outline-none transition-all focus:border-[var(--color-accent)]/40 focus:ring-2 focus:ring-[var(--color-accent)]/10"
              >
                {TIMEOUT_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d} days{d === 90 ? " (default)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="dms-message"
                className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]"
              >
                Message to contact
              </label>
              <Textarea
                id="dms-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Optional message sent when the switch triggers..."
                rows={3}
                className="resize-none"
              />
            </div>
            <label className="flex cursor-pointer items-center gap-3">
              <Checkbox
                checked={includeFiles}
                onCheckedChange={(checked) => setIncludeFiles(checked === true)}
              />
              <span className="text-sm text-[var(--color-text)]">
                Include file listing in notification
              </span>
            </label>

            <div className="flex flex-col gap-2 pt-1 sm:flex-row">
              <Button onClick={handleSave} disabled={saving} className="flex-1">
                {saving ? (
                  <span className="flex items-center gap-2">
                    <LogoSpinner size={14} speed="fast" /> Saving...
                  </span>
                ) : notConfigured ? (
                  "Enable dead man's switch"
                ) : (
                  "Update configuration"
                )}
              </Button>
              {dms && (
                <Button
                  variant="danger"
                  onClick={() => setConfirmDelete(true)}
                  className="sm:w-auto"
                >
                  Delete
                </Button>
              )}
            </div>
          </div>
        </Section>
      </motion.div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={(open) => { if (!open) setConfirmDelete(false); }}
        destructive
        title="Delete dead man's switch?"
        description="This permanently removes your dead man's switch configuration. Your trusted contact will no longer be notified if you go silent."
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
