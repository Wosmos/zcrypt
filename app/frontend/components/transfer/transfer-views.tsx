"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, Check, ChevronUp, Clock, Download, Lock, Pause, Upload } from "@/lib/icons";
import { cn } from "@/lib/utils";
import {
  ProgressRing,
  SegmentBar,
  SegmentRing,
  TONE,
  TransferThumb,
  type Segment,
} from "./transfer-parts";

/** Everything the header, slim bar and orb say about the whole set. */
export interface TransferSummary {
  total: number;
  done: number;
  failed: number;
  active: number;
  waiting: number;
  left: number;
  percent: number;
  settled: boolean;
  allPaused: boolean;
  /** Short status after `n/total`: time left, "paused" or "done". */
  status: string;
  segments: Segment[];
  current?: { fileId?: string; name: string };
}

/** What a drag in progress would do if dropped on the panel. */
export interface DropIntent {
  kind: "upload" | "download";
  count: number;
}

/** The batch block: who, where, how many, and the segmented bar. */
export function BatchBlock({
  title,
  thumbs,
  segments,
}: {
  title: string;
  thumbs: { key: string; fileId?: string; name: string }[];
  segments: Segment[];
}) {
  const t = useTranslations("app.transfer");
  const [done, uploading, waiting, failed] = segments;
  const counts = [
    { seg: done, Icon: Check, color: TONE.ok },
    { seg: uploading, Icon: Upload, color: TONE.accent },
    { seg: waiting, Icon: Clock, color: undefined },
    { seg: failed, Icon: AlertCircle, color: TONE.err },
  ];
  return (
    <div data-batch-block className="border-b border-[var(--color-border)] px-3.5 py-3">
      <div className="flex items-center gap-3">
        <div className="flex flex-none">
          {thumbs.map((th, i) => (
            <TransferThumb
              key={th.key}
              fileId={th.fileId}
              name={th.name}
              size={32}
              className={cn("ring-2 ring-[var(--color-surface)]", i > 0 && "-ms-2.5")}
            />
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-[var(--color-text)]">{title}</p>
          <p className="mt-0.5 flex items-center gap-3 text-xs tabular-nums text-[var(--color-text-muted)]">
            {counts.map(({ seg, Icon, color }) => (
              <span
                key={seg.id}
                title={seg.title}
                className="inline-flex items-center gap-1"
                style={{ color }}
              >
                <Icon className="h-[13px] w-[13px]" weight="bold" aria-hidden="true" />
                {seg.count}
              </span>
            ))}
          </p>
        </div>
      </div>
      <SegmentBar segments={segments} className="mt-3 mb-2" />
      <div className="flex flex-wrap gap-3.5 text-[11.5px] text-[var(--color-text-muted)]">
        {(["done", "uploading", "waiting", "failed"] as const).map((k, i) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <i
              className="block h-[7px] w-[7px] rounded-[2px]"
              style={{ background: segments[i].color }}
            />
            {t(`legend.${k}`)}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Dashed drop zone shown over the open panel while a drag is over it. */
export function DropOverlay({ intent, folderName }: { intent: DropIntent; folderName: string }) {
  const t = useTranslations("app.transfer");
  const up = intent.kind === "upload";
  const color = up ? TONE.accent : TONE.ok;
  const Icon = up ? Upload : Download;
  return (
    <div
      data-drop-overlay={intent.kind}
      className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-[color-mix(in_oklab,var(--color-surface)_72%,transparent)] p-3.5 backdrop-blur-[3px]"
    >
      <div
        className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-[14px] border-2 border-dashed text-center"
        style={{ borderColor: color, color }}
      >
        <Icon className="h-[22px] w-[22px]" weight="bold" aria-hidden="true" />
        <b className="font-heading text-[15px] font-bold text-[var(--color-text)]">
          {t(up ? "drop.upload" : "drop.download")}
        </b>
        <span className="px-3 text-xs text-[var(--color-text-muted)]">
          {up
            ? t("drop.uploadDetail", { count: intent.count, folder: folderName })
            : t("drop.downloadDetail", { count: intent.count })}
        </span>
      </div>
    </div>
  );
}

/** Minimized on desktop: ring, n/total, segmented bar, time, failures. */
export function SlimBar({
  summary,
  intent,
  folderName,
  onOpen,
}: {
  summary: TransferSummary;
  intent: DropIntent | null;
  folderName: string;
  onOpen: () => void;
}) {
  const t = useTranslations("app.transfer");
  if (intent) {
    const up = intent.kind === "upload";
    const color = up ? TONE.accent : TONE.ok;
    const Icon = up ? Upload : Download;
    return (
      <div
        data-slim-drop={intent.kind}
        className="flex min-h-16 items-center justify-center gap-2.5 rounded-xl border border-dashed px-3 text-sm font-semibold"
        style={{
          borderColor: color,
          color,
          background: `color-mix(in oklab, ${color} 8%, var(--color-surface))`,
        }}
      >
        <Icon className="h-4 w-4" weight="bold" aria-hidden="true" />
        {up
          ? t("drop.uploadShort", { count: intent.count, folder: folderName })
          : t("drop.downloadShort", { count: intent.count })}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t("open")}
      aria-expanded={false}
      className="flex w-full items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-start shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
    >
      <ProgressRing size={30} stroke={3} percent={summary.percent} />
      <b className="font-heading text-[13px] font-bold tabular-nums whitespace-nowrap text-[var(--color-text)]">
        {summary.done}/{summary.total}
      </b>
      <SegmentBar segments={summary.segments} className="h-1.5 flex-1" />
      <span className="text-xs whitespace-nowrap text-[var(--color-text-muted)]">
        {summary.status}
      </span>
      {summary.failed > 0 && (
        <span
          title={t("header.failed", { count: summary.failed })}
          className="rounded-full px-1.5 text-[10.5px] font-semibold tabular-nums"
          style={{
            color: TONE.err,
            background: `color-mix(in oklab, ${TONE.err} 14%, transparent)`,
          }}
        >
          {summary.failed}
        </span>
      )}
      <ChevronUp
        className="h-4 w-4 flex-none text-[var(--color-text-muted)]"
        weight="bold"
        aria-hidden="true"
      />
    </button>
  );
}

const LONG_PRESS_MS = 500;

/** Minimized on a phone: a ring of the batch around the file being sent now. */
export function TransferOrb({
  summary,
  intent,
  onOpen,
  onLongPress,
}: {
  summary: TransferSummary;
  intent: DropIntent | null;
  onOpen: () => void;
  onLongPress: () => void;
}) {
  const t = useTranslations("app.transfer");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressed = useRef(false);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const doneAll = summary.settled && summary.failed === 0;
  const size = 64;
  let ring;
  let centre;
  if (intent) {
    const color = intent.kind === "upload" ? TONE.accent : TONE.ok;
    const Icon = intent.kind === "upload" ? Upload : Download;
    ring = (
      <svg width={size} height={size} className="absolute inset-0" aria-hidden="true">
        <circle
          cx={32}
          cy={32}
          r={26}
          fill="none"
          stroke={color}
          strokeWidth={3}
          strokeDasharray="5 5"
        />
      </svg>
    );
    centre = (
      <Icon data-orb-centre="drop" className="h-[22px] w-[22px]" weight="bold" style={{ color }} />
    );
  } else if (doneAll) {
    ring = <ProgressRing size={size} stroke={4} percent={100} color={TONE.ok} />;
    centre = (
      <Check
        data-orb-centre="done"
        className="h-[22px] w-[22px]"
        weight="bold"
        style={{ color: TONE.ok }}
      />
    );
  } else if (summary.allPaused) {
    ring = <ProgressRing size={size} stroke={4} percent={summary.percent} color={TONE.warn} />;
    centre = (
      <Pause
        data-orb-centre="paused"
        className="h-5 w-5"
        weight="fill"
        style={{ color: TONE.warn }}
      />
    );
  } else {
    ring = <SegmentRing size={size} stroke={4} segments={summary.segments} />;
    centre = summary.current ? (
      <TransferThumb
        fileId={summary.current.fileId}
        name={summary.current.name}
        size={40}
        className="rounded-full"
      />
    ) : (
      <Lock
        data-orb-centre="lock"
        className="h-5 w-5"
        weight="bold"
        style={{ color: TONE.accent }}
      />
    );
  }
  return (
    <button
      type="button"
      data-orb={intent ? "drop" : doneAll ? "done" : summary.allPaused ? "paused" : "active"}
      aria-label={t("orb", { left: summary.left })}
      onPointerDown={() => {
        pressed.current = false;
        cancel();
        timer.current = setTimeout(() => {
          pressed.current = true;
          timer.current = null;
          onLongPress();
        }, LONG_PRESS_MS);
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        if (pressed.current) {
          pressed.current = false;
          return;
        }
        onOpen();
      }}
      className={cn(
        "relative grid h-16 w-16 touch-manipulation place-items-center rounded-full bg-[var(--color-surface)] shadow-xl ring-1 ring-[var(--color-border)] select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]",
        intent && "scale-110 transition-transform motion-reduce:transform-none",
      )}
    >
      <span className="absolute inset-0">{ring}</span>
      <span className="relative grid place-items-center">{centre}</span>
      {!doneAll && !intent && summary.left > 0 && (
        <span
          data-orb-badge="left"
          className="absolute -top-1.5 -end-2 h-6 min-w-6 rounded-full px-1.5 text-center font-heading text-xs leading-6 font-bold tabular-nums shadow-[0_0_0_2px_var(--color-surface)]"
          style={{
            background: summary.allPaused ? TONE.warn : TONE.accent,
            color: "var(--color-on-accent)",
          }}
        >
          {summary.left}
        </span>
      )}
      {summary.failed > 0 && !intent && (
        <span
          data-orb-badge="failed"
          className="absolute -start-1.5 -bottom-1 h-5 min-w-5 rounded-full px-1 text-center text-[11px] leading-5 font-bold text-white tabular-nums shadow-[0_0_0_2px_var(--color-surface)]"
          style={{ background: TONE.err }}
        >
          {summary.failed}
        </span>
      )}
    </button>
  );
}
