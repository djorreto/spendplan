'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
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
import { useHousehold } from '@/hooks/use-household'
import { useToast } from '@/components/ui/toast'
import { supabaseBrowser } from '@/lib/supabase'
import { createAIProvider } from '@/lib/ai/provider'
import { formatCurrency, formatDate, getCategoryColor } from '@/lib/utils'
import { 
  Tags,
  Sparkles,
  Check,
  X,
  ChevronRight,
  Plus,
  Trash2,
  Lightbulb,
  Receipt
} from 'lucide-react'
import type { Expense, Category, CategorizationRule } from '@/types'

export default function ClassifyPage() {
  const { currentHousehold } = useHousehold()
  const { addToast } = useToast()
  
  const [loading, setLoading] = useState(true)
  const [unclassified, setUnclassified] = useState<Expense[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [rules, setRules] = useState<CategorizationRule[]>([])
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [aiSuggesting, setAiSuggesting] = useState(false)
  
  // Rule dialog
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false)
  const [newRule, setNewRule] = useState({
    pattern: '',
    category_id: '',
    rule_type: 'contains' as const
  })

  useEffect(() => {
    if (currentHousehold) {
      loadData()
    }
  }, [currentHousehold])

  const loadData = async () => {
    if (!currentHousehold) return
    
    const supabase = supabaseBrowser()
    setLoading(true)

    try {
      // Load categories
      const { data: cats } = await supabase
        .from('categories')
        .select('*')
        .or(`household_id.eq.${currentHousehold.id},is_system.eq.true`)
        .eq('is_active', true)
        .order('sort_order')

      setCategories(cats || [])

      // Load unclassified expenses
      const { data: exps } = await supabase
        .from('expenses')
        .select('*')
        .eq('household_id', currentHousehold.id)
        .is('category_id', null)
        .eq('status', 'confirmed')
        .order('expense_date', { ascending: false })
        .limit(50)

      setUnclassified(exps || [])

      // Load rules
      const { data: rls } = await supabase
        .from('categorization_rules')
        .select('*, category:categories(name)')
        .eq('household_id', currentHousehold.id)
        .eq('is_active', true)
        .order('priority', { ascending: false })

      setRules(rls || [])
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  const classifyExpense = async (expenseId: string, categoryId: string) => {
    const supabase = supabaseBrowser()
    setProcessingId(expenseId)

    try {
      const { error } = await supabase
        .from('expenses')
        .update({ category_id: categoryId })
        .eq('id', expenseId)

      if (error) throw error

      setUnclassified(prev => prev.filter(e => e.id !== expenseId))
      addToast({ type: 'success', message: 'Gasto clasificado' })
    } catch (error) {
      addToast({ type: 'error', message: 'Error al clasificar' })
    } finally {
      setProcessingId(null)
    }
  }

  const suggestWithAI = async (expense: Expense) => {
    setAiSuggesting(true)
    setProcessingId(expense.id)

    try {
      const provider = createAIProvider({ provider: 'mock' })
      
      const result = await provider.categorize({
        description: expense.description || '',
        merchant: expense.merchant || undefined,
        amount: expense.amount,
        categories: categories.map(c => ({ id: c.id, name: c.name, icon: c.icon || '' })),
        rules: rules.map(r => ({
          category_id: r.category_id,
          rule_type: r.rule_type,
          pattern: r.pattern
        }))
      })

      if (result.category_id) {
        // Update expense with AI suggestion
        const supabase = supabaseBrowser()
        await supabase
          .from('expenses')
          .update({
            ai_category_suggestion: result.category_id,
            ai_confidence: result.confidence,
            ai_reason: result.reason
          })
          .eq('id', expense.id)

        // Auto-classify if high confidence
        if (result.confidence >= 0.8) {
          await classifyExpense(expense.id, result.category_id)
        } else {
          addToast({ 
            type: 'info', 
            title: 'Sugerencia de IA',
            message: result.reason 
          })
          loadData()
        }
      } else {
        addToast({ type: 'warning', message: 'No se pudo determinar la categoría' })
      }
    } catch (error) {
      addToast({ type: 'error', message: 'Error al obtener sugerencia' })
    } finally {
      setAiSuggesting(false)
      setProcessingId(null)
    }
  }

  const suggestAllWithAI = async () => {
    setAiSuggesting(true)
    
    for (const expense of unclassified.slice(0, 10)) {
      await suggestWithAI(expense)
    }
    
    setAiSuggesting(false)
    addToast({ type: 'success', message: 'Sugerencias procesadas' })
  }

  const createRule = async () => {
    if (!currentHousehold || !newRule.pattern || !newRule.category_id) return

    const supabase = supabaseBrowser()

    try {
      const { error } = await supabase
        .from('categorization_rules')
        .insert({
          household_id: currentHousehold.id,
          pattern: newRule.pattern,
          category_id: newRule.category_id,
          rule_type: newRule.rule_type,
          priority: 10
        })

      if (error) throw error

      addToast({ type: 'success', message: 'Regla creada' })
      setRuleDialogOpen(false)
      setNewRule({ pattern: '', category_id: '', rule_type: 'contains' })
      loadData()
    } catch (error) {
      addToast({ type: 'error', message: 'Error al crear regla' })
    }
  }

  const deleteRule = async (id: string) => {
    const supabase = supabaseBrowser()

    try {
      const { error } = await supabase
        .from('categorization_rules')
        .delete()
        .eq('id', id)

      if (error) throw error
      setRules(prev => prev.filter(r => r.id !== id))
      addToast({ type: 'success', message: 'Regla eliminada' })
    } catch (error) {
      addToast({ type: 'error', message: 'Error al eliminar regla' })
    }
  }

  const applyRules = async () => {
    const supabase = supabaseBrowser()
    let classified = 0

    for (const expense of unclassified) {
      const text = `${expense.description || ''} ${expense.merchant || ''}`.toLowerCase()
      
      for (const rule of rules) {
        const pattern = rule.pattern.toLowerCase()
        let match = false

        if (rule.rule_type === 'contains' && text.includes(pattern)) match = true
        if (rule.rule_type === 'exact' && text === pattern) match = true
        if (rule.rule_type === 'starts_with' && text.startsWith(pattern)) match = true

        if (match) {
          await supabase
            .from('expenses')
            .update({ category_id: rule.category_id })
            .eq('id', expense.id)
          classified++
          break
        }
      }
    }

    addToast({ 
      type: 'success', 
      message: `${classified} gastos clasificados con reglas` 
    })
    loadData()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Clasificar Gastos</h1>
          <p className="text-muted-foreground">
            {unclassified.length} gastos sin categoría
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={applyRules} disabled={rules.length === 0}>
            <Tags className="mr-2 h-4 w-4" />
            Aplicar Reglas
          </Button>
          <Button onClick={suggestAllWithAI} disabled={aiSuggesting || unclassified.length === 0}>
            <Sparkles className="mr-2 h-4 w-4" />
            {aiSuggesting ? 'Procesando...' : 'Sugerir con IA'}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Unclassified List */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Gastos sin clasificar</CardTitle>
              <CardDescription>Asigna una categoría a cada gasto</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Cargando...</div>
              ) : unclassified.length === 0 ? (
                <div className="text-center py-12">
                  <Check className="h-12 w-12 mx-auto text-primary mb-4" />
                  <p className="text-lg font-medium">¡Todo clasificado!</p>
                  <p className="text-muted-foreground">No hay gastos pendientes</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {unclassified.map((expense) => (
                    <div 
                      key={expense.id} 
                      className={`p-4 border rounded-lg ${processingId === expense.id ? 'opacity-50' : ''}`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="font-medium">
                            {expense.merchant || expense.description || 'Gasto'}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {formatDate(expense.expense_date)} · {formatCurrency(expense.amount, currentHousehold?.currency)}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => suggestWithAI(expense)}
                          disabled={aiSuggesting}
                        >
                          <Sparkles className="h-4 w-4" />
                        </Button>
                      </div>
                      
                      {expense.ai_category_suggestion && (
                        <div className="mb-3 p-2 bg-accent rounded-lg text-sm">
                          <div className="flex items-center gap-2">
                            <Lightbulb className="h-4 w-4" />
                            <span>Sugerencia IA: </span>
                            <Badge variant="secondary">
                              {categories.find(c => c.id === expense.ai_category_suggestion)?.name}
                            </Badge>
                            <span className="text-muted-foreground">
                              ({Math.round((expense.ai_confidence || 0) * 100)}% confianza)
                            </span>
                          </div>
                        </div>
                      )}
                      
                      <div className="flex flex-wrap gap-2">
                        {categories.filter(c => c.name !== 'Sin clasificar').slice(0, 8).map((cat) => (
                          <Button
                            key={cat.id}
                            variant="outline"
                            size="sm"
                            onClick={() => classifyExpense(expense.id, cat.id)}
                            className="text-xs"
                            disabled={processingId === expense.id}
                          >
                            <div 
                              className="w-2 h-2 rounded-full mr-1.5"
                              style={{ backgroundColor: getCategoryColor(cat.name) }}
                            />
                            {cat.name}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Rules Panel */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Reglas de Categorización
                <Button size="sm" onClick={() => setRuleDialogOpen(true)}>
                  <Plus className="h-4 w-4" />
                </Button>
              </CardTitle>
              <CardDescription>
                Automatiza la clasificación de gastos recurrentes
              </CardDescription>
            </CardHeader>
            <CardContent>
              {rules.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No hay reglas configuradas
                </p>
              ) : (
                <div className="space-y-2">
                  {rules.map((rule) => (
                    <div key={rule.id} className="flex items-center justify-between p-2 bg-muted rounded-lg text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs bg-background px-1 rounded">
                          {rule.pattern}
                        </span>
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                        <span>{(rule.category as Category)?.name || rule.category_id}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => deleteRule(rule.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
            <CardFooter>
              <p className="text-xs text-muted-foreground">
                Tip: Crea reglas para comercios frecuentes como "JUMBO" → Supermercado
              </p>
            </CardFooter>
          </Card>
        </div>
      </div>

      {/* New Rule Dialog */}
      <Dialog open={ruleDialogOpen} onOpenChange={setRuleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva Regla de Categorización</DialogTitle>
            <DialogDescription>
              Cuando la descripción coincida, el gasto se clasificará automáticamente
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="pattern">Patrón a buscar</Label>
              <Input
                id="pattern"
                placeholder="Ej: JUMBO, Netflix, COPEC..."
                value={newRule.pattern}
                onChange={(e) => setNewRule({ ...newRule, pattern: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rule_type">Tipo de coincidencia</Label>
              <Select 
                value={newRule.rule_type} 
                onValueChange={(v) => setNewRule({ ...newRule, rule_type: v as 'contains' })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contains">Contiene</SelectItem>
                  <SelectItem value="exact">Exacto</SelectItem>
                  <SelectItem value="starts_with">Comienza con</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Asignar a categoría</Label>
              <Select 
                value={newRule.category_id} 
                onValueChange={(v) => setNewRule({ ...newRule, category_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona categoría" />
                </SelectTrigger>
                <SelectContent>
                  {categories.filter(c => c.name !== 'Sin clasificar').map(cat => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRuleDialogOpen(false)}>Cancelar</Button>
            <Button onClick={createRule}>Crear Regla</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

