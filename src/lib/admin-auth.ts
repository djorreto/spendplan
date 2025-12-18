import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { supabaseAdmin } from './supabase'

/**
 * Obtiene el usuario autenticado desde:
 * - Authorization: Bearer <token> (recomendado para llamadas desde el cliente)
 * - Cookies (fallback)
 */
export async function getSessionUser(req?: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) {
    throw new Error('Supabase env vars are missing')
  }

  // 1) Intentar con Authorization: Bearer
  const authHeader = req?.headers.get('authorization') || req?.headers.get('Authorization')
  if (authHeader && supabaseAdmin) {
    const token = authHeader.replace(/Bearer\s+/i, '').trim()
    if (token) {
      const { data, error } = await supabaseAdmin.auth.getUser(token)
      if (!error && data?.user) return data.user
    }
  }

  // 2) Fallback: cookies (ssr)
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

export async function requireSuperAdmin(req?: Request) {
  if (!supabaseAdmin) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured')
  const user = await getSessionUser(req)
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
