import { createClient } from '@/lib/supabase-server'
import { User } from '@supabase/supabase-js'

/**
 * Interfaz de perfil de usuario
 * Personaliza según tu tabla 'profiles' en Supabase
 */
export interface Profile {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  company_id: string | null
  role: 'admin' | 'manager' | 'user' | 'viewer'
  created_at: string
  updated_at: string
}

/**
 * Interfaz de empresa (para multi-tenant)
 */
export interface Company {
  id: string
  name: string
  description: string | null
  logo_url: string | null
  settings: any
  created_at: string
  updated_at: string
}

/**
 * Obtiene el perfil del usuario actual (Server-side)
 */
export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = createClient()
  
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  
  if (userError || !user) {
    return null
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    return null
  }

  return profile
}

/**
 * Obtiene el usuario actual con información de empresa (Server-side)
 */
export async function getCurrentUserWithCompany(): Promise<{
  user: User
  profile: Profile
  company: Company | null
} | null> {
  const supabase = createClient()
  
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  
  if (userError || !user) {
    return null
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    return null
  }

  let company = null
  if (profile.company_id) {
    const { data: companyData, error: companyError } = await supabase
      .from('companies')
      .select('*')
      .eq('id', profile.company_id)
      .single()

    if (!companyError && companyData) {
      company = companyData
    }
  }

  return {
    user,
    profile,
    company
  }
}

/**
 * Verifica si el usuario tiene un rol requerido
 * La jerarquía es: viewer < user < manager < admin
 */
export function hasRole(profile: Profile | null, requiredRole: string): boolean {
  if (!profile) return false
  
  const roleHierarchy = {
    'viewer': 0,
    'user': 1,
    'manager': 2,
    'admin': 3
  }
  
  const userLevel = roleHierarchy[profile.role] || 0
  const requiredLevel = roleHierarchy[requiredRole as keyof typeof roleHierarchy] || 0
  
  return userLevel >= requiredLevel
}

/**
 * Verifica si el usuario puede acceder a datos de una empresa
 */
export function canAccessCompany(profile: Profile | null, companyId: string): boolean {
  if (!profile) return false
  return profile.company_id === companyId
}

