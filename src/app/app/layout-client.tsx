'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/use-auth'
import { useHousehold } from '@/hooks/use-household'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppTopbar } from '@/components/layout/app-topbar'
import { LoadingPage } from '@/components/ui/loading'
import { ErrorPage } from '@/components/ui/error'
import { CopilotChat, CopilotButton } from '@/components/copilot/copilot-chat'
import { getCurrentMonth } from '@/lib/utils'
import type { FinancialContext } from '@/lib/ai/copilot'

// Demo mode constants
const DEMO_BUDGET_KEY = 'spendplan_demo_budget_v2'
const DEMO_EXPENSES_KEY = 'spendplan_demo_expenses'
const DEMO_CUSTOM_CATEGORIES_KEY = 'spendplan_demo_custom_categories'

export function AppLayoutClient({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { user, profile, loading: authLoading, isAuthenticated } = useAuth()
  const { currentHousehold, isDemoMode, loading: householdLoading, error: householdError, loadHouseholds } = useHousehold()
  const [copilotOpen, setCopilotOpen] = useState(false)

  // Build financial context for copilot
  const financialContext = useMemo<FinancialContext>(() => {
    if (typeof window === 'undefined' || !currentHousehold) {
      return getEmptyContext()
    }

    const currentMonth = getCurrentMonth()
    const budgetData = JSON.parse(localStorage.getItem(DEMO_BUDGET_KEY) || '{"items":[]}')
    const budgetItems = budgetData.items || []
    const allExpenses = JSON.parse(localStorage.getItem(DEMO_EXPENSES_KEY) || '[]')
    const monthExpenses = allExpenses.filter((e: any) => e.expense_date?.startsWith(currentMonth))

    // Calculate totals
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

    // Categories over budget
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
          percentage
        }
      })
      .filter((c: any) => c.percentage > 100)
      .sort((a: any, b: any) => b.percentage - a.percentage)

    // Top merchants
    const merchantMap = new Map<string, { amount: number; count: number }>()
    monthExpenses.forEach((e: any) => {
      const name = e.merchant || e.description || 'Sin nombre'
      const existing = merchantMap.get(name) || { amount: 0, count: 0 }
      merchantMap.set(name, { amount: existing.amount + e.amount, count: existing.count + 1 })
    })
    const topMerchants = Array.from(merchantMap.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)

    // Uncategorized
    const uncategorizedExpenses = monthExpenses
      .filter((e: any) => e.is_unbudgeted || !e.category_id)
      .map((e: any) => ({
        description: e.description || e.merchant || 'Sin descripción',
        amount: e.amount,
        date: e.expense_date
      }))

    // Recent expenses
    const recentExpenses = monthExpenses
      .sort((a: any, b: any) => b.expense_date.localeCompare(a.expense_date))
      .slice(0, 10)
      .map((e: any) => ({
        description: e.description || e.merchant || 'Gasto',
        amount: e.amount,
        category: e.category_id || 'Sin categoría',
        date: e.expense_date
      }))

    // Days
    const now = new Date()
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    const daysPassed = now.getDate()

    return {
      month: currentMonth,
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
      recentExpenses
    }
  }, [currentHousehold])

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
      if (profile && !profile.onboarding_completed) {
        router.push('/onboarding')
      } else if (!currentHousehold && !householdError) {
        router.push('/onboarding')
      }
    }
  }, [authLoading, householdLoading, isAuthenticated, profile, currentHousehold, householdError, router])

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

function getEmptyContext(): FinancialContext {
  const now = new Date()
  return {
    month: getCurrentMonth(),
    currency: 'CLP',
    totalIncome: 0,
    totalFixed: 0,
    totalVariableBudget: 0,
    totalVariableSpent: 0,
    totalUnbudgeted: 0,
    availableReal: 0,
    daysInMonth: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(),
    daysPassed: now.getDate(),
    categoriesOverBudget: [],
    topMerchants: [],
    uncategorizedExpenses: [],
    recentExpenses: []
  }
}

