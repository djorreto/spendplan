'use client'

import { useEffect, useState, useRef } from 'react'

const DISMISS_KEY = 'spendplan_install_dismissed_at'
const HIDE_MS = 7 * 24 * 60 * 60 * 1000

function isStandalone() {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone
}

export default function InstallPrompt() {
  const [visible, setVisible] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const deferredPrompt = useRef<any>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    setIsIOS(/iphone|ipad|ipod/i.test(window.navigator.userAgent))
    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0)
    if (Date.now() - dismissedAt < HIDE_MS) return
    if (isStandalone()) return

    const handler = (e: any) => {
      e.preventDefault()
      deferredPrompt.current = e
      setVisible(true)
    }

    window.addEventListener('beforeinstallprompt', handler as any)
    // Fallback for iOS: show once if not installed
    if (/iphone|ipad|ipod/i.test(window.navigator.userAgent)) {
      setVisible(true)
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handler as any)
    }
  }, [])

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, Date.now().toString())
    setVisible(false)
  }

  const install = async () => {
    const promptEvent = deferredPrompt.current
    if (!promptEvent) return dismiss()
    promptEvent.prompt()
    await promptEvent.userChoice
    dismiss()
  }

  if (!visible) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-xl border bg-card shadow-lg p-4 space-y-3 text-sm">
      <div className="font-medium">Instala SpendPlan</div>
      {isIOS ? (
        <p className="text-muted-foreground">
          En Safari: toca <strong>Compartir</strong> → <strong>Agregar a pantalla de inicio</strong>.
        </p>
      ) : (
        <p className="text-muted-foreground">Para usarla como app, instala SpendPlan en tu dispositivo.</p>
      )}
      <div className="flex gap-2 justify-end">
        <button
          onClick={dismiss}
          className="text-xs px-3 py-1 rounded-md border text-muted-foreground hover:bg-muted"
        >
          Ahora no
        </button>
        {!isIOS && (
          <button
            onClick={install}
            className="text-xs px-3 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Instalar
          </button>
        )}
      </div>
    </div>
  )
}

