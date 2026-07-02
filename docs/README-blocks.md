# Shared layout primitives (`(app)` shell)

Polished, token-driven building blocks every authenticated page reuses for a
consistent look. All styling goes through the `.app-shell` CSS vars
(`--color-surface`, `--color-text-secondary`, `--color-border`, `--color-accent`,
etc.) and the `.panel` utility. Both light and dark themes are covered.

Import from the matching file under `@/components/ui/*`.

---

## `PageHeader` — `page-header.tsx`

Standard page title block: eyebrow label, h1, description, right-aligned actions.

| Prop          | Type        | Required | Notes                                         |
| ------------- | ----------- | -------- | --------------------------------------------- |
| `title`       | `string`    | yes      | Rendered as `<h1>`, truncates.                |
| `description` | `string`    | no       | Supporting copy under the title.              |
| `eyebrow`     | `string`    | no       | Small uppercase label above the title.        |
| `actions`     | `ReactNode` | no       | Right-aligned slot (buttons, menus).          |
| `className`   | `string`    | no       |                                               |

```tsx
<PageHeader
  eyebrow="Library"
  title="My files"
  description="Everything you have encrypted and stored."
  actions={<Button>Upload</Button>}
/>
```

---

## `Section` — `section.tsx`

A labelled content section to compose *inside* a `.panel`. Header is optional;
with no title/description/actions it renders just the children.

| Prop          | Type        | Required | Notes                              |
| ------------- | ----------- | -------- | ---------------------------------- |
| `title`       | `string`    | no       | Section heading (`<h2>`).          |
| `description` | `string`    | no       | Supporting copy.                   |
| `actions`     | `ReactNode` | no       | Right-aligned section actions.     |
| `children`    | `ReactNode` | yes      | Section body.                      |
| `className`   | `string`    | no       |                                    |

```tsx
<div className="panel p-6">
  <Section title="Active sessions" description="Devices signed in to your account.">
    {/* ... */}
  </Section>
</div>
```

---

## `StatCard` — `stat-card.tsx`

Compact metric card with a leading icon chip. Value + hint use `tabular-nums`.
Includes its own `.panel`, so place it directly in a grid.

| Prop        | Type             | Required | Notes                                            |
| ----------- | ---------------- | -------- | ------------------------------------------------ |
| `label`     | `string`         | yes      | Uppercase metric label.                          |
| `value`     | `ReactNode`      | yes      | Main value; `tabular-nums`.                      |
| `icon`      | icon component   | yes      | From `@/lib/icons`. `ComponentType<{className?,size?}>`. |
| `hint`      | `ReactNode`      | no       | Secondary line under the value.                  |
| `accent`    | `boolean`        | no       | Tints the icon chip with the accent color.       |
| `className` | `string`         | no       |                                                  |

```tsx
<StatCard label="Storage used" value="4.2 GB" hint="of 10 GB" icon={HardDrive} accent />
```

---

## `IconButton` — `icon-button.tsx`

The app-wide standard for icon-only actions. Always wraps itself in a shadcn
Tooltip showing `label` and sets `aria-label`. Built on the custom `Button`
(`size="icon"`). Forwards a ref and spreads remaining button props
(`onClick`, `disabled`, …). `"use client"`.

| Prop            | Type                                              | Required | Notes                        |
| --------------- | ------------------------------------------------- | -------- | ---------------------------- |
| `icon`          | icon component                                    | yes      | From `@/lib/icons`.          |
| `label`         | `string`                                          | yes      | Tooltip text **and** aria.   |
| `variant`       | `"primary" \| "secondary" \| "danger" \| "ghost"` | no       | Defaults to `"ghost"`.       |
| `side`          | `"top" \| "right" \| "bottom" \| "left"`          | no       | Tooltip side; default `top`. |
| `iconClassName` | `string`                                          | no       | Override icon size class.    |
| `...props`      | button attrs (minus `aria-label`)                 | no       | `onClick`, `disabled`, etc.  |

```tsx
<IconButton icon={Trash2} label="Delete" variant="danger" onClick={onDelete} />
```

---

## `ConfirmDialog` — `confirm-dialog.tsx`

Ergonomic wrapper over the alert-dialog primitive for consistent confirm modals.
Enforces title + description, supports destructive styling, and shows an inline
spinner while `loading`. While `loading`, dismissal is blocked. The confirm
click is `preventDefault`-ed so the dialog stays mounted during async work —
close it yourself via `onOpenChange(false)` after `onConfirm` resolves.
`"use client"`.

| Prop           | Type                       | Required | Notes                                  |
| -------------- | -------------------------- | -------- | -------------------------------------- |
| `open`         | `boolean`                  | yes      | Controlled open state.                 |
| `onOpenChange` | `(open: boolean) => void`  | yes      | Close handler (overlay/cancel/escape). |
| `title`        | `string`                   | yes      |                                        |
| `description`  | `ReactNode`                | yes      | Required for context + a11y.           |
| `confirmLabel` | `string`                   | no       | Default `"Confirm"`.                   |
| `cancelLabel`  | `string`                   | no       | Default `"Cancel"`.                    |
| `destructive`  | `boolean`                  | no       | Red confirm action.                    |
| `onConfirm`    | `() => void`               | yes      | Runs on confirm; can be async.         |
| `loading`      | `boolean`                  | no       | Disables actions, shows spinner.       |

```tsx
<ConfirmDialog
  open={open}
  onOpenChange={setOpen}
  destructive
  title="Delete file?"
  description="This permanently removes the file. This cannot be undone."
  confirmLabel="Delete"
  loading={deleting}
  onConfirm={handleDelete}
/>
```

---

## Skeletons kit — `skeletons.tsx`

Loading placeholders built on the existing `Skeleton` + `.animate-shimmer`.
Render these while client-side data loads (theme-aware shimmer).

| Component      | Props                                  | Notes                                            |
| -------------- | -------------------------------------- | ------------------------------------------------ |
| `SkeletonText` | `{ className?, w? }`                    | Single line; `w` is a width class (`"w-1/2"`).   |
| `SkeletonRow`  | `{ className? }`                        | List/table row: square + title + meta.           |
| `SkeletonCard` | `{ className?, lines? }`                | Panel card; `lines` body lines (default 3).      |
| `SkeletonStat` | `{ className? }`                        | Mirrors `StatCard` layout.                       |

```tsx
{loading
  ? <div className="grid grid-cols-3 gap-4">{Array.from({length:3}).map((_,i)=><SkeletonStat key={i}/>)}</div>
  : <StatGrid />}
```
