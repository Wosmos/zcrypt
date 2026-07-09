import type { Metadata } from "next";
import Link from "next/link";
import {
  DocPage,
  DocSection,
  DocSubsection,
  DocP,
  DocList,
  DocCode,
  DocNote,
  DocTable,
} from "@/components/docs/doc-page";

export const metadata: Metadata = {
  title: "Shared vaults | zcrypt Docs",
  description:
    "Shared vaults (spaces) let you collaborate on end-to-end encrypted files with people you name. Each space has its own key, sealed to every member's public key with ECIES so the server never sees it; files are re-wrapped under the space key, members are verified by key fingerprint, and removing someone rotates the key for true revocation.",
  alternates: { canonical: "https://zcrypt.cloud/docs/shared-vaults" },
  openGraph: {
    title: "Shared vaults | zcrypt Docs",
    description:
      "Collaborate on end-to-end encrypted files: per-member sealed key grants, CEK re-wrapping under a space key, fingerprint verification, and true revocation via key rotation.",
    url: "https://zcrypt.cloud/docs/shared-vaults",
  },
};

const toc = [
  { id: "what", title: "What shared vaults are" },
  { id: "crypto", title: "How the encryption works" },
  { id: "roles", title: "Roles" },
  { id: "members", title: "Inviting & verifying members" },
  { id: "files", title: "Sharing & downloading files" },
  { id: "revocation", title: "Removing members & re-keying" },
  { id: "status", title: "Maturity" },
  { id: "next", title: "Where to go next" },
];

