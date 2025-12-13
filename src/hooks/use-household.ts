'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabaseBrowser } from '@/lib/supabase'
import type { Household, HouseholdMembership, Profile } from '@/types'

interface HouseholdState {
  households: Household[]
  currentHousehold: Household | null
  membership: HouseholdMembership | null
  members: (HouseholdMembership & { profile: Profile })[]
  loading: boolean
  error: string | null
  isDemoMode: boolean
}

// Demo mode helpers
const DEMO_STORAGE_KEY = 'spendplan_demo_household'

function getDemoHousehold(): Household | null {
  if (typeof window === 'undefined') return null
  const saved = localStorage.getItem(DEMO_STORAGE_KEY)
  return saved ? JSON.parse(saved) : null
}

function saveDemoHousehold(household: Household) {
  localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(household))
}

/**
 * Hook para manejar hogares del usuario
 * Soporta modo demo con localStorage cuando Supabase no está disponible
 */
export function useHousehold() {
  const [state, setState] = useState<HouseholdState>({
    households: [],
    currentHousehold: null,
    membership: null,
    members: [],
    loading: true,
    error: null,
    isDemoMode: false,
  })

  // Usar singleton
  const supabase = supabaseBrowser()

  // Cargar hogares del usuario
  const loadHouseholds = useCallback(async () => {
    try {
      // Primero verificar si hay un hogar demo guardado
      const demoHousehold = getDemoHousehold()
      
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        // Si no hay usuario pero hay demo, usar demo
        if (demoHousehold) {
          setState(prev => ({
            ...prev,
            households: [demoHousehold],
            currentHousehold: demoHousehold,
            membership: {
              id: 'demo-membership',
              household_id: demoHousehold.id,
              user_id: 'demo-user',
              role: 'owner',
              is_active: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            } as HouseholdMembership,
            loading: false,
            isDemoMode: true,
          }))
          return
        }
        setState(prev => ({ ...prev, loading: false }))
        return
      }

      // Obtener membresías con hogares
      const { data: memberships, error } = await supabase
        .from('household_memberships')
        .select(`
          *,
          household:households(*)
        `)
        .eq('user_id', user.id)
        .eq('is_active', true)

      if (error) {
        console.warn('Supabase error, checking demo mode:', error)
        // Si hay error de Supabase pero hay demo, usar demo
        if (demoHousehold) {
          setState(prev => ({
            ...prev,
            households: [demoHousehold],
            currentHousehold: demoHousehold,
            membership: {
              id: 'demo-membership',
              household_id: demoHousehold.id,
              user_id: user.id,
              role: 'owner',
              is_active: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            } as HouseholdMembership,
            loading: false,
            isDemoMode: true,
          }))
          return
        }
        throw error
      }

      const households = memberships
        ?.map(m => m.household as Household)
        .filter(Boolean) || []

      // Usar el primer hogar como actual (o el guardado en localStorage)
      const savedHouseholdId = localStorage.getItem('currentHouseholdId')
      const currentHousehold = households.find(h => h.id === savedHouseholdId) || households[0] || null
      const membership = memberships?.find(m => m.household_id === currentHousehold?.id) || null

      setState(prev => ({
        ...prev,
        households,
        currentHousehold,
        membership: membership as HouseholdMembership,
        loading: false,
        error: null,
        isDemoMode: false,
      }))

      // Cargar miembros si hay hogar actual
      if (currentHousehold) {
        loadMembers(currentHousehold.id)
      }
    } catch (error) {
      console.error('Error loading households:', error)
      
      // Fallback a demo mode
      const demoHousehold = getDemoHousehold()
      if (demoHousehold) {
        setState(prev => ({
          ...prev,
          households: [demoHousehold],
          currentHousehold: demoHousehold,
          membership: {
            id: 'demo-membership',
            household_id: demoHousehold.id,
            user_id: 'demo-user',
            role: 'owner',
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as HouseholdMembership,
          loading: false,
          isDemoMode: true,
          error: null,
        }))
        return
      }
      
      setState(prev => ({
        ...prev,
        loading: false,
        error: 'Error al cargar hogares',
      }))
    }
  }, [supabase])

  // Cargar miembros de un hogar
  const loadMembers = useCallback(async (householdId: string) => {
    try {
      const { data, error } = await supabase
        .from('household_memberships')
        .select(`
          *,
          profile:profiles!user_id(*)
        `)
        .eq('household_id', householdId)
        .eq('is_active', true)

      if (error) throw error

      setState(prev => ({
        ...prev,
        members: (data || []) as (HouseholdMembership & { profile: Profile })[],
      }))
    } catch (error) {
      console.error('Error loading members:', error)
    }
  }, [supabase])

  // Cambiar hogar actual
  const setCurrentHousehold = useCallback((household: Household) => {
    localStorage.setItem('currentHouseholdId', household.id)
    setState(prev => ({
      ...prev,
      currentHousehold: household,
      membership: prev.households.find(h => h.id === household.id) 
        ? prev.membership 
        : null,
    }))
    loadMembers(household.id)
  }, [loadMembers])

  // Crear nuevo hogar
  const createHousehold = useCallback(async (
    name: string,
    currency: string = 'CLP',
    timezone: string = 'America/Santiago'
  ) => {
    console.log('🏠 Creating household:', name)
    
    // Verificar si estamos en modo demo (verificar localStorage primero)
    const demoUserStr = typeof window !== 'undefined' ? localStorage.getItem('spendplan_demo_user') : null
    const isDemoUser = !!demoUserStr
    
    if (isDemoUser) {
      console.log('🎭 Demo mode detected, creating local household')
      // Modo demo: crear hogar en localStorage directamente
      const demoHousehold: Household = {
        id: `demo-${Date.now()}`,
        name,
        currency,
        timezone,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      saveDemoHousehold(demoHousehold)
      localStorage.setItem('currentHouseholdId', demoHousehold.id)

      const demoUser = JSON.parse(demoUserStr)
      setState(prev => ({
        ...prev,
        households: [demoHousehold],
        currentHousehold: demoHousehold,
        membership: {
          id: 'demo-membership',
          household_id: demoHousehold.id,
          user_id: demoUser?.id || 'demo-user',
          role: 'owner',
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as HouseholdMembership,
        isDemoMode: true,
      }))

      console.log('🏠 Demo household created:', demoHousehold.id)
      return { household: demoHousehold, error: null }
    }

    try {
      const { data: { user } } = await supabase.auth.getUser()

      // Intentar crear en Supabase primero
      if (user) {
        try {
      // Crear hogar
      const { data: household, error: householdError } = await supabase
        .from('households')
        .insert({ name, currency, timezone })
        .select()
        .single()

      if (householdError) throw householdError

      // Crear membresía como owner
      const { error: membershipError } = await supabase
        .from('household_memberships')
        .insert({
          household_id: household.id,
          user_id: user.id,
          role: 'owner',
        })

      if (membershipError) throw membershipError

      // Crear AI config por defecto (mock)
      await supabase
        .from('ai_config')
        .insert({
          household_id: household.id,
          provider: 'mock',
        })

      // Actualizar estado
      await loadHouseholds()
      setCurrentHousehold(household)

      return { household, error: null }
        } catch (supabaseError) {
          console.warn('Supabase failed, falling back to demo mode:', supabaseError)
          // Continuar con modo demo
        }
      }

      // Modo demo: crear hogar en localStorage
      const demoHousehold: Household = {
        id: `demo-${Date.now()}`,
        name,
        currency,
        timezone,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      saveDemoHousehold(demoHousehold)
      localStorage.setItem('currentHouseholdId', demoHousehold.id)

      setState(prev => ({
        ...prev,
        households: [demoHousehold],
        currentHousehold: demoHousehold,
        membership: {
          id: 'demo-membership',
          household_id: demoHousehold.id,
          user_id: user?.id || 'demo-user',
          role: 'owner',
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as HouseholdMembership,
        isDemoMode: true,
      }))

      return { household: demoHousehold, error: null }
    } catch (error) {
      console.error('Error creating household:', error)
      return { household: null, error: 'Error al crear hogar' }
    }
  }, [supabase, loadHouseholds, setCurrentHousehold])

  // Actualizar hogar
  const updateHousehold = useCallback(async (
    id: string,
    updates: Partial<Household>
  ) => {
    console.log('🏠 Updating household:', id, updates)
    try {
      const { data, error } = await supabase
        .from('households')
        .update(updates)
        .eq('id', id)
        .select()

      if (error) {
        console.error('🏠 Update error:', error)
        throw error
      }
      
      console.log('🏠 Update result:', data)

      // Reload with timeout to avoid hanging
      await Promise.race([
        loadHouseholds(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
      ]).catch(e => console.warn('🏠 loadHouseholds timeout or error:', e))
      
      return { error: null }
    } catch (error) {
      console.error('🏠 Error updating household:', error)
      return { error: 'Error al actualizar hogar' }
    }
  }, [supabase, loadHouseholds])

  // Invitar miembro
  const inviteMember = useCallback(async (email: string, role: 'member' | 'owner' = 'member') => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !state.currentHousehold) throw new Error('No hay hogar seleccionado')

      // Generar token único
      const token = crypto.randomUUID()
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 7) // 7 días

      const { error } = await supabase
        .from('household_invitations')
        .insert({
          household_id: state.currentHousehold.id,
          email,
          role,
          token,
          invited_by: user.id,
          expires_at: expiresAt.toISOString(),
        })

      if (error) throw error

      // TODO: Enviar email de invitación

      return { token, error: null }
    } catch (error) {
      console.error('Error inviting member:', error)
      return { token: null, error: 'Error al invitar miembro' }
    }
  }, [supabase, state.currentHousehold])

  // Aceptar invitación
  const acceptInvitation = useCallback(async (token: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No autenticado')

      // Buscar invitación válida
      const { data: invitation, error: invError } = await supabase
        .from('household_invitations')
        .select('*')
        .eq('token', token)
        .is('accepted_at', null)
        .gt('expires_at', new Date().toISOString())
        .single()

      if (invError || !invitation) throw new Error('Invitación no válida o expirada')

      // Verificar que el email coincida
      if (invitation.email.toLowerCase() !== user.email?.toLowerCase()) {
        throw new Error('Esta invitación es para otro email')
      }

      // Crear membresía
      const { error: memberError } = await supabase
        .from('household_memberships')
        .insert({
          household_id: invitation.household_id,
          user_id: user.id,
          role: invitation.role,
          invited_by: invitation.invited_by,
          invited_at: invitation.created_at,
        })

      if (memberError) throw memberError

      // Marcar invitación como aceptada
      await supabase
        .from('household_invitations')
        .update({ accepted_at: new Date().toISOString() })
        .eq('id', invitation.id)

      await loadHouseholds()
      return { error: null }
    } catch (error) {
      console.error('Error accepting invitation:', error)
      return { error: error instanceof Error ? error.message : 'Error al aceptar invitación' }
    }
  }, [supabase, loadHouseholds])

  // Cargar al montar con timeout
  useEffect(() => {
    let isMounted = true
    
    const loadWithTimeout = async () => {
      try {
        // Timeout de 5 segundos
        const timeoutId = setTimeout(() => {
          if (isMounted) {
            console.warn('Household loading timeout')
            setState(prev => ({ ...prev, loading: false }))
          }
        }, 5000)
        
        await loadHouseholds()
        clearTimeout(timeoutId)
      } catch (error) {
        console.error('Error in household loading:', error)
        if (isMounted) {
          setState(prev => ({ ...prev, loading: false, error: 'Error al cargar hogares' }))
        }
      }
    }
    
    loadWithTimeout()
    
    return () => {
      isMounted = false
    }
  }, [loadHouseholds])

  return {
    ...state,
    loadHouseholds,
    setCurrentHousehold,
    createHousehold,
    updateHousehold,
    inviteMember,
    acceptInvitation,
    isOwner: state.membership?.role === 'owner',
    isDemoMode: state.isDemoMode,
  }
}

