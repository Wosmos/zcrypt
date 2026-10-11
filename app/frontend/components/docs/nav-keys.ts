export function navSlug(href: string): string {
  return (
    href
      .replace(/^\/docs\/?/, "")
      .replace(/^\//, "")
      .replace(/\//g, "-") || "index"
  );
}

export function groupSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/&/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
