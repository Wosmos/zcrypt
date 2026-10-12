import { pageMetadata } from "@/lib/page-metadata";
import { PageHero } from "@/components/marketing/ui/page-hero";
import { T } from "@/components/i18n/t";
import { Labelled } from "@/components/i18n/labelled";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";
import { ChangelogTimeline } from "@/components/marketing/changelog/timeline";
import { ChangelogCta } from "@/components/marketing/changelog/changelog-cta";
import { RssLink } from "@/components/marketing/changelog/rss-link";
import { RELEASES } from "@/lib/changelog";
import { SITE_URL } from "@/lib/site";

export const metadata = pageMetadata({
  title: "What's new in zcrypt: changelog",
  description:
    "Every zcrypt version in plain words: what is new, what got better, what we fixed and what changed for your security.",
  path: "/changelog",
  feedPath: "/changelog/feed.xml",
  ogTitle: "What's new in zcrypt",
  ogDescription: "Every zcrypt version in plain words, newest first.",
});

export default function ChangelogPage() {
  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "zcrypt", url: SITE_URL },
          { name: "Changelog", url: `${SITE_URL}/changelog` },
        ]}
      />
      <PageHero
        eyebrow={<T k="changelog.page.eyebrow" />}
        title={<T k="changelog.page.title" />}
        lede={<T k="changelog.page.lede" />}
        actions={<RssLink />}
      />
      <Labelled as="section" k="changelog.page.releasesLabel" className="pv2-sec pv2-sec-join">
        <div className="pv2-wrap pv2-wrap-narrow" style={{ maxWidth: "62rem" }}>
          <ChangelogTimeline releases={RELEASES} />
          <div className="mt-16">
            <ChangelogCta />
          </div>
        </div>
      </Labelled>
    </>
  );
}
