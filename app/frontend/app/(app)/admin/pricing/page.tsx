"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/auth";
import { adminGetPlans, adminSetPlans } from "@/lib/api";
import { toast } from "@/store/toast";
import { cn } from "@/lib/utils";
import { Role } from "@/types";
import type { PlanConfig, PlanFeature } from "@/types";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Crown,
  Plus,
  Trash2,
  Check,
  X,
  Loader2,
  ChevronDown,
} from "@/lib/icons";
import { PricingSkeleton } from "@/components/admin/skeletons";

const BYTES_PER_GB = 1024 * 1024 * 1024;
const BYTES_PER_MB = 1024 * 1024;

function bytesToMBOrGB(bytes: number): { value: number; unit: "MB" | "GB" | "TB" } {
  if (bytes >= 1024 * BYTES_PER_GB) return { value: Math.round((bytes / (1024 * BYTES_PER_GB)) * 100) / 100, unit: "TB" };
  if (bytes >= BYTES_PER_GB) return { value: Math.round((bytes / BYTES_PER_GB) * 100) / 100, unit: "GB" };
  return { value: Math.round((bytes / BYTES_PER_MB) * 100) / 100, unit: "MB" };
}

const fieldClass =
  "mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-1)] px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--color-accent)]/40 focus:ring-2 focus:ring-[var(--color-accent)]/10";
const labelClass =
  "text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]";

