'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { User, AuthError } from '@supabase/supabase-js'
import { supabaseBrowser } from '@/lib/supabase'
import { normalizeEmail, PRIVATE_BETA_BLOCK_MESSAGE, PRIVATE_BETA_CHECK_ERROR_MESSAGE } from '@/lib/beta-allowlist'
import type { Profile } from '@/types'

interface AuthState {
  user: User | null
  profile: Profile | null
  loading: boolean
  error: AuthError | null
  isDemoMode: boolean
}

// Cache para evitar múltiples llamadas
let profileCache: { [userId: string]: Profile } = {}

// Dedupe global para evitar check simultáneo entre múltiples instancias
let authInFlight: Promise<void> | null = null

type BetaCheckResult = { betaMode: boolean; allowed: boolean; error?: string }
const allowlistCache = new Map<string, { value: BetaCheckResult; ts: number }>()
const ALLOWLIST_CACHE_TTL_MS = 60_000

async function checkBetaAllowlist(email: string): Promise<BetaCheckResult> {
  const e = normalizeEmail(email)
  if (!e) return { betaMode: true, allowed: false }

  const cached = allowlistCache.get(e)
  const now = Date.now()
  if (cached && now - cached.ts < ALLOWLIST_CACHE_TTL_MS) return cached.value

  try {
    const res = await fetch('/api/beta/check-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: e }),
    })
    if (!res.ok) {
      let msg = `beta check failed: ${res.status}`
      try {
        const j = await res.json()
        if (j?.error) msg = String(j.error)
      } catch {}
      throw new Error(msg)
    }
    const json = (await res.json()) as Partial<BetaCheckResult>
    const value: BetaCheckResult = {
      betaMode: !!json.betaMode,
      allowed: !!json.allowed,
    }
    allowlistCache.set(e, { value, ts: now })
    return value
  } catch (err) {
    // Fail closed for private beta.
    const value: BetaCheckResult = { betaMode: true, allowed: false, error: (err as any)?.message || 'beta_check_error' }
    allowlistCache.set(e, { value, ts: now })
    return value
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      t = setTimeout(() => reject(new Error(`Timeout: ${label}`)), timeoutMs)
    }),
  ]).finally(() => {
    if (t) clearTimeout(t)
  })
}

/**
 * Hook para manejar autenticación con Supabase
 * Soporta modo demo cuando Supabase no está disponible
 */
