/**
 * Service worker for the member app (registered with scope /n/<slug>/).
 * Network-first: pages always come fresh from the server (member data is
 * private and changes often); only when offline does it show a small notice.
 * Nothing private is cached. Shows push notifications for team posts and events
 * (ADR-041); a click opens the post inside the app.
 */
const SW = `
const OFFLINE = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title><body style="font-family:system-ui,sans-serif;padding:32px;text-align:center"><h1 style="font-size:20px">You\\'re offline</h1><p>Reconnect to see the latest posts and events.</p></body>';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}
  const title = typeof data.title === 'string' ? data.title : 'New post';
  event.waitUntil(self.registration.showNotification(title, {
    body: typeof data.body === 'string' ? data.body : '',
    tag: typeof data.tag === 'string' ? data.tag : undefined,
    data: { url: typeof data.url === 'string' && data.url.startsWith('/n/') ? data.url : self.registration.scope },
    icon: self.registration.scope + 'icon/192',
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || self.registration.scope;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if (c.url.includes(url) && 'focus' in c) return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(
    fetch(event.request).catch(() => new Response(OFFLINE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }))
  );
});
`;

export function GET() {
  return new Response(SW, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache",
      "Service-Worker-Allowed": "/n/",
    },
  });
}