export default function SharedVaultsDocPage() {
  return (
    <DocPage
      href="/docs/shared-vaults"
      title="Shared vaults"
      description="Shared vaults — spaces — let a group work on the same set of end-to-end encrypted files. Each space carries its own key, sealed to every member so only members can open its files, and the server only ever holds ciphertext it cannot read."
      badge="Beta"
      toc={toc}
    >
      <DocSection id="what" title="What shared vaults are">
        <DocP>
          A shared vault, or <strong>space</strong>, is a vault you own but open
          up to other zcrypt users. You give it a name, invite members by their
          account email, and add files. Every member can download the space&rsquo;s
          files and decrypt them <strong>end-to-end</strong> — without ever
          learning your vault passphrase and without the server being able to read
          anything.
        </DocP>
        <DocP>
          The trick is that a space has its <strong>own key</strong>: a random
          256-bit key generated in your browser when you create the space. That
          key is what unlocks the space&rsquo;s files, and it is handed to each
          member in a form only that member can open. The server stores the
          sealed grants and the wrapped file keys but can never combine them into
          anything readable.
        </DocP>
        <DocNote type="security" title="What the server can and cannot see">
          The server holds only opaque ciphertext for a space: the per-member{" "}
          <em>sealed</em> space-key grants, the file keys <em>wrapped</em> under
          the space key, and members&rsquo; public keys and fingerprints. It{" "}
          <strong>never</strong> sees the space key, any member&rsquo;s private
          key, file contents, or any vault passphrase — every unseal, unwrap, and
          decrypt happens in the browser.
        </DocNote>
      </DocSection>

      <DocSection id="crypto" title="How the encryption works">
        <DocP>
          Three layers of keys make a space work. Understanding them explains
          exactly why the server can host a shared vault without being able to
          read it.
        </DocP>

        <DocSubsection title="1. Your encryption keypair (per user)">
          <DocP>
            Before you can join or run a space, your account needs an{" "}
            <strong>X25519 keypair</strong>. It&rsquo;s generated in your browser
            the first time you unlock your vault after sharing ships. Your{" "}
            <strong>private key is wrapped under your passphrase-derived key</strong>{" "}
            (PBKDF2 &rarr; AES-256-GCM) before it&rsquo;s stored, so the server
            only ever holds ciphertext for it. Your <strong>public key</strong>{" "}
            and a short fingerprint are stored in the clear so others can seal
            things to you.
          </DocP>
        </DocSubsection>

        <DocSubsection title="2. The space key (per space)">
          <DocP>
            When you create a space, your browser generates a fresh random
            256-bit <strong>space key</strong>. For every member — including you —
            that key is <strong>sealed to their X25519 public key</strong> using
            an ECIES sealed box: an ephemeral X25519 keypair does ECDH with the
            recipient, the shared secret is hashed into an AES-256-GCM key, and
            the ephemeral public key rides along so the recipient can reconstruct
            it. Only the holder of the matching private key can open it — the
            server cannot, because it never has any private key.
          </DocP>
          <DocCode label="Per-member sealed space-key grant (base64)">
{`ephemeralPublicKey[32]  ||  AES-256-GCM( 12B IV || ciphertext || 16B tag )`}
          </DocCode>
          <DocP>
            An opened space key is cached in memory for the session only — it is
            never written to disk and is cleared on logout.
          </DocP>
        </DocSubsection>

        <DocSubsection title="3. The file keys (per file)">
          <DocP>
            Each file already has its own content-encryption key (CEK). To share
            a file into a space, your browser unwraps that CEK with your vault
            passphrase, then <strong>re-wraps it under the space key</strong> and
            uploads only the opaque envelope. Any member downloads the file by
            unwrapping that envelope with the space key — no owner passphrase
            involved. The file&rsquo;s chunks in storage never change; only a new
            wrapped copy of its key is added.
          </DocP>
        </DocSubsection>
      </DocSection>

      <DocSection id="roles" title="Roles">
        <DocP>Every member holds one of three roles:</DocP>
        <DocTable
          head={["Role", "Capability"]}
          rows={[
            [
              <strong key="v">Viewer</strong>,
              <>Download and decrypt the space&rsquo;s files.</>,
            ],
            [
              <strong key="e">Editor</strong>,
              <>
                Download, plus add files (ones they own) and remove files from
                the space.
              </>,
            ],
            [
              <strong key="a">Admin</strong>,
              <>
                The same file capabilities as an editor today. Managing
                membership and keys stays with the owner.
              </>,
            ],
          ]}
        />
        <DocP>
          New members default to <strong>viewer</strong> unless you choose
          otherwise. A few actions are reserved for the <strong>owner</strong>{" "}
          regardless of anyone&rsquo;s role: <strong>inviting and removing
          members</strong>, <strong>re-keying</strong> the space, and{" "}
          <strong>deleting</strong> it. This owner-gating is deliberate — it
          keeps a member from re-granting keys or locking others out.
        </DocP>
        <DocNote type="info" title="Adding a file requires owning it">
          You can only share a file you own, because sharing it means unwrapping
          its key with your own vault passphrase before re-wrapping it under the
          space key. Editors and admins can add files they own and remove any
          file from the space; viewers can only download.
        </DocNote>
      </DocSection>

      <DocSection id="members" title="Inviting & verifying members">
        <DocList
          items={[
            <>
              <strong>Invite by email</strong> — the account must already exist
              on zcrypt <em>and</em> have set up its encryption key (the person
              needs to have signed in and unlocked their vault at least once). If
              they haven&rsquo;t, the invite is rejected until they do, because
              there&rsquo;s no public key to seal the space key to.
            </>,
            <>
              <strong>Pick a role</strong> when inviting — viewer, editor, or
              admin. Re-inviting an existing member updates their role and
              re-issues their key grant.
            </>,
            <>
              <strong>Remove a member</strong> at any time as the owner (this
              also rotates the space key — see below).
            </>,
            <>
              <strong>Delete the space</strong> as the owner. The underlying
              files stay in each owner&rsquo;s vault; only the sharing is torn
              down.
            </>,
          ]}
        />
        <DocNote type="security" title="Verify fingerprints out of band">
          Each member is shown with the <strong>fingerprint</strong> of their
          public key — the first 16 hex characters of its SHA-256, grouped like{" "}
          <code>A1B2-C3D4-E5F6-7890</code>. Compare that against the fingerprint
          the member sees in their own encryption-key settings, over a channel
          the server doesn&rsquo;t control (in person, a call, a signed message).
          Matching fingerprints rule out a server that tried to swap in its own
          key to eavesdrop. If a member hasn&rsquo;t published a key yet, no
          fingerprint is shown and you can&rsquo;t grant them access.
        </DocNote>
      </DocSection>

      <DocSection id="files" title="Sharing & downloading files">
        <DocList
          items={[
            <>
              <strong>Add files</strong> (owner, editor, admin) — pick files or
              whole folders from your vault. Each one&rsquo;s key is re-wrapped
              under the space key in your browser; the server stores only the
              re-wrapped envelope.
            </>,
            <>
              <strong>Download</strong> (any member) — the space key unwraps the
              file&rsquo;s envelope and the chunks are decrypted locally. Access
              is authorised through your membership without ever loosening the
              owner&rsquo;s file scoping; an unauthorised request is
              indistinguishable from a plain not-found.
            </>,
            <>
              <strong>Remove files</strong> (editor, admin) — unshares the file
              from the space. The original file is untouched in the
              owner&rsquo;s vault.
            </>,
          ]}
        />
        <DocP>
          A space can carry an optional <strong>size limit</strong>, set when you
          create it. It caps the total original size of the files shared into the
          space and is <strong>enforced on the server</strong> when a file is
          added — adds that would exceed the cap are rejected. Re-adds during a
          re-key don&rsquo;t count twice, so rotation never trips the limit.
          Leave it blank for no limit.
        </DocP>
      </DocSection>

      <DocSection id="revocation" title="Removing members & re-keying">
        <DocP>
          Removing a member has to be more than deleting a database row — that
          member may have already opened the space key in their browser. So
          removal triggers a <strong>re-key</strong>: your browser generates a
          brand-new space key, seals it to every <em>remaining</em> member, and
          re-wraps <strong>every shared file&rsquo;s key</strong> under the new
          key. The removed member gets no new grant, and because every file now
          answers to a new key, any copy of the old key they kept is useless
          going forward. This is what makes removal a <strong>true
          revocation</strong>, not just a hidden button.
        </DocP>
        <DocList
          items={[
            <>
              <strong>Automatic on removal</strong> — the re-key runs right after
              you remove someone. If it doesn&rsquo;t complete (for example, the
              space wasn&rsquo;t unlocked), you&rsquo;re told to finish it with
              the manual Re-key.
            </>,
            <>
              <strong>Manual Re-key</strong> — the owner can rotate the space key
              at any time from the members panel, to rotate periodically or to
              complete an interrupted revocation.
            </>,
            <>
              <strong>Owner-gated</strong> — only the owner can re-key. A re-key
              hands out fresh grants to everyone, so it&rsquo;s deliberately kept
              out of non-owner hands.
            </>,
          ]}
        />
        <DocNote type="info" title="Anti-lockout: all-or-nothing rotation">
          A re-key is applied atomically and must supply a fresh grant for{" "}
          <strong>every current member</strong>. The server rejects a partial
          rotation, so files can never be moved onto a new key while a member is
          left stranded on the old one. Re-keying needs the space to be unlocked,
          since your browser uses the old key to re-wrap the files under the new
          one.
        </DocNote>
        <DocNote type="warning" title="Revocation is forward-looking">
          Rotating the key stops a removed member from opening the space&rsquo;s
          files from that point on. Like any sharing system, it can&rsquo;t
          recall data they already downloaded — plaintext that has left the space
          is beyond its reach.
        </DocNote>
      </DocSection>

      <DocSection id="status" title="Maturity">
        <DocNote type="info" title="Shared vaults are in beta">
          End-to-end sharing works today: sealed per-member key grants, file-key
          re-wrapping, fingerprint verification, and revocation-by-rotation all
          ship. It&rsquo;s marked beta because the workflows and surfaces around
          it are still evolving. Every member needs their encryption keypair set
          up before they can be granted access, and sharing or re-keying requires
          the relevant vault or space to be unlocked in your session.
        </DocNote>
      </DocSection>

      <DocSection id="next" title="Where to go next">
        <DocList
          items={[
            <Link key="a" href="/docs/key-management" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Passphrase &amp; key management — your encryption keypair and fingerprint
            </Link>,
            <Link key="b" href="/docs/sharing" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Share links — share a single file end-to-end without an account
            </Link>,
            <Link key="c" href="/docs/zero-knowledge" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Zero-knowledge — the model these guarantees rest on
            </Link>,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
