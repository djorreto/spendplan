'use client'

export const dynamic = 'force-dynamic'

import { useMemo, useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useHousehold } from '@/hooks/use-household'
import { useSelectedMonth } from '@/hooks/use-selected-month'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/components/ui/toast'
import { formatCurrency, formatDate, formatMonth, getInitials, getMonthDateRange } from '@/lib/utils'
import { supabaseBrowser } from '@/lib/supabase'
import { endOp, formatSupabaseError, logOp, startOp, withRetry } from '@/lib/debug-log'
import { 
  Receipt,
  Plus,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Wallet,
  Sparkles
} from 'lucide-react'

// Demo mode constants (must match budget/page.tsx)
const DEMO_BUDGET_KEY = 'spendplan_demo_budget_v2'
const DEMO_EXPENSES_KEY = 'spendplan_demo_expenses'
const DEMO_CATEGORIES_KEY = 'spendplan_demo_custom_categories'

const DEMO_CATEGORIES = [
  { id: 'cat-1', name: 'Alimentación', color: '#22c55e' },
  { id: 'cat-2', name: 'Transporte', color: '#3b82f6' },
  { id: 'cat-3', name: 'Entretenimiento', color: '#a855f7' },
  { id: 'cat-4', name: 'Salud', color: '#ef4444' },
  { id: 'cat-5', name: 'Educación', color: '#f59e0b' },
  { id: 'cat-6', name: 'Hogar', color: '#06b6d4' },
  { id: 'cat-7', name: 'Ropa', color: '#ec4899' },
  { id: 'cat-8', name: 'Supermercado', color: '#84cc16' },
  { id: 'cat-9', name: 'Servicios', color: '#64748b' },
  { id: 'cat-10', name: 'Otros', color: '#78716c' },
  { id: 'cat-11', name: 'Restaurantes', color: '#f59e0b' },
]

interface BudgetItem {
  id: string
  name: string
  amount: number
  kind: 'income' | 'expense'
  type?: 'fixed' | 'variable'
  category_id: string
  is_active: boolean
  start_date?: string
  end_date?: string
  is_indefinite?: boolean
}

interface Expense {
  id: string
  amount: number
  description: string
  merchant: string
  expense_date: string
  category_id: string | null
  is_unbudgeted?: boolean
  created_by?: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  created_by_profile?: any
}

interface Category {
  id: string
  name: string
  color: string
}

interface DashboardData {
  totalIncome: number
  totalFixed: number
  totalVariableBudget: number
  totalVariableSpent: number
  totalUnbudgeted: number
  availableReal: number
  spendByUser: Array<{
    id: string
    name: string
    amount: number
    count: number
    avatar_url?: string | null
  }>
  recentExpenses: Array<{
    id: string
    amount: number
    description: string
    merchant: string
    expense_date: string
    category_name: string
    created_by_name?: string
    created_by_avatar_url?: string | null
  }>
  daysInMonth: number
  daysPassed: number
}

