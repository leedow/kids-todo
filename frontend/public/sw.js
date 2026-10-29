const CACHE = 'grow-shell-v1'
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(['/offline.html', '/offline.js', '/icon.svg'])),
  )
  self.skipWaiting()
})
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter((key) => key.startsWith('grow-shell-') && key !== CACHE)
          .map((key) => caches.delete(key)),
      )
      await self.clients.claim()
    })(),
  )
})
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (
    event.request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/admin') ||
    url.pathname.startsWith('/media')
  )
    return
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/offline.html')))
  } else if (
    url.pathname.startsWith('/assets/') ||
    ['/icon.svg', '/offline.js'].includes(url.pathname)
  ) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ||
          fetch(event.request).then((response) => {
            if (response.ok) {
              const copy = response.clone()
              caches.open(CACHE).then((cache) => cache.put(event.request, copy))
            }
            return response
          }),
      ),
    )
  }
})