export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    profile: null,
    loading: true,
    error: null,
    isDemoMode: false,
  })

  // Debounce por instancia (evita “quedarse cargando” al remonte rápido)
  const lastAuthCheckRef = useRef(0)

  // Usar singleton
  const supabase = supabaseBrowser()

  // Cargar perfil del usuario (con cache)
  const loadProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    // Usar cache si existe
    if (profileCache[userId]) {
      console.log('📋 Profile from cache:', profileCache[userId].email)
      return profileCache[userId]
    }
    
    console.log('📋 Loading profile for user:', userId)
    try {
      const { data, error } = await withTimeout(
        supabase.from('profiles').select('*').eq('id', userId).single(),
        8000,
        'loadProfile'
      )

      if (error) {
        console.error('❌ Error loading profile:', error.code, error.message)
        // Si el perfil no existe, intentar crearlo
        if (error.code === 'PGRST116') {
          console.log('📋 Profile not found, creating...')
          const { data: userData } = await supabase.auth.getUser()
          if (userData?.user) {
            const email = normalizeEmail(userData.user.email || '')
            const beta = await checkBetaAllowlist(email)
            if (beta.betaMode && !beta.allowed) {
              // No crear perfil en beta privada si no está invitado
              await supabase.auth.signOut().catch(() => {})
              return null
            }
            const newProfile = {
              id: userId,
              email,
              full_name: userData.user.user_metadata?.full_name || userData.user.email?.split('@')[0] || 'Usuario',
              onboarding_completed: false,
            }
            const { data: created, error: createError } = await supabase
              .from('profiles')
              .insert(newProfile)
              .select()
              .single()
            
            if (createError) {
              console.error('❌ Error creating profile:', createError)
              return null
            }
            console.log('✅ Profile created:', created)
            profileCache[userId] = created as Profile
            return created as Profile
          }
        }
        return null
      }
      console.log('✅ Profile loaded:', data?.email)
      profileCache[userId] = data as Profile
      return data as Profile
    } catch (error) {
      console.error('❌ Exception loading profile:', error)
      return null
    }
  }, [supabase])

  // Verificar sesión al montar
  useEffect(() => {
    let isMounted = true
    
    const checkUser = async () => {
      const now = Date.now()
      // Si ya hay un check en curso, reutilizarlo
      if (authInFlight) return authInFlight
      lastAuthCheckRef.current = now
      console.log('📋 Checking auth...')
      
      const run = (async () => {
        try {
        // Preferir session local (más rápido) y luego validar user
        const { data: { session } } = await supabase.auth.getSession()
        const sessionUser = session?.user || null
        const { data: { user } } = sessionUser
          ? { data: { user: sessionUser } }
          : await supabase.auth.getUser()
        
        if (!isMounted) return
        
        if (user) {
          const beta = await checkBetaAllowlist(user.email || '')
          if (beta.betaMode && !beta.allowed) {
            await supabase.auth.signOut().catch(() => {})
            if (isMounted) setState({ user: null, profile: null, loading: false, error: null, isDemoMode: false })
            if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
              window.location.href = beta.error ? `/login?blocked=beta_error` : `/login?blocked=beta`
            }
            return
          }
          // No bloquear el render esperando profile: evita “freeze” en refresh si la query se cuelga
          if (isMounted) {
            setState({ user, profile: null, loading: false, error: null, isDemoMode: false })
          }
          void loadProfile(user.id).then((p) => {
            if (isMounted && p) setState((prev) => ({ ...prev, profile: p }))
          })
        } else {
          if (isMounted) {
            setState({ user: null, profile: null, loading: false, error: null, isDemoMode: false })
          }
        }
        } catch (error) {
        console.error('Auth check error:', error)
        if (isMounted) {
          // En caso de error o timeout, mostrar la página de login
            setState({ user: null, profile: null, loading: false, error: null, isDemoMode: false })
        }
        }
      })()

      authInFlight = run
      try {
        await run
      } finally {
        authInFlight = null
      }
    }

    checkUser()

    // Escuchar cambios de autenticación
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!isMounted) return
        
        if (session?.user) {
          const beta = await checkBetaAllowlist(session.user.email || '')
          if (beta.betaMode && !beta.allowed) {
            await supabase.auth.signOut().catch(() => {})
            if (isMounted) setState(prev => ({ ...prev, user: null, profile: null, loading: false, isDemoMode: false }))
            if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
              window.location.href = beta.error ? `/login?blocked=beta_error` : `/login?blocked=beta`
            }
            return
          }
          if (isMounted) {
            setState(prev => ({ ...prev, user: session.user, profile: prev.profile, loading: false, isDemoMode: false }))
          }
          void loadProfile(session.user.id).then((p) => {
            if (isMounted && p) setState((prev) => ({ ...prev, profile: p }))
          })
        } else {
          if (isMounted) {
            setState(prev => ({ ...prev, user: null, profile: null, loading: false, isDemoMode: false }))
          }
        }
      }
    )

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [supabase, loadProfile])

  // Sign in con email y password
  const signIn = useCallback(async (email: string, password: string) => {
    console.log('🔐 SignIn iniciado...')
    
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizeEmail(email),
        password
      })

      console.log('🔐 SignIn resultado:', { user: data.user?.email, error: error?.message })

      if (error) {
        console.error('🔐 SignIn error:', error)
        return { user: null, error }
      }

      const beta = await checkBetaAllowlist(data.user?.email || '')
      if (beta.betaMode && !beta.allowed) {
        await supabase.auth.signOut().catch(() => {})
        return {
          user: null,
          error: { message: beta.error ? PRIVATE_BETA_CHECK_ERROR_MESSAGE : PRIVATE_BETA_BLOCK_MESSAGE } as AuthError,
        }
      }

      // Actualizar estado con el usuario (sin esperar profile)
      setState(prev => ({ ...prev, user: data.user, loading: false, error: null, isDemoMode: false }))
      
      console.log('🔐 SignIn exitoso, retornando user')
      return { user: data.user, error: null }
    } catch (e) {
      console.error('🔐 SignIn exception:', e)
      return { user: null, error: { message: 'Error inesperado al iniciar sesión' } as AuthError }
    }
  }, [supabase.auth])

  // Sign up
  const signUp = useCallback(async (
    email: string, 
    password: string, 
    metadata?: { full_name?: string }
  ) => {
    // NO establecer loading: true aquí porque afecta el render de la página de login
    setState(prev => ({ ...prev, error: null }))
    
    try {
    const normalized = normalizeEmail(email)
    const beta = await checkBetaAllowlist(normalized)
    if (beta.betaMode && !beta.allowed) {
      return {
        user: null,
        error: { message: beta.error ? PRIVATE_BETA_CHECK_ERROR_MESSAGE : PRIVATE_BETA_BLOCK_MESSAGE } as AuthError,
      }
    }

    const { data, error } = await supabase.auth.signUp({
      email: normalized,
      password,
      options: {
        data: metadata
      }
    })

    if (error) {
        return { user: null, error }
    }

    return { user: data.user, error: null }
    } catch (e) {
      return { user: null, error: { message: 'Error inesperado al crear cuenta' } as AuthError }
    }
  }, [supabase.auth])

  // Sign out
  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut()

    if (error) {
      setState(prev => ({ ...prev, error }))
      return { error }
    }

    setState({ user: null, profile: null, loading: false, error: null, isDemoMode: false })
    return { error: null }
  }, [supabase.auth, state.isDemoMode])

  // Update profile
  const updateProfile = useCallback(async (updates: Partial<Profile>) => {
    if (!state.user) return { error: 'No autenticado' }

    try {
    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', state.user.id)

    if (error) {
      return { error: error.message }
    }

    // Recargar perfil
    const profile = await loadProfile(state.user.id)
    setState(prev => ({ ...prev, profile }))
    return { error: null }
    } catch (e) {
      return { error: 'Error inesperado al actualizar perfil' }
    }
  }, [supabase, state.user, state.isDemoMode, state.profile, loadProfile])

  // Mark onboarding as completed
  const completeOnboarding = useCallback(async () => {
    return updateProfile({ onboarding_completed: true })
  }, [updateProfile])

  // Reset password
  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`
    })
    return { error }
  }, [supabase.auth])

  // Update password
  const updatePassword = useCallback(async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({
      password: newPassword
    })
    return { error }
  }, [supabase.auth])

  return {
    user: state.user,
    profile: state.profile,
    loading: state.loading,
    error: state.error,
    isAuthenticated: !!state.user,
    needsOnboarding: state.profile && !state.profile.onboarding_completed,
    isDemoMode: state.isDemoMode,
    signIn,
    signUp,
    signOut,
    updateProfile,
    completeOnboarding,
    resetPassword,
    updatePassword,
  }
}
