// artifacts.space service worker: browser notifications only. No caching and
// no fetch handler, so pages always come from the network. Registered only
// after a person turns on browser notifications in Settings.

const CHANGED = "artifacts:notifications-changed";

/** Only paths on this site open from a notification. */
function safeUrl(value) {
  try {
    const url = new URL(typeof value === "string" ? value : "/app", self.location.origin);
    return url.origin === self.location.origin ? url.href : new URL("/app", self.location.origin).href;
  } catch {
    return new URL("/app", self.location.origin).href;
  }
}

function readMessage(event) {
  try {
    const data = event.data ? event.data.json() : null;
    if (data && data.v === 1 && typeof data.title === "string") return data;
  } catch {
    // A message that is not JSON still shows a plain notification.
  }
  return { title: "artifacts.space", body: "You have a new notification.", url: "/app", tag: "notification" };
}

/** Tells open tabs to refresh their bell. */
async function tellTabs() {
  const tabs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const tab of tabs) tab.postMessage({ type: CHANGED });
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  const message = readMessage(event);
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(message.title, {
        body: typeof message.body === "string" ? message.body : "",
        tag: typeof message.tag === "string" ? message.tag : undefined,
        icon: "/artifacts-space-icon.png",
        data: { url: safeUrl(message.url) },
      }),
      tellTabs(),
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = safeUrl(event.notification.data && event.notification.data.url);
  event.waitUntil(
    (async () => {
      const tabs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const tab = tabs.find((client) => new URL(client.url).origin === self.location.origin);
      if (tab) {
        try {
          // navigate() works only on tabs this worker controls; others open a new window below.
          await tab.focus();
          await tab.navigate(url);
          return;
        } catch {
          // Fall through.
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