export default function AdminPricingPage() {
  const { user } = useAuthStore();
  const [plans, setPlans] = useState<PlanConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PlanConfig | null>(null);

  const [storageInputs, setStorageInputs] = useState<Record<string, string>>({});
  const [storageUnits, setStorageUnits] = useState<Record<string, "MB" | "GB" | "TB">>({});
  const [fileSizeInputs, setFileSizeInputs] = useState<Record<string, string>>({});
  const [fileSizeUnits, setFileSizeUnits] = useState<Record<string, "MB" | "GB" | "TB">>({});

  useEffect(() => {
    if (user?.role === Role.Admin) {
      adminGetPlans()
        .then((res) => {
          setPlans(res.plans);
          const sInputs: Record<string, string> = {};
          const sUnits: Record<string, "MB" | "GB" | "TB"> = {};
          const fInputs: Record<string, string> = {};
          const fUnits: Record<string, "MB" | "GB" | "TB"> = {};
          for (const p of res.plans) {
            const s = bytesToMBOrGB(p.storage_bytes);
            sInputs[p.id] = s.value.toString();
            sUnits[p.id] = s.unit;
            const f = bytesToMBOrGB(p.max_file_bytes);
            fInputs[p.id] = f.value.toString();
            fUnits[p.id] = f.unit;
          }
          setStorageInputs(sInputs);
          setStorageUnits(sUnits);
          setFileSizeInputs(fInputs);
          setFileSizeUnits(fUnits);
        })
        .catch(() => toast.error("Failed to load plans"))
        .finally(() => setLoading(false));
    }
  }, [user]);

  if (!user || user.role !== Role.Admin) return null;
  if (loading) return <PricingSkeleton />;

  const unitToBytes = (value: number, unit: "MB" | "GB" | "TB"): number => {
    if (unit === "TB") return Math.round(value * 1024 * BYTES_PER_GB);
    if (unit === "GB") return Math.round(value * BYTES_PER_GB);
    return Math.round(value * BYTES_PER_MB);
  };

  const updatePlan = (id: string, updates: Partial<PlanConfig>) => {
    setPlans((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));
  };

  const updateStorageForPlan = (id: string, valueStr: string, unit: "MB" | "GB" | "TB") => {
    setStorageInputs((prev) => ({ ...prev, [id]: valueStr }));
    setStorageUnits((prev) => ({ ...prev, [id]: unit }));
    const value = parseFloat(valueStr) || 0;
    const bytes = unitToBytes(value, unit);
    const display = value > 0 ? `${value} ${unit}` : "0";
    updatePlan(id, { storage_bytes: bytes, storage_display: display });
  };

  const updateFileSizeForPlan = (id: string, valueStr: string, unit: "MB" | "GB" | "TB") => {
    setFileSizeInputs((prev) => ({ ...prev, [id]: valueStr }));
    setFileSizeUnits((prev) => ({ ...prev, [id]: unit }));
    const value = parseFloat(valueStr) || 0;
    const bytes = unitToBytes(value, unit);
    const display = value > 0 ? `${value} ${unit}` : "0";
    updatePlan(id, { max_file_bytes: bytes, max_file_display: display });
  };

  const updateConcurrentForPlan = (id: string, value: number) => {
    updatePlan(id, { max_concurrent_uploads: value, concurrent_display: `${value} parallel` });
  };

  const updateFeature = (planId: string, index: number, updates: Partial<PlanFeature>) => {
    setPlans((prev) =>
      prev.map((p) => {
        if (p.id !== planId) return p;
        const features = [...p.features];
        features[index] = { ...features[index], ...updates };
        return { ...p, features };
      })
    );
  };

  const addFeature = (planId: string) => {
    setPlans((prev) =>
      prev.map((p) => (p.id === planId ? { ...p, features: [...p.features, { text: "", included: true }] } : p))
    );
  };

  const removeFeature = (planId: string, index: number) => {
    setPlans((prev) =>
      prev.map((p) => (p.id === planId ? { ...p, features: p.features.filter((_, i) => i !== index) } : p))
    );
  };

  const addPlan = () => {
    const nextOrder = plans.length > 0 ? Math.max(...plans.map((p) => p.sort_order)) + 1 : 0;
    const id = `plan-${Date.now()}`;
    const newPlan: PlanConfig = {
      id,
      name: "New Plan",
      monthly_price: 0,
      annual_price: 0,
      description: "",
      storage_bytes: 10 * BYTES_PER_GB,
      max_file_bytes: 500 * BYTES_PER_MB,
      max_concurrent_uploads: 2,
      storage_display: "10 GB",
      max_file_display: "500 MB",
      concurrent_display: "2 parallel",
      features: [],
      highlight: false,
      badge: null,
      icon: null,
      social_proof: null,
      sort_order: nextOrder,
    };
    setPlans((prev) => [...prev, newPlan]);
    setStorageInputs((prev) => ({ ...prev, [id]: "10" }));
    setStorageUnits((prev) => ({ ...prev, [id]: "GB" }));
    setFileSizeInputs((prev) => ({ ...prev, [id]: "500" }));
    setFileSizeUnits((prev) => ({ ...prev, [id]: "MB" }));
    setExpandedPlan(id);
  };

  const deletePlan = (id: string) => {
    if (id === "free") {
      toast.error("Cannot delete the free plan");
      return;
    }
    setPlans((prev) => prev.filter((p) => p.id !== id));
    if (expandedPlan === id) setExpandedPlan(null);
    setDeleteTarget(null);
  };

  const handleSave = async () => {
    if (!plans.some((p) => p.id === "free")) {
      toast.error("A 'free' plan is required");
      return;
    }
    const ids = plans.map((p) => p.id);
    if (new Set(ids).size !== ids.length) {
      toast.error("Duplicate plan IDs found");
      return;
    }

    setSaving(true);
    try {
      await adminSetPlans({ plans });
      toast.success("Plans saved successfully");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save plans");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight text-[var(--color-text)]">Plan configuration</h2>
          <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
            Changes reflect across the entire app including landing page pricing.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={addPlan}>
            <Plus className="h-4 w-4" />
            Add plan
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Save changes
          </Button>
        </div>
      </div>

      <div className="grid gap-4">
        {[...plans]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((plan) => {
            const isExpanded = expandedPlan === plan.id;
            return (
              <section
                key={plan.id}
                className={cn(
                  "panel overflow-hidden",
                  plan.highlight && "ring-1 ring-[var(--color-accent)]/30"
                )}
              >
                {/* Plan header */}
                <div
                  role="button"
                  tabIndex={0}
                  aria-expanded={isExpanded}
                  onClick={() => setExpandedPlan(isExpanded ? null : plan.id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpandedPlan(isExpanded ? null : plan.id); } }}
                  className="flex w-full cursor-pointer items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-[var(--color-surface-1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-accent)]/40"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className={cn(
                      "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl",
                      plan.highlight ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)]" : "bg-[var(--color-surface-2)] text-[var(--color-text-muted)]"
                    )}>
                      <Crown className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 text-left">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-[var(--color-text)]">{plan.name}</span>
                        <span className="font-mono text-[10px] text-[var(--color-text-muted)]">{plan.id}</span>
                        {plan.badge && (
                          <span className="rounded-full bg-[var(--color-accent)]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-accent)]">
                            {plan.badge}
                          </span>
                        )}
                      </div>
                      <p className="truncate text-xs text-[var(--color-text-muted)] tabular-nums">
                        ${plan.monthly_price}/mo &middot; {plan.storage_display} storage &middot; {plan.max_file_display} max file
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1">
                    {plan.id !== "free" && (
                      <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                        <IconButton
                          icon={Trash2}
                          label="Delete plan"
                          variant="ghost"
                          onClick={() => setDeleteTarget(plan)}
                          className="hover:bg-red-500/10 hover:text-red-500"
                        />
                      </span>
                    )}
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 text-[var(--color-text-muted)] transition-transform",
                        isExpanded && "rotate-180"
                      )}
                    />
                  </div>
                </div>

                {/* Expanded editor */}
                {isExpanded && (
                  <div className="animate-fade-in space-y-5 border-t border-[var(--color-border)] px-5 pb-5 pt-5">
                    {/* Plan ID */}
                    <div>
                      <label className={labelClass}>Plan ID</label>
                      <input
                        type="text"
                        value={plan.id}
                        onChange={(e) => {
                          const newId = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
                          const oldId = plan.id;
                          setPlans((prev) => prev.map((p) => (p.id === oldId ? { ...p, id: newId } : p)));
                          setStorageInputs((prev) => { const v = prev[oldId]; const next = { ...prev, [newId]: v }; delete next[oldId]; return next; });
                          setStorageUnits((prev) => { const v = prev[oldId]; const next = { ...prev, [newId]: v }; delete next[oldId]; return next; });
                          setFileSizeInputs((prev) => { const v = prev[oldId]; const next = { ...prev, [newId]: v }; delete next[oldId]; return next; });
                          setFileSizeUnits((prev) => { const v = prev[oldId]; const next = { ...prev, [newId]: v }; delete next[oldId]; return next; });
                          if (expandedPlan === oldId) setExpandedPlan(newId);
                        }}
                        disabled={plan.id === "free"}
                        className={cn(fieldClass, "font-mono disabled:opacity-50")}
                        placeholder="e.g. enterprise"
                      />
                      <p className="mt-0.5 text-[10px] text-[var(--color-text-muted)]">Lowercase, alphanumeric, hyphens only</p>
                    </div>

                    {/* Basic info */}
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                      <div>
                        <label className={labelClass}>Name</label>
                        <input
                          type="text"
                          value={plan.name}
                          onChange={(e) => updatePlan(plan.id, { name: e.target.value })}
                          className={fieldClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Monthly ($)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={plan.monthly_price}
                          onChange={(e) => updatePlan(plan.id, { monthly_price: parseFloat(e.target.value) || 0 })}
                          className={cn(fieldClass, "tabular-nums")}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Annual ($)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={plan.annual_price}
                          onChange={(e) => updatePlan(plan.id, { annual_price: parseFloat(e.target.value) || 0 })}
                          className={cn(fieldClass, "tabular-nums")}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Sort order</label>
                        <input
                          type="number"
                          min="0"
                          value={plan.sort_order}
                          onChange={(e) => updatePlan(plan.id, { sort_order: parseInt(e.target.value) || 0 })}
                          className={cn(fieldClass, "tabular-nums")}
                        />
                      </div>
                    </div>

                    <div>
                      <label className={labelClass}>Description</label>
                      <input
                        type="text"
                        value={plan.description}
                        onChange={(e) => updatePlan(plan.id, { description: e.target.value })}
                        className={fieldClass}
                      />
                    </div>

                    {/* Limits */}
                    <div>
                      <h4 className={cn(labelClass, "mb-3 block")}>Limits</h4>
                      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                        <div>
                          <label className="text-xs text-[var(--color-text-muted)]">Storage</label>
                          <div className="mt-1 flex gap-2">
                            <input
                              type="number"
                              min="0"
                              step="0.5"
                              value={storageInputs[plan.id] ?? ""}
                              onChange={(e) => updateStorageForPlan(plan.id, e.target.value, storageUnits[plan.id] || "GB")}
                              className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-1)] px-3 py-2 text-sm tabular-nums outline-none focus:border-[var(--color-accent)]/40 focus:ring-2 focus:ring-[var(--color-accent)]/10"
                            />
                            <Select
                              value={storageUnits[plan.id] || "GB"}
                              onValueChange={(v) => updateStorageForPlan(plan.id, storageInputs[plan.id] || "0", v as "MB" | "GB" | "TB")}
                            >
                              <SelectTrigger className="h-[38px] w-16 text-xs" aria-label="Storage unit">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="MB">MB</SelectItem>
                                <SelectItem value="GB">GB</SelectItem>
                                <SelectItem value="TB">TB</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-[var(--color-text-muted)]">Max file size</label>
                          <div className="mt-1 flex gap-2">
                            <input
                              type="number"
                              min="0"
                              step="0.5"
                              value={fileSizeInputs[plan.id] ?? ""}
                              onChange={(e) => updateFileSizeForPlan(plan.id, e.target.value, fileSizeUnits[plan.id] || "GB")}
                              className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-1)] px-3 py-2 text-sm tabular-nums outline-none focus:border-[var(--color-accent)]/40 focus:ring-2 focus:ring-[var(--color-accent)]/10"
                            />
                            <Select
                              value={fileSizeUnits[plan.id] || "GB"}
                              onValueChange={(v) => updateFileSizeForPlan(plan.id, fileSizeInputs[plan.id] || "0", v as "MB" | "GB" | "TB")}
                            >
                              <SelectTrigger className="h-[38px] w-16 text-xs" aria-label="File size unit">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="MB">MB</SelectItem>
                                <SelectItem value="GB">GB</SelectItem>
                                <SelectItem value="TB">TB</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-[var(--color-text-muted)]">Concurrent uploads</label>
                          <input
                            type="number"
                            min="1"
                            value={plan.max_concurrent_uploads}
                            onChange={(e) => updateConcurrentForPlan(plan.id, parseInt(e.target.value) || 1)}
                            className={cn(fieldClass, "tabular-nums")}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Toggles */}
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                      <label className="flex cursor-pointer items-center gap-2">
                        <Checkbox
                          checked={plan.highlight}
                          onCheckedChange={(checked) => updatePlan(plan.id, { highlight: checked === true })}
                        />
                        <span className="text-xs text-[var(--color-text-secondary)]">Highlighted</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-[var(--color-text-muted)]">Badge:</label>
                        <input
                          type="text"
                          value={plan.badge ?? ""}
                          onChange={(e) => updatePlan(plan.id, { badge: e.target.value || null })}
                          className="w-24 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-1)] px-2 py-1 text-xs outline-none focus:border-[var(--color-accent)]/40 focus:ring-2 focus:ring-[var(--color-accent)]/10"
                          placeholder="e.g. Popular"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-[var(--color-text-muted)]">Social proof:</label>
                        <input
                          type="text"
                          value={plan.social_proof ?? ""}
                          onChange={(e) => updatePlan(plan.id, { social_proof: e.target.value || null })}
                          className="w-48 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-1)] px-2 py-1 text-xs outline-none focus:border-[var(--color-accent)]/40 focus:ring-2 focus:ring-[var(--color-accent)]/10"
                          placeholder="e.g. Chosen by 1,000+ users"
                        />
                      </div>
                    </div>

                    {/* Features */}
                    <div>
                      <div className="mb-3 flex items-center justify-between">
                        <h4 className={labelClass}>Features</h4>
                        <Button variant="ghost" size="sm" onClick={() => addFeature(plan.id)}>
                          <Plus className="h-3 w-3" />
                          Add feature
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {plan.features.map((feature, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => updateFeature(plan.id, i, { included: !feature.included })}
                              aria-label={feature.included ? "Mark feature as not included" : "Mark feature as included"}
                              className={cn(
                                "flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40",
                                feature.included
                                  ? "border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                                  : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-muted)]"
                              )}
                            >
                              {feature.included ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                            </button>
                            <input
                              type="text"
                              value={feature.text}
                              onChange={(e) => updateFeature(plan.id, i, { text: e.target.value })}
                              className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-1)] px-3 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]/40 focus:ring-2 focus:ring-[var(--color-accent)]/10"
                              placeholder="Feature text"
                            />
                            <IconButton
                              icon={Trash2}
                              label="Remove feature"
                              variant="ghost"
                              onClick={() => removeFeature(plan.id, i)}
                              className="h-6 w-6 flex-shrink-0 hover:bg-red-500/10 hover:text-red-500"
                              iconClassName="h-3 w-3"
                            />
                          </div>
                        ))}
                        {plan.features.length === 0 && (
                          <p className="text-xs text-[var(--color-text-muted)]">No features yet. Add one to highlight this plan.</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </section>
            );
          })}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        destructive
        title="Delete plan?"
        description={
          deleteTarget
            ? `Remove the "${deleteTarget.name}" plan from the configuration. This takes effect after you save changes. Users on this plan should be reassigned first.`
            : ""
        }
        confirmLabel="Delete plan"
        onConfirm={() => deleteTarget && deletePlan(deleteTarget.id)}
      />
    </div>
  );
}
