import { createOpenAI } from '@ai-sdk/openai'
import { generateText } from 'ai'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PaymentMethod } from '@/types'
import { GROQ_MODEL } from '@/lib/ai/groq-model'
import {
  amountCloseEnough,
  buildFixedAdjustment,
  matchFixedBudgetItem,
  type FixedAdjustment,
  type FixedPlanItem,
} from '@/lib/match-fixed-item'
import {
  defaultExpenseDate,
  parseBankEmail,
  type ParsedBankEmail,
} from '@/lib/parse-bank-email'

export type BankEmailKind = 'fixed' | 'variable' | 'unbudgeted' | 'ignore'

export type AnalyzedBankEmail = ParsedBankEmail & {
  kind: BankEmailKind
  category_id: string | null
  category_name: string | null
  budget_item_id: string | null
  budget_item_name: string | null
  adjustment: FixedAdjustment | null
  reason: string
  source: 'groq' | 'rules'
}

const APPLY_CATEGORY_MIN = 0.75
const GROQ_TIMEOUT_MS = 8000

function todayInSantiago(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function monthFromDate(isoDate: string): string {
  return isoDate.slice(0, 7)
}

function extractJson(text: string): Record<string, unknown> | null {
  const trimmed = String(text || '').trim()
  const fenced = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const start = fenced.indexOf('{')
  const end = fenced.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(fenced.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    return null
  }
}

function isPaymentMethod(value: string): value is PaymentMethod {
  return ['cash', 'debit', 'credit', 'transfer', 'unknown'].includes(value)
}

function isKind(value: string): value is BankEmailKind {
  return ['fixed', 'variable', 'unbudgeted', 'ignore'].includes(value)
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('groq_timeout')), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}

function rulesFallback(parsed: ParsedBankEmail, reason: string): AnalyzedBankEmail {
  return {
    ...parsed,
    kind: parsed.amount ? 'unbudgeted' : 'ignore',
    category_id: null,
    category_name: null,
    budget_item_id: null,
    budget_item_name: null,
    adjustment: null,
    reason,
    source: 'rules',
  }
}

async function loadHouseholdContext(
  supabase: SupabaseClient,
  householdId: string,
  month: string
) {
  const start = `${month}-01`
  const [year, monthNum] = month.split('-').map(Number)
  const endExclusive = new Date(year, monthNum, 1).toISOString().slice(0, 10)

  const [categoriesRes, budgetRes, recentRes] = await Promise.all([
    supabase
      .from('categories')
      .select('id, name')
      .or(`household_id.eq.${householdId},is_system.eq.true`)
      .eq('is_active', true)
      .order('sort_order'),
    supabase
      .from('budget_items')
      .select('id, name, kind, type, amount, category_id, is_active, start_date, end_date, is_indefinite')
      .eq('household_id', householdId)
      .eq('kind', 'expense'),
    supabase
      .from('expenses')
      .select('merchant, description, amount, category_id')
      .eq('household_id', householdId)
      .eq('status', 'confirmed')
      .order('expense_date', { ascending: false })
      .limit(20),
  ])

  const categories = (categoriesRes.data || []) as Array<{ id: string; name: string }>
  const categoryName = new Map(categories.map((c) => [c.id, c.name]))

  const isActiveThisMonth = (item: {
    is_active?: boolean | null
    start_date?: string | null
    end_date?: string | null
    is_indefinite?: boolean | null
  }) => {
    if (item.is_active === false) return false
    if (item.start_date && item.start_date >= endExclusive) return false
    if (!item.is_indefinite && item.end_date && item.end_date < start) return false
    return true
  }

  const plan = (budgetRes.data || [])
    .filter(isActiveThisMonth)
    .map((item) => ({
      id: item.id as string,
      name: item.name as string,
      type: item.type as 'fixed' | 'variable',
      amount: Number(item.amount) || 0,
      category_id: (item.category_id as string | null) || null,
      category_name: item.category_id ? categoryName.get(item.category_id as string) || null : null,
    }))

  const recent = (recentRes.data || []).map((row) => ({
    merchant: row.merchant,
    description: row.description,
    amount: Number(row.amount) || 0,
    category_name: row.category_id ? categoryName.get(row.category_id as string) || null : null,
  }))

  return { categories, plan, recent }
}

