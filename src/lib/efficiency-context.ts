import { resolveEfficiencyTopic, type EfficiencyTopic } from '@/lib/efficiency-playbooks'
import { expenseDisplayName, type OpportunityExpense } from '@/lib/savings-opportunities'

export type EfficiencyMerchant = { label: string; amount: number; count: number }

export type TopicSpend = {
  thisMonth: number
  avgMonthly: number
  countThisMonth: number
  merchants: EfficiencyMerchant[]
  sampleNames: string[]
}

export type FixedPlanHint = { name: string; amount: number }

export type EfficiencyHouseholdContext = {
  householdName: string
  memberCount: number
  month: string
  currency: string
  topic: EfficiencyTopic
  opportunity?: {
    id: string
    title: string
    why: string
    action: string
    monthlySavings: number
    evidence: string[]
  } | null
  spend: TopicSpend
  fixedPlan: FixedPlanHint[]
}

function fold(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function monthOf(expense: OpportunityExpense): string {
  return String(expense.expense_date || '').slice(0, 7)
}

function rowMatchesTopic(row: OpportunityExpense, topic: EfficiencyTopic): boolean {
  const resolved = resolveEfficiencyTopic({
    merchant: row.merchant,
    category: row.category?.name || row.category_name,
    text: [row.merchant, row.description, row.category?.name].filter(Boolean).join(' '),
  })
  if (topic === 'other') return true
  if (topic === 'restaurants') {
    return resolved === 'restaurants' || fold(row.category?.name || row.category_name || '') === 'restaurantes'
  }
  if (topic === 'supermarket') {
    return resolved === 'supermarket' || fold(row.category?.name || row.category_name || '') === 'supermercado'
  }
  return resolved === topic
}

function fixedMatchesTopic(name: string, topic: EfficiencyTopic): boolean {
  return resolveEfficiencyTopic({ merchant: name, text: name }) === topic || fold(name).includes(topicLabelHint(topic))
}

function topicLabelHint(topic: EfficiencyTopic): string {
  if (topic === 'water') return 'agua'
  if (topic === 'electricity') return 'luz'
  if (topic === 'gas') return 'gas'
  if (topic === 'internet') return 'internet'
  return topic
}

export function buildTopicSpend(
  expenses: OpportunityExpense[],
  topic: EfficiencyTopic,
  month: string
): TopicSpend {
  const months = new Set<string>()
  let windowAmount = 0
  let thisMonth = 0
  let countThisMonth = 0
  const merchantMap = new Map<string, EfficiencyMerchant>()

  for (const row of expenses) {
    if ((row.status || 'confirmed') === 'cancelled') continue
    const ym = monthOf(row)
    if (!ym) continue
    if (!rowMatchesTopic(row, topic)) continue
    // Keep accepted fijos: for utilities they ARE the bill.
    const amount = Number(row.amount) || 0
    months.add(ym)
    windowAmount += amount
    if (ym === month) {
      thisMonth += amount
      countThisMonth += 1
      const label = expenseDisplayName(row)
      const current = merchantMap.get(fold(label)) || { label, amount: 0, count: 0 }
      current.amount += amount
      current.count += 1
      merchantMap.set(fold(label), current)
    }
  }

  const monthCount = Math.max(months.size, 1)
  const merchants = [...merchantMap.values()].sort((a, b) => b.amount - a.amount).slice(0, 8)
  return {
    thisMonth,
    avgMonthly: windowAmount / monthCount,
    countThisMonth,
    merchants,
    sampleNames: merchants.map((item) => item.label),
  }
}

export function filterFixedForTopic(items: FixedPlanHint[], topic: EfficiencyTopic): FixedPlanHint[] {
  return items.filter((item) => fixedMatchesTopic(item.name, topic))
}

export function formatEfficiencyContext(context: EfficiencyHouseholdContext): string {
  const clp = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`
  const lines = [
    `Hogar: ${context.householdName}`,
    `Personas registradas en SpendPlan: ${context.memberCount} (puede haber niños u otros no registrados; pregúntalo)`,
    `Mes: ${context.month}`,
    `Moneda: ${context.currency}`,
    `Tema: ${context.topic}`,
    `Gasto del tema este mes: ${clp(context.spend.thisMonth)} · ${context.spend.countThisMonth} cargos`,
    `Promedio del tema en la ventana cargada: ${clp(context.spend.avgMonthly)}`,
  ]
  if (context.spend.merchants.length) {
    lines.push(
      'Comercios del tema este mes:',
      ...context.spend.merchants.map(
        (item) => `  - ${item.label}: ${clp(item.amount)} (${item.count} cargo${item.count === 1 ? '' : 's'})`
      )
    )
  }
  if (context.fixedPlan.length) {
    lines.push(
      'Ítems fijos del plan que calzan:',
      ...context.fixedPlan.map((item) => `  - ${item.name}: ${clp(item.amount)} / mes`)
    )
  }
  if (context.opportunity) {
    lines.push(
      `Oportunidad de la vista crítica: ${context.opportunity.title}`,
      context.opportunity.why,
      `Ahorro estimado en la tarjeta: ${clp(context.opportunity.monthlySavings)}`,
      ...context.opportunity.evidence.map((line) => `  · ${line}`)
    )
  }
  return lines.join('\n')
}

export function playbookToPrompt(playbook: {
  marketUpdated: string
  marketSource: string
  questions: string[]
  offers: Array<{
    provider: string
    plan: string
    promoPrice: number
    promoMonths: number
    regularPrice: number
    speedMbps?: number
    notes: string
    contractUrl: string
    salesPhone?: string
  }>
  whoToCall: Array<{ name: string; phone?: string; url?: string; when: string }>
  cancelSteps: string[]
  habits: string[]
  sizing: string[]
}): string {
  const clp = (n: number) => `$${n.toLocaleString('es-CL')}`
  const offers = playbook.offers.length
    ? playbook.offers
        .map(
          (offer) =>
            `- ${offer.provider} · ${offer.plan}${offer.speedMbps ? ` · ${offer.speedMbps} Mbps` : ''}: promo ${clp(offer.promoPrice)} x ${offer.promoMonths} meses, luego ${clp(offer.regularPrice)}. ${offer.notes} Contratar: ${offer.contractUrl}${offer.salesPhone ? ` · ${offer.salesPhone}` : ''}`
        )
        .join('\n')
    : '(No hay planes de mercado que cambiar: el recorte es hábito o consumo.)'

  const calls = playbook.whoToCall
    .map((item) => `- ${item.name}${item.phone ? ` · ${item.phone}` : ''}${item.url ? ` · ${item.url}` : ''}: ${item.when}`)
    .join('\n')

  return [
    `Mercado actualizado: ${playbook.marketUpdated}`,
    `Fuente: ${playbook.marketSource}`,
    'Ofertas vigentes (no inventes precios más bajos que estos; si no está, dilo):',
    offers,
    'A quién / cómo contactar:',
    calls || '(Sin teléfonos: el plan de acción es hábito.)',
    'Cómo cortar o dejar el actual:',
    playbook.cancelSteps.map((step) => `- ${step}`).join('\n'),
    'Buenas prácticas:',
    playbook.habits.map((step) => `- ${step}`).join('\n'),
    'Dimensionar según personas:',
    playbook.sizing.map((step) => `- ${step}`).join('\n'),
    'Preguntas que debes resolver (una por turno, si aún no están):',
    playbook.questions.map((step, index) => `${index + 1}. ${step}`).join('\n'),
  ].join('\n\n')
}
