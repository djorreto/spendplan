'use client'

export const dynamic = 'force-dynamic'

import React, { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useHousehold } from '@/hooks/use-household'
import { useSelectedMonth } from '@/hooks/use-selected-month'
import { supabaseBrowser } from '@/lib/supabase'
import { formatCurrency, getCurrentMonth } from '@/lib/utils'
import { startOp, endOp, formatSupabaseError, withRetry } from '@/lib/debug-log'
import { useToast } from '@/components/ui/toast'
import type { BudgetItem, Expense, Category } from '@/types'
import { Edit2, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'

type Frequency = 'monthly' | 'weekly' | 'biweekly' | 'yearly' | 'one_time'

const formatWithDots = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')

// Parse date string YYYY-MM-DD in UTC to evitar corrimientos por huso.
const parseDateUTC = (dateStr: string) => new Date(`${dateStr}T00:00:00Z`)

function monthRange(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  const start = new Date(Date.UTC(y, (m || 1) - 1, 1))
  const endExclusive = new Date(Date.UTC(y, m || 1, 1)) // primer día del mes siguiente
  return { start, endExclusive }
}

function isItemActiveInMonth(item: BudgetItem, ym: string): boolean {
  const { start, endExclusive } = monthRange(ym)
  const itemStart = parseDateUTC(item.start_date)
  if (!Number.isFinite(itemStart.getTime())) return false

  if (item.frequency === 'one_time') {
    return itemStart >= start && itemStart < endExclusive
  }

  const overlaps =
    itemStart < endExclusive &&
    (item.is_indefinite || !item.end_date || parseDateUTC(item.end_date) >= start)

  return overlaps
}

function getMonthlyAmount(item: BudgetItem): number {
  if (item.frequency === 'one_time') return item.amount
  const multipliers: Record<Frequency, number> = {
    monthly: 1,
    weekly: 4.33,
    biweekly: 2,
    yearly: 1 / 12,
    one_time: 1,
  }
  return item.amount * multipliers[item.frequency]
}

const monthIndex = (dateStr: string) => {
  const [y, m] = dateStr.split('-').map(Number)
  return (y || 0) * 12 + ((m || 1) - 1)
}

const monthToString = (idx: number) => {
  const y = Math.floor(idx / 12)
  const m = (idx % 12) + 1
  return `${y}-${String(m).padStart(2, '0')}-01`
}

const monthShortLabel = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, (m || 1) - 1, 1)
  const abbr = d.toLocaleString('es-CL', { month: 'short' })
  return `${abbr.charAt(0).toUpperCase() + abbr.slice(1, 3)}`
}

