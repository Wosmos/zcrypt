import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Github,
  Globe,
  HardDrive,
  Check,
  Shield,
} from "@/lib/icons";

export const metadata: Metadata = {
  title: "Platform Adapters — zcrypt Docs",
  description:
    "Configure GitHub, GitLab, and Hugging Face as encrypted storage backends for zcrypt.",
};

const platforms = [
  {
    name: "GitHub",
    icon: Github,
    color: "text-slate-900 dark:text-white",
    bgColor: "bg-slate-900/10 dark:bg-white/10",
    tokenName: "Personal Access Token (classic)",
    tokenUrl: "https://github.com/settings/tokens",
    requiredScopes: ["repo (Full control of private repositories)"],
    storageLimit: "Recommended: ~850 MB per repository",
    notes:
      "zcrypt automatically creates and rotates repositories when they approach the size limit. Files are stored as binary blobs with randomized names. Private repositories only.",
    steps: [
      "Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)",
      "Click 'Generate new token (classic)'",
      "Give it a descriptive name like 'zcrypt-storage'",
      "Select the 'repo' scope (full control of private repositories)",
      "Generate the token and copy it",
      "In zcrypt, go to Settings → Platform Tokens → Add Token",
      "Select 'GitHub', paste your token, and save",
    ],
  },
  {
    name: "GitLab",
    icon: Globe,
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-500/10",
    tokenName: "Personal Access Token",
    tokenUrl: "https://gitlab.com/-/user_settings/personal_access_tokens",
    requiredScopes: [
      "api (Full API access)",
      "write_repository (Write access to repositories)",
    ],
    storageLimit: "Recommended: ~9 GB per repository",
    notes:
      "GitLab offers much larger repository limits than GitHub, making it ideal for users with large files. zcrypt uses the GitLab API for repository management and Git operations.",
    steps: [
      "Go to GitLab → Edit Profile → Access Tokens",
      "Click 'Add new token'",
      "Name it 'zcrypt-storage' and set an expiration date",
      "Select scopes: 'api' and 'write_repository'",
      "Create the token and copy it",
      "In zcrypt, go to Settings → Platform Tokens → Add Token",
      "Select 'GitLab', paste your token, and save",
    ],
  },
  {
    name: "Hugging Face",
    icon: HardDrive,
    color: "text-yellow-600 dark:text-yellow-400",
    bgColor: "bg-yellow-500/10",
    tokenName: "User Access Token",
    tokenUrl: "https://huggingface.co/settings/tokens",
    requiredScopes: ["write (Write access to your repos)"],
    storageLimit: "Recommended: ~280 GB per repository (Git LFS)",
    notes:
      "Hugging Face uses Git LFS for large file storage, giving it the highest per-repository capacity. Ideal for storing large encrypted backups. zcrypt creates private datasets for storage.",
    steps: [
      "Go to Hugging Face → Settings → Access Tokens",
      "Click 'New token'",
      "Name it 'zcrypt-storage'",
      "Select 'Write' permission",
      "Create the token and copy it",
      "In zcrypt, go to Settings → Platform Tokens → Add Token",
      "Select 'Hugging Face', paste your token, and save",
    ],
  },
];

