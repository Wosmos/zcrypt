import type { Metadata } from "next";

import { SITE_URL } from "@/lib/site";
import {
  DocPage,
  DocSection,
  DocP,
  DocList,
  DocCode,
  DocNote,
  DocTable,
} from "@/components/docs/doc-page";

import { T } from "@/components/i18n/t";
export const metadata: Metadata = {
  title: "API reference | zcrypt Docs",
  description:
    "The zcrypt REST API: base URL, Bearer-JWT authentication, JSON request and response bodies, chunked upload and download, file and folder sharing, shared vaults and per-user keys, timed vaults, snapshots and integrity, offline pins, the encrypted clipboard, sync folders, the SSE event stream, and admin routes.",
  alternates: { canonical: `${SITE_URL}/docs/api` },
  openGraph: {
    title: "API reference | zcrypt Docs",
    description:
      "REST endpoints, Bearer-JWT auth, chunked upload/download, sharing, shared vaults, per-user keys, and the SSE event stream for zcrypt.",
    url: `${SITE_URL}/docs/api`,
  },
};

const toc = [
  { id: "basics", k: "docs.api.toc.basics" },
  { id: "auth", k: "docs.api.toc.auth" },
  { id: "files", k: "docs.api.toc.files" },
  { id: "upload", k: "docs.api.toc.upload" },
  { id: "download", k: "docs.api.toc.download" },
  { id: "sharing", k: "docs.api.toc.sharing" },
  { id: "folder-shares", k: "docs.api.toc.folder-shares" },
  { id: "spaces", k: "docs.api.toc.spaces" },
  { id: "keys", k: "docs.api.toc.keys" },
  { id: "send-pad", k: "docs.api.toc.send-pad" },
  { id: "vaults", k: "docs.api.toc.vaults" },
  { id: "snapshots", k: "docs.api.toc.snapshots" },
  { id: "devices", k: "docs.api.toc.devices" },
  { id: "sync", k: "docs.api.toc.sync" },
  { id: "events", k: "docs.api.toc.events" },
  { id: "config", k: "docs.api.toc.config" },
  { id: "admin", k: "docs.api.toc.admin" },
];

