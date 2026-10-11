import type { ComponentProps, ReactNode } from "react";
import { RelatedLinks } from "@/components/marketing/features/related-links";
import { ClosingCta } from "@/components/marketing/landing/closing-cta";

/** The related-pages strip and closing call to action that end every features/* page. */
export function FeatureFooter({
  related,
  cta,
}: {
  related: ComponentProps<typeof RelatedLinks>["items"];
  cta: { heading: ReactNode; subtext: ReactNode };
}) {
  return (
    <>
      <RelatedLinks items={related} />
      <ClosingCta title={cta.heading} subtext={cta.subtext} />
    </>
  );
}
