'use client'

import { useEffect } from 'react'

export default function PwaProvider() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .catch((err) => console.error('SW registration failed', err))
    })
  }, [])

  return null
}

