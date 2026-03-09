// Returning null prevents skeleton flicker during navigation.
// The current page stays visible via React transitions until
// the new page is ready. Data is prefetched during auth init.
export default function DashboardLoading() {
  return null;
}
