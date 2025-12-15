'use client'

export const dynamic = 'force-dynamic'

import { useMemo, useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
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
import { TelegramReminder } from '@/components/telegram/telegram-reminder'
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

const PIE_COLORS = ['#22c55e', '#3b82f6', '#a855f7', '#f59e0b', '#ef4444', '#06b6d4', '#84cc16', '#ec4899', '#64748b']

function isItemActiveByDate(item: BudgetItem, referenceDate: Date = new Date()): boolean {
  if ((item as any).is_active === false) return false
  const startDate = item.start_date ? new Date(item.start_date) : null
  const endDate = item.end_date ? new Date(item.end_date) : null
  if (startDate && referenceDate < startDate) return false
  if (!item.is_indefinite && endDate) {
    const end = new Date(endDate)
    end.setMonth(end.getMonth() + 1)
    end.setDate(0)
    if (referenceDate > end) return false
  }
  return true
}

const getMonthlyAmount = (item: BudgetItem & { frequency?: string }) => {
  const freq = (item as any).frequency || 'monthly'
  const multipliers: Record<string, number> = {
    monthly: 1,
    weekly: 4.33,
    biweekly: 2,
    yearly: 1 / 12,
    one_time: 1,
  }
  return (item.amount || 0) * (multipliers[freq] || 1)
}

export default function DashboardPage() {
  const { currentHousehold, isDemoMode } = useHousehold()
  const { user, profile } = useAuth()
  const { selectedMonth } = useSelectedMonth(currentHousehold?.id)
  const { addToast } = useToast()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [includeFixedInPeople, setIncludeFixedInPeople] = useState(false)
  const [collapseRecent, setCollapseRecent] = useState(false)
  const [collapsePeople, setCollapsePeople] = useState(false)
  const [allExpenses, setAllExpenses] = useState<Expense[]>([])
  const [chartBudgetItems, setChartBudgetItems] = useState<BudgetItem[]>([])
  const [chartMonthsFilter, setChartMonthsFilter] = useState(12)
  const [pieChartMonth, setPieChartMonth] = useState(selectedMonth)
  const [complianceMonth, setComplianceMonth] = useState(selectedMonth)

  const getLastMonths = (n: number): string[] => {
    const months: string[] = []
    const today = new Date()
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    return months
  }

  useEffect(() => {
    if (currentHousehold) {
      loadDashboardData()
    }
  }, [currentHousehold?.id, currentHousehold?.currency, isDemoMode, selectedMonth])

  useEffect(() => {
    setPieChartMonth(selectedMonth)
  }, [selectedMonth])

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
      setAllExpenses(allExpenses)
      setChartBudgetItems(budgetItems)
      
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
      
      const totalVariableSpent = monthExpenses.reduce((sum, e) => {
        const isBudgetedCat = !!e.category_id && budgetedCategoryIds.has(e.category_id)
        const countAsVariable = isBudgetedCat && !e.is_unbudgeted
        return countAsVariable ? sum + e.amount : sum
      }, 0)
      
      const totalUnbudgeted = monthExpenses.reduce((sum, e) => {
        const isBudgetedCat = !!e.category_id && budgetedCategoryIds.has(e.category_id)
        const countAsUnbudgeted = e.is_unbudgeted || !isBudgetedCat
        return countAsUnbudgeted ? sum + e.amount : sum
      }, 0)
      
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
      const chartMonthsWindow = Math.max(chartMonthsFilter, 12)
      const chartMonthsRange = getLastMonths(chartMonthsWindow)
      const chartRangeStart = `${chartMonthsRange[0]}-01`
      const nextMonth = new Date()
      nextMonth.setMonth(nextMonth.getMonth() + 1, 1)
      const chartRangeEndExclusive = nextMonth.toISOString().slice(0, 10)

      const range = getMonthDateRange(selectedMonth)

        const [expensesResp, budgetResp] = await Promise.all([
          withRetry(
            () =>
              supabase
                .from('expenses')
                .select('id, amount, description, merchant, expense_date, category_id, is_unbudgeted, created_by, status, category:categories!expenses_category_id_fkey(name), created_by_profile:profiles!expenses_created_by_fkey(full_name, email, avatar_url)')
                .eq('household_id', currentHousehold.id)
              .gte('expense_date', chartRangeStart)
              .lt('expense_date', chartRangeEndExclusive)
                .eq('status', 'confirmed')
                .order('expense_date', { ascending: false })
              .limit(1000),
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

        const allExpensesData: any[] = expensesResp.data || []
        const monthExpenses: any[] = allExpensesData.filter(
          (e: any) => e.expense_date.startsWith(selectedMonth)
        )
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const budgetItems: any[] = budgetResp.data || []
        setAllExpenses(allExpensesData)
        setChartBudgetItems(budgetItems)

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

        const totalVariableSpent = monthExpenses.reduce((sum, e) => {
          const isBudgetedCat = !!e.category_id && budgetedCategoryIds.has(e.category_id)
          const countAsVariable = isBudgetedCat && !e.is_unbudgeted
          return countAsVariable ? sum + (e.amount || 0) : sum
        }, 0)

        const totalUnbudgeted = monthExpenses.reduce((sum, e) => {
          const isBudgetedCat = !!e.category_id && budgetedCategoryIds.has(e.category_id)
          const countAsUnbudgeted = e.is_unbudgeted || !isBudgetedCat
          return countAsUnbudgeted ? sum + (e.amount || 0) : sum
        }, 0)

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

  // NOTE: These memos must be declared before any early return (React hooks rule).
  const incomeVsExpensesData = useMemo(() => {
    const months = getLastMonths(chartMonthsFilter)
    return months.map((month) => {
      const monthExpenses = allExpenses.filter((e) => e.expense_date.startsWith(month))
      const totalSpent = monthExpenses.reduce((sum, e) => sum + (e.amount || 0), 0)

      const monthDate = new Date(`${month}-15`)
      const activeIncomes = chartBudgetItems.filter((i) => i.kind === 'income' && isItemActiveByDate(i, monthDate))
      const monthIncome = activeIncomes.reduce((sum, i) => sum + (i.amount || 0), 0)

      const [year, m] = month.split('-')
      const monthName = new Date(parseInt(year), parseInt(m) - 1).toLocaleDateString('es-CL', { month: 'short' })

      return {
        month: `${monthName} ${year.slice(2)}`,
        fullMonth: month,
        Ingresos: monthIncome,
        Gastos: totalSpent,
        balance: monthIncome - totalSpent,
      }
    })
  }, [allExpenses, chartBudgetItems, chartMonthsFilter])

  const availableMonths = useMemo(() => {
    const set = new Set<string>()
    allExpenses.forEach((e) => {
      if (e.expense_date) set.add(e.expense_date.slice(0, 7))
    })
    const arr = Array.from(set).sort().reverse()
    return arr.length ? arr : [selectedMonth]
  }, [allExpenses, selectedMonth])

  const expensesByCategoryData = useMemo(() => {
    const monthExpenses = allExpenses.filter((e) => e.expense_date?.startsWith(pieChartMonth))
    const byCategory: Record<string, { name: string; value: number; color?: string }> = {}
    monthExpenses.forEach((exp) => {
      const catId = exp.category_id || 'sin-categoria'
      const name = (exp as any).category?.name || (exp.is_unbudgeted ? 'No presupuestado' : 'Sin categoría')
      byCategory[catId] = byCategory[catId] || { name, value: 0 }
      byCategory[catId].value += Number(exp.amount) || 0
    })
    return Object.entries(byCategory).map(([_, v]) => v)
  }, [allExpenses, pieChartMonth])

  const budgetComplianceData = useMemo(() => {
    const monthExpenses = allExpenses.filter((e) => e.expense_date?.startsWith(complianceMonth))
    const monthDate = new Date(`${complianceMonth}-15`)

    const activeVariables = chartBudgetItems.filter(
      (i) => i.kind === 'expense' && i.type === 'variable' && isItemActiveByDate(i, monthDate)
    )

    return activeVariables.map((item) => {
      const budgeted = getMonthlyAmount(item)
      const spent = monthExpenses
        .filter((e) => e.category_id === item.category_id)
        .reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
      const percentage = budgeted > 0 ? (spent / budgeted) * 100 : 0
      return {
        name: item.name || 'Variable',
        categoryId: item.category_id,
        Presupuesto: budgeted,
        Real: spent,
        percentage,
        status: percentage > 100 ? 'over' : percentage > 80 ? 'warning' : 'ok',
      }
    })
  }, [allExpenses, chartBudgetItems, complianceMonth])

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

  if (loading) {
    return (
      <div className="space-y-3 sm:space-y-6 max-w-2xl mx-auto px-3 sm:px-0">
        <div className="h-8 w-40 bg-muted animate-pulse rounded" />
        <div className="h-28 sm:h-36 bg-muted animate-pulse rounded-lg" />
        <div className="h-40 sm:h-52 bg-muted animate-pulse rounded-lg" />
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

  const hasBudget = totalBudget > 0

  return (
    <div className="max-w-2xl mx-auto px-3 sm:px-0 space-y-3 sm:space-y-6 pb-6">
      <TelegramReminder profile={profile} />
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5">
          <h1 className="text-xl sm:text-2xl font-bold">¿Cómo va el mes?</h1>
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

      {/* Resumen financiero (antes de detalles) */}
      <div className="space-y-2 p-3 bg-muted/20 rounded-xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="relative">
            <span className="absolute -left-2 top-3 px-2 py-1 text-[11px] font-semibold text-muted-foreground bg-muted rounded-full shadow-sm">+</span>
            <Card className="border-green-200 bg-green-50/70">
              <CardContent className="p-3 sm:p-4 text-center space-y-1">
                <p className="text-xs text-green-700 font-medium">Ingresos</p>
                <p className="text-base lg:text-lg font-bold text-green-700">
                  {formatCurrency(data?.totalIncome || 0, currentHousehold?.currency)}
                </p>
              </CardContent>
            </Card>
          </div>
          <div className="relative">
            <span className="absolute -left-2 top-3 px-2 py-1 text-[11px] font-semibold text-muted-foreground bg-muted rounded-full shadow-sm">−</span>
            <Card className="border-blue-200 bg-blue-50/70">
              <CardContent className="p-3 sm:p-4 text-center space-y-1">
                <p className="text-xs text-blue-700 font-medium">Fijos</p>
                <p className="text-base lg:text-lg font-bold text-blue-700">
                  {formatCurrency(data?.totalFixed || 0, currentHousehold?.currency)}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="relative">
            <span className="absolute -left-2 top-3 px-2 py-1 text-[11px] font-semibold text-muted-foreground bg-muted rounded-full shadow-sm">−</span>
            <Card className="border-amber-200 bg-amber-50/70">
              <CardContent className="p-3 sm:p-4 text-center space-y-1">
                <p className="text-xs text-amber-700 font-medium">Variables (gastado)</p>
                <p className="text-base lg:text-lg font-bold text-amber-700">
                  {formatCurrency(data?.totalVariableSpent || 0, currentHousehold?.currency)}
                </p>
                <p className="text-[11px] text-muted-foreground leading-tight">
                  de {formatCurrency(data?.totalVariableBudget || 0, currentHousehold?.currency)}
                </p>
              </CardContent>
            </Card>
          </div>
          <div className="relative">
            <span className="absolute -left-2 top-3 px-2 py-1 text-[11px] font-semibold text-muted-foreground bg-muted rounded-full shadow-sm">−</span>
            <Card className="border-red-300 bg-red-50/80">
              <CardContent className="p-3 sm:p-4 text-center space-y-1">
                <p className="text-xs text-red-700 font-medium">No Presup.</p>
                <p className="text-base lg:text-lg font-bold text-red-700">
                  {formatCurrency(data?.totalUnbudgeted || 0, currentHousehold?.currency)}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="relative">
          <span className="absolute -left-2 top-3 px-2 py-1 text-[11px] font-semibold text-muted-foreground bg-muted rounded-full shadow-sm">=</span>
          <Card
            className={`border-2 ${
              (data?.availableReal || 0) < 0
                ? 'border-red-500 bg-red-100'
                : 'border-green-500 bg-green-100'
            }`}
          >
            <CardContent className="p-3 sm:p-4 text-center space-y-1">
              <p
                className={`text-xs font-medium ${
                  (data?.availableReal || 0) < 0 ? 'text-red-600' : 'text-green-600'
                }`}
              >
                Balance
              </p>
              <p
                className={`text-lg lg:text-xl font-bold ${
                  (data?.availableReal || 0) < 0 ? 'text-red-700' : 'text-green-700'
                }`}
              >
                {formatCurrency(data?.availableReal || 0, currentHousehold?.currency)}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="border rounded-xl">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0 pb-3">
          <div className="flex items-center gap-3">
            <div className={`h-9 w-9 sm:h-10 sm:w-10 rounded-full flex items-center justify-center ${status.bg}`}>
              <StatusIcon className={`h-5 w-5 ${status.color}`} />
            </div>
            <div>
              <CardTitle className="text-base sm:text-lg">Resumen rápido</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                {formatMonth(selectedMonth)} · Día {data?.daysPassed} de {data?.daysInMonth}
              </CardDescription>
            </div>
          </div>
          <Button size="sm" variant="outline" asChild className="w-full sm:w-auto">
            <Link href="/app/budget">
              <Wallet className="h-4 w-4 mr-2" />
              Presupuesto
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-2 sm:space-y-3 p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2">
            <p className="text-xs text-muted-foreground">Gastado (variable + no pres.)</p>
            <p className="text-lg font-bold">{formatCurrency(totalSpent, currentHousehold?.currency)}</p>
          </div>
          {hasBudget ? (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2">
              <p className="text-xs text-muted-foreground">Presupuesto usado</p>
              <div className="flex items-center gap-2">
                <p className="text-lg font-bold">{budgetUsedPercent}%</p>
                <div className="w-32 sm:w-40 h-2 rounded-full bg-muted">
                  <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.min(budgetUsedPercent, 100)}%` }} />
                </div>
                <p className="text-[11px] text-muted-foreground">Esperado {expectedPercent}%</p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Configura tu presupuesto para ver el ritmo esperado.</p>
          )}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2">
            <p className="text-xs text-muted-foreground">{hasIncome ? 'Balance real' : 'Presupuesto restante'}</p>
            <p className="text-lg font-bold">
              {hasIncome
                ? formatCurrency(data?.availableReal || 0, currentHousehold?.currency)
                : formatCurrency(budgetRemaining, currentHousehold?.currency)}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-xl border">
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-base sm:text-lg">Ingresos vs Gastos</CardTitle>
              <CardDescription>Comparativa mensual</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm text-muted-foreground">Mostrar:</Label>
              <Select value={String(chartMonthsFilter)} onValueChange={(v) => setChartMonthsFilter(Number(v))}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">Últimos 3 meses</SelectItem>
                  <SelectItem value="6">Últimos 6 meses</SelectItem>
                  <SelectItem value="12">Últimos 12 meses</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {incomeVsExpensesData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={incomeVsExpensesData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(value: number) => formatCurrency(value, currentHousehold?.currency)}
                  labelStyle={{ color: 'var(--foreground)' }}
                  contentStyle={{
                    backgroundColor: 'var(--background)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                  }}
                />
                <Legend />
                <Bar dataKey="Ingresos" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Gastos" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">
              No hay datos para mostrar
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
        <Card className="rounded-xl border">
          <CardHeader className="pb-2">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle className="text-base sm:text-lg">Gastos por Categoría</CardTitle>
                <CardDescription>Distribución del gasto</CardDescription>
              </div>
              <Select value={pieChartMonth} onValueChange={setPieChartMonth}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableMonths.map((month) => (
                    <SelectItem key={month} value={month}>
                      {formatMonth(month)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {expensesByCategoryData.length > 0 ? (
              <div className="flex flex-col items-center">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={expensesByCategoryData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {expensesByCategoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color || PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => formatCurrency(value, currentHousehold?.currency)}
                      contentStyle={{
                        backgroundColor: 'var(--background)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap justify-center gap-3 mt-2">
                  {expensesByCategoryData.slice(0, 6).map((entry, index) => (
                    <div key={index} className="flex items-center gap-1.5 text-xs">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: entry.color || PIE_COLORS[index % PIE_COLORS.length] }}
                      />
                      <span>{entry.name}</span>
                      <span className="text-muted-foreground">
                        ({formatCurrency(entry.value, currentHousehold?.currency)})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                No hay gastos en {formatMonth(pieChartMonth)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-xl border">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base sm:text-lg">Cumplimiento de Presupuesto</CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  Variable + no presupuestado vs. presupuesto variable
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Gastado</span>
              <span className="font-semibold">{formatCurrency(totalSpent, currentHousehold?.currency)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Presupuesto</span>
              <span className="font-semibold">{formatCurrency(totalBudget, currentHousehold?.currency)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">{budgetUsedPercent}%</span>
              <div className="w-full h-2 rounded-full bg-muted">
                <div
                  className="h-2 rounded-full bg-primary"
                  style={{ width: `${Math.min(budgetUsedPercent, 130)}%` }}
                />
              </div>
              <span className="text-[11px] text-muted-foreground">Esperado {expectedPercent}%</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {budgetUsedPercent > 100
                ? '¡Ojo! Superaste el presupuesto variable.'
                : budgetUsedPercent > expectedPercent
                  ? 'Vas adelantado en el gasto.'
                  : 'Dentro del ritmo esperado.'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Análisis y Gráficos */}
      <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
        <Card className="rounded-xl border">
          <CardHeader className="pb-2">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle className="text-base sm:text-lg">Gastos por Categoría</CardTitle>
                <CardDescription>Distribución del gasto</CardDescription>
              </div>
              <Select value={pieChartMonth} onValueChange={setPieChartMonth}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableMonths.map((month) => (
                    <SelectItem key={month} value={month}>
                      {formatMonth(month)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {expensesByCategoryData.length > 0 ? (
              <div className="flex flex-col items-center">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={expensesByCategoryData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {expensesByCategoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color || PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => formatCurrency(value, currentHousehold?.currency)}
                      contentStyle={{
                        backgroundColor: 'var(--background)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap justify-center gap-3 mt-2">
                  {expensesByCategoryData.slice(0, 6).map((entry, index) => (
                    <div key={index} className="flex items-center gap-1.5 text-xs">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: entry.color || PIE_COLORS[index % PIE_COLORS.length] }}
                      />
                      <span>{entry.name}</span>
                      <span className="text-muted-foreground">
                        ({formatCurrency(entry.value, currentHousehold?.currency)})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-muted-foreground">
                No hay gastos en {formatMonth(pieChartMonth)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-xl border">
          <CardHeader className="pb-2">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle className="text-base sm:text-lg">Cumplimiento de Presupuesto</CardTitle>
                <CardDescription>Gastos variables: Real vs Presupuestado</CardDescription>
              </div>
              <Select value={complianceMonth} onValueChange={setComplianceMonth}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableMonths.map((month) => (
                    <SelectItem key={month} value={month}>
                      {formatMonth(month)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {budgetComplianceData.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aún no hay gastos para evaluar.</p>
            ) : (
              <div className="space-y-3">
                {budgetComplianceData.map((item, idx) => (
                  <div key={item.categoryId || idx} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">{item.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatCurrency(item.Real, currentHousehold?.currency)} / {formatCurrency(item.Presupuesto, currentHousehold?.currency)}
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-muted">
                      <div
                        className={`h-2 rounded-full ${
                          item.status === 'over'
                            ? 'bg-red-500'
                            : item.status === 'warning'
                            ? 'bg-amber-500'
                            : 'bg-green-500'
                        }`}
                        style={{ width: `${Math.min(item.percentage, 130)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3 sm:space-y-4">
        <Card className="rounded-xl border">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base sm:text-lg">Gastos recientes</CardTitle>
                <CardDescription className="text-xs sm:text-sm">Últimos movimientos</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="px-2 h-8 sm:hidden"
                  onClick={() => setCollapseRecent((v) => !v)}
                >
                  {collapseRecent ? 'Expandir' : 'Contraer'}
                </Button>
                <Button variant="ghost" size="sm" asChild className="px-2 h-8">
                  <Link href="/app/expenses">
                    Ver todos <ArrowRight className="h-4 w-4 ml-1" />
                  </Link>
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {!collapseRecent && data?.recentExpenses.length === 0 && (
              <p className="text-sm text-muted-foreground">Aún no hay gastos registrados este mes.</p>
            )}
            {!collapseRecent && data?.recentExpenses.map((e) => (
              <div key={e.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <p className="text-sm font-medium truncate max-w-[220px] sm:max-w-none">
                      {e.merchant || e.description || 'Gasto'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(e.expense_date)} · {e.category_name}
                      {e.created_by_name ? ` · ${e.created_by_name}` : ''}
                    </p>
                  </div>
                  <p className="text-base font-semibold whitespace-nowrap">
                    {formatCurrency(e.amount, currentHousehold?.currency)}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-xl border">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base sm:text-lg">Gasto por persona</CardTitle>
                <CardDescription className="text-xs sm:text-sm">Según quién registró (created_by)</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="px-2 h-8 sm:hidden"
                  onClick={() => setCollapsePeople((v) => !v)}
                >
                  {collapsePeople ? 'Expandir' : 'Contraer'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIncludeFixedInPeople((p) => !p)}
                  className="h-8 px-3"
                >
                  {includeFixedInPeople ? 'Ocultar fijos' : 'Incluir fijos'}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {!collapsePeople && spendRows.length === 0 && <p className="text-sm text-muted-foreground">Sin datos este mes.</p>}
            {!collapsePeople && spendRows.map((row) => (
              <div key={row.id} className="flex items-center gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={row.avatar_url || undefined} />
                  <AvatarFallback>{row.id === 'household-fixed' ? 'H' : getInitials(row.name)}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-sm gap-1">
                    <span className="font-medium truncate max-w-[200px] sm:max-w-none">{row.name}</span>
                    <span className="text-muted-foreground whitespace-nowrap">{formatCurrency(row.amount, currentHousehold?.currency)}</span>
                  </div>
                  <Progress value={maxSpend ? (row.amount / maxSpend) * 100 : 0} className="h-2" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
