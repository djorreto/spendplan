'use client'

import { MainLayout } from '@/components/layout/main-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  Users, 
  FileText, 
  TrendingUp, 
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Plus
} from 'lucide-react'

/**
 * Dashboard de ejemplo
 * Personaliza las métricas y tarjetas según tu dominio
 */
export default function DashboardPage() {
  // Usuario de ejemplo (reemplaza con tu lógica de auth)
  const mockUser = {
    name: 'Usuario Demo',
    email: 'demo@ejemplo.com'
  }

  return (
    <MainLayout user={mockUser}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Dashboard</h1>
            <p className="text-muted-foreground">
              Bienvenido de vuelta, {mockUser.name}
            </p>
          </div>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo Item
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Usuarios Totales"
            value="1,234"
            change="+12.5%"
            trend="up"
            icon={Users}
          />
          <StatCard
            title="Documentos"
            value="567"
            change="+8.2%"
            trend="up"
            icon={FileText}
          />
          <StatCard
            title="Ingresos"
            value="$45,231"
            change="-3.1%"
            trend="down"
            icon={TrendingUp}
          />
          <StatCard
            title="Eventos"
            value="23"
            change="+2"
            trend="up"
            icon={Calendar}
          />
        </div>

        {/* Content Grid */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle>Actividad Reciente</CardTitle>
              <CardDescription>
                Últimas acciones en la plataforma
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentActivities.map((activity, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${activity.color}`}>
                      <activity.icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{activity.title}</p>
                      <p className="text-xs text-muted-foreground">{activity.time}</p>
                    </div>
                    <Badge variant="outline">{activity.type}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Acciones Rápidas</CardTitle>
              <CardDescription>
                Tareas frecuentes
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" className="h-auto py-4 flex flex-col gap-2">
                  <Plus className="h-6 w-6" />
                  <span>Nuevo Usuario</span>
                </Button>
                <Button variant="outline" className="h-auto py-4 flex flex-col gap-2">
                  <FileText className="h-6 w-6" />
                  <span>Subir Documento</span>
                </Button>
                <Button variant="outline" className="h-auto py-4 flex flex-col gap-2">
                  <Calendar className="h-6 w-6" />
                  <span>Crear Evento</span>
                </Button>
                <Button variant="outline" className="h-auto py-4 flex flex-col gap-2">
                  <TrendingUp className="h-6 w-6" />
                  <span>Ver Reportes</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  )
}

// ========================================
// Sub-componentes
// ========================================

interface StatCardProps {
  title: string
  value: string
  change: string
  trend: 'up' | 'down'
  icon: React.ElementType
}

function StatCard({ title, value, change, trend, icon: Icon }: StatCardProps) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="p-2 rounded-lg bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div className={`flex items-center text-sm ${
            trend === 'up' ? 'text-green-600' : 'text-red-600'
          }`}>
            {trend === 'up' ? (
              <ArrowUpRight className="h-4 w-4" />
            ) : (
              <ArrowDownRight className="h-4 w-4" />
            )}
            {change}
          </div>
        </div>
        <div className="mt-4">
          <h3 className="text-2xl font-bold">{value}</h3>
          <p className="text-sm text-muted-foreground">{title}</p>
        </div>
      </CardContent>
    </Card>
  )
}

// ========================================
// Mock Data
// ========================================

const recentActivities = [
  {
    title: 'Nuevo usuario registrado',
    time: 'Hace 5 minutos',
    type: 'Usuario',
    icon: Users,
    color: 'bg-blue-100 text-blue-600'
  },
  {
    title: 'Documento subido',
    time: 'Hace 15 minutos',
    type: 'Documento',
    icon: FileText,
    color: 'bg-green-100 text-green-600'
  },
  {
    title: 'Reporte generado',
    time: 'Hace 1 hora',
    type: 'Sistema',
    icon: TrendingUp,
    color: 'bg-purple-100 text-purple-600'
  },
  {
    title: 'Evento programado',
    time: 'Hace 2 horas',
    type: 'Evento',
    icon: Calendar,
    color: 'bg-orange-100 text-orange-600'
  },
]

