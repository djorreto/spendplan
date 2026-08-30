'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useHousehold } from '@/hooks/use-household'
import { useAuth } from '@/hooks/use-auth'
import { useSelectedMonth } from '@/hooks/use-selected-month'
import { useToast } from '@/components/ui/toast'
import { supabaseBrowser } from '@/lib/supabase'
import { formatCurrency, formatDate, getCurrentDate, getCategoryColor, getMonthDateRange, paymentMethodLabels } from '@/lib/utils'
import {
  originalExpenseDetail,
  originalExpenseText,
  resolveCategoryParts,
} from '@/lib/category-taxonomy'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { 
  Plus, 
  ArrowUpDown,
  MoreVertical,
  Pencil,
  Trash2,
  Receipt,
  Camera,
  Check
} from 'lucide-react'
import { ReceiptScanner } from '@/components/expenses/receipt-scanner'
import { ExpenseQuickEdit } from '@/components/expenses/expense-quick-edit'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Expense, Category, PaymentMethod } from '@/types'
import { endOp, formatSupabaseError, logOp, startOp, withRetry } from '@/lib/debug-log'

// Demo mode helpers
const DEMO_EXPENSES_KEY = 'spendplan_demo_expenses'
const DEMO_CUSTOM_CATEGORIES_KEY = 'spendplan_demo_custom_categories'
const DEMO_BUDGET_KEY = 'spendplan_demo_budget_v2'

// Budget item interface for creating installments
interface BudgetItem {
  id: string
  kind: 'income' | 'expense'
  type: 'fixed' | 'variable'
  name: string
  amount: number
  category_id?: string
  frequency: 'monthly' | 'weekly' | 'biweekly' | 'yearly' | 'one_time'
  start_date: string
  end_date?: string
  is_indefinite: boolean
  is_active: boolean
  manually_deactivated: boolean
  is_installment?: boolean
  total_installments?: number
  notes?: string
  created_at: string
  updated_at: string
}

function getDemoBudgetItems(): BudgetItem[] {
  if (typeof window === 'undefined') return []
  const saved = localStorage.getItem(DEMO_BUDGET_KEY)
  if (!saved) return []
  const data = JSON.parse(saved)
  return data.items || []
}

function saveDemoBudgetItem(item: BudgetItem) {
  const items = getDemoBudgetItems()
  items.push(item)
  localStorage.setItem(DEMO_BUDGET_KEY, JSON.stringify({ items }))
}

const DEMO_CATEGORIES: Category[] = [
  // Vivienda
  { id: 'cat-1', name: 'Dividendo', icon: '🏦', color: '#1e40af', is_system: true, is_active: true, sort_order: 1, created_at: '', updated_at: '' },
  { id: 'cat-2', name: 'Arriendo', icon: '🔑', color: '#1d4ed8', is_system: true, is_active: true, sort_order: 2, created_at: '', updated_at: '' },
  // Servicios básicos
  { id: 'cat-3', name: 'Servicios Básicos', icon: '🏠', color: '#0891b2', is_system: true, is_active: true, sort_order: 3, created_at: '', updated_at: '' },
  { id: 'cat-4', name: 'Electricidad', icon: '⚡', color: '#eab308', is_system: true, is_active: true, sort_order: 4, created_at: '', updated_at: '' },
  { id: 'cat-5', name: 'Agua', icon: '💧', color: '#0ea5e9', is_system: true, is_active: true, sort_order: 5, created_at: '', updated_at: '' },
  { id: 'cat-6', name: 'Gas', icon: '🔥', color: '#f97316', is_system: true, is_active: true, sort_order: 6, created_at: '', updated_at: '' },
  // Hogar
  { id: 'cat-7', name: 'Hogar', icon: '🏡', color: '#84cc16', is_system: true, is_active: true, sort_order: 7, created_at: '', updated_at: '' },
  { id: 'cat-8', name: 'Jardinería', icon: '🌱', color: '#22c55e', is_system: true, is_active: true, sort_order: 8, created_at: '', updated_at: '' },
  // Cotidiano
  { id: 'cat-9', name: 'Supermercado', icon: '🛒', color: '#16a34a', is_system: true, is_active: true, sort_order: 9, created_at: '', updated_at: '' },
  { id: 'cat-10', name: 'Transporte', icon: '🚗', color: '#3b82f6', is_system: true, is_active: true, sort_order: 10, created_at: '', updated_at: '' },
  { id: 'cat-11', name: 'Restaurantes', icon: '🍽️', color: '#f59e0b', is_system: true, is_active: true, sort_order: 11, created_at: '', updated_at: '' },
  // Otros
  { id: 'cat-12', name: 'Entretenimiento', icon: '🎬', color: '#8b5cf6', is_system: true, is_active: true, sort_order: 12, created_at: '', updated_at: '' },
  { id: 'cat-13', name: 'Salud', icon: '💊', color: '#ef4444', is_system: true, is_active: true, sort_order: 13, created_at: '', updated_at: '' },
  { id: 'cat-14', name: 'Educación', icon: '📚', color: '#ec4899', is_system: true, is_active: true, sort_order: 14, created_at: '', updated_at: '' },
  { id: 'cat-15', name: 'Suscripciones', icon: '📺', color: '#a855f7', is_system: true, is_active: true, sort_order: 15, created_at: '', updated_at: '' },
  { id: 'cat-16', name: 'Seguros', icon: '🛡️', color: '#6366f1', is_system: true, is_active: true, sort_order: 16, created_at: '', updated_at: '' },
  { id: 'cat-17', name: 'Ropa', icon: '👕', color: '#d946ef', is_system: true, is_active: true, sort_order: 17, created_at: '', updated_at: '' },
  { id: 'cat-18', name: 'Otros', icon: '📦', color: '#6b7280', is_system: true, is_active: true, sort_order: 18, created_at: '', updated_at: '' },
]

