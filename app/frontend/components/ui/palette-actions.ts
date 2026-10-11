import type { ComponentType } from "react";
import {
  FileUpload,
  FolderAdd,
  Keyboard,
  Layers,
  Lock,
  MonitorSmartphone,
  Moon,
  Plus,
  Sun,
  Unlock,
  Wand2,
} from "@/lib/icons";

export type PaletteActionId =
  | "upload"
  | "newFolder"
  | "toggleLock"
  | "toggleTheme"
  | "toggleAdvanced"
  | "openSpaces"
  | "newSpace"
  | "getApps"
  | "shortcuts";

export interface PaletteActionDef {
  id: PaletteActionId;
  labelKey: string;
  icon: ComponentType<{ className?: string }>;
}

export interface PaletteActionContext {
  unlocked: boolean;
  resolvedTheme: "light" | "dark";
  advancedMode: boolean;
  hasAppsDialog: boolean;
  hasKeyboard: boolean;
}

export function paletteActions(ctx: PaletteActionContext): PaletteActionDef[] {
  const actions: PaletteActionDef[] = [
    { id: "upload", labelKey: "ui.palette.action.upload", icon: FileUpload },
    { id: "newFolder", labelKey: "ui.palette.action.newFolder", icon: FolderAdd },
    ctx.unlocked
      ? { id: "toggleLock", labelKey: "ui.palette.action.lock", icon: Lock }
      : { id: "toggleLock", labelKey: "ui.palette.action.unlock", icon: Unlock },
    ctx.resolvedTheme === "dark"
      ? { id: "toggleTheme", labelKey: "ui.theme.toLight", icon: Sun }
      : { id: "toggleTheme", labelKey: "ui.theme.toDark", icon: Moon },
    {
      id: "toggleAdvanced",
      labelKey: ctx.advancedMode ? "ui.palette.action.advancedOff" : "ui.palette.action.advancedOn",
      icon: Wand2,
    },
    { id: "openSpaces", labelKey: "ui.palette.action.openSpaces", icon: Layers },
    { id: "newSpace", labelKey: "ui.palette.action.newSpace", icon: Plus },
  ];
  if (ctx.hasAppsDialog) {
    actions.push({
      id: "getApps",
      labelKey: "ui.palette.action.getApps",
      icon: MonitorSmartphone,
    });
  }
  if (ctx.hasKeyboard) {
    actions.push({ id: "shortcuts", labelKey: "ui.palette.action.shortcuts", icon: Keyboard });
  }
  return actions;
}