export default function ApiDocPage() {
  return (
    <DocPage
      href="/docs/api"
      title="API reference"
      description="zcrypt exposes a JSON REST API. Encryption happens on the client, so the API only ever moves opaque ciphertext, metadata, and chunks, never plaintext or keys."
      toc={toc}
    >
      <DocSection id="basics" title={<T k="docs.api.a7" />}>
        <DocList
          items={[
            <T key="docs.api.p1" k="docs.api.p1" />,
            <T key="docs.api.p2" k="docs.api.p2" />,
            <T key="docs.api.p3" k="docs.api.p3" />,
            <T key="docs.api.p4" k="docs.api.p4" />,
          ]}
        />
        <DocNote type="info" title={<T k="docs.api.a6" />}>
          <T k="docs.api.p5" />
        </DocNote>
      </DocSection>

      <DocSection id="auth" title={<T k="docs.api.a28" />}>
        <DocP>
          <T k="docs.api.p8" />
        </DocP>
        <DocCode label={<T k="docs.api.a10" />}>{`Authorization: Bearer <access-token>`}</DocCode>
        <DocP>
          <T k="docs.api.p11" />
        </DocP>
        <DocTable
          head={[
            <T key="docs.api.p12" k="docs.api.p12" />,
            <T key="docs.api.p13" k="docs.api.p13" />,
            <T key="docs.api.p14" k="docs.api.p14" />,
          ]}
          rows={[
            [
              "POST",
              <code key="p">/api/auth/register</code>,
              <T key="docs.api.p15" k="docs.api.p15" />,
            ],
            [
              "POST",
              <code key="p">/api/auth/login</code>,
              <T key="docs.api.p16" k="docs.api.p16" />,
            ],
            [
              "POST",
              <code key="p">/api/auth/refresh</code>,
              <T key="docs.api.p17" k="docs.api.p17" />,
            ],
            [
              "POST",
              <code key="p">/api/auth/logout</code>,
              <T key="docs.api.p18" k="docs.api.p18" />,
            ],
            [
              "POST",
              <code key="p">/api/auth/2fa/verify</code>,
              <T key="docs.api.p19" k="docs.api.p19" />,
            ],
            [
              "POST",
              <code key="p">/api/auth/2fa/setup</code>,
              <T key="docs.api.p20" k="docs.api.p20" />,
            ],
            [
              "POST",
              <code key="p">/api/auth/2fa/enable</code>,
              <T key="docs.api.p21" k="docs.api.p21" />,
            ],
            [
              "POST",
              <code key="p">/api/auth/forgot-password</code>,
              <T key="docs.api.p22" k="docs.api.p22" />,
            ],
            [
              "POST",
              <code key="p">/api/auth/reset-password</code>,
              <T key="docs.api.p23" k="docs.api.p23" />,
            ],
            [
              "POST",
              <code key="p">/api/auth/verify-email</code>,
              <T key="docs.api.p24" k="docs.api.p24" />,
            ],
            [
              "POST",
              <code key="p">/api/auth/magic-link</code>,
              <T key="docs.api.p25" k="docs.api.p25" />,
            ],
            ["GET", <code key="p">/api/auth/me</code>, <T key="docs.api.p26" k="docs.api.p26" />],
            [
              "GET",
              <code key="p">/api/auth/oauth/{`{provider}`}</code>,
              <T key="docs.api.p27" k="docs.api.p27" />,
            ],
          ]}
        />
      </DocSection>

      <DocSection id="files" title={<T k="docs.api.a46" />}>
        <DocP>
          <T k="docs.api.p29" />
        </DocP>
        <DocTable
          head={[
            <T key="docs.api.p30" k="docs.api.p30" />,
            <T key="docs.api.p31" k="docs.api.p31" />,
            <T key="docs.api.p32" k="docs.api.p32" />,
          ]}
          rows={[
            ["GET", <code key="p">/api/files</code>, <T key="docs.api.p33" k="docs.api.p33" />],
            [
              "GET",
              <code key="p">/api/files/trash</code>,
              <T key="docs.api.p34" k="docs.api.p34" />,
            ],
            [
              "DELETE",
              <code key="p">/api/files/{`{id}`}</code>,
              <T key="docs.api.p35" k="docs.api.p35" />,
            ],
            [
              "POST",
              <code key="p">/api/files/bulk-delete</code>,
              <T key="docs.api.p36" k="docs.api.p36" />,
            ],
            [
              "PATCH",
              <code key="p">/api/files/{`{id}`}/move</code>,
              <T key="docs.api.p37" k="docs.api.p37" />,
            ],
            [
              "POST",
              <code key="p">/api/files/{`{id}`}/restore</code>,
              <T key="docs.api.p38" k="docs.api.p38" />,
            ],
            [
              "DELETE",
              <code key="p">/api/files/{`{id}`}/purge</code>,
              <T key="docs.api.p39" k="docs.api.p39" />,
            ],
            ["GET", <code key="p">/api/folders</code>, <T key="docs.api.p40" k="docs.api.p40" />],
            ["POST", <code key="p">/api/folders</code>, <T key="docs.api.p41" k="docs.api.p41" />],
            [
              "PATCH",
              <code key="p">/api/folders/{`{id}`}</code>,
              <T key="docs.api.p42" k="docs.api.p42" />,
            ],
            [
              "PATCH",
              <code key="p">/api/folders/{`{id}`}/move</code>,
              <T key="docs.api.p43" k="docs.api.p43" />,
            ],
            [
              "POST",
              <code key="p">/api/folders/{`{id}`}/password</code>,
              <T key="docs.api.p44" k="docs.api.p44" />,
            ],
            [
              "DELETE",
              <code key="p">/api/folders/{`{id}`}</code>,
              <T key="docs.api.p45" k="docs.api.p45" />,
            ],
          ]}
        />
      </DocSection>

      <DocSection id="upload" title={<T k="docs.api.a60" />}>
        <DocP>
          <T k="docs.api.p47" />
        </DocP>
        <DocTable
          head={[
            <T key="docs.api.p48" k="docs.api.p48" />,
            <T key="docs.api.p49" k="docs.api.p49" />,
            <T key="docs.api.p50" k="docs.api.p50" />,
          ]}
          rows={[
            [
              "POST",
              <code key="p">/api/upload/init</code>,
              <T key="docs.api.p51" k="docs.api.p51" />,
            ],
            [
              "PUT",
              <code key="p">
                /api/upload/{`{sid}`}/chunk/{`{idx}`}
              </code>,
              <T key="docs.api.p52" k="docs.api.p52" />,
            ],
            [
              "POST",
              <code key="p">
                /api/upload/{`{sid}`}/presign/{`{idx}`}
              </code>,
              <T key="docs.api.p53" k="docs.api.p53" />,
            ],
            [
              "POST",
              <code key="p">
                /api/upload/{`{sid}`}/confirm/{`{idx}`}
              </code>,
              <T key="docs.api.p54" k="docs.api.p54" />,
            ],
            [
              "POST",
              <code key="p">/api/upload/{`{sid}`}/complete</code>,
              <T key="docs.api.p55" k="docs.api.p55" />,
            ],
            [
              "GET",
              <code key="p">/api/upload/{`{sid}`}/status</code>,
              <T key="docs.api.p56" k="docs.api.p56" />,
            ],
            [
              "DELETE",
              <code key="p">/api/upload/{`{sid}`}</code>,
              <T key="docs.api.p57" k="docs.api.p57" />,
            ],
          ]}
        />
        <DocNote type="info" title={<T k="docs.api.a59" />}>
          <T k="docs.api.p58" />
        </DocNote>
      </DocSection>

      <DocSection id="download" title={<T k="docs.api.a68" />}>
        <DocP>
          <T k="docs.api.p61" />
        </DocP>
        <DocTable
          head={[
            <T key="docs.api.p62" k="docs.api.p62" />,
            <T key="docs.api.p63" k="docs.api.p63" />,
            <T key="docs.api.p64" k="docs.api.p64" />,
          ]}
          rows={[
            [
              "GET",
              <code key="p">/api/files/{`{id}`}/meta</code>,
              <T key="docs.api.p65" k="docs.api.p65" />,
            ],
            [
              "POST",
              <code key="p">/api/files/meta</code>,
              <T key="docs.api.p66" k="docs.api.p66" />,
            ],
            [
              "GET",
              <code key="p">
                /api/files/{`{id}`}/chunks/{`{idx}`}
              </code>,
              <T key="docs.api.p67" k="docs.api.p67" />,
            ],
          ]}
        />
      </DocSection>

      <DocSection id="sharing" title={<T k="docs.api.a79" />}>
        <DocP>
          <T k="docs.api.p69" />
        </DocP>
        <DocTable
          head={[
            <T key="docs.api.p70" k="docs.api.p70" />,
            <T key="docs.api.p71" k="docs.api.p71" />,
            <T key="docs.api.p72" k="docs.api.p72" />,
          ]}
          rows={[
            ["POST", <code key="p">/api/shares</code>, <T key="docs.api.p73" k="docs.api.p73" />],
            ["GET", <code key="p">/api/shares</code>, <T key="docs.api.p74" k="docs.api.p74" />],
            [
              "DELETE",
              <code key="p">/api/shares/{`{id}`}</code>,
              <T key="docs.api.p75" k="docs.api.p75" />,
            ],
            [
              "GET",
              <code key="p">/api/share/{`{token}`}</code>,
              <T key="docs.api.p76" k="docs.api.p76" />,
            ],
            [
              "GET",
              <code key="p">/api/share/{`{token}`}/meta</code>,
              <T key="docs.api.p77" k="docs.api.p77" />,
            ],
            [
              "GET",
              <code key="p">
                /api/share/{`{token}`}/chunks/{`{idx}`}
              </code>,
              <T key="docs.api.p78" k="docs.api.p78" />,
            ],
          ]}
        />
      </DocSection>

      <DocSection id="folder-shares" title={<T k="docs.api.a90" />}>
        <DocP>
          <T k="docs.api.p80" />
        </DocP>
        <DocTable
          head={[
            <T key="docs.api.p81" k="docs.api.p81" />,
            <T key="docs.api.p82" k="docs.api.p82" />,
            <T key="docs.api.p83" k="docs.api.p83" />,
          ]}
          rows={[
            [
              "POST",
              <code key="p">/api/folder-shares</code>,
              <T key="docs.api.p84" k="docs.api.p84" />,
            ],
            [
              "GET",
              <code key="p">/api/folder-shares</code>,
              <T key="docs.api.p85" k="docs.api.p85" />,
            ],
            [
              "DELETE",
              <code key="p">/api/folder-shares/{`{id}`}</code>,
              <T key="docs.api.p86" k="docs.api.p86" />,
            ],
            [
              "GET",
              <code key="p">/api/folder-share/{`{token}`}</code>,
              <T key="docs.api.p87" k="docs.api.p87" />,
            ],
            [
              "GET",
              <code key="p">
                /api/folder-share/{`{token}`}/files/{`{fid}`}/meta
              </code>,
              <T key="docs.api.p88" k="docs.api.p88" />,
            ],
            [
              "GET",
              <code key="p">
                /api/folder-share/{`{token}`}/files/{`{fid}`}/chunks/{`{idx}`}
              </code>,
              <T key="docs.api.p89" k="docs.api.p89" />,
            ],
          ]}
        />
      </DocSection>

      <DocSection id="spaces" title={<T k="docs.api.a107" />}>
        <DocP>
          <T k="docs.api.p91" />
        </DocP>
        <DocTable
          head={[
            <T key="docs.api.p92" k="docs.api.p92" />,
            <T key="docs.api.p93" k="docs.api.p93" />,
            <T key="docs.api.p94" k="docs.api.p94" />,
          ]}
          rows={[
            [
              "GET",
              <code key="p">/api/shared-vaults</code>,
              <T key="docs.api.p95" k="docs.api.p95" />,
            ],
            [
              "POST",
              <code key="p">/api/shared-vaults</code>,
              <T key="docs.api.p96" k="docs.api.p96" />,
            ],
            [
              "GET",
              <code key="p">/api/shared-vaults/{`{id}`}</code>,
              <T key="docs.api.p97" k="docs.api.p97" />,
            ],
            [
              "DELETE",
              <code key="p">/api/shared-vaults/{`{id}`}</code>,
              <T key="docs.api.p98" k="docs.api.p98" />,
            ],
            [
              "POST",
              <code key="p">/api/shared-vaults/{`{id}`}/members</code>,
              <T key="docs.api.p99" k="docs.api.p99" />,
            ],
            [
              "DELETE",
              <code key="p">
                /api/shared-vaults/{`{id}`}/members/{`{uid}`}
              </code>,
              <T key="docs.api.p100" k="docs.api.p100" />,
            ],
            [
              "POST",
              <code key="p">/api/shared-vaults/{`{id}`}/files</code>,
              <T key="docs.api.p101" k="docs.api.p101" />,
            ],
            [
              "POST",
              <code key="p">/api/shared-vaults/{`{id}`}/files/batch</code>,
              <T key="docs.api.p102" k="docs.api.p102" />,
            ],
            [
              "DELETE",
              <code key="p">
                /api/shared-vaults/{`{id}`}/files/{`{fid}`}
              </code>,
              <T key="docs.api.p103" k="docs.api.p103" />,
            ],
            [
              "POST",
              <code key="p">/api/shared-vaults/{`{id}`}/rotate</code>,
              <T key="docs.api.p104" k="docs.api.p104" />,
            ],
          ]}
        />
        <DocNote type="security" title={<T k="docs.api.a106" />}>
          <T k="docs.api.p105" />
        </DocNote>
      </DocSection>

      <DocSection id="keys" title={<T k="docs.api.a116" />}>
        <DocP>
          <T k="docs.api.p108" />
        </DocP>
        <DocTable
          head={[
            <T key="docs.api.p109" k="docs.api.p109" />,
            <T key="docs.api.p110" k="docs.api.p110" />,
            <T key="docs.api.p111" k="docs.api.p111" />,
          ]}
          rows={[
            ["GET", <code key="p">/api/keys/me</code>, <T key="docs.api.p112" k="docs.api.p112" />],
            ["POST", <code key="p">/api/keys</code>, <T key="docs.api.p113" k="docs.api.p113" />],
            [
              "GET",
              <code key="p">/api/keys/lookup</code>,
              <T key="docs.api.p114" k="docs.api.p114" />,
            ],
            [
              "GET",
              <code key="p">/api/keys/user/{`{id}`}</code>,
              <T key="docs.api.p115" k="docs.api.p115" />,
            ],
          ]}
        />
      </DocSection>

      <DocSection id="send-pad" title={<T k="docs.api.a127" />}>
        <DocP>
          <T k="docs.api.p117" />
        </DocP>
        <DocTable
          head={[
            <T key="docs.api.p118" k="docs.api.p118" />,
            <T key="docs.api.p119" k="docs.api.p119" />,
            <T key="docs.api.p120" k="docs.api.p120" />,
          ]}
          rows={[
            [
              "POST",
              <code key="p">/api/send/init</code>,
              <T key="docs.api.p121" k="docs.api.p121" />,
            ],
            [
              "PUT",
              <code key="p">
                /api/send/{`{sid}`}/chunk/{`{idx}`}
              </code>,
              <T key="docs.api.p122" k="docs.api.p122" />,
            ],
            [
              "POST",
              <code key="p">/api/send/{`{sid}`}/complete</code>,
              <T key="docs.api.p123" k="docs.api.p123" />,
            ],
            [
              "GET",
              <code key="p">/api/send/{`{token}`}</code>,
              <T key="docs.api.p124" k="docs.api.p124" />,
            ],
            ["POST", <code key="p">/api/pad</code>, <T key="docs.api.p125" k="docs.api.p125" />],
            [
              "GET",
              <code key="p">/api/pad/{`{token}`}</code>,
              <T key="docs.api.p126" k="docs.api.p126" />,
            ],
          ]}
        />
      </DocSection>

      <DocSection id="vaults" title={<T k="docs.api.a136" />}>
        <DocP>
          <T k="docs.api.p128" />
        </DocP>
        <DocTable
          head={[
            <T key="docs.api.p129" k="docs.api.p129" />,
            <T key="docs.api.p130" k="docs.api.p130" />,
            <T key="docs.api.p131" k="docs.api.p131" />,
          ]}
          rows={[
            ["GET", <code key="p">/api/vaults</code>, <T key="docs.api.p132" k="docs.api.p132" />],
            ["POST", <code key="p">/api/vaults</code>, <T key="docs.api.p133" k="docs.api.p133" />],
            [
              "GET",
              <code key="p">/api/vaults/{`{id}`}</code>,
              <T key="docs.api.p134" k="docs.api.p134" />,
            ],
            [
              "DELETE",
              <code key="p">/api/vaults/{`{id}`}</code>,
              <T key="docs.api.p135" k="docs.api.p135" />,
            ],
          ]}
        />
      </DocSection>

      <DocSection id="snapshots" title={<T k="docs.api.a149" />}>
        <DocP>
          <T
            k="docs.api.p137"
            links={{ l1: "/docs/snapshots-integrity" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocP>
        <DocTable
          head={[
            <T key="docs.api.p138" k="docs.api.p138" />,
            <T key="docs.api.p139" k="docs.api.p139" />,
            <T key="docs.api.p140" k="docs.api.p140" />,
          ]}
          rows={[
            [
              "GET",
              <code key="p">/api/snapshots</code>,
              <T key="docs.api.p141" k="docs.api.p141" />,
            ],
            [
              "POST",
              <code key="p">/api/snapshots</code>,
              <T key="docs.api.p142" k="docs.api.p142" />,
            ],
            [
              "GET",
              <code key="p">/api/snapshots/{`{id}`}</code>,
              <T key="docs.api.p143" k="docs.api.p143" />,
            ],
            [
              "DELETE",
              <code key="p">/api/snapshots/{`{id}`}</code>,
              <T key="docs.api.p144" k="docs.api.p144" />,
            ],
            [
              "GET",
              <code key="p">/api/integrity</code>,
              <T key="docs.api.p145" k="docs.api.p145" />,
            ],
            [
              "POST",
              <code key="p">/api/integrity</code>,
              <T key="docs.api.p146" k="docs.api.p146" />,
            ],
            [
              "POST",
              <code key="p">/api/integrity/check</code>,
              <T key="docs.api.p147" k="docs.api.p147" />,
            ],
            [
              "GET",
              <code key="p">/api/integrity/changes</code>,
              <T key="docs.api.p148" k="docs.api.p148" />,
            ],
          ]}
        />
      </DocSection>

      <DocSection id="devices" title={<T k="docs.api.a161" />}>
        <DocP>
          <T k="docs.api.p150" />
        </DocP>
        <DocTable
          head={[
            <T key="docs.api.p151" k="docs.api.p151" />,
            <T key="docs.api.p152" k="docs.api.p152" />,
            <T key="docs.api.p153" k="docs.api.p153" />,
          ]}
          rows={[
            ["GET", <code key="p">/api/offline</code>, <T key="docs.api.p154" k="docs.api.p154" />],
            [
              "POST",
              <code key="p">/api/offline</code>,
              <T key="docs.api.p155" k="docs.api.p155" />,
            ],
            [
              "DELETE",
              <code key="p">/api/offline/{`{fileId}`}</code>,
              <T key="docs.api.p156" k="docs.api.p156" />,
            ],
            [
              "POST",
              <code key="p">/api/clipboard</code>,
              <T key="docs.api.p157" k="docs.api.p157" />,
            ],
            [
              "GET",
              <code key="p">/api/clipboard</code>,
              <T key="docs.api.p158" k="docs.api.p158" />,
            ],
            [
              "GET",
              <code key="p">/api/clipboard/{`{id}`}</code>,
              <T key="docs.api.p159" k="docs.api.p159" />,
            ],
            [
              "DELETE",
              <code key="p">/api/clipboard/{`{id}`}</code>,
              <T key="docs.api.p160" k="docs.api.p160" />,
            ],
          ]}
        />
      </DocSection>

      <DocSection id="sync" title={<T k="docs.api.a171" />}>
        <DocP>
          <T k="docs.api.p162" />
        </DocP>
        <DocTable
          head={[
            <T key="docs.api.p163" k="docs.api.p163" />,
            <T key="docs.api.p164" k="docs.api.p164" />,
            <T key="docs.api.p165" k="docs.api.p165" />,
          ]}
          rows={[
            [
              "GET",
              <code key="p">/api/sync/folders</code>,
              <T key="docs.api.p166" k="docs.api.p166" />,
            ],
            [
              "POST",
              <code key="p">/api/sync/folders</code>,
              <T key="docs.api.p167" k="docs.api.p167" />,
            ],
            [
              "PUT",
              <code key="p">/api/sync/folders/{`{id}`}</code>,
              <T key="docs.api.p168" k="docs.api.p168" />,
            ],
            [
              "PUT",
              <code key="p">/api/sync/folders/{`{id}`}/stats</code>,
              <T key="docs.api.p169" k="docs.api.p169" />,
            ],
            [
              "DELETE",
              <code key="p">/api/sync/folders/{`{id}`}</code>,
              <T key="docs.api.p170" k="docs.api.p170" />,
            ],
          ]}
        />
      </DocSection>

      <DocSection id="events" title={<T k="docs.api.a176" />}>
        <DocP>
          <T k="docs.api.p172" />
        </DocP>
        <DocCode
          label={<T k="docs.api.a174" />}
        >{`POST /api/sse/ticket            -> {"ticket": "..."}
GET  /api/events?ticket=<ticket>`}</DocCode>
        <DocP>
          <T k="docs.api.p175" />
        </DocP>
      </DocSection>

      <DocSection id="config" title={<T k="docs.api.a189" />}>
        <DocP>
          <T k="docs.api.p177" />
        </DocP>
        <DocTable
          head={[
            <T key="docs.api.p178" k="docs.api.p178" />,
            <T key="docs.api.p179" k="docs.api.p179" />,
            <T key="docs.api.p180" k="docs.api.p180" />,
          ]}
          rows={[
            ["GET", <code key="p">/api/quota</code>, <T key="docs.api.p181" k="docs.api.p181" />],
            ["GET", <code key="p">/api/config</code>, <T key="docs.api.p182" k="docs.api.p182" />],
            [
              "GET",
              <code key="p">/api/platforms/status</code>,
              <T key="docs.api.p183" k="docs.api.p183" />,
            ],
            [
              "POST",
              <code key="p">/api/platforms/connect</code>,
              <T key="docs.api.p184" k="docs.api.p184" />,
            ],
            [
              "DELETE",
              <code key="p">/api/platforms/disconnect</code>,
              <T key="docs.api.p185" k="docs.api.p185" />,
            ],
            ["GET", <code key="p">/api/repos</code>, <T key="docs.api.p186" k="docs.api.p186" />],
            ["GET", <code key="p">/api/plans</code>, <T key="docs.api.p187" k="docs.api.p187" />],
            ["GET", <code key="p">/api/health</code>, <T key="docs.api.p188" k="docs.api.p188" />],
          ]}
        />
      </DocSection>

      <DocSection id="admin" title={<T k="docs.api.a203" />}>
        <DocP>
          <T k="docs.api.p190" />
        </DocP>
        <DocTable
          head={[
            <T key="docs.api.p191" k="docs.api.p191" />,
            <T key="docs.api.p192" k="docs.api.p192" />,
            <T key="docs.api.p193" k="docs.api.p193" />,
          ]}
          rows={[
            [
              "GET",
              <code key="p">/api/admin/users</code>,
              <T key="docs.api.p194" k="docs.api.p194" />,
            ],
            [
              "GET",
              <code key="p">/api/admin/stats</code>,
              <T key="docs.api.p195" k="docs.api.p195" />,
            ],
            [
              "PUT",
              <code key="p">/api/admin/users/{`{id}`}/role</code>,
              <T key="docs.api.p196" k="docs.api.p196" />,
            ],
            [
              "PUT",
              <code key="p">/api/admin/users/{`{id}`}/plan</code>,
              <T key="docs.api.p197" k="docs.api.p197" />,
            ],
            [
              "PUT",
              <code key="p">/api/admin/users/{`{id}`}/quota</code>,
              <T key="docs.api.p198" k="docs.api.p198" />,
            ],
            [
              "DELETE",
              <code key="p">/api/admin/users/{`{id}`}</code>,
              <T key="docs.api.p199" k="docs.api.p199" />,
            ],
            [
              "GET",
              <code key="p">/api/admin/tokens</code>,
              <T key="docs.api.p200" k="docs.api.p200" />,
            ],
            [
              "GET",
              <code key="p">/api/admin/audit</code>,
              <T key="docs.api.p201" k="docs.api.p201" />,
            ],
          ]}
        />
        <DocP>
          <T
            k="docs.api.p202"
            links={{ l1: "/docs/self-hosting", l2: "/docs/architecture" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocP>
      </DocSection>
    </DocPage>
  );
}
