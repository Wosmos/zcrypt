"use client";

import { useRef } from "react";
import { LockKeyOpen } from "@phosphor-icons/react";
import { GitHubIcon } from "@/components/icons/github";
import { Logo, LogoIcon } from "@/components/ui/logo";
import {
  BarChart3,
  Bell,
  CheckSquare,
  ChevronRight,
  Database,
  File as FileIcon,
  FileUpload,
  FolderAdd,
  GitCommit,
  Home,
  LayoutGrid,
  Layers,
  PanelLeftClose,
  RefreshCw,
  Search,
  Settings,
  Shield,
  TableProperties,
  Trash2,
} from "@/lib/icons";
import { cn, fileIconFor, formatBytes } from "@/lib/utils";
import { COMMIT, countLabel, FOLDERS, README_LINE, REPO } from "./drive-data";
import { DriveRow } from "./drive-card";
import { FilterMenu } from "./drive-parts";
import { TransfersDock } from "./transfers-dock";
import { ExplorerCards, ExplorerOverlays, useRefocus } from "./explorer-shared";
import { useExplorer } from "./use-explorer";

const NAV = [
  { icon: Shield, label: "Vault", on: true },
  { icon: BarChart3, label: "Insights" },
  { icon: Layers, label: "Spaces" },
] as const;
const ACCOUNT = [
  { icon: Settings, label: "Settings" },
  { icon: Trash2, label: "Deleted Files" },
] as const;

