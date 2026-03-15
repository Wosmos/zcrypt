"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/auth";
import { adminGetPlans, adminSetPlans } from "@/lib/api";
import { toast } from "@/store/toast";
import { cn } from "@/lib/utils";
import { Role } from "@/types";
import type { PlanConfig, PlanFeature } from "@/types";
import {
  Crown,
  Plus,
  Trash2,
  Check,
  X,
  Loader2,
} from "@/lib/icons";

const BYTES_PER_GB = 1024 * 1024 * 1024;
const BYTES_PER_MB = 1024 * 1024;

function bytesToGB(bytes: number): number {
  return Math.round((bytes / BYTES_PER_GB) * 100) / 100;
}

function bytesToMBOrGB(bytes: number): { value: number; unit: "MB" | "GB" | "TB" } {
  if (bytes >= 1024 * BYTES_PER_GB) return { value: Math.round((bytes / (1024 * BYTES_PER_GB)) * 100) / 100, unit: "TB" };
  if (bytes >= BYTES_PER_GB) return { value: Math.round((bytes / BYTES_PER_GB) * 100) / 100, unit: "GB" };
  return { value: Math.round((bytes / BYTES_PER_MB) * 100) / 100, unit: "MB" };
}

function formatDisplay(bytes: number): string {
  const { value, unit } = bytesToMBOrGB(bytes);
  return `${value} ${unit}`;
}

