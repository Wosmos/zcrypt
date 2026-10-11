"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Layers, ShieldCheck, Clock, MonitorSmartphone, Send, FileText, Wifi } from "@/lib/icons";
import type { ComponentType } from "react";
import { usePreferencesStore } from "@/store/preferences";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { SnapshotsTab } from "@/components/tools/snapshots-tab";
import { IntegrityTab } from "@/components/tools/integrity-tab";
import { ExpiringTab } from "@/components/tools/expiring-tab";
import { DevicesTab } from "@/components/tools/devices-tab";
import { SendTool } from "@/components/tools/send-tool";
import { PadTool } from "@/components/tools/pad-tool";
import { TransferTool } from "@/components/tools/transfer-tool";

type IconComponent = ComponentType<{ className?: string; size?: number }>;

interface TabDef {
  id: string;
  icon: IconComponent;
  Content: ComponentType;
}

const tabs: TabDef[] = [
  { id: "send", icon: Send, Content: SendTool },
  { id: "pad", icon: FileText, Content: PadTool },
  { id: "transfer", icon: Wifi, Content: TransferTool },
  { id: "snapshots", icon: Layers, Content: SnapshotsTab },
  { id: "integrity", icon: ShieldCheck, Content: IntegrityTab },
  { id: "expiring", icon: Clock, Content: ExpiringTab },
  { id: "devices", icon: MonitorSmartphone, Content: DevicesTab },
];

export default function ToolsPage() {
  const t = useTranslations("tools");
  const router = useRouter();
  const searchParams = useSearchParams();
  const advancedMode = usePreferencesStore((s) => s.advancedMode);
  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState(
    tabs.some((t) => t.id === tabParam) ? tabParam! : "send",
  );
  // Lazily mount tabs but keep them mounted once visited so in-flight client
  // state (transfers, uploads, decrypted clipboard) survives tab switches.
  const [visited, setVisited] = useState<Set<string>>(new Set([activeTab]));

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
    <div className="animate-fade-in space-y-6">
      <PageHeader
        eyebrow={t("page.eyebrow")}
        title={t("page.title")}
        description={t("page.description")}
      />

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <ScrollArea className="w-full">
          <TabsList className="inline-flex h-auto w-max gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] p-1">
            {tabs.map(({ id, icon: Icon }) => (
              <TabsTrigger
                key={id}
                value={id}
                className="gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text)] data-[state=active]:bg-[var(--color-surface)] data-[state=active]:text-[var(--color-text)] data-[state=active]:shadow-sm"
              >
                <Icon className="h-3.5 w-3.5" />
                {t(`page.tabs.${id}`)}
              </TabsTrigger>
            ))}
          </TabsList>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        {tabs.map(({ id, Content }) => (
          <TabsContent
            key={id}
            value={id}
            forceMount
            hidden={activeTab !== id}
            className="mt-6 focus-visible:outline-none data-[state=inactive]:hidden"
          >
            {visited.has(id) && <Content />}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
