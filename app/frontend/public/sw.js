self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("notificationclick", (event) => {
  const notification = event.notification;
  const data = notification.data || {};
  const action = event.action || data.click || "open";
  notification.close();

  const url = action === "view" && typeof data.url === "string" ? data.url : "/dashboard";

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const client = windows.find((c) => new URL(c.url).origin === self.location.origin);
      if (client) {
        await client.focus();
        client.postMessage({
          type: "zcrypt:notification",
          action,
          folderId: typeof data.folderId === "string" ? data.folderId : null,
        });
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