export default function AdminPricingPage() {
  const { user } = useAuthStore();
  const [plans, setPlans] = useState<PlanConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null);

  // Store GB/MB values as strings for editing (avoids float precision issues in inputs)
  const [storageInputs, setStorageInputs] = useState<Record<string, string>>({});
  const [storageUnits, setStorageUnits] = useState<Record<string, "MB" | "GB" | "TB">>({});
  const [fileSizeInputs, setFileSizeInputs] = useState<Record<string, string>>({});
  const [fileSizeUnits, setFileSizeUnits] = useState<Record<string, "MB" | "GB" | "TB">>({});

  useEffect(() => {
    if (user?.role === Role.Admin) {
      adminGetPlans()
        .then((res) => {
          setPlans(res.plans);
          // Initialize human-readable inputs from byte values
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
  if (loading) return null;

  const unitToBytes = (value: number, unit: "MB" | "GB" | "TB"): number => {
    if (unit === "TB") return Math.round(value * 1024 * BYTES_PER_GB);
    if (unit === "GB") return Math.round(value * BYTES_PER_GB);
    return Math.round(value * BYTES_PER_MB);
  };

  const updatePlan = (id: string, updates: Partial<PlanConfig>) => {
    setPlans((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
    );
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
    const display = `${value} parallel`;
    updatePlan(id, { max_concurrent_uploads: value, concurrent_display: display });
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
      prev.map((p) => {
        if (p.id !== planId) return p;
        return { ...p, features: [...p.features, { text: "", included: true }] };
      })
    );
  };

  const removeFeature = (planId: string, index: number) => {
    setPlans((prev) =>
      prev.map((p) => {
        if (p.id !== planId) return p;
        return { ...p, features: p.features.filter((_, i) => i !== index) };
      })
    );
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Plan Configuration</h2>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            Changes reflect across the entire app including landing page pricing
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Save Changes
        </button>
      </div>

      <div className="grid gap-4">
        {plans
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((plan) => {
            const isExpanded = expandedPlan === plan.id;
            return (
              <section
                key={plan.id}
                className={cn(
                  "card overflow-hidden",
                  plan.highlight && "ring-1 ring-[var(--color-accent)]/30"
                )}
              >
                {/* Plan header */}
                <button
                  onClick={() => setExpandedPlan(isExpanded ? null : plan.id)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-[var(--color-surface-1)] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "flex items-center justify-center h-9 w-9 rounded-xl",
                      plan.highlight ? "bg-violet-500/10 text-violet-500" : "bg-[var(--color-surface-2)] text-[var(--color-text-muted)]"
                    )}>
                      <Crown className="h-4 w-4" />
                    </div>
                    <div className="text-left">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{plan.name}</span>
                        <span className="text-[10px] font-mono text-[var(--color-text-muted)]">
                          {plan.id}
                        </span>
                        {plan.badge && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-500">
                            {plan.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--color-text-muted)]">
                        ${plan.monthly_price}/mo &middot; {plan.storage_display} storage &middot; {plan.max_file_display} max file
                      </p>
                    </div>
                  </div>
                  <div className="text-xs text-[var(--color-text-muted)]">
                    {isExpanded ? "Collapse" : "Edit"}
                  </div>
                </button>

                {/* Expanded editor */}
                {isExpanded && (
                  <div className="px-5 pb-5 space-y-5 border-t border-[var(--color-border)] pt-5 animate-fade-in">
                    {/* Basic info */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div>
                        <label className="text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Name</label>
                        <input
                          type="text"
                          value={plan.name}
                          onChange={(e) => updatePlan(plan.id, { name: e.target.value })}
                          className="mt-1 w-full text-sm px-3 py-2 rounded-lg bg-[var(--color-surface-1)] border border-[var(--color-border)]"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Monthly ($)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={plan.monthly_price}
                          onChange={(e) => updatePlan(plan.id, { monthly_price: parseFloat(e.target.value) || 0 })}
                          className="mt-1 w-full text-sm px-3 py-2 rounded-lg bg-[var(--color-surface-1)] border border-[var(--color-border)] tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Annual ($)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={plan.annual_price}
                          onChange={(e) => updatePlan(plan.id, { annual_price: parseFloat(e.target.value) || 0 })}
                          className="mt-1 w-full text-sm px-3 py-2 rounded-lg bg-[var(--color-surface-1)] border border-[var(--color-border)] tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Sort Order</label>
                        <input
                          type="number"
                          min="0"
                          value={plan.sort_order}
                          onChange={(e) => updatePlan(plan.id, { sort_order: parseInt(e.target.value) || 0 })}
                          className="mt-1 w-full text-sm px-3 py-2 rounded-lg bg-[var(--color-surface-1)] border border-[var(--color-border)] tabular-nums"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Description</label>
                      <input
                        type="text"
                        value={plan.description}
                        onChange={(e) => updatePlan(plan.id, { description: e.target.value })}
                        className="mt-1 w-full text-sm px-3 py-2 rounded-lg bg-[var(--color-surface-1)] border border-[var(--color-border)]"
                      />
                    </div>

                    {/* Limits - GB-based inputs */}
                    <div>
                      <h4 className="text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-3">Limits</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        <div>
                          <label className="text-xs text-[var(--color-text-muted)]">Storage</label>
                          <div className="flex gap-2 mt-1">
                            <input
                              type="number"
                              min="0"
                              step="0.5"
                              value={storageInputs[plan.id] ?? ""}
                              onChange={(e) => updateStorageForPlan(plan.id, e.target.value, storageUnits[plan.id] || "GB")}
                              className="flex-1 text-sm px-3 py-2 rounded-lg bg-[var(--color-surface-1)] border border-[var(--color-border)] tabular-nums"
                            />
                            <select
                              value={storageUnits[plan.id] || "GB"}
                              onChange={(e) => updateStorageForPlan(plan.id, storageInputs[plan.id] || "0", e.target.value as "MB" | "GB" | "TB")}
                              className="text-xs px-2 py-2 rounded-lg bg-[var(--color-surface-1)] border border-[var(--color-border)]"
                            >
                              <option value="MB">MB</option>
                              <option value="GB">GB</option>
                              <option value="TB">TB</option>
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-[var(--color-text-muted)]">Max file size</label>
                          <div className="flex gap-2 mt-1">
                            <input
                              type="number"
                              min="0"
                              step="0.5"
                              value={fileSizeInputs[plan.id] ?? ""}
                              onChange={(e) => updateFileSizeForPlan(plan.id, e.target.value, fileSizeUnits[plan.id] || "GB")}
                              className="flex-1 text-sm px-3 py-2 rounded-lg bg-[var(--color-surface-1)] border border-[var(--color-border)] tabular-nums"
                            />
                            <select
                              value={fileSizeUnits[plan.id] || "GB"}
                              onChange={(e) => updateFileSizeForPlan(plan.id, fileSizeInputs[plan.id] || "0", e.target.value as "MB" | "GB" | "TB")}
                              className="text-xs px-2 py-2 rounded-lg bg-[var(--color-surface-1)] border border-[var(--color-border)]"
                            >
                              <option value="MB">MB</option>
                              <option value="GB">GB</option>
                              <option value="TB">TB</option>
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-[var(--color-text-muted)]">Concurrent uploads</label>
                          <input
                            type="number"
                            min="1"
                            value={plan.max_concurrent_uploads}
                            onChange={(e) => updateConcurrentForPlan(plan.id, parseInt(e.target.value) || 1)}
                            className="mt-1 w-full text-sm px-3 py-2 rounded-lg bg-[var(--color-surface-1)] border border-[var(--color-border)] tabular-nums"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Toggles */}
                    <div className="flex items-center gap-6">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={plan.highlight}
                          onChange={(e) => updatePlan(plan.id, { highlight: e.target.checked })}
                          className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-accent)]"
                        />
                        <span className="text-xs">Highlighted</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-[var(--color-text-muted)]">Badge:</label>
                        <input
                          type="text"
                          value={plan.badge ?? ""}
                          onChange={(e) => updatePlan(plan.id, { badge: e.target.value || null })}
                          className="w-24 text-xs px-2 py-1 rounded bg-[var(--color-surface-1)] border border-[var(--color-border)]"
                          placeholder="e.g. Popular"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-[var(--color-text-muted)]">Social proof:</label>
                        <input
                          type="text"
                          value={plan.social_proof ?? ""}
                          onChange={(e) => updatePlan(plan.id, { social_proof: e.target.value || null })}
                          className="w-48 text-xs px-2 py-1 rounded bg-[var(--color-surface-1)] border border-[var(--color-border)]"
                          placeholder="e.g. Chosen by 1,000+ users"
                        />
                      </div>
                    </div>

                    {/* Features */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Features</h4>
                        <button
                          onClick={() => addFeature(plan.id)}
                          className="flex items-center gap-1 text-xs text-[var(--color-accent)] hover:underline"
                        >
                          <Plus className="h-3 w-3" />
                          Add feature
                        </button>
                      </div>
                      <div className="space-y-2">
                        {plan.features.map((feature, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <button
                              onClick={() => updateFeature(plan.id, i, { included: !feature.included })}
                              className={cn(
                                "flex items-center justify-center h-6 w-6 rounded-md border transition-colors flex-shrink-0",
                                feature.included
                                  ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-500"
                                  : "bg-[var(--color-surface-2)] border-[var(--color-border)] text-[var(--color-text-muted)]"
                              )}
                            >
                              {feature.included ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                            </button>
                            <input
                              type="text"
                              value={feature.text}
                              onChange={(e) => updateFeature(plan.id, i, { text: e.target.value })}
                              className="flex-1 text-sm px-3 py-1.5 rounded-lg bg-[var(--color-surface-1)] border border-[var(--color-border)]"
                              placeholder="Feature text"
                            />
                            <button
                              onClick={() => removeFeature(plan.id, i)}
                              className="flex items-center justify-center h-6 w-6 rounded-md hover:bg-red-500/10 text-[var(--color-text-muted)] hover:text-red-500 transition-colors flex-shrink-0"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </section>
            );
          })}
      </div>
    </div>
  );
}
