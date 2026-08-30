'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useHousehold } from '@/hooks/use-household'
import { useSelectedMonth } from '@/hooks/use-selected-month'
import { useToast } from '@/components/ui/toast'
import { supabaseBrowser } from '@/lib/supabase'
import {
  buildCriticalView,
  expenseDisplayName,
  expenseGroupName,
  expenseMerchantKey,
  type CriticalView,
  type OpportunityExpense,
} from '@/lib/savings-opportunities'
import { cn, formatCurrency, formatDate, formatMonth, getMonthDateRange } from '@/lib/utils'
import type { SavingsOpportunity } from '@/types'
import { ArrowDown, ArrowUp, ArrowUpDown, Lightbulb, ShoppingCart, Tag, TrendingDown, X } from 'lucide-react'

type DrillFocus = { type: 'group' | 'merchant'; key: string; label: string }
type DetailSortKey = 'date' | 'merchant' | 'category' | 'amount'
type DetailFilters = { date: string; merchant: string; category: string; amount: string }

const EMPTY_FILTERS: DetailFilters = { date: 'all', merchant: 'all', category: 'all', amount: '' }

function foldText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function categoryLabel(row: OpportunityExpense) {
  return row.category?.name || row.category_name || 'Sin categoría'
}

function matchesAmount(amount: number, query: string) {
  const raw = query.trim()
  if (!raw) return true
  const parsed = raw.match(/^(>=|<=|>|<)?\s*\$?\s*(.+)$/)
  const op = parsed?.[1] || ''
  const numberPart = (parsed?.[2] || raw).replace(/\./g, '').replace(',', '.')
  const target = Number(numberPart)
  if (!Number.isFinite(target)) return foldText(String(amount)).includes(foldText(raw))
  if (op === '>') return amount > target
  if (op === '>=') return amount >= target
  if (op === '<') return amount < target
  if (op === '<=') return amount <= target
  const digits = String(Math.round(amount)).replace(/\D/g, '')
  const queryDigits = raw.replace(/\D/g, '')
  return amount === target || (queryDigits.length > 0 && digits.includes(queryDigits))
}

function uniqueSorted(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'))
}

