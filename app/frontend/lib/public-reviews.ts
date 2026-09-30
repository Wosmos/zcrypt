export interface PublicReview {
  display_name: string;
  rating: number;
  quote: string;
}

/** Fewer approved reviews than this and the landing page hides the section. */
export const MIN_PUBLIC_REVIEWS = 6;

/** Approved, consented reviews for the landing page. Empty when the API is unreachable. */
export async function fetchPublicReviews(): Promise<PublicReview[]> {
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (!base) return [];
  try {
    const res = await fetch(`${base}/api/reviews/public`, { next: { revalidate: 300 } });
    if (!res.ok) return [];
    const data = (await res.json()) as { reviews?: PublicReview[] };
    return Array.isArray(data.reviews) ? data.reviews : [];
  } catch {
    return [];
  }
}
