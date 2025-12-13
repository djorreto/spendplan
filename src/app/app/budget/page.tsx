'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { useHousehold } from '@/hooks/use-household'
import { useToast } from '@/components/ui/toast'
import { formatCurrency, formatDate, getCurrentMonth, formatMonth, getCategoryColor } from '@/lib/utils'
import { 
  Plus, 
  Trash2, 
  Save,
  TrendingUp,
  Wallet,
  AlertTriangle,
  CheckCircle,
  Calendar,
  Lock,
  ShoppingCart,
  Zap,
  Edit2,
  MoreVertical,
  Infinity as InfinityIcon,
  Eye,
  EyeOff,
  Clock,
  CheckCircle2,
  XCircle,
  History,
  Filter,
  ChevronDown,
  ChevronRight,
  TrendingDown
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Category, Expense } from '@/types'
import { supabaseBrowser } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'

// Storage keys
const DEMO_BUDGET_KEY = 'spendplan_demo_budget_v2'
const DEMO_EXPENSES_KEY = 'spendplan_demo_expenses'
const DEMO_CUSTOM_CATEGORIES_KEY = 'spendplan_demo_custom_categories'

// Helper to save custom categories
function saveCustomCategory(category: Category) {
  const existing = getCustomCategories()
  if (!existing.find(c => c.id === category.id)) {
    existing.push(category)
    localStorage.setItem(DEMO_CUSTOM_CATEGORIES_KEY, JSON.stringify(existing))
  }
}

function getCustomCategories(): Category[] {
  if (typeof window === 'undefined') return []
  const saved = localStorage.getItem(DEMO_CUSTOM_CATEGORIES_KEY)
  return saved ? JSON.parse(saved) : []
}

// Demo categories
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
  { id: 'cat-17', name: 'Otros', icon: '📦', color: '#6b7280', is_system: true, is_active: true, sort_order: 17, created_at: '', updated_at: '' },
]

// Types
type BudgetType = 'fixed' | 'variable'
type ItemKind = 'income' | 'expense'
type Frequency = 'monthly' | 'weekly' | 'biweekly' | 'yearly' | 'one_time'

interface BudgetItem {
  id: string
  kind: ItemKind // 'income' or 'expense'
  type: BudgetType // 'fixed' or 'variable' (only for expenses)
  name: string
  amount: number
  category_id?: string
  frequency: Frequency
  // Dates
  start_date: string // YYYY-MM-DD - when this item starts
  end_date?: string // YYYY-MM-DD - when this item ends (optional, null = indefinite)
  is_indefinite: boolean
  // Status (computed based on dates, but can be manually deactivated)
  is_active: boolean
  manually_deactivated: boolean // If user manually deactivated it
  // Installments (cuotas)
  is_installment?: boolean // Es compra en cuotas
  total_installments?: number // Número total de cuotas
  // Metadata
  notes?: string
  created_at: string
  updated_at: string
}

interface BudgetData {
  items: BudgetItem[]
}

// Helper functions
function isDemoMode(): boolean {
  if (typeof window === 'undefined') return false
  return !!localStorage.getItem('spendplan_demo_user')
}

function getBudgetData(): BudgetData {
  if (typeof window === 'undefined') return { items: [] }
  const saved = localStorage.getItem(DEMO_BUDGET_KEY)
  return saved ? JSON.parse(saved) : { items: [] }
}

function saveBudgetData(data: BudgetData) {
  localStorage.setItem(DEMO_BUDGET_KEY, JSON.stringify(data))
}

// Supabase functions for budget items
async function loadBudgetItemsFromSupabase(householdId: string): Promise<BudgetItem[]> {
  const supabase = supabaseBrowser()
  const { data, error } = await supabase
    .from('budget_items')
    .select('*')
    .eq('household_id', householdId)
    .order('created_at', { ascending: true })
  
  if (error) {
    console.error('Error loading budget items:', error)
    return []
  }
  
  // Transform from DB format to app format
  return (data || []).map(item => ({
    id: item.id,
    kind: item.kind as ItemKind,
    type: item.type as BudgetType,
    name: item.name,
    amount: parseFloat(item.amount) || 0,
    category_id: item.category_id,
    frequency: (item.frequency || 'monthly') as Frequency,
    start_date: item.start_date || new Date().toISOString().split('T')[0],
    end_date: item.end_date,
    is_indefinite: item.is_indefinite ?? true,
    is_active: item.is_active ?? true,
    manually_deactivated: !item.is_active,
    is_installment: !!item.installments_total,
    total_installments: item.installments_total,
    notes: '',
    created_at: item.created_at,
    updated_at: item.updated_at,
  }))
}

async function saveBudgetItemToSupabase(
  item: BudgetItem, 
  householdId: string,
  userId: string
): Promise<{ success: boolean; error?: string; id?: string }> {
  const supabase = supabaseBrowser()
  
  // Check if this is a new item (non-UUID id) or existing
  const isNewItem = item.id.startsWith('item-')
  
  const dbItem: Record<string, unknown> = {
    household_id: householdId,
    name: item.name,
    amount: item.amount,
    kind: item.kind,
    type: item.type,
    category_id: item.category_id?.startsWith('cat-') ? null : item.category_id, // Don't use demo category IDs
    frequency: item.frequency,
    is_active: item.is_active && !item.manually_deactivated,
    start_date: item.start_date,
    end_date: item.is_indefinite ? null : item.end_date,
    is_indefinite: item.is_indefinite,
    installments_total: item.total_installments || null,
    installments_paid: 0,
    created_by: userId,
  }
  
  if (isNewItem) {
    // Insert new item, let Supabase generate UUID
    const { data, error } = await supabase
      .from('budget_items')
      .insert(dbItem)
      .select('id')
      .single()
    
    if (error) {
      console.error('Error inserting budget item:', error)
      return { success: false, error: error.message }
    }
    
    return { success: true, id: data?.id }
  } else {
    // Update existing item
    dbItem.id = item.id
    const { error } = await supabase
      .from('budget_items')
      .update(dbItem)
      .eq('id', item.id)
    
    if (error) {
      console.error('Error updating budget item:', error)
      return { success: false, error: error.message }
    }
    
    return { success: true, id: item.id }
  }
}

async function deleteBudgetItemFromSupabase(itemId: string): Promise<boolean> {
  const supabase = supabaseBrowser()
  const { error } = await supabase
    .from('budget_items')
    .delete()
    .eq('id', itemId)
  
  if (error) {
    console.error('Error deleting budget item:', error)
    return false
  }
  return true
}

function getDemoExpenses(): Expense[] {
  if (typeof window === 'undefined') return []
  const saved = localStorage.getItem(DEMO_EXPENSES_KEY)
  return saved ? JSON.parse(saved) : []
}

