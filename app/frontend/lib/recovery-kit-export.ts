export interface RecoveryKitSheet {
  product: string;
  title: string;
  dateLabel: string;
  keyLabel: string;
  recoveryKey: string;
  instructions: string[];
  dir?: "ltr" | "rtl";
}

/** The plain-text kit, for "Download as text file". */
export function recoveryKitText(sheet: RecoveryKitSheet): string {
  return [
    `${sheet.product} - ${sheet.title}`,
    sheet.dateLabel,
    "",
    `${sheet.keyLabel}:`,
    sheet.recoveryKey,
    "",
    ...sheet.instructions.map((line, i) => `${i + 1}. ${line}`),
    "",
  ].join("\n");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** A self-contained, print-only page for the kit. */
export function recoveryKitHtml(sheet: RecoveryKitSheet): string {
  const steps = sheet.instructions.map((line) => `<li>${escapeHtml(line)}</li>`).join("");
  return `<!doctype html>
<html dir="${sheet.dir ?? "ltr"}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(sheet.product)} - ${escapeHtml(sheet.title)}</title>
<style>
  body { font-family: system-ui, sans-serif; color: #111; margin: 48px; max-width: 640px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .product { font-size: 13px; letter-spacing: 0.12em; text-transform: uppercase; color: #555; }
  .date { font-size: 13px; color: #555; margin-bottom: 28px; }
  .label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #555; margin-bottom: 8px; }
  .key { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 18px; line-height: 1.6; word-break: break-all; border: 2px solid #111; border-radius: 8px; padding: 16px; margin-bottom: 28px; direction: ltr; text-align: left; }
  ol { padding-inline-start: 20px; line-height: 1.6; font-size: 14px; }
</style>
</head>
<body>
<div class="product">${escapeHtml(sheet.product)}</div>
<h1>${escapeHtml(sheet.title)}</h1>
<div class="date">${escapeHtml(sheet.dateLabel)}</div>
<div class="label">${escapeHtml(sheet.keyLabel)}</div>
<div class="key">${escapeHtml(sheet.recoveryKey)}</div>
<ol>${steps}</ol>
</body>
</html>`;
}

/** Print the kit from a hidden frame, so no popup and no other page is involved. */
export function printRecoveryKit(sheet: RecoveryKitSheet): void {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(recoveryKitHtml(sheet));
  doc.close();
  win.addEventListener("afterprint", () => frame.remove());
  win.focus();
  win.print();
}
