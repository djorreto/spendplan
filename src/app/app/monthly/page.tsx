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
import { Edit2, ChevronLeft, ChevronRight } from 'lucide-react'

type Frequency = 'monthly' | 'weekly' | 'biweekly' | 'yearly' | 'one_time'

function isItemActiveByDate(item: BudgetItem, referenceDate: Date = new Date()): boolean {
  const startDate = new Date(item.start_date)

  if (item.frequency === 'one_time') {
    const itemMonth = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`
    const refMonth = `${referenceDate.getFullYear()}-${String(referenceDate.getMonth() + 1).padStart(2, '0')}`
    return itemMonth === refMonth
  }

  if (referenceDate < startDate) return false

  if (!item.is_indefinite && item.end_date) {
    const endDate = new Date(item.end_date)
    endDate.setMonth(endDate.getMonth() + 1)
    endDate.setDate(0)
    if (referenceDate > endDate) return false
  }

  return true
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
  const [expandedVariables, setExpandedVariables] = useState<Set<string>>(new Set())
  const [editItem, setEditItem] = useState<BudgetItem | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [editName, setEditName] = useState('')
  const [editAmount, setEditAmount] = useState('')
  const [editFrequency, setEditFrequency] = useState<Frequency>('monthly')
  const [editStartDate, setEditStartDate] = useState('')
  const [editEndDate, setEditEndDate] = useState('')
  const [editIndefinite, setEditIndefinite] = useState(true)

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
    const startIdx = Math.max(anchorIdx - Math.floor((tableMonths - 1) / 2), 0)
    return Array.from({ length: tableMonths }, (_, i) => monthToString(startIdx + i).slice(0, 7))
  }, [tableAnchorMonth, tableMonths])

  const shiftTableWindow = (delta: number) => {
    const nextIdx = monthIndex(tableAnchorMonth) + delta
    setTableAnchorMonth(monthToString(Math.max(nextIdx, 0)).slice(0, 7))
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
    setEditAmount(String(item.amount ?? ''))
    setEditFrequency(item.frequency as Frequency)
    setEditStartDate(item.start_date?.slice(0, 10) || '')
    setEditEndDate(item.end_date?.slice(0, 10) || '')
    setEditIndefinite(!!item.is_indefinite)
    setEditOpen(true)
  }

  const saveInlineEdit = async () => {
    if (!editItem) return
    if (!currentHousehold && !isDemoMode) return
    setEditSaving(true)
    const supabase = supabaseBrowser()
    const op = startOp('monthly.inlineEdit', { id: editItem.id })
    try {
      const amountNum = Number(editAmount)
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
      const ym = String(e.expense_date || '').slice(0, 7)
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

  const monthlySummary = useMemo(() => {
    const summary: Record<string, { income: number; fixed: number; varBudget: number; varSpent: number; unbudgeted: number; balance: number; balancePlanned: number }> = {}
    monthsWindow.forEach((ym) => {
      const refDate = new Date(`${ym}-15`)
      const income = budgetItems
        .filter(i => i.kind === 'income')
        .reduce((sum, i) => sum + (isItemActiveByDate(i, refDate) ? getMonthlyAmount(i) : 0), 0)
      const fixed = budgetItems
        .filter(i => i.kind === 'expense' && i.type === 'fixed')
        .reduce((sum, i) => sum + (isItemActiveByDate(i, refDate) ? getMonthlyAmount(i) : 0), 0)
      const varBudget = budgetItems
        .filter(i => i.kind === 'expense' && i.type === 'variable')
        .reduce((sum, i) => sum + (isItemActiveByDate(i, refDate) ? getMonthlyAmount(i) : 0), 0)
      const monthExpenses = expensesByMonth.get(ym) || []
      const varSpent = monthExpenses
        .filter((e) => e.category_id && variableCategoryIds.has(e.category_id))
        .reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
      const unbudgeted = monthExpenses
        .filter((e) => e.is_unbudgeted || !e.category_id || !variableCategoryIds.has(e.category_id))
        .reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
      const balance = income - fixed - varSpent - unbudgeted
      const balancePlanned = income - fixed - varBudget
      summary[ym] = { income, fixed, varBudget, varSpent, unbudgeted, balance, balancePlanned }
    })
    return summary
  }, [monthsWindow, budgetItems, expensesByMonth, variableCategoryIds])

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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[140px] sm:min-w-[180px] text-xs sm:text-sm">Ítem</TableHead>
                {monthsWindow.map((ym) => (
                  <TableHead key={ym} className="text-right whitespace-nowrap text-xs sm:text-sm">
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
                    const active = isItemActiveByDate(item, new Date(`${ym}-15`))
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
                    const active = isItemActiveByDate(item, new Date(`${ym}-15`))
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
                      const active = isItemActiveByDate(item, new Date(`${ym}-15`))
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
                          .filter((e) => e.category_id === item.category_id && String(e.expense_date).startsWith(ym))
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
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => router.push(`/app/expenses?edit=${exp.id}`)}
                                        aria-label="Editar gasto"
                                      >
                                        <Edit2 className="h-4 w-4" />
                                      </Button>
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
                <Input type="number" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} />
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
