export type ParsedCuota = {
  index: number
  total: number
}

export type StatementRow = {
  id: string
  date: string
  amount: number
  description: string
  merchant?: string | null
}

export type ExistingExpenseLite = {
  id: string
  amount: number
  expense_date: string
  merchant: string | null
  description: string | null
  installment_group_id?: string | null
  installment_index?: number | null
  installment_total?: number | null
}

export type ReviewVerdict =
  | 'new'
  | 'new_installment'
  | 'duplicate'
  | 'maybe_duplicate'
  | 'missing_month'

export type ReviewAction = 'skip' | 'one' | 'series' | 'attach' | 'extend'

export type StatementReview = {
  row: StatementRow
  cuota: ParsedCuota | null
  verdict: ReviewVerdict
  action: ReviewAction
  selected: boolean
  reason: string
  match?: ExistingExpenseLite
  group?: ExistingExpenseLite[]
}

function fold(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function addMonthsToDate(isoDate: string, delta: number): string {
  const [year, month, day] = isoDate.slice(0, 10).split('-').map(Number)
  const date = new Date(year, month - 1 + delta, Math.min(day || 1, 28))
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function parseCuotaFromText(text: string): ParsedCuota | null {
  const raw = String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  const patterns = [
    /cuota\s*(\d{1,2})\s*(?:de|\/)\s*(\d{1,2})/,
    /c(?:uota)?\.?\s*(\d{1,2})\s*\/\s*(\d{1,2})/,
    /(\d{1,2})\s*de\s*(\d{1,2})\s*cuotas?/,
    /inst(?:alment|alacion)?\s*(\d{1,2})\s*\/\s*(\d{1,2})/,
    /cuota\s*(\d{1,2})\s+(\d{1,2})/,
  ]
  for (const pattern of patterns) {
    const match = raw.match(pattern)
    if (!match) continue
    const index = Number(match[1])
    const total = Number(match[2])
    if (index >= 1 && total >= 2 && index <= total && total <= 60) {
      return { index, total }
    }
  }
  return null
}

export function displayNameOf(row: { merchant?: string | null; description?: string | null }): string {
  return (row.merchant || row.description || '').trim()
}

function tokens(value: string) {
  return fold(value)
    .split(' ')
    .filter((item) => item.length >= 3 && !['cuota', 'compra', 'pago', 'chile', 'santiago'].includes(item))
}

function similarName(a: string, b: string): boolean {
  const left = fold(a)
  const right = fold(b)
  if (!left || !right) return false
  if (left === right) return true
  if (left.includes(right) || right.includes(left)) return true
  const aTokens = tokens(a)
  const bTokens = tokens(b)
  if (aTokens.length === 0 || bTokens.length === 0) return false
  const overlap = aTokens.filter((item) => bTokens.includes(item)).length
  return overlap >= 1 && overlap / Math.min(aTokens.length, bTokens.length) >= 0.5
}

export function amountsClose(a: number, b: number): boolean {
  const diff = Math.abs(a - b)
  return diff <= 600 || diff / Math.max(a, b, 1) <= 0.03
}

function daysBetween(a: string, b: string): number {
  const left = new Date(`${a.slice(0, 10)}T12:00:00`)
  const right = new Date(`${b.slice(0, 10)}T12:00:00`)
  return Math.abs((left.getTime() - right.getTime()) / 86_400_000)
}

function monthOf(iso: string) {
  return iso.slice(0, 7)
}

export function monthsBetween(from: string, to: string): number {
  const [yearFrom, monthFrom] = from.slice(0, 7).split('-').map(Number)
  const [yearTo, monthTo] = to.slice(0, 7).split('-').map(Number)
  return (yearTo - yearFrom) * 12 + (monthTo - monthFrom)
}

export function buildInstallmentPayloads<T extends Record<string, unknown>>(base: T, options: {
  startDate: string
  startIndex: number
  total: number
  groupId: string
  principal: number
}): Array<T & {
  expense_date: string
  installment_group_id: string
  installment_index: number
  installment_total: number
  installment_principal: number
}> {
  const rows = []
  for (let index = options.startIndex; index <= options.total; index += 1) {
    rows.push({
      ...base,
      expense_date: addMonthsToDate(options.startDate, index - options.startIndex),
      installment_group_id: options.groupId,
      installment_index: index,
      installment_total: options.total,
      installment_principal: options.principal,
    })
  }
  return rows
}

function reviewOneRow(row: StatementRow, existing: ExistingExpenseLite[]): StatementReview {
    const cuota = parseCuotaFromText(`${row.description} ${row.merchant || ''}`)
    const name = displayNameOf(row)

    const exact = existing.find(
      (item) =>
        amountsClose(item.amount, row.amount) &&
        daysBetween(item.expense_date, row.date) <= 4 &&
        similarName(displayNameOf(item), name)
    )
    if (exact) {
      const related = existing.filter((item) =>
        exact.installment_group_id
          ? item.installment_group_id === exact.installment_group_id
          : item.id === exact.id
      )
      const knownTotal = exact.installment_total || cuota?.total || null
      const lastIndex = Math.max(...related.map((item) => item.installment_index || 1))
      if (cuota && !exact.installment_group_id) {
        return {
          row,
          cuota,
          verdict: 'missing_month' as const,
          action: 'extend' as const,
          selected: true,
          reason: `Este mes ya está como gasto único. La cartola dice cuota ${cuota.index}/${cuota.total}: no lo cargo de nuevo y completo los meses que faltan.`,
          match: exact,
          group: related,
        }
      }
      if (knownTotal && lastIndex < knownTotal) {
        return {
          row,
          cuota,
          verdict: 'missing_month' as const,
          action: 'extend' as const,
          selected: true,
          reason: `Este mes ya está. La compra va hasta ${knownTotal} cuotas y ahora tienes hasta la ${lastIndex}. Completo las que faltan.`,
          match: exact,
          group: related,
        }
      }
      return {
        row,
        cuota,
        verdict: 'duplicate' as const,
        action: 'skip' as const,
        selected: false,
        reason: `Ya está: ${displayNameOf(exact)} el ${exact.expense_date.slice(0, 10)}. No lo vuelvas a cargar.`,
        match: exact,
        group: related,
      }
    }

    const maybe = existing.find(
      (item) =>
        amountsClose(item.amount, row.amount) &&
        daysBetween(item.expense_date, row.date) <= 10 &&
        similarName(displayNameOf(item), name)
    )
    if (maybe && !cuota) {
      return {
        row,
        cuota,
        verdict: 'maybe_duplicate' as const,
        action: 'skip' as const,
        selected: false,
        reason: `Parece el mismo gasto que ${displayNameOf(maybe)} (${maybe.expense_date.slice(0, 10)}). Revisa antes de cargar.`,
        match: maybe,
      }
    }

    const group = existing.filter(
      (item) =>
        item.installment_group_id &&
        amountsClose(item.amount, row.amount) &&
        similarName(displayNameOf(item), name)
    )
    if (group.length > 0) {
      const sameMonth = group.find((item) => monthOf(item.expense_date) === monthOf(row.date))
      if (sameMonth) {
        return {
          row,
          cuota,
          verdict: 'duplicate' as const,
          action: 'skip' as const,
          selected: false,
          reason: `Esta cuota ${sameMonth.installment_index}/${sameMonth.installment_total} ya está en ${monthOf(row.date)}.`,
          match: sameMonth,
          group,
        }
      }
      const sample = group[0]
      return {
        row,
        cuota,
        verdict: 'missing_month' as const,
        action: 'attach' as const,
        selected: true,
        reason: `Ya tienes “${displayNameOf(sample)}” en cuotas (${sample.installment_index}/${sample.installment_total}). Falta este mes: súmalo a la misma compra.`,
        match: sample,
        group,
      }
    }

    const oneOff = existing.find(
      (item) =>
        !item.installment_group_id &&
        amountsClose(item.amount, row.amount) &&
        similarName(displayNameOf(item), name) &&
        monthOf(item.expense_date) !== monthOf(row.date)
    )
    if (cuota && oneOff) {
      return {
        row,
        cuota,
        verdict: 'missing_month' as const,
        action: 'attach' as const,
        selected: true,
        reason: `Ya tienes “${displayNameOf(oneOff)}” el ${oneOff.expense_date.slice(0, 10)} como gasto único. Esta cartola es cuota ${cuota.index}/${cuota.total}: súmalo a esa compra.`,
        match: oneOff,
        group: [oneOff],
      }
    }

    if (cuota) {
      return {
        row,
        cuota,
        verdict: 'new_installment' as const,
        action: 'series' as const,
        selected: true,
        reason: `La cartola dice cuota ${cuota.index}/${cuota.total}. Cargo esta y dejo las que faltan en los meses que correspondan.`,
      }
    }

    return {
      row,
      cuota,
      verdict: 'new' as const,
      action: 'one' as const,
      selected: true,
      reason: 'Gasto nuevo. No aparece en SpendPlan.',
    }
}

export function reviewStatementRows(
  incoming: StatementRow[],
  existing: ExistingExpenseLite[]
): StatementReview[] {
  const claimedMatchIds = new Set<string>()
  const coveredSeries: Array<{ name: string; amount: number; from: number; total: number }> = []
  const reviews: StatementReview[] = []

  for (const row of incoming) {
    let review = reviewOneRow(row, existing)
    const name = displayNameOf(row)

    const alreadyCovered = coveredSeries.find(
      (series) =>
        amountsClose(series.amount, row.amount) &&
        similarName(series.name, name) &&
        review.cuota &&
        review.cuota.index >= series.from &&
        review.cuota.index <= series.total
    )
    if (alreadyCovered && review.action !== 'skip') {
      review = {
        ...review,
        verdict: 'duplicate',
        action: 'skip',
        selected: false,
        reason: `Esta cuota ya queda cubierta al cargar la serie ${alreadyCovered.from}/${alreadyCovered.total} de esta cartola.`,
      }
    }

    if (
      (review.action === 'extend' || review.action === 'attach' || review.action === 'series') &&
      review.match &&
      claimedMatchIds.has(review.match.id)
    ) {
      review = {
        ...review,
        verdict: 'duplicate',
        action: 'skip',
        selected: false,
        reason: `Esta cuota ya queda cubierta al completar “${displayNameOf(review.match)}”.`,
      }
    }

    if (review.action === 'extend' || review.action === 'attach') {
      if (review.match) claimedMatchIds.add(review.match.id)
      const total = review.cuota?.total || review.match?.installment_total
      const from = review.cuota?.index || review.match?.installment_index || 1
      if (total) coveredSeries.push({ name, amount: row.amount, from, total })
    }
    if (review.action === 'series' && review.cuota) {
      coveredSeries.push({
        name,
        amount: row.amount,
        from: review.cuota.index,
        total: review.cuota.total,
      })
    }

    reviews.push(review)
  }

  return reviews
}

export function installmentLabel(index?: number | null, total?: number | null) {
  if (!index || !total) return null
  return `Cuota ${index}/${total}`
}

export type ImportExpenseBase = {
  household_id: string
  amount: number
  description: string
  merchant: string
  expense_date: string
  source: 'csv_import'
  status: 'confirmed'
  created_by: string
}

export type ImportMutation = {
  update?: {
    id: string
    patch: {
      installment_group_id: string
      installment_index: number
      installment_total: number
      installment_principal: number
    }
  }
  rows: Array<
    ImportExpenseBase & {
      installment_group_id?: string
      installment_index?: number
      installment_total?: number
      installment_principal?: number
    }
  >
  attached: boolean
}

export function planImportMutation(item: StatementReview, base: ImportExpenseBase): ImportMutation {
  if (item.action === 'skip') return { rows: [], attached: false }
  if (item.action === 'one') return { rows: [base], attached: false }

  const match = item.match
  const cuota = item.cuota
  const groupExpenses = item.group || (match ? [match] : [])
  const used = new Set(
    groupExpenses
      .map((expense) => expense.installment_index)
      .filter((value): value is number => typeof value === 'number' && value >= 1)
  )

  if (item.action === 'series' && cuota) {
    const groupId = match?.installment_group_id || crypto.randomUUID()
    const principal = base.amount * cuota.total
    let update: ImportMutation['update']
    if (match && !match.installment_group_id) {
      const inferred = Math.max(1, cuota.index - monthsBetween(match.expense_date, item.row.date))
      used.add(inferred)
      update = {
        id: match.id,
        patch: {
          installment_group_id: groupId,
          installment_index: inferred,
          installment_total: cuota.total,
          installment_principal: principal,
        },
      }
    }
    const rows = buildInstallmentPayloads(base, {
      startDate: item.row.date,
      startIndex: cuota.index,
      total: cuota.total,
      groupId,
      principal,
    }).filter((row) => !used.has(row.installment_index))
    return { update, rows, attached: Boolean(update) }
  }

  if ((item.action === 'attach' || item.action === 'extend') && match) {
    const groupId = match.installment_group_id || crypto.randomUUID()
    const total = cuota?.total || match.installment_total || 2
    const incomingIndex =
      cuota?.index ||
      (match.installment_index || 1) + Math.max(1, monthsBetween(match.expense_date, item.row.date))
    const matchIndex =
      match.installment_index ||
      Math.max(1, incomingIndex - monthsBetween(match.expense_date, item.row.date))
    const principal = base.amount * total
    const update =
      !match.installment_group_id || !match.installment_total
        ? {
            id: match.id,
            patch: {
              installment_group_id: groupId,
              installment_index: matchIndex,
              installment_total: total,
              installment_principal: principal,
            },
          }
        : undefined
    used.add(matchIndex)

    const rows: ImportMutation['rows'] = []
    const thisMonthMissing =
      item.action === 'attach' &&
      monthOf(match.expense_date) !== monthOf(item.row.date) &&
      !used.has(incomingIndex)
    if (thisMonthMissing) {
      rows.push({
        ...base,
        installment_group_id: groupId,
        installment_index: incomingIndex,
        installment_total: total,
        installment_principal: principal,
      })
      used.add(incomingIndex)
    }

    if (item.action === 'extend') {
      const start = Math.max(matchIndex, incomingIndex)
      for (let index = start + 1; index <= total; index += 1) {
        if (used.has(index)) continue
        rows.push({
          ...base,
          expense_date: addMonthsToDate(item.row.date, index - incomingIndex),
          installment_group_id: groupId,
          installment_index: index,
          installment_total: total,
          installment_principal: principal,
        })
      }
    }

    return { update, rows, attached: true }
  }

  return { rows: [base], attached: false }
}