function getCustomCategories(): Category[] {
  if (typeof window === 'undefined') return []
  const saved = localStorage.getItem(DEMO_CUSTOM_CATEGORIES_KEY)
  return saved ? JSON.parse(saved) : []
}

function getAllCategories(): Category[] {
  return [...DEMO_CATEGORIES, ...getCustomCategories()]
}

function getDemoExpenses(): Expense[] {
  if (typeof window === 'undefined') return []
  const saved = localStorage.getItem(DEMO_EXPENSES_KEY)
  return saved ? JSON.parse(saved) : []
}

function saveDemoExpenses(expenses: Expense[]) {
  localStorage.setItem(DEMO_EXPENSES_KEY, JSON.stringify(expenses))
}

export default function ExpensesPage() {
  const { currentHousehold, isDemoMode: hookIsDemoMode } = useHousehold()
  const { selectedMonth } = useSelectedMonth(currentHousehold?.id)
  const searchParams = useSearchParams()
  const router = useRouter()
  
  // Check if we're in demo mode - use hook state AND check household ID
  const checkIsDemoMode = () => hookIsDemoMode && currentHousehold?.id.startsWith('demo-')
  const { user } = useAuth()
  const { addToast } = useToast()
  
  const [loading, setLoading] = useState(true)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [budgetedCategoryIds, setBudgetedCategoryIds] = useState<string[]>([]) // Categories with variable budget
  const [searchQuery, setSearchQuery] = useState('')
  const [filterGroup, setFilterGroup] = useState<string>('all')
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [sortKey, setSortKey] = useState<'date' | 'text' | 'group' | 'sub' | 'amount'>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const filterMonth = selectedMonth
  
  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [formData, setFormData] = useState({
    amount: '',
    description: '',
    merchant: '',
    expense_date: getCurrentDate(),
    payment_method: 'debit' as PaymentMethod,
    category_id: '',
    notes: '',
    // Installments (cuotas) - only when payment_method is 'credit'
    is_installment: false,
    total_installments: '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (currentHousehold) {
      loadData()
    }
  }, [currentHousehold, filterMonth])

  useEffect(() => {
    const newParam = searchParams?.get('new')
    const editParam = searchParams?.get('edit')
    if (newParam && newParam !== '0' && newParam !== 'false') {
      openNewExpense()
      router.replace('/app/expenses')
      return
    }
    if (editParam && expenses.length > 0) {
      const exp = expenses.find(e => e.id === editParam)
      if (exp) {
        openEditExpense(exp)
        router.replace('/app/expenses')
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, expenses])

  const loadData = async () => {
    if (!currentHousehold) return
    
    setLoading(true)

    // Check demo mode first
    if (checkIsDemoMode()) {
      console.log('📦 Loading demo data')
      const allCats = getAllCategories()
      setCategories(allCats)
      
      // Load budgeted variable categories
      const budgetItems = getDemoBudgetItems()
      const variableCategoryIds = budgetItems
        .filter(item => item.kind === 'expense' && item.type === 'variable' && item.is_active)
        .map(item => item.category_id)
        .filter(Boolean) as string[]
      setBudgetedCategoryIds(variableCategoryIds)
      
      const demoExpenses = getDemoExpenses()
      // Filter by month
      const filtered = demoExpenses.filter(e => e.expense_date.startsWith(filterMonth))
      // Add category object to each expense
      const withCategories = filtered.map(e => ({
        ...e,
        category: allCats.find(c => c.id === e.category_id) || null
      }))
      setExpenses(withCategories.sort((a, b) => b.expense_date.localeCompare(a.expense_date)))
      setLoading(false)
      return
    }

    const supabase = supabaseBrowser()
    const op = startOp('expenses.loadData', { householdId: currentHousehold.id, filterMonth })
    const range = getMonthDateRange(filterMonth)

    try {
      // Load categories
      const catsResp = await withRetry(
        () =>
          supabase
            .from('categories')
            .select('*')
            .or(`household_id.eq.${currentHousehold.id},is_system.eq.true`)
            .eq('is_active', true)
            .order('sort_order'),
        { retries: 2, baseDelayMs: 250, ctx: op, step: 'select.categories' }
      )

      if (catsResp.error) {
        logOp(op, 'error', 'categories select failed', 'select.categories', {
          error: formatSupabaseError(catsResp.error),
        })
        throw catsResp.error
      }

      setCategories(catsResp.data || [])

      // Load expenses
      const expsResp = await withRetry(
        () =>
          supabase
            .from('expenses')
            .select(
              `
          *,
          category:categories!expenses_category_id_fkey(*)
        `
            )
            .eq('household_id', currentHousehold.id)
            .gte('expense_date', range.start)
            .lt('expense_date', range.endExclusive)
            .order('expense_date', { ascending: false }),
        { retries: 2, baseDelayMs: 250, ctx: op, step: 'select.expenses' }
      )

      if (expsResp.error) {
        logOp(op, 'error', 'expenses select failed', 'select.expenses', {
          error: formatSupabaseError(expsResp.error),
        })
        throw expsResp.error
      }

      setExpenses(expsResp.data || [])
      endOp(op, true, { categories: catsResp.data?.length || 0, expenses: expsResp.data?.length || 0 })
    } catch (error) {
      console.error('Error loading expenses:', error)
      endOp(op, false, { error: formatSupabaseError(error) })
      addToast({ type: 'error', message: `Error al cargar gastos (opId: ${op.opId})` })
      // Fallback to demo mode
      setCategories(getAllCategories())
      setExpenses([])
    } finally {
      setLoading(false)
    }
  }

  const openNewExpense = () => {
    setEditingExpense(null)
    setFormData({
      amount: '',
      description: '',
      merchant: '',
      expense_date: getCurrentDate(),
      payment_method: 'debit',
      category_id: '',
      notes: '',
      is_installment: false,
      total_installments: '',
    })
    setDialogOpen(true)
  }

  const openEditExpense = (expense: Expense) => {
    setEditingExpense(expense)
    setFormData({
      amount: expense.amount.toString(),
      description: expense.description || '',
      merchant: expense.merchant || '',
      expense_date: expense.expense_date,
      payment_method: expense.payment_method,
      category_id: expense.category_id || '',
      notes: expense.notes || '',
      is_installment: false,
      total_installments: '',
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!currentHousehold || !user) return
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      addToast({ type: 'error', message: 'Ingresa un monto válido' })
      return
    }
    
    // Validate unbudgeted expense has a name
    if (formData.category_id === 'unbudgeted' && !formData.description?.trim()) {
      addToast({ type: 'error', message: 'Ingresa un nombre para el gasto no presupuestado' })
      return
    }

    setSaving(true)

    // Handle "unbudgeted" special category
    const categoryId = formData.category_id === 'unbudgeted' ? null : (formData.category_id || null)
    const isUnbudgeted = formData.category_id === 'unbudgeted' || !budgetedCategoryIds.includes(formData.category_id)

    const expenseData = {
      household_id: currentHousehold.id,
      amount: parseFloat(formData.amount),
      description: formData.description || null,
      merchant: formData.merchant || null,
      expense_date: formData.expense_date,
      payment_method: formData.payment_method,
      category_id: categoryId,
      is_unbudgeted: isUnbudgeted, // Mark as unbudgeted expense
      notes: formData.notes || null,
      updated_by: user.id,
    }

    // Demo mode: save to localStorage
    if (checkIsDemoMode()) {
      console.log('💾 Saving expense in demo mode')
      const demoExpenses = getDemoExpenses()
      
      if (editingExpense) {
        const index = demoExpenses.findIndex(e => e.id === editingExpense.id)
        if (index >= 0) {
          demoExpenses[index] = { ...demoExpenses[index], ...expenseData, updated_at: new Date().toISOString() }
        }
        addToast({ type: 'success', message: 'Gasto actualizado' })
      } else {
        const newExpense: Expense = {
          ...expenseData,
          id: `demo-expense-${Date.now()}`,
          created_by: user.id,
          source: 'manual',
          status: 'confirmed',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as Expense
        demoExpenses.push(newExpense)
        
        // If it's a credit purchase with installments, create fixed expense in budget
        if (formData.payment_method === 'credit' && formData.is_installment && formData.total_installments) {
          const totalInstallments = parseInt(formData.total_installments)
          if (totalInstallments > 1) {
            const now = new Date().toISOString()
            const startDate = new Date(formData.expense_date)
            const endDate = new Date(startDate)
            endDate.setMonth(endDate.getMonth() + totalInstallments - 1)
            
            const itemName = formData.merchant || formData.description || 'Compra en cuotas'
            const installmentAmount = parseFloat(formData.amount) // Ya es el valor de la cuota
            
            const budgetItem: BudgetItem = {
              id: `item-installment-${Date.now()}`,
              kind: 'expense',
              type: 'fixed',
              name: itemName,
              amount: installmentAmount,
              category_id: formData.category_id || undefined,
              frequency: 'monthly',
              start_date: formData.expense_date,
              end_date: endDate.toISOString().split('T')[0],
              is_indefinite: false,
              is_active: true,
              manually_deactivated: false,
              is_installment: true,
              total_installments: totalInstallments,
              notes: formData.notes || `Compra en ${totalInstallments} cuotas`,
              created_at: now,
              updated_at: now,
            }
            
            saveDemoBudgetItem(budgetItem)
            addToast({ type: 'success', message: `Gasto registrado + ${totalInstallments} cuotas agregadas al presupuesto` })
          } else {
            addToast({ type: 'success', message: 'Gasto registrado' })
          }
        } else {
          addToast({ type: 'success', message: 'Gasto registrado' })
        }
      }
      
      saveDemoExpenses(demoExpenses)
      setDialogOpen(false)
      setSaving(false)
      loadData()
      return
    }

    // Supabase mode
    const supabase = supabaseBrowser()
    const op = startOp('expenses.save', {
      householdId: currentHousehold.id,
      userId: user.id,
      editing: !!editingExpense,
    })

    try {
      if (editingExpense) {
        const resp = await withRetry(
          () =>
            supabase
              .from('expenses')
              .update(expenseData)
              .eq('id', editingExpense.id)
              .select('id')
              .single(),
          { retries: 2, baseDelayMs: 250, ctx: op, step: 'update.expense' }
        )
        if (resp.error) throw resp.error
        addToast({ type: 'success', message: 'Gasto actualizado' })
      } else {
        const resp = await withRetry(
          () =>
            supabase
              .from('expenses')
              .insert({
                ...expenseData,
                created_by: user.id,
                source: 'manual',
                status: 'confirmed',
              })
              .select('id')
              .single(),
          { retries: 2, baseDelayMs: 250, ctx: op, step: 'insert.expense' }
        )
        if (resp.error) throw resp.error
        addToast({ type: 'success', message: 'Gasto registrado' })
      }

      setDialogOpen(false)
      endOp(op, true)
      loadData()
    } catch (error) {
      console.error('Error saving expense:', error)
      logOp(op, 'error', 'save failed', 'save', { error: formatSupabaseError(error) })
      endOp(op, false)
      addToast({ type: 'error', message: `Error al guardar gasto (opId: ${op.opId})` })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este gasto?')) return

    // Demo mode: delete from localStorage
    if (checkIsDemoMode()) {
      const demoExpenses = getDemoExpenses()
      const filtered = demoExpenses.filter(e => e.id !== id)
      saveDemoExpenses(filtered)
      addToast({ type: 'success', message: 'Gasto eliminado' })
      loadData()
      return
    }

    const supabase = supabaseBrowser()
    const op = startOp('expenses.delete', { id })

    try {
      const resp = await withRetry(
        () => supabase.from('expenses').delete().eq('id', id),
        { retries: 2, baseDelayMs: 250, ctx: op, step: 'delete.expense' }
      )
      if (resp.error) throw resp.error
      addToast({ type: 'success', message: 'Gasto eliminado' })
      endOp(op, true)
      loadData()
    } catch (error) {
      logOp(op, 'error', 'delete failed', 'delete', { error: formatSupabaseError(error) })
      endOp(op, false)
      addToast({ type: 'error', message: `Error al eliminar gasto (opId: ${op.opId})` })
    }
  }

  const handleConfirm = async (id: string) => {
    if (checkIsDemoMode()) {
      addToast({ type: 'success', message: 'Gasto confirmado' })
      return
    }

    const supabase = supabaseBrowser()
    const op = startOp('expenses.confirm', { id })
    try {
      const resp = await withRetry(
        () => supabase.from('expenses').update({ status: 'confirmed' }).eq('id', id),
        { retries: 2, baseDelayMs: 250, ctx: op, step: 'update.expense' }
      )
      if (resp.error) throw resp.error
      addToast({ type: 'success', message: 'Gasto confirmado' })
      endOp(op, true)
      loadData()
    } catch (error) {
      logOp(op, 'error', 'confirm failed', 'confirm', { error: formatSupabaseError(error) })
      endOp(op, false)
      addToast({ type: 'error', message: `Error al confirmar gasto (opId: ${op.opId})` })
    }
  }

  const rows = useMemo(() => {
    return expenses
      .filter((expense) => expense.status !== 'cancelled')
      .map((expense) => {
        const category = (expense.category as Category | undefined) || categories.find((c) => c.id === expense.category_id)
        const parts = resolveCategoryParts(category, categories)
        return {
          expense,
          category,
          group: parts.group,
          subcategory: parts.subcategory,
          original: originalExpenseText(expense),
          detail: originalExpenseDetail(expense),
        }
      })
  }, [expenses, categories])

  const groupOptions = useMemo(
    () => [...new Set(rows.map((row) => row.group))].sort((a, b) => a.localeCompare(b, 'es')),
    [rows]
  )

  const subcategoryOptions = useMemo(() => {
    const filtered = filterGroup === 'all' ? rows : rows.filter((row) => row.group === filterGroup)
    const byId = new Map<string, string>()
    for (const row of filtered) {
      if (row.expense.category_id && row.subcategory !== '—') {
        byId.set(row.expense.category_id, row.subcategory)
      }
    }
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'))
  }, [rows, filterGroup])

  const filteredExpenses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const next = rows.filter((row) => {
      const matchesSearch =
        !q ||
        row.original.toLowerCase().includes(q) ||
        (row.detail || '').toLowerCase().includes(q) ||
        row.group.toLowerCase().includes(q) ||
        row.subcategory.toLowerCase().includes(q) ||
        (row.expense.notes || '').toLowerCase().includes(q)
      const matchesGroup = filterGroup === 'all' || row.group === filterGroup
      const matchesCategory = filterCategory === 'all' || row.expense.category_id === filterCategory
      const matchesStatus = filterStatus === 'all' || row.expense.status === filterStatus
      return matchesSearch && matchesGroup && matchesCategory && matchesStatus
    })

    const dir = sortDir === 'asc' ? 1 : -1
    next.sort((a, b) => {
      if (sortKey === 'amount') return (a.expense.amount - b.expense.amount) * dir
      if (sortKey === 'date') return a.expense.expense_date.localeCompare(b.expense.expense_date) * dir
      if (sortKey === 'text') return a.original.localeCompare(b.original, 'es') * dir
      if (sortKey === 'group') return a.group.localeCompare(b.group, 'es') * dir
      return a.subcategory.localeCompare(b.subcategory, 'es') * dir
    })
    return next
  }, [rows, searchQuery, filterGroup, filterCategory, filterStatus, sortKey, sortDir])

  const pendingCount = filteredExpenses.filter((row) => row.expense.status === 'pending').length

  const totalFiltered = filteredExpenses
    .filter((row) => row.expense.status === 'confirmed')
    .reduce((sum, row) => sum + row.expense.amount, 0)

  const applyExpensePatch = (id: string, patch: Partial<Expense> & { category?: Category | null }) => {
    setExpenses((prev) =>
      prev.map((item) =>
        item.id === id
          ? ({
              ...item,
              ...patch,
              category: patch.category !== undefined ? patch.category : item.category,
            } as Expense)
          : item
      )
    )
  }

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDir(key === 'amount' || key === 'date' ? 'desc' : 'asc')
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Gastos</h1>
          <p className="text-muted-foreground">
            {filteredExpenses.length} filas · Total confirmado:{' '}
            {formatCurrency(totalFiltered, currentHousehold?.currency)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setScannerOpen(true)}>
            <Camera className="mr-2 h-4 w-4" />
            Escanear Boleta
          </Button>
          <Button onClick={openNewExpense}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo Gasto
          </Button>
        </div>
      </div>

      {pendingCount > 0 && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
          <CardContent className="p-4 text-sm">
            {pendingCount === 1
              ? 'Hay 1 gasto pendiente (correo o Telegram). Revisa la sugerencia de IA, corrige si hace falta y confírmalo para que sume al mes.'
              : `Hay ${pendingCount} gastos pendientes (correo o Telegram). Revisa la sugerencia de IA, corrige si hace falta y confírmalos para que sumen al mes.`}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="grid gap-2 md:grid-cols-4">
            <Input
              placeholder="Filtrar texto original, categoría..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9"
            />
            <Select
              value={filterGroup}
              onValueChange={(value) => {
                setFilterGroup(value)
                setFilterCategory('all')
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
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Subcategoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las subcategorías</SelectItem>
                {subcategoryOptions.map((item) => (
                  <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="confirmed">Confirmados</SelectItem>
                <SelectItem value="pending">Pendientes</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Cargando...</div>
          ) : filteredExpenses.length === 0 ? (
            <div className="p-8 text-center">
              <Receipt className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No hay gastos para mostrar</p>
              <Button onClick={openNewExpense} className="mt-4">
                <Plus className="mr-2 h-4 w-4" />
                Agregar primer gasto
              </Button>
            </div>
          ) : (
            <div className="overflow-auto max-h-[70vh]">
              <Table className="min-w-[1100px]">
                <TableHeader className="sticky top-0 z-10 bg-background shadow-sm">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-9 w-[108px] px-2">
                      <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort('date')}>
                        Fecha <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </TableHead>
                    <TableHead className="h-9 px-2">
                      <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort('text')}>
                        Texto original <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </TableHead>
                    <TableHead className="h-9 w-[140px] px-2">
                      <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort('group')}>
                        Categoría <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </TableHead>
                    <TableHead className="h-9 w-[200px] px-2">
                      <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort('sub')}>
                        Subcategoría <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </TableHead>
                    <TableHead className="h-9 w-[220px] px-2">Comentario</TableHead>
                    <TableHead className="h-9 w-[120px] px-2 text-right">
                      <button type="button" className="inline-flex items-center gap-1 ml-auto" onClick={() => toggleSort('amount')}>
                        Monto <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </TableHead>
                    <TableHead className="h-9 w-[44px] px-1" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredExpenses.map(({ expense, category, group, subcategory, original, detail }) => (
                    <TableRow
                      key={expense.id}
                      className={expense.status === 'pending' ? 'bg-amber-50/70 dark:bg-amber-950/20' : undefined}
                    >
                      <TableCell className="px-2 py-1.5 text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(expense.expense_date)}
                      </TableCell>
                      <TableCell className="px-2 py-1.5">
                        <button
                          type="button"
                          className="text-left w-full"
                          onClick={() => openEditExpense(expense)}
                        >
                          <p className="font-medium leading-tight">{original}</p>
                          {detail && (
                            <p className="text-xs text-muted-foreground leading-tight">{detail}</p>
                          )}
                          {expense.status === 'pending' && expense.ai_reason && (
                            <p className="text-xs text-amber-700 dark:text-amber-400 leading-tight mt-0.5">
                              IA: {expense.ai_reason}
                            </p>
                          )}
                        </button>
                      </TableCell>
                      <TableCell className="px-2 py-1.5 text-sm">{group}</TableCell>
                      <TableCell className="px-2 py-1.5" colSpan={2}>
                        <ExpenseQuickEdit
                          expense={expense}
                          categories={categories}
                          budgetedCategoryIds={budgetedCategoryIds}
                          onPatched={applyExpensePatch}
                        />
                      </TableCell>
                      <TableCell className="px-2 py-1.5 text-right tabular-nums font-medium whitespace-nowrap">
                        <div>{formatCurrency(expense.amount, currentHousehold?.currency)}</div>
                        {expense.status === 'pending' && (
                          <Badge variant="outline" className="text-[10px]">Pendiente</Badge>
                        )}
                      </TableCell>
                      <TableCell className="px-1 py-1.5">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {expense.status === 'pending' && (
                              <DropdownMenuItem onClick={() => handleConfirm(expense.id)}>
                                <Check className="mr-2 h-4 w-4" />
                                Confirmar
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => openEditExpense(expense)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleDelete(expense.id)}
                              className="text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Eliminar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={5} className="px-2 py-2 text-sm">
                      {filteredExpenses.length} filas
                      {pendingCount > 0 ? ` · ${pendingCount} pendientes` : ''}
                    </TableCell>
                    <TableCell className="px-2 py-2 text-right tabular-nums font-semibold">
                      {formatCurrency(totalFiltered, currentHousehold?.currency)}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingExpense ? 'Editar Gasto' : 'Nuevo Gasto'}</DialogTitle>
            <DialogDescription>
              {editingExpense ? 'Modifica los datos del gasto' : 'Registra un nuevo gasto rápidamente'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="amount">Monto *</Label>
                <Input
                  id="amount"
                  type="number"
                  placeholder="0"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expense_date">Fecha</Label>
                <Input
                  id="expense_date"
                  type="date"
                  value={formData.expense_date}
                  onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="merchant">Comercio</Label>
              <Input
                id="merchant"
                placeholder="Ej: Jumbo, Shell, Netflix..."
                value={formData.merchant}
                onChange={(e) => setFormData({ ...formData, merchant: e.target.value })}
              />
            </div>
            {/* Description - only show if NOT unbudgeted (unbudgeted has its own field) */}
            {formData.category_id !== 'unbudgeted' && (
              <div className="space-y-2">
                <Label htmlFor="description">Descripción</Label>
                <Input
                  id="description"
                  placeholder="Descripción opcional"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="category">Categoría</Label>
                <Select 
                  value={formData.category_id} 
                  onValueChange={(v) => setFormData({ ...formData, category_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    {/* Budgeted categories first */}
                    {budgetedCategoryIds.length > 0 && (
                      <>
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                          📊 Presupuestadas
                        </div>
                        {categories
                          .filter(cat => budgetedCategoryIds.includes(cat.id))
                          .map(cat => (
                            <SelectItem key={cat.id} value={cat.id}>
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getCategoryColor(cat.name) }} />
                                {cat.name}
                              </div>
                            </SelectItem>
                          ))}
                        <div className="my-1 border-t" />
                      </>
                    )}
                    {/* Other categories (not budgeted) */}
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                      📁 Otras categorías
                    </div>
                    {categories
                      .filter(cat => !budgetedCategoryIds.includes(cat.id))
                      .map(cat => (
                        <SelectItem key={cat.id} value={cat.id}>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getCategoryColor(cat.name) }} />
                            {cat.name}
                          </div>
                        </SelectItem>
                      ))}
                    <div className="my-1 border-t" />
                    {/* Unbudgeted option */}
                    <SelectItem value="unbudgeted">
                      <span className="text-amber-600">⚠️ Sin categoría específica</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="payment_method">Método de pago</Label>
                <Select 
                  value={formData.payment_method} 
                  onValueChange={(v) => setFormData({ 
                    ...formData, 
                    payment_method: v as PaymentMethod,
                    is_installment: v === 'credit' ? formData.is_installment : false,
                    total_installments: v === 'credit' ? formData.total_installments : '',
                  })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(paymentMethodLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Unbudgeted expense name */}
            {formData.category_id === 'unbudgeted' && (
              <div className="space-y-2 p-3 rounded-lg border border-amber-200 bg-amber-50/50">
                <Label htmlFor="unbudgeted_name" className="text-amber-700">
                  Nombre del gasto no presupuestado *
                </Label>
                <Input
                  id="unbudgeted_name"
                  placeholder="Ej: Regalo cumpleaños, Reparación auto, Médico..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="border-amber-300 focus:border-amber-500"
                />
                <p className="text-xs text-amber-600">
                  ⚠️ Este gasto aparecerá en la sección "No presupuestados" del presupuesto
                </p>
              </div>
            )}

            {/* Installments Section - Only for Credit */}
            {formData.payment_method === 'credit' && (
              <div className="space-y-3 p-3 rounded-lg border border-purple-200 bg-purple-50/50">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_installment"
                    checked={formData.is_installment}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      is_installment: e.target.checked,
                      total_installments: e.target.checked ? '12' : '',
                    })}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <Label htmlFor="is_installment" className="cursor-pointer">
                    💳 Compra en cuotas
                  </Label>
                </div>
                
                {formData.is_installment && (
                  <div className="space-y-3 pl-6">
                    <div className="space-y-2">
                      <Label>Número de cuotas</Label>
                      <Input
                        type="number"
                        min="2"
                        max="60"
                        placeholder="12"
                        value={formData.total_installments}
                        onChange={(e) => setFormData({ 
                          ...formData, 
                          total_installments: e.target.value 
                        })}
                      />
                    </div>
                    {formData.total_installments && parseInt(formData.total_installments) > 1 && formData.amount && parseFloat(formData.amount) > 0 && (
                      <div className="text-xs text-purple-700 space-y-1 bg-purple-100 p-2 rounded">
                        <p>💰 Total a pagar: <strong>{formatCurrency(parseFloat(formData.amount) * parseInt(formData.total_installments), currentHousehold?.currency)}</strong></p>
                        <p>📅 Se agregará al presupuesto como gasto fijo por {formData.total_installments} meses</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="notes">Notas</Label>
              <Textarea
                id="notes"
                placeholder="Notas adicionales..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando...' : editingExpense ? 'Guardar Cambios' : 'Registrar Gasto'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receipt Scanner Modal */}
      {scannerOpen && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <ReceiptScanner
            onExtracted={(data) => {
              // Buscar categoría por nombre sugerido
              let categoryId = ''
              if (data.category) {
                const suggestedCat = data.category.toLowerCase()
                const found = categories.find(c => 
                  c.name.toLowerCase().includes(suggestedCat) || 
                  suggestedCat.includes(c.name.toLowerCase())
                )
                if (found) {
                  categoryId = found.id
                }
              }
              
              // Pre-fill form with extracted data
              setFormData({
                ...formData,
                amount: data.amount.toString(),
                merchant: data.merchant,
                expense_date: data.date,
                description: data.description || '',
                notes: '',
                payment_method: data.paymentMethod || 'cash',
                is_installment: false,
                total_installments: '',
                category_id: categoryId
              })
              setScannerOpen(false)
              setDialogOpen(true)
              addToast({ type: 'success', message: 'Datos extraídos de la boleta' })
            }}
            onCancel={() => setScannerOpen(false)}
            currency={currentHousehold?.currency}
          />
        </div>
      )}
    </div>
  )
}

