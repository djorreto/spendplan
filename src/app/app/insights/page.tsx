'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useHousehold } from '@/hooks/use-household'
import { useToast } from '@/components/ui/toast'
import { supabaseBrowser } from '@/lib/supabase'
import { endOp, formatSupabaseError, logOp, startOp, withRetry } from '@/lib/debug-log'
import { formatMonth, getCurrentMonth, getCategoryColor } from '@/lib/utils'
import { 
  Sparkles,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Lightbulb,
  RefreshCw,
  ChevronRight,
  Target,
  CheckCircle
} from 'lucide-react'

// Demo mode constants
const DEMO_BUDGET_KEY = 'spendplan_demo_budget_v2'
const DEMO_EXPENSES_KEY = 'spendplan_demo_expenses'
const DEMO_CUSTOM_CATEGORIES_KEY = 'spendplan_demo_custom_categories'
const INSIGHTS_CACHE_PREFIX = 'spendplan_insights_cache_v2'

interface InsightsReport {
  bullets: string[]
  flags: Array<{
    category_name: string
    type: string
    message: string
    percentage?: number
  }>
  recommendations: string[]
  generated_at: string
}

const DEMO_CATEGORIES = [
  { id: 'cat-1', name: 'Dividendo' },
  { id: 'cat-2', name: 'Arriendo' },
  { id: 'cat-9', name: 'Supermercado' },
  { id: 'cat-10', name: 'Transporte' },
  { id: 'cat-11', name: 'Restaurantes' },
  { id: 'cat-12', name: 'Entretenimiento' },
  { id: 'cat-13', name: 'Salud' },
]

