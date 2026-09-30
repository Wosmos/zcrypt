import { fetchPublicReviews, MIN_PUBLIC_REVIEWS } from "@/lib/public-reviews";
import { QuoteMarqueeView } from "./quote-marquee-view";

/** Approved, consented member reviews. Hidden until there are enough to fill two rows. */
export async function QuoteMarquee() {
  const reviews = await fetchPublicReviews();
  if (reviews.length < MIN_PUBLIC_REVIEWS) return null;
  const half = Math.ceil(reviews.length / 2);
  return <QuoteMarqueeView rowA={reviews.slice(0, half)} rowB={reviews.slice(half)} />;
}
