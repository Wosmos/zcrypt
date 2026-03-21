"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Cog, Layers, ShieldCheck, Clock, MonitorSmartphone } from "@/lib/icons";
import { usePreferencesStore } from "@/store/preferences";
import { TabBar, TabPanel } from "@/components/ui/tab-bar";
import { SnapshotsTab } from "@/components/tools/snapshots-tab";
import { IntegrityTab } from "@/components/tools/integrity-tab";
import { ExpiringTab } from "@/components/tools/expiring-tab";
import { DevicesTab } from "@/components/tools/devices-tab";

const tabs = [
  { id: "snapshots", label: "Snapshots", icon: <Layers className="h-3.5 w-3.5" /> },
  { id: "integrity", label: "Integrity", icon: <ShieldCheck className="h-3.5 w-3.5" /> },
  { id: "expiring", label: "Expiring", icon: <Clock className="h-3.5 w-3.5" /> },
  { id: "devices", label: "Devices", icon: <MonitorSmartphone className="h-3.5 w-3.5" /> },
];

export default function ToolsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const advancedMode = usePreferencesStore((s) => s.advancedMode);
  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState(
    tabs.some((t) => t.id === tabParam) ? tabParam! : "snapshots"
  );

  // Guard: redirect if not advanced mode
  useEffect(() => {
    if (!advancedMode) {
      router.replace("/dashboard");
    }
  }, [advancedMode, router]);

  const handleTabChange = (id: string) => {
    setActiveTab(id);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", id);
    window.history.replaceState({}, "", url.toString());
  };

  if (!advancedMode) return null;

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-[var(--color-surface-1)] ring-1 ring-[var(--color-border)]">
          <Cog className="h-5 w-5 text-[var(--color-text-muted)]" />
        </div>
        <div>
          <p className="text-[10px] font-semibold text-[var(--color-accent)] uppercase tracking-widest">Advanced</p>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight leading-tight">Tools</h1>
        </div>
      </div>

      {/* Tab bar */}
      <TabBar tabs={tabs} activeTab={activeTab} onTabChange={handleTabChange} />

      {/* Tab panels — lazy rendered */}
      <TabPanel id="snapshots" activeTab={activeTab}>
        <SnapshotsTab />
      </TabPanel>
      <TabPanel id="integrity" activeTab={activeTab}>
        <IntegrityTab />
      </TabPanel>
      <TabPanel id="expiring" activeTab={activeTab}>
        <ExpiringTab />
      </TabPanel>
      <TabPanel id="devices" activeTab={activeTab}>
        <DevicesTab />
      </TabPanel>
    </div>
  );
}
