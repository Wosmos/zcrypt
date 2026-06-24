# Vault Rebuild — Polish Fix List (from the 4 adversarial reviews)

Same guardrails as REBUILD_SPEC.md (zero-knowledge sacred; ONLY `--color-*` token utilities + `.panel`/`.card`, no hardcoded hex; `"use client"`; icons from `@/lib/icons`; motion honors `useReducedMotion()`; never touch marketing/auth; globals.css + tailwind.config.js FROZEN). Each fixer OWNS a disjoint set of files — do not edit outside your set. Must keep `bun run typecheck` clean and add no new lint errors.

---

## OWNER A — Vault page  (`app/(app)/dashboard/page.tsx`)

**S1 (CRITICAL) — Remove the duplicate browser above the explorer.**
The Files tab renders `<QuickAccess />` directly above `<VaultExplorer />`. QuickAccess is a *second* folder+file browser (top-level folder cards + recent files + a stat trio) — at the vault root the same folders appear twice, stacked, which is the precise "two sections in a trenchcoat" anti-pattern this rebuild exists to kill. **Remove `<QuickAccess />` (and its now-unused import) from the Files tab.** Leave `components/files/quick-access.tsx` on disk (just stop importing it). The explorer is the single unified surface; the stat numbers already live on the Insights tab. Do not touch any other behavior on the page. Verify typecheck after.

---

## OWNER B — Explorer  (`components/files/vault-explorer.tsx` + everything under `components/files/explorer/`)

Read each file first. Apply ALL of the following. These are cohesive within the explorer; you own the whole directory so there are no cross-owner conflicts.

**H1 — Folder rows are invisible/ambiguous on mobile.** In `explorer-row.tsx` the folder chevron and the "opens" cue are `hidden … sm:block`, so below `sm` a folder collapses to icon+name with no navigation affordance. Keep the **chevron visible on mobile for folder rows** (and ensure a folder still visually reads as tappable/navigable at all widths).

**H2 — Empty / no-results logic uses the wrong sets.** The empty state keys off raw `folders.length`/`folderFiles.length` while the listing renders `sortedFolders`/`sortedFiles` (which a `typeFilter` can empty). Derive the empty-state AND no-results decisions from the SAME final `entries` array the listing renders, so you can never land on an empty scroll area with no message. Distinguish: (a) folder truly empty, (b) search/type-filter matched nothing.

**H3-footer — Count footer.** Render the count uniformly as "N folders · M files" (or "N items" when one group is empty) instead of the current bespoke conditional string-join that drops a group when its count is 0.

**M1 — Grid mode folder/file parity.** In `explorer-card.tsx` folder cards are a short `px-3 py-3` horizontal row while file cards are tall (≈120px header + footer), so the grid is ragged. Give folder cards the **same footprint** as file cards (large folder glyph occupying the same header area, matching height), so folders and files form an even grid (Finder-style).

**M2 — Hover affordance parity.** File cards lift (`hover:shadow-lg`) but folder cards don't. Apply the same subtle hover-raise to folder cards/rows so the two members of the one listing behave identically.

**M3 — Kebab discoverability on touch.** Row/card kebab triggers are `opacity-0 … group-hover:opacity-100` (invisible on touch). Change to `opacity-100 sm:opacity-0 sm:group-hover:opacity-100` (and keep visible on focus) so touch devices always have a path to Rename/Share/Move/Delete.

**M4 — Selection styling parity.** List uses `bg-[var(--shell-active)]`; grid uses `border-accent/40 bg-accent/5 ring-accent/20`. Pick ONE accent-selection treatment and apply to both list rows and grid cards.