export default function InsightsPage() {
  const { currentHousehold, isDemoMode } = useHousehold()
  const { addToast } = useToast()
  
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [report, setReport] = useState<InsightsReport | null>(null)
  const currentMonth = getCurrentMonth()
  const isDemo = isDemoMode && !!currentHousehold?.id?.startsWith('demo-')

  const getCacheKey = () => {
    const householdId = currentHousehold?.id || 'unknown'
    return `${INSIGHTS_CACHE_PREFIX}:${householdId}:${currentMonth}`
  }

  // Load data
  useEffect(() => {
    if (currentHousehold) {
      loadData()
    }
  }, [currentHousehold?.id, currentMonth])

  const loadData = () => {
    setLoading(true)
    
    // Load cached insights
    const cached = localStorage.getItem(getCacheKey())
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as { month: string; report: InsightsReport }
        if (parsed.month === currentMonth && parsed.report) setReport(parsed.report)
      } catch (e) {}
    }
    
    setLoading(false)
  }

  const generateInsights = async () => {
    if (!currentHousehold) return
    setGenerating(true)
    const op = startOp('insights.generate', { householdId: currentHousehold.id, month: currentMonth, isDemo })

    try {
      let totalIncome = 0
      let totalBudgeted = 0
      let totalSpent = 0
      let expensesSummary = ''

      if (isDemo) {
        // Load data from localStorage (demo)
        const budgetData = JSON.parse(localStorage.getItem(DEMO_BUDGET_KEY) || '{"items":[]}')
        const budgetItems = budgetData.items || []
        const allExpenses = JSON.parse(localStorage.getItem(DEMO_EXPENSES_KEY) || '[]')
        const customCategories = JSON.parse(localStorage.getItem(DEMO_CUSTOM_CATEGORIES_KEY) || '[]')
        const categories = [...DEMO_CATEGORIES, ...customCategories]

        const monthExpenses = allExpenses.filter((e: any) => e.expense_date?.startsWith(currentMonth))
        const activeIncomes = budgetItems.filter((i: any) => i.kind === 'income' && i.is_active !== false)
        const activeVariable = budgetItems.filter((i: any) => i.kind === 'expense' && i.type === 'variable' && i.is_active !== false)

        totalIncome = activeIncomes.reduce((sum: number, i: any) => sum + (i.amount || 0), 0)
        totalBudgeted = activeVariable.reduce((sum: number, i: any) => sum + (i.amount || 0), 0)
        totalSpent = monthExpenses.reduce((sum: number, e: any) => sum + (e.amount || 0), 0)
        expensesSummary = monthExpenses.slice(0, 30).map((e: any) => {
          const cat = categories.find((c: any) => c.id === e.category_id)
          return `${e.expense_date}: $${e.amount} - ${e.merchant || cat?.name || 'Sin categoría'}`
        }).join('\n')
      } else {
        // Real users: load from Supabase
        const supabase = supabaseBrowser()
        const startOfMonth = `${currentMonth}-01`
        const endOfMonth = `${currentMonth}-31`

        const [budgetResp, expensesResp] = await Promise.all([
          withRetry(
            () =>
              supabase
                .from('budget_items')
                .select('id, kind, type, amount, category_id, is_active, start_date, end_date, is_indefinite')
                .eq('household_id', currentHousehold.id),
            { retries: 2, baseDelayMs: 250, ctx: op, step: 'select.budget_items' }
          ),
          withRetry(
            () =>
              supabase
                .from('expenses')
                .select('id, amount, merchant, description, expense_date, category:categories!expenses_category_id_fkey(name)')
                .eq('household_id', currentHousehold.id)
                .gte('expense_date', startOfMonth)
                .lte('expense_date', endOfMonth)
                .order('expense_date', { ascending: false })
                .limit(300),
            { retries: 2, baseDelayMs: 250, ctx: op, step: 'select.expenses' }
          ),
        ])

        if (budgetResp.error) throw budgetResp.error
        if (expensesResp.error) throw expensesResp.error

        const budgetItems = budgetResp.data || []
        const monthExpenses = expensesResp.data || []

        const isItemActive = (item: any) => {
          if (item.is_active === false) return false
          const today = new Date().toISOString().split('T')[0]
          if (item.start_date && item.start_date > today) return false
          if (!item.is_indefinite && item.end_date && item.end_date < today) return false
          return true
        }

        const activeIncomes = budgetItems.filter((i: any) => i.kind === 'income' && isItemActive(i))
        const activeVariable = budgetItems.filter((i: any) => i.kind === 'expense' && i.type === 'variable' && isItemActive(i))

        totalIncome = activeIncomes.reduce((sum: number, i: any) => sum + (parseFloat(i.amount) || 0), 0)
        totalBudgeted = activeVariable.reduce((sum: number, i: any) => sum + (parseFloat(i.amount) || 0), 0)
        totalSpent = monthExpenses.reduce((sum: number, e: any) => sum + (e.amount || 0), 0)

        expensesSummary = monthExpenses.slice(0, 40).map((e: any) => {
          const catName = e.category?.name
          const label = e.merchant || e.description || catName || 'Sin categoría'
          return `${e.expense_date}: $${e.amount} - ${label}`
        }).join('\n')
      }
      
      // Categories with spending
      // (not used here; flags come from model)

      // Usar API Route (key segura en servidor)
      try {
        const response = await fetch('/api/ai/insights', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            month: currentMonth,
            totalIncome,
            totalBudgeted,
            totalSpent,
            expensesSummary
          })
        })

        if (response.ok) {
          const parsed = await response.json()
          
          const newReport: InsightsReport = {
            bullets: parsed.bullets || [],
            flags: parsed.flags || [],
            recommendations: parsed.recommendations || [],
            generated_at: new Date().toISOString()
          }
          
          setReport(newReport)
          
          // Cache
          localStorage.setItem(getCacheKey(), JSON.stringify({
            month: currentMonth,
            report: newReport
          }))
          
          addToast({ type: 'success', message: 'Insights generados con IA' })
          endOp(op, true, { totalIncome, totalBudgeted, totalSpent })
        } else {
          const body = await response.json().catch(() => null)
          throw new Error(body?.error || `Error al generar insights (HTTP ${response.status})`)
        }
      } catch (e) {
        logOp(op, 'warn', 'ai insights unavailable, using local fallback', 'ai.fallback', {
          reason: formatSupabaseError(e),
          totals: { totalIncome, totalBudgeted, totalSpent },
        })
        // Fallback to mock insights
        const mockReport: InsightsReport = {
          bullets: [
            `Has gastado $${totalSpent.toLocaleString('es-CL')} de tu presupuesto de $${totalBudgeted.toLocaleString('es-CL')} este mes`,
            `Llevas ${Math.round((totalSpent / totalBudgeted) * 100) || 0}% del presupuesto consumido`,
            `Se analizaron ${expensesSummary ? expensesSummary.split('\n').filter(Boolean).length : 0} gastos (mes ${currentMonth})`,
            totalIncome > totalSpent 
              ? `Balance positivo de $${(totalIncome - totalSpent).toLocaleString('es-CL')}`
              : `Atención: gastos superan ingresos por $${(totalSpent - totalIncome).toLocaleString('es-CL')}`
          ],
          flags: totalSpent > totalBudgeted ? [{
            category_name: 'Presupuesto General',
            type: 'over_budget',
            message: 'Has superado el presupuesto del mes',
            percentage: Math.round((totalSpent / totalBudgeted) * 100)
          }] : [],
          recommendations: [
            'Revisa tus gastos en restaurantes y entretenimiento',
            'Considera establecer un límite semanal de gastos',
            'Registra todos tus gastos para mejor seguimiento'
          ],
          generated_at: new Date().toISOString()
        }
        
        setReport(mockReport)
        
        localStorage.setItem(getCacheKey(), JSON.stringify({
          month: currentMonth,
          report: mockReport
        }))
        
        addToast({
          type: 'warning',
          message: `IA no disponible, mostrando insights con tus datos (opId: ${op.opId})`,
        })
        endOp(op, true, { totalIncome, totalBudgeted, totalSpent, fallback: true })
      }
    } catch (error) {
      console.error('Error generating insights:', error)
      logOp(op, 'error', 'generate failed', 'generateInsights', { error: formatSupabaseError(error) })
      endOp(op, false)
      addToast({ type: 'error', message: `Error al generar insights (opId: ${op.opId})` })
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Insights</h1>
          <p className="text-muted-foreground">
            Análisis inteligente de tus gastos - {formatMonth(currentMonth)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={generateInsights} disabled={generating}>
            {generating ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Generando...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                {report ? 'Regenerar' : 'Generar'} Insights
              </>
            )}
          </Button>
        </div>
      </div>


      {loading ? (
        <div className="grid gap-6 md:grid-cols-2">
          {[1,2,3,4].map(i => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="h-32 bg-muted animate-pulse rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !report ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Sparkles className="h-16 w-16 mx-auto text-muted-foreground mb-6" />
            <h2 className="text-xl font-semibold mb-2">No hay insights generados</h2>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Genera un análisis inteligente de tus gastos del mes para obtener recomendaciones personalizadas.
            </p>
            <Button onClick={generateInsights} disabled={generating}>
              <Sparkles className="mr-2 h-4 w-4" />
              Generar Insights
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Key Bullets */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-primary" />
                Resumen del Mes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {report.bullets.map((bullet, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Flags / Alerts */}
          {report.flags && report.flags.length > 0 && (
            <Card className="border-amber-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  Alertas
                </CardTitle>
                <CardDescription>Categorías que requieren atención</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {report.flags.map((flag, i) => (
                    <div key={i} className="flex items-center justify-between p-4 bg-amber-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: getCategoryColor(flag.category_name) }}
                        />
                        <div>
                          <p className="font-medium">{flag.category_name}</p>
                          <p className="text-sm text-muted-foreground">{flag.message}</p>
                        </div>
                      </div>
                      {flag.percentage && (
                        <Badge variant={flag.type === 'over_budget' ? 'destructive' : 'secondary'}>
                          {flag.type === 'over_budget' ? (
                            <TrendingUp className="h-3 w-3 mr-1" />
                          ) : (
                            <TrendingDown className="h-3 w-3 mr-1" />
                          )}
                          {flag.percentage > 0 ? '+' : ''}{flag.percentage}%
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recommendations */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                Recomendaciones
              </CardTitle>
              <CardDescription>Acciones sugeridas para mejorar tus finanzas</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {report.recommendations.map((rec, i) => (
                  <li key={i} className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                    <ChevronRight className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Metadata */}
          <div className="text-sm text-muted-foreground text-center">
            Generado el {new Date(report.generated_at).toLocaleString('es-CL')} · Groq AI
          </div>
        </div>
      )}
    </div>
  )
}
