import type { Metadata } from "next";
import { Reviews } from "@/components/admin/reviews";

export const metadata: Metadata = {
  title: "Admin · Reviews",
  description: "Moderate reviews before they appear on the website.",
};

export default function AdminReviewsPage() {
  return <Reviews />;
}
