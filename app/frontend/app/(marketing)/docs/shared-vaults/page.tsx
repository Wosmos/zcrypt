import type { Metadata } from "next";
import Link from "next/link";
import {
  DocPage,
  DocSection,
  DocP,
  DocList,
  DocNote,
  DocTable,
} from "@/components/docs/doc-page";

export const metadata: Metadata = {
  title: "Shared vaults | zcrypt Docs",
  description:
    "Collaborative vaults in zcrypt with viewer, editor, and admin roles. Membership and role management work today, but per-member key distribution is still being built, so members cannot yet decrypt shared files end-to-end.",
  alternates: { canonical: "https://zcrypt.cloud/docs/shared-vaults" },
  openGraph: {
    title: "Shared vaults | zcrypt Docs",
    description:
      "Collaborative vaults with role-based access — membership works, but end-to-end decryption for members is still in progress.",
    url: "https://zcrypt.cloud/docs/shared-vaults",
  },
};

const toc = [
  { id: "what", title: "What shared vaults are" },
  { id: "roles", title: "Roles" },
  { id: "members", title: "Managing members" },
  { id: "status", title: "Current status" },
  { id: "next", title: "Where to go next" },
];

export default function SharedVaultsDocPage() {
  return (
    <DocPage
      href="/docs/shared-vaults"
      title="Shared vaults"
      description="Collaborative spaces where a group can share a set of files under role-based access. The membership and permissions layer is in place; the cryptography that lets members decrypt shared files end-to-end is still being built."
      badge="Beta"
    >
      <DocSection id="what" title="What shared vaults are">
        <DocP>
          A shared vault is a vault owned by you but opened up to other zcrypt
          users. You create the vault, give it a name, and add members by their
          account email, each with a role that governs what they can do.
        </DocP>
      </DocSection>

      <DocSection id="roles" title="Roles">
        <DocP>Every member holds one of three roles:</DocP>
        <DocTable
          head={["Role", "Intended capability"]}
          rows={[
            [<strong key="v">Viewer</strong>, <>Read access to the vault&rsquo;s contents.</>],
            [<strong key="e">Editor</strong>, <>Read plus the ability to add and change files.</>],
            [
              <strong key="a">Admin</strong>,
              <>Manage the vault&rsquo;s membership — add and remove members.</>,
            ],
          ]}
        />
        <DocP>
          New members default to <strong>viewer</strong> unless you choose
          otherwise. Only admins can add or remove members, and only the owner
          can delete the vault.
        </DocP>
      </DocSection>

      <DocSection id="members" title="Managing members">
        <DocList
          items={[
            <>
              <strong>Add a member</strong> by email — the account must already
              exist on zcrypt.
            </>,
            <>
              <strong>Remove a member</strong> at any time (admins only).
            </>,
            <>
              <strong>Delete the vault</strong> entirely as the owner.
            </>,
          ]}
        />
      </DocSection>

      <DocSection id="status" title="Current status">
        <DocNote type="warning" title="Don't rely on this for real secrets yet">
          Membership and roles work today — you can create a shared vault, add
          and remove members, and assign roles. What is{" "}
          <strong>not finished</strong> is the cryptographic part: the per-member
          key distribution that would let each member decrypt shared files{" "}
          <strong>end-to-end</strong> is still being built. Until it lands,
          members <strong>cannot actually decrypt the shared files</strong>, so
          don&rsquo;t store anything sensitive in a shared vault expecting your
          collaborators to read it. Treat this as a preview of the collaboration
          model, not a finished feature.
        </DocNote>
      </DocSection>

      <DocSection id="next" title="Where to go next">
        <DocList
          items={[
            <Link key="a" href="/docs/sharing" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Share links — share a single file end-to-end today
            </Link>,
            <Link key="b" href="/docs/folder-encryption" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Per-folder encryption — give a folder its own password
            </Link>,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
