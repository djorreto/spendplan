'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Logo, LogoIcon } from '@/components/ui/logo'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import { 
  LayoutDashboard, 
  Wallet, 
  Receipt,
  Tags,
  Upload,
  Sparkles,
  CalendarRange,
  Settings, 
  ChevronLeft, 
  ChevronRight,
  LogOut,
  LucideIcon,
  PlusCircle,
  ShieldCheck
} from 'lucide-react'

interface MenuItem {
  icon: LucideIcon
  label: string
  href: string
  badge?: number
}

type SidebarProps = {
  initialCollapsed?: boolean
  onNavigate?: () => void
  hideCollapseToggle?: boolean
  className?: string
}

export function AppSidebar({
  initialCollapsed,
  onNavigate,
  hideCollapseToggle = false,
  className,
}: SidebarProps) {
  // En móvil partimos colapsado para evitar layouts apretados
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (initialCollapsed !== undefined) return initialCollapsed
    if (typeof window === 'undefined') return false
    return window.innerWidth < 768
  })
  const pathname = usePathname()
  const { signOut, profile } = useAuth()

  const menuItems: MenuItem[] = [
    { icon: LayoutDashboard, label: 'Resumen', href: '/app/dashboard' },
    { icon: Wallet, label: 'Presupuesto', href: '/app/budget' },
    { icon: Receipt, label: 'Gastos', href: '/app/expenses' },
    { icon: CalendarRange, label: 'Mes a mes', href: '/app/monthly' },
    { icon: Tags, label: 'Clasificar', href: '/app/classify' },
    { icon: Upload, label: 'Exportar e importar', href: '/app/export-import' },
    { icon: Sparkles, label: 'Insights', href: '/app/insights' },
  ]

  const bottomItems: MenuItem[] = [
    ...(profile?.is_super_admin ? [{ icon: ShieldCheck, label: 'Super admin', href: '/app/super-admin' }] : []),
    { icon: Settings, label: 'Configuración', href: '/app/settings' },
  ]

  const handleLogout = async () => {
    await signOut()
    onNavigate?.()
  }

  return (
    <aside className={cn(
      'flex flex-col bg-sidebar text-sidebar-foreground transition-all duration-300',
      isCollapsed ? 'w-16' : 'w-64'
    , className)}>
      {/* Header */}
      <div className={cn(
        'flex items-center h-16 px-4 border-b border-white/10',
        isCollapsed ? 'justify-center' : 'justify-between'
      )}>
        {isCollapsed ? (
          <LogoIcon size="sm" />
        ) : (
          <Logo size="md" variant="white" />
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={cn(
            'h-8 w-8 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-white/10',
            isCollapsed && 'hidden'
          )}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
      </div>

      {/* Quick Action */}
      <div className="px-3 py-4">
        <Link href="/app/expenses?new=1">
          <Button 
            className={cn(
              'w-full bg-sidebar-accent hover:bg-sidebar-accent/90 text-white',
              isCollapsed ? 'px-2' : ''
            )}
            onClick={onNavigate}
          >
            <PlusCircle className="h-4 w-4" />
            {!isCollapsed && <span className="ml-2">Nuevo Gasto</span>}
          </Button>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive 
                  ? 'bg-sidebar-accent text-white' 
                  : 'text-sidebar-foreground/70 hover:bg-white/10 hover:text-sidebar-foreground',
                isCollapsed && 'justify-center px-2'
              )}
              onClick={onNavigate}
              title={isCollapsed ? item.label : undefined}
            >
              <Icon className="h-5 w-5 flex-shrink-0" />
              {!isCollapsed && (
                <>
                  <span className="flex-1">{item.label}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="inline-flex items-center justify-center w-5 h-5 text-xs rounded-full bg-white/20">
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Bottom Section */}
      <div className="border-t border-white/10 px-3 py-4 space-y-1">
        {bottomItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive 
                  ? 'bg-sidebar-accent text-white' 
                  : 'text-sidebar-foreground/70 hover:bg-white/10 hover:text-sidebar-foreground',
                isCollapsed && 'justify-center px-2'
              )}
              onClick={onNavigate}
              title={isCollapsed ? item.label : undefined}
            >
              <Icon className="h-5 w-5 flex-shrink-0" />
              {!isCollapsed && <span className="flex-1">{item.label}</span>}
            </Link>
          )
        })}

        <button
          onClick={handleLogout}
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors w-full',
            'text-sidebar-foreground/70 hover:bg-red-500/20 hover:text-red-400',
            isCollapsed && 'justify-center px-2'
          )}
        >
          <LogOut className="h-5 w-5 flex-shrink-0" />
          {!isCollapsed && <span className="flex-1 text-left">Cerrar Sesión</span>}
        </button>

        {/* Collapse toggle */}
        {isCollapsed && !hideCollapseToggle && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsCollapsed(false)}
            className="w-full mt-2 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-white/10"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </aside>
  )
}

