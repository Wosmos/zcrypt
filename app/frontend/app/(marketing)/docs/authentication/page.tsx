import { pageMetadata } from "@/lib/page-metadata";
import { DocPage, DocSection, DocP, DocList, DocNote, DocTable } from "@/components/docs/doc-page";

import { T } from "@/components/i18n/t";
export const metadata = pageMetadata({
  title: "Authentication & 2FA · Docs",
  description:
    "How you sign in to zcrypt: email and password sign-up with breach checks, email verification, password reset, passwordless magic links, JWT sessions, and TOTP two-factor, and why your account password is not your vault passphrase.",
  path: "/docs/authentication",
  ogDescription:
    "Email/password sign-up, magic links, JWT sessions, and TOTP two-factor in zcrypt: plus the difference between your account password and your vault passphrase.",
});

const toc = [
  { id: "password-vs-passphrase", k: "docs.authentication.toc.password-vs-passphrase" },
  { id: "sign-up", k: "docs.authentication.toc.sign-up" },
  { id: "verification", k: "docs.authentication.toc.verification" },
  { id: "magic-link", k: "docs.authentication.toc.magic-link" },
  { id: "reset", k: "docs.authentication.toc.reset" },
  { id: "sessions", k: "docs.authentication.toc.sessions" },
  { id: "totp", k: "docs.authentication.toc.totp" },
  { id: "next", k: "docs.authentication.toc.next" },
];

export default function AuthenticationDocPage() {
  return (
    <DocPage
      href="/docs/authentication"
      title="Authentication & 2FA"
      description="Signing in proves who you are to the service. It is deliberately separate from the passphrase that encrypts your files, so the server can authenticate you without ever being able to read your data."
      toc={toc}
    >
      <DocSection id="password-vs-passphrase" title={<T k="docs.authentication.a6" />}>
        <DocP>
          <T k="docs.authentication.p1" />
        </DocP>
        <DocNote type="security" title={<T k="docs.authentication.a4" />}>
          <p className="mb-2">
            <T k="docs.authentication.p2" />
          </p>
          <p>
            <T
              k="docs.authentication.p3"
              links={{ l1: "/docs/recovery" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />
          </p>
        </DocNote>
        <DocP>
          <T
            k="docs.authentication.p5"
            links={{ l1: "/docs/key-management" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocP>
      </DocSection>

      <DocSection id="sign-up" title={<T k="docs.authentication.a15" />}>
        <DocP>
          <T k="docs.authentication.p7" />
        </DocP>
        <DocList
          items={[
            <T key="docs.authentication.p8" k="docs.authentication.p8" />,
            <T key="docs.authentication.p9" k="docs.authentication.p9" />,
            <T key="docs.authentication.p10" k="docs.authentication.p10" />,
            <T key="docs.authentication.p11" k="docs.authentication.p11" />,
            <T key="docs.authentication.p12" k="docs.authentication.p12" />,
          ]}
        />
        <DocP>
          <T k="docs.authentication.p13" />
        </DocP>
        <DocNote type="info">
          <T k="docs.authentication.p14" />
        </DocNote>
      </DocSection>

      <DocSection id="verification" title={<T k="docs.authentication.a17" />}>
        <DocP>
          <T k="docs.authentication.p16" />
        </DocP>
      </DocSection>

      <DocSection id="magic-link" title={<T k="docs.authentication.a20" />}>
        <DocP>
          <T k="docs.authentication.p18" />
        </DocP>
        <DocNote type="info">
          <T k="docs.authentication.p19" />
        </DocNote>
      </DocSection>

      <DocSection id="reset" title={<T k="docs.authentication.a26" />}>
        <DocP>
          <T k="docs.authentication.p21" />
        </DocP>
        <DocList
          items={[
            <T key="docs.authentication.p22" k="docs.authentication.p22" />,
            <T key="docs.authentication.p23" k="docs.authentication.p23" />,
          ]}
        />
        <DocNote type="warning" title={<T k="docs.authentication.a25" />}>
          <T k="docs.authentication.p24" />
        </DocNote>
      </DocSection>

      <DocSection id="sessions" title={<T k="docs.authentication.a40" />}>
        <DocP>
          <T k="docs.authentication.p27" />
        </DocP>
        <DocTable
          head={[
            <T key="docs.authentication.p28" k="docs.authentication.p28" />,
            <T key="docs.authentication.p29" k="docs.authentication.p29" />,
            <T key="docs.authentication.p30" k="docs.authentication.p30" />,
          ]}
          rows={[
            [
              <T key="docs.authentication.p31" k="docs.authentication.p31" />,
              <T key="docs.authentication.p32" k="docs.authentication.p32" />,
              <T key="docs.authentication.p33" k="docs.authentication.p33" />,
            ],
            [
              <T key="docs.authentication.p34" k="docs.authentication.p34" />,
              <T key="docs.authentication.p35" k="docs.authentication.p35" />,
              <T key="docs.authentication.p36" k="docs.authentication.p36" />,
            ],
          ]}
        />
        <DocP>
          <T k="docs.authentication.p37" />
        </DocP>
        <DocNote type="security" title={<T k="docs.authentication.a39" />}>
          <T k="docs.authentication.p38" />
        </DocNote>
      </DocSection>

      <DocSection id="totp" title={<T k="docs.authentication.a48" />}>
        <DocP>
          <T k="docs.authentication.p41" />
        </DocP>
        <DocList
          ordered
          items={[
            <T key="docs.authentication.p42" k="docs.authentication.p42" />,
            <T key="docs.authentication.p43" k="docs.authentication.p43" />,
            <T key="docs.authentication.p44" k="docs.authentication.p44" />,
          ]}
        />
        <DocP>
          <T k="docs.authentication.p45" />
        </DocP>
        <DocP>
          <T k="docs.authentication.p46" />
        </DocP>
        <DocNote type="info">
          <T k="docs.authentication.p47" />
        </DocNote>
      </DocSection>

      <DocSection id="next" title={<T k="docs.authentication.a52" />}>
        <DocList
          items={[
            <T
              key="docs.authentication.p49"
              k="docs.authentication.p49"
              links={{ l1: "/docs/oauth" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.authentication.p50"
              k="docs.authentication.p50"
              links={{ l1: "/docs/recovery" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.authentication.p51"
              k="docs.authentication.p51"
              links={{ l1: "/docs/key-management" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
