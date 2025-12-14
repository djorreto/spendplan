'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/use-auth'
import { useHousehold } from '@/hooks/use-household'
import { useSelectedMonth } from '@/hooks/use-selected-month'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppTopbar } from '@/components/layout/app-topbar'
import { LoadingPage } from '@/components/ui/loading'
import { ErrorPage } from '@/components/ui/error'
import { CopilotChat, CopilotButton } from '@/components/copilot/copilot-chat'
import { supabaseBrowser } from '@/lib/supabase'
import { getMonthDateRange, getPreviousMonth } from '@/lib/utils'
import type { FinancialContext } from '@/lib/ai/copilot'

// Demo mode constants
const DEMO_BUDGET_KEY = 'spendplan_demo_budget_v2'
const DEMO_EXPENSES_KEY = 'spendplan_demo_expenses'

export function AppLayoutClient({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { user, profile, loading: authLoading, isAuthenticated } = useAuth()
  const { currentHousehold, households, isDemoMode, loading: householdLoading, error: householdError, loadHouseholds } = useHousehold()
  const { selectedMonth } = useSelectedMonth(currentHousehold?.id)
  const [copilotOpen, setCopilotOpen] = useState(false)

  const isDemo = isDemoMode && !!currentHousehold?.id?.startsWith('demo-')

  const [financialContext, setFinancialContext] = useState<FinancialContext>(() =>
    getEmptyContext(selectedMonth, currentHousehold?.currency || 'CLP')
  )

  // Keep month/currency in context synced immediately (even before data loads)
  useEffect(() => {
    if (!currentHousehold) {
      setFinancialContext(getEmptyContext(selectedMonth, 'CLP'))
      return
    }
    setFinancialContext((prev) => ({
      ...prev,
      month: selectedMonth,
      currency: currentHousehold.currency || prev.currency || 'CLP',
    }))
  }, [selectedMonth, currentHousehold])

  // Load copilot context: demo from localStorage, real from Supabase
  useEffect(() => {
    if (!currentHousehold) return

    let cancelled = false

    const setIfOk = (ctx: FinancialContext) => {
      if (!cancelled) setFinancialContext(ctx)
    }

    const computeDays = (month: string) => {
      const [yy, mm] = month.split('-').map(Number)
      const daysInMonth = new Date(yy, mm, 0).getDate()
      const now = new Date()
      const sameMonth = now.getFullYear() === yy && now.getMonth() + 1 === mm
      const daysPassed = sameMonth ? Math.min(now.getDate(), daysInMonth) : daysInMonth
      return { daysInMonth, daysPassed }
    }

    ;(async () => {
      try {
        if (typeof window === 'undefined') return

        // Demo mode: localStorage
        if (isDemo) {
          const budgetData = JSON.parse(localStorage.getItem(DEMO_BUDGET_KEY) || '{"items":[]}')
          const budgetItems = budgetData.items || []
          const allExpenses = JSON.parse(localStorage.getItem(DEMO_EXPENSES_KEY) || '[]')
          const monthExpenses = allExpenses.filter((e: any) => e.expense_date?.startsWith(selectedMonth))
          const prev1 = getPreviousMonth(selectedMonth)
          const prev2 = getPreviousMonth(prev1)
          const historicalMonths = [selectedMonth, prev1, prev2]
          const historicalSpend = historicalMonths.map((m) => {
            const exps = allExpenses.filter((e: any) => e.expense_date?.startsWith(m))
            const totalSpent = exps.reduce((sum: number, e: any) => sum + (e.amount || 0), 0)
            const totalUnbudgeted = exps
              .filter((e: any) => e.is_unbudgeted || !e.category_id)
              .reduce((sum: number, e: any) => sum + (e.amount || 0), 0)
            return { month: m, totalSpent, totalUnbudgeted }
          })

          const activeIncomes = budgetItems.filter((i: any) => i.kind === 'income' && i.is_active !== false)
          const activeFixed = budgetItems.filter((i: any) => i.kind === 'expense' && i.type === 'fixed' && i.is_active !== false)
          const activeVariable = budgetItems.filter((i: any) => i.kind === 'expense' && i.type === 'variable' && i.is_active !== false)

          const totalIncome = activeIncomes.reduce((sum: number, i: any) => sum + (i.amount || 0), 0)
          const totalFixed = activeFixed.reduce((sum: number, i: any) => sum + (i.amount || 0), 0)
          const totalVariableBudget = activeVariable.reduce((sum: number, i: any) => sum + (i.amount || 0), 0)

          const budgetedCategoryIds = new Set(activeVariable.map((v: any) => v.category_id))

          const totalVariableSpent = monthExpenses
            .filter((e: any) => e.category_id && budgetedCategoryIds.has(e.category_id))
            .reduce((sum: number, e: any) => sum + (e.amount || 0), 0)

          const totalUnbudgeted = monthExpenses
            .filter((e: any) => e.is_unbudgeted || !e.category_id || !budgetedCategoryIds.has(e.category_id))
            .reduce((sum: number, e: any) => sum + (e.amount || 0), 0)

          const availableReal = totalIncome - totalFixed - totalVariableSpent - totalUnbudgeted

          const categoriesOverBudget = activeVariable
            .map((item: any) => {
              const spent = monthExpenses
                .filter((e: any) => e.category_id === item.category_id)
                .reduce((sum: number, e: any) => sum + (e.amount || 0), 0)
              const percentage = item.amount > 0 ? (spent / item.amount) * 100 : 0
              return {
                name: item.name,
                budgeted: item.amount,
                spent,
                percentage,
              }
            })
            .filter((c: any) => c.percentage > 100)
            .sort((a: any, b: any) => b.percentage - a.percentage)

          const merchantMap = new Map<string, { amount: number; count: number }>()
          monthExpenses.forEach((e: any) => {
            const name = e.merchant || e.description || 'Sin nombre'
            const existing = merchantMap.get(name) || { amount: 0, count: 0 }
            merchantMap.set(name, { amount: existing.amount + (e.amount || 0), count: existing.count + 1 })
          })
          const topMerchants = Array.from(merchantMap.entries())
            .map(([name, data]) => ({ name, ...data }))
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 5)

          const uncategorizedExpenses = monthExpenses
            .filter((e: any) => e.is_unbudgeted || !e.category_id)
            .slice(0, 5)
            .map((e: any) => ({
              description: e.description || e.merchant || 'Sin descripción',
              amount: e.amount || 0,
              date: e.expense_date,
            }))

          const recentExpenses = monthExpenses
            .sort((a: any, b: any) => String(b.expense_date).localeCompare(String(a.expense_date)))
            .slice(0, 10)
            .map((e: any) => ({
              description: e.description || e.merchant || 'Gasto',
              amount: e.amount || 0,
              category: e.category_id || 'Sin categoría',
              date: e.expense_date,
            }))

          const { daysInMonth, daysPassed } = computeDays(selectedMonth)

          setIfOk({
            month: selectedMonth,
            currency: currentHousehold.currency || 'CLP',
            totalIncome,
            totalFixed,
            totalVariableBudget,
            totalVariableSpent,
            totalUnbudgeted,
            availableReal,
            daysInMonth,
            daysPassed,
            categoriesOverBudget,
            topMerchants,
            uncategorizedExpenses,
            recentExpenses,
            historicalSpend,
          })
          return
        }

        // Real mode: Supabase
        const supabase = supabaseBrowser()
        const range = getMonthDateRange(selectedMonth)
        const prev1 = getPreviousMonth(selectedMonth)
        const prev2 = getPreviousMonth(prev1)
        const oldest = getMonthDateRange(prev2).start

        const [budgetResp, expensesResp, expensesHistResp] = await Promise.all([
          supabase
            .from('budget_items')
            .select('id, name, kind, type, amount, category_id, is_active, start_date, end_date, is_indefinite')
            .eq('household_id', currentHousehold.id),
          supabase
            .from('expenses')
            .select('id, amount, description, merchant, expense_date, category_id, is_unbudgeted')
            .eq('household_id', currentHousehold.id)
            .gte('expense_date', range.start)
            .lt('expense_date', range.endExclusive)
            .order('expense_date', { ascending: false })
            .limit(500),
          // small historical window (3 months including selected)
          supabase
            .from('expenses')
            .select('amount, expense_date, category_id, is_unbudgeted')
            .eq('household_id', currentHousehold.id)
            .gte('expense_date', oldest)
            .lt('expense_date', range.endExclusive)
            .order('expense_date', { ascending: false })
            .limit(2000),
        ])

        if (budgetResp.error) throw budgetResp.error
        if (expensesResp.error) throw expensesResp.error
        if (expensesHistResp.error) throw expensesHistResp.error

        const budgetItems = budgetResp.data || []
        const monthExpenses = expensesResp.data || []
        const histExpenses = expensesHistResp.data || []

        const isItemActive = (item: any) => {
          if (item.is_active === false) return false
          // If items are bounded by dates, apply within the selected month window.
          // Keep it simple: respect explicit deactivation and basic date range.
          const start = item.start_date as string | null
          const end = item.end_date as string | null
          if (start && start >= range.endExclusive) return false
          if (!item.is_indefinite && end && end < range.start) return false
          return true
        }

        const activeIncomes = budgetItems.filter((i) => i.kind === 'income' && isItemActive(i))
        const activeFixed = budgetItems.filter((i) => i.kind === 'expense' && i.type === 'fixed' && isItemActive(i))
        const activeVariable = budgetItems.filter((i) => i.kind === 'expense' && i.type === 'variable' && isItemActive(i))

        const totalIncome = activeIncomes.reduce((sum, i) => sum + (Number(i.amount) || 0), 0)
        const totalFixed = activeFixed.reduce((sum, i) => sum + (Number(i.amount) || 0), 0)
        const totalVariableBudget = activeVariable.reduce((sum, i) => sum + (Number(i.amount) || 0), 0)

        const budgetedCategoryIds = new Set(activeVariable.map((v) => v.category_id).filter(Boolean))

        const totalVariableSpent = monthExpenses
          .filter((e) => e.category_id && budgetedCategoryIds.has(e.category_id))
          .reduce((sum, e) => sum + (Number(e.amount) || 0), 0)

        const totalUnbudgeted = monthExpenses
          .filter((e) => e.is_unbudgeted || !e.category_id || !budgetedCategoryIds.has(e.category_id))
          .reduce((sum, e) => sum + (Number(e.amount) || 0), 0)

        const availableReal = totalIncome - totalFixed - totalVariableSpent - totalUnbudgeted

        const spentByCat = new Map<string, number>()
        monthExpenses.forEach((e: any) => {
          if (!e.category_id) return
          spentByCat.set(e.category_id, (spentByCat.get(e.category_id) || 0) + (Number(e.amount) || 0))
        })

        const categoriesOverBudget = activeVariable
          .map((item: any) => {
            const catId = item.category_id as string | null
            const spent = catId ? spentByCat.get(catId) || 0 : 0
            const budgeted = Number(item.amount) || 0
            const percentage = budgeted > 0 ? (spent / budgeted) * 100 : 0
            return {
              name: item.name || 'Categoría',
              budgeted,
              spent,
              percentage,
            }
          })
          .filter((c: any) => c.percentage > 100)
          .sort((a: any, b: any) => b.percentage - a.percentage)
          .slice(0, 5)

        const merchantMap = new Map<string, { amount: number; count: number }>()
        monthExpenses.forEach((e: any) => {
          const name = e.merchant || e.description || 'Sin nombre'
          const existing = merchantMap.get(name) || { amount: 0, count: 0 }
          merchantMap.set(name, { amount: existing.amount + (Number(e.amount) || 0), count: existing.count + 1 })
        })
        const topMerchants = Array.from(merchantMap.entries())
          .map(([name, data]) => ({ name, ...data }))
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 5)

        const uncategorizedExpenses = monthExpenses
          .filter((e) => e.is_unbudgeted || !e.category_id)
          .slice(0, 5)
          .map((e: any) => ({
            description: e.description || e.merchant || 'Sin descripción',
            amount: Number(e.amount) || 0,
            date: e.expense_date,
          }))

        const recentExpenses = monthExpenses.slice(0, 10).map((e: any) => ({
          description: e.description || e.merchant || 'Gasto',
          amount: Number(e.amount) || 0,
          category: e.category_id || 'Sin categoría',
          date: e.expense_date,
        }))

        const histMonths = [selectedMonth, prev1, prev2]
        const historicalSpend = histMonths.map((m) => {
          const exps = histExpenses.filter((e: any) => String(e.expense_date).startsWith(m))
          const totalSpent = exps.reduce((sum: number, e: any) => sum + (Number(e.amount) || 0), 0)
          const totalUnbudgeted = exps
            .filter((e: any) => e.is_unbudgeted || !e.category_id)
            .reduce((sum: number, e: any) => sum + (Number(e.amount) || 0), 0)
          return { month: m, totalSpent, totalUnbudgeted }
        })

        const { daysInMonth, daysPassed } = computeDays(selectedMonth)

        setIfOk({
          month: selectedMonth,
          currency: currentHousehold.currency || 'CLP',
          totalIncome,
          totalFixed,
          totalVariableBudget,
          totalVariableSpent,
          totalUnbudgeted,
          availableReal,
          daysInMonth,
          daysPassed,
          categoriesOverBudget,
          topMerchants,
          uncategorizedExpenses,
          recentExpenses,
          historicalSpend,
        })
      } catch {
        // Keep minimal context, but at least with correct month/currency
        setIfOk(getEmptyContext(selectedMonth, currentHousehold.currency || 'CLP'))
      }
    })()

    return () => {
      cancelled = true
    }
  }, [currentHousehold?.id, currentHousehold?.currency, isDemo, selectedMonth])

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login')
    }
  }, [authLoading, isAuthenticated, router])

  // Redirect to onboarding if needed
  useEffect(() => {
    if (!authLoading && !householdLoading && isAuthenticated) {
      // No decidir onboarding si el profile aún no cargó (evita redirects falsos en refresh)
      if (!profile) return
      const hasHousehold = !!currentHousehold || (households?.length || 0) > 0
      // Solo mandar a onboarding si no tiene hogares y no completó onboarding.
      if (!hasHousehold && (!profile.onboarding_completed)) {
        router.push('/onboarding')
      }
    }
  }, [authLoading, householdLoading, isAuthenticated, profile, currentHousehold, households, router])

  if (authLoading || householdLoading) {
    return <LoadingPage />
  }

  if (!isAuthenticated) {
    return null
  }

  if (!currentHousehold && householdError) {
    return (
      <ErrorPage
        title="No pudimos cargar tu hogar"
        message={householdError}
        onRetry={() => loadHouseholds(true)}
      />
    )
  }

  return (
    <div className="flex min-h-screen h-[100dvh] overflow-hidden bg-muted/30">
      {/* Sidebar */}
      <AppSidebar />

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Topbar */}
        <AppTopbar />

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>

      {/* Copilot */}
      <CopilotButton onClick={() => setCopilotOpen(true)} />
      <CopilotChat
        context={financialContext}
        isOpen={copilotOpen}
        onClose={() => setCopilotOpen(false)}
      />
    </div>
  )
}

function getEmptyContext(month: string, currency: string): FinancialContext {
  const [yy, mm] = month.split('-').map(Number)
  const daysInMonth = new Date(yy, mm, 0).getDate()
  const now = new Date()
  const sameMonth = now.getFullYear() === yy && now.getMonth() + 1 === mm
  return {
    month,
    currency,
    totalIncome: 0,
    totalFixed: 0,
    totalVariableBudget: 0,
    totalVariableSpent: 0,
    totalUnbudgeted: 0,
    availableReal: 0,
    daysInMonth,
    daysPassed: sameMonth ? Math.min(now.getDate(), daysInMonth) : daysInMonth,
    categoriesOverBudget: [],
    topMerchants: [],
    uncategorizedExpenses: [],
    recentExpenses: [],
    historicalSpend: [],
  }
}