function SortHeader({
  label,
  active,
  dir,
  align = 'left',
  onClick,
}: {
  label: string
  active: boolean
  dir: 'asc' | 'desc'
  align?: 'left' | 'right'
  onClick: () => void
}) {
  const Icon = active ? (dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 font-medium',
        align === 'right' && 'ml-auto',
        active && 'text-foreground'
      )}
    >
      {label}
      <Icon className={cn('h-3 w-3', active ? 'text-emerald-700' : 'text-muted-foreground')} />
    </button>
  )
}

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
  const [focus, setFocus] = useState<DrillFocus | null>(null)
  const [sortKey, setSortKey] = useState<DetailSortKey>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [filters, setFilters] = useState<DetailFilters>(EMPTY_FILTERS)
  const detailRef = useRef<HTMLDivElement>(null)

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
        .select('id, amount, merchant, description, expense_date, category_id, status, ai_adjustment, category:categories!expenses_category_id_fkey(name)')
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

  useEffect(() => {
    setFocus(null)
    setFilters(EMPTY_FILTERS)
    setSortKey('date')
    setSortDir('desc')
  }, [currentHousehold?.id, selectedMonth])

  const currency = currentHousehold?.currency || 'CLP'
  const topLeak = view?.opportunities[0]
  const customGroups = currentHousehold?.settings?.category_groups

  const sourceRows = useMemo(() => {
    if (!view || !focus) return []
    return focus.type === 'group'
      ? view.monthRows.filter((row) => expenseGroupName(row, customGroups) === focus.key)
      : view.monthRows.filter((row) => expenseMerchantKey(row) === focus.key)
  }, [view, focus, customGroups])

  const dateOptions = useMemo(
    () =>
      uniqueSorted(sourceRows.map((row) => row.expense_date)).map((value) => ({
        value,
        label: formatDate(`${value}T12:00:00`),
      })),
    [sourceRows]
  )
  const merchantOptions = useMemo(
    () => uniqueSorted(sourceRows.map((row) => expenseDisplayName(row))),
    [sourceRows]
  )
  const categoryOptions = useMemo(
    () => uniqueSorted(sourceRows.map((row) => categoryLabel(row))),
    [sourceRows]
  )

  const filtersActive =
    filters.date !== 'all' ||
    filters.merchant !== 'all' ||
    filters.category !== 'all' ||
    filters.amount.trim() !== ''

  const detailRows = useMemo(() => {
    const next = sourceRows.filter((row) => {
      if (filters.date !== 'all' && row.expense_date !== filters.date) return false
      if (filters.merchant !== 'all' && expenseDisplayName(row) !== filters.merchant) return false
      if (filters.category !== 'all' && categoryLabel(row) !== filters.category) return false
      if (!matchesAmount(Number(row.amount) || 0, filters.amount)) return false
      return true
    })
    const dir = sortDir === 'asc' ? 1 : -1
    next.sort((a, b) => {
      if (sortKey === 'amount') return ((Number(a.amount) || 0) - (Number(b.amount) || 0)) * dir
      if (sortKey === 'date') return String(a.expense_date).localeCompare(String(b.expense_date)) * dir
      if (sortKey === 'merchant') return expenseDisplayName(a).localeCompare(expenseDisplayName(b), 'es') * dir
      return categoryLabel(a).localeCompare(categoryLabel(b), 'es') * dir
    })
    return next
  }, [sourceRows, filters, sortKey, sortDir])

  const detailTotal = detailRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0)

  function toggleFocus(next: DrillFocus) {
    setFocus((current) =>
      current && current.type === next.type && current.key === next.key ? null : next
    )
    setFilters(EMPTY_FILTERS)
    setSortKey('date')
    setSortDir('desc')
  }

  function toggleSort(key: DetailSortKey) {
    if (sortKey === key) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDir(key === 'merchant' || key === 'category' ? 'asc' : 'desc')
  }

  useEffect(() => {
    if (focus) {
      detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [focus])

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
                <CardDescription>Clic en una barra para ver los gastos de ese tipo.</CardDescription>
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
                  view.groups.map((group) => {
                    const active = focus?.type === 'group' && focus.key === group.key
                    return (
                      <button
                        key={group.key}
                        type="button"
                        onClick={() => toggleFocus({ type: 'group', key: group.key, label: group.label })}
                        className={cn(
                          'w-full rounded-lg px-2 py-1.5 text-left space-y-1 transition-colors',
                          active ? 'bg-emerald-50 ring-1 ring-emerald-200' : 'hover:bg-muted/70'
                        )}
                      >
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">{group.label}</span>
                          <span className="tabular-nums text-muted-foreground">
                            {formatCurrency(group.amount, currency)} · {Math.round(group.share * 100)}%
                          </span>
                        </div>
                        <Progress value={Math.min(100, group.share * 100)} />
                      </button>
                    )
                  })
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Comercios que más pesan</CardTitle>
                <CardDescription>Clic en un comercio para ver sus cargos.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1">
                {view.merchants.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin comercios este mes.</p>
                ) : (
                  view.merchants.map((merchant) => {
                    const active = focus?.type === 'merchant' && focus.key === merchant.key
                    return (
                      <button
                        key={merchant.key}
                        type="button"
                        onClick={() =>
                          toggleFocus({ type: 'merchant', key: merchant.key, label: merchant.label })
                        }
                        className={cn(
                          'flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm transition-colors',
                          active ? 'bg-emerald-50 ring-1 ring-emerald-200' : 'hover:bg-muted/70'
                        )}
                      >
                        <div>
                          <p className="font-medium">{merchant.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {merchant.count} cargo{merchant.count === 1 ? '' : 's'}
                          </p>
                        </div>
                        <span className="tabular-nums">{formatCurrency(merchant.amount, currency)}</span>
                      </button>
                    )
                  })
                )}
              </CardContent>
            </Card>
          </div>

          <div ref={detailRef}>
            {focus ? (
              <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                  <div>
                    <CardTitle>Dentro de {focus.label}</CardTitle>
                    <CardDescription>
                      {filtersActive
                        ? `${detailRows.length} de ${sourceRows.length} gasto${sourceRows.length === 1 ? '' : 's'}`
                        : `${sourceRows.length} gasto${sourceRows.length === 1 ? '' : 's'}`}{' '}
                      de {formatMonth(selectedMonth)}. Ordena o filtra cada columna.
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {filtersActive ? (
                      <Button type="button" variant="outline" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
                        Limpiar filtros
                      </Button>
                    ) : null}
                    <Button type="button" variant="ghost" size="sm" onClick={() => setFocus(null)}>
                      <X className="h-4 w-4 mr-1" />
                      Cerrar
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {sourceRows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No hay cargos en este recorte.</p>
                  ) : (
                    <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="h-9">
                            <SortHeader
                              label="Fecha"
                              active={sortKey === 'date'}
                              dir={sortDir}
                              onClick={() => toggleSort('date')}
                            />
                          </TableHead>
                          <TableHead className="h-9">
                            <SortHeader
                              label="Comercio"
                              active={sortKey === 'merchant'}
                              dir={sortDir}
                              onClick={() => toggleSort('merchant')}
                            />
                          </TableHead>
                          <TableHead className="h-9">
                            <SortHeader
                              label="Categoría"
                              active={sortKey === 'category'}
                              dir={sortDir}
                              onClick={() => toggleSort('category')}
                            />
                          </TableHead>
                          <TableHead className="h-9 text-right">
                            <SortHeader
                              label="Monto"
                              active={sortKey === 'amount'}
                              dir={sortDir}
                              align="right"
                              onClick={() => toggleSort('amount')}
                            />
                          </TableHead>
                        </TableRow>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="pb-3 pt-0 font-normal">
                            <Select
                              value={filters.date}
                              onValueChange={(value) => setFilters((current) => ({ ...current, date: value }))}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Todas" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">Todas las fechas</SelectItem>
                                {dateOptions.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableHead>
                          <TableHead className="pb-3 pt-0 font-normal">
                            <Select
                              value={filters.merchant}
                              onValueChange={(value) => setFilters((current) => ({ ...current, merchant: value }))}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Todos" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">Todos los comercios</SelectItem>
                                {merchantOptions.map((option) => (
                                  <SelectItem key={option} value={option}>
                                    {option}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableHead>
                          <TableHead className="pb-3 pt-0 font-normal">
                            <Select
                              value={filters.category}
                              onValueChange={(value) => setFilters((current) => ({ ...current, category: value }))}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Todas" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">Todas las categorías</SelectItem>
                                {categoryOptions.map((option) => (
                                  <SelectItem key={option} value={option}>
                                    {option}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableHead>
                          <TableHead className="pb-3 pt-0 font-normal">
                            <Input
                              value={filters.amount}
                              onChange={(event) =>
                                setFilters((current) => ({ ...current, amount: event.target.value }))
                              }
                              placeholder="Ej: >20000"
                              className="h-8 text-xs text-right"
                            />
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detailRows.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                              Ningún gasto con estos filtros.
                            </TableCell>
                          </TableRow>
                        ) : (
                          detailRows.map((row, index) => (
                          <TableRow key={row.id || `${row.expense_date}-${index}`}>
                            <TableCell className="whitespace-nowrap">
                              {formatDate(`${row.expense_date}T12:00:00`)}
                            </TableCell>
                            <TableCell>
                              <p className="font-medium">{expenseDisplayName(row)}</p>
                              {row.description && row.merchant && row.description !== row.merchant ? (
                                <p className="text-xs text-muted-foreground">{row.description}</p>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {categoryLabel(row)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatCurrency(Number(row.amount) || 0, currency)}
                            </TableCell>
                          </TableRow>
                          ))
                        )}
                      </TableBody>
                      <TableFooter>
                        <TableRow>
                          <TableCell colSpan={3}>{filtersActive ? 'Total filtrado' : 'Total'}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatCurrency(detailTotal, currency)}
                          </TableCell>
                        </TableRow>
                      </TableFooter>
                    </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : null}
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
