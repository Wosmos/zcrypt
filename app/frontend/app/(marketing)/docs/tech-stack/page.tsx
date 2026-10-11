import type { Metadata } from "next";

import { DocPage, DocSection, DocP, DocTable, DocNote } from "@/components/docs/doc-page";
import { SITE_URL } from "@/lib/site";

import { T } from "@/components/i18n/t";
export const metadata: Metadata = {
  title: "Tech stack & infrastructure | zcrypt Docs",
  description:
    "The technology behind zcrypt: a Go standard-library backend, a shared Rust core for the native apps, a Next.js 16 + React 19 web app, PostgreSQL via pgx, and Tauri desktop/mobile shells: deployed on Vercel, a Docker-on-a-cloud-VM backend, and Neon serverless Postgres.",
  alternates: { canonical: `${SITE_URL}/docs/tech-stack` },
  openGraph: {
    title: "Tech stack & infrastructure | zcrypt Docs",
    description:
      "Languages, frameworks, and hosting behind zcrypt (Go, Rust, Next.js, PostgreSQL, Tauri) and how it's deployed.",
    url: `${SITE_URL}/docs/tech-stack`,
  },
};

const toc = [
  { id: "principles", k: "docs.tech-stack.toc.principles" },
  { id: "backend", k: "docs.tech-stack.toc.backend" },
  { id: "web", k: "docs.tech-stack.toc.web" },
  { id: "core", k: "docs.tech-stack.toc.core" },
  { id: "crypto", k: "docs.tech-stack.toc.crypto" },
  { id: "data", k: "docs.tech-stack.toc.data" },
  { id: "infra", k: "docs.tech-stack.toc.infra" },
  { id: "next", k: "docs.tech-stack.toc.next" },
];

