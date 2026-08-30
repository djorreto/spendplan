import { categoryGroupName } from '@/lib/category-taxonomy'
import { settlesFixedPlan } from '@/lib/match-fixed-item'
import type { SavingsOpportunity } from '@/types'

export type OpportunityExpense = {
  id?: string
  amount: number
  merchant: string | null
  description: string | null
  expense_date: string
  category_name?: string | null
  category_id?: string | null
  category?: { name?: string | null } | null
  status?: string
  ai_adjustment?: unknown
}

export type SpendSlice = {
  key: string
  label: string
  amount: number
  count: number
  share: number
}

export type CriticalView = {
  month: string
  monthsAnalyzed: string[]
  monthSpent: number
  avgMonthlySpent: number
  groups: SpendSlice[]
  merchants: SpendSlice[]
  monthRows: OpportunityExpense[]
  opportunities: SavingsOpportunity[]
  totalOpportunity: number
}

type ClusterKind = 'delivery' | 'supermarket' | 'telecom' | 'streaming' | 'taxi' | 'other'

function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function shiftMonth(month: string, delta: number): string {
  const [year, monthNum] = month.split('-').map(Number)
  const date = new Date(year, monthNum - 1 + delta, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function monthOf(expense: OpportunityExpense): string {
  return String(expense.expense_date || '').slice(0, 7)
}

function categoryNameOf(expense: OpportunityExpense): string | null {
  return expense.category_name || expense.category?.name || null
}

export function expenseDisplayName(expense: OpportunityExpense): string {
  return (expense.merchant || expense.description || categoryNameOf(expense) || 'Gasto').trim()
}

export function expenseGroupName(
  expense: OpportunityExpense,
  customGroups?: Record<string, string>
): string {
  return categoryGroupName(categoryNameOf(expense), customGroups, expense.category_id)
}

export function expenseMerchantKey(expense: OpportunityExpense): string {
  return fold(expenseDisplayName(expense))
}

function clusterOf(expense: OpportunityExpense): { key: string; label: string; kind: ClusterKind } {
  const name = expenseDisplayName(expense)
  const category = categoryNameOf(expense) || ''
  const text = fold(`${name} ${category}`)

  if (
    /uber\s*eats|rappi|pedidos\s*ya|cornershop|justo\b/.test(text) ||
    fold(category) === 'delivery'
  ) {
    return { key: 'delivery', label: 'Delivery (Uber Eats y similares)', kind: 'delivery' }
  }
  if (/jumbo|lider|unimarc|tottus|santa isabel|supermercado/.test(text) || fold(category) === 'supermercado') {
    return { key: 'supermarket', label: 'Supermercado', kind: 'supermarket' }
  }
  if (/\bvtr\b/.test(text)) {
    return { key: 'vtr', label: 'VTR', kind: 'telecom' }
  }
  if (/movistar|entel hogar|mundo fibra|\bgtd\b|wom hogar|fibra/.test(text)) {
    return { key: 'telecom', label: name, kind: 'telecom' }
  }
  if (/netflix|disney|hbo|\bmax\b|spotify|zapping|prime video|youtube premium|apple tv/.test(text)) {
    return { key: 'streaming', label: 'Streaming (Netflix, Zapping…)', kind: 'streaming' }
  }
  if ((/\buber\b|cabify|\bdidi\b/.test(text) && !/eats/.test(text)) || fold(category) === 'transporte') {
    if (/\buber\b|cabify|\bdidi\b/.test(text)) {
      return { key: 'taxi', label: 'Uber / taxis', kind: 'taxi' }
    }
  }
  return { key: fold(name).slice(0, 48) || 'otro', label: name, kind: 'other' }
}

function toSlices(
  rows: Array<{ key: string; label: string; amount: number; count: number }>,
  total: number
): SpendSlice[] {
  return rows
    .filter((row) => row.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .map((row) => ({
      ...row,
      share: total > 0 ? row.amount / total : 0,
    }))
}

function monthsInWindow(endMonth: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => shiftMonth(endMonth, -(count - 1 - index)))
}

export function buildCriticalView(
  expenses: OpportunityExpense[],
  month: string,
  options?: { customGroups?: Record<string, string> }
): CriticalView {
  const monthsAnalyzed = monthsInWindow(month, 3)
  const confirmed = expenses.filter(
    (row) => (row.status || 'confirmed') === 'confirmed' && !settlesFixedPlan(row.ai_adjustment)
  )
  const windowRows = confirmed.filter((row) => monthsAnalyzed.includes(monthOf(row)))
  const monthRows = windowRows.filter((row) => monthOf(row) === month)
  const activeMonths = new Set(windowRows.map(monthOf))
  const monthCount = Math.max(activeMonths.size, 1)

  const monthSpent = monthRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0)
  const windowSpent = windowRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0)
  const avgMonthlySpent = windowSpent / monthCount

  const groupMap = new Map<string, { amount: number; count: number }>()
  const merchantMap = new Map<string, { label: string; amount: number; count: number }>()
  const clusterMonth = new Map<string, Map<string, { amount: number; count: number; label: string; kind: ClusterKind }>>()

  for (const row of monthRows) {
    const group = categoryGroupName(categoryNameOf(row), options?.customGroups, row.category_id)
    const current = groupMap.get(group) || { amount: 0, count: 0 }
    current.amount += Number(row.amount) || 0
    current.count += 1
    groupMap.set(group, current)

    const shown = expenseDisplayName(row)
    const merchant = merchantMap.get(fold(shown)) || { label: shown, amount: 0, count: 0 }
    merchant.amount += Number(row.amount) || 0
    merchant.count += 1
    merchantMap.set(fold(shown), merchant)
  }

  for (const row of windowRows) {
    const cluster = clusterOf(row)
    const byMonth = clusterMonth.get(cluster.key) || new Map()
    const current = byMonth.get(monthOf(row)) || { amount: 0, count: 0, label: cluster.label, kind: cluster.kind }
    current.amount += Number(row.amount) || 0
    current.count += 1
    byMonth.set(monthOf(row), current)
    clusterMonth.set(cluster.key, byMonth)
  }

  const groups = toSlices(
    [...groupMap.entries()].map(([key, value]) => ({ key, label: key, ...value })),
    monthSpent
  )
  const merchants = toSlices(
    [...merchantMap.entries()].map(([key, value]) => ({ key, ...value })),
    monthSpent
  ).slice(0, 8)

  const avgCluster = (key: string) => {
    const byMonth = clusterMonth.get(key)
    if (!byMonth) return { amount: 0, count: 0, label: key, kind: 'other' as ClusterKind }
    let amount = 0
    let count = 0
    let label = key
    let kind: ClusterKind = 'other'
    for (const value of byMonth.values()) {
      amount += value.amount
      count += value.count
      label = value.label
      kind = value.kind
    }
    return { amount: amount / monthCount, count: count / monthCount, label, kind }
  }

  const opportunities: SavingsOpportunity[] = []
  const delivery = avgCluster('delivery')
  const supermarket = avgCluster('supermarket')
  const vtr = avgCluster('vtr')
  const streaming = avgCluster('streaming')
  const taxi = avgCluster('taxi')
  const food = delivery.amount + supermarket.amount
  const thisDelivery = clusterMonth.get('delivery')?.get(month)
  const thisSuper = clusterMonth.get('supermarket')?.get(month)

  if (delivery.amount >= 80_000 || delivery.count >= 6) {
    const share = food > 0 ? delivery.amount / food : 1
    const save = Math.round(delivery.amount * 0.4)
    opportunities.push({
      id: 'demand-delivery',
      kind: 'demand',
      title: 'Delivery te está saliendo más caro que el súper',
      why:
        share >= 0.25
          ? `En los últimos ${monthCount} meses el delivery se lleva ${Math.round(share * 100)}% de la comida (súper + apps).`
          : `Pides delivery unas ${Math.round(delivery.count)} veces al mes, ~$${Math.round(delivery.amount).toLocaleString('es-CL')} promedio.`,
      action:
        'Baja a 4 pedidos al mes y el resto al supermercado. El markup de la app + el envío es el ahorro.',
      monthlySavings: save,
      confidence: share >= 0.3 || delivery.count >= 8 ? 'alta' : 'media',
      evidence: [
        `Promedio delivery: $${Math.round(delivery.amount).toLocaleString('es-CL')} · ${delivery.count.toFixed(1)} pedidos/mes`,
        supermarket.amount > 0
          ? `Promedio supermercado: $${Math.round(supermarket.amount).toLocaleString('es-CL')}`
          : 'Casi no aparece supermercado al lado del delivery.',
        thisDelivery
          ? `Este mes: ${thisDelivery.count} pedidos por $${Math.round(thisDelivery.amount).toLocaleString('es-CL')}`
          : 'Este mes aún no hay delivery registrado.',
      ],
    })
  }

  if (supermarket.amount >= 350_000) {
    const save = Math.round(supermarket.amount * 0.12)
    opportunities.push({
      id: 'demand-supermarket',
      kind: 'demand',
      title: 'El supermercado está alto: alcanza con planificar',
      why: `Promedias $${Math.round(supermarket.amount).toLocaleString('es-CL')} al mes en súper. Sin lista se infla el carro (ofertas, “ya que estoy”).`,
      action:
        'Una o dos compras grandes a la semana, lista hecha en casa, y menos visitas de relleno. 10–15% menos es realista.',
      monthlySavings: save,
      confidence: supermarket.amount >= 500_000 ? 'alta' : 'media',
      evidence: [
        `Promedio súper: $${Math.round(supermarket.amount).toLocaleString('es-CL')}/mes`,
        thisSuper
          ? `Este mes: $${Math.round(thisSuper.amount).toLocaleString('es-CL')} en ${thisSuper.count} compras`
          : 'Este mes aún no hay compras de súper.',
      ],
    })
  }

  if (vtr.amount >= 32_000) {
    const fiberTarget = 25_000
    const save = Math.max(0, Math.round(vtr.amount - fiberTarget))
    opportunities.push({
      id: 'price-vtr',
      kind: 'price',
      title: 'VTR se ve caro para lo que hay hoy en fibra',
      why: `Estás pagando ~$${Math.round(vtr.amount).toLocaleString('es-CL')} al mes. En Chile un plan solo fibra suele estar entre $17 y $30 mil; el pack TV+internet de cable se va fácil sobre $40 mil.`,
      action:
        'Cotiza Mundo, GTD o Movistar Fibra. Si no usan el pack de TV, suéltalo. No es un precio en vivo: es para que compares.',
      monthlySavings: save,
      confidence: vtr.amount >= 40_000 ? 'alta' : 'media',
      evidence: [
        `Cargo típico VTR: $${Math.round(vtr.amount).toLocaleString('es-CL')}/mes`,
        'Referencia 2026: fibra 600–900 Mbps ~$17–30 mil; pack TV+cable suele ser más.',
      ],
    })
  }

  if (streaming.amount >= 22_000) {
    opportunities.push({
      id: 'price-streaming',
      kind: 'price',
      title: 'Varias plataformas de streaming a la vez',
      why: `Zapping, Netflix y similares suman ~$${Math.round(streaming.amount).toLocaleString('es-CL')} al mes. Casi nunca se usan todas.`,
      action: 'Deja una o dos. Rota el resto por temporadas.',
      monthlySavings: Math.round(streaming.amount * 0.35),
      confidence: 'media',
      evidence: [`Promedio streaming: $${Math.round(streaming.amount).toLocaleString('es-CL')}/mes`],
    })
  }

  if (taxi.amount >= 40_000 || taxi.count >= 8) {
    opportunities.push({
      id: 'demand-taxi',
      kind: 'demand',
      title: 'Uber se está comiendo el transporte',
      why: `~${taxi.count.toFixed(1)} viajes al mes por $${Math.round(taxi.amount).toLocaleString('es-CL')}.`,
      action: 'Junta recados, usa un viaje compartido o deja 2–3 viajes de “por flojera”.',
      monthlySavings: Math.round(taxi.amount * 0.3),
      confidence: 'media',
      evidence: [`Promedio Uber/taxis: $${Math.round(taxi.amount).toLocaleString('es-CL')}/mes`],
    })
  }

  const topGroup = groups[0]
  if (topGroup && topGroup.share >= 0.35 && topGroup.key === 'Alimentación' && !opportunities.some((item) => item.id.startsWith('demand-'))) {
    opportunities.push({
      id: 'demand-food-mix',
      kind: 'demand',
      title: 'La comida es el mayor agujero del mes',
      why: `Alimentación se lleva ${Math.round(topGroup.share * 100)}% de lo gastado este mes.`,
      action: 'Separa súper, delivery y restorán. El delivery es el primero que recortar.',
      monthlySavings: Math.round(topGroup.amount * 0.1),
      confidence: 'media',
      evidence: [`Este mes en alimentación: $${Math.round(topGroup.amount).toLocaleString('es-CL')}`],
    })
  }

  opportunities.sort((a, b) => b.monthlySavings - a.monthlySavings)
  const top = opportunities.slice(0, 6)
  return {
    month,
    monthsAnalyzed,
    monthSpent,
    avgMonthlySpent,
    groups,
    merchants,
    monthRows,
    opportunities: top,
    totalOpportunity: top.reduce((sum, item) => sum + item.monthlySavings, 0),
  }
}
