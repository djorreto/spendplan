'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { User, AuthError } from '@supabase/supabase-js'
import { supabaseBrowser } from '@/lib/supabase'
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
let lastAuthCheck = 0

// Demo mode helpers
const DEMO_USER_KEY = 'spendplan_demo_user'
const DEMO_PROFILE_KEY = 'spendplan_demo_profile'

function getDemoUser(): User | null {
  if (typeof window === 'undefined') return null
  const saved = localStorage.getItem(DEMO_USER_KEY)
  return saved ? JSON.parse(saved) : null
}

function getDemoProfile(): Profile | null {
  if (typeof window === 'undefined') return null
  const saved = localStorage.getItem(DEMO_PROFILE_KEY)
  return saved ? JSON.parse(saved) : null
}

function saveDemoUser(user: User, profile: Profile) {
  localStorage.setItem(DEMO_USER_KEY, JSON.stringify(user))
  localStorage.setItem(DEMO_PROFILE_KEY, JSON.stringify(profile))
}

function clearDemoUser() {
  localStorage.removeItem(DEMO_USER_KEY)
  localStorage.removeItem(DEMO_PROFILE_KEY)
  localStorage.removeItem('spendplan_demo_household')
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
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (error) {
        console.error('❌ Error loading profile:', error.code, error.message)
        // Si el perfil no existe, intentar crearlo
        if (error.code === 'PGRST116') {
          console.log('📋 Profile not found, creating...')
          const { data: userData } = await supabase.auth.getUser()
          if (userData?.user) {
            const newProfile = {
              id: userId,
              email: userData.user.email,
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
      // Evitar múltiples llamadas en corto tiempo
      const now = Date.now()
      if (now - lastAuthCheck < 2000) {
        console.log('📋 Skipping auth check (too soon)')
        return
      }
      lastAuthCheck = now
      
      try {
        // Primero verificar si hay usuario demo
        const demoUser = getDemoUser()
        const demoProfile = getDemoProfile()
        
        // Sin timeout - dejamos que Supabase responda
        const { data: { user } } = await supabase.auth.getUser()
        
        if (!isMounted) return
        
        if (user) {
          const profile = await loadProfile(user.id)
          if (isMounted) {
            setState({ user, profile, loading: false, error: null, isDemoMode: false })
          }
        } else if (demoUser && demoProfile) {
          // Usar usuario demo si existe
          if (isMounted) {
            setState({ user: demoUser, profile: demoProfile, loading: false, error: null, isDemoMode: true })
          }
        } else {
          if (isMounted) {
            setState({ user: null, profile: null, loading: false, error: null, isDemoMode: false })
          }
        }
      } catch (error) {
        console.error('Auth check error:', error)
        if (isMounted) {
          // Verificar si hay usuario demo como fallback
          const demoUser = getDemoUser()
          const demoProfile = getDemoProfile()
          if (demoUser && demoProfile) {
            setState({ user: demoUser, profile: demoProfile, loading: false, error: null, isDemoMode: true })
          } else {
          // En caso de error o timeout, mostrar la página de login
            setState({ user: null, profile: null, loading: false, error: null, isDemoMode: false })
          }
        }
      }
    }

    checkUser()

    // Escuchar cambios de autenticación
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!isMounted) return
        
        if (session?.user) {
          const profile = await loadProfile(session.user.id)
          if (isMounted) {
            setState(prev => ({ ...prev, user: session.user, profile, loading: false, isDemoMode: false }))
          }
        } else {
          // No limpiar si hay demo mode activo
          const demoUser = getDemoUser()
          const demoProfile = getDemoProfile()
          if (demoUser && demoProfile) {
            if (isMounted) {
              setState(prev => ({ ...prev, user: demoUser, profile: demoProfile, loading: false, isDemoMode: true }))
          }
        } else {
          if (isMounted) {
              setState(prev => ({ ...prev, user: null, profile: null, loading: false, isDemoMode: false }))
            }
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
        email,
        password
      })

      console.log('🔐 SignIn resultado:', { user: data.user?.email, error: error?.message })

      if (error) {
        console.error('🔐 SignIn error:', error)
        return { user: null, error }
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

  // Sign in demo mode (sin Supabase)
  const signInDemo = useCallback(async (email: string, name?: string) => {
    console.log('🎭 Demo SignIn iniciado...')
    
    const demoUser: User = {
      id: `demo-${Date.now()}`,
      email,
      app_metadata: {},
      user_metadata: { full_name: name || email.split('@')[0] },
      aud: 'demo',
      created_at: new Date().toISOString(),
    } as User

    const demoProfile: Profile = {
      id: demoUser.id,
      email,
      full_name: name || email.split('@')[0],
      onboarding_completed: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    saveDemoUser(demoUser, demoProfile)
    setState({ user: demoUser, profile: demoProfile, loading: false, error: null, isDemoMode: true })
    
    console.log('🎭 Demo SignIn exitoso')
    return { user: demoUser, error: null }
  }, [])

  // Sign up
  const signUp = useCallback(async (
    email: string, 
    password: string, 
    metadata?: { full_name?: string }
  ) => {
    // NO establecer loading: true aquí porque afecta el render de la página de login
    setState(prev => ({ ...prev, error: null }))
    
    try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: metadata
      }
    })

    if (error) {
        // Si Supabase falla, usar modo demo
        console.warn('Supabase signup failed, using demo mode:', error)
        return signInDemo(email, metadata?.full_name)
    }

    return { user: data.user, error: null }
    } catch (e) {
      console.warn('Supabase error, using demo mode:', e)
      return signInDemo(email, metadata?.full_name)
    }
  }, [supabase.auth, signInDemo])

  // Sign out
  const signOut = useCallback(async () => {
    // Limpiar datos demo
    clearDemoUser()
    
    const { error } = await supabase.auth.signOut()

    if (error && !state.isDemoMode) {
      setState(prev => ({ ...prev, error }))
      return { error }
    }

    setState({ user: null, profile: null, loading: false, error: null, isDemoMode: false })
    return { error: null }
  }, [supabase.auth, state.isDemoMode])

  // Update profile
  const updateProfile = useCallback(async (updates: Partial<Profile>) => {
    if (!state.user) return { error: 'No autenticado' }

    // Si estamos en modo demo o hay un usuario demo, actualizar localStorage
    const demoUser = getDemoUser()
    if (state.isDemoMode || demoUser) {
      const currentProfile = state.profile || getDemoProfile()
      const newProfile = { ...currentProfile, ...updates } as Profile
      localStorage.setItem(DEMO_PROFILE_KEY, JSON.stringify(newProfile))
      setState(prev => ({ ...prev, profile: newProfile, isDemoMode: true }))
      return { error: null }
    }

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
      console.warn('Supabase update failed, using demo mode')
      // Fallback a demo mode
      const currentProfile = state.profile || getDemoProfile()
      const newProfile = { ...currentProfile, ...updates } as Profile
      localStorage.setItem(DEMO_PROFILE_KEY, JSON.stringify(newProfile))
      setState(prev => ({ ...prev, profile: newProfile, isDemoMode: true }))
      return { error: null }
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
    signInDemo,
    signUp,
    signOut,
    updateProfile,
    completeOnboarding,
    resetPassword,
    updatePassword,
  }
}