/** The desktop app shell: sidebar, top bar and the explorer panel, with sample data. */
export function DriveDesktop({ onPick }: { onPick: () => void }) {
  const x = useExplorer();
  const { state, dispatch, gh, cards, recent } = x;
  const search = useRef<HTMLInputElement>(null);
  const hint = () => dispatch({ type: "hint" });
  const fo = FOLDERS.find((f) => f.id === state.folder);
  const count = countLabel(state.view, x.entries, state.dropped, state.folder);
  const list = state.layout === "list" && !gh;
  const refocus = useRefocus(x);

  return (
    <div
      className="zh-app"
      onKeyDown={(e) => {
        const tag = (e.target as HTMLElement).tagName;
        if (e.key === "/" && tag !== "INPUT" && !state.preview && !state.dialog) {
          e.preventDefault();
          search.current?.focus();
        }
      }}
    >
      <aside className="zh-sb zh-panel zh-dim" aria-label="Sample app sidebar">
        <div className="zh-sb-logo">
          <Logo size="xl" subtitle="Cloud Encrypted Drive" className="zh-sb-full" />
          <LogoIcon size={40} className="zh-sb-mark" />
        </div>
        <nav className="zh-sb-nav" aria-label="Sample app sections">
          {NAV.map(({ icon: I, label, ...r }) => (
            <button
              key={label}
              type="button"
              className="zh-sb-it"
              data-on={"on" in r || undefined}
              aria-current={"on" in r ? "page" : undefined}
              onClick={() => ("on" in r ? dispatch({ type: "folder", id: null }) : hint())}
            >
              <I className="zh-sb-ic" />
              <span className="zh-sb-l">{label}</span>
            </button>
          ))}
          <p className="zh-sb-group">Account</p>
          {ACCOUNT.map(({ icon: I, label }) => (
            <button key={label} type="button" className="zh-sb-it" onClick={hint}>
              <I className="zh-sb-ic" />
              <span className="zh-sb-l">{label}</span>
            </button>
          ))}
        </nav>
        <button type="button" className="zh-sb-store" onClick={hint}>
          <span className="zh-sb-store-h">
            <span className="zh-sb-store-l">
              <Database className="h-3.5 w-3.5" />
              <span>Storage</span>
            </span>
            <span className="zh-inf">∞</span>
          </span>
          <span className="zh-sb-bar" aria-hidden="true">
            <i />
          </span>
          <span className="zh-sb-used">212.4 GB used</span>
        </button>
        <div className="zh-sb-foot">
          <span className="zh-ibtn" aria-hidden="true">
            <PanelLeftClose className="h-4 w-4" />
          </span>
        </div>
      </aside>

      <div className="zh-col">
        <div className="zh-tb zh-dim">
          <button type="button" className="zh-bell" aria-label="Notifications" onClick={hint}>
            <Bell className="h-5 w-5" />
          </button>
          <button type="button" className="zh-avatar" aria-label="Account" onClick={hint}>
            A
          </button>
        </div>

        <div className="zh-main zh-panel">
          <div className="zh-main-in">
            <div className="zh-hdr zh-dim">
              <div className="zh-hdr-l">
                <label className="zh-search">
                  <Search className="zh-search-ic" />
                  <input
                    ref={search}
                    type="search"
                    className="zh-search-in"
                    placeholder="Search your vault"
                    aria-label="Search sample files"
                    value={state.query}
                    disabled={gh}
                    onChange={(e) => dispatch({ type: "query", query: e.target.value })}
                  />
                  <kbd className="zh-kbd" aria-hidden="true">
                    /
                  </kbd>
                </label>
                <span className="zh-vlock">
                  <LockKeyOpen className="h-5 w-5" aria-hidden="true" />
                  <span className="zh-vlock-t">this device</span>
                </span>
              </div>
              <div className="zh-hdr-r">
                <button type="button" className="zh-btn2" onClick={hint}>
                  <FolderAdd className="h-4 w-4" />
                  <span className="zh-btn-t">New folder</span>
                </button>
                <button type="button" className="zh-btn1" onClick={onPick} data-pick="">
                  <FileUpload className="h-4 w-4" />
                  <span className="zh-btn-t">Upload</span>
                </button>
                <button type="button" className="zh-btn2 zh-sq" aria-label="Refresh" onClick={hint}>
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="zh-swap zh-rvw">
              <div className="zh-sw" data-for="you" aria-hidden={gh || undefined}>
                <div className="zh-xlabel">Recently viewed</div>
                <div className="zh-rv-row">
                  {recent.map((r) => {
                    const Icon = fileIconFor(r.name);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        className="zh-rv"
                        data-new={"fresh" in r && r.fresh ? "" : undefined}
                        onClick={(e) => x.openRecent(r, e.currentTarget)}
                        aria-label={`Open ${r.name}, ${formatBytes(r.size)}`}
                      >
                        <span className="zh-rv-ic">
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="zh-rv-t">
                          <span className="zh-rv-n">{r.name}</span>
                          <span className="zh-rv-s">{formatBytes(r.size)}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="zh-sw" data-for="gh" aria-hidden={!gh || undefined}>
                <div className="zh-xlabel zh-mono">README.md</div>
                <div className="zh-readme">
                  <FileIcon className="h-4 w-4" />
                  <span className="zh-mono zh-readme-l">{README_LINE}</span>
                </div>
              </div>
            </div>

            <div className="zh-tbar">
              <div className="zh-swap zh-tbar-l">
                <nav
                  className="zh-sw zh-crumbs"
                  data-for="you"
                  aria-label="Folder path"
                  aria-hidden={gh || undefined}
                >
                  {fo ? (
                    <>
                      <button
                        type="button"
                        className="zh-bc zh-bc-link"
                        onClick={() => dispatch({ type: "folder", id: null })}
                      >
                        <Home className="h-3.5 w-3.5" />
                        <span>My Vault</span>
                      </button>
                      <ChevronRight className="zh-bc-sep" aria-hidden="true" />
                      <span className="zh-bc" aria-current="page">
                        {fo.name}
                      </span>
                    </>
                  ) : (
                    <span className="zh-bc" aria-current="page">
                      <Home className="h-3.5 w-3.5" />
                      <span>My Vault</span>
                    </span>
                  )}
                </nav>
                <div className="zh-sw zh-repo zh-mono" data-for="gh" aria-hidden={!gh || undefined}>
                  <GitHubIcon className="h-4 w-4" />
                  <span>{REPO}</span>
                </div>
              </div>
              <div className="zh-swap zh-tbar-r">
                <div className="zh-sw zh-tools" data-for="you" aria-hidden={gh || undefined}>
                  <FilterMenu />
                  <button type="button" className="zh-tool zh-tool-auto" onClick={hint}>
                    <LayoutGrid className="h-3.5 w-3.5" />
                    <span>Auto</span>
                  </button>
                  <span className="zh-seg">
                    <button
                      type="button"
                      aria-label="List view"
                      aria-pressed={state.layout === "list"}
                      onClick={() => dispatch({ type: "layout", layout: "list" })}
                    >
                      <TableProperties className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Grid view"
                      aria-pressed={state.layout === "grid"}
                      onClick={() => dispatch({ type: "layout", layout: "grid" })}
                    >
                      <LayoutGrid className="h-4 w-4" />
                    </button>
                  </span>
                  <button
                    type="button"
                    className="zh-btn2 zh-sm"
                    aria-pressed={state.selectMode}
                    onClick={() => dispatch({ type: "selectMode" })}
                  >
                    <CheckSquare className="h-3.5 w-3.5" />
                    <span className="zh-btn-t">Select</span>
                  </button>
                </div>
                <div
                  className="zh-sw zh-commit zh-mono"
                  data-for="gh"
                  aria-hidden={!gh || undefined}
                >
                  <GitCommit className="h-3.5 w-3.5" />
                  <span className="zh-commit-m">{COMMIT.msg}</span>
                  <span className="zh-commit-w">{COMMIT.when}</span>
                </div>
              </div>
            </div>

            {list ? (
              <div className="zh-list" role="group" aria-label="Sample files">
                <div className="zh-row zh-row-head" aria-hidden="true">
                  <span className="zh-row-ic" />
                  <span className="zh-row-n">Name</span>
                  <span className="zh-row-t">Type</span>
                  <span className="zh-row-s">Size</span>
                  <span className="zh-row-v">Saved</span>
                  <span className="zh-row-m">Modified</span>
                  <span className="zh-row-c" />
                </div>
                <div ref={x.gridRef} className="zh-list-body">
                  {cards
                    .filter((c) => !c.hidden)
                    .map((c) => (
                      <DriveRow
                        key={c.item.id}
                        item={c.item}
                        kind={c.kind === "folder" ? "folder" : "file"}
                        selected={state.selected.has(c.item.id)}
                        selectMode={state.selectMode}
                        onOpen={x.onOpen}
                      />
                    ))}
                </div>
              </div>
            ) : (
              <div
                ref={x.gridRef}
                className={cn("zh-grid", state.extra && "zh-grid-extra")}
                role="group"
                aria-label="Sample files"
                data-select={state.selectMode || undefined}
              >
                <ExplorerCards x={x} />
              </div>
            )}
            {!gh && cards.every((c) => c.hidden) ? (
              <p className="zh-empty">Nothing here matches. Try another word.</p>
            ) : null}
            <p className="zh-count">{count}</p>
          </div>
        </div>
      </div>

      <TransfersDock variant="desktop" />
      <ExplorerOverlays x={x} onDone={refocus} />
    </div>
  );
}