**M6 / L11 — One lock metaphor.** Drop the tiny per-row/per-card "Encrypted" `Lock` glyph (everything is always encrypted, so it conveys no state and adds noise + SR repetition). Let the single cyan `VaultLock` header pill own the lock metaphor. (If you want the encrypted fact surfaced, it already lives in the details drawer — don't re-add per row.)

**L1 — `scrollbar-none` is a dead class** (not defined anywhere, no plugin). In `breadcrumb.tsx` (and if present in the explorer) replace it with a real hide: add the arbitrary variant `[&::-webkit-scrollbar]:hidden` plus inline `style={{ scrollbarWidth: "none" }}` on the scrolling element. Do NOT edit globals.css.

**M5 — `animate-pulse` is not reduced-motion safe.** The skeleton at `vault-explorer.tsx` uses stock `animate-pulse`, which globals.css does NOT suppress under `prefers-reduced-motion`. Gate it with the `prefersReducedMotion` value already in the file (e.g. `cn(!prefersReducedMotion && "animate-pulse", …)`) or swap to `animate-pulse-soft` (which IS suppressed).

### Accessibility (explorer)
**a11y-H3 (highest leverage) — Focus rings.** Across every interactive explorer element (rows, cards, kebab triggers, checkboxes, sort headers, select-all, breadcrumb crumbs, toolbar view/select/clear-search buttons) replace the faint `focus-visible:ring-[var(--color-accent)]/40` (and `ring-inset` where it hurts) with the transfer dock's pattern: **solid** `focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]`. This is the single biggest a11y win — make it consistent.

**a11y-H4 — Muted text contrast.** For small text-bearing muted elements (inactive view-toggle glyph, count footer, locked hint, the card "Encrypted" badge if you keep any) prefer `--color-text-secondary` over `--color-text-muted`, and never use `/50` alpha on text-bearing elements.

**a11y-H2 — Row/card accessible name.** Each `role="button"` row/card concatenates all its text as the accessible name. Give each an explicit `aria-label` — folders: `Open folder {name}`; files: `{name}, {typeLabel}, {size}`. (Once done, decorative children like the thumbnail `alt=""` are correct.)

**a11y-M7 — Sort state.** Give each sortable column-header button an `aria-label` like `Sort by {label}{active ? ", currently {dir}ending" : ""}`.

**a11y-M8 — List/grid semantics.** Add `role="list"` to the listing scroll container and `role="listitem"` to each item wrapper (list mode); for grid you may keep `role="list"`/`listitem` for simplicity. Goal: items are enumerable by AT.

**a11y-M9 — Breadcrumb current.** In `breadcrumb.tsx` add `aria-current="page"` to the last (current) crumb.

**a11y-L12 — Filter chips.** `file-type-filter.tsx` is rendered inside the explorer toolbar — add `aria-pressed={active}` to each chip and the same solid focus-visible ring. (You may edit this one file even though it's not under `explorer/`, since it's the explorer's filter UI. Owner B owns it too.)

---

## OWNER C — Vault lock + Transfer dock  (`hooks/useVaultLock.ts`, `components/ui/vault-lock.tsx`, `components/transfer/transfer-manager.tsx`, `components/transfer/transfer-item.tsx`)

**L5 — Countdown reads as a broken clock.** The pill shows `MM:SS` but the timer ticks every 30s, so the seconds digits jump in 30s steps. Tick every **1 second** (one `setInterval`, cleared on unmount, reduced-motion irrelevant) so the `MM:SS` countdown is smooth. Keep it cheap (only when unlocked).

**M5-progress — Don't double-ease the upload bar.** In `transfer-item.tsx` the progress BAR width is driven by `easeProgress()` (a display-only log ease) AND animated over 0.45s, which can read as a stall near the end. For uploads with real `bytesProcessed/totalBytes`, drive the **bar width from the true ratio** (the eased number on the label is fine to keep). Downloads keep `item.progress`.

**a11y-L13 — Live region.** Add `aria-live="polite"` to the dock header status text and/or `role="status"` to each item's status line, so transfer completion/failure is announced.

Keep all existing dock behavior (state→control mapping, pause/resume/stop/retry, render-null-when-empty, collapse pill) intact.

---

## DEFERRED (note, do NOT build now)
- **C1 (a11y) — folders have no keyboard move path.** Files have kebab "Move to folder"; folders are only movable by drag. Fixing properly means teaching `MoveToFolderDialog` to accept a folder target. Track for the per-folder-password phase (which already touches folder plumbing). Folder drag-move still works for pointer users.
