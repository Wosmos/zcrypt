"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn, midTrunc } from "@/lib/utils";
import { FOLDER_ICON_OPTIONS, getIconByKey } from "@/lib/folder-icons";
import { STYLE_COLOR_PRESETS } from "@/lib/style-presets";
import { BACKGROUND_DESIGNS, getBackgroundByKey } from "@/lib/background-presets";
import type { CustomStyle } from "@/lib/name-crypto";
import { DIALOG_PANEL } from "@/components/files/explorer/types";
import { Check, RotateCcw, PaintBrush } from "@/lib/icons";

export interface StylePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialStyle: CustomStyle | null;
  onSave: (style: CustomStyle | null) => void | Promise<void>;
  entityLabel?: string;
  /** A gradient/pattern background only reads as a "cover" on a big folder
   *  face — on a small file tile it just looks like a broken color square, so
   *  files get solid color only. Defaults to true (folders). */
  allowBackgroundDesign?: boolean;
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const DEFAULT_PICKER_COLOR = "#3b82f6";

/**
 * Icon + color picker for a folder/file's custom card appearance. One dialog
 * shared by both entity kinds — the caller supplies the current style and gets
 * back either a full `CustomStyle` or `null` (reset to the auto-inferred icon
 * / default color).
 */
export function StylePickerDialog({
  open,
  onOpenChange,
  initialStyle,
  onSave,
  entityLabel,
  allowBackgroundDesign = true,
}: StylePickerDialogProps) {
  const initialBackground = allowBackgroundDesign ? initialStyle?.background : undefined;
  const [pendingIcon, setPendingIcon] = useState<string | undefined>(initialStyle?.icon);
  const [pendingColor, setPendingColor] = useState<string | undefined>(initialStyle?.color);
  const [pendingBackground, setPendingBackground] = useState<string | undefined>(initialBackground);
  const [mode, setMode] = useState<"solid" | "design">(initialBackground ? "design" : "solid");
  const [hexDraft, setHexDraft] = useState(initialStyle?.color ?? "");
  const [saving, setSaving] = useState(false);

  // Reseed the pending selection every time the dialog opens (or the target
  // entity changes while it's open), so a cancelled edit never leaks into the
  // next "Customize" click.
  useEffect(() => {
    if (open) {
      const bg = allowBackgroundDesign ? initialStyle?.background : undefined;
      setPendingIcon(initialStyle?.icon);
      setPendingColor(initialStyle?.color);
      setPendingBackground(bg);
      setMode(bg ? "design" : "solid");
      setHexDraft(initialStyle?.color ?? "");
    }
  }, [open, initialStyle, allowBackgroundDesign]);

  // Keep the hex text field in sync whenever the color changes some other way
  // (swatch color input, quick-pick, reset) — without fighting the user's own
  // keystrokes while they're mid-edit (see handleHexInput below).
  useEffect(() => {
    setHexDraft(pendingColor ?? "");
  }, [pendingColor]);

  const isCustomized = pendingIcon !== undefined || pendingColor !== undefined || pendingBackground !== undefined;
  const PreviewIcon = (pendingIcon ? getIconByKey(pendingIcon) : null) ?? PaintBrush;
  const previewBackground = (pendingBackground ? getBackgroundByKey(pendingBackground) : null) ?? pendingColor;
  const truncatedLabel = entityLabel ? midTrunc(entityLabel, 18, 8) : undefined;

  const handleReset = () => {
    setPendingIcon(undefined);
    setPendingColor(undefined);
    setPendingBackground(undefined);
  };

  // Solid color and design background are mutually exclusive — picking one clears the other.
  const handleColorChange = (value: string) => {
    setPendingColor(value);
    setPendingBackground(undefined);
  };

  const handleSelectDesign = (key: string) => {
    setPendingBackground(key);
    setPendingColor(undefined);
  };

  const handleHexInput = (value: string) => {
    const normalized = value && !value.startsWith("#") ? `#${value}` : value;
    setHexDraft(normalized);
    if (HEX_COLOR_RE.test(normalized)) handleColorChange(normalized);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const background = allowBackgroundDesign ? pendingBackground : undefined;
      await onSave(isCustomized ? { icon: pendingIcon, color: pendingColor, background } : null);
      onOpenChange(false);
    } catch {
      // The caller already surfaced a toast; keep the dialog open so the user can retry.
    } finally {
      setSaving(false);
    }
  };

  const colorPicker = (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <label
          className="relative flex h-8 w-8 flex-shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-[var(--color-border)]"
          style={{ background: pendingColor ?? "var(--color-surface-2)" }}
        >
          <input
            type="color"
            value={HEX_COLOR_RE.test(pendingColor ?? "") ? (pendingColor as string) : DEFAULT_PICKER_COLOR}
            onChange={(e) => handleColorChange(e.target.value)}
            aria-label="Custom color"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
        <Input
          value={hexDraft}
          onChange={(e) => handleHexInput(e.target.value)}
          placeholder="#3B82F6"
          maxLength={7}
          className="font-mono uppercase"
          aria-label="Hex color"
        />
      </div>
      <div role="radiogroup" aria-label="Quick pick color" className="grid grid-cols-6 gap-2 sm:grid-cols-10">
        {STYLE_COLOR_PRESETS.map((preset) => {
          const active = pendingColor?.toLowerCase() === preset.value.toLowerCase();
          return (
            <button
              key={preset.key}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={preset.label}
              title={preset.label}
              onClick={() => handleColorChange(preset.value)}
              style={{ background: preset.value }}
              className={cn(
                "relative flex h-8 w-8 items-center justify-center rounded-full transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40",
                active && "ring-2 ring-[var(--color-accent)] ring-offset-2 ring-offset-[var(--color-surface)]"
              )}
            >
              {active && <Check className="h-3.5 w-3.5 text-white" />}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className={cn(DIALOG_PANEL, "max-w-md")}>
        <DialogHeader>
          <DialogTitle>{truncatedLabel ? `Customize "${truncatedLabel}"` : "Customize"}</DialogTitle>
          <DialogDescription className="text-[var(--color-text-secondary)]">
            The icon and color are encrypted end-to-end, just like the name.
          </DialogDescription>
        </DialogHeader>

        {/* Live preview */}
        <div className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] p-3">
          <div
            className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--color-surface-2)]"
            style={previewBackground ? { background: previewBackground } : undefined}
          >
            <PreviewIcon
              weight="fill"
              size={22}
              className={previewBackground ? "text-white" : "text-[var(--color-text-secondary)]"}
            />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-[var(--color-text)]" title={entityLabel}>
              {truncatedLabel || "Preview"}
            </p>
            <p className="text-xs text-[var(--color-text-muted)]">Live preview</p>
          </div>
        </div>

        {/* Icon grid */}
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">Icon</p>
          <div
            role="radiogroup"
            aria-label="Icon"
            className="grid max-h-44 grid-cols-6 gap-2 overflow-y-auto pr-1 sm:grid-cols-8"
          >
            {FOLDER_ICON_OPTIONS.map((opt) => {
              const active = pendingIcon === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={opt.label}
                  title={opt.label}
                  onClick={() => setPendingIcon(opt.key)}
                  className={cn(
                    "squircle relative flex items-center justify-center rounded-lg border p-2 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40",
                    active
                      ? "border-[var(--color-accent)] ring-1 ring-[var(--color-accent)]"
                      : "border-[var(--color-border)] hover:border-[var(--color-border-hover)]"
                  )}
                >
                  <opt.Icon weight="fill" size={18} className="text-[var(--color-text)]" />
                  {active && (
                    <Check className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full bg-[var(--color-accent)] p-0.5 text-white" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Color: a compact native swatch (opens the OS color picker) + hex
            entry + quick-pick presets. Folders also get a "Design" tab of
            curated gradients/patterns — skipped for files, where a design
            background has no coherent surface to sit on (see
            `allowBackgroundDesign`). */}
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
            {allowBackgroundDesign ? "Background" : "Color"}
          </p>
          {allowBackgroundDesign ? (
            <Tabs value={mode} onValueChange={(v) => setMode(v as "solid" | "design")}>
              <TabsList className="grid w-full grid-cols-2 bg-[var(--color-surface-1)]">
                <TabsTrigger
                  value="solid"
                  className="data-[state=active]:bg-[var(--color-surface)] data-[state=active]:text-[var(--color-text)]"
                >
                  Solid
                </TabsTrigger>
                <TabsTrigger
                  value="design"
                  className="data-[state=active]:bg-[var(--color-surface)] data-[state=active]:text-[var(--color-text)]"
                >
                  Design
                </TabsTrigger>
              </TabsList>

              <TabsContent value="solid" className="mt-3 space-y-2">
                {colorPicker}
              </TabsContent>

              <TabsContent value="design" className="mt-3">
                <div role="radiogroup" aria-label="Background design" className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                  {BACKGROUND_DESIGNS.map((design) => {
                    const active = pendingBackground === design.key;
                    return (
                      <button
                        key={design.key}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        aria-label={design.label}
                        title={design.label}
                        onClick={() => handleSelectDesign(design.key)}
                        style={{ background: design.css }}
                        className={cn(
                          "squircle relative flex h-12 items-center justify-center rounded-lg border transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40",
                          active
                            ? "border-[var(--color-accent)] ring-1 ring-[var(--color-accent)]"
                            : "border-[var(--color-border)] hover:border-[var(--color-border-hover)]"
                        )}
                      >
                        {active && (
                          <Check className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full bg-[var(--color-accent)] p-0.5 text-white" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </TabsContent>
            </Tabs>
          ) : (
            colorPicker
          )}
        </div>

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleReset}
            disabled={!isCustomized}
            className="gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset to default
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
