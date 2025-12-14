import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SpendPlan',
    short_name: 'SpendPlan',
    start_url: '/',
    display: 'standalone',
    background_color: '#12b76a',
    theme_color: '#12b76a',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-180.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
    ],
  }
}

