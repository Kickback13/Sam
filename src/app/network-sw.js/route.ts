/**
 * Service worker for the member app (registered with scope /n/<slug>/).
 * Network-first: pages always come fresh from the server (member data is
 * private and changes often); only when offline does it show a small notice.
 * Nothing private is cached.
 */
const SW = `
const OFFLINE = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title><body style="font-family:system-ui,sans-serif;padding:32px;text-align:center"><h1 style="font-size:20px">You\\'re offline</h1><p>Reconnect to see the latest posts and events.</p></body>';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
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
