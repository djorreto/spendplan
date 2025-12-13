'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabaseBrowser } from '@/lib/supabase'
import type { Household, HouseholdInvitation, HouseholdMembership, Profile } from '@/types'
import { formatSupabaseError, isLikelyDuplicateError, logOp, startOp } from '@/lib/debug-log'

interface HouseholdState {
  households: Household[]
  currentHousehold: Household | null
  membership: HouseholdMembership | null
  members: (HouseholdMembership & { profile: Profile })[]
  invitations: HouseholdInvitation[]
  loading: boolean
  error: string | null
  isDemoMode: boolean
}

const INITIAL_HOUSEHOLD_STATE: HouseholdState = {
  households: [],
  currentHousehold: null,
  membership: null,
  members: [],
  invitations: [],
  loading: true,
  error: null,
  isDemoMode: false,
}

// ------------------------------------------------------------
// Global store (shared across all hook instances)
// This avoids "Dashboard loads only after visiting Budget" issues,
// caused by each component having its own isolated hook state.
// ------------------------------------------------------------
let globalHouseholdState: HouseholdState = INITIAL_HOUSEHOLD_STATE
const householdListeners = new Set<(s: HouseholdState) => void>()

function setGlobalHouseholdState(
  updater: HouseholdState | ((prev: HouseholdState) => HouseholdState)
) {
  globalHouseholdState =
    typeof updater === 'function'
      ? (updater as (prev: HouseholdState) => HouseholdState)(globalHouseholdState)
      : updater
  householdListeners.forEach((fn) => fn(globalHouseholdState))
}

// Cache y debounce
let householdCache: { households: Household[], timestamp: number } | null = null
const CACHE_TTL = 30000 // 30 segundos

// Dedupe global: múltiples instancias del hook pueden montarse en paralelo
let householdsInFlight: Promise<void> | null = null

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
 * Hook para manejar hogares del usuario
 * Soporta modo demo con localStorage cuando Supabase no está disponible
 */
