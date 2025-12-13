import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Singleton para el cliente del navegador
let browserClient: SupabaseClient | null = null

/**
 * Cliente Supabase para componentes Client (use client)
 * Usa createClient directamente para evitar problemas con auth-helpers
 */
export const supabaseBrowser = (): SupabaseClient => {
  if (typeof window === 'undefined') {
    // En el servidor, crear uno nuevo
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  
  if (!browserClient) {
    browserClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      }
    )
  }
  return browserClient
}

/**
 * Cliente admin solo en servidor (no usar en Client Components)
 * Tiene permisos elevados - usar con cuidado
 */
export const supabaseAdmin =
  process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(
        process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      )
    : null

