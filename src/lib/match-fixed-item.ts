export type FixedPlanItem = {
  id: string
  name: string
  amount: number
  category_id: string | null
}

export type FixedAdjustment = {
  status: 'proposed' | 'accepted' | 'rejected'
  budget_item_id: string
  item_name: string
  previous_amount: number
  new_amount: number
  reason: string
}

const ALIASES: Array<{ names: string[]; needles: string[] }> = [
  { names: ['luz'], needles: ['luz', 'enel', 'chilectra', 'cge', 'electricidad'] },
  { names: ['agua'], needles: ['agua', 'aguas andinas'] },
  { names: ['gas'], needles: ['metrogas', 'lipigas', 'abastible'] },
  { names: ['vtr', 'internet', 'fibra'], needles: ['vtr', 'movistar', 'entel hogar', 'mundo', 'gttd', 'fibra'] },
  { names: ['gasto comun', 'gastos comunes'], needles: ['gasto comun', 'gastos comunes', 'comunidad'] },
  { names: ['hipotecario', 'hipoteca', 'dividendo'], needles: ['hipotecario', 'hipoteca', 'dividendo'] },
  { names: ['jardin', 'jardin infantil'], needles: ['jardin', 'sala cuna', 'colegio'] },
  { names: ['rosa', 'previred', 'nana'], needles: ['rosa', 'previred', 'nana', 'asesora'] },
]

function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokens(value: string): string[] {
  return fold(value)
    .split(' ')
    .filter((token) => token.length >= 3 && !['con', 'por', 'una', 'los', 'las', 'del', 'pago'].includes(token))
}

export function amountCloseEnough(planned: number, actual: number, loose = false): boolean {
  if (planned <= 0 || actual <= 0) return false
  const delta = Math.abs(actual - planned)
  const pct = loose
    ? planned >= 200_000
      ? 0.12
      : 0.2
    : planned >= 200_000
      ? 0.06
      : 0.12
  const floor = loose ? 8_000 : 5_000
  return delta <= Math.max(planned * pct, floor)
}

function aliasScore(itemName: string, text: string): number {
  const foldedName = fold(itemName)
  const foldedText = fold(text)
  for (const group of ALIASES) {
    if (!group.names.some((name) => foldedName.includes(name))) continue
    if (group.needles.some((needle) => foldedText.includes(needle))) return 4
  }
  return 0
}

export function matchFixedBudgetItem(
  actualAmount: number | null,
  text: string,
  items: FixedPlanItem[],
  looseAmount = false
): FixedPlanItem | null {
  if (!actualAmount || items.length === 0) return null
  const hay = new Set(tokens(text))
  let best: { item: FixedPlanItem; score: number } | null = null

  for (const item of items) {
    if (!amountCloseEnough(item.amount, actualAmount, looseAmount)) continue
    const nameTokens = tokens(item.name)
    const overlap = nameTokens.filter(
      (token) => hay.has(token) || [...hay].some((h) => h.includes(token) || token.includes(h))
    )
    let score = overlap.length * 3
    const foldedName = fold(item.name)
    const foldedText = fold(text)
    if (foldedName && foldedText.includes(foldedName)) score += 5
    score += aliasScore(item.name, text)
    if (score === 0) continue
    if (!best || score > best.score) best = { item, score }
  }

  return best && best.score >= 3 ? best.item : null
}

export function buildFixedAdjustment(
  item: FixedPlanItem,
  actualAmount: number,
  reason: string
): FixedAdjustment {
  const previous = Math.round(item.amount)
  const next = Math.round(actualAmount)
  const delta = next - previous
  const deltaText =
    delta === 0
      ? 'El monto coincide con el presupuesto.'
      : `El cargo ${delta > 0 ? 'subió' : 'bajó'} $${Math.abs(delta).toLocaleString('es-CL')} respecto del fijo.`
  return {
    status: 'proposed',
    budget_item_id: item.id,
    item_name: item.name,
    previous_amount: previous,
    new_amount: next,
    reason: [reason, deltaText].filter(Boolean).join(' '),
  }
}

export function isProposedAdjustment(value: unknown): value is FixedAdjustment {
  if (!value || typeof value !== 'object') return false
  const row = value as FixedAdjustment
  return row.status === 'proposed' && Boolean(row.budget_item_id) && Boolean(row.item_name)
}

export function isAcceptedFixedSettlement(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  return (value as FixedAdjustment).status === 'accepted'
}

export function settlesFixedPlan(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const status = (value as FixedAdjustment).status
  return status === 'proposed' || status === 'accepted'
}
