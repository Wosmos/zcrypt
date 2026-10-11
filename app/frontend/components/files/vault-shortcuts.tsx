"use client";

import { useTranslations } from "next-intl";
import { ShortcutsHelp } from "@/components/spaces/shared";

export function VaultShortcuts() {
  const t = useTranslations();
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
    ["S", t("app.vaultExplorer.shortcuts.star")],
    ["Esc", t("app.vaultExplorer.shortcuts.clear")],
    ["/", t("ui.globalSearch.placeholder")],
    ["?", t("app.vaultExplorer.shortcuts.show")],
  ];
  return <ShortcutsHelp items={items} title={t("app.vaultExplorer.shortcutsTitle")} />;
}
