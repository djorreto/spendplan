'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/use-auth'
import { useHousehold } from '@/hooks/use-household'
import { useToast } from '@/components/ui/toast'
import { LoadingPage } from '@/components/ui/loading'

export default function InviteAcceptPage() {
  const params = useParams<{ token: string }>()
  const token = params?.token
  const router = useRouter()
  const { isAuthenticated, loading: authLoading } = useAuth()
  const { acceptInvitation } = useHousehold()
  const { addToast } = useToast()

  useEffect(() => {
    if (authLoading) return
    if (!token || typeof token !== 'string') return

    if (!isAuthenticated) {
      router.push(`/login?next=${encodeURIComponent(`/invite/${token}`)}`)
      return
    }

    ;(async () => {
      const res = await acceptInvitation(token)
      if (res.error) {
        addToast({ type: 'error', message: res.error })
        router.push('/app/settings')
        return
      }
      addToast({ type: 'success', message: 'Invitación aceptada. Bienvenido al hogar.' })
      router.push('/app/dashboard')
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAuthenticated, token])

  return <LoadingPage />
}

