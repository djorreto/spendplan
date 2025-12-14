'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/use-auth'
import { useHousehold } from '@/hooks/use-household'
import { useSelectedMonth } from '@/hooks/use-selected-month'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getInitials, formatMonth } from '@/lib/utils'
import { 
  User, 
  Settings, 
  LogOut,
  ChevronDown,
  Home,
  Calendar
} from 'lucide-react'

export function AppTopbar() {
  const router = useRouter()
  const { profile, signOut } = useAuth()
  const { households, currentHousehold, setCurrentHousehold, createHousehold } = useHousehold()
  const { selectedMonth, setSelectedMonth } = useSelectedMonth(currentHousehold?.id)
  const [creating, setCreating] = useState(false)
  const [newHomeOpen, setNewHomeOpen] = useState(false)
  const [newHomeName, setNewHomeName] = useState('')
  const [newHomeCurrency, setNewHomeCurrency] = useState('CLP')
  const [newHomeTz, setNewHomeTz] = useState('America/Santiago')

  // Generate last 6 months for selector
  const months = Array.from({ length: 6 }, (_, i) => {
    const date = new Date()
    date.setMonth(date.getMonth() - i)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  })

  const handleLogout = async () => {
    await signOut()
    router.push('/login')
  }

  return (
    <>
    <header className="sticky top-0 z-40 flex h-14 sm:h-16 items-center gap-3 sm:gap-4 border-b bg-background px-3 sm:px-6">
      {/* Household Selector */}
      {households.length > 1 && (
        <Select
          value={currentHousehold?.id}
          onValueChange={(id) => {
            if (id === 'create-new') {
              setNewHomeOpen(true)
              return
            }
            const h = households.find(h => h.id === id)
            if (h) setCurrentHousehold(h)
          }}
        >
          <SelectTrigger className="w-[130px] sm:w-[180px] h-10 sm:h-11 text-sm">
            <Home className="h-4 w-4 mr-2 shrink-0" />
            <SelectValue placeholder="Seleccionar hogar" />
          </SelectTrigger>
          <SelectContent>
            {households.map(h => (
              <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
            ))}
            <SelectItem value="create-new">+ Crear nuevo hogar</SelectItem>
          </SelectContent>
        </Select>
      )}

      {households.length <= 1 && currentHousehold && (
        <div className="flex items-center gap-2 text-sm">
          <Home className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{currentHousehold.name}</span>
        </div>
      )}

      {/* Month Selector */}
      <Select value={selectedMonth} onValueChange={setSelectedMonth}>
        <SelectTrigger className="w-[150px] sm:w-[200px] h-10 sm:h-11 text-sm">
          <Calendar className="h-4 w-4 mr-2 shrink-0" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {months.map(m => (
            <SelectItem key={m} value={m}>{formatMonth(m)}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex-1" />

      {/* Actions */}
      <div className="flex items-center gap-2">
        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 px-2">
              <Avatar className="h-7 w-7 sm:h-8 sm:w-8 ring-2 ring-primary/20 bg-muted">
                <AvatarImage src={profile?.avatar_url || undefined} alt={profile?.full_name || ''} />
                <AvatarFallback className="bg-primary text-primary-foreground flex items-center justify-center">
                  <User className="h-5 w-5" />
                </AvatarFallback>
              </Avatar>
              <div className="hidden md:block text-left">
                <p className="text-sm font-medium leading-none">{profile?.full_name || 'Usuario'}</p>
                <p className="text-xs text-muted-foreground truncate max-w-[140px]">{profile?.email}</p>
              </div>
              <ChevronDown className="hidden md:block h-4 w-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Mi Cuenta</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a href="/app/dashboard">
                <Home className="mr-2 h-4 w-4" />
                Inicio
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href="/app/settings">
                <User className="mr-2 h-4 w-4" />
                Perfil
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href="/app/settings">
                <Settings className="mr-2 h-4 w-4" />
                Configuración
              </a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              onClick={handleLogout}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Cerrar Sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
    <Dialog open={newHomeOpen} onOpenChange={setNewHomeOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Crear nuevo hogar</DialogTitle>
          <DialogDescription>Configura un nombre, moneda y zona horaria.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <div className="space-y-1">
            <label className="text-sm font-medium">Nombre</label>
            <Input
              value={newHomeName}
              onChange={(e) => setNewHomeName(e.target.value)}
              placeholder="Ej: Familia Pérez"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Moneda</label>
            <Input
              value={newHomeCurrency}
              onChange={(e) => setNewHomeCurrency(e.target.value || 'CLP')}
              placeholder="CLP"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Zona horaria</label>
            <Input
              value={newHomeTz}
              onChange={(e) => setNewHomeTz(e.target.value || 'America/Santiago')}
              placeholder="America/Santiago"
            />
          </div>
        </div>
        <DialogFooter className="mt-4">
          <DialogClose asChild>
            <Button variant="outline">Cancelar</Button>
          </DialogClose>
          <Button
            onClick={async () => {
              if (!newHomeName.trim()) return
              setCreating(true)
              const { household, error } = await createHousehold(newHomeName.trim(), newHomeCurrency.trim(), newHomeTz.trim())
              setCreating(false)
              if (!error && household) {
                setCurrentHousehold(household as any)
                setNewHomeOpen(false)
                setNewHomeName('')
              }
            }}
            disabled={creating || !newHomeName.trim()}
          >
            {creating ? 'Creando...' : 'Crear hogar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}

