'use client'

import { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Sidebar } from './sidebar'
import { Topbar } from './topbar'
import { cn } from '@/lib/utils'

interface MainLayoutProps {
  children: ReactNode
  className?: string
  // Usuario actual (opcional - puedes obtenerlo de un context)
  user?: {
    name: string
    email: string
    avatar?: string
  }
}

/**
 * Layout principal de la aplicación
 * Incluye Sidebar, Topbar, y el contenido principal
 */
export function MainLayout({ children, className, user }: MainLayoutProps) {
  const router = useRouter()

  const handleLogout = async () => {
    // Implementa tu lógica de logout
    // Ejemplo con Supabase:
    // const supabase = supabaseBrowser()
    // await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-muted/30">
      {/* Sidebar */}
      <Sidebar onLogout={handleLogout} />

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Topbar */}
        <Topbar user={user} onLogout={handleLogout} />

        {/* Page content */}
        <main className={cn('flex-1 overflow-y-auto p-4 md:p-6', className)}>
          {children}
        </main>
      </div>
    </div>
  )
}

