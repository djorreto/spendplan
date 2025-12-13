'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
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
import { useToast } from '@/components/ui/toast'
import { supabaseBrowser } from '@/lib/supabase'
import { formatCurrency, formatDate, getCurrentMonth, getCurrentDate, getCategoryColor, getPaymentMethodLabel, paymentMethodLabels } from '@/lib/utils'
import { 
  Plus, 
  Search,
  Filter,
  MoreVertical,
  Pencil,
  Trash2,
  Receipt,
  Calendar,
  Tag,
  Camera
} from 'lucide-react'
import { ReceiptScanner } from '@/components/expenses/receipt-scanner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Expense, Category, PaymentMethod } from '@/types'

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
  
  // Check if we're in demo mode - use hook state AND check household ID
  const checkIsDemoMode = () => hookIsDemoMode && currentHousehold?.id.startsWith('demo-')
  const { user } = useAuth()
  const { addToast } = useToast()
  
  const [loading, setLoading] = useState(true)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [budgetedCategoryIds, setBudgetedCategoryIds] = useState<string[]>([]) // Categories with variable budget
  const [searchQuery, setSearchQuery] = useState('')
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [filterMonth, setFilterMonth] = useState(getCurrentMonth())
  
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

    try {
      // Load categories
      const { data: cats } = await supabase
        .from('categories')
        .select('*')
        .or(`household_id.eq.${currentHousehold.id},is_system.eq.true`)
        .eq('is_active', true)
        .order('sort_order')

      setCategories(cats || [])

      // Load expenses
      const { data: exps } = await supabase
        .from('expenses')
        .select(`
          *,
          category:categories!expenses_category_id_fkey(*)
        `)
        .eq('household_id', currentHousehold.id)
        .gte('expense_date', `${filterMonth}-01`)
        .lt('expense_date', `${filterMonth}-32`)
        .order('expense_date', { ascending: false })

      setExpenses(exps || [])
    } catch (error) {
      console.error('Error loading expenses:', error)
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

    try {
      if (editingExpense) {
        const { error } = await supabase
          .from('expenses')
          .update(expenseData)
          .eq('id', editingExpense.id)

        if (error) throw error
        addToast({ type: 'success', message: 'Gasto actualizado' })
      } else {
        const { error } = await supabase
          .from('expenses')
          .insert({
            ...expenseData,
            created_by: user.id,
            source: 'manual',
            status: 'confirmed',
          })

        if (error) throw error
        addToast({ type: 'success', message: 'Gasto registrado' })
      }

      setDialogOpen(false)
      loadData()
    } catch (error) {
      console.error('Error saving expense:', error)
      addToast({ type: 'error', message: 'Error al guardar gasto' })
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

    try {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', id)

      if (error) throw error
      addToast({ type: 'success', message: 'Gasto eliminado' })
      loadData()
    } catch (error) {
      addToast({ type: 'error', message: 'Error al eliminar gasto' })
    }
  }

  // Filter expenses
  const filteredExpenses = expenses.filter(expense => {
    const matchesSearch = !searchQuery || 
      expense.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      expense.merchant?.toLowerCase().includes(searchQuery.toLowerCase())
    
    const matchesCategory = filterCategory === 'all' || expense.category_id === filterCategory

    return matchesSearch && matchesCategory
  })

  // Calculate total
  const totalFiltered = filteredExpenses.reduce((sum, e) => sum + e.amount, 0)

  // Generate months
  const months = Array.from({ length: 6 }, (_, i) => {
    const date = new Date()
    date.setMonth(date.getMonth() - i)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Gastos</h1>
          <p className="text-muted-foreground">
            {filteredExpenses.length} gastos · Total: {formatCurrency(totalFiltered, currentHousehold?.currency)}
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

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por descripción o comercio..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filterMonth} onValueChange={setFilterMonth}>
              <SelectTrigger className="w-[160px]">
                <Calendar className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {months.map(m => (
                  <SelectItem key={m} value={m}>
                    {new Date(m + '-01').toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-[180px]">
                <Tag className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Categoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las categorías</SelectItem>
                {categories.map(cat => (
                  <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Expenses List */}
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
            <div className="divide-y">
              {filteredExpenses.map((expense) => {
                const category = expense.category as Category | undefined
                return (
                  <div key={expense.id} className="flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors">
                    <div 
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: category ? getCategoryColor(category.name) + '20' : '#9ca3af20' }}
                    >
                      <Receipt 
                        className="h-5 w-5" 
                        style={{ color: category ? getCategoryColor(category.name) : '#9ca3af' }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {expense.merchant || expense.description || 'Gasto'}
                      </p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>{formatDate(expense.expense_date)}</span>
                        <span>·</span>
                        <span>{getPaymentMethodLabel(expense.payment_method)}</span>
                        {category && (
                          <>
                            <span>·</span>
                            <Badge variant="secondary" className="text-xs">
                              {category.name}
                            </Badge>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold tabular-nums">
                        {formatCurrency(expense.amount, currentHousehold?.currency)}
                      </p>
                      {expense.status === 'pending' && (
                        <Badge variant="outline" className="text-xs">Pendiente</Badge>
                      )}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
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
                  </div>
                )
              })}
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