export function useHousehold() {
  const [state, setLocalState] = useState<HouseholdState>(() => globalHouseholdState)

  // Subscribe this hook instance to global store updates
  useEffect(() => {
    householdListeners.add(setLocalState)
    // Sync immediately (in case we subscribed after a change)
    setLocalState(globalHouseholdState)
    return () => {
      householdListeners.delete(setLocalState)
    }
  }, [])

  // Wrapper to update global state (and notify all subscribers)
  const setState = useCallback(
    (updater: HouseholdState | ((prev: HouseholdState) => HouseholdState)) => {
      setGlobalHouseholdState(updater)
    },
    []
  )

  // Debounce por instancia (evita quedarse en loading al volver desde Home)
  const lastHouseholdLoadRef = useRef(0)

  // Usar singleton
  const supabase = supabaseBrowser()

  // Cargar miembros de un hogar
  const loadMembers = useCallback(
    async (householdId: string) => {
      try {
        const { data, error } = await supabase
          .from('household_memberships')
          .select(
            `
          *,
          profile:profiles!user_id(*)
        `
          )
          .eq('household_id', householdId)
          .eq('is_active', true)

        if (error) throw error

        setState((prev) => ({
          ...prev,
          members: (data || []) as (HouseholdMembership & { profile: Profile })[],
        }))
      } catch (error) {
        console.error('Error loading members:', error)
      }
    },
    [supabase]
  )

  // Cargar invitaciones pendientes de un hogar
  const loadInvitations = useCallback(
    async (householdId: string) => {
      try {
        const { data, error } = await supabase
          .from('household_invitations')
          .select('*')
          .eq('household_id', householdId)
          .order('created_at', { ascending: false })

        if (error) throw error

        setState((prev) => ({
          ...prev,
          invitations: (data || []) as HouseholdInvitation[],
        }))
      } catch (error) {
        console.error('Error loading invitations:', error)
      }
    },
    [supabase]
  )

  // Cargar hogares del usuario
  const loadHouseholds = useCallback(async (force = false) => {
    const now = Date.now()
    // Si ya hay una carga en curso, reutilizarla (evita loops y “skips” peligrosos)
    if (!force && householdsInFlight) {
      return householdsInFlight
    }

    // Si ya tenemos data y es reciente, no volver a cargar (evita loops por remount)
    const hasLoadedData =
      !!globalHouseholdState.currentHousehold && (globalHouseholdState.households?.length || 0) > 0 && !globalHouseholdState.error
    const cacheFresh = householdCache ? now - householdCache.timestamp < CACHE_TTL : false
    if (!force && hasLoadedData && cacheFresh) {
      return
    }

    lastHouseholdLoadRef.current = now
    console.log('🏠 Loading households...')

    // Solo bloquear UI (loading=true) si no hay data previa o si es force.
    // Si ya tenemos data, hacemos refresh en background para no desmontar el layout.
    const shouldBlockUi = force || !globalHouseholdState.currentHousehold
    if (shouldBlockUi) {
      setState(prev => ({ ...prev, loading: true }))
    }

    const op = startOp('household.loadHouseholds', { force })
    const run = (async () => {
    
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user || (await supabase.auth.getUser()).data.user
      if (!user) {
        setState(prev => ({ ...prev, loading: false }))
        return
      }

      // Obtener membresías con hogares
      console.log('🏠 Fetching memberships for user:', user.id)
      const { data: memberships, error } = await withTimeout(
        supabase
          .from('household_memberships')
          .select(`
          *,
          household:households(*)
        `)
          .eq('user_id', user.id)
          .eq('is_active', true),
        8000,
        'loadHouseholds.memberships'
      )

      console.log('🏠 Memberships result:', { memberships, error })

      if (error) {
        throw error
      }

      const households = memberships
        ?.map(m => m.household as Household)
        .filter(Boolean) || []

      console.log('🏠 Households found:', households.length, households.map(h => h.name))

      // Usar el primer hogar como actual (o el guardado en localStorage)
      const savedHouseholdId = localStorage.getItem('currentHouseholdId')
      const currentHousehold = households.find(h => h.id === savedHouseholdId) || households[0] || null
      const membership = memberships?.find(m => m.household_id === currentHousehold?.id) || null

      console.log('🏠 Current household:', currentHousehold?.name || 'NONE')

      setState(prev => ({
        ...prev,
        households,
        currentHousehold,
        membership: membership as HouseholdMembership,
        loading: false,
        error: null,
        isDemoMode: false,
      }))

      // Actualizar cache: evita refetch inmediato por remounts
      householdCache = { households, timestamp: Date.now() }
      
      console.log('🏠 Households loaded successfully')

      // Cargar miembros si hay hogar actual
      if (currentHousehold) {
        loadMembers(currentHousehold.id)
        // Mostrar invitaciones pendientes en UI
        loadInvitations(currentHousehold.id)
      }
    } catch (error) {
      console.error('Error loading households:', error)
      logOp(op, 'error', 'load failed', 'loadHouseholds', { error: formatSupabaseError(error) })
      
      setState(prev => ({
        ...prev,
        loading: false,
        error: (error as Error).message?.includes('Timeout')
          ? 'Timeout cargando hogares. Reintenta.'
          : 'Error al cargar hogares',
      }))
    }
    finally {
      // Terminar carga (solo si no entramos por returns anticipados)
      setState(prev => ({ ...prev, loading: false }))
      householdsInFlight = null
    }
    })()

    householdsInFlight = run
    return run
  }, [supabase, loadMembers, loadInvitations])

  // Cargar hogares al montar / cuando cambie sesión
  useEffect(() => {
    const hasData =
      !!globalHouseholdState.currentHousehold && (globalHouseholdState.households?.length || 0) > 0 && !globalHouseholdState.error
    if (!hasData) {
      void loadHouseholds()
    }
  }, [loadHouseholds])

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
    loadInvitations(household.id)
  }, [loadMembers, loadInvitations])

  // Crear nuevo hogar
  const createHousehold = useCallback(async (
    name: string,
    currency: string = 'CLP',
    timezone: string = 'America/Santiago'
  ) => {
    console.log('🏠 Creating household:', name)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return { household: null, error: 'No autenticado' }

      // Intentar crear en Supabase primero
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

      // Reload households
      await loadHouseholds().catch(e => console.warn('🏠 loadHouseholds error:', e))
      
      return { error: null }
    } catch (error) {
      console.error('🏠 Error updating household:', error)
      return { error: 'Error al actualizar hogar' }
    }
  }, [supabase, loadHouseholds])

  // Invitar miembro
  const inviteMember = useCallback(async (email: string, role: 'member' | 'owner' = 'member') => {
    const op = startOp('household.inviteMember', { email, role, householdId: state.currentHousehold?.id })
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
      await loadInvitations(state.currentHousehold.id)

      return { token, error: null, opId: op.opId }
    } catch (error) {
      console.error('Error inviting member:', error)
      logOp(op, 'error', 'invite failed', 'insert.household_invitations', { error: formatSupabaseError(error) })
      return { token: null, error: (error as { message?: string })?.message || 'Error al invitar miembro', opId: op.opId }
    }
  }, [supabase, state.currentHousehold, loadInvitations])

  const revokeInvitation = useCallback(async (invitationId: string) => {
    const op = startOp('household.revokeInvitation', { invitationId, householdId: state.currentHousehold?.id })
    try {
      if (!state.currentHousehold) throw new Error('No hay hogar seleccionado')
      const { error } = await supabase
        .from('household_invitations')
        .delete()
        .eq('id', invitationId)

      if (error) throw error
      await loadInvitations(state.currentHousehold.id)
      return { error: null, opId: op.opId }
    } catch (error) {
      logOp(op, 'error', 'revoke failed', 'delete.household_invitations', { error: formatSupabaseError(error) })
      return { error: (error as { message?: string })?.message || 'Error al cancelar invitación', opId: op.opId }
    }
  }, [supabase, state.currentHousehold, loadInvitations])

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

      // Si ya era miembro (duplicado), no fallar: tratar como idempotente.
      if (memberError && !isLikelyDuplicateError(memberError)) throw memberError

      // Marcar invitación como aceptada
      await supabase
        .from('household_invitations')
        .update({ accepted_at: new Date().toISOString() })
        .eq('id', invitation.id)

      await loadHouseholds()
      // Refrescar listas para reflejar el cambio inmediatamente
      await loadMembers(invitation.household_id)
      await loadInvitations(invitation.household_id)
      return { error: null }
    } catch (error) {
      console.error('Error accepting invitation:', error)
      return {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        error: error instanceof Error ? error.message : (error as any)?.message || 'Error al aceptar invitación',
      }
    }
  }, [supabase, loadHouseholds, loadInvitations, loadMembers])

  return {
    ...state,
    loadHouseholds,
    setCurrentHousehold,
    createHousehold,
    updateHousehold,
    inviteMember,
    acceptInvitation,
    revokeInvitation,
    loadInvitations,
    isOwner: state.membership?.role === 'owner',
    isDemoMode: state.isDemoMode,
  }
}