export default function TechStackPage() {
  return (
    <DocPage
      href="/docs/tech-stack"
      title="Tech stack & infrastructure"
      description="Everything zcrypt is built with, layer by layer, and how each piece is deployed. Versions track the repository; the manifests (go.mod, package.json, Cargo.toml) are the source of truth."
      toc={toc}
    >
      <DocSection id="principles" title={<T k="docs.tech-stack.a4" />}>
        <DocP>
          <T k="docs.tech-stack.p1" />
        </DocP>
        <DocNote type="info" title={<T k="docs.tech-stack.a3" />}>
          <T k="docs.tech-stack.p2" />
        </DocNote>
      </DocSection>

      <DocSection id="backend" title={<T k="docs.tech-stack.a24" />}>
        <DocP>
          <T k="docs.tech-stack.p5" />
        </DocP>
        <DocTable
          head={[
            <T key="docs.tech-stack.p6" k="docs.tech-stack.p6" />,
            <T key="docs.tech-stack.p7" k="docs.tech-stack.p7" />,
            <T key="docs.tech-stack.p8" k="docs.tech-stack.p8" />,
          ]}
          rows={[
            [
              <T key="docs.tech-stack.p9" k="docs.tech-stack.p9" />,
              <T key="docs.tech-stack.p10" k="docs.tech-stack.p10" />,
              <T key="docs.tech-stack.p11" k="docs.tech-stack.p11" />,
            ],
            [
              <T key="docs.tech-stack.p12" k="docs.tech-stack.p12" />,
              <T key="docs.tech-stack.p13" k="docs.tech-stack.p13" />,
              <T key="docs.tech-stack.p14" k="docs.tech-stack.p14" />,
            ],
            [
              <T key="docs.tech-stack.p15" k="docs.tech-stack.p15" />,
              <T key="docs.tech-stack.p16" k="docs.tech-stack.p16" />,
              <T key="docs.tech-stack.p17" k="docs.tech-stack.p17" />,
            ],
            [
              <T key="docs.tech-stack.p18" k="docs.tech-stack.p18" />,
              <T key="docs.tech-stack.p19" k="docs.tech-stack.p19" />,
              <T key="docs.tech-stack.p20" k="docs.tech-stack.p20" />,
            ],
            [
              <T key="docs.tech-stack.p21" k="docs.tech-stack.p21" />,
              <T key="docs.tech-stack.p22" k="docs.tech-stack.p22" />,
              <T key="docs.tech-stack.p23" k="docs.tech-stack.p23" />,
            ],
          ]}
        />
      </DocSection>

      <DocSection id="web" title={<T k="docs.tech-stack.a42" />}>
        <DocP>
          <T k="docs.tech-stack.p25" />
        </DocP>
        <DocTable
          head={[
            <T key="docs.tech-stack.p26" k="docs.tech-stack.p26" />,
            <T key="docs.tech-stack.p27" k="docs.tech-stack.p27" />,
          ]}
          rows={[
            [
              <T key="docs.tech-stack.p28" k="docs.tech-stack.p28" />,
              <T key="docs.tech-stack.p29" k="docs.tech-stack.p29" />,
            ],
            [
              <T key="docs.tech-stack.p30" k="docs.tech-stack.p30" />,
              <T key="docs.tech-stack.p31" k="docs.tech-stack.p31" />,
            ],
            [
              <T key="docs.tech-stack.p32" k="docs.tech-stack.p32" />,
              <T key="docs.tech-stack.p33" k="docs.tech-stack.p33" />,
            ],
            [
              <T key="docs.tech-stack.p34" k="docs.tech-stack.p34" />,
              <T key="docs.tech-stack.p35" k="docs.tech-stack.p35" />,
            ],
            [
              <T key="docs.tech-stack.p36" k="docs.tech-stack.p36" />,
              <T key="docs.tech-stack.p37" k="docs.tech-stack.p37" />,
            ],
            [
              <T key="docs.tech-stack.p38" k="docs.tech-stack.p38" />,
              <T key="docs.tech-stack.p39" k="docs.tech-stack.p39" />,
            ],
            [
              <T key="docs.tech-stack.p40" k="docs.tech-stack.p40" />,
              <T key="docs.tech-stack.p41" k="docs.tech-stack.p41" />,
            ],
          ]}
        />
      </DocSection>

      <DocSection id="core" title={<T k="docs.tech-stack.a60" />}>
        <DocP>
          <T k="docs.tech-stack.p43" />
        </DocP>
        <DocTable
          head={[
            <T key="docs.tech-stack.p44" k="docs.tech-stack.p44" />,
            <T key="docs.tech-stack.p45" k="docs.tech-stack.p45" />,
            <T key="docs.tech-stack.p46" k="docs.tech-stack.p46" />,
          ]}
          rows={[
            [
              <T key="docs.tech-stack.p47" k="docs.tech-stack.p47" />,
              <T key="docs.tech-stack.p48" k="docs.tech-stack.p48" />,
              <T key="docs.tech-stack.p49" k="docs.tech-stack.p49" />,
            ],
            [
              <T key="docs.tech-stack.p50" k="docs.tech-stack.p50" />,
              <T key="docs.tech-stack.p51" k="docs.tech-stack.p51" />,
              <T key="docs.tech-stack.p52" k="docs.tech-stack.p52" />,
            ],
            [
              <T key="docs.tech-stack.p53" k="docs.tech-stack.p53" />,
              <T key="docs.tech-stack.p54" k="docs.tech-stack.p54" />,
              <T key="docs.tech-stack.p55" k="docs.tech-stack.p55" />,
            ],
            [
              <T key="docs.tech-stack.p56" k="docs.tech-stack.p56" />,
              <T key="docs.tech-stack.p57" k="docs.tech-stack.p57" />,
              <T key="docs.tech-stack.p58" k="docs.tech-stack.p58" />,
            ],
          ]}
        />
        <DocP>
          <T
            k="docs.tech-stack.p59"
            links={{ l1: "/docs/desktop-app", l2: "/docs/android-app" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocP>
      </DocSection>

      <DocSection id="crypto" title={<T k="docs.tech-stack.a75" />}>
        <DocP>
          <T k="docs.tech-stack.p61" />
        </DocP>
        <DocTable
          head={[
            <T key="docs.tech-stack.p62" k="docs.tech-stack.p62" />,
            <T key="docs.tech-stack.p63" k="docs.tech-stack.p63" />,
          ]}
          rows={[
            [
              <T key="docs.tech-stack.p64" k="docs.tech-stack.p64" />,
              <T key="docs.tech-stack.p65" k="docs.tech-stack.p65" />,
            ],
            [
              <T key="docs.tech-stack.p66" k="docs.tech-stack.p66" />,
              <T key="docs.tech-stack.p67" k="docs.tech-stack.p67" />,
            ],
            [
              <T key="docs.tech-stack.p68" k="docs.tech-stack.p68" />,
              <T key="docs.tech-stack.p69" k="docs.tech-stack.p69" />,
            ],
            [<T key="docs.tech-stack.p70" k="docs.tech-stack.p70" />, "HMAC-SHA256"],
            [
              <T key="docs.tech-stack.p71" k="docs.tech-stack.p71" />,
              <T key="docs.tech-stack.p72" k="docs.tech-stack.p72" />,
            ],
            [
              <T key="docs.tech-stack.p73" k="docs.tech-stack.p73" />,
              <T key="docs.tech-stack.p74" k="docs.tech-stack.p74" />,
            ],
          ]}
        />
      </DocSection>

      <DocSection id="data" title={<T k="docs.tech-stack.a85" />}>
        <DocP>
          <T k="docs.tech-stack.p76" />
        </DocP>
        <DocTable
          head={[
            <T key="docs.tech-stack.p77" k="docs.tech-stack.p77" />,
            <T key="docs.tech-stack.p78" k="docs.tech-stack.p78" />,
          ]}
          rows={[
            [
              <T key="docs.tech-stack.p79" k="docs.tech-stack.p79" />,
              <T key="docs.tech-stack.p80" k="docs.tech-stack.p80" />,
            ],
            [
              <T key="docs.tech-stack.p81" k="docs.tech-stack.p81" />,
              <T key="docs.tech-stack.p82" k="docs.tech-stack.p82" />,
            ],
            [
              <T key="docs.tech-stack.p83" k="docs.tech-stack.p83" />,
              <T key="docs.tech-stack.p84" k="docs.tech-stack.p84" />,
            ],
          ]}
        />
      </DocSection>

      <DocSection id="infra" title={<T k="docs.tech-stack.a99" />}>
        <DocP>
          <T
            k="docs.tech-stack.p86"
            links={{ l1: "/docs/self-hosting" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocP>
        <DocTable
          head={[
            <T key="docs.tech-stack.p87" k="docs.tech-stack.p87" />,
            <T key="docs.tech-stack.p88" k="docs.tech-stack.p88" />,
          ]}
          rows={[
            [
              <T key="docs.tech-stack.p89" k="docs.tech-stack.p89" />,
              <T key="docs.tech-stack.p90" k="docs.tech-stack.p90" />,
            ],
            [
              <T key="docs.tech-stack.p91" k="docs.tech-stack.p91" />,
              <T key="docs.tech-stack.p92" k="docs.tech-stack.p92" />,
            ],
            [
              <T key="docs.tech-stack.p93" k="docs.tech-stack.p93" />,
              <T key="docs.tech-stack.p94" k="docs.tech-stack.p94" />,
            ],
            [
              <T key="docs.tech-stack.p95" k="docs.tech-stack.p95" />,
              <T key="docs.tech-stack.p96" k="docs.tech-stack.p96" />,
            ],
          ]}
        />
        <DocNote type="security" title={<T k="docs.tech-stack.a98" />}>
          <T k="docs.tech-stack.p97" />
        </DocNote>
      </DocSection>

      <DocSection id="next" title={<T k="docs.tech-stack.a101" />}>
        <DocP>
          <T
            k="docs.tech-stack.p100"
            links={{ l1: "/docs/architecture", l2: "/docs/self-hosting", l3: "/docs/contributing" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocP>
      </DocSection>
    </DocPage>
  );
}
