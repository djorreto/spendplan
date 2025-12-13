'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useHousehold } from '@/hooks/use-household'
import { useToast } from '@/components/ui/toast'
import { supabaseBrowser } from '@/lib/supabase'
import { createAIProvider } from '@/lib/ai/provider'
import { formatCurrency, formatDate, getCategoryColor } from '@/lib/utils'
import { 
  Sparkles,
  Check,
  X,
  Lightbulb,
  Save
} from 'lucide-react'
import type { Expense, Category } from '@/types'

export default function ClassifyPage() {
  const { currentHousehold } = useHousehold()
  const { addToast } = useToast()
  
  const [loading, setLoading] = useState(true)
  const [unclassified, setUnclassified] = useState<Expense[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [aiSuggesting, setAiSuggesting] = useState(false)

  // Pending changes: user picks categories, then saves in bulk
  const [pendingCategoryByExpenseId, setPendingCategoryByExpenseId] = useState<Record<string, string>>({})
  const pendingCount = Object.keys(pendingCategoryByExpenseId).length

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

      const nextExpenses = (exps || []) as Expense[]
      setUnclassified(nextExpenses)
      // Preserve pending selections for expenses that are still visible
      setPendingCategoryByExpenseId((prev) => {
        const ids = new Set(nextExpenses.map((e) => e.id))
        const next: Record<string, string> = {}
        for (const [id, catId] of Object.entries(prev)) {
          if (ids.has(id)) next[id] = catId
        }
        return next
      })
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  const setPendingCategory = (expenseId: string, categoryId: string) => {
    setPendingCategoryByExpenseId((prev) => ({ ...prev, [expenseId]: categoryId }))
  }

  const clearPendingCategory = (expenseId: string) => {
    setPendingCategoryByExpenseId((prev) => {
      const next = { ...prev }
      delete next[expenseId]
      return next
    })
  }

  const saveSingle = async (expenseId: string) => {
    const categoryId = pendingCategoryByExpenseId[expenseId]
    if (!categoryId) return
    const supabase = supabaseBrowser()
    setProcessingId(expenseId)

    try {
      const { error } = await supabase.from('expenses').update({ category_id: categoryId }).eq('id', expenseId)
      if (error) throw error
      setUnclassified((prev) => prev.filter((e) => e.id !== expenseId))
      setPendingCategoryByExpenseId((prev) => {
        const next = { ...prev }
        delete next[expenseId]
        return next
      })
      addToast({ type: 'success', message: 'Gasto guardado' })
    } catch {
      addToast({ type: 'error', message: 'Error al guardar gasto' })
    } finally {
      setProcessingId(null)
    }
  }

  const savePending = async () => {
    if (pendingCount === 0) return
    const supabase = supabaseBrowser()
    setAiSuggesting(true)

    try {
      const entries = Object.entries(pendingCategoryByExpenseId)
      let saved = 0

      for (const [expenseId, categoryId] of entries) {
        const { error } = await supabase
          .from('expenses')
          .update({ category_id: categoryId })
          .eq('id', expenseId)
        if (error) throw error
        saved++
      }

      setUnclassified((prev) => prev.filter((e) => !pendingCategoryByExpenseId[e.id]))
      setPendingCategoryByExpenseId({})
      addToast({ type: 'success', message: `${saved} gasto(s) guardados` })
    } catch {
      addToast({ type: 'error', message: 'Error al guardar clasificación' })
    } finally {
      setAiSuggesting(false)
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
        rules: []
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

        // Reflect on UI immediately
        setUnclassified((prev) =>
          prev.map((e) =>
            e.id === expense.id
              ? ({
                  ...e,
                  ai_category_suggestion: result.category_id,
                  ai_confidence: result.confidence,
                  ai_reason: result.reason,
                } as Expense)
              : e
          )
        )

        // Always pre-select the suggestion for saving (user can change it)
        setPendingCategory(expense.id, result.category_id)
        addToast({ type: 'info', title: 'Sugerencia de IA', message: result.reason })
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
          <Button onClick={savePending} disabled={pendingCount === 0 || aiSuggesting} className="hidden sm:inline-flex">
            <Save className="mr-2 h-4 w-4" />
            {aiSuggesting ? 'Guardando...' : `Guardar${pendingCount > 0 ? ` (${pendingCount})` : ''}`}
          </Button>
          <Button onClick={suggestAllWithAI} disabled={aiSuggesting || unclassified.length === 0}>
            <Sparkles className="mr-2 h-4 w-4" />
            {aiSuggesting ? 'Procesando...' : 'Sugerir con IA'}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Gastos sin clasificar</CardTitle>
          <CardDescription>Selecciona categoría y luego guarda (en lote o por gasto).</CardDescription>
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
              {unclassified.map((expense) => {
                const selectedCategoryId = pendingCategoryByExpenseId[expense.id] || null
                return (
                  <div
                    key={expense.id}
                    className={`p-4 border rounded-lg ${processingId === expense.id ? 'opacity-50' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="min-w-0">
                        <p className="font-medium truncate">
                          {expense.merchant || expense.description || 'Gasto'}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {formatDate(expense.expense_date)} · {formatCurrency(expense.amount, currentHousehold?.currency)}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {selectedCategoryId && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => saveSingle(expense.id)}
                            disabled={aiSuggesting || processingId === expense.id}
                          >
                            <Save className="mr-2 h-4 w-4" />
                            Guardar
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => suggestWithAI(expense)}
                          disabled={aiSuggesting || processingId === expense.id}
                          title="Sugerir con IA"
                        >
                          <Sparkles className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {expense.ai_category_suggestion && (
                      <div className="mb-3 p-2 bg-accent rounded-lg text-sm">
                        <div className="flex items-center gap-2">
                          <Lightbulb className="h-4 w-4" />
                          <span>Sugerencia IA: </span>
                          <Badge
                            variant={selectedCategoryId === String(expense.ai_category_suggestion) ? 'default' : 'secondary'}
                            className="cursor-pointer"
                            onClick={() => setPendingCategory(expense.id, String(expense.ai_category_suggestion))}
                          >
                            {categories.find((c) => c.id === expense.ai_category_suggestion)?.name}
                          </Badge>
                          <span className="text-muted-foreground">
                            ({Math.round((expense.ai_confidence || 0) * 100)}% confianza)
                          </span>
                          {selectedCategoryId && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 ml-auto"
                              onClick={() => clearPendingCategory(expense.id)}
                              title="Quitar selección"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      {categories
                        .filter((c) => c.name !== 'Sin clasificar')
                        .slice(0, 10)
                        .map((cat) => (
                          <Button
                            key={cat.id}
                            variant={selectedCategoryId === cat.id ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setPendingCategory(expense.id, cat.id)}
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
                )
              })}
            </div>
          )}
        </CardContent>
        {!loading && unclassified.length > 0 && (
          <CardFooter className="flex justify-between">
            <p className="text-xs text-muted-foreground">
              Tip: “Sugerir con IA” preselecciona una categoría. Luego puedes “Guardar” por gasto o en lote arriba.
            </p>
            <Button onClick={savePending} disabled={pendingCount === 0 || aiSuggesting} className="sm:hidden">
              <Save className="mr-2 h-4 w-4" />
              {aiSuggesting ? 'Guardando...' : `Guardar${pendingCount > 0 ? ` (${pendingCount})` : ''}`}
            </Button>
          </CardFooter>
        )}
      </Card>
    </div>
  )
}