export default function MonthlyPage() {
  const { currentHousehold, isDemoMode } = useHousehold()
  const { selectedMonth } = useSelectedMonth(currentHousehold?.id)
  const { addToast } = useToast()
  const router = useRouter()

  const [budgetItems, setBudgetItems] = useState<BudgetItem[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [tableMonths, setTableMonths] = useState<7 | 13>(7)
  const [tableAnchorMonth, setTableAnchorMonth] = useState(selectedMonth || getCurrentMonth())
  const [anchorMode, setAnchorMode] = useState<'center' | 'start'>('center') // center: ancla al medio; start: primer mes = anchor
  const [expandedVariables, setExpandedVariables] = useState<Set<string>>(new Set())
  const [expandedUnbudgeted, setExpandedUnbudgeted] = useState(false)
  const [editItem, setEditItem] = useState<BudgetItem | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [editName, setEditName] = useState('')
  const [editAmount, setEditAmount] = useState('')
  const [editAmountText, setEditAmountText] = useState('')
  const [editFrequency, setEditFrequency] = useState<Frequency>('monthly')
  const [editStartDate, setEditStartDate] = useState('')
  const [editEndDate, setEditEndDate] = useState('')
  const [editIndefinite, setEditIndefinite] = useState(true)
  const [editExpenseOpen, setEditExpenseOpen] = useState(false)
  const [editExpense, setEditExpense] = useState<Expense | null>(null)
  const [editExpenseAmountText, setEditExpenseAmountText] = useState('')
  const [editExpenseDate, setEditExpenseDate] = useState('')
  const [editExpenseDesc, setEditExpenseDesc] = useState('')
  const [editExpenseMerchant, setEditExpenseMerchant] = useState('')
  const [editExpenseCategory, setEditExpenseCategory] = useState<string>('')
  const [deleteLoadingId, setDeleteLoadingId] = useState<string | null>(null)

  useEffect(() => {
    setTableAnchorMonth(selectedMonth || getCurrentMonth())
  }, [selectedMonth])

  useEffect(() => {
    if (!currentHousehold && !isDemoMode) return
    void loadData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentHousehold?.id, isDemoMode, tableAnchorMonth, tableMonths])

  const monthsWindow = useMemo(() => {
    const anchorIdx = monthIndex(tableAnchorMonth)
    const startIdx =
      anchorMode === 'center'
        ? Math.max(anchorIdx - Math.floor((tableMonths - 1) / 2), 0)
        : Math.max(anchorIdx, 0) // start mode: el primer mes es el ancla
    return Array.from({ length: tableMonths }, (_, i) => monthToString(startIdx + i).slice(0, 7))
  }, [tableAnchorMonth, tableMonths, anchorMode])

  const shiftTableWindow = (delta: number) => {
    const nextIdx = monthIndex(tableAnchorMonth) + delta
    setTableAnchorMonth(monthToString(Math.max(nextIdx, 0)).slice(0, 7))
  }

  const anchorToCurrent = () => {
    setAnchorMode('start')
    setTableAnchorMonth(getCurrentMonth())
  }

  const toggleExpanded = (id: string) => {
    setExpandedVariables((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const openInlineEdit = (item: BudgetItem) => {
    setEditItem(item)
    setEditName(item.name || '')
    const digits = String(Math.round(item.amount ?? 0)).replace(/\D/g, '')
    setEditAmount(digits)
    setEditAmountText(digits ? formatWithDots(digits) : '')
    setEditFrequency(item.frequency as Frequency)
    setEditStartDate(item.start_date?.slice(0, 10) || '')
    setEditEndDate(item.end_date?.slice(0, 10) || '')
    setEditIndefinite(!!item.is_indefinite)
    setEditOpen(true)
  }

  const openEditExpenseCard = (exp: Expense) => {
    setEditExpense(exp)
    const digits = String(Math.round(Number(exp.amount) || 0)).replace(/\D/g, '')
    setEditExpenseAmountText(digits ? formatWithDots(digits) : '')
    setEditExpenseDate(String(exp.expense_date).slice(0, 10))
    setEditExpenseDesc(exp.description || exp.merchant || '')
    setEditExpenseMerchant(exp.merchant || '')
    setEditExpenseCategory(exp.category_id || '')
    setEditExpenseOpen(true)
  }

  const saveEditExpense = async () => {
    if (!editExpense) return
    const amountDigits = (editExpenseAmountText || '').replace(/\D/g, '')
    const amountNum = amountDigits ? Number(amountDigits) : 0
    if (amountNum <= 0) {
      addToast({ type: 'error', message: 'Ingresa un monto válido' })
      return
    }
    const supabase = supabaseBrowser()
    const op = startOp('monthly.editExpense', { id: editExpense.id })
    try {
      const { error } = await supabase
        .from('expenses')
        .update({
          amount: amountNum,
          expense_date: editExpenseDate || editExpense.expense_date,
          description: editExpenseDesc || null,
          merchant: editExpenseMerchant || null,
          category_id: editExpenseCategory || null,
          is_unbudgeted: editExpenseCategory ? false : true, // si asigna categoría, deja de ser no presupuestado
        })
        .eq('id', editExpense.id)
        .eq('household_id', currentHousehold?.id)
      if (error) throw error
      addToast({ type: 'success', message: 'Gasto actualizado' })
      setEditExpenseOpen(false)
      setEditExpense(null)
      await loadData()
      endOp(op, true)
    } catch (error) {
      endOp(op, false, { error: formatSupabaseError(error) })
      addToast({ type: 'error', message: 'No se pudo actualizar el gasto' })
    }
  }

  const deleteExpense = async (exp: Expense) => {
    if (!currentHousehold) return
    const confirmDelete = typeof window !== 'undefined' ? window.confirm('¿Eliminar este gasto?') : true
    if (!confirmDelete) return
    const supabase = supabaseBrowser()
    const op = startOp('monthly.deleteExpense', { id: exp.id })
    setDeleteLoadingId(exp.id)
    try {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', exp.id)
        .eq('household_id', currentHousehold.id)
      if (error) throw error
      addToast({ type: 'success', message: 'Gasto eliminado' })
      await loadData()
      endOp(op, true)
    } catch (error) {
      endOp(op, false, { error: formatSupabaseError(error) })
      addToast({ type: 'error', message: 'No se pudo eliminar el gasto' })
    } finally {
      setDeleteLoadingId(null)
    }
  }

  const saveInlineEdit = async () => {
    if (!editItem) return
    if (!currentHousehold && !isDemoMode) return
    setEditSaving(true)
    const supabase = supabaseBrowser()
    const op = startOp('monthly.inlineEdit', { id: editItem.id })
    try {
      const amountNum = Number((editAmount || '').replace(/\D/g, ''))
      if (Number.isNaN(amountNum)) throw new Error('Monto inválido')
      const { error } = await supabase
        .from('budget_items')
        .update({
          name: editName || null,
          amount: amountNum,
          frequency: editFrequency,
          start_date: editStartDate || null,
          end_date: editIndefinite ? null : editEndDate || null,
          is_indefinite: editIndefinite,
        })
        .eq('id', editItem.id)
        .eq('household_id', currentHousehold?.id)
      if (error) throw error
      addToast({ type: 'success', message: 'Presupuesto actualizado' })
      setEditOpen(false)
      setEditItem(null)
      await loadData()
      endOp(op, true)
    } catch (error) {
      endOp(op, false, { error: formatSupabaseError(error) })
      addToast({ type: 'error', message: 'No se pudo guardar' })
    } finally {
      setEditSaving(false)
    }
  }

  const expensesByMonth = useMemo(() => {
    const map = new Map<string, Expense[]>()
    expenses.forEach((e) => {
      const ym = parseDateUTC(e.expense_date).toISOString().slice(0, 7)
      const arr = map.get(ym) || []
      arr.push(e)
      map.set(ym, arr)
    })
    return map
  }, [expenses])

  const variableCategoryIds = useMemo(
    () => new Set(budgetItems.filter(i => i.kind === 'expense' && i.type === 'variable').map(i => i.category_id).filter(Boolean) as string[]),
    [budgetItems]
  )

  const activeVarByMonthCategory = useMemo(() => {
    const set = new Set<string>()
    monthsWindow.forEach((ym) => {
      budgetItems.forEach((i) => {
        if (i.kind === 'expense' && i.type === 'variable' && i.category_id && isItemActiveInMonth(i, ym)) {
          set.add(`${ym}-${i.category_id}`)
        }
      })
    })
    return set
  }, [budgetItems, monthsWindow])

  const monthlySummary = useMemo(() => {
    const summary: Record<string, { income: number; fixed: number; varBudget: number; varSpent: number; unbudgeted: number; balance: number; balancePlanned: number }> = {}
    monthsWindow.forEach((ym) => {
      const income = budgetItems
        .filter(i => i.kind === 'income')
        .reduce((sum, i) => sum + (isItemActiveInMonth(i, ym) ? getMonthlyAmount(i) : 0), 0)
      const fixed = budgetItems
        .filter(i => i.kind === 'expense' && i.type === 'fixed')
        .reduce((sum, i) => sum + (isItemActiveInMonth(i, ym) ? getMonthlyAmount(i) : 0), 0)
      const varBudget = budgetItems
        .filter(i => i.kind === 'expense' && i.type === 'variable')
        .reduce((sum, i) => sum + (isItemActiveInMonth(i, ym) ? getMonthlyAmount(i) : 0), 0)
      const monthExpenses = expensesByMonth.get(ym) || []
      const varSpent = monthExpenses
        .filter((e) => e.category_id && activeVarByMonthCategory.has(`${ym}-${e.category_id}`))
        .reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
      const unbudgeted = monthExpenses
        .filter((e) => {
          const cat = e.category_id
          if (!cat) return true
          const hasActiveVar = activeVarByMonthCategory.has(`${ym}-${cat}`)
          return !hasActiveVar
        })
        .reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
      const balance = income - fixed - varSpent - unbudgeted
      const balancePlanned = income - fixed - varBudget
      summary[ym] = { income, fixed, varBudget, varSpent, unbudgeted, balance, balancePlanned }
    })
    return summary
  }, [monthsWindow, budgetItems, expensesByMonth, activeVarByMonthCategory])

  // Ahorro acumulado: suma progresiva de izquierda a derecha.
  // Meses futuros usan balancePlanned (asumiendo consumo total de varBudget),
  // meses pasados/actual usan balance real.
  const cumulativeSavings = useMemo(() => {
    const currentYm = getCurrentMonth()
    let acc = 0
    const res: Record<string, number> = {}
    monthsWindow.forEach((ym) => {
      const base = monthlySummary[ym]
      if (!base) {
        res[ym] = acc
        return
      }
      const isFuture = ym > currentYm
      const chosen = isFuture ? base.balancePlanned : base.balance
      acc += chosen
      res[ym] = acc
    })
    return res
  }, [monthlySummary, monthsWindow])

  const loadData = async () => {
    setLoading(true)
    if (isDemoMode) {
      // Demo no implementado en detalle
      setLoading(false)
      return
    }
    if (!currentHousehold) return
    const supabase = supabaseBrowser()
    const anchorIdx = monthIndex(tableAnchorMonth)
    const startIdx = Math.max(anchorIdx - Math.floor((tableMonths - 1) / 2), 0)
    const endIdx = startIdx + tableMonths
    const rangeStart = monthToString(startIdx)
    const rangeEndExclusive = monthToString(endIdx)

    const op = startOp('monthly.load', { householdId: currentHousehold.id, rangeStart, rangeEndExclusive })
    try {
      const [itemsResp, catsResp, expResp] = await Promise.all([
        withRetry(
          () => supabase
            .from('budget_items')
            .select('id, kind, type, amount, category_id, start_date, end_date, is_indefinite, is_active, name, frequency')
            .eq('household_id', currentHousehold.id),
          { retries: 2, baseDelayMs: 200, ctx: op, step: 'select.budget_items' }
        ),
        withRetry(
          () => supabase
            .from('categories')
            .select('id, name, color, is_system, is_active')
            .or(`household_id.eq.${currentHousehold.id},is_system.eq.true`),
          { retries: 2, baseDelayMs: 200, ctx: op, step: 'select.categories' }
        ),
        withRetry(
          () => supabase
            .from('expenses')
            .select('id, amount, expense_date, category_id, is_unbudgeted, description, merchant')
            .eq('household_id', currentHousehold.id)
            .gte('expense_date', rangeStart)
            .lt('expense_date', rangeEndExclusive)
            .order('expense_date', { ascending: false }),
          { retries: 2, baseDelayMs: 200, ctx: op, step: 'select.expenses' }
        )
      ])

      if (itemsResp.error) throw itemsResp.error
      if (catsResp.error) throw catsResp.error
      if (expResp.error) throw expResp.error

      setBudgetItems(itemsResp.data || [])
      setCategories(catsResp.data || [])
      setExpenses(expResp.data || [])
      endOp(op, true, { items: itemsResp.data?.length || 0, expenses: expResp.data?.length || 0 })
    } catch (error) {
      endOp(op, false, { error: formatSupabaseError(error) })
      addToast({ type: 'error', message: 'Error al cargar vista mes a mes' })
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-40 bg-muted animate-pulse rounded" />
        <Card>
          <CardContent className="p-6">
            <div className="h-6 bg-muted animate-pulse rounded mb-3" />
            <div className="h-24 bg-muted animate-pulse rounded" />
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Mes a mes</h1>
          <p className="text-muted-foreground">Comparativo mensual de ingresos y gastos</p>
          <p className="text-xs text-muted-foreground mt-1 sm:hidden">
            En móviles, desliza horizontal para ver los meses. Mejor en tablet o PC.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setTableMonths(tableMonths === 7 ? 13 : 7)}>
            {tableMonths === 7 ? 'Ver 13 meses' : 'Ver 7 meses'}
          </Button>
          <Button variant="outline" size="sm" onClick={anchorToCurrent}>
            Ir a mes actual
          </Button>
          <Button variant="outline" size="sm" onClick={() => shiftTableWindow(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => shiftTableWindow(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Resumen mensual</CardTitle>
          <CardDescription>
            Ventana: {monthsWindow[0]} → {monthsWindow[monthsWindow.length - 1]}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table className="min-w-full">
            <TableHeader className="sticky top-16 z-30 bg-background shadow-sm">
              <TableRow>
                <TableHead className="min-w-[140px] sm:min-w-[180px] text-xs sm:text-sm sticky top-16 z-40 bg-background">
                  Ítem
                </TableHead>
                {monthsWindow.map((ym) => (
                  <TableHead
                    key={ym}
                    className="text-right whitespace-nowrap text-xs sm:text-sm sticky top-16 z-40 bg-background"
                  >
                    {monthShortLabel(ym)}/{ym.slice(2, 4)}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Ingresos */}
              {budgetItems.filter(i => i.kind === 'income').map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{item.name || 'Ingreso'}</span>
                      <Badge variant="outline">Ingreso</Badge>
                      <Button variant="ghost" size="icon" onClick={() => openInlineEdit(item)}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                  {monthsWindow.map((ym) => {
                    const active = isItemActiveInMonth(item, ym)
                    return (
                      <TableCell key={ym} className="text-right text-xs sm:text-sm">
                        {active ? formatCurrency(getMonthlyAmount(item), currentHousehold?.currency) : '—'}
                      </TableCell>
                    )
                  })}
                </TableRow>
              ))}

              {/* Fijos */}
              {budgetItems.filter(i => i.kind === 'expense' && i.type === 'fixed').map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{item.name || 'Gasto fijo'}</span>
                      <Badge variant="outline">Fijo</Badge>
                      <Button variant="ghost" size="icon" onClick={() => openInlineEdit(item)}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                  {monthsWindow.map((ym) => {
                    const active = isItemActiveInMonth(item, ym)
                    return (
                      <TableCell key={ym} className="text-right text-xs sm:text-sm">
                        {active ? formatCurrency(getMonthlyAmount(item), currentHousehold?.currency) : '—'}
                      </TableCell>
                    )
                  })}
                </TableRow>
              ))}

              {/* Variables */}
              {budgetItems.filter(i => i.kind === 'expense' && i.type === 'variable').map((item) => (
                <React.Fragment key={item.id}>
                  <TableRow>
                    <TableCell className="whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => toggleExpanded(item.id)}
                          aria-label={expandedVariables.has(item.id) ? 'Ocultar gastos' : 'Ver gastos'}
                        >
                          {expandedVariables.has(item.id) ? '−' : '+'}
                        </Button>
                        <span className="font-medium">{item.name || 'Gasto variable'}</span>
                        <Badge variant="outline">Variable</Badge>
                        <Button variant="ghost" size="icon" onClick={() => openInlineEdit(item)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                    {monthsWindow.map((ym) => {
                      const active = isItemActiveInMonth(item, ym)
                      const budget = active ? getMonthlyAmount(item) : 0
                      const monthExpenses = expensesByMonth.get(ym) || []
                      const spent = active
                        ? monthExpenses
                            .filter((e) => e.category_id === item.category_id)
                            .reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
                        : 0
                      return (
                        <TableCell key={ym} className="text-right text-xs sm:text-sm">
                          {active
                            ? `${formatCurrency(spent, currentHousehold?.currency)} / ${formatCurrency(budget, currentHousehold?.currency)}`
                            : '—'}
                        </TableCell>
                      )
                    })}
                  </TableRow>
                  {expandedVariables.has(item.id) && (
                    <TableRow key={`${item.id}-details`} className="bg-muted/40">
                      <TableCell className="text-sm font-medium text-muted-foreground">Gastos reales</TableCell>
                      {monthsWindow.map((ym) => {
                    const cellExpenses = expenses
                      .filter((e) => {
                        const ymExpense = parseDateUTC(e.expense_date).toISOString().slice(0, 7)
                        if (ymExpense !== ym) return false
                        if (e.category_id !== item.category_id) return false
                        // Si hay variable activa para esta categoría/mes, se muestra aquí.
                        const hasActiveVar = activeVarByMonthCategory.has(`${ym}-${e.category_id}`)
                        return hasActiveVar
                      })
                      .sort((a, b) => (a.expense_date > b.expense_date ? -1 : 1))
                        return (
                          <TableCell key={`${item.id}-${ym}`} className="align-top text-xs sm:text-sm">
                            {cellExpenses.length === 0 ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              <div className="space-y-2">
                                {cellExpenses.map((exp) => (
                                  <div key={exp.id} className="rounded-md border bg-white p-2 shadow-sm">
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs sm:text-sm font-semibold">
                                        {formatCurrency(Number(exp.amount) || 0, currentHousehold?.currency)}
                                      </span>
                                  <div className="flex items-center gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => openEditExpenseCard(exp)}
                                      aria-label="Editar gasto"
                                    >
                                      <Edit2 className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => deleteExpense(exp)}
                                      aria-label="Eliminar gasto"
                                      disabled={deleteLoadingId === exp.id}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                    </div>
                                    <p className="text-[11px] sm:text-xs text-muted-foreground">
                                      {String(exp.expense_date).slice(0, 10)} • {exp.description || exp.merchant || 'Gasto'}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </TableCell>
                        )
                      })}
                    </TableRow>
                  )}
                </React.Fragment>
              ))}

              {/* No Presupuestados */}
              <TableRow>
                <TableCell className="whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setExpandedUnbudgeted((v) => !v)}
                      aria-label={expandedUnbudgeted ? 'Ocultar no presupuestados' : 'Ver no presupuestados'}
                    >
                      {expandedUnbudgeted ? '−' : '+'}
                    </Button>
                    <span className="font-medium text-red-700">No Presup.</span>
                    <Badge variant="outline">Gastos</Badge>
                  </div>
                </TableCell>
                {monthsWindow.map((ym) => (
                  <TableCell key={ym} className="text-right text-xs sm:text-sm text-red-700">
                    {monthlySummary[ym] ? formatCurrency(monthlySummary[ym].unbudgeted, currentHousehold?.currency) : '—'}
                  </TableCell>
                ))}
              </TableRow>
              {expandedUnbudgeted && (
                <TableRow className="bg-muted/40">
                  <TableCell className="text-sm font-medium text-muted-foreground">Gastos reales</TableCell>
                  {monthsWindow.map((ym) => {
                    const cellExpenses = expenses
                      .filter((e) => {
                        const ymExpense = parseDateUTC(e.expense_date).toISOString().slice(0, 7)
                        if (ymExpense !== ym) return false
                        const cat = e.category_id
                        if (!cat) return true
                        const hasActiveVar = activeVarByMonthCategory.has(`${ym}-${cat}`)
                        return !hasActiveVar
                      })
                      .sort((a, b) => (a.expense_date > b.expense_date ? -1 : 1))
                    return (
                      <TableCell key={`unb-${ym}`} className="align-top text-xs sm:text-sm">
                        {cellExpenses.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <div className="space-y-2">
                            {cellExpenses.map((exp) => (
                              <div key={exp.id} className="rounded-md border bg-white p-2 shadow-sm">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs sm:text-sm font-semibold">
                                    {formatCurrency(Number(exp.amount) || 0, currentHousehold?.currency)}
                                  </span>
                                  <div className="flex items-center gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => openEditExpenseCard(exp)}
                                      aria-label="Editar gasto"
                                    >
                                      <Edit2 className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => deleteExpense(exp)}
                                      aria-label="Eliminar gasto"
                                      disabled={deleteLoadingId === exp.id}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                                <p className="text-[11px] sm:text-xs text-muted-foreground">
                                  {String(exp.expense_date).slice(0, 10)} • {exp.description || exp.merchant || 'Gasto'}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </TableCell>
                    )
                  })}
                </TableRow>
              )}

              {/* Balance planificado */}
              <TableRow>
                <TableCell className="whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">Balance planificado</span>
                  </div>
                </TableCell>
                {monthsWindow.map((ym) => (
                  <TableCell
                    key={ym}
                    className={`text-right text-xs sm:text-sm ${
                      monthlySummary[ym]?.balancePlanned < 0 ? 'text-red-700' : 'text-green-700'
                    }`}
                  >
                    {monthlySummary[ym] ? formatCurrency(monthlySummary[ym].balancePlanned, currentHousehold?.currency) : '—'}
                  </TableCell>
                ))}
              </TableRow>

              {/* Balance real */}
              <TableRow>
                <TableCell className="whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">Balance real</span>
                  </div>
                </TableCell>
                {monthsWindow.map((ym) => (
                  <TableCell
                    key={ym}
                    className={`text-right text-xs sm:text-sm ${
                      monthlySummary[ym]?.balance < 0 ? 'text-red-700' : 'text-green-700'
                    }`}
                  >
                    {monthlySummary[ym] ? formatCurrency(monthlySummary[ym].balance, currentHousehold?.currency) : '—'}
                  </TableCell>
                ))}
              </TableRow>

              {/* Ahorro a la fecha */}
              <TableRow>
                <TableCell className="whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">Ahorro a la fecha</span>
                  </div>
                </TableCell>
                {monthsWindow.map((ym) => (
                  <TableCell
                    key={ym}
                    className={`text-right text-xs sm:text-sm ${
                      Math.max(monthlySummary[ym]?.balance || 0, 0) > 0 ? 'text-green-700' : 'text-red-700'
                    }`}
                  >
                    {monthlySummary[ym]
                      ? formatCurrency(Math.max(monthlySummary[ym].balance, 0), currentHousehold?.currency)
                      : '—'}
                  </TableCell>
                ))}
              </TableRow>

              {/* Ahorro acumulado */}
              <TableRow>
                <TableCell className="whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">Ahorro acumulado</span>
                  </div>
                </TableCell>
                {monthsWindow.map((ym) => {
                  const isFuture = ym > getCurrentMonth()
                  const val = cumulativeSavings[ym] ?? 0
                  return (
                    <TableCell
                      key={ym}
                      className={`text-right text-xs sm:text-sm ${isFuture ? 'text-muted-foreground' : 'text-foreground'}`}
                    >
                      {formatCurrency(val, currentHousehold?.currency)}
                    </TableCell>
                  )
                })}
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar presupuesto</DialogTitle>
            <DialogDescription>Actualiza el monto y fechas sin salir de la vista.</DialogDescription>
          </DialogHeader>
          {editItem && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nombre</Label>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Nombre" />
              </div>
              <div className="space-y-2">
                <Label>Monto</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={editAmountText}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '')
                    setEditAmountText(digits ? formatWithDots(digits) : '')
                    setEditAmount(digits)
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>Frecuencia</Label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={editFrequency}
                  onChange={(e) => setEditFrequency(e.target.value as Frequency)}
                >
                  <option value="monthly">Mensual</option>
                  <option value="weekly">Semanal</option>
                  <option value="biweekly">Quincenal</option>
                  <option value="yearly">Anual</option>
                  <option value="one_time">Único</option>
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Inicio</Label>
                  <Input type="date" value={editStartDate} onChange={(e) => setEditStartDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Fin</Label>
                  <Input
                    type="date"
                    value={editEndDate}
                    onChange={(e) => setEditEndDate(e.target.value)}
                    disabled={editIndefinite}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox checked={editIndefinite} onCheckedChange={(v) => setEditIndefinite(!!v)} id="indef" />
                <Label htmlFor="indef">Indefinido</Label>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={editSaving}>
              Cancelar
            </Button>
            <Button onClick={saveInlineEdit} disabled={editSaving}>
              {editSaving ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editExpenseOpen} onOpenChange={setEditExpenseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar gasto</DialogTitle>
            <DialogDescription>Actualiza monto, fecha y detalle sin salir de esta vista.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Monto</Label>
              <Input
                type="text"
                inputMode="numeric"
                value={editExpenseAmountText}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '')
                  setEditExpenseAmountText(digits ? formatWithDots(digits) : '')
                }}
              />
            </div>
            <div className="space-y-1">
              <Label>Fecha</Label>
              <Input type="date" value={editExpenseDate} onChange={(e) => setEditExpenseDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Descripción</Label>
              <Input value={editExpenseDesc} onChange={(e) => setEditExpenseDesc(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Comercio</Label>
              <Input value={editExpenseMerchant} onChange={(e) => setEditExpenseMerchant(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Categoría</Label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={editExpenseCategory}
                onChange={(e) => setEditExpenseCategory(e.target.value)}
              >
                <option value="">Sin categoría</option>
                {categories
                  .filter((c) => c.is_active !== false)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditExpenseOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveEditExpense}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="mt-4">
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Usa “Ver 7/13 meses” para cambiar la ventana. Los montos de variables y no presupuestados se calculan con los gastos reales de cada mes.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
