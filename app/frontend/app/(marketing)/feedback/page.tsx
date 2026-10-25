import { Suspense } from "react";
import { pageMetadata } from "@/lib/page-metadata";
import { PageHero } from "@/components/marketing/ui/page-hero";
import { FeedbackForm } from "@/components/marketing/feedback/feedback-form";
import { T } from "@/components/i18n/t";

export const metadata = pageMetadata({
  title: "Feedback",
  description:
    "Found a bug, have an idea, or stopped using zcrypt? Tell the one person who builds it. No account needed, and every message gets read.",
  path: "/feedback",
  ogTitle: "Tell me what's not working | zcrypt",
  ogDescription: "A bug, an idea, or the reason you left. One person reads every message.",
});

export default function FeedbackPage() {
  return (
    <>
      <PageHero
        title={<T k="site.feedback.heroTitle" />}
        highlight={<T k="site.feedback.heroHighlight" />}
        lede={<T k="site.feedback.heroLede" />}
      />
      <section className="px-5 pb-8 sm:px-[50px]">
        <div className="mx-auto w-full max-w-xl">
          <Suspense fallback={null}>
            <FeedbackForm />
          </Suspense>
        </div>
      </section>
    </>
  );
}