async function analyzeWithGroq(input: {
  subject: string | null
  body: string
  rules: ParsedBankEmail
  categories: Array<{ id: string; name: string }>
  plan: Array<{
    id: string
    name: string
    type: 'fixed' | 'variable'
    amount: number
    category_id: string | null
    category_name: string | null
  }>
  recent: Array<{
    merchant: string | null
    description: string | null
    amount: number
    category_name: string | null
  }>
  today: string
}): Promise<AnalyzedBankEmail | null> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return null

  const groq = createOpenAI({
    apiKey,
    baseURL: 'https://api.groq.com/openai/v1',
  })

  const body = input.body.slice(0, 6000)
  const prompt = `Eres el clasificador de correos bancarios de SpendPlan (hogar en Chile, CLP).
Responde SOLO JSON válido.

HOY (America/Santiago): ${input.today}

ASUNTO:
${input.subject || '(sin asunto)'}

CUERPO:
${body || '(vacío)'}

LECTURA POR REGLAS (puede estar mal; tú mandas si hay duda):
${JSON.stringify({
    amount: input.rules.amount,
    merchant: input.rules.merchant,
    date: input.rules.expense_date,
    payment_method: input.rules.payment_method,
  })}

PLAN DEL HOGAR ESTE MES (gastos):
${input.plan.length ? input.plan.map((item) =>
  `- ${item.type.toUpperCase()} | id:${item.id} | ${item.name} | $${item.amount} | categoría: ${item.category_name || 'ninguna'} | category_id: ${item.category_id || 'null'}`
).join('\n') : '(sin ítems)'}

CATEGORÍAS VÁLIDAS (usa solo estos category_id):
${input.categories.map((c) => `- ${c.id}: ${c.name}`).join('\n')}

GASTOS RECIENTES CONFIRMADOS (para imitar hábitos):
${input.recent.length ? input.recent.map((row) =>
  `- ${row.merchant || row.description || 'gasto'} $${row.amount} → ${row.category_name || 'sin categoría'}`
).join('\n') : '(ninguno)'}

Decide:
1. ¿Es un GASTO REAL? Compra, cargo, pago, transferencia enviada, consumo. 
   NO es gasto: saldo, cupo, deuda, pago mínimo, confirmación de Gmail/Google, marketing, extracto sin cargo nuevo.
2. Si es gasto, extrae monto entero CLP (en Chile 12.990 = 12990). No uses saldo ni cupo.
3. Clasifica contra el plan:
   - fixed: es UNO de los FIJOS (luz, agua, hipoteca, jardín, rosa, gasto común…). El monto puede variar un poco.
   - variable: encaja en una categoría VARIABLE de este mes.
   - unbudgeted: es gasto, pero no está en el plan.
   - ignore: no es un gasto a registrar.
4. Si kind=fixed, devuelve budget_item_id del FIJO. category_id de ese ítem.
5. Si el monto del cargo ≠ monto del fijo, igual es fixed: en reason explica el ajuste.

Formato exacto:
{"is_expense":true,"kind":"variable","amount":12990,"merchant":"Jumbo","description":"Compra Jumbo","expense_date":"2026-08-29","payment_method":"debit","category_id":null,"budget_item_id":null,"budget_item_name":null,"confidence":0.0,"reason":"frase corta"}
`

  const { text } = await withTimeout(
    generateText({
      model: groq(GROQ_MODEL),
      system: 'Responde únicamente en JSON válido, sin markdown.',
      prompt,
      temperature: 0.1,
      maxTokens: 400,
    }),
    GROQ_TIMEOUT_MS
  )

  const parsed = extractJson(text)
  if (!parsed) return null

  const isExpense = parsed.is_expense !== false
  const kindRaw = String(parsed.kind || (isExpense ? 'unbudgeted' : 'ignore'))
  const kind: BankEmailKind = isKind(kindRaw) ? kindRaw : isExpense ? 'unbudgeted' : 'ignore'
  const amount = Number(parsed.amount)
  const hasAmount = Number.isFinite(amount) && amount >= 100 && amount <= 99_000_000
  const confidence = Math.max(0, Math.min(1, Number(parsed.confidence ?? 0.5)))
  const categoryId = parsed.category_id ? String(parsed.category_id) : null
  const category = categoryId ? input.categories.find((c) => c.id === categoryId) : null
  const paymentRaw = String(parsed.payment_method || input.rules.payment_method || 'unknown')
  const dateRaw = parsed.expense_date ? String(parsed.expense_date) : null
  const dateOk = dateRaw && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : input.rules.expense_date

  if (kind === 'ignore' || !isExpense) {
    return {
      amount: null,
      merchant: null,
      description: null,
      expense_date: null,
      payment_method: 'unknown',
      confidence,
      kind: 'ignore',
      category_id: null,
      category_name: null,
      budget_item_id: null,
      budget_item_name: null,
      adjustment: null,
      reason: String(parsed.reason || 'No parece un gasto'),
      source: 'groq',
    }
  }

  if (!hasAmount && !input.rules.amount) return null

  return {
    amount: hasAmount ? Math.round(amount) : input.rules.amount,
    merchant: parsed.merchant ? String(parsed.merchant).trim() : input.rules.merchant,
    description: parsed.description
      ? String(parsed.description).trim()
      : input.rules.description,
    expense_date: dateOk,
    payment_method: isPaymentMethod(paymentRaw) ? paymentRaw : input.rules.payment_method,
    confidence,
    kind,
    category_id: category?.id || null,
    category_name: category?.name || null,
    budget_item_id: parsed.budget_item_id ? String(parsed.budget_item_id) : null,
    budget_item_name: parsed.budget_item_name ? String(parsed.budget_item_name) : null,
    adjustment: null,
    reason: String(parsed.reason || 'Sugerencia Groq'),
    source: 'groq',
  }
}

