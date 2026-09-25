import { LiveCipher } from "../preview/live-cipher";
import { TiltCard } from "../preview/tilt-card";

/**
 * The live encryptor, in the one place it belongs: sharing.
 *
 * On the rest of the page encryption is a promise. Here it is a thing you do.
 * A visitor types a sentence and watches what a server would hold. It sits
 * under the share feature because that is the moment people actually ask
 * "but then how does the other person open it".
 */
export function ShareCipher() {
  return (
    <section className="px-4 py-24 sm:px-6 sm:py-28" id="share">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:items-end">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--color-accent)]">
              Share it
            </p>
            <h2 className="font-heading mt-3 text-3xl font-bold tracking-tight text-[var(--color-text)] sm:text-5xl">
              Send a file to someone who has no account.
            </h2>
            <p className="mt-5 max-w-[52ch] leading-relaxed text-[var(--color-text-secondary)]">
              A share link carries the key with it, not with us. The person opening it decrypts on
              their own device, the same way you encrypted on yours. The server in the middle only
              ever sees what you see on the right.
            </p>
          </div>
          <TiltCard className="vault-slab p-1">
            <LiveCipher />
          </TiltCard>
        </div>
      </div>
    </section>
  );
}
