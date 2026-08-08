// Single source of truth for the production domain. Every canonical URL,
// Open Graph tag, JSON-LD field, sitemap/robots entry, and @zcrypt.cloud
// address should import from here instead of hardcoding the literal, so a
// domain change is a one-line edit (or an env var) instead of a repo-wide find.
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://zcrypt.cloud";
export const SITE_DOMAIN = SITE_URL.replace(/^https?:\/\//, "");

export const SUPPORT_EMAIL = `support@${SITE_DOMAIN}`;
export const PRIVACY_EMAIL = `privacy@${SITE_DOMAIN}`;
export const LEGAL_EMAIL = `legal@${SITE_DOMAIN}`;
