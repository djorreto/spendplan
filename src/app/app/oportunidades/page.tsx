'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useHousehold } from '@/hooks/use-household'
import { useSelectedMonth } from '@/hooks/use-selected-month'
import { useToast } from '@/components/ui/toast'
import { supabaseBrowser } from '@/lib/supabase'
import { buildCriticalView, type CriticalView, type OpportunityExpense } from '@/lib/savings-opportunities'
import { formatCurrency, formatMonth, getMonthDateRange } from '@/lib/utils'
import type { SavingsOpportunity } from '@/types'
import { Lightbulb, ShoppingCart, Tag, TrendingDown } from 'lucide-react'

function shiftMonth(month: string, delta: number): string {
  const [year, monthNum] = month.split('-').map(Number)
  const date = new Date(year, monthNum - 1 + delta, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function kindLabel(kind: SavingsOpportunity['kind']) {
  return kind === 'price' ? 'Precio' : 'Demanda'
}

export default function OportunidadesPage() {
  const { currentHousehold } = useHousehold()
  const { selectedMonth } = useSelectedMonth(currentHousehold?.id)
  const { addToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<CriticalView | null>(null)

  useEffect(() => {
    if (!currentHousehold) return
    let cancelled = false

    const load = async () => {
      setLoading(true)
      const start = getMonthDateRange(shiftMonth(selectedMonth, -2)).start
      const end = getMonthDateRange(selectedMonth).endExclusive
      const supabase = supabaseBrowser()
      const { data, error } = await supabase
        .from('expenses')
        .select('amount, merchant, description, expense_date, category_id, status, ai_adjustment, category:categories!expenses_category_id_fkey(name)')
        .eq('household_id', currentHousehold.id)
        .gte('expense_date', start)
        .lt('expense_date', end)
        .neq('status', 'cancelled')
        .limit(3000)

      if (cancelled) return
      if (error) {
        addToast({ type: 'error', message: 'No pude cargar los gastos para esta vista' })
        setLoading(false)
        return
      }

      setView(
        buildCriticalView((data || []) as OpportunityExpense[], selectedMonth, {
          customGroups: currentHousehold.settings?.category_groups,
        })
      )
      setLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [currentHousehold?.id, selectedMonth, currentHousehold?.settings?.category_groups])

  const currency = currentHousehold?.currency || 'CLP'
  const topLeak = view?.opportunities[0]

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-3xl font-bold">Oportunidades</h1>
        <p className="text-muted-foreground mt-1">
          Dónde se va la plata en {formatMonth(selectedMonth)} y dónde hay chance de bajar:
          por hábito (demanda) o cotizando mejor (precio).
        </p>
      </div>

      {loading || !view ? (
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((item) => (
            <Card key={item}>
              <CardContent className="p-6">
                <div className="h-20 bg-muted animate-pulse rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Gastado este mes</CardDescription>
                <CardTitle className="text-2xl">{formatCurrency(view.monthSpent, currency)}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Promedio 3 meses: {formatCurrency(view.avgMonthlySpent, currency)}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Ahorro posible al mes</CardDescription>
                <CardTitle className="text-2xl text-emerald-700">
                  {formatCurrency(view.totalOpportunity, currency)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Estimado, si tomas las oportunidades de abajo. No es un presupuesto nuevo.
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Fuga más grande</CardDescription>
                <CardTitle className="text-xl">{topLeak?.title || 'Sin fugas claras'}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {topLeak
                  ? `${kindLabel(topLeak.kind)} · ${formatCurrency(topLeak.monthlySavings, currency)} al mes`
                  : 'Cuando haya más gastos confirmados, acá aparece el primer recorte.'}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Dónde se va</CardTitle>
                <CardDescription>Por tipo de gasto, este mes.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {view.groups.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No hay gastos confirmados en {formatMonth(selectedMonth)}. Mira{' '}
                    <Link href="/app/expenses" className="underline">
                      Gastos
                    </Link>
                    .
                  </p>
                ) : (
                  view.groups.map((group) => (
                    <div key={group.key} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{group.label}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {formatCurrency(group.amount, currency)} · {Math.round(group.share * 100)}%
                        </span>
                      </div>
                      <Progress value={Math.min(100, group.share * 100)} />
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Comercios que más pesan</CardTitle>
                <CardDescription>Nombre tal como llegó el cargo.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {view.merchants.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin comercios este mes.</p>
                ) : (
                  view.merchants.map((merchant) => (
                    <div key={merchant.key} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
                      <div>
                        <p className="font-medium">{merchant.label}</p>
                        <p className="text-xs text-muted-foreground">{merchant.count} cargo{merchant.count === 1 ? '' : 's'}</p>
                      </div>
                      <span className="tabular-nums">{formatCurrency(merchant.amount, currency)}</span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-3">
            <div>
              <h2 className="text-xl font-semibold">Qué puedes hacer</h2>
              <p className="text-sm text-muted-foreground">
                Demanda = pedir menos o planificar. Precio = el mismo servicio, más barato.
              </p>
            </div>
            {view.opportunities.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  Todavía no hay un patrón claro de ahorro en estos meses. Confirma gastos y vuelve.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {view.opportunities.map((item) => (
                  <Card key={item.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={item.kind === 'price' ? 'secondary' : 'default'}>
                          {item.kind === 'price' ? (
                            <Tag className="h-3 w-3 mr-1" />
                          ) : (
                            <ShoppingCart className="h-3 w-3 mr-1" />
                          )}
                          {kindLabel(item.kind)}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          confianza {item.confidence}
                        </Badge>
                      </div>
                      <CardTitle className="text-base leading-snug">{item.title}</CardTitle>
                      <CardDescription className="text-emerald-700 font-medium">
                        {formatCurrency(item.monthlySavings, currency)} al mes si lo haces
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <p>{item.why}</p>
                      <p className="font-medium">{item.action}</p>
                      <ul className="text-muted-foreground space-y-1">
                        {item.evidence.map((line) => (
                          <li key={line}>· {line}</li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <Card className="border-dashed">
            <CardContent className="p-4 text-sm flex flex-col sm:flex-row sm:items-center gap-3">
              <Lightbulb className="h-5 w-5 shrink-0 text-amber-600" />
              <p className="flex-1 text-muted-foreground">
                Los montos de ahorro son una guía, no una promesa. El de precio (VTR, streaming)
                hay que cotizarlo; el de demanda lo controlas tú la próxima compra.
              </p>
              <Button asChild variant="outline" size="sm">
                <Link href="/app/expenses">
                  <TrendingDown className="h-4 w-4 mr-1" />
                  Ir a Gastos
                </Link>
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
