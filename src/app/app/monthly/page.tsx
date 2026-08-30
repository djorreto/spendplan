'use client'

export const dynamic = 'force-dynamic'

import React, { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useHousehold } from '@/hooks/use-household'
import { useSelectedMonth } from '@/hooks/use-selected-month'
import { supabaseBrowser } from '@/lib/supabase'
import { formatCurrency, getCurrentMonth } from '@/lib/utils'
import { startOp, endOp, formatSupabaseError, withRetry } from '@/lib/debug-log'
import { useToast } from '@/components/ui/toast'
import type { BudgetItem, Expense, Category } from '@/types'
import { categoryGroupName, resolveCategoryParts } from '@/lib/category-taxonomy'
import { Edit2, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'

type LineKind = 'income' | 'fixed' | 'variable' | 'unbudgeted' | 'summary'

function lineKindLabel(kind: LineKind) {
  if (kind === 'income') return 'Ingreso'
  if (kind === 'fixed') return 'Gasto fijo'
  if (kind === 'variable') return 'Gasto variable'
  if (kind === 'unbudgeted') return 'No presupuestado'
  return 'Resumen'
}

function describeBudgetLine(item: BudgetItem, categories: Category[]) {
  if (item.kind === 'income') {
    return { group: 'Ingresos', subcategory: item.name || 'Ingreso' }
  }
  const category = categories.find((c) => c.id === item.category_id)
  if (category) return resolveCategoryParts(category, categories)
  return {
    group: categoryGroupName(item.name),
    subcategory: item.name || '—',
  }
}

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
  const [searchQuery, setSearchQuery] = useState('')
  const [filterClass, setFilterClass] = useState<'all' | 'income' | 'expense' | 'summary'>('all')
  const [filterExpenseType, setFilterExpenseType] = useState<'all' | 'fixed' | 'variable' | 'unbudgeted'>('all')
  const [filterGroup, setFilterGroup] = useState('all')
  const [filterSub, setFilterSub] = useState('all')

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
      const isCurrent = ym === currentYm
      // En meses pasados y el mes actual usamos balance real.
      // Para el mes siguiente y los futuros usamos balance planificado.
      const chosen = isFuture ? base.balancePlanned : base.balance
      acc += chosen
      res[ym] = acc
    })
    return res
  }, [monthlySummary, monthsWindow])

  const lineMeta = useMemo(() => {
    return budgetItems.map((item) => {
      const kind: LineKind =
        item.kind === 'income' ? 'income' : item.type === 'fixed' ? 'fixed' : 'variable'
      const parts = describeBudgetLine(item, categories)
      return { item, kind, ...parts }
    })
  }, [budgetItems, categories])

  const groupOptions = useMemo(() => {
    const names = new Set(lineMeta.map((row) => row.group))
    names.add('Otros')
    names.add('Ingresos')
    return [...names].sort((a, b) => a.localeCompare(b, 'es'))
  }, [lineMeta])

  const subOptions = useMemo(() => {
    const names = new Set(
      lineMeta
        .filter((row) => filterGroup === 'all' || row.group === filterGroup)
        .map((row) => row.subcategory)
    )
    if (filterGroup === 'all' || filterGroup === 'Otros') names.add('No presupuestado')
    return [...names].sort((a, b) => a.localeCompare(b, 'es'))
  }, [lineMeta, filterGroup])

  const matchesLine = (kind: LineKind, group: string, subcategory: string, name: string) => {
    if (filterClass === 'income' && kind !== 'income') return false
    if (filterClass === 'expense' && kind !== 'fixed' && kind !== 'variable' && kind !== 'unbudgeted') return false
    if (filterClass === 'summary' && kind !== 'summary') return false
    if (filterExpenseType !== 'all' && kind !== filterExpenseType) return false
    if (filterGroup !== 'all' && group !== filterGroup) return false
    if (filterSub !== 'all' && subcategory !== filterSub) return false
    const q = searchQuery.trim().toLowerCase()
    if (!q) return true
    return (
      name.toLowerCase().includes(q) ||
      group.toLowerCase().includes(q) ||
      subcategory.toLowerCase().includes(q) ||
      lineKindLabel(kind).toLowerCase().includes(q)
    )
  }

  const visibleLines = useMemo(
    () => lineMeta.filter((row) => matchesLine(row.kind, row.group, row.subcategory, row.item.name || '')),
    [lineMeta, filterClass, filterExpenseType, filterGroup, filterSub, searchQuery]
  )

  const showUnbudgeted = matchesLine('unbudgeted', 'Otros', 'No presupuestado', 'No presupuestado')
  const showSummary = matchesLine('summary', 'Totales', 'Resumen', 'Balance')

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
            .select('id, name, color, is_system, is_active, parent_id')
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
        <CardContent className="p-3 space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-sm font-medium">Planilla mes a mes</p>
              <p className="text-xs text-muted-foreground">
                {monthsWindow[0]} → {monthsWindow[monthsWindow.length - 1]}
              </p>
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
            <Input
              placeholder="Filtrar ítem, categoría..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9"
            />
            <Select
              value={filterClass}
              onValueChange={(value) => {
                setFilterClass(value as typeof filterClass)
                setFilterExpenseType('all')
                setFilterGroup('all')
                setFilterSub('all')
              }}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Ingresos y gastos</SelectItem>
                <SelectItem value="income">Solo ingresos</SelectItem>
                <SelectItem value="expense">Solo gastos</SelectItem>
                <SelectItem value="summary">Solo resumen</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={filterExpenseType}
              onValueChange={(value) => setFilterExpenseType(value as typeof filterExpenseType)}
              disabled={filterClass === 'income' || filterClass === 'summary'}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Tipo de gasto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                <SelectItem value="fixed">Gastos fijos</SelectItem>
                <SelectItem value="variable">Gastos variables</SelectItem>
                <SelectItem value="unbudgeted">No presupuestados</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={filterGroup}
              onValueChange={(value) => {
                setFilterGroup(value)
                setFilterSub('all')
              }}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Categoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las categorías</SelectItem>
                {groupOptions.map((group) => (
                  <SelectItem key={group} value={group}>{group}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterSub} onValueChange={setFilterSub}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Subcategoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las subcategorías</SelectItem>
                {subOptions.map((name) => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="relative max-h-[70vh] overflow-auto p-0">
          <Table className="min-w-[980px]">
            <TableHeader className="sticky top-0 z-30 bg-background shadow-sm">
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-9 min-w-[120px] px-2 text-xs sticky left-0 z-40 bg-background">
                  Tipo
                </TableHead>
                <TableHead className="h-9 min-w-[120px] px-2 text-xs">Categoría</TableHead>
                <TableHead className="h-9 min-w-[180px] px-2 text-xs">Ítem</TableHead>
                {monthsWindow.map((ym) => (
                  <TableHead
                    key={ym}
                    className="h-9 px-2 text-right whitespace-nowrap text-xs sticky top-0 z-40 bg-background"
                  >
                    {monthShortLabel(ym)}/{ym.slice(2, 4)}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleLines.filter((row) => row.kind === 'income').map(({ item, group, subcategory }) => (
                <TableRow key={item.id}>
                  <TableCell className="px-2 py-1.5 sticky left-0 bg-background">
                    <Badge variant="outline" className="text-[10px]">Ingreso</Badge>
                  </TableCell>
                  <TableCell className="px-2 py-1.5 text-xs">{group}</TableCell>
                  <TableCell className="px-2 py-1.5">
                    <div className="flex items-center gap-1">
                      <span className="font-medium text-sm">{item.name || 'Ingreso'}</span>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openInlineEdit(item)}>
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    {subcategory !== item.name && (
                      <p className="text-[11px] text-muted-foreground">{subcategory}</p>
                    )}
                  </TableCell>
                  {monthsWindow.map((ym) => {
                    const active = isItemActiveInMonth(item, ym)
                    return (
                      <TableCell key={ym} className="px-2 py-1.5 text-right text-xs tabular-nums">
                        {active ? formatCurrency(getMonthlyAmount(item), currentHousehold?.currency) : '—'}
                      </TableCell>
                    )
                  })}
                </TableRow>
              ))}

              {visibleLines.filter((row) => row.kind === 'fixed').map(({ item, group, subcategory }) => (
                <TableRow key={item.id}>
                  <TableCell className="px-2 py-1.5 sticky left-0 bg-background">
                    <Badge variant="outline" className="text-[10px]">Gasto fijo</Badge>
                  </TableCell>
                  <TableCell className="px-2 py-1.5 text-xs">{group}</TableCell>
                  <TableCell className="px-2 py-1.5">
                    <div className="flex items-center gap-1">
                      <span className="font-medium text-sm">{item.name || 'Gasto fijo'}</span>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openInlineEdit(item)}>
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">{subcategory}</p>
                  </TableCell>
                  {monthsWindow.map((ym) => {
                    const active = isItemActiveInMonth(item, ym)
                    return (
                      <TableCell key={ym} className="px-2 py-1.5 text-right text-xs tabular-nums">
                        {active ? formatCurrency(getMonthlyAmount(item), currentHousehold?.currency) : '—'}
                      </TableCell>
                    )
                  })}
                </TableRow>
              ))}

              {visibleLines.filter((row) => row.kind === 'variable').map(({ item, group, subcategory }) => (
                <React.Fragment key={item.id}>
                  <TableRow>
                    <TableCell className="px-2 py-1.5 sticky left-0 bg-background">
                      <Badge variant="outline" className="text-[10px]">Gasto variable</Badge>
                    </TableCell>
                    <TableCell className="px-2 py-1.5 text-xs">{group}</TableCell>
                    <TableCell className="px-2 py-1.5">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => toggleExpanded(item.id)}
                          aria-label={expandedVariables.has(item.id) ? 'Ocultar gastos' : 'Ver gastos'}
                        >
                          {expandedVariables.has(item.id) ? '−' : '+'}
                        </Button>
                        <span className="font-medium text-sm">{item.name || 'Gasto variable'}</span>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openInlineEdit(item)}>
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <p className="text-[11px] text-muted-foreground">{subcategory}</p>
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
                        <TableCell key={ym} className="px-2 py-1.5 text-right text-xs tabular-nums">
                          {active
                            ? `${formatCurrency(spent, currentHousehold?.currency)} / ${formatCurrency(budget, currentHousehold?.currency)}`
                            : '—'}
                        </TableCell>
                      )
                    })}
                  </TableRow>
                  {expandedVariables.has(item.id) && (
                    <TableRow key={`${item.id}-details`} className="bg-muted/40">
                      <TableCell className="px-2 py-1.5 text-xs text-muted-foreground">Detalle</TableCell>
                      <TableCell className="px-2 py-1.5 text-xs text-muted-foreground">{group}</TableCell>
                      <TableCell className="px-2 py-1.5 text-xs text-muted-foreground">Gastos reales</TableCell>
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

              {showUnbudgeted && (
              <TableRow>
                <TableCell className="px-2 py-1.5 sticky left-0 bg-background">
                  <Badge variant="outline" className="text-[10px]">No presupuestado</Badge>
                </TableCell>
                <TableCell className="px-2 py-1.5 text-xs">Otros</TableCell>
                <TableCell className="px-2 py-1.5">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setExpandedUnbudgeted((v) => !v)}
                      aria-label={expandedUnbudgeted ? 'Ocultar no presupuestados' : 'Ver no presupuestados'}
                    >
                      {expandedUnbudgeted ? '−' : '+'}
                    </Button>
                    <span className="font-medium text-sm text-red-700">No presupuestados</span>
                  </div>
                </TableCell>
                {monthsWindow.map((ym) => (
                  <TableCell key={ym} className="px-2 py-1.5 text-right text-xs tabular-nums text-red-700">
                    {monthlySummary[ym] ? formatCurrency(monthlySummary[ym].unbudgeted, currentHousehold?.currency) : '—'}
                  </TableCell>
                ))}
              </TableRow>
              )}
              {showUnbudgeted && expandedUnbudgeted && (
                <TableRow className="bg-muted/40">
                  <TableCell className="px-2 py-1.5 text-xs text-muted-foreground">Detalle</TableCell>
                  <TableCell className="px-2 py-1.5 text-xs text-muted-foreground">Otros</TableCell>
                  <TableCell className="px-2 py-1.5 text-xs text-muted-foreground">Gastos reales</TableCell>
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

              {showSummary && (
              <TableRow>
                <TableCell className="px-2 py-1.5 sticky left-0 bg-background">
                  <Badge variant="secondary" className="text-[10px]">Resumen</Badge>
                </TableCell>
                <TableCell className="px-2 py-1.5 text-xs">Totales</TableCell>
                <TableCell className="px-2 py-1.5 font-semibold text-sm">Balance planificado</TableCell>
                {monthsWindow.map((ym) => (
                  <TableCell
                    key={ym}
                    className={`px-2 py-1.5 text-right text-xs tabular-nums ${
                      monthlySummary[ym]?.balancePlanned < 0 ? 'text-red-700' : 'text-green-700'
                    }`}
                  >
                    {monthlySummary[ym] ? formatCurrency(monthlySummary[ym].balancePlanned, currentHousehold?.currency) : '—'}
                  </TableCell>
                ))}
              </TableRow>
              )}

              {showSummary && (
              <TableRow>
                <TableCell className="px-2 py-1.5 sticky left-0 bg-background">
                  <Badge variant="secondary" className="text-[10px]">Resumen</Badge>
                </TableCell>
                <TableCell className="px-2 py-1.5 text-xs">Totales</TableCell>
                <TableCell className="px-2 py-1.5 font-semibold text-sm">Balance real</TableCell>
                {monthsWindow.map((ym) => (
                  <TableCell
                    key={ym}
                    className={`px-2 py-1.5 text-right text-xs tabular-nums ${
                      monthlySummary[ym]?.balance < 0 ? 'text-red-700' : 'text-green-700'
                    }`}
                  >
                    {monthlySummary[ym] ? formatCurrency(monthlySummary[ym].balance, currentHousehold?.currency) : '—'}
                  </TableCell>
                ))}
              </TableRow>
              )}

              {showSummary && (
              <TableRow>
                <TableCell className="px-2 py-1.5 sticky left-0 bg-background">
                  <Badge variant="secondary" className="text-[10px]">Resumen</Badge>
                </TableCell>
                <TableCell className="px-2 py-1.5 text-xs">Totales</TableCell>
                <TableCell className="px-2 py-1.5 font-semibold text-sm">Ahorro a la fecha</TableCell>
                {monthsWindow.map((ym) => {
                  const isFuture = ym > getCurrentMonth()
                  const val = monthlySummary[ym]
                    ? isFuture
                      ? monthlySummary[ym].balancePlanned
                      : monthlySummary[ym].balance
                    : 0
                  return (
                    <TableCell
                      key={ym}
                      className={`px-2 py-1.5 text-right text-xs tabular-nums ${val >= 0 ? 'text-green-700' : 'text-red-700'}`}
                    >
                      {monthlySummary[ym] ? formatCurrency(val, currentHousehold?.currency) : '—'}
                    </TableCell>
                  )
                })}
              </TableRow>
              )}

              {showSummary && (
              <TableRow>
                <TableCell className="px-2 py-1.5 sticky left-0 bg-background">
                  <Badge variant="secondary" className="text-[10px]">Resumen</Badge>
                </TableCell>
                <TableCell className="px-2 py-1.5 text-xs">Totales</TableCell>
                <TableCell className="px-2 py-1.5 font-semibold text-sm">Ahorro acumulado</TableCell>
                {monthsWindow.map((ym) => {
                  const isFuture = ym > getCurrentMonth()
                  const val = cumulativeSavings[ym] ?? 0
                  return (
                    <TableCell
                      key={ym}
                      className={`px-2 py-1.5 text-right text-xs tabular-nums ${isFuture ? 'text-muted-foreground' : 'text-foreground'}`}
                    >
                      {formatCurrency(val, currentHousehold?.currency)}
                    </TableCell>
                  )
                })}
              </TableRow>
              )}
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
          <div className="space-y-1 text-sm text-muted-foreground">
            <p>
              Usa “Ver 7/13 meses” para cambiar la ventana. Los montos de variables y no presupuestados se calculan con los gastos reales de cada mes.
            </p>
            <p>
              Nota: “Ahorro a la fecha” y “Ahorro acumulado” usan balance real hasta el mes actual; desde el mes siguiente en adelante usan el balance planificado.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
