import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { supabaseAdmin } from './supabase'

export async function getSessionUser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) {
    throw new Error('Supabase env vars are missing')
  }

  const cookieStore = cookies()
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // ignore in RSC
        }
      },
    },
  })

  const { data, error } = await supabase.auth.getUser()
  if (error) {
    console.error('getSessionUser error', error)
    return null
  }
  return data?.user || null
}

export async function requireSuperAdmin() {
  if (!supabaseAdmin) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured')
  const user = await getSessionUser()
  if (!user) {
    throw new Error('unauthorized')
  }

  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('id, is_super_admin')
    .eq('id', user.id)
    .single()

  if (error || !profile?.is_super_admin) {
    throw new Error('forbidden')
  }

  return { user, profile }
}
