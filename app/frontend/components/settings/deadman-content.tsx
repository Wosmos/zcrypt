"use client";

import { Banner } from "@/components/ui/banner";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { queryClient } from "@/lib/query-client";
import { qk } from "@/lib/query-keys";
import { motion } from "motion/react";
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
import { Section } from "@/components/ui/section";
import { StatCard } from "@/components/ui/stat-card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { LoadFailed, SafeguardHeader } from "@/components/settings/settings-primitives";
import { LogoSpinner } from "@/components/ui/logo-spinner";
import {
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
  const t = useTranslations("settings.deadman");
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

  // Cached read; the form edits local state seeded once from it, and every
  // mutation writes its result back so a revisit opens instantly and current.
  const dmsQuery = useQuery({ queryKey: qk.deadman, queryFn: getDeadManSwitch });
  const [seeded, setSeeded] = useState(false);
  const settled = dmsQuery.isSuccess;
  const loaded = dmsQuery.data;
  if (!seeded && settled) {
    setSeeded(true);
    if (loaded && loaded.id) {
      setDms(loaded);
      setContactEmail(loaded.contact_email);
      setContactName(loaded.contact_name);
      setTimeoutDays(loaded.timeout_days);
      setMessage(loaded.message);
      setIncludeFiles(loaded.include_files);
    } else {
      setNotConfigured(true);
    }
    setLoading(false);
  }

  const handleSave = async () => {
    setError("");
    setSuccess("");
    if (!contactEmail.trim()) {
      setError(t("emailRequired"));
      return;
    }
    if (timeoutDays < 7 || timeoutDays > 365) {
      setError(t("timeoutRange"));
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
      queryClient.setQueryData(qk.deadman, result);
      setNotConfigured(false);
      setSuccess(t("saved"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("saveFailed"));
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
      queryClient.setQueryData(qk.deadman, data);
      setSuccess(t("checkinDone"));
    } catch {
      setError(t("checkinFailed"));
    } finally {
      setCheckinLoading(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError("");
    try {
      await deleteDeadManSwitch();
      queryClient.removeQueries({ queryKey: qk.deadman });
      setDms(null);
      setNotConfigured(true);
      setContactEmail("");
      setContactName("");
      setTimeoutDays(90);
      setMessage("");
      setIncludeFiles(false);
      setConfirmDelete(false);
      setSuccess(t("deleted"));
    } catch {
      setError(t("deleteFailed"));
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  if (!seeded && dmsQuery.isError) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 animate-fade-in">
        <LoadFailed
          message={t("loadFailed")}
          retryLabel={t("retry")}
          onRetry={() => dmsQuery.refetch()}
        />
      </div>
    );
  }

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
      <SafeguardHeader back={t("back")} title={t("title")} description={t("description")} />

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
        <Banner
          kind="error"
          role="alert"
          icon={ShieldAlert}
          title={t("triggered")}
          body={t("triggeredDesc", {
            date: dms.triggered_at ? formatDateTime(dms.triggered_at) : t("unknownDate"),
            email: dms.contact_email,
          })}
        />
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
            title={t("status")}
            actions={
              <Badge
                variant="outline"
                className={
                  dms.enabled
                    ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                }
              >
                {dms.enabled ? t("active") : t("paused")}
              </Badge>
            }
          >
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <StatCard
                  label={t("daysUntil")}
                  value={`${daysLeft}d`}
                  icon={Clock}
                  accent={daysAccent === "ok"}
                  hint={t("timeoutHint", { days: dms.timeout_days })}
                  className={
                    daysAccent === "danger"
                      ? "ring-1 ring-red-500/30"
                      : daysAccent === "warn"
                        ? "ring-1 ring-amber-500/30"
                        : undefined
                  }
                />
                <StatCard
                  label={t("contact")}
                  value={
                    <span className="block truncate text-base font-semibold">
                      {dms.contact_name || dms.contact_email}
                    </span>
                  }
                  icon={dms.contact_name ? User : Mail}
                  hint={t("lastCheckin", { date: formatDateTime(dms.last_checkin) })}
                />
              </div>
              <Button onClick={handleCheckin} disabled={checkinLoading} className="w-full">
                {checkinLoading ? (
                  <span className="flex items-center gap-2">
                    <LogoSpinner size={14} speed="fast" /> {t("checkingIn")}
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <RefreshCw className="h-4 w-4" /> {t("checkInNow")}
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
          title={notConfigured ? t("configure") : t("updateConfig")}
          description={t("configDesc")}
        >
          <div className="space-y-4">
            <Input
              type="email"
              label={t("contactEmail")}
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder={t("contactEmailPlaceholder")}
            />
            <Input
              type="text"
              label={t("contactName")}
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder={t("contactNamePlaceholder")}
            />
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="dms-timeout"
                className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]"
              >
                {t("timeoutLabel")}
              </label>
              <select
                id="dms-timeout"
                value={timeoutDays}
                onChange={(e) => setTimeoutDays(Number(e.target.value))}
                className="h-10 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 text-sm text-[var(--color-text)] outline-none transition-all focus:border-[var(--color-accent)]/40 focus:ring-2 focus:ring-[var(--color-accent)]/10"
              >
                {TIMEOUT_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d === 90 ? t("daysDefault", { days: d }) : t("days", { days: d })}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="dms-message"
                className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]"
              >
                {t("messageLabel")}
              </label>
              <Textarea
                id="dms-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t("messagePlaceholder")}
                rows={3}
                className="resize-none"
              />
              <div
                role="note"
                className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5"
              >
                <p className="text-xs text-amber-700 dark:text-amber-300">{t("messageWarning")}</p>
              </div>
            </div>
            <label className="flex cursor-pointer items-center gap-3">
              <Checkbox
                checked={includeFiles}
                onCheckedChange={(checked) => setIncludeFiles(checked === true)}
              />
              <span className="text-sm text-[var(--color-text)]">{t("includeFiles")}</span>
            </label>

            <div className="flex flex-col gap-2 pt-1 sm:flex-row">
              <Button onClick={handleSave} disabled={saving} className="flex-1">
                {saving ? (
                  <span className="flex items-center gap-2">
                    <LogoSpinner size={14} speed="fast" /> {t("saving")}
                  </span>
                ) : notConfigured ? (
                  t("enable")
                ) : (
                  t("updateConfig")
                )}
              </Button>
              {dms && (
                <Button
                  variant="danger"
                  onClick={() => setConfirmDelete(true)}
                  className="sm:w-auto"
                >
                  {t("delete")}
                </Button>
              )}
            </div>
          </div>
        </Section>
      </motion.div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(false);
        }}
        destructive
        title={t("confirmTitle")}
        description={t("confirmDesc")}
        confirmLabel={t("delete")}
        loading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