function attachFixedAdjustment(
  analyzed: AnalyzedBankEmail,
  plan: Array<{
    id: string
    name: string
    type: 'fixed' | 'variable'
    amount: number
    category_id: string | null
    category_name: string | null
  }>
): AnalyzedBankEmail {
  if (!analyzed.amount) return analyzed
  const fixedItems: FixedPlanItem[] = plan
    .filter((item) => item.type === 'fixed')
    .map((item) => ({
      id: item.id,
      name: item.name,
      amount: item.amount,
      category_id: item.category_id,
    }))

  const hay = `${analyzed.merchant || ''} ${analyzed.description || ''} ${analyzed.budget_item_name || ''}`
  const byId = analyzed.budget_item_id
    ? fixedItems.find((item) => item.id === analyzed.budget_item_id)
    : null
  const byName = analyzed.budget_item_name
    ? fixedItems.find((item) => item.name.toLowerCase() === analyzed.budget_item_name!.toLowerCase())
    : null
  const groqItem =
    byId && amountCloseEnough(byId.amount, analyzed.amount, true)
      ? byId
      : byName && amountCloseEnough(byName.amount, analyzed.amount, true)
        ? byName
        : null
  const fuzzy = matchFixedBudgetItem(analyzed.amount, hay, fixedItems)
  const item = groqItem || fuzzy
  if (!item) return analyzed

  const planRow = plan.find((row) => row.id === item.id)

  return {
    ...analyzed,
    kind: 'fixed',
    budget_item_id: item.id,
    budget_item_name: item.name,
    category_id: analyzed.category_id || item.category_id,
    category_name: analyzed.category_name || planRow?.category_name || null,
    adjustment: buildFixedAdjustment(item, analyzed.amount, analyzed.reason),
  }
}

export function shouldApplyCategory(analyzed: AnalyzedBankEmail): boolean {
  if (analyzed.adjustment && analyzed.category_id) return true
  return Boolean(
    analyzed.category_id &&
      analyzed.kind !== 'ignore' &&
      analyzed.confidence >= APPLY_CATEGORY_MIN
  )
}

export function isUnbudgetedKind(analyzed: AnalyzedBankEmail): boolean {
  if (analyzed.adjustment) return false
  if (analyzed.kind === 'variable' && shouldApplyCategory(analyzed)) return false
  if (analyzed.kind === 'fixed' && shouldApplyCategory(analyzed)) return false
  return true
}

export async function analyzeBankEmail(
  supabase: SupabaseClient,
  householdId: string,
  input: { subject?: string | null; text?: string | null; html?: string | null }
): Promise<AnalyzedBankEmail> {
  const rules = parseBankEmail(input)
  const today = todayInSantiago()
  const month = monthFromDate(rules.expense_date || today)

  try {
    const context = await loadHouseholdContext(supabase, householdId, month)
    const analyzed = await analyzeWithGroq({
      subject: input.subject || null,
      body: input.text || '',
      rules,
      ...context,
      today,
    })
    if (analyzed) return attachFixedAdjustment(analyzed, context.plan)
    return attachFixedAdjustment(
      rulesFallback(
        rules,
        'Groq no devolvió una lectura clara; revisé el plan de fijos por si el cargo coincide'
      ),
      context.plan
    )
  } catch (error) {
    console.error('analyzeBankEmail Groq failed', error)
  }

  return rulesFallback(
    rules,
    process.env.GROQ_API_KEY
      ? 'Groq no pudo leer el correo; quedó como no presupuestado para que lo revises'
      : 'Sin Groq: quedó pendiente para que lo clasifiques'
  )
}

export { defaultExpenseDate }
