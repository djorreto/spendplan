const CACHE_NAME = 'spendplan-static-v1'
const STATIC_ASSETS = [
  '/',
  '/offline',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-180.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key)
        })
      )
    ).then(() => self.clients.claim())
  )
})

function isApiRequest(url) {
  return url.includes('/api/') || url.includes('supabase.co') || url.includes('supabase.in')
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET
  if (request.method !== 'GET') return
  if (isApiRequest(url.href)) return

  // Navigation requests: Network first, fallback to cache/offline
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
          return response
        })
        .catch(async () => {
          const cached = await caches.match(request)
          if (cached) return cached
          return caches.match('/offline')
        })
    )
    return
  }

  // Static assets: Cache-first
  const accept = request.headers.get('accept') || ''
  const isAsset =
    accept.includes('image') ||
    accept.includes('text/css') ||
    accept.includes('application/javascript') ||
    accept.includes('font')

  if (isAsset || STATIC_ASSETS.some((p) => url.pathname.startsWith(p))) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request)
          .then((response) => {
            const copy = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
            return response
          })
          .catch(() => cached || Response.error())
      })
    )
  }
})

