'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Logo, LogoIcon } from '@/components/ui/logo'
import { Button } from '@/components/ui/button'
import { 
  LayoutDashboard, 
  Users, 
  Settings, 
  FileText, 
  ChevronLeft, 
  ChevronRight,
  LogOut,
  LucideIcon
} from 'lucide-react'

interface MenuItem {
  icon: LucideIcon
  label: string
  href: string
  badge?: number
}

interface SidebarProps {
  className?: string
  onLogout?: () => void
}

/**
 * Barra lateral de navegación
 * 
 * Personaliza los items del menú modificando el array menuItems
 */
export function Sidebar({ className, onLogout }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const pathname = usePathname()

  // ========================================
  // 📋 MENÚ DE NAVEGACIÓN - PERSONALIZA AQUÍ
  // ========================================
  const menuItems: MenuItem[] = [
    { icon: LayoutDashboard, label: 'Resumen', href: '/dashboard' },
    { icon: FileText, label: 'Documentos', href: '/documents' },
    { icon: Users, label: 'Usuarios', href: '/users' },
    { icon: Settings, label: 'Configuración', href: '/settings' },
  ]

  return (
    <aside className={cn(
      'flex flex-col border-r bg-background transition-all duration-300',
      isCollapsed ? 'w-16' : 'w-64',
      className
    )}>
      {/* Header */}
      <div className={cn(
        'flex items-center border-b px-4 h-16',
        isCollapsed ? 'justify-center' : 'justify-between'
      )}>
        {isCollapsed ? (
          <LogoIcon size="sm" />
        ) : (
          <Logo size="md" />
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={cn('h-8 w-8', isCollapsed && 'hidden')}
        >
          {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive 
                  ? 'bg-primary text-primary-foreground' 
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                isCollapsed && 'justify-center px-2'
              )}
              title={isCollapsed ? item.label : undefined}
            >
              <Icon className="h-5 w-5 flex-shrink-0" />
              {!isCollapsed && (
                <>
                  <span className="flex-1">{item.label}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="inline-flex items-center justify-center w-5 h-5 text-xs rounded-full bg-destructive text-destructive-foreground">
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="border-t px-2 py-4">
        <Button
          variant="ghost"
          className={cn(
            'w-full justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/10',
            isCollapsed && 'justify-center px-2'
          )}
          onClick={onLogout}
        >
          <LogOut className="h-5 w-5" />
          {!isCollapsed && <span className="ml-3">Cerrar Sesión</span>}
        </Button>

        {/* Collapse toggle en footer para versión colapsada */}
        {isCollapsed && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsCollapsed(false)}
            className="w-full mt-2"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </aside>
  )
}

