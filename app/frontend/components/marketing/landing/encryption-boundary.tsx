import { Key, Layers, Lock, Scissors, X } from "@/lib/icons";
import { ScrollReveal } from "./scroll-reveal";

// The single clearest way to convey zero-knowledge: show exactly where trust
// stops. Plaintext lives only on the device; only ciphertext crosses the line.

const deviceSteps = [
  {
    icon: Key,
    title: "Derive your key",
    desc: "PBKDF2-SHA256, 600,000 iterations — computed on your device from your passphrase. Never sent.",
  },
  {
    icon: Layers,
    title: "Compress",
    desc: "Shrunk with zstd before anything is encrypted.",
  },
  {
    icon: Lock,
    title: "Encrypt",
    desc: "AES-256-GCM with a random per-file key, sealed in your browser.",
  },
  {
    icon: Scissors,
    title: "Chunk & ship",
    desc: "Split into ~10 MB pieces and pushed to storage you own.",
  },
];

const neverLeaves = [
  "Your passphrase",
  "Your encryption keys",
  "Your plaintext files or filenames",
];

// Theme-aware subtle fill for nested insets — same trick the bento grid uses.
const inset = "border border-[var(--color-border)] bg-black/[0.02] dark:bg-white/[0.02]";

export function EncryptionBoundary() {
  return (
    <section className="py-24 sm:py-28 px-4 border-y border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="mx-auto max-w-6xl">
        <ScrollReveal className="mx-auto mb-14 max-w-2xl text-center sm:mb-16">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
            The boundary
          </p>
          <h2 className="text-3xl font-bold leading-[1.1] tracking-tight sm:text-4xl md:text-5xl">
            There&apos;s a line your files cross.
            <br />
            We&apos;re on the{" "}
            <em className="italic inline bg-gradient-to-r from-cyan-500 to-cyan-400 bg-clip-text pb-1 text-transparent dark:from-cyan-400 dark:to-cyan-300"> wrong side </em> of it.
          </h2>
          <p className="mx-auto mt-4 max-w-xl leading-relaxed text-[var(--color-text-secondary)]">
            Everything sensitive happens on your device. What crosses to our
            servers is already unreadable — no keys, no names, no plaintext.
          </p>
        </ScrollReveal>

        <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-[1fr_auto_1fr]">
          {/* YOUR DEVICE — trusted */}
          <ScrollReveal className="h-full">
            <div className="h-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] p-7 sm:p-9">
              <div className="mb-7 flex items-center justify-between">
                <span className="text-sm font-bold tracking-tight">Your device</span>
                <span className="inline-flex items-center rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
                  Trusted
                </span>
              </div>

              <ol className="space-y-3 list-none">
                {deviceSteps.map((step, i) => {
                  const Icon = step.icon;
                  return (
                    <li key={step.title} className={`flex gap-4 rounded-xl p-4 ${inset}`}>
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="font-mono text-[10px] font-bold text-[var(--color-text-muted)]">
                            0{i + 1}
                          </span>
                          <h3 className="text-sm font-bold tracking-tight">{step.title}</h3>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-secondary)]">
                          {step.desc}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          </ScrollReveal>

          {/* The boundary line + lock node */}
          <div className="relative flex items-center justify-center px-6 py-4 lg:flex-col lg:px-2 lg:py-0">
            <div className="absolute inset-y-0 hidden w-px bg-gradient-to-b from-transparent via-cyan-500/50 to-transparent lg:block" />
            <div className="absolute inset-x-0 block h-px bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent lg:hidden" />
            <div className="relative z-10 flex h-12 w-12 items-center justify-center rounded-full border border-cyan-500/30 bg-[var(--color-bg)] text-cyan-600 shadow-sm dark:text-cyan-400">
              <Lock className="h-5 w-5" />
            </div>
          </div>

          {/* WHAT OUR SERVERS SEE — ciphertext only */}
          <ScrollReveal delay={0.1} className="h-full">
            <div className="h-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] p-7 sm:p-9">
              <div className="mb-7 flex items-center justify-between">
                <span className="text-sm font-bold tracking-tight">What our servers see</span>
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] ${inset}`}>
                  Ciphertext only
                </span>
              </div>

              {/* Ciphertext blob */}
              <div className={`select-none break-all rounded-xl p-4 font-mono text-[11px] leading-relaxed text-[var(--color-text-muted)] ${inset}`}>
                <span className="text-cyan-600/80 dark:text-cyan-400/80">tar a4f9c1 0c77ae 3f5b</span>{" "}
                9f2a1c b8d40e 7c5b13 f0e2a9 4d1b6c 8e30dd 91ac0c 77ae3f 5b2a4f
                9c1e20 7b8d40 e7c5b1 3f0e2a 94d1b6 c8e30d
                <span className="text-cyan-600/80 dark:text-cyan-400/80"> 6b13fa f0e2 — sealed</span>
              </div>

              <p className="mb-3 mt-7 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                Never leaves your device
              </p>
              <ul className="space-y-2.5">
                {neverLeaves.map((item) => (
                  <li key={item} className="flex items-center gap-3">
                    <span className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[var(--color-text-muted)] ${inset}`}>
                      <X className="h-3 w-3" />
                    </span>
                    <span className="text-sm text-[var(--color-text-secondary)]">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </ScrollReveal>
        </div>

        <ScrollReveal delay={0.15}>
          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] p-5">
            <Lock className="mt-0.5 h-4 w-4 flex-shrink-0 text-cyan-500" />
            <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">
              <span className="font-semibold text-[var(--color-text)]">That&apos;s zero-knowledge.</span>{" "}
              Lose your passphrase and even we can&apos;t recover your files —
              there&apos;s nothing on our side to recover them from.
            </p>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
