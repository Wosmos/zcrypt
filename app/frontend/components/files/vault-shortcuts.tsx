"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { usePendingAction } from "@/store/pending-action";
import { ShortcutsHelp } from "@/components/spaces/shared";

export function VaultShortcuts() {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const consume = (pending: string | null) => {
      if (pending !== "shortcuts") return;
      usePendingAction.getState().clear();
      setOpen(true);
    };
    consume(usePendingAction.getState().pending);
    return usePendingAction.subscribe((s) => consume(s.pending));
  }, []);
  const items: [string, string][] = [
    [t("spaces.shared.arrowKeys"), t("app.vaultExplorer.shortcuts.move")],
    [t("spaces.shared.shiftArrow"), t("app.vaultExplorer.shortcuts.extend")],
    [t("spaces.shared.ctrlClick"), t("spaces.home.ctrlClickDesc")],
    [t("spaces.shared.shiftClick"), t("spaces.home.shiftClickDesc")],
    ["Space", t("app.vaultExplorer.shortcuts.select")],
    ["Ctrl/Cmd + A", t("app.vaultExplorer.shortcuts.selectAll")],
    ["Enter", t("app.vaultExplorer.shortcuts.open")],
    ["Delete", t("app.vaultExplorer.shortcuts.trash")],
    ["F2", t("app.vaultExplorer.shortcuts.rename")],
    ["Esc", t("app.vaultExplorer.shortcuts.clear")],
    ["/", t("ui.globalSearch.placeholder")],
    ["?", t("app.vaultExplorer.shortcuts.show")],
  ];
  return (
    <ShortcutsHelp
      items={items}
      title={t("app.vaultExplorer.shortcutsTitle")}
      open={open}
      onOpenChange={setOpen}
    />
  );
}
