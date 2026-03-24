"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Layers,
  ShieldCheck,
  Clock,
  MonitorSmartphone,
  Send,
  FileText,
  Wifi,
} from "@/lib/icons";
import { usePreferencesStore } from "@/store/preferences";
import { TabBar, PersistentTabPanel } from "@/components/ui/tab-bar";
import { SnapshotsTab } from "@/components/tools/snapshots-tab";
import { IntegrityTab } from "@/components/tools/integrity-tab";
import { ExpiringTab } from "@/components/tools/expiring-tab";
import { DevicesTab } from "@/components/tools/devices-tab";
import { SendTool } from "@/components/tools/send-tool";
import { PadTool } from "@/components/tools/pad-tool";
import { TransferTool } from "@/components/tools/transfer-tool";

const tabs = [
  { id: "send", label: "Send File", icon: <Send className="h-3.5 w-3.5" /> },
  { id: "pad", label: "Text Pad", icon: <FileText className="h-3.5 w-3.5" /> },
  { id: "transfer", label: "Transfer", icon: <Wifi className="h-3.5 w-3.5" /> },
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
    tabs.some((t) => t.id === tabParam) ? tabParam! : "send"
  );
  const [visited, setVisited] = useState<Set<string>>(new Set(["send"]));

  useEffect(() => {
    if (!advancedMode) {
      router.replace("/dashboard");
    }
  }, [advancedMode, router]);

  const handleTabChange = (id: string) => {
    setActiveTab(id);
    setVisited((prev) => new Set(prev).add(id));
    const url = new URL(window.location.href);
    url.searchParams.set("tab", id);
    window.history.replaceState({}, "", url.toString());
  };

  if (!advancedMode) return null;

  return (
    <div className="space-y-6 animate-fade-in">
      <TabBar tabs={tabs} activeTab={activeTab} onTabChange={handleTabChange} />

      <PersistentTabPanel id="send" activeTab={activeTab}>
        {visited.has("send") && (
          <div className="max-w-lg mx-auto">
            <SendTool />
          </div>
        )}
      </PersistentTabPanel>
      <PersistentTabPanel id="pad" activeTab={activeTab}>
        {visited.has("pad") && (
          <div className="max-w-2xl mx-auto">
            <PadTool />
          </div>
        )}
      </PersistentTabPanel>
      <PersistentTabPanel id="transfer" activeTab={activeTab}>
        {visited.has("transfer") && (
          <div className="max-w-lg mx-auto">
            <TransferTool />
          </div>
        )}
      </PersistentTabPanel>
      <PersistentTabPanel id="snapshots" activeTab={activeTab}>
        {visited.has("snapshots") && <SnapshotsTab />}
      </PersistentTabPanel>
      <PersistentTabPanel id="integrity" activeTab={activeTab}>
        {visited.has("integrity") && <IntegrityTab />}
      </PersistentTabPanel>
      <PersistentTabPanel id="expiring" activeTab={activeTab}>
        {visited.has("expiring") && <ExpiringTab />}
      </PersistentTabPanel>
      <PersistentTabPanel id="devices" activeTab={activeTab}>
        {visited.has("devices") && <DevicesTab />}
      </PersistentTabPanel>
    </div>
  );
}
