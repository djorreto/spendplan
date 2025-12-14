'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { Profile } from '@/types'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'

const REMINDER_INTERVAL_MS = 14 * 24 * 60 * 60 * 1000

function shouldShow(profile: Profile | null) {
  if (!profile) return false
  if (profile.telegram_connected) return false
  const dismissed = profile.telegram_reminder_dismissed_at
  if (!dismissed) return true
  const last = new Date(dismissed).getTime()
  return Date.now() - last > REMINDER_INTERVAL_MS
}

export function TelegramReminder({ profile }: { profile: Profile | null }) {
  const { updateProfile } = useAuth()
  const [saving, setSaving] = useState(false)

  const show = useMemo(() => shouldShow(profile), [profile])
  if (!show) return null

  const dismiss = async () => {
    setSaving(true)
    await updateProfile({ telegram_reminder_dismissed_at: new Date().toISOString() })
    setSaving(false)
  }

  return (
    <div className="rounded-xl border bg-card shadow-sm p-4 sm:p-5 mb-3 sm:mb-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-medium">Registra gastos en segundos conectando Telegram.</p>
          <p className="text-xs text-muted-foreground">
            Envía un mensaje o foto y SpendPlan lo registra por ti.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/app/settings#telegram">
            <Button size="sm">Conectar Telegram</Button>
          </Link>
          <Button size="sm" variant="outline" onClick={dismiss} disabled={saving}>
            Ahora no
          </Button>
        </div>
      </div>
    </div>
  )
}