// Check if item is currently active based on dates
function isItemActiveByDate(item: BudgetItem, referenceDate: Date = new Date()): boolean {
  if (item.manually_deactivated) return false
  
  const startDate = new Date(item.start_date)
  
  // For one-time items, only active in the specific month
  if (item.frequency === 'one_time') {
    const itemMonth = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`
    const refMonth = `${referenceDate.getFullYear()}-${String(referenceDate.getMonth() + 1).padStart(2, '0')}`
    return itemMonth === refMonth
  }
  
  if (referenceDate < startDate) return false
  
  if (!item.is_indefinite && item.end_date) {
    const endDate = new Date(item.end_date)
    // End date is inclusive - item is active through the entire end month
    endDate.setMonth(endDate.getMonth() + 1)
    endDate.setDate(0) // Last day of end month
    if (referenceDate > endDate) return false
  }
  
  return true
}

// Calculate monthly equivalent
function getMonthlyAmount(item: BudgetItem): number {
  // One-time items return full amount (they only apply to one specific month)
  if (item.frequency === 'one_time') {
    return item.amount
  }
  
  const multipliers: Record<Frequency, number> = {
    monthly: 1,
    weekly: 4.33,
    biweekly: 2,
    yearly: 1/12,
    one_time: 1, // Not used but needed for type
  }
  return item.amount * multipliers[item.frequency]
}

const FREQUENCY_LABELS: Record<Frequency, string> = {
  monthly: 'Mensual',
  weekly: 'Semanal',
  biweekly: 'Quincenal',
  yearly: 'Anual',
  one_time: 'Puntual',
}

// Calculate current installment number
function getCurrentInstallment(item: BudgetItem, referenceDate: Date = new Date()): number {
  if (!item.is_installment || !item.total_installments) return 0
  
  const startDate = new Date(item.start_date)
  const startMonth = startDate.getFullYear() * 12 + startDate.getMonth()
  const currentMonth = referenceDate.getFullYear() * 12 + referenceDate.getMonth()
  
  const installmentNumber = currentMonth - startMonth + 1
  return Math.min(Math.max(installmentNumber, 1), item.total_installments)
}

const TYPE_CONFIG = {
  fixed: {
    label: 'Fijo',
    description: 'Gasto automático (Netflix, Arriendo)',
    icon: Lock,
    color: 'text-blue-600 bg-blue-100',
  },
  variable: {
    label: 'Variable',
    description: 'Con seguimiento (Supermercado)',
    icon: ShoppingCart,
    color: 'text-amber-600 bg-amber-100',
  },
}

export default function BudgetPage() {
  const { currentHousehold, isDemoMode: isHouseholdDemo } = useHousehold()
  const { profile } = useAuth()
  const { addToast } = useToast()
  
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [categories, setCategories] = useState<Category[]>([])
  const [budgetItems, setBudgetItems] = useState<BudgetItem[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  
  // Check if we're in demo mode - only if hook says demo AND household is demo
  const isDemo = isHouseholdDemo && currentHousehold?.id?.startsWith('demo-')
  
  // View state
  const [currentMonth] = useState(getCurrentMonth())
  const [showInactive, setShowInactive] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'income' | 'fixed' | 'variable' | 'unbudgeted' | 'balance'>('overview')
  const [expandedBalanceRows, setExpandedBalanceRows] = useState<Set<string>>(new Set())
  
  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<BudgetItem | null>(null)
  const [formData, setFormData] = useState<Partial<BudgetItem>>({})
  
  // Quick expense dialog state
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false)
  const [selectedBudgetItem, setSelectedBudgetItem] = useState<BudgetItem | null>(null)
  const [expenseForm, setExpenseForm] = useState({
    amount: 0,
    description: '',
    date: new Date().toISOString().split('T')[0],
  })
  
  // New category state (for variable expenses)
  const [isNewCategory, setIsNewCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  
  // All expenses (for charts - last 12 months)
  const [allExpenses, setAllExpenses] = useState<Expense[]>([])
  
  // Chart filter states
  const [chartMonthsFilter, setChartMonthsFilter] = useState(12) // Last N months
  const [pieChartMonth, setPieChartMonth] = useState(getCurrentMonth())
  const [complianceMonth, setComplianceMonth] = useState(getCurrentMonth())

  useEffect(() => {
      loadData()
  }, [currentHousehold])

  const loadData = async () => {
    setLoading(true)

    if (isDemo) {
      // Load demo categories + custom categories
      const customCats = getCustomCategories()
      setCategories([...DEMO_CATEGORIES, ...customCats])
      const data = getBudgetData()
      
      // Auto-update active status based on dates
      const today = new Date()
      const updatedItems = data.items.map(item => ({
        ...item,
        is_active: isItemActiveByDate(item, today)
      }))
      
      setBudgetItems(updatedItems)
      
      // Load all expenses (for charts)
      const demoExpenses = getDemoExpenses()
      setAllExpenses(demoExpenses)
      
      // Load expenses for current month (for budget tracking)
      setExpenses(demoExpenses.filter(e => e.expense_date.startsWith(currentMonth)))
      
      // Save if status changed
      if (JSON.stringify(updatedItems) !== JSON.stringify(data.items)) {
        saveBudgetData({ items: updatedItems })
      }
    } else if (currentHousehold) {
      // Load from Supabase
      try {
        // Load categories from Supabase or use defaults
        const supabase = supabaseBrowser()
        const { data: dbCategories } = await supabase
          .from('categories')
          .select('*')
          .or(`household_id.eq.${currentHousehold.id},is_system.eq.true`)
          .order('sort_order')
        
        if (dbCategories && dbCategories.length > 0) {
          setCategories(dbCategories)
        } else {
          setCategories(DEMO_CATEGORIES)
        }
        
        // Load budget items
        const items = await loadBudgetItemsFromSupabase(currentHousehold.id)
        const today = new Date()
        const updatedItems = items.map(item => ({
          ...item,
          is_active: isItemActiveByDate(item, today)
        }))
        setBudgetItems(updatedItems)
        
        // Load expenses
        const { data: dbExpenses } = await supabase
          .from('expenses')
          .select('*')
          .eq('household_id', currentHousehold.id)
          .gte('expense_date', `${currentMonth}-01`)
          .order('expense_date', { ascending: false })
        
        if (dbExpenses) {
          setExpenses(dbExpenses)
          setAllExpenses(dbExpenses)
        }
      } catch (error) {
        console.error('Error loading budget data:', error)
        addToast({ type: 'error', message: 'Error al cargar presupuesto' })
        setCategories(DEMO_CATEGORIES)
        setBudgetItems([])
      }
    } else {
      setCategories(DEMO_CATEGORIES)
      setBudgetItems([])
    }
    
    setLoading(false)
  }

  const handleSave = async () => {
    setSaving(true)
    
    if (isDemo) {
      saveBudgetData({ items: budgetItems })
      addToast({ type: 'success', message: 'Presupuesto guardado' })
    } else if (currentHousehold && profile) {
      // Save all items to Supabase
      let hasError = false
      for (const item of budgetItems) {
        const result = await saveBudgetItemToSupabase(item, currentHousehold.id, profile.id)
        if (!result.success) {
          hasError = true
        }
      }
      if (hasError) {
        addToast({ type: 'error', message: 'Error al guardar algunos items' })
      } else {
        addToast({ type: 'success', message: 'Presupuesto guardado' })
      }
    }
    
    setSaving(false)
  }

  // Filter items
  const filteredItems = useMemo(() => {
    if (showInactive) return budgetItems
    return budgetItems.filter(item => item.is_active)
  }, [budgetItems, showInactive])

  const activeIncomes = filteredItems.filter(i => i.kind === 'income')
  const activeFixedExpenses = filteredItems.filter(i => i.kind === 'expense' && i.type === 'fixed')
  const activeVariableExpenses = filteredItems.filter(i => i.kind === 'expense' && i.type === 'variable')

  // Calculate totals (only from active items)
  const totalIncome = activeIncomes.filter(i => i.is_active).reduce((sum, i) => sum + getMonthlyAmount(i), 0)
  const totalFixed = activeFixedExpenses.filter(i => i.is_active).reduce((sum, i) => sum + getMonthlyAmount(i), 0)
  const totalVariableBudget = activeVariableExpenses.filter(i => i.is_active).reduce((sum, i) => sum + getMonthlyAmount(i), 0)
  
  // Actual spent on variable categories
  const getSpentForCategory = (categoryId?: string): number => {
    if (!categoryId) return 0
    return expenses.filter(e => e.category_id === categoryId).reduce((sum, e) => sum + e.amount, 0)
  }
  const totalVariableSpent = activeVariableExpenses.filter(i => i.is_active).reduce((sum, item) => sum + getSpentForCategory(item.category_id), 0)

  // Unbudgeted expenses: expenses that don't match any variable budget category
  const budgetedCategoryIds = activeVariableExpenses.map(v => v.category_id).filter(Boolean)
  const unbudgetedExpenses = expenses.filter(e => 
    !e.category_id || !budgetedCategoryIds.includes(e.category_id)
  )
  const totalUnbudgeted = unbudgetedExpenses.reduce((sum, e) => sum + e.amount, 0)
  
  const totalBudgeted = totalFixed + totalVariableBudget
  const available = totalIncome - totalBudgeted // Disponible según presupuesto
  
  // Real available (based on actual spending INCLUDING unbudgeted)
  const totalRealSpent = totalFixed + totalVariableSpent + totalUnbudgeted // Fijos + Variables reales + No presupuestados
  const availableReal = totalIncome - totalRealSpent
  const isWithinBudget = totalVariableSpent <= totalVariableBudget && totalUnbudgeted === 0

  // Get categories already used in variable expenses (to prevent duplicates)
  const usedVariableCategoryIds = useMemo(() => {
    return budgetItems
      .filter(i => i.kind === 'expense' && i.type === 'variable')
      .map(i => i.category_id)
      .filter(Boolean)
  }, [budgetItems])

  // Available categories for new variable expenses
  const availableCategoriesForVariable = useMemo(() => {
    return categories.filter(c => !usedVariableCategoryIds.includes(c.id))
  }, [categories, usedVariableCategoryIds])

  // ========== CHART DATA ==========
  
  // Helper: Get last N months
  const getLastMonths = (n: number): string[] => {
    const months: string[] = []
    const today = new Date()
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    return months
  }

  // Chart 1: Income vs Expenses (Bar Chart) - Last N months
  const incomeVsExpensesData = useMemo(() => {
    const months = getLastMonths(chartMonthsFilter)
    return months.map(month => {
      const monthExpenses = allExpenses.filter(e => e.expense_date.startsWith(month))
      const totalSpent = monthExpenses.reduce((sum, e) => sum + e.amount, 0)
      
      // Calculate income for this month from budget items
      const monthDate = new Date(month + '-15')
      const activeIncomesForMonth = budgetItems.filter(
        i => i.kind === 'income' && isItemActiveByDate(i, monthDate)
      )
      const monthIncome = activeIncomesForMonth.reduce((sum, i) => sum + getMonthlyAmount(i), 0)
      
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
  }, [allExpenses, budgetItems, chartMonthsFilter])

  // Chart 2: Expenses by Category (Pie Chart) - Selected month
  const expensesByCategoryData = useMemo(() => {
    const monthExpenses = allExpenses.filter(e => e.expense_date.startsWith(pieChartMonth))
    
    // Group by category
    const byCategory: Record<string, number> = {}
    monthExpenses.forEach(exp => {
      const catId = exp.category_id || 'sin-categoria'
      byCategory[catId] = (byCategory[catId] || 0) + exp.amount
    })
    
    // Convert to array with category names
    return Object.entries(byCategory)
      .map(([catId, amount]) => {
        const cat = categories.find(c => c.id === catId)
        return {
          name: cat?.name || 'Sin categoría',
          value: amount,
          color: cat ? getCategoryColor(cat.name) : '#6b7280',
        }
      })
      .sort((a, b) => b.value - a.value)
  }, [allExpenses, pieChartMonth, categories])

  // Chart 3: Budget Compliance (Variable expenses) - Selected month
  const budgetComplianceData = useMemo(() => {
    const monthExpenses = allExpenses.filter(e => e.expense_date.startsWith(complianceMonth))
    const monthDate = new Date(complianceMonth + '-15')
    
    // Get active variable expenses for this month
    const activeVariables = budgetItems.filter(
      i => i.kind === 'expense' && i.type === 'variable' && isItemActiveByDate(i, monthDate)
    )
    
    return activeVariables.map(item => {
      // Find category - use category_id to get the actual category name
      const cat = categories.find(c => c.id === item.category_id)
      const categoryName = cat?.name || 'Sin categoría'
      
      const budgeted = getMonthlyAmount(item)
      const spent = monthExpenses
        .filter(e => e.category_id === item.category_id)
        .reduce((sum, e) => sum + e.amount, 0)
      const percentage = budgeted > 0 ? (spent / budgeted) * 100 : 0
      
      return {
        name: categoryName, // Always use the category name, not the item name
        categoryId: item.category_id,
        Presupuesto: budgeted,
        Real: spent,
        percentage,
        status: percentage > 100 ? 'over' : percentage > 80 ? 'warning' : 'ok',
      }
    })
  }, [allExpenses, budgetItems, complianceMonth, categories])

  // Available months for filters
  const availableMonths = useMemo(() => {
    const months = new Set<string>()
    allExpenses.forEach(e => {
      const month = e.expense_date.substring(0, 7)
      months.add(month)
    })
    // Add current month if not present
    months.add(getCurrentMonth())
    // Add last 12 months
    getLastMonths(12).forEach(m => months.add(m))
    return Array.from(months).sort().reverse()
  }, [allExpenses])

  // Pie chart colors
  const PIE_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6b7280']

  // Dialog handlers
  const openNewItem = (kind: ItemKind, type?: BudgetType) => {
    setEditingItem(null)
    setIsNewCategory(false)
    setNewCategoryName('')
    
    // For variable expenses, use first available category
    const defaultCategoryId = type === 'variable' 
      ? availableCategoriesForVariable[0]?.id 
      : categories[0]?.id
    
    setFormData({
      kind,
      type: type || 'fixed',
      name: type === 'variable' ? (availableCategoriesForVariable[0]?.name || '') : '',
      amount: 0,
      category_id: defaultCategoryId,
      frequency: 'monthly',
      start_date: new Date().toISOString().split('T')[0],
      is_indefinite: true,
      end_date: '',
      notes: '',
      is_installment: false,
      total_installments: undefined,
    })
    setDialogOpen(true)
  }

  const openEditItem = (item: BudgetItem) => {
    if (!item.is_active) {
      addToast({ type: 'warning', message: 'Los items inactivos no se pueden editar' })
      return
    }
    setEditingItem(item)
    setFormData({ ...item })
    setDialogOpen(true)
  }

  const saveItem = async () => {
    const isVariableExpense = formData.kind === 'expense' && formData.type === 'variable'
    
    // Validation
    if (isVariableExpense) {
      if (isNewCategory && !newCategoryName.trim()) {
        addToast({ type: 'error', message: 'Ingresa el nombre de la nueva categoría' })
        return
      }
      if (!isNewCategory && !formData.category_id) {
        addToast({ type: 'error', message: 'Selecciona una categoría' })
        return
      }
    } else {
      if (!formData.name) {
        addToast({ type: 'error', message: 'Completa el nombre' })
        return
      }
    }
    
    if (!formData.amount || formData.amount <= 0) {
      addToast({ type: 'error', message: 'Ingresa un monto válido' })
      return
    }

    const now = new Date().toISOString()
    let categoryId = formData.category_id
    let itemName = formData.name!

    // Handle new category creation for variable expenses
    if (isVariableExpense && isNewCategory && newCategoryName.trim()) {
      const newCat: Category = {
        id: `cat-custom-${Date.now()}`,
        name: newCategoryName.trim(),
        icon: '📋',
        color: '#6b7280',
        is_system: false,
        is_active: true,
        sort_order: categories.length + 1,
        created_at: now,
        updated_at: now,
      }
      setCategories([...categories, newCat])
      saveCustomCategory(newCat) // Save to localStorage for use in expenses page
      categoryId = newCat.id
      itemName = newCat.name
    } else if (isVariableExpense && formData.category_id) {
      // For variable expenses, name is the category name
      const selectedCat = categories.find(c => c.id === formData.category_id)
      itemName = selectedCat?.name || formData.name!
    }

    // Calculate end date for installments
    let endDate = formData.is_indefinite ? undefined : formData.end_date
    let isIndefinite = formData.is_indefinite ?? true
    
    if (formData.is_installment && formData.total_installments && formData.total_installments > 0) {
      // Auto-calculate end date based on installments
      const startDate = new Date(formData.start_date || now.split('T')[0])
      const endDateCalc = new Date(startDate)
      endDateCalc.setMonth(endDateCalc.getMonth() + formData.total_installments - 1)
      endDate = endDateCalc.toISOString().split('T')[0]
      isIndefinite = false
    }

    const newItem: BudgetItem = {
      id: editingItem?.id || `item-${Date.now()}`,
      kind: formData.kind!,
      type: formData.kind === 'income' ? 'fixed' : (formData.type || 'fixed'),
      name: itemName,
      amount: formData.amount!,
            category_id: categoryId,
      frequency: formData.frequency || 'monthly',
      start_date: formData.start_date || now.split('T')[0],
      end_date: endDate,
      is_indefinite: isIndefinite,
      is_active: true,
      manually_deactivated: false,
      is_installment: formData.is_installment,
      total_installments: formData.is_installment ? formData.total_installments : undefined,
      notes: formData.notes,
      created_at: editingItem?.created_at || now,
      updated_at: now,
    }

    // Check if active based on dates
    newItem.is_active = isItemActiveByDate(newItem)

    // For variable expenses, check if category already has a budget (prevent duplicates)
    if (isVariableExpense && !editingItem) {
      const existingVariableForCategory = budgetItems.find(
        i => i.kind === 'expense' && i.type === 'variable' && i.category_id === categoryId
      )
      if (existingVariableForCategory) {
        addToast({ type: 'error', message: 'Ya existe un presupuesto variable para esta categoría' })
        return
      }
    }

    let updatedItems: BudgetItem[]
    if (editingItem) {
      updatedItems = budgetItems.map(item => item.id === editingItem.id ? newItem : item)
      addToast({ type: 'success', message: 'Item actualizado' })
    } else {
      updatedItems = [...budgetItems, newItem]
      addToast({ type: 'success', message: 'Item agregado' })
    }

    // Save to storage
    if (isDemo) {
      setBudgetItems(updatedItems)
      saveBudgetData({ items: updatedItems })
    } else if (currentHousehold && profile) {
      const result = await saveBudgetItemToSupabase(newItem, currentHousehold.id, profile.id)
      if (result.success && result.id) {
        // Update item with real UUID from Supabase
        const itemWithRealId = { ...newItem, id: result.id }
        if (editingItem) {
          setBudgetItems(budgetItems.map(item => item.id === editingItem.id ? itemWithRealId : item))
        } else {
          setBudgetItems([...budgetItems, itemWithRealId])
        }
      } else {
        addToast({ type: 'error', message: 'Error al guardar: ' + (result.error || 'desconocido') })
        return
      }
    } else {
      setBudgetItems(updatedItems)
    }
    
    setDialogOpen(false)
    setIsNewCategory(false)
    setNewCategoryName('')
  }

  const toggleItemActive = async (item: BudgetItem) => {
    const updatedItem = {
      ...item,
      manually_deactivated: !item.manually_deactivated,
      is_active: item.manually_deactivated ? isItemActiveByDate(item) : false,
      updated_at: new Date().toISOString(),
    }
    
    const updatedItems = budgetItems.map(i => i.id === item.id ? updatedItem : i)
    setBudgetItems(updatedItems)
    
    if (isDemo) {
      saveBudgetData({ items: updatedItems })
    } else if (currentHousehold && profile) {
      await saveBudgetItemToSupabase(updatedItem, currentHousehold.id, profile.id)
    }
    
    addToast({ type: 'success', message: item.is_active ? 'Item desactivado' : 'Item reactivado' })
  }

  const deleteItem = async (id: string) => {
    const updatedItems = budgetItems.filter(item => item.id !== id)
    setBudgetItems(updatedItems)
    
    if (isDemo) {
      saveBudgetData({ items: updatedItems })
    } else {
      await deleteBudgetItemFromSupabase(id)
    }
    
    addToast({ type: 'success', message: 'Item eliminado' })
  }

  // Quick expense registration
  const openExpenseDialog = (item: BudgetItem) => {
    setSelectedBudgetItem(item)
    setExpenseForm({
      amount: 0,
      description: '',
      date: new Date().toISOString().split('T')[0],
    })
    setExpenseDialogOpen(true)
  }

  const saveQuickExpense = () => {
    if (!selectedBudgetItem || !expenseForm.amount || expenseForm.amount <= 0) {
      addToast({ type: 'error', message: 'Ingresa un monto válido' })
      return
    }

    const category = categories.find(c => c.id === selectedBudgetItem.category_id)
    const newExpense: Expense = {
      id: `exp-${Date.now()}`,
      household_id: currentHousehold?.id || 'demo',
      category_id: selectedBudgetItem.category_id || '',
      amount: expenseForm.amount,
      description: expenseForm.description || `${selectedBudgetItem.name}`,
      expense_date: expenseForm.date,
      created_by: 'demo-user',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    // Save to localStorage
    const allExpenses = getDemoExpenses()
    allExpenses.push(newExpense)
    localStorage.setItem(DEMO_EXPENSES_KEY, JSON.stringify(allExpenses))

    // Update local state
    if (newExpense.expense_date.startsWith(currentMonth)) {
      setExpenses([...expenses, newExpense])
    }

    addToast({ 
      type: 'success', 
      message: `Gasto de ${formatCurrency(expenseForm.amount, currentHousehold?.currency)} registrado en ${category?.name || selectedBudgetItem.name}` 
    })
    setExpenseDialogOpen(false)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1,2,3,4].map(i => (
            <Card key={i}><CardContent className="p-6"><div className="h-16 bg-muted animate-pulse rounded" /></CardContent></Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Presupuesto</h1>
          <p className="text-muted-foreground">
            Gestiona tus ingresos y gastos recurrentes
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm">
            <Switch
              id="show-inactive"
              checked={showInactive}
              onCheckedChange={setShowInactive}
            />
            <Label htmlFor="show-inactive" className="flex items-center gap-1 cursor-pointer">
              <History className="h-4 w-4" />
              Mostrar inactivos
            </Label>
          </div>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            Guardar
          </Button>
        </div>
      </div>

      {/* Summary Cards - Formula Style (Clickable) */}
      <div className="flex flex-wrap items-center justify-center gap-2 lg:gap-3 p-4 bg-muted/30 rounded-xl">
        {/* Ingresos */}
        <Card 
          className="border-green-200 bg-green-50/50 flex-1 min-w-[140px] max-w-[200px] cursor-pointer hover:border-green-400 hover:shadow-md transition-all"
          onClick={() => setActiveTab('income')}
        >
          <CardContent className="p-3 text-center">
            <p className="text-xs text-green-600 font-medium mb-1">Ingresos</p>
            <p className="text-lg lg:text-xl font-bold text-green-600">
              {formatCurrency(totalIncome, currentHousehold?.currency)}
            </p>
          </CardContent>
        </Card>

        {/* Minus sign */}
        <span className="text-2xl font-bold text-muted-foreground">−</span>

        {/* Gastos Fijos */}
        <Card 
          className="border-blue-200 bg-blue-50/50 flex-1 min-w-[140px] max-w-[200px] cursor-pointer hover:border-blue-400 hover:shadow-md transition-all"
          onClick={() => setActiveTab('fixed')}
        >
          <CardContent className="p-3 text-center">
            <p className="text-xs text-blue-600 font-medium mb-1">Fijos</p>
            <p className="text-lg lg:text-xl font-bold text-blue-700">
              {formatCurrency(totalFixed, currentHousehold?.currency)}
            </p>
          </CardContent>
        </Card>

        {/* Minus sign */}
        <span className="text-2xl font-bold text-muted-foreground">−</span>

        {/* Gastos Variables */}
        <Card 
          className={`flex-1 min-w-[140px] max-w-[200px] cursor-pointer hover:shadow-md transition-all ${
            totalVariableSpent > totalVariableBudget ? 'border-amber-400 bg-amber-50 hover:border-amber-500' : 'border-amber-200 bg-amber-50/50 hover:border-amber-400'
          }`}
          onClick={() => setActiveTab('variable')}
        >
          <CardContent className="p-3 text-center">
            <p className="text-xs text-amber-600 font-medium mb-1">Variables</p>
            <p className="text-lg lg:text-xl font-bold text-amber-700">
              {formatCurrency(totalVariableSpent, currentHousehold?.currency)}
            </p>
            <p className="text-[10px] text-muted-foreground">
              de {formatCurrency(totalVariableBudget, currentHousehold?.currency)}
            </p>
          </CardContent>
        </Card>

        {/* Minus sign - only if there are unbudgeted */}
        {totalUnbudgeted > 0 && (
          <>
            <span className="text-2xl font-bold text-muted-foreground">−</span>
            
            {/* No Presupuestados */}
            <Card 
              className="border-red-300 bg-red-50 flex-1 min-w-[140px] max-w-[200px] cursor-pointer hover:border-red-500 hover:shadow-md transition-all"
              onClick={() => setActiveTab('unbudgeted')}
            >
              <CardContent className="p-3 text-center">
                <p className="text-xs text-red-600 font-medium mb-1">No Presup.</p>
                <p className="text-lg lg:text-xl font-bold text-red-600">
                  {formatCurrency(totalUnbudgeted, currentHousehold?.currency)}
                </p>
                <p className="text-[10px] text-red-500">{unbudgetedExpenses.length} gasto(s)</p>
              </CardContent>
            </Card>
          </>
        )}

        {/* Equals sign */}
        <span className="text-2xl font-bold text-muted-foreground">=</span>

        {/* Disponible Real */}
        <Card 
          className={`flex-1 min-w-[160px] max-w-[220px] border-2 cursor-pointer hover:shadow-md transition-all ${
            availableReal < 0 
              ? 'border-red-500 bg-red-100 hover:border-red-600' 
              : isWithinBudget 
              ? 'border-green-500 bg-green-100 hover:border-green-600' 
              : 'border-amber-500 bg-amber-100 hover:border-amber-600'
          }`}
          onClick={() => setActiveTab('balance')}
        >
          <CardContent className="p-3 text-center">
            <p className={`text-xs font-medium mb-1 ${
              availableReal < 0 ? 'text-red-600' : isWithinBudget ? 'text-green-600' : 'text-amber-600'
            }`}>
              {availableReal < 0 ? '⚠️' : '✓'} Balance
            </p>
            <p className={`text-xl lg:text-2xl font-bold ${
              availableReal < 0 ? 'text-red-700' : isWithinBudget ? 'text-green-700' : 'text-amber-700'
            }`}>
              {formatCurrency(availableReal, currentHousehold?.currency)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="overview">Resumen</TabsTrigger>
          <TabsTrigger value="income">
            <span className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Ingresos ({activeIncomes.length})
            </span>
          </TabsTrigger>
          <TabsTrigger value="fixed">
            <span className="flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Fijos ({activeFixedExpenses.length})
            </span>
          </TabsTrigger>
          <TabsTrigger value="variable">
            <span className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" />
              Variables ({activeVariableExpenses.length})
            </span>
          </TabsTrigger>
          <TabsTrigger value="unbudgeted" className={unbudgetedExpenses.length > 0 ? 'text-red-600' : ''}>
            <span className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              No Presup. ({unbudgetedExpenses.length})
            </span>
          </TabsTrigger>
          <TabsTrigger value="balance" className={availableReal >= 0 ? 'text-green-600' : 'text-red-600'}>
            <span className="flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Balance
            </span>
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Active Summary */}
        <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Resumen Activo</CardTitle>
                <CardDescription>Items activos en tu presupuesto</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-green-600" />
                    Ingresos ({activeIncomes.filter(i => i.is_active).length})
                  </span>
                  <span className="font-semibold text-green-600">+{formatCurrency(totalIncome, currentHousehold?.currency)}</span>
              </div>
                {(() => {
                  const activeFixed = activeFixedExpenses.filter(i => i.is_active)
                  const fixedNoInstallments = activeFixed.filter(i => !i.is_installment)
                  const fixedInstallments = activeFixed.filter(i => i.is_installment)
                  const totalFixedNoInstallments = fixedNoInstallments.reduce((sum, i) => sum + getMonthlyAmount(i), 0)
                  const totalInstallments = fixedInstallments.reduce((sum, i) => sum + getMonthlyAmount(i), 0)
                  
                  return (
                    <>
                      <div className="flex justify-between items-center py-2 border-b">
                        <span className="flex items-center gap-2">
                          <Lock className="h-4 w-4 text-blue-600" />
                          Compromisos Fijos ({fixedNoInstallments.length})
                        </span>
                        <span className="font-semibold">-{formatCurrency(totalFixedNoInstallments, currentHousehold?.currency)}</span>
              </div>
                      {fixedInstallments.length > 0 && (
                        <div className="flex justify-between items-center py-2 border-b">
                          <span className="flex items-center gap-2">
                            💳 <span className="text-purple-600">Cuotas ({fixedInstallments.length})</span>
                          </span>
                          <span className="font-semibold text-purple-600">-{formatCurrency(totalInstallments, currentHousehold?.currency)}</span>
                        </div>
                      )}
                    </>
                  )
                })()}
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4 text-amber-600" />
                    Presupuesto Variable ({activeVariableExpenses.filter(i => i.is_active).length})
                  </span>
                  <span className="font-semibold">-{formatCurrency(totalVariableBudget, currentHousehold?.currency)}</span>
                </div>
                {totalUnbudgeted > 0 && (
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-600" />
                      <span className="text-red-600">No Presupuestados ({unbudgetedExpenses.length})</span>
                    </span>
                    <span className="font-semibold text-red-600">-{formatCurrency(totalUnbudgeted, currentHousehold?.currency)}</span>
                  </div>
                )}
                {totalVariableSpent > totalVariableBudget && (
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                      <span className="text-amber-600">Exceso Variables</span>
                    </span>
                    <span className="font-semibold text-amber-600">-{formatCurrency(totalVariableSpent - totalVariableBudget, currentHousehold?.currency)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center py-2 font-bold text-lg">
                  <span>Balance Real</span>
                  <span className={availableReal >= 0 ? 'text-green-600' : 'text-destructive'}>
                    {formatCurrency(availableReal, currentHousehold?.currency)}
                  </span>
            </div>
          </CardContent>
        </Card>

            {/* Quick Stats */}
        <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Seguimiento {formatMonth(currentMonth)}</CardTitle>
                <CardDescription>Gastos variables vs presupuesto</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {activeVariableExpenses.filter(i => i.is_active).length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">
                    No hay gastos variables activos
                  </p>
                ) : (
                  activeVariableExpenses
                    .filter(i => i.is_active)
                    .map(item => ({
                      item,
                      spent: getSpentForCategory(item.category_id),
                      budget: getMonthlyAmount(item),
                    }))
                    .sort((a, b) => b.spent - a.spent) // Ordenar de mayor a menor gasto
                    .map(({ item, spent, budget }) => {
                    const percentage = budget > 0 ? (spent / budget) * 100 : 0
                    const category = categories.find(c => c.id === item.category_id)
                    
                    return (
                      <div key={item.id} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: category ? getCategoryColor(category.name) : '#6b7280' }} />
                            {item.name}
                          </span>
                          <span>
                            <span className={percentage > 100 ? 'text-destructive font-medium' : ''}>
                              {formatCurrency(spent, currentHousehold?.currency)}
                            </span>
                            <span className="text-muted-foreground"> / {formatCurrency(budget, currentHousehold?.currency)}</span>
                          </span>
              </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all ${
                              percentage > 100 ? 'bg-destructive' : percentage > 80 ? 'bg-amber-500' : 'bg-primary'
                            }`}
                            style={{ width: `${Math.min(percentage, 100)}%` }}
                          />
                        </div>
                      </div>
                    )
                  })
                )}
              </CardContent>
            </Card>
          </div>

          {/* Unbudgeted Expenses - Compact list */}
          {unbudgetedExpenses.length > 0 && (
            <Card className="mt-4 border-red-200">
              <CardHeader className="pb-2 pt-3">
                <CardTitle className="text-base flex items-center gap-2 text-red-700">
                  <AlertTriangle className="h-4 w-4" />
                  Detalle Gastos No Presupuestados
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-1">
                  {unbudgetedExpenses
                    .sort((a, b) => b.amount - a.amount)
                    .slice(0, 5) // Show max 5
                    .map(expense => (
                      <div key={expense.id} className="flex items-center justify-between py-1.5 text-sm">
                        <span className="truncate flex-1 mr-2">
                          {expense.description || expense.merchant || 'Gasto'}
                        </span>
                        <span className="font-medium text-red-600">
                          {formatCurrency(expense.amount, currentHousehold?.currency)}
                        </span>
                      </div>
                    ))}
                  {unbudgetedExpenses.length > 5 && (
                    <p className="text-xs text-muted-foreground text-center py-1">
                      +{unbudgetedExpenses.length - 5} más...
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Fixed Expenses Summary */}
          <Card className="mt-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Lock className="h-5 w-5 text-blue-600" />
                Gastos Fijos Vigentes
              </CardTitle>
              <CardDescription>Recordatorio de compromisos mensuales</CardDescription>
            </CardHeader>
            <CardContent>
              {activeFixedExpenses.filter(i => i.is_active).length === 0 ? (
                <p className="text-center text-muted-foreground py-4">
                  No hay gastos fijos activos
                </p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {/* Group by category and sort by total (highest first) */}
                  {(() => {
                    const fixedByCategory: Record<string, { items: typeof activeFixedExpenses, total: number }> = {}
                    
                    activeFixedExpenses.filter(i => i.is_active).forEach(item => {
                      const catId = item.category_id || 'sin-categoria'
                      if (!fixedByCategory[catId]) {
                        fixedByCategory[catId] = { items: [], total: 0 }
                      }
                      fixedByCategory[catId].items.push(item)
                      fixedByCategory[catId].total += getMonthlyAmount(item)
                    })
                    
                    // Sort categories by total (highest first) and items within each category
                    return Object.entries(fixedByCategory)
                      .sort((a, b) => b[1].total - a[1].total) // Ordenar categorías de mayor a menor
                      .map(([catId, { items, total }]) => {
                      const category = categories.find(c => c.id === catId)
                      // Ordenar items dentro de la categoría de mayor a menor
                      const sortedItems = [...items].sort((a, b) => getMonthlyAmount(b) - getMonthlyAmount(a))
                      return (
                        <div key={catId} className="p-3 rounded-lg bg-muted/50 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-2 font-medium text-sm">
                              <div 
                                className="w-3 h-3 rounded-full" 
                                style={{ backgroundColor: category ? getCategoryColor(category.name) : '#6b7280' }}
                              />
                              {category?.name || 'Sin categoría'}
                            </span>
                            <span className="text-sm font-semibold text-blue-600">
                              {formatCurrency(total, currentHousehold?.currency)}
                            </span>
                          </div>
                          <div className="space-y-1">
                            {sortedItems.map(item => (
                              <div key={item.id} className="flex justify-between text-xs text-muted-foreground">
                                <span className="truncate pr-2">{item.name}</span>
                                <span className="flex-shrink-0">{formatCurrency(getMonthlyAmount(item), currentHousehold?.currency)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })
                  })()}
                </div>
              )}
              
              {/* Total */}
              {activeFixedExpenses.filter(i => i.is_active).length > 0 && (
                <div className="mt-4 pt-3 border-t flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Total gastos fijos mensuales</span>
                  <span className="font-bold text-blue-600">{formatCurrency(totalFixed, currentHousehold?.currency)}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Income Tab */}
        <TabsContent value="income" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
              <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-green-600" />
                    Ingresos
                  </CardTitle>
                  <CardDescription>Fuentes de ingreso recurrentes</CardDescription>
              </div>
                <Button onClick={() => openNewItem('income')}>
                  <Plus className="mr-2 h-4 w-4" /> Agregar Ingreso
                </Button>
            </div>
            </CardHeader>
            <CardContent>
              {activeIncomes.length === 0 ? (
                <EmptyState 
                  icon={TrendingUp}
                  title="No hay ingresos"
                  description="Agrega tus fuentes de ingreso recurrentes"
                />
              ) : (
                <ItemList 
                  items={activeIncomes}
                  categories={categories}
                  currency={currentHousehold?.currency}
                  onEdit={openEditItem}
                  onToggle={toggleItemActive}
                  onDelete={deleteItem}
                  showInactive={showInactive}
                />
              )}
          </CardContent>
        </Card>
        </TabsContent>

        {/* Fixed Expenses Tab */}
        <TabsContent value="fixed" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Lock className="h-5 w-5 text-blue-600" />
                    Gastos Fijos
                  </CardTitle>
                  <CardDescription>Se descuentan automáticamente cada período</CardDescription>
                </div>
                <Button onClick={() => openNewItem('expense', 'fixed')}>
                  <Plus className="mr-2 h-4 w-4" /> Agregar Gasto Fijo
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {activeFixedExpenses.length === 0 ? (
                <EmptyState 
                  icon={Lock}
                  title="No hay gastos fijos"
                  description="Ej: Netflix, Arriendo, Seguros, Gym"
                />
              ) : (
                <ItemList 
                  items={activeFixedExpenses}
                  categories={categories}
                  currency={currentHousehold?.currency}
                  onEdit={openEditItem}
                  onToggle={toggleItemActive}
                  onDelete={deleteItem}
                  showInactive={showInactive}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Variable Expenses Tab */}
        <TabsContent value="variable" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <ShoppingCart className="h-5 w-5 text-amber-600" />
                    Gastos Variables
                  </CardTitle>
                  <CardDescription>Presupuesto con seguimiento mensual</CardDescription>
              </div>
                <Button onClick={() => openNewItem('expense', 'variable')}>
                  <Plus className="mr-2 h-4 w-4" /> Agregar Gasto Variable
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {activeVariableExpenses.length === 0 ? (
                <EmptyState 
                  icon={ShoppingCart}
                  title="No hay gastos variables"
                  description="Ej: Supermercado, Restaurantes, Entretenimiento"
                />
              ) : (
                <ItemList 
                  items={activeVariableExpenses}
                  categories={categories}
                  currency={currentHousehold?.currency}
                  onEdit={openEditItem}
                  onToggle={toggleItemActive}
                  onDelete={deleteItem}
                  showInactive={showInactive}
                  showSpent
                  getSpent={getSpentForCategory}
                  onRegisterExpense={openExpenseDialog}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Unbudgeted Expenses Tab */}
        <TabsContent value="unbudgeted" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
              <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-red-600" />
                    Gastos No Presupuestados
                  </CardTitle>
                  <CardDescription>
                    Gastos de {formatMonth(currentMonth)} que no están asociados a ningún presupuesto variable
                  </CardDescription>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-red-600">
                    {formatCurrency(totalUnbudgeted, currentHousehold?.currency)}
                  </p>
                  <p className="text-sm text-muted-foreground">{unbudgetedExpenses.length} gasto(s)</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {unbudgetedExpenses.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle className="h-16 w-16 mx-auto text-green-500 mb-4" />
                  <p className="text-lg font-medium text-green-700">¡Excelente!</p>
                  <p className="text-muted-foreground">No tienes gastos no presupuestados este mes</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {unbudgetedExpenses
                    .sort((a, b) => b.amount - a.amount)
                    .map(expense => (
                      <div 
                        key={expense.id} 
                        className="flex items-center justify-between p-4 rounded-lg border border-red-100 bg-red-50/30 hover:bg-red-50/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-red-100">
                            <AlertTriangle className="h-4 w-4 text-red-600" />
                          </div>
                          <div>
                            <p className="font-medium">
                              {expense.description || expense.merchant || 'Gasto sin nombre'}
                            </p>
                <p className="text-sm text-muted-foreground">
                              {formatDate(expense.expense_date)}
                              {expense.merchant && expense.description && ` · ${expense.merchant}`}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-red-600">
                            {formatCurrency(expense.amount, currentHousehold?.currency)}
                </p>
              </div>
            </div>
                    ))}
                  
                  {/* Total */}
                  <div className="flex items-center justify-between p-4 rounded-lg bg-red-100 mt-4">
                    <span className="font-semibold text-red-700">Total No Presupuestado</span>
                    <span className="text-xl font-bold text-red-700">
                      {formatCurrency(totalUnbudgeted, currentHousehold?.currency)}
                    </span>
                  </div>

                  {/* Tip */}
                  <div className="mt-4 p-4 rounded-lg bg-amber-50 border border-amber-200">
                    <p className="text-sm text-amber-800">
                      💡 <strong>Tip:</strong> Para evitar gastos no presupuestados, crea categorías de presupuesto variable 
                      en la pestaña "Variables" para tus gastos recurrentes.
                    </p>
                  </div>
                </div>
              )}
          </CardContent>
        </Card>
        </TabsContent>

        {/* Balance Tab - Income Statement Style with Expandable Rows */}
        <TabsContent value="balance" className="mt-4">
        <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-xl flex items-center gap-2">
                <Wallet className="h-6 w-6" />
                Estado de Resultados - {formatMonth(currentMonth)}
            </CardTitle>
              <CardDescription>Click en cada fila para ver el detalle</CardDescription>
          </CardHeader>
            <CardContent>
              {/* Table */}
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left p-3 font-semibold">Concepto</th>
                      <th className="text-right p-3 font-semibold w-36">Presupuestado</th>
                      <th className="text-right p-3 font-semibold w-36">Real</th>
                      <th className="text-right p-3 font-semibold w-36">Diferencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Ingresos - Expandable */}
                    <tr 
                      className="border-t bg-green-50/50 cursor-pointer hover:bg-green-100/50 transition-colors"
                      onClick={() => {
                        const newSet = new Set(expandedBalanceRows)
                        newSet.has('income') ? newSet.delete('income') : newSet.add('income')
                        setExpandedBalanceRows(newSet)
                      }}
                    >
                      <td className="p-3">
                        <span className="flex items-center gap-2 font-medium text-green-700">
                          {expandedBalanceRows.has('income') ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          <div className="w-2 h-2 rounded-full bg-green-500" />
                          Ingresos ({activeIncomes.filter(i => i.is_active).length})
                        </span>
                      </td>
                      <td className="p-3 text-right font-medium text-green-600">
                        {formatCurrency(totalIncome, currentHousehold?.currency)}
                      </td>
                      <td className="p-3 text-right font-medium text-green-600">
                        {formatCurrency(totalIncome, currentHousehold?.currency)}
                      </td>
                      <td className="p-3 text-right font-medium text-gray-400">$0</td>
                    </tr>
                    {expandedBalanceRows.has('income') && activeIncomes.filter(i => i.is_active).map(item => (
                      <tr key={item.id} className="bg-green-50/30 border-t border-green-100">
                        <td className="p-2 pl-10 text-sm text-muted-foreground">{item.name}</td>
                        <td className="p-2 text-right text-sm">{formatCurrency(getMonthlyAmount(item), currentHousehold?.currency)}</td>
                        <td className="p-2 text-right text-sm">{formatCurrency(getMonthlyAmount(item), currentHousehold?.currency)}</td>
                        <td className="p-2 text-right text-sm text-gray-400">-</td>
                      </tr>
                    ))}
                    
                    {/* Gastos Fijos - Expandable */}
                    <tr 
                      className="border-t cursor-pointer hover:bg-blue-50/50 transition-colors"
                      onClick={() => {
                        const newSet = new Set(expandedBalanceRows)
                        newSet.has('fixed') ? newSet.delete('fixed') : newSet.add('fixed')
                        setExpandedBalanceRows(newSet)
                      }}
                    >
                      <td className="p-3">
                        <span className="flex items-center gap-2 text-blue-700">
                          {expandedBalanceRows.has('fixed') ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          <div className="w-2 h-2 rounded-full bg-blue-500" />
                          (−) Gastos Fijos ({activeFixedExpenses.filter(i => i.is_active).length})
                        </span>
                      </td>
                      <td className="p-3 text-right font-medium">{formatCurrency(totalFixed, currentHousehold?.currency)}</td>
                      <td className="p-3 text-right font-medium">{formatCurrency(totalFixed, currentHousehold?.currency)}</td>
                      <td className="p-3 text-right font-medium text-gray-400">$0</td>
                    </tr>
                    {expandedBalanceRows.has('fixed') && activeFixedExpenses.filter(i => i.is_active).map(item => {
                      const cat = categories.find(c => c.id === item.category_id)
                      return (
                        <tr key={item.id} className="bg-blue-50/30 border-t border-blue-100">
                          <td className="p-2 pl-10 text-sm text-muted-foreground">
                            {item.name}
                            {item.is_installment && item.total_installments && (
                              <span className="ml-2 text-xs text-purple-600">
                                (Cuota {getCurrentInstallment(item)}/{item.total_installments})
                              </span>
                            )}
                          </td>
                          <td className="p-2 text-right text-sm">{formatCurrency(getMonthlyAmount(item), currentHousehold?.currency)}</td>
                          <td className="p-2 text-right text-sm">{formatCurrency(getMonthlyAmount(item), currentHousehold?.currency)}</td>
                          <td className="p-2 text-right text-sm text-gray-400">-</td>
                        </tr>
                      )
                    })}
                    
                    {/* Gastos Variables - Expandable */}
                    <tr 
                      className={`border-t cursor-pointer hover:bg-amber-100/50 transition-colors ${totalVariableSpent > totalVariableBudget ? 'bg-amber-50/50' : ''}`}
                      onClick={() => {
                        const newSet = new Set(expandedBalanceRows)
                        newSet.has('variable') ? newSet.delete('variable') : newSet.add('variable')
                        setExpandedBalanceRows(newSet)
                      }}
                    >
                      <td className="p-3">
                        <span className="flex items-center gap-2 text-amber-700">
                          {expandedBalanceRows.has('variable') ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          <div className="w-2 h-2 rounded-full bg-amber-500" />
                          (−) Gastos Variables ({activeVariableExpenses.filter(i => i.is_active).length})
                        </span>
                      </td>
                      <td className="p-3 text-right font-medium">{formatCurrency(totalVariableBudget, currentHousehold?.currency)}</td>
                      <td className="p-3 text-right font-medium">{formatCurrency(totalVariableSpent, currentHousehold?.currency)}</td>
                      <td className={`p-3 text-right font-bold ${totalVariableSpent <= totalVariableBudget ? 'text-green-600' : 'text-red-600'}`}>
                        {totalVariableSpent <= totalVariableBudget ? '+' : ''}{formatCurrency(totalVariableBudget - totalVariableSpent, currentHousehold?.currency)}
                      </td>
                    </tr>
                    {expandedBalanceRows.has('variable') && activeVariableExpenses.filter(i => i.is_active).map(item => {
                      const cat = categories.find(c => c.id === item.category_id)
                      const budgeted = getMonthlyAmount(item)
                      const spent = getSpentForCategory(item.category_id)
                      const diff = budgeted - spent
                      return (
                        <tr key={item.id} className="bg-amber-50/30 border-t border-amber-100">
                          <td className="p-2 pl-10 text-sm text-muted-foreground">{cat?.name || item.name}</td>
                          <td className="p-2 text-right text-sm">{formatCurrency(budgeted, currentHousehold?.currency)}</td>
                          <td className="p-2 text-right text-sm">{formatCurrency(spent, currentHousehold?.currency)}</td>
                          <td className={`p-2 text-right text-sm font-medium ${diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {diff >= 0 ? '+' : ''}{formatCurrency(diff, currentHousehold?.currency)}
                          </td>
                        </tr>
                      )
                    })}
                    
                    {/* No Presupuestados - Expandable */}
                    <tr 
                      className={`border-t cursor-pointer hover:bg-red-100/50 transition-colors ${totalUnbudgeted > 0 ? 'bg-red-50/50' : ''}`}
                      onClick={() => {
                        const newSet = new Set(expandedBalanceRows)
                        newSet.has('unbudgeted') ? newSet.delete('unbudgeted') : newSet.add('unbudgeted')
                        setExpandedBalanceRows(newSet)
                      }}
                    >
                      <td className="p-3">
                        <span className="flex items-center gap-2 text-red-700">
                          {expandedBalanceRows.has('unbudgeted') ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          <div className="w-2 h-2 rounded-full bg-red-500" />
                          (−) No Presupuestados ({unbudgetedExpenses.length})
                        </span>
                      </td>
                      <td className="p-3 text-right font-medium text-gray-400">$0</td>
                      <td className="p-3 text-right font-medium">{formatCurrency(totalUnbudgeted, currentHousehold?.currency)}</td>
                      <td className={`p-3 text-right font-bold ${totalUnbudgeted === 0 ? 'text-gray-400' : 'text-red-600'}`}>
                        {totalUnbudgeted > 0 ? '−' : ''}{formatCurrency(totalUnbudgeted, currentHousehold?.currency)}
                      </td>
                    </tr>
                    {expandedBalanceRows.has('unbudgeted') && unbudgetedExpenses.map(expense => (
                      <tr key={expense.id} className="bg-red-50/30 border-t border-red-100">
                        <td className="p-2 pl-10 text-sm text-muted-foreground">
                          {expense.description || expense.merchant || 'Gasto'}
                          <span className="text-xs text-gray-400 ml-2">({formatDate(expense.expense_date)})</span>
                        </td>
                        <td className="p-2 text-right text-sm text-gray-400">-</td>
                        <td className="p-2 text-right text-sm">{formatCurrency(expense.amount, currentHousehold?.currency)}</td>
                        <td className="p-2 text-right text-sm text-red-600">−{formatCurrency(expense.amount, currentHousehold?.currency)}</td>
                      </tr>
                    ))}
                    
                    {/* Separador */}
                    <tr className="border-t-2 border-dashed">
                      <td colSpan={4} className="p-1"></td>
                    </tr>
                    
                    {/* RESULTADO: Balance */}
                    <tr className={`border-t-2 ${
                      availableReal < 0 ? 'bg-red-100' : isWithinBudget ? 'bg-green-100' : 'bg-amber-100'
                    }`}>
                      <td className="p-4">
                        <span className={`flex items-center gap-2 font-bold text-lg ${
                          availableReal < 0 ? 'text-red-700' : isWithinBudget ? 'text-green-700' : 'text-amber-700'
                        }`}>
                          = BALANCE
                        </span>
                      </td>
                      <td className="p-4 text-right font-bold text-lg">{formatCurrency(available, currentHousehold?.currency)}</td>
                      <td className={`p-4 text-right font-bold text-lg ${
                        availableReal < 0 ? 'text-red-700' : isWithinBudget ? 'text-green-700' : 'text-amber-700'
                      }`}>
                        {formatCurrency(availableReal, currentHousehold?.currency)}
                      </td>
                      <td className={`p-4 text-right font-bold text-lg ${availableReal >= available ? 'text-green-600' : 'text-red-600'}`}>
                        {availableReal >= available ? '+' : ''}{formatCurrency(availableReal - available, currentHousehold?.currency)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              
              {/* Summary Badge */}
              <div className={`mt-6 p-4 rounded-lg text-center ${
                availableReal < 0 ? 'bg-red-100 border border-red-200' : isWithinBudget ? 'bg-green-100 border border-green-200' : 'bg-amber-100 border border-amber-200'
              }`}>
                <p className={`font-semibold ${availableReal < 0 ? 'text-red-700' : isWithinBudget ? 'text-green-700' : 'text-amber-700'}`}>
                  {availableReal < 0 
                    ? `⚠️ Déficit de ${formatCurrency(Math.abs(availableReal), currentHousehold?.currency)} - Revisa tus gastos`
                    : isWithinBudget 
                    ? `✓ Dentro del presupuesto - Te quedan ${formatCurrency(availableReal, currentHousehold?.currency)}`
                    : `⚠️ Gastos no presupuestados por ${formatCurrency(totalUnbudgeted, currentHousehold?.currency)} - Disponible: ${formatCurrency(availableReal, currentHousehold?.currency)}`
                  }
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ========== CHARTS SECTION ========== */}
      <div className="space-y-6 mt-8">
        <h2 className="text-2xl font-bold">Análisis y Gráficos</h2>
        
        {/* Chart 1: Income vs Expenses Bar Chart */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle className="text-lg">Ingresos vs Gastos</CardTitle>
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
                <BarChart data={incomeVsExpensesData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis 
                    tick={{ fontSize: 12 }} 
                    tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                  />
                  <Tooltip 
                    formatter={(value: number) => formatCurrency(value, currentHousehold?.currency)}
                    labelStyle={{ color: 'var(--foreground)' }}
                    contentStyle={{ 
                      backgroundColor: 'var(--background)', 
                      border: '1px solid var(--border)',
                      borderRadius: '8px'
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

        {/* Charts Row: Pie Chart + Compliance */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Chart 2: Expenses by Category Pie Chart */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle className="text-lg">Gastos por Categoría</CardTitle>
                  <CardDescription>Distribución del gasto</CardDescription>
                </div>
                <Select value={pieChartMonth} onValueChange={setPieChartMonth}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableMonths.map(month => (
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
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={expensesByCategoryData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
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
                          borderRadius: '8px'
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Legend */}
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

          {/* Chart 3: Budget Compliance */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle className="text-lg">Cumplimiento de Presupuesto</CardTitle>
                  <CardDescription>Gastos variables: Real vs Presupuestado</CardDescription>
                </div>
                <Select value={complianceMonth} onValueChange={setComplianceMonth}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableMonths.map(month => (
                      <SelectItem key={month} value={month}>
                        {formatMonth(month)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {budgetComplianceData.length > 0 ? (
                <div className="space-y-4">
                  {budgetComplianceData.map((item, index) => (
                    <div key={index} className="space-y-2">
                      <div className="flex justify-between items-center text-sm">
                        <span className="font-medium">{item.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          item.status === 'over' 
                            ? 'bg-red-100 text-red-700' 
                            : item.status === 'warning'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-green-100 text-green-700'
                        }`}>
                          {item.percentage.toFixed(0)}%
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                <div className="flex-1">
                          <div className="h-4 bg-muted rounded-full overflow-hidden relative">
                            {/* Budget bar (background) */}
                            <div className="absolute inset-0 bg-primary/20" />
                            {/* Actual spent bar */}
                            <div 
                              className={`h-full rounded-full transition-all relative z-10 ${
                                item.status === 'over' 
                                  ? 'bg-destructive' 
                                  : item.status === 'warning'
                                  ? 'bg-amber-500'
                                  : 'bg-primary'
                              }`}
                              style={{ width: `${Math.min(item.percentage, 100)}%` }}
                            />
                            {/* Over budget indicator */}
                            {item.percentage > 100 && (
                              <div 
                                className="absolute top-0 h-full bg-destructive/30 border-l-2 border-destructive"
                                style={{ left: '100%', width: `${Math.min(item.percentage - 100, 50)}%` }}
                              />
                            )}
                          </div>
                        </div>
                        <div className="text-xs text-right w-[100px]">
                          <span className={item.status === 'over' ? 'text-destructive font-semibold' : ''}>
                            {formatCurrency(item.Real, currentHousehold?.currency)}
                          </span>
                          <span className="text-muted-foreground">
                            {' / '}{formatCurrency(item.Presupuesto, currentHousehold?.currency)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {/* Summary */}
                  <div className="pt-4 mt-4 border-t">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total presupuestado:</span>
                      <span className="font-medium">
                        {formatCurrency(budgetComplianceData.reduce((s, i) => s + i.Presupuesto, 0), currentHousehold?.currency)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total gastado:</span>
                      <span className={`font-medium ${
                        budgetComplianceData.reduce((s, i) => s + i.Real, 0) > budgetComplianceData.reduce((s, i) => s + i.Presupuesto, 0)
                          ? 'text-destructive'
                          : 'text-green-600'
                      }`}>
                        {formatCurrency(budgetComplianceData.reduce((s, i) => s + i.Real, 0), currentHousehold?.currency)}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-[250px] flex items-center justify-center text-muted-foreground flex-col gap-2">
                  <ShoppingCart className="h-8 w-8 opacity-30" />
                  <p>No hay presupuestos variables activos</p>
                  <p className="text-xs">en {formatMonth(complianceMonth)}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open)
        if (!open) {
          setIsNewCategory(false)
          setNewCategoryName('')
        }
      }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingItem ? 'Editar' : 'Nuevo'} {formData.kind === 'income' ? 'Ingreso' : (formData.type === 'variable' ? 'Gasto Variable' : 'Gasto Fijo')}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            
            {/* For Variable Expenses: Category selection */}
            {formData.kind === 'expense' && formData.type === 'variable' && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Categoría *</Label>
                  {!editingItem && availableCategoriesForVariable.length === 0 && !isNewCategory ? (
                    <div className="text-sm text-muted-foreground p-3 bg-muted/50 rounded-lg">
                      Ya tienes presupuesto para todas las categorías. 
                      <Button 
                        variant="link" 
                        className="p-0 h-auto ml-1"
                        onClick={() => setIsNewCategory(true)}
                      >
                        Crear nueva categoría
                      </Button>
                    </div>
                  ) : (
                    <Select 
                      value={isNewCategory ? '__new__' : formData.category_id} 
                      onValueChange={(v) => {
                        if (v === '__new__') {
                          setIsNewCategory(true)
                          setFormData({ ...formData, category_id: undefined })
                        } else {
                          setIsNewCategory(false)
                          setNewCategoryName('')
                          const cat = categories.find(c => c.id === v)
                          setFormData({ ...formData, category_id: v, name: cat?.name || '' })
                        }
                      }}
                      disabled={editingItem !== null}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar categoría" />
                      </SelectTrigger>
                      <SelectContent>
                        {(editingItem ? categories : availableCategoriesForVariable).map(cat => (
                          <SelectItem key={cat.id} value={cat.id}>
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getCategoryColor(cat.name) }} />
                              {cat.name}
                            </div>
                          </SelectItem>
                        ))}
                        {!editingItem && (
                          <SelectItem value="__new__">
                            <div className="flex items-center gap-2 text-primary">
                              <Plus className="h-3 w-3" />
                              Nueva categoría...
                            </div>
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                
                {isNewCategory && (
                  <div className="space-y-2">
                    <Label>Nombre de la nueva categoría *</Label>
                  <Input
                      placeholder="Ej: Mascotas, Gimnasio, Ahorro..."
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      autoFocus
                  />
                </div>
                )}
              </div>
            )}

            {/* For Income and Fixed Expenses: Name field */}
            {(formData.kind === 'income' || (formData.kind === 'expense' && formData.type === 'fixed')) && (
              <div className="space-y-2">
                <Label>Nombre *</Label>
                <Input
                  placeholder={formData.kind === 'income' ? 'Ej: Sueldo, Freelance, Arriendo...' : 'Ej: Netflix, Arriendo, Seguro...'}
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
            )}

            {/* Amount and Frequency row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Monto *</Label>
                  <Input
                    type="number"
                  placeholder="0"
                  value={formData.amount || ''}
                  onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              <div className="space-y-2">
                <Label>Frecuencia</Label>
                <Select 
                  value={formData.frequency} 
                  onValueChange={(v) => {
                    const newFreq = v as Frequency
                    // If one_time, automatically set is_indefinite to false
                    if (newFreq === 'one_time') {
                      setFormData({ ...formData, frequency: newFreq, is_indefinite: false })
                    } else {
                      setFormData({ ...formData, frequency: newFreq })
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Mensual</SelectItem>
                    <SelectItem value="weekly">Semanal</SelectItem>
                    <SelectItem value="biweekly">Quincenal</SelectItem>
                    <SelectItem value="yearly">Anual</SelectItem>
                    {/* Only show one-time for income */}
                    {formData.kind === 'income' && (
                      <SelectItem value="one_time">
                        <span className="flex items-center gap-2">
                          💰 Puntual (único)
                        </span>
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Category for Fixed Expenses only */}
            {formData.kind === 'expense' && formData.type === 'fixed' && (
              <div className="space-y-2">
                <Label>Categoría (opcional)</Label>
                <Select value={formData.category_id || ''} onValueChange={(v) => setFormData({ ...formData, category_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(cat => (
                      <SelectItem key={cat.id} value={cat.id}>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getCategoryColor(cat.name) }} />
                          {cat.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Dates */}
            <div className="space-y-3 p-3 rounded-lg bg-muted/50">
              {formData.frequency === 'one_time' ? (
                <>
                  <div className="space-y-2">
                    <Label>Fecha del ingreso</Label>
                    <Input
                      type="date"
                      value={formData.start_date || ''}
                      onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    💡 Este ingreso se contabilizará únicamente en el mes seleccionado.
                    Ideal para: finiquito, venta de auto, aguinaldo, bonos, etc.
                  </p>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>Fecha de inicio</Label>
                    <Input
                      type="date"
                      value={formData.start_date || ''}
                      onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    />
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Checkbox 
                      id="indefinite"
                      checked={formData.is_indefinite}
                      onCheckedChange={(checked) => setFormData({ ...formData, is_indefinite: !!checked })}
                    />
                    <Label htmlFor="indefinite" className="flex items-center gap-2 cursor-pointer">
                      <InfinityIcon className="h-4 w-4" />
                      Indefinido (sin fecha de término)
                    </Label>
                  </div>
                  
                  {!formData.is_indefinite && (
                    <div className="space-y-2">
                      <Label>Fecha de término</Label>
                      <Input
                        type="date"
                        value={formData.end_date || ''}
                        onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                      />
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="space-y-2">
              <Label>Notas (opcional)</Label>
              <Input
                placeholder="Notas adicionales..."
                value={formData.notes || ''}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>

            {/* Monthly preview */}
            {formData.amount && formData.amount > 0 && formData.frequency !== 'monthly' && (
              <div className="bg-primary/5 rounded-lg p-3 text-sm">
                <p className="text-muted-foreground">Equivalente mensual:</p>
                <p className="text-lg font-bold text-primary">
                  {formatCurrency(
                    formData.amount * ({ monthly: 1, weekly: 4.33, biweekly: 2, yearly: 1/12 }[formData.frequency || 'monthly']),
                    currentHousehold?.currency
                  )}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={saveItem}>
              {editingItem ? 'Guardar Cambios' : 'Agregar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Expense Registration Dialog */}
      <Dialog open={expenseDialogOpen} onOpenChange={setExpenseDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-amber-600" />
              Registrar Gasto
            </DialogTitle>
            <DialogDescription>
              {selectedBudgetItem && (
                <span className="flex items-center gap-2 mt-1">
                  Categoría: <strong>{categories.find(c => c.id === selectedBudgetItem.category_id)?.name || selectedBudgetItem.name}</strong>
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          
          {selectedBudgetItem && (
            <div className="space-y-4 py-4">
              {/* Progress indicator */}
              <div className="bg-muted/50 rounded-lg p-3">
                <div className="flex justify-between text-sm mb-2">
                  <span>Gastado este mes</span>
                  <span>
                    <strong>{formatCurrency(getSpentForCategory(selectedBudgetItem.category_id), currentHousehold?.currency)}</strong>
                    <span className="text-muted-foreground"> / {formatCurrency(getMonthlyAmount(selectedBudgetItem), currentHousehold?.currency)}</span>
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  {(() => {
                    const spent = getSpentForCategory(selectedBudgetItem.category_id)
                    const budget = getMonthlyAmount(selectedBudgetItem)
                    const percentage = budget > 0 ? (spent / budget) * 100 : 0
              return (
                      <div 
                        className={`h-full rounded-full transition-all ${
                          percentage > 100 ? 'bg-destructive' : percentage > 80 ? 'bg-amber-500' : 'bg-primary'
                        }`}
                        style={{ width: `${Math.min(percentage, 100)}%` }}
                      />
                    )
                  })()}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Disponible: {formatCurrency(
                    Math.max(0, getMonthlyAmount(selectedBudgetItem) - getSpentForCategory(selectedBudgetItem.category_id)),
                    currentHousehold?.currency
                  )}
                </p>
              </div>

              <div className="space-y-2">
                <Label>Monto gastado *</Label>
                    <Input
                      type="number"
                      placeholder="0"
                  value={expenseForm.amount || ''}
                  onChange={(e) => setExpenseForm({ ...expenseForm, amount: parseFloat(e.target.value) || 0 })}
                  autoFocus
                    />
                  </div>

              <div className="space-y-2">
                <Label>Fecha</Label>
                <Input
                  type="date"
                  value={expenseForm.date}
                  onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>Descripción (opcional)</Label>
                <Input
                  placeholder="Ej: Compra semanal, Jumbo..."
                  value={expenseForm.description}
                  onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                />
              </div>

              {/* Warning if over budget */}
              {expenseForm.amount > 0 && (
                getSpentForCategory(selectedBudgetItem.category_id) + expenseForm.amount > getMonthlyAmount(selectedBudgetItem)
              ) && (
                <div className="flex items-center gap-2 text-amber-600 bg-amber-50 rounded-lg p-3 text-sm">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  <span>Con este gasto superarás el presupuesto de este mes</span>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setExpenseDialogOpen(false)}>Cancelar</Button>
            <Button onClick={saveQuickExpense} className="bg-amber-600 hover:bg-amber-700">
              <Plus className="mr-2 h-4 w-4" /> Registrar Gasto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
                </div>
              )
}

// Empty State Component
function EmptyState({ icon: Icon, title, description }: { icon: React.ElementType, title: string, description: string }) {
  return (
    <div className="text-center py-8 text-muted-foreground">
      {Icon && <Icon className="h-12 w-12 mx-auto mb-3 opacity-30" />}
      <p className="font-medium">{title}</p>
      <p className="text-sm">{description}</p>
      </div>
  )
}

// Item List Component
function ItemList({ 
  items, 
  categories, 
  currency, 
  onEdit, 
  onToggle, 
  onDelete,
  showInactive,
  showSpent = false,
  getSpent,
  onRegisterExpense
}: { 
  items: BudgetItem[]
  categories: Category[]
  currency?: string
  onEdit: (item: BudgetItem) => void
  onToggle: (item: BudgetItem) => void
  onDelete: (id: string) => void
  showInactive: boolean
  showSpent?: boolean
  getSpent?: (categoryId?: string) => number
  onRegisterExpense?: (item: BudgetItem) => void
}) {
  return (
    <div className="space-y-2">
      {items.map(item => {
        const category = categories.find(c => c.id === item.category_id)
        const monthlyAmount = getMonthlyAmount(item)
        const spent = showSpent && getSpent ? getSpent(item.category_id) : 0
        const percentage = monthlyAmount > 0 ? (spent / monthlyAmount) * 100 : 0
        
        return (
          <div 
            key={item.id} 
            className={`flex items-center gap-3 p-3 rounded-lg transition-colors group ${
              item.is_active 
                ? 'bg-muted/50 hover:bg-muted' 
                : 'bg-muted/20 opacity-60'
            }`}
          >
            {/* Status indicator */}
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${item.is_active ? 'bg-green-500' : 'bg-gray-400'}`} />
            
            {/* Category color */}
            {category && (
              <div 
                className="w-3 h-3 rounded-full flex-shrink-0" 
                style={{ backgroundColor: getCategoryColor(category.name) }}
              />
            )}
            
            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className={`font-medium truncate ${!item.is_active ? 'line-through' : ''}`}>{item.name}</p>
                {item.is_installment && item.total_installments && (
                  <Badge variant="secondary" className="text-xs bg-purple-100 text-purple-700">
                    Cuota {getCurrentInstallment(item)}/{item.total_installments}
                  </Badge>
                )}
                {!item.is_active && (
                  <Badge variant="outline" className="text-xs">Inactivo</Badge>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {item.is_installment ? (
                  <>
                    <span>💳 {item.total_installments} cuotas</span>
                    <span>·</span>
                    <span>Inicio {new Date(item.start_date).toLocaleDateString('es-CL', { month: 'short', year: 'numeric' })}</span>
                    {item.end_date && (
                      <>
                        <span>·</span>
                        <span>Termina {new Date(item.end_date).toLocaleDateString('es-CL', { month: 'short', year: 'numeric' })}</span>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <span>{FREQUENCY_LABELS[item.frequency]}</span>
                    <span>·</span>
                    <span>Desde {new Date(item.start_date).toLocaleDateString('es-CL', { month: 'short', year: 'numeric' })}</span>
                    {!item.is_indefinite && item.end_date && (
                      <>
                        <span>·</span>
                        <span>Hasta {new Date(item.end_date).toLocaleDateString('es-CL', { month: 'short', year: 'numeric' })}</span>
                      </>
                    )}
                    {item.is_indefinite && (
                      <span className="flex items-center gap-1">
                        <span>·</span>
                        <InfinityIcon className="h-3 w-3" />
                      </span>
                    )}
                  </>
                )}
              </div>
              
              {/* Progress bar for variable expenses */}
              {showSpent && item.is_active && (
                <div className="mt-2">
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all ${
                        percentage > 100 ? 'bg-destructive' : percentage > 80 ? 'bg-amber-500' : 'bg-primary'
                      }`}
                      style={{ width: `${Math.min(percentage, 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
            
            {/* Amount */}
            <div className="text-right">
              {showSpent && item.is_active ? (
                <p className="text-sm">
                  <span className={percentage > 100 ? 'text-destructive font-semibold' : 'font-medium'}>
                    {formatCurrency(spent, currency)}
                  </span>
                  <span className="text-muted-foreground"> / {formatCurrency(monthlyAmount, currency)}</span>
                </p>
              ) : (
                <p className="font-semibold tabular-nums">
                  {formatCurrency(monthlyAmount, currency)}
                  {item.frequency !== 'monthly' && (
                    <span className="text-xs text-muted-foreground font-normal">/mes</span>
                  )}
                </p>
              )}
            </div>
            
            {/* Quick register expense button for variable expenses */}
            {showSpent && item.is_active && onRegisterExpense && (
              <Button 
                size="sm" 
                variant="outline"
                className="h-8 text-xs border-amber-300 text-amber-700 hover:bg-amber-50"
                onClick={() => onRegisterExpense(item)}
              >
                <Plus className="mr-1 h-3 w-3" /> Gasto
              </Button>
            )}
            
            {/* Actions */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {showSpent && item.is_active && onRegisterExpense && (
                  <>
                    <DropdownMenuItem onClick={() => onRegisterExpense(item)} className="text-amber-700">
                      <Plus className="mr-2 h-4 w-4" /> Registrar Gasto
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                {item.is_active && (
                  <DropdownMenuItem onClick={() => onEdit(item)}>
                    <Edit2 className="mr-2 h-4 w-4" /> Editar
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => onToggle(item)}>
                  {item.is_active ? (
                    <><XCircle className="mr-2 h-4 w-4" /> Desactivar</>
                  ) : (
                    <><CheckCircle2 className="mr-2 h-4 w-4" /> Reactivar</>
                  )}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onDelete(item.id)} className="text-destructive">
                  <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      })}
    </div>
  )
}
