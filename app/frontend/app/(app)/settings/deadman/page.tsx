"use client";

import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { getDeadManSwitch, setupDeadManSwitch, checkinDeadManSwitch, deleteDeadManSwitch } from "@/lib/api";
import type { DeadManSwitch } from "@/types";
import { Button } from "@/components/ui/button";
import { LogoSpinner } from "@/components/ui/logo-spinner";
import { ShieldAlert, ArrowLeft } from "@/lib/icons";
import Link from "next/link";

function daysUntil(date: string): number {
  const diff = new Date(date).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function DeadManSwitchPage() {
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
        } else { setNotConfigured(true); }
      })
      .catch(() => setNotConfigured(true))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setError(""); setSuccess("");
    if (!contactEmail.trim()) { setError("Contact email is required"); return; }
    if (timeoutDays < 7 || timeoutDays > 365) { setError("Timeout must be between 7 and 365 days"); return; }
    setSaving(true);
    try {
      const result = await setupDeadManSwitch({ contact_email: contactEmail.trim(), contact_name: contactName.trim(), timeout_days: timeoutDays, message: message.trim(), include_files: includeFiles });
      setDms(result); setNotConfigured(false); setSuccess("Dead man's switch saved successfully");
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to save"); }
    finally { setSaving(false); }
  };

  const handleCheckin = async () => {
    setCheckinLoading(true); setSuccess("");
    try {
      await checkinDeadManSwitch();
      const data = await getDeadManSwitch();
      if (data && data.id) setDms(data);
      setSuccess("Check-in successful! Timer reset.");
    } catch { setError("Check-in failed"); }
    finally { setCheckinLoading(false); }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure? This will permanently delete your dead man's switch configuration.")) return;
    try {
      await deleteDeadManSwitch();
      setDms(null); setNotConfigured(true);
      setContactEmail(""); setContactName(""); setTimeoutDays(90); setMessage(""); setIncludeFiles(false);
    } catch { setError("Failed to delete"); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LogoSpinner size="md" speed="fast" />
      </div>
    );
  }

  const deadlineDate = dms ? new Date(new Date(dms.last_checkin).getTime() + dms.timeout_days * 86400000).toISOString() : null;
  const daysLeft = deadlineDate ? daysUntil(deadlineDate) : 0;

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl mx-auto">
      <Link href="/settings" className="inline-flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors">
        <ArrowLeft className="h-3 w-3" /> Back to Settings
      </Link>

      <div className="flex items-center gap-2.5">
        <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-[var(--color-surface-1)] ring-1 ring-[var(--color-border)]">
          <ShieldAlert className="h-5 w-5 text-[var(--color-text-muted)]" />
        </div>
        <div>
          <p className="text-[10px] font-semibold text-[var(--color-accent)] uppercase tracking-widest">Privacy</p>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight leading-tight">Dead Man&apos;s Switch</h1>
        </div>
      </div>

      <p className="text-sm text-[var(--color-text-secondary)]">
        Automatically notify a trusted contact if you stop checking in. Your check-in resets every time you log in.
      </p>

      {error && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">{error}</div>}
      {success && <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-500 text-sm">{success}</div>}

      {/* Status card */}
      {dms && !dms.triggered && (
        <motion.section initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
            <h2 className="text-sm font-semibold">Status</h2>
            <span className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold uppercase ${dms.enabled ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"}`}>
              {dms.enabled ? "Active" : "Paused"}
            </span>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-xs text-[var(--color-text-muted)]">Last check-in</span>
                <p className="font-medium mt-0.5">{formatDate(dms.last_checkin)}</p>
              </div>
              <div>
                <span className="text-xs text-[var(--color-text-muted)]">Days until trigger</span>
                <p className={`font-medium mt-0.5 ${daysLeft <= 7 ? "text-red-400" : daysLeft <= 30 ? "text-amber-500" : ""}`}>{daysLeft} days</p>
              </div>
              <div>
                <span className="text-xs text-[var(--color-text-muted)]">Contact</span>
                <p className="font-medium mt-0.5">{dms.contact_name || dms.contact_email}</p>
              </div>
              <div>
                <span className="text-xs text-[var(--color-text-muted)]">Timeout</span>
                <p className="font-medium mt-0.5">{dms.timeout_days} days</p>
              </div>
            </div>
            <Button onClick={handleCheckin} disabled={checkinLoading} className="w-full">
              {checkinLoading ? "Checking in..." : "Check In Now"}
            </Button>
          </div>
        </motion.section>
      )}

      {dms?.triggered && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/5 p-4">
          <ShieldAlert className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-400">Switch Triggered</p>
            <p className="text-xs text-[var(--color-text-secondary)] mt-1">
              Your dead man&apos;s switch was triggered on {dms.triggered_at ? formatDate(dms.triggered_at) : "unknown date"}.
              Your contact ({dms.contact_email}) has been notified.
            </p>
          </div>
        </div>
      )}

      {/* Configuration form */}
      <motion.section initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--color-border)]">
          <h2 className="text-sm font-semibold">{notConfigured ? "Configure" : "Update Configuration"}</h2>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Contact Email *</label>
            <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="trusted-contact@example.com"
              className="mt-1.5 w-full h-10 px-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]/40" />
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Contact Name</label>
            <input type="text" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="John Doe"
              className="mt-1.5 w-full h-10 px-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]/40" />
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Timeout (days)</label>
            <select value={timeoutDays} onChange={(e) => setTimeoutDays(Number(e.target.value))}
              className="mt-1.5 w-full h-10 px-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm focus:outline-none focus:border-[var(--color-accent)]/40">
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
              <option value={60}>60 days</option>
              <option value={90}>90 days (default)</option>
              <option value={180}>180 days</option>
              <option value={365}>365 days</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Message to Contact</label>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Optional message sent when the switch triggers..." rows={3}
              className="mt-1.5 w-full px-3.5 py-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]/40 resize-none" />
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={includeFiles} onChange={(e) => setIncludeFiles(e.target.checked)} className="w-4 h-4 rounded accent-[var(--color-accent)]" />
            <span className="text-sm">Include file listing in notification</span>
          </label>
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? "Saving..." : notConfigured ? "Enable Dead Man's Switch" : "Update Configuration"}
          </Button>
          {dms && (
            <Button variant="danger" onClick={handleDelete} className="w-full">
              Delete Dead Man&apos;s Switch
            </Button>
          )}
        </div>
      </motion.section>
    </div>
  );
}
