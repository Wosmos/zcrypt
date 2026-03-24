import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Users,
  Shield,
  Lock,
  UserPlus,
} from "@/lib/icons";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";

export const metadata: Metadata = {
  title: "Shared Vaults | zcrypt Docs",
  description:
    "Create shared vaults in zcrypt to collaborate with other users. Role-based access control with viewer, editor, and admin permissions.",
  keywords: [
    "shared vault",
    "encrypted file sharing",
    "team collaboration",
    "shared encrypted storage",
    "role-based access",
    "zcrypt sharing",
    "secure collaboration",
  ],
  alternates: {
    canonical: "https://zcrypt.cloud/docs/shared-vaults",
  },
  openGraph: {
    title: "Shared Vaults | zcrypt Docs",
    description:
      "Collaborate securely with shared vaults. Invite members with role-based access control.",
    url: "https://zcrypt.cloud/docs/shared-vaults",
  },
};

const roles = [
  {
    name: "Viewer",
    desc: "Can view and download files in the vault. Cannot add, modify, or delete files.",
    color: "text-blue-500",
    bg: "bg-blue-500/10",
  },
  {
    name: "Editor",
    desc: "Everything a viewer can do, plus the ability to add and remove files in the vault.",
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
  },
  {
    name: "Admin",
    desc: "Full control. Can manage files, invite or remove members, and change member roles.",
    color: "text-amber-500",
    bg: "bg-amber-500/10",
  },
];

export default function SharedVaultsPage() {
  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "Home", url: "https://zcrypt.cloud" },
          { name: "Documentation", url: "https://zcrypt.cloud/docs" },
          {
            name: "Shared Vaults",
            url: "https://zcrypt.cloud/docs/shared-vaults",
          },
        ]}
      />

      {/* Header */}
      <section className="pt-24 md:pt-32 pb-12 px-4">
        <div className="max-w-3xl mx-auto">
          <Link
            href="/docs"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors mb-6"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to docs
          </Link>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight font-heading">
            Shared Vaults
          </h1>
          <p className="mt-3 text-lg text-[var(--color-text-secondary)] max-w-2xl leading-relaxed">
            Create collaborative file vaults and invite other zcrypt users with
            role-based permissions.
          </p>
        </div>
      </section>

      {/* Overview */}
      <section className="pb-12 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="card p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-xl bg-cyan-500/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-cyan-500" />
              </div>
              <h2 className="text-lg font-bold">How shared vaults work</h2>
            </div>
            <div className="space-y-3 text-sm text-[var(--color-text-secondary)] leading-relaxed">
              <p>
                A shared vault is a named collection of files that multiple
                zcrypt users can access. The vault owner creates it, adds files,
                and invites members by email. Each member gets a role that
                controls what they can do.
              </p>
              <p>
                Files in a shared vault are the same encrypted files from your
                regular vault. The sharing system manages access permissions
                while the encryption stays intact.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Roles */}
      <section className="pb-12 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <div className="h-1 w-1 rounded-full bg-cyan-500" />
            Roles
          </h2>
          <div className="space-y-4">
            {roles.map((role) => (
              <div key={role.name} className="card p-5">
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded ${role.bg} ${role.color}`}
                  >
                    {role.name}
                  </span>
                </div>
                <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
                  {role.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Creating a vault */}
      <section className="pb-12 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <div className="h-1 w-1 rounded-full bg-cyan-500" />
            Creating a shared vault
          </h2>
          <div className="space-y-4">
            {[
              {
                step: "1",
                title: "Open Share",
                desc: "Click Share in the sidebar or navigate to /share.",
              },
              {
                step: "2",
                title: "Create a new vault",
                desc: "Click Create Vault. Give it a name and an optional description.",
              },
              {
                step: "3",
                title: "Add files",
                desc: "Select files from your existing vault to include in the shared vault.",
              },
              {
                step: "4",
                title: "Invite members",
                desc: "Enter the email addresses of the people you want to collaborate with. Choose a role for each member: viewer, editor, or admin.",
              },
            ].map((item) => (
              <div key={item.step} className="flex gap-4">
                <div className="flex-shrink-0 h-7 w-7 rounded-full bg-cyan-500/10 flex items-center justify-center">
                  <span className="text-xs font-bold text-cyan-600 dark:text-cyan-400">
                    {item.step}
                  </span>
                </div>
                <div>
                  <h3 className="text-sm font-bold mb-1">{item.title}</h3>
                  <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Details */}
      <section className="pb-24 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <div className="h-1 w-1 rounded-full bg-cyan-500" />
            Details
          </h2>
          <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
            {[
              {
                label: "Members",
                value: "Invited by email. Must have a zcrypt account.",
              },
              {
                label: "Files",
                value: "Selected from your existing vault. Encryption is unchanged.",
              },
              {
                label: "Ownership",
                value: "Only the vault creator can delete the vault.",
              },
              {
                label: "Permissions",
                value: "Viewer, Editor, or Admin. Owner can change roles anytime.",
              },
              {
                label: "Share links",
                value: "Individual files can also be shared via expiring links from the Share modal.",
              },
              {
                label: "Requires",
                value: "zcrypt account for both owner and members",
              },
            ].map((d, i) => (
              <div
                key={i}
                className={`flex items-start gap-4 px-4 py-3 text-sm ${
                  i !== 0 ? "border-t border-[var(--color-border)]" : ""
                }`}
              >
                <span className="flex-shrink-0 w-32 font-medium text-[var(--color-text-secondary)]">
                  {d.label}
                </span>
                <span className="text-[var(--color-text)]">{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Related */}
      <section className="py-16 px-4 bg-[var(--color-surface)]">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl font-bold mb-6">Related</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Link
              href="/docs/tools#send"
              className="card p-5 group hover:border-cyan-500/40 transition-colors"
            >
              <h3 className="text-sm font-bold mb-1 flex items-center gap-2">
                Send File
                <ArrowRight className="h-3 w-3 text-cyan-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </h3>
              <p className="text-sm text-[var(--color-text-secondary)]">
                Share a single file with an encrypted link. No account needed
                for the recipient.
              </p>
            </Link>
            <Link
              href="/docs/plans"
              className="card p-5 group hover:border-cyan-500/40 transition-colors"
            >
              <h3 className="text-sm font-bold mb-1 flex items-center gap-2">
                Plans and Limits
                <ArrowRight className="h-3 w-3 text-cyan-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </h3>
              <p className="text-sm text-[var(--color-text-secondary)]">
                Check storage quotas and sharing limits across Free, Plus, and
                Pro plans.
              </p>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
