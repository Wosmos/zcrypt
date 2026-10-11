// Single source of truth for the production domain. Every canonical URL,
// Open Graph tag, JSON-LD field and sitemap/robots entry should import from
// here instead of hardcoding the literal, so a domain change is a one-line
// edit (or an env var) instead of a repo-wide find.
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://zcrypt.cloud";
export const SITE_DOMAIN = SITE_URL.replace(/^https?:\/\//, "");

// One real inbox for now; the @zcrypt.cloud addresses don't exist yet.
export const CONTACT_EMAIL = "m.wasifmalik17@gmail.com";
export const SUPPORT_EMAIL = CONTACT_EMAIL;
export const PRIVACY_EMAIL = CONTACT_EMAIL;
export const LEGAL_EMAIL = CONTACT_EMAIL;
