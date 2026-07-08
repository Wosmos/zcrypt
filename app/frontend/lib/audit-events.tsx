/**
 * Unified audit / security event metadata: display labels, icons, and badge
 * color classes. Folds the near-duplicate maps in the admin audit log, the admin
 * user-detail panel, and the settings security-activity panel.
 *
 * Reconciliation notes:
 *  - Colors: the admin audit log carried an extra `border-*` token the other two
 *    lacked. That's now opt-in via `eventColorClass(type, { border: true })`, so
 *    the borderless consumers render identically while the audit log keeps its
 *    outline.
 *  - Labels: EVENT_LABELS uses the admin Title-Case wording (the fuller set). The
 *    settings security-activity panel used friendlier past-tense wording ("Signed
 *    in" vs "User Login"); if that voice is worth keeping, leave that call site on
 *    its own label map rather than adopting EVENT_LABELS.
 */
import {
  Shield,
  LogIn,
  LogOut,
  UserPlus,
  Key,
  Link2,
  HardDrive,
  Upload,
  Download,
  Trash2,
  Settings,
} from "@/lib/icons";

/** Title-Case display labels for audit event types. */
export const EVENT_LABELS: Record<string, string> = {
  login: "User Login",
  login_failed: "Login Failed",
  register: "User Registered",
  logout: "User Logout",
  oauth_login: "OAuth Login",
  oauth_register: "OAuth Register",
  oauth_link: "OAuth Linked",
  oauth_unlink: "OAuth Unlinked",
  magic_link_sent: "Magic Link Sent",
  magic_link_used: "Magic Link Used",
  file_upload: "File Uploaded",
  file_download: "File Downloaded",
  file_delete: "File Deleted",
  platform_connect: "Platform Connected",
  platform_disconnect: "Platform Disconnected",
  "2fa_enable": "2FA Enabled",
  "2fa_disable": "2FA Disabled",
  email_verify: "Email Verified",
  password_reset_requested: "Password Reset Requested",
  password_reset: "Password Reset",
  admin_role_change: "Role Changed",
  admin_user_delete: "User Deleted",
  admin_plan_change: "Plan Changed",
};

/** Icon component per audit event type. */
export const EVENT_ICONS: Record<string, typeof Shield> = {
  login: LogIn,
  login_failed: LogIn,
  register: UserPlus,
  logout: LogOut,
  oauth_login: LogIn,
  oauth_register: UserPlus,
  oauth_link: Link2,
  oauth_unlink: Link2,
  magic_link_sent: Key,
  magic_link_used: Key,
  file_upload: Upload,
  file_download: Download,
  file_delete: Trash2,
  platform_connect: HardDrive,
  platform_disconnect: HardDrive,
  "2fa_enable": Shield,
  "2fa_disable": Shield,
  admin_role_change: Settings,
  admin_user_delete: Trash2,
  admin_plan_change: Settings,
};

// Base (borderless) badge color classes.
const EVENT_COLORS: Record<string, string> = {
  login: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  login_failed: "bg-red-500/10 text-red-600 dark:text-red-400",
  register: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  logout: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
  oauth_login: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  oauth_register: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  oauth_link: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  oauth_unlink: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  magic_link_sent: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  magic_link_used: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  file_upload: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  file_download: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  file_delete: "bg-red-500/10 text-red-600 dark:text-red-400",
  platform_connect: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  platform_disconnect: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  admin_role_change: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  admin_user_delete: "bg-red-500/10 text-red-600 dark:text-red-400",
  admin_plan_change: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

// Matching border tokens for the audit-log outline variant.
const EVENT_BORDERS: Record<string, string> = {
  login: "border-blue-500/20",
  login_failed: "border-red-500/20",
  register: "border-cyan-500/20",
  logout: "border-slate-500/20",
  oauth_login: "border-blue-500/20",
  oauth_register: "border-cyan-500/20",
  oauth_link: "border-violet-500/20",
  oauth_unlink: "border-amber-500/20",
  magic_link_sent: "border-blue-500/20",
  magic_link_used: "border-blue-500/20",
  file_upload: "border-cyan-500/20",
  file_download: "border-sky-500/20",
  file_delete: "border-red-500/20",
  platform_connect: "border-cyan-500/20",
  platform_disconnect: "border-amber-500/20",
  admin_role_change: "border-amber-500/20",
  admin_user_delete: "border-red-500/20",
  admin_plan_change: "border-amber-500/20",
};

const DEFAULT_COLOR = "bg-slate-500/10 text-slate-600 dark:text-slate-400";
const DEFAULT_BORDER = "border-slate-500/20";

/** Badge color classes for an event type. Pass `{ border: true }` to append the
 *  matching border token (the admin audit-log outline). */
export function eventColorClass(type: string, opts?: { border?: boolean }): string {
  const base = EVENT_COLORS[type] ?? DEFAULT_COLOR;
  if (!opts?.border) return base;
  return `${base} ${EVENT_BORDERS[type] ?? DEFAULT_BORDER}`;
}
