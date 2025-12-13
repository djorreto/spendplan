'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/use-auth'
import { useHousehold } from '@/hooks/use-household'
import { useToast } from '@/components/ui/toast'
import { LoadingPage } from '@/components/ui/loading'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { supabaseBrowser } from '@/lib/supabase'

export default function InviteAcceptPage() {
  const params = useParams<{ token: string }>()
  const token = params?.token
  const router = useRouter()
  const { isAuthenticated, loading: authLoading, signIn, signUp } = useAuth()
  const { acceptInvitation } = useHousehold()
  const { addToast } = useToast()

  const [loadingInvite, setLoadingInvite] = useState(true)
  const [invite, setInvite] = useState<{
    email: string
    household_name: string | null
    role: string
    expires_at: string
  } | null>(null)
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const acceptOnceRef = useRef(false)

  const inviteUrl = useMemo(() => {
    if (!token || typeof token !== 'string') return null
    return `/api/invitations/${token}`
  }, [token])

  useEffect(() => {
    if (!inviteUrl) return
    let cancelled = false

    ;(async () => {
      try {
        setLoadingInvite(true)
        const res = await fetch(inviteUrl)
        const json = await res.json()
        if (!res.ok) {
          throw new Error(json?.error || 'No se pudo cargar la invitación')
        }
        if (!cancelled) {
          setInvite(json)
        }
      } catch (e) {
        if (!cancelled) {
          addToast({ type: 'error', message: (e as Error).message })
          router.push('/login')
        }
      } finally {
        if (!cancelled) setLoadingInvite(false)
      }
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inviteUrl])

  const doAccept = async () => {
    if (!token || typeof token !== 'string') return
    const res = await acceptInvitation(token)
    if (res.error) {
      addToast({ type: 'error', message: res.error })
      router.push('/app/settings')
      return
    }
    addToast({ type: 'success', message: 'Invitación aceptada. Bienvenido al hogar.' })
    router.push('/app/dashboard')
  }

  // Si ya está autenticado, aceptar una sola vez (evita loops/toasts duplicados)
  useEffect(() => {
    if (!isAuthenticated) return
    if (!invite) return
    if (!token || typeof token !== 'string') return
    if (acceptOnceRef.current) return
    acceptOnceRef.current = true
    void doAccept()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, invite, token])

  const handleCreatePassword = async () => {
    if (!invite) return
    if (!password || password.length < 6) {
      addToast({ type: 'error', message: 'La contraseña debe tener al menos 6 caracteres' })
      return
    }
    if (password !== password2) {
      addToast({ type: 'error', message: 'Las contraseñas no coinciden' })
      return
    }

    setSubmitting(true)
    try {
      // 1) Intentar crear cuenta (si ya existe, signUp devolverá error)
      const signup = await signUp(invite.email, password)
      if (signup.error) {
        // 2) Si ya existe, intentar login
        const login = await signIn(invite.email, password)
        if (login.error) {
          addToast({ type: 'error', message: login.error.message || 'No se pudo iniciar sesión' })
          return
        }
      } else {
        // Si el proyecto requiere confirmación por email, signUp puede NO crear sesión.
        // En ese caso, mandamos a login y volvemos a esta misma URL con ?next=...
        const { data: { session } } = await supabaseBrowser().auth.getSession()
        if (!session) {
          addToast({
            type: 'success',
            title: 'Cuenta creada',
            message: 'Revisa tu email para confirmar tu cuenta, luego inicia sesión para aceptar la invitación.',
          })
          router.push(`/login?next=/invite/${token}`)
          return
        }
      }

      // 3) Con sesión activa, aceptar invitación
      await doAccept()
    } finally {
      setSubmitting(false)
    }
  }

  if (loadingInvite || authLoading) return <LoadingPage />
  if (!invite) return <LoadingPage />
  if (isAuthenticated) return <LoadingPage />

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card className="shadow-xl">
          <CardHeader>
            <CardTitle>Aceptar invitación</CardTitle>
            <CardDescription>
              Te invitaron al hogar <strong>{invite.household_name || 'SpendPlan'}</strong> como{' '}
              <strong>{invite.role === 'owner' ? 'Propietario' : 'Miembro'}</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={invite.email} disabled />
            </div>
            <div className="space-y-2">
              <Label>Crear contraseña</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Confirmar contraseña</Label>
              <Input type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">
              Si ya tienes cuenta con este email, usa tu contraseña para entrar y aceptar la invitación.
            </p>
          </CardContent>
          <CardFooter className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => router.push('/login')}>
              Volver
            </Button>
            <Button className="flex-1" onClick={handleCreatePassword} disabled={submitting}>
              {submitting ? 'Procesando…' : 'Continuar'}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}

