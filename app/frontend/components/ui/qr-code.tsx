"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useTranslations } from "next-intl";

interface QRShareProps {
  url: string;
}

export function QRShare({ url }: QRShareProps) {
  const t = useTranslations("ui.qr");
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="space-y-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
      >
        {expanded ? t("hide") : t("show")}
      </button>
      {expanded && (
        <div className="flex justify-center p-4 rounded-xl bg-white border border-[var(--color-border)]">
          <QRCodeSVG value={url} size={180} level="M" marginSize={2} />
        </div>
      )}
    </div>
  );
}
