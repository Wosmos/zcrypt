import Link from "next/link";
import { faqs } from "@/lib/data";
import { SectionHead } from "../section-head";

/** Ten plain questions, ten plain answers. */
export function Faq() {
  return (
    <section id="faq" className="pv2-sec zs-cv" aria-labelledby="h-faq">
      <div className="pv2-wrap zs-faq">
        <div className="zs-faq-l">
          <SectionHead
            id="h-faq"
            eyebrow="Questions"
            title="Straight answers"
            lede={
              <>
                If something&apos;s missing,{" "}
                <Link href="/docs" className="zs-link">
                  the docs
                </Link>{" "}
                have the long version.
              </>
            }
            align="left"
          />
        </div>
        <div className="zs-faq-r">
          {faqs.map((f) => (
            <details key={f.q} className="zs-dt" data-owner-confirm={f.flag}>
              <summary className="zs-sum">
                <span>{f.q}</span>
                <span className="zs-pm" aria-hidden="true" />
              </summary>
              <div className="zs-ans">
                <p>{f.a}</p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
