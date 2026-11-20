const TOKEN = process.env.NEXT_PUBLIC_CF_ANALYTICS_TOKEN;

/** Cloudflare Web Analytics: cookieless page views, only on the website. */
export function WebAnalytics() {
  if (!TOKEN || process.env.NEXT_PUBLIC_NATIVE_BUILD === "1") return null;
  return (
    <script
      defer
      src="https://static.cloudflareinsights.com/beacon.min.js"
      data-cf-beacon={JSON.stringify({ token: TOKEN })}
    />
  );
}
