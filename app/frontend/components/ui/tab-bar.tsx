"use client";

import { useCallback, useRef } from "react";
import { cn } from "@/lib/utils";

interface Tab {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

interface TabBarProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  className?: string;
}

export function TabBar({ tabs, activeTab, onTabChange, className }: TabBarProps) {
  const tabsRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const idx = tabs.findIndex((t) => t.id === activeTab);
      let next = idx;

      if (e.key === "ArrowRight") {
        next = (idx + 1) % tabs.length;
      } else if (e.key === "ArrowLeft") {
        next = (idx - 1 + tabs.length) % tabs.length;
      } else if (e.key === "Home") {
        next = 0;
      } else if (e.key === "End") {
        next = tabs.length - 1;
      } else {
        return;
      }

      e.preventDefault();
      onTabChange(tabs[next].id);

      // Focus the new tab button
      const container = tabsRef.current;
      if (container) {
        const buttons = container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
        buttons[next]?.focus();
      }
    },
    [tabs, activeTab, onTabChange]
  );

  return (
    <div
      ref={tabsRef}
      role="tablist"
      aria-orientation="horizontal"
      onKeyDown={handleKeyDown}
      className={cn(
        "flex p-1 rounded-xl bg-[var(--color-surface-1)] border border-[var(--color-border)] overflow-x-auto",
        className
      )}
    >
      {tabs.map((tab, i) => {
        const isActive = tab.id === activeTab;
        const prevActive = i > 0 && tabs[i - 1].id === activeTab;
        return (
          <div key={tab.id} className="flex flex-1 items-center">
            {i !== 0 && (
              <div
                className={cn(
                  "w-px h-5 bg-[var(--color-text-muted)]/40 flex-shrink-0 transition-opacity",
                  (isActive || prevActive) && "opacity-0"
                )}
              />
            )}
            <button
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`tabpanel-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all",
                isActive
                  ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          </div>
        );
      })}
    </div>
  );
}

interface TabPanelProps {
  id: string;
  activeTab: string;
  children: React.ReactNode;
}

export function TabPanel({ id, activeTab, children }: TabPanelProps) {
  if (id !== activeTab) return null;

  return (
    <div
      role="tabpanel"
      id={`tabpanel-${id}`}
      aria-labelledby={`tab-${id}`}
      tabIndex={0}
      className="outline-none"
    >
      {children}
    </div>
  );
}

/** Stays mounted once rendered — uses `hidden` to toggle visibility instead of unmounting. */
export function PersistentTabPanel({ id, activeTab, children }: TabPanelProps) {
  const isActive = id === activeTab;
  return (
    <div
      role="tabpanel"
      id={`tabpanel-${id}`}
      aria-labelledby={`tab-${id}`}
      tabIndex={isActive ? 0 : -1}
      className="outline-none"
      hidden={!isActive}
    >
      {children}
    </div>
  );
}
