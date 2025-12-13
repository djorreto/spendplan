'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase'
import { LoadingPage } from '@/components/ui/loading'

interface ProtectedRouteProps {
  children: React.ReactNode
  requiredRole?: string
  redirectTo?: string
}

/**
 * Wrapper para proteger rutas que requieren autenticación
 * 
 * Uso:
 * <ProtectedRoute>
 *   <DashboardPage />
 * </ProtectedRoute>
 * 
 * O con rol requerido:
 * <ProtectedRoute requiredRole="admin">
 *   <AdminPage />
 * </ProtectedRoute>
 */
export function ProtectedRoute({ 
  children, 
  requiredRole,
  redirectTo = '/login' 
}: ProtectedRouteProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthorized, setIsAuthorized] = useState(false)

  useEffect(() => {
    checkAuth()
  }, [])

  async function checkAuth() {
    try {
      const supabase = supabaseBrowser()
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        router.push(redirectTo)
        return
      }

      // Si hay un rol requerido, verificarlo
      if (requiredRole) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()

        if (!profile || profile.role !== requiredRole) {
          router.push('/dashboard') // Redirigir a una página sin permisos
          return
        }
      }

      setIsAuthorized(true)
    } catch (error) {
      console.error('Auth error:', error)
      router.push(redirectTo)
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return <LoadingPage />
  }

  if (!isAuthorized) {
    return null
  }

  return <>{children}</>
}

