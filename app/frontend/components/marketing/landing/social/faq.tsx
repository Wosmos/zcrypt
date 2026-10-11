import { T } from "@/components/i18n/t";
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
            eyebrow={<T k="site.home.faq.eyebrow" />}
            title={<T k="site.home.faq.title" />}
            lede={<T k="site.home.faq.lede" links={{ docs: "/docs" }} linkClassName="zs-link" />}
            align="left"
          />
        </div>
        <div className="zs-faq-r">
          {faqs.map((f, i) => (
            <details key={f.q} className="zs-dt" data-owner-confirm={f.flag}>
              <summary className="zs-sum">
                <span>
                  <T k={`site.home.faq.items.${i}.q`} />
                </span>
                <span className="zs-pm" aria-hidden="true" />
              </summary>
              <div className="zs-ans">
                <p>
                  <T k={`site.home.faq.items.${i}.a`} />
                </p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