export default function DashboardPage() {
  const { currentHousehold, isDemoMode } = useHousehold()
  const { user, profile } = useAuth()
  const { selectedMonth } = useSelectedMonth(currentHousehold?.id)
  const { addToast } = useToast()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [includeFixedInPeople, setIncludeFixedInPeople] = useState(false)

  useEffect(() => {
    if (currentHousehold) {
      loadDashboardData()
    }
  }, [currentHousehold?.id, currentHousehold?.currency, isDemoMode, selectedMonth])

  const loadDashboardData = async () => {
    if (!currentHousehold) return
    setLoading(true)
    
    // Solo es demo si explícitamente está en modo demo Y el household es de demo
    const isDemo = isDemoMode && currentHousehold.id.startsWith('demo-')
    
    const op = startOp('dashboard.loadData', { householdId: currentHousehold.id, month: selectedMonth, isDemo })

    // Calculate days in month and days passed
    const [yy, mm] = selectedMonth.split('-').map(Number)
    const daysInMonth = new Date(yy, mm, 0).getDate()
    const now = new Date()
    const sameMonth = now.getFullYear() === yy && now.getMonth() + 1 === mm
    const daysPassed = sameMonth ? Math.min(now.getDate(), daysInMonth) : daysInMonth
    
    if (isDemo) {
      const budgetData = JSON.parse(localStorage.getItem(DEMO_BUDGET_KEY) || '{"items":[]}')
      const budgetItems: BudgetItem[] = budgetData.items || []
      const allExpenses: Expense[] = JSON.parse(localStorage.getItem(DEMO_EXPENSES_KEY) || '[]')
      const customCategories: Category[] = JSON.parse(localStorage.getItem(DEMO_CATEGORIES_KEY) || '[]')
      const categories = [...DEMO_CATEGORIES, ...customCategories]
      
      const monthExpenses = allExpenses.filter(e => e.expense_date?.startsWith(selectedMonth))
      
      const isItemActive = (item: BudgetItem) => {
        if (item.is_active === false) return false
        const today = new Date().toISOString().split('T')[0]
        if (item.start_date && item.start_date > today) return false
        if (!item.is_indefinite && item.end_date && item.end_date < today) return false
        return true
      }
      
      const activeIncomes = budgetItems.filter(i => i.kind === 'income' && isItemActive(i))
      const activeFixed = budgetItems.filter(i => i.kind === 'expense' && i.type === 'fixed' && isItemActive(i))
      const activeVariable = budgetItems.filter(i => i.kind === 'expense' && i.type === 'variable' && isItemActive(i))
      
      const totalIncome = activeIncomes.reduce((sum, i) => sum + i.amount, 0)
      const totalFixed = activeFixed.reduce((sum, i) => sum + i.amount, 0)
      const totalVariableBudget = activeVariable.reduce((sum, i) => sum + i.amount, 0)
      
      const budgetedCategoryIds = new Set(activeVariable.map(v => v.category_id))
      
      const totalVariableSpent = monthExpenses
        .filter(e => e.category_id && budgetedCategoryIds.has(e.category_id))
        .reduce((sum, e) => sum + e.amount, 0)
      
      const totalUnbudgeted = monthExpenses
        .filter(e => e.is_unbudgeted || !e.category_id || !budgetedCategoryIds.has(e.category_id))
        .reduce((sum, e) => sum + e.amount, 0)
      
      const availableReal = totalIncome - totalFixed - totalVariableSpent - totalUnbudgeted
      
      // Spend by user (created_by)
      const spendMap = new Map<string, { id: string; name: string; amount: number; count: number; avatar_url?: string | null }>()
      monthExpenses.forEach((e: any) => {
        const uid = e.created_by || 'unassigned'
        const name =
          uid === (user?.id || '')
            ? (profile?.full_name || 'Tú')
            : uid === 'unassigned'
              ? 'Sin asignar'
              : `Usuario ${String(uid).slice(-4)}`
        const existing = spendMap.get(uid) || { id: uid, name, amount: 0, count: 0, avatar_url: null }
        spendMap.set(uid, { ...existing, amount: existing.amount + (e.amount || 0), count: existing.count + 1 })
      })
      const spendByUser = Array.from(spendMap.values()).sort((a, b) => b.amount - a.amount)

      const recentExpenses = monthExpenses
        .sort((a, b) => b.expense_date.localeCompare(a.expense_date))
        .slice(0, 5)
        .map(e => {
          const cat = categories.find(c => c.id === e.category_id)
          return {
            id: e.id,
            amount: e.amount,
            description: e.description,
            merchant: e.merchant,
            expense_date: e.expense_date,
            category_name: cat?.name || (e.is_unbudgeted ? 'No presupuestado' : 'Sin categoría'),
            created_by_name: (e as any).created_by ? ((e as any).created_by === user?.id ? (profile?.full_name || 'Tú') : undefined) : undefined,
            created_by_avatar_url: profile?.avatar_url || null,
          }
        })
      
      setData({
        totalIncome,
        totalFixed,
        totalVariableBudget,
        totalVariableSpent,
        totalUnbudgeted,
        availableReal,
        spendByUser,
        recentExpenses,
        daysInMonth,
        daysPassed
      })
      endOp(op, true, {
        totalIncome,
        totalFixed,
        totalVariableBudget,
        totalVariableSpent,
        totalUnbudgeted,
      })
      setLoading(false)
    } else {
      // Load from Supabase for real users (budget + expenses)
      try {
        const supabase = supabaseBrowser()
        const range = getMonthDateRange(selectedMonth)

        const [expensesResp, budgetResp] = await Promise.all([
          withRetry(
            () =>
              supabase
                .from('expenses')
                .select('id, amount, description, merchant, expense_date, category_id, is_unbudgeted, created_by, status, category:categories!expenses_category_id_fkey(name), created_by_profile:profiles!expenses_created_by_fkey(full_name, email, avatar_url)')
                .eq('household_id', currentHousehold.id)
                .gte('expense_date', range.start)
                .lt('expense_date', range.endExclusive)
                .eq('status', 'confirmed')
                .order('expense_date', { ascending: false })
                .limit(500),
            { retries: 2, baseDelayMs: 250, ctx: op, step: 'select.expenses' }
          ),
          withRetry(
            () =>
              supabase
                .from('budget_items')
                .select('id, kind, type, amount, category_id, is_active, start_date, end_date, is_indefinite')
                .eq('household_id', currentHousehold.id),
            { retries: 2, baseDelayMs: 250, ctx: op, step: 'select.budget_items' }
          ),
        ])

        if (expensesResp.error) throw expensesResp.error
        if (budgetResp.error) throw budgetResp.error

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const monthExpenses: any[] = expensesResp.data || []
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const budgetItems: any[] = budgetResp.data || []

        const isItemActive = (item: any) => {
          if (item.is_active === false) return false
          const today = new Date().toISOString().split('T')[0]
          if (item.start_date && item.start_date > today) return false
          if (!item.is_indefinite && item.end_date && item.end_date < today) return false
          return true
        }

        const activeIncomes = budgetItems.filter((i) => i.kind === 'income' && isItemActive(i))
        const activeFixed = budgetItems.filter((i) => i.kind === 'expense' && i.type === 'fixed' && isItemActive(i))
        const activeVariable = budgetItems.filter((i) => i.kind === 'expense' && i.type === 'variable' && isItemActive(i))

        const totalIncome = activeIncomes.reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0)
        const totalFixed = activeFixed.reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0)
        const totalVariableBudget = activeVariable.reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0)

        const budgetedCategoryIds = new Set(activeVariable.map((v) => v.category_id).filter(Boolean))

        const totalVariableSpent = monthExpenses
          .filter((e) => e.category_id && budgetedCategoryIds.has(e.category_id))
          .reduce((sum, e) => sum + (e.amount || 0), 0)

        const totalUnbudgeted = monthExpenses
          .filter((e) => e.is_unbudgeted || !e.category_id || !budgetedCategoryIds.has(e.category_id))
          .reduce((sum, e) => sum + (e.amount || 0), 0)

        const availableReal = totalIncome - totalFixed - totalVariableSpent - totalUnbudgeted

        // Spend by user (created_by)
        const spendMap = new Map<string, { id: string; name: string; amount: number; count: number; avatar_url?: string | null }>()
        monthExpenses.forEach((e: any) => {
          const uid = e.created_by || 'unassigned'
          const name =
            uid === 'unassigned'
              ? 'Sin asignar'
              : (e.created_by_profile?.full_name || e.created_by_profile?.email || 'Usuario')
          const existing = spendMap.get(uid) || { id: uid, name, amount: 0, count: 0, avatar_url: e.created_by_profile?.avatar_url || null }
          spendMap.set(uid, { ...existing, amount: existing.amount + (Number(e.amount) || 0), count: existing.count + 1 })
        })
        const spendByUser = Array.from(spendMap.values()).sort((a, b) => b.amount - a.amount)

        const recentExpenses = monthExpenses.slice(0, 5).map((e: any) => ({
          id: e.id,
          amount: e.amount,
          description: e.description || '',
          merchant: e.merchant || '',
          expense_date: e.expense_date,
          category_name: e.category?.name || (e.is_unbudgeted ? 'No presupuestado' : 'Sin categoría'),
          created_by_name: e.created_by_profile?.full_name || e.created_by_profile?.email || undefined,
          created_by_avatar_url: e.created_by_profile?.avatar_url || null,
        }))

        setData({
          totalIncome,
          totalFixed,
          totalVariableBudget,
          totalVariableSpent,
          totalUnbudgeted,
          availableReal,
          spendByUser,
          recentExpenses,
          daysInMonth,
          daysPassed,
        })

        endOp(op, true, {
          totalIncome,
          totalFixed,
          totalVariableBudget,
          totalVariableSpent,
          totalUnbudgeted,
        })
      } catch (error) {
        console.error('Error loading dashboard data:', error)
        logOp(op, 'error', 'load failed', 'loadDashboardData', { error: formatSupabaseError(error) })
        endOp(op, false)
        addToast({ type: 'error', message: `Error al cargar resumen (opId: ${op.opId})` })

        // Evitar “flash” a ceros: si ya teníamos data, la mantenemos.
        setData((prev) =>
          prev || {
            totalIncome: 0,
            totalFixed: 0,
            totalVariableBudget: 0,
            totalVariableSpent: 0,
            totalUnbudgeted: 0,
            availableReal: 0,
            spendByUser: [],
            recentExpenses: [],
            daysInMonth,
            daysPassed,
          }
        )
      }
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-40 bg-muted animate-pulse rounded-lg" />
        <div className="h-64 bg-muted animate-pulse rounded-lg" />
      </div>
    )
  }

  // Calculate budget compliance
  const totalBudget = (data?.totalVariableBudget || 0)
  const totalSpent = (data?.totalVariableSpent || 0) + (data?.totalUnbudgeted || 0)
  const budgetUsedPercent = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0
  const hasIncome = (data?.totalIncome || 0) > 0
  const budgetRemaining = totalBudget - totalSpent
  
  // Calculate expected spending based on days passed
  const expectedPercent = data ? Math.round((data.daysPassed / data.daysInMonth) * 100) : 0
  
  // Check if there's any data at all
  const hasAnyData = data && (data.totalVariableBudget > 0 || data.recentExpenses.length > 0 || data.totalVariableSpent > 0 || data.totalUnbudgeted > 0 || data.totalIncome > 0)
  
  // Determine status
  const getStatus = () => {
    if (!data || (!hasAnyData && totalBudget === 0)) {
      return { 
        icon: Sparkles, 
        color: 'text-primary', 
        bg: 'bg-primary/5', 
        message: '¡Comienza configurando tu presupuesto mensual para llevar control de tus finanzas!',
        showBudgetLink: true
      }
    }
    
    if (totalBudget === 0) {
      return { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50', message: 'Configura tu presupuesto variable para ver el progreso del mes.' }
    }
    
    const difference = budgetUsedPercent - expectedPercent

    // Mode without income: focus on budget tracking (no "balance" language)
    if (!hasIncome) {
      if (budgetUsedPercent > 100) {
        return {
          icon: AlertTriangle,
          color: 'text-red-600',
          bg: 'bg-red-50',
          message: `Has superado tu presupuesto variable en un ${budgetUsedPercent - 100}%. Presupuesto restante: ${formatCurrency(budgetRemaining, currentHousehold?.currency)}.`
        }
      }
      if (difference > 20) {
        return {
          icon: TrendingUp,
          color: 'text-amber-600',
          bg: 'bg-amber-50',
          message: `Vas adelantado en gastos (${budgetUsedPercent}% gastado, esperado ~${expectedPercent}%). Presupuesto restante: ${formatCurrency(budgetRemaining, currentHousehold?.currency)}.`
        }
      }
      if (difference > 0 && difference <= 20) {
        return {
          icon: CheckCircle,
          color: 'text-green-600',
          bg: 'bg-green-50',
          message: `Vas bien. Has gastado ${budgetUsedPercent}% de tu presupuesto y van ${expectedPercent}% del mes. Presupuesto restante: ${formatCurrency(budgetRemaining, currentHousehold?.currency)}.`
        }
      }
      return {
        icon: TrendingDown,
        color: 'text-green-600',
        bg: 'bg-green-50',
        message: `¡Excelente! Vas por debajo del ritmo esperado (${budgetUsedPercent}% gastado vs ${expectedPercent}% del mes). Presupuesto restante: ${formatCurrency(budgetRemaining, currentHousehold?.currency)}.`
      }
    }

    // Mode with income: keep "balance" and deficit language
    const availableReal = data.availableReal

    if (availableReal < 0) {
      return {
        icon: XCircle,
        color: 'text-red-600',
        bg: 'bg-red-50',
        message: `⚠️ Estás en déficit de ${formatCurrency(Math.abs(availableReal), currentHousehold?.currency)}. Revisa tus gastos.`
      }
    }

    if (budgetUsedPercent > 100) {
      return {
        icon: AlertTriangle,
        color: 'text-red-600',
        bg: 'bg-red-50',
        message: `Has superado tu presupuesto variable en un ${budgetUsedPercent - 100}%. Te quedan ${formatCurrency(availableReal, currentHousehold?.currency)} disponibles.`
      }
    }
    
    if (difference > 20) {
      return { 
        icon: TrendingUp, 
        color: 'text-amber-600', 
        bg: 'bg-amber-50', 
        message: `Vas un poco adelantado en gastos (${budgetUsedPercent}% gastado, esperado ~${expectedPercent}%). Modera el ritmo para llegar bien a fin de mes.`
      }
    }
    
    if (difference > 0 && difference <= 20) {
      return { 
        icon: CheckCircle, 
        color: 'text-green-600', 
        bg: 'bg-green-50', 
        message: `Vas bien. Has gastado ${budgetUsedPercent}% de tu presupuesto variable y van ${expectedPercent}% del mes. Balance: ${formatCurrency(availableReal, currentHousehold?.currency)}.`
      }
    }
    
    return { 
      icon: TrendingDown, 
      color: 'text-green-600', 
      bg: 'bg-green-50', 
      message: `¡Excelente! Vas por debajo del ritmo esperado (${budgetUsedPercent}% gastado vs ${expectedPercent}% del mes). Balance disponible: ${formatCurrency(availableReal, currentHousehold?.currency)}.`
    }
  }
  
  const status = getStatus()
  const StatusIcon = status.icon

  const spendRows = useMemo(() => {
    const base = data?.spendByUser || []
    if (!includeFixedInPeople) return base
    const fixed = data?.totalFixed || 0
    if (fixed <= 0) return base
    return [
      ...base,
      { id: 'household-fixed', name: 'Hogar (fijos)', amount: fixed, count: 0, avatar_url: null },
    ].sort((a, b) => b.amount - a.amount)
  }, [data?.spendByUser, data?.totalFixed, includeFixedInPeople])

  const maxSpend = useMemo(() => {
    const vals = spendRows.map((r) => r.amount)
    return vals.length ? Math.max(...vals) : 0
  }, [spendRows])

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">¿Cómo va el mes?</h1>
          <p className="text-muted-foreground text-sm">
            {formatMonth(selectedMonth)} · Día {data?.daysPassed} de {data?.daysInMonth}
          </p>
        </div>
        <Link href="/app/expenses/new">
          <Button size="sm">
            <Plus className="mr-1 h-4 w-4" />
            Gasto
          </Button>
        </Link>
      </div>

      {/* Status Card */}
      <Card className={`${status.bg} border-2`}>
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className={`p-3 rounded-full ${status.bg}`}>
              <StatusIcon className={`h-6 w-6 ${status.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-base sm:text-lg font-medium leading-snug break-words ${status.color}`}>
                {status.message}
              </p>
              
              {'showBudgetLink' in status && status.showBudgetLink && (
                <div className="mt-4">
                  <Link href="/app/budget">
                    <Button variant="default" size="sm">
                      <Plus className="mr-2 h-4 w-4" />
                      Configurar presupuesto
                    </Button>
                  </Link>
                </div>
              )}
              
              {totalBudget > 0 && (
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Presupuesto variable usado</span>
                    <span className="font-medium">{budgetUsedPercent}%</span>
                  </div>
                  <Progress 
                    value={Math.min(budgetUsedPercent, 100)} 
                    className="h-3"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{formatCurrency(totalSpent, currentHousehold?.currency)} gastado</span>
                    <span>de {formatCurrency(totalBudget, currentHousehold?.currency)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Spend by person */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg">Gasto por persona</CardTitle>
              <CardDescription>Según quién registró el gasto (created_by)</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIncludeFixedInPeople((v) => !v)}
              className="whitespace-nowrap"
            >
              {includeFixedInPeople ? 'Ocultar fijos' : 'Incluir fijos'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {spendRows.length === 0 ? (
            <div className="text-sm text-muted-foreground">Aún no hay gastos registrados este mes.</div>
          ) : (
            <div className="space-y-4">
              {spendRows.map((row) => (
                <div key={row.id} className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={row.avatar_url || undefined} />
                        <AvatarFallback className={row.id === 'household-fixed' ? 'bg-muted text-foreground' : 'bg-primary text-primary-foreground'}>
                          {row.id === 'household-fixed' ? 'H' : getInitials(row.name || 'U')}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{row.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {row.id === 'household-fixed' ? 'Plan fijo del hogar' : `${row.count} gasto(s)`}
                        </p>
                      </div>
                    </div>
                    <div className="text-sm font-semibold tabular-nums">
                      {formatCurrency(row.amount, currentHousehold?.currency)}
                    </div>
                  </div>
                  <Progress value={maxSpend > 0 ? Math.round((row.amount / maxSpend) * 100) : 0} className="h-2" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Link to Budget */}
      <Link href="/app/budget">
        <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
          <CardContent className="p-4 flex items-center justify-between">
            <span className="font-medium">Ver presupuesto completo</span>
            <ArrowRight className="h-5 w-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>

      {/* Recent Expenses */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Gastos Recientes</CardTitle>
              <CardDescription>Últimas transacciones del mes</CardDescription>
            </div>
            <Link href="/app/expenses">
              <Button variant="ghost" size="sm">
                Ver todos
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {data?.recentExpenses && data.recentExpenses.length > 0 ? (
              data.recentExpenses.map((expense) => (
                <div key={expense.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                      <Receipt className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{expense.merchant || expense.description || 'Gasto'}</p>
                      <p className="text-xs text-muted-foreground">
                        {expense.category_name} · {formatDate(expense.expense_date)}
                        {expense.created_by_name ? ` · ${expense.created_by_name}` : ''}
                      </p>
                    </div>
                  </div>
                  <span className="font-semibold tabular-nums">
                    {formatCurrency(expense.amount, currentHousehold?.currency)}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-center py-8 space-y-4">
                <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
                  <Wallet className="h-8 w-8 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-lg">¡Bienvenido a SpendPlan!</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Comienza registrando tu primer gasto del mes
                  </p>
                </div>
                <Link href="/app/expenses/new">
                  <Button className="mt-2">
                    <Plus className="mr-2 h-4 w-4" />
                    Registrar primer gasto
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
