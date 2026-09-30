"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { MOBILE_GLYPHS, OS_GLYPHS } from "@/components/marketing/download/os-glyphs";
import { GitHubIcon } from "@/components/icons/github";
import { GitlabIcon as GitLabIcon } from "@/components/icons/gitlab";
import { HuggingFaceIcon } from "@/components/icons/huggingface";
import { TelegramIcon } from "@/components/icons/telegram";
import { ArrowRight, ChevronDown, Download, Lock } from "@/lib/icons";
import { PillLink } from "@/components/marketing/ui/pill-link";
import { DriveProvider, useDrive } from "./drive-store";
import { DriveStage } from "./drive-stage";
import { useOsLabel } from "./use-os-label";

function OsButton() {
  const t = useTranslations("marketing.hero");
  const { os, labelKey, href } = useOsLabel();
  const Glyph = os === "android" || os === "ios" ? MOBILE_GLYPHS[os] : os ? OS_GLYPHS[os] : null;
  return (
    <PillLink href={href} variant="secondary" icon={Glyph ?? Download}>
      <span>{t(labelKey)}</span>
    </PillLink>
  );
}

function Head() {
  const t = useTranslations("marketing.hero");
  return (
    <div className="zh-head">
      <div className="zh-head-in">
        <Link
          href="/download"
          className="pv2-pill zh-rise"
          style={{ "--i": 0 } as React.CSSProperties}
        >
          {t("badge")}
          <ArrowRight className="h-3.5 w-3.5 rtl:-scale-x-100" />
        </Link>
        <h1
          id="h-top"
          className="pv2-h1 zh-rise zh-rise-keep"
          style={{ "--i": 1 } as React.CSSProperties}
        >
          {t("title")}
          <span className="pv2-dot" aria-hidden="true">
            .
          </span>
        </h1>
        <p className="pv2-sub zh-rise" style={{ "--i": 2 } as React.CSSProperties}>
          {t("sub")}
        </p>
        <div className="pv2-ctas zh-rise" style={{ "--i": 3 } as React.CSSProperties}>
          <PillLink href="/register">{t("cta")}</PillLink>
          <OsButton />
        </div>
        <p className="pv2-micro zh-rise" style={{ "--i": 4 } as React.CSSProperties}>
          {t("micro")}
        </p>
        <span className="zh-cue" aria-hidden="true">
          {t("scroll")}
          <ChevronDown className="h-3.5 w-3.5" />
        </span>
      </div>
    </div>
  );
}

function Live() {
  const { state } = useDrive();
  const [msg, setMsg] = useState("");
  useEffect(() => {
    if (!state.live) return;
    setMsg("");
    const t = window.setTimeout(() => setMsg(state.live?.msg ?? ""), 30);
    return () => window.clearTimeout(t);
  }, [state.live]);
  return (
    <p className="sr-only" aria-live="polite">
      {msg}
    </p>
  );
}

function After() {
  const t = useTranslations("marketing.hero");
  return (
    <div className="zh-after">
      <div className="zh-caps">
        <p className="zh-cap" data-for="you">
          {t.rich("capYou", {
            d: (chunks) => <span className="zh-cap-d">{chunks}</span>,
            t: (chunks) => <span className="zh-cap-t">{chunks}</span>,
          })}
        </p>
        <p className="zh-cap" data-for="gh">
          {t.rich("capThem", {
            nw: (chunks) => <span className="zh-nw">{chunks}</span>,
          })}
        </p>
      </div>
      <ul className="zh-trust">
        <li>
          <span className="zh-tr-ic">
            <GitHubIcon className="h-4 w-4" />
          </span>
          <span>{t.rich("trustOpen", { b: (chunks) => <b>{chunks}</b> })}</span>
        </li>
        <li>
          <span className="zh-tr-ic zh-tr-plat" aria-hidden="true">
            <TelegramIcon className="zh-c-tg" />
            <GitHubIcon className="zh-c-gh" />
            <GitLabIcon className="zh-c-gl" />
            <HuggingFaceIcon className="zh-c-hf" />
          </span>
          <span>{t.rich("trustAccounts", { b: (chunks) => <b>{chunks}</b> })}</span>
        </li>
        <li>
          <span className="zh-tr-ic">
            <Lock className="h-4 w-4" />
          </span>
          <span>{t.rich("trustLocked", { b: (chunks) => <b>{chunks}</b> })}</span>
        </li>
      </ul>
      <Live />
    </div>
  );
}

function HeroInner() {
  const { state } = useDrive();
  const section = useRef<HTMLElement>(null);
  return (
    <section
      ref={section}
      id="top"
      className="zh"
      data-nav-tone="busy"
      data-view={state.view}
      aria-labelledby="h-top"
    >
      <DriveStage head={<Head />} section={section} />
      <After />
    </section>
  );
}

/** Screen one: a clean head, then the product window grows until it fills the screen. */
export function DriveHero() {
  return (
    <DriveProvider>
      <HeroInner />
    </DriveProvider>
  );
}