export default function PlatformAdaptersPage() {
  return (
    <>
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
            Platform Adapters
          </h1>
          <p className="mt-3 text-lg text-[var(--color-text-secondary)] max-w-2xl leading-relaxed">
            zcrypt stores your encrypted files on Git-based platforms. Connect
            your own repositories for full control over your storage
            infrastructure.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className="pb-12 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="card p-6">
            <h2 className="text-sm font-bold mb-3 flex items-center gap-2">
              <Shield className="h-4 w-4 text-cyan-500" />
              How platform adapters work
            </h2>
            <div className="space-y-3 text-sm text-[var(--color-text-secondary)] leading-relaxed">
              <p>
                After your file is compressed, encrypted, and chunked locally,
                zcrypt pushes the encrypted chunks to Git repositories on your
                chosen platform. Each chunk is a binary blob — completely
                unreadable without your passphrase.
              </p>
              <p>
                Repository management is automatic: zcrypt creates private
                repositories, tracks available space, and rotates to new
                repositories when capacity limits are approached. Filenames and
                commit messages are randomized to prevent metadata leakage.
              </p>
              <p>
                Your platform token is encrypted at rest with AES-256-GCM using
                a server-side key-encryption key (KEK). Even in a database
                breach, tokens remain protected.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Platforms */}
      <section className="pb-24 px-4">
        <div className="max-w-3xl mx-auto space-y-10">
          {platforms.map((platform) => (
            <div
              key={platform.name}
              id={platform.name.toLowerCase().replace(/\s+/g, "-")}
              className="scroll-mt-24"
            >
              <div className="flex items-center gap-3 mb-5">
                <div
                  className={`h-10 w-10 rounded-xl ${platform.bgColor} flex items-center justify-center`}
                >
                  <platform.icon
                    className={`h-5 w-5 ${platform.color}`}
                  />
                </div>
                <div>
                  <h2 className="text-lg font-bold">{platform.name}</h2>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {platform.storageLimit}
                  </p>
                </div>
              </div>

              <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed mb-5">
                {platform.notes}
              </p>

              {/* Token info */}
              <div className="card p-5 mb-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-3">
                  Token requirements
                </h3>
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="text-xs font-semibold text-[var(--color-text-muted)] w-20 flex-shrink-0">
                      Type
                    </span>
                    <span className="text-sm font-medium">
                      {platform.tokenName}
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-xs font-semibold text-[var(--color-text-muted)] w-20 flex-shrink-0">
                      Scopes
                    </span>
                    <div className="space-y-1">
                      {platform.requiredScopes.map((scope) => (
                        <div
                          key={scope}
                          className="flex items-center gap-1.5"
                        >
                          <Check className="h-3 w-3 text-cyan-500 shrink-0" />
                          <code className="text-xs font-mono text-[var(--color-text-secondary)]">
                            {scope}
                          </code>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Setup steps */}
              <div className="space-y-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                  Setup steps
                </h3>
                {platform.steps.map((step, i) => (
                  <div key={i} className="flex gap-3">
                    <span className="flex-shrink-0 h-5 w-5 rounded-full bg-[var(--color-surface-2)] flex items-center justify-center text-[10px] font-bold text-[var(--color-text-muted)]">
                      {i + 1}
                    </span>
                    <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
                      {step}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Auto-rotation */}
      <section className="py-16 px-4 bg-[var(--color-surface)]">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl font-bold mb-4">
            Automatic Repository Rotation
          </h2>
          <div className="space-y-3 text-sm text-[var(--color-text-secondary)] leading-relaxed">
            <p>
              zcrypt monitors the storage usage of each repository. When a
              repository approaches its platform-specific size threshold,
              zcrypt automatically creates a new repository and begins storing
              new chunks there.
            </p>
            <p>
              Rotation thresholds are conservative to ensure reliability:
            </p>
          </div>
          <div className="mt-4 card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-1)]">
                  <th className="text-left px-4 py-2.5 text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
                    Platform
                  </th>
                  <th className="text-right px-4 py-2.5 text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
                    Rotation Threshold
                  </th>
                  <th className="text-right px-4 py-2.5 text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
                    Platform Limit
                  </th>
                </tr>
              </thead>
              <tbody>
                {[
                  { name: "GitHub", threshold: "850 MB", limit: "~1 GB" },
                  { name: "GitLab", threshold: "9 GB", limit: "10 GB" },
                  {
                    name: "Hugging Face",
                    threshold: "280 GB",
                    limit: "300 GB (LFS)",
                  },
                ].map((row) => (
                  <tr
                    key={row.name}
                    className="border-t border-[var(--color-border)]"
                  >
                    <td className="px-4 py-2.5 font-medium">{row.name}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs">
                      {row.threshold}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs text-[var(--color-text-muted)]">
                      {row.limit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Related */}
      <section className="py-16 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl font-bold mb-6">Related</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Link
              href="/docs/getting-started"
              className="card p-5 group hover:border-cyan-500/40 transition-colors"
            >
              <h3 className="text-sm font-bold mb-1 flex items-center gap-2">
                Getting Started
                <ArrowRight className="h-3 w-3 text-cyan-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </h3>
              <p className="text-sm text-[var(--color-text-secondary)]">
                Create your account and upload your first encrypted file.
              </p>
            </Link>
            <Link
              href="/docs/security"
              className="card p-5 group hover:border-cyan-500/40 transition-colors"
            >
              <h3 className="text-sm font-bold mb-1 flex items-center gap-2">
                Security Model
                <ArrowRight className="h-3 w-3 text-cyan-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </h3>
              <p className="text-sm text-[var(--color-text-secondary)]">
                How zcrypt encrypts your data and protects your tokens.
              </p>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
