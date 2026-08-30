/**
 * ========================================
 * 📱 TELEGRAM WEBHOOK
 * ========================================
 * Recibe mensajes de Telegram y los procesa
 * Usa Supabase para persistencia
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createOpenAI } from '@ai-sdk/openai'
import { generateText } from 'ai'
import { GROQ_MODEL } from '@/lib/ai/groq-model'
import { 
  sendTelegramMessage, 
  answerTelegramCallbackQuery,
  editTelegramMessageReplyMarkup,
  editTelegramMessageText,
  parseExpenseFromText,
  formatExpenseResponse,
  type TelegramMessage 
} from '@/lib/telegram'

export const runtime = 'nodejs'

const TELEGRAM_SESSION_TIMEOUT_MS = 3 * 60 * 1000

type TelegramCallbackQuery = {
  id: string
  from: { id: number; username?: string }
  message?: { chat: { id: number }; message_id: number }
  data?: string
}

// Supabase client for server-side (uses service role to bypass RLS)
function getSupabase() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  
  console.log('🔑 Supabase config:', { 
    url: url?.substring(0, 30) + '...', 
    hasServiceKey: !!serviceKey,
    serviceKeyPrefix: serviceKey?.substring(0, 20) + '...',
    usingKey: serviceKey ? 'SERVICE_ROLE' : 'ANON'
  })
  
  return createClient(url!, serviceKey || anonKey!)
}

export async function POST(req: NextRequest) {
  try {
    const update = await req.json()
    
    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query as TelegramCallbackQuery)
    } else if (update.message) {
      await handleMessage(update.message)
    }
    
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Telegram webhook error:', error)
    return NextResponse.json({ ok: true })
  }
}

async function handleMessage(message: TelegramMessage) {
  const chatId = message.chat.id
  const odId = message.from.id
  const text = message.text || ''
  const supabase = getSupabase()
  
  // Check if user is linked
  const { data: link } = await supabase
    .from('telegram_links')
    .select('*')
    .eq('telegram_user_id', odId)
    .not('linked_at', 'is', null)
    .single()
  
  // Handle commands
  if (text.startsWith('/')) {
    await handleCommand(chatId, odId, text, link, message.from.username)
    return
  }
  
  // Conversational linking: allow sending code without /vincular
  if (!link) {
    const maybeCode = extractVerificationCode(text)
    if (maybeCode) {
      await handleVerification(chatId, odId, maybeCode, message.from.username)
      return
    }
    await sendTelegramMessage(
      chatId,
      '👋 ¡Hola! Soy el bot de SpendPlan.\n\n' +
        'Para usar este bot, primero debes vincular tu cuenta.\n\n' +
        '1️⃣ Ve a SpendPlan web → Configuración → Integraciones\n' +
        '2️⃣ Genera un código de vinculación\n' +
        '3️⃣ Envíame el código (o `/vincular CODIGO`)\n\n' +
        'Ejemplo: `ABC123`',
      { reply_markup: mainKeyboard(false) }
    )
    return
  }
  
  // Session reset: if inactivity > 3 min, treat next message as a fresh start
  const expired = isTelegramSessionExpired(link?.last_activity_at)
  if (expired) {
    // We keep it light: show menu/help and continue only if the user sent a clear actionable intent.
    const intent = detectIntent(text)
    if (intent === 'help' || intent === 'new_expense' || intent === 'link_help') {
      await sendTelegramMessage(
        chatId,
        '⏱️ Reinicié la conversación por inactividad.\n\n' +
          'Cuéntame qué necesitas (o toca un botón):',
        { reply_markup: mainKeyboard(true) }
      )
      await touchTelegramActivity(odId)
      return
    }
  }

  // Ensure household selection (multi-hogar)
  const ensuredLink = await ensureHouseholdSelection(chatId, odId, link)
  if (!ensuredLink) return

  if (text) {
    await handleConversationalText(chatId, odId, text, ensuredLink)
    await touchTelegramActivity(odId)
    return
  }
}

function normalizeText(s: string) {
  return String(s || '').trim()
}

function extractVerificationCode(text: string): string | null {
  const t = normalizeText(text).toUpperCase()
  // Accept either raw code or "vincular ABC123"
  const match = t.match(/\b([A-Z0-9]{6})\b/)
  return match ? match[1] : null
}

function currentMonthYYYYMM(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function mainKeyboard(isLinked: boolean) {
  if (!isLinked) {
    return {
      keyboard: [[{ text: '¿Cómo vinculo mi cuenta?' }]],
      resize_keyboard: true,
    }
  }
  return {
    keyboard: [
      [{ text: 'Resumen' }, { text: 'Balance' }],
      [{ text: 'Registrar gasto' }, { text: 'Últimos gastos' }],
      [{ text: 'Cambiar hogar' }],
    ],
    resize_keyboard: true,
  }
}

function detectIntent(
  text: string
): 'greeting' | 'help' | 'link_help' | 'balance' | 'summary' | 'recent' | 'new_expense' | 'expense_like' | 'ai' {
  const t = normalizeText(text).toLowerCase()
  if (!t) return 'help'
  if (/^(hola|holi|buenas|buenos d[ií]as|buenas tardes|buenas noches|hello|hi)\b/i.test(t)) return 'greeting'
  if (t.includes('vincul') || t.includes('codigo') || t.includes('código') || t.includes('config')) return 'link_help'
  if (/(balance|disponible|cu[aá]nto queda|queda|resta|plata)/i.test(t)) return 'balance'
  if (/(resumen|estado|c[oó]mo voy|seguimiento|insights|reporte)/i.test(t)) return 'summary'
  if (/(últimos|ultimos|recientes)/i.test(t)) return 'recent'
  if (/(registrar|anotar|agregar|cargar)\s+(un\s+)?gasto/i.test(t)) return 'new_expense'
  if (t.includes('cambiar hogar') || t.includes('cambiar de hogar')) return 'change_household'
  // if it has an amount, it's likely an expense
  if (/\d{3,}/.test(t) && /(\$|clp|mil|lucas)?/.test(t)) return 'expense_like'
  // default to AI for free-form budget questions
  return 'ai'
}

function isTelegramSessionExpired(lastActivityAt: unknown): boolean {
  if (!lastActivityAt) return false
  const ts = Date.parse(String(lastActivityAt))
  if (!Number.isFinite(ts)) return false
  return Date.now() - ts > TELEGRAM_SESSION_TIMEOUT_MS
}

type EnsureHouseholdOptions = {
  silentIfAlreadySelected?: boolean
}

/**
 * Ensure a household is selected for Telegram actions.
 * - If el usuario tiene un solo hogar, lo fija automáticamente.
 * - Si tiene varios, pide selección (inline keyboard) cuando no hay selección
 *   válida o cuando la sesión expiró, para evitar dudas de a qué hogar se
 *   aplican los gastos/consultas.
 */
async function ensureHouseholdSelection(
  chatId: number,
  telegramUserId: number,
  link: any,
  options: EnsureHouseholdOptions = {}
): Promise<{ household_id: string; user_id: string } | null> {
  if (!link) return null

  const { silentIfAlreadySelected = true } = options

  const supabase = getSupabase()
  const { data: memberships } = await supabase
    .from('household_memberships')
    .select('household_id, households(name)')
    .eq('user_id', link.user_id)
    .eq('is_active', true)

  const list = memberships || []
  if (list.length === 0) {
    await sendTelegramMessage(chatId, '❌ No tienes hogares activos en SpendPlan.', { reply_markup: mainKeyboard(true) })
    return null
  }

  if (list.length === 1) {
    const only = list[0]
    if (only.household_id !== link.household_id) {
      await supabase.from('telegram_links').update({ household_id: only.household_id }).eq('telegram_user_id', telegramUserId)
    }
    return { household_id: only.household_id, user_id: link.user_id }
  }

  const currentValid = list.some((m) => m.household_id === link.household_id)
  const shouldPrompt =
    !currentValid ||
    isTelegramSessionExpired(link.last_activity_at) ||
    !silentIfAlreadySelected

  if (!shouldPrompt && currentValid) {
    return { household_id: link.household_id, user_id: link.user_id }
  }

  await promptHouseholdSelection(chatId, link.household_id, list)
  return null
}

async function promptHouseholdSelection(
  chatId: number,
  currentHouseholdId: string | null,
  memberships: Array<{ household_id: string; households?: { name?: string } }>
) {
  const rows: any[][] = []
  for (let i = 0; i < memberships.length; i += 2) {
    const a = memberships[i]
    const b = memberships[i + 1]
    const row: any[] = [
      { text: a.households?.name || 'Hogar', callback_data: `hh:${a.household_id}` },
    ]
    if (b) row.push({ text: b.households?.name || 'Hogar', callback_data: `hh:${b.household_id}` })
    rows.push(row)
  }

  const currentName = memberships.find((m) => m.household_id === currentHouseholdId)?.households?.name
  await sendTelegramMessage(
    chatId,
    `🏠 Tienes varios hogares. Selecciona a cuál aplicar este chat.\n` +
      (currentName ? `Actual: ${currentName}\n` : '') +
      `Usaré el que elijas para gastos y consultas.`,
    { reply_markup: { inline_keyboard: rows } }
  )
}

async function touchTelegramActivity(telegramUserId: number) {
  const supabase = getSupabase()
  try {
    // Best-effort: if the column isn't present yet, ignore.
    await supabase
      .from('telegram_links')
      .update({ last_activity_at: new Date().toISOString() })
      .eq('telegram_user_id', telegramUserId)
  } catch {
    // ignore
  }
}

async function handleConversationalText(
  chatId: number,
  odId: number,
  text: string,
  link: { household_id: string; user_id: string }
) {
  const intent = detectIntent(text)

  if (intent === 'greeting') {
    await sendTelegramMessage(
      chatId,
      'Hola 👋\n' +
        'Puedo ayudarte con SpendPlan: registrar gastos y ver seguimiento del mes.\n\n' +
        'Toca un botón o escribe directo, por ejemplo: `12990 en Jumbo`.',
      { reply_markup: mainKeyboard(true) }
    )
    return
  }

  if (intent === 'new_expense') {
    await sendTelegramMessage(
      chatId,
      'Perfecto. Envíame el gasto así (un mensaje):\n' +
        '• `12990 en Jumbo`\n' +
        '• `8500 almuerzo crédito`\n' +
        '• `1500 chocolate de Varsovia`\n\n' +
        'Luego te pido *Confirmar* antes de guardarlo.',
      { reply_markup: mainKeyboard(true) }
    )
    return
  }

  if (intent === 'help') {
    await sendTelegramMessage(
      chatId,
      'Cuéntame qué necesitas:\n' +
        '• *Resumen* del mes\n' +
        '• *Balance* / seguimiento\n' +
        '• *Registrar gasto*\n\n' +
        'Tip: también puedes escribir directo un gasto (ej: `12990 en Jumbo`).',
      { reply_markup: mainKeyboard(true) }
    )
    return
  }

  if (intent === 'recent') {
    await sendTelegramMessage(chatId, 'Dame un segundo…', { reply_markup: mainKeyboard(true) })
    await sendRecentExpenses(chatId, link)
    return
  }

  if (intent === 'change_household') {
    await ensureHouseholdSelection(chatId, odId, link, { silentIfAlreadySelected: false })
    return
  }

  if (intent === 'balance' || intent === 'summary') {
    await sendTelegramMessage(chatId, 'Dame un segundo…', { reply_markup: mainKeyboard(true) })
    const month = currentMonthYYYYMM()
    const ctx = await buildMonthlyContext(link.household_id, month)
    if (!ctx) {
      await sendTelegramMessage(chatId, 'No pude cargar tu información todavía. Intenta de nuevo en 1 minuto.', {
        reply_markup: mainKeyboard(true),
      })
      return
    }
    if (intent === 'balance') {
      await sendTelegramMessage(chatId, formatBalanceMessage(ctx), { reply_markup: mainKeyboard(true) })
    } else {
      await sendTelegramMessage(chatId, formatSummaryMessage(ctx), { reply_markup: mainKeyboard(true) })
    }
    return
  }

  if (intent === 'expense_like') {
    await proposeExpenseForConfirmation(chatId, odId, text, link)
    return
  }

  // Fallback to AI with real financial context
  await analyzeWithAIWithContext(chatId, link, text)
}

type MonthlyContext = {
  month: string
  currency: string
  hasIncome: boolean
  totalIncome: number
  totalFixed: number
  totalVariableBudget: number
  totalVariableSpent: number
  totalUnbudgeted: number
  availableReal: number
  daysInMonth: number
  daysPassed: number
  topMerchants: Array<{ name: string; amount: number; count: number }>
}

async function buildMonthlyContext(householdId: string, month: string): Promise<MonthlyContext | null> {
  const supabase = getSupabase()
  const [yy, mm] = month.split('-').map(Number)
  const start = `${month}-01`
  const endExclusive = new Date(yy, mm, 1).toISOString().slice(0, 10)

  const { data: household } = await supabase.from('households').select('currency').eq('id', householdId).single()
  const currency = household?.currency || 'CLP'

  const [budgetResp, expensesResp] = await Promise.all([
    supabase
      .from('budget_items')
      .select('id, name, kind, type, amount, category_id, is_active, start_date, end_date, is_indefinite')
      .eq('household_id', householdId),
    supabase
      .from('expenses')
      .select('amount, description, merchant, expense_date, category_id, is_unbudgeted, status')
      .eq('household_id', householdId)
      .gte('expense_date', start)
      .lt('expense_date', endExclusive)
      .eq('status', 'confirmed')
      .order('expense_date', { ascending: false })
      .limit(2000),
  ])

  if (budgetResp.error || expensesResp.error) return null

  const budgetItems = budgetResp.data || []
  const monthExpenses = expensesResp.data || []

  // compute days
  const daysInMonth = new Date(yy, mm, 0).getDate()
  const now = new Date()
  const sameMonth = now.getFullYear() === yy && now.getMonth() + 1 === mm
  const daysPassed = sameMonth ? Math.min(now.getDate(), daysInMonth) : daysInMonth

  const range = { start, endExclusive }
  const isItemActive = (item: any) => {
    if (item.is_active === false) return false
    const s = item.start_date as string | null
    const e = item.end_date as string | null
    if (s && s >= range.endExclusive) return false
    if (!item.is_indefinite && e && e < range.start) return false
    return true
  }

  const activeIncomes = budgetItems.filter((i: any) => i.kind === 'income' && isItemActive(i))
  const activeFixed = budgetItems.filter((i: any) => i.kind === 'expense' && i.type === 'fixed' && isItemActive(i))
  const activeVariable = budgetItems.filter((i: any) => i.kind === 'expense' && i.type === 'variable' && isItemActive(i))

  const totalIncome = activeIncomes.reduce((sum: number, i: any) => sum + (Number(i.amount) || 0), 0)
  const totalFixed = activeFixed.reduce((sum: number, i: any) => sum + (Number(i.amount) || 0), 0)
  const totalVariableBudget = activeVariable.reduce((sum: number, i: any) => sum + (Number(i.amount) || 0), 0)
  const hasIncome = totalIncome > 0

  const budgetedCategoryIds = new Set(activeVariable.map((v: any) => v.category_id).filter(Boolean))

  const totalVariableSpent = monthExpenses
    .filter((e: any) => e.category_id && budgetedCategoryIds.has(e.category_id))
    .reduce((sum: number, e: any) => sum + (Number(e.amount) || 0), 0)

  const totalUnbudgeted = monthExpenses
    .filter((e: any) => e.is_unbudgeted || !e.category_id || !budgetedCategoryIds.has(e.category_id))
    .reduce((sum: number, e: any) => sum + (Number(e.amount) || 0), 0)

  const availableReal = totalIncome - totalFixed - totalVariableSpent - totalUnbudgeted

  const merchantMap = new Map<string, { amount: number; count: number }>()
  monthExpenses.forEach((e: any) => {
    const name = e.merchant || e.description || 'Sin nombre'
    const existing = merchantMap.get(name) || { amount: 0, count: 0 }
    merchantMap.set(name, { amount: existing.amount + (Number(e.amount) || 0), count: existing.count + 1 })
  })
  const topMerchants = Array.from(merchantMap.entries())
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3)

  return {
    month,
    currency,
    hasIncome,
    totalIncome,
    totalFixed,
    totalVariableBudget,
    totalVariableSpent,
    totalUnbudgeted,
    availableReal,
    daysInMonth,
    daysPassed,
    topMerchants,
  }
}

function formatMoney(n: number, currency = 'CLP') {
  if (currency === 'CLP') return `$${Math.round(n).toLocaleString('es-CL')}`
  return `${n.toLocaleString('es-CL', { maximumFractionDigits: 2 })} ${currency}`
}

function formatBalanceMessage(ctx: MonthlyContext) {
  const totalSpent = ctx.totalVariableSpent + ctx.totalUnbudgeted
  const remainingBudget = ctx.totalVariableBudget - totalSpent
  if (!ctx.hasIncome) {
    return (
      `📌 *Seguimiento (${ctx.month})*\n\n` +
      `• Presupuesto variable: ${formatMoney(ctx.totalVariableBudget, ctx.currency)}\n` +
      `• Gastado: ${formatMoney(totalSpent, ctx.currency)}\n` +
      `• Restante: ${formatMoney(remainingBudget, ctx.currency)}\n` +
      (ctx.totalUnbudgeted > 0 ? `• No presupuestado: ${formatMoney(ctx.totalUnbudgeted, ctx.currency)}\n` : '') +
      `\nTip: si agregas ingresos (opcional) podrás ver “balance disponible”.`
    )
  }
  return (
    `💼 *Balance (${ctx.month})*\n\n` +
    `• Ingresos: ${formatMoney(ctx.totalIncome, ctx.currency)}\n` +
    `• Fijos presup.: ${formatMoney(ctx.totalFixed, ctx.currency)}\n` +
    `• Variable gastado: ${formatMoney(ctx.totalVariableSpent, ctx.currency)}\n` +
    (ctx.totalUnbudgeted > 0 ? `• No presupuestado: ${formatMoney(ctx.totalUnbudgeted, ctx.currency)}\n` : '') +
    `\n✅ *Disponible real*: ${formatMoney(ctx.availableReal, ctx.currency)}`
  )
}

function formatSummaryMessage(ctx: MonthlyContext) {
  const budgetPercent =
    ctx.totalVariableBudget > 0 ? Math.round((ctx.totalVariableSpent / ctx.totalVariableBudget) * 100) : 0
  const expectedPercent = Math.round((ctx.daysPassed / ctx.daysInMonth) * 100)
  const totalSpent = ctx.totalVariableSpent + ctx.totalUnbudgeted
  const remainingBudget = ctx.totalVariableBudget - totalSpent
  const merchants =
    ctx.topMerchants.length > 0
      ? `\n\nTop comercios:\n${ctx.topMerchants
          .map((m) => `• ${m.name}: ${formatMoney(m.amount, ctx.currency)} (${m.count})`)
          .join('\n')}`
      : ''

  if (!ctx.hasIncome) {
    return (
      `📊 *Resumen ejecutivo (${ctx.month})*\n\n` +
      `• Gastado: *${formatMoney(totalSpent, ctx.currency)}* (${budgetPercent}% del presupuesto variable)\n` +
      `• Restante (presupuesto): ${formatMoney(remainingBudget, ctx.currency)}\n` +
      `• Ritmo: ${budgetPercent}% vs esperado ~${expectedPercent}%\n` +
      (ctx.totalUnbudgeted > 0 ? `• No presupuestado: ${formatMoney(ctx.totalUnbudgeted, ctx.currency)}\n` : '') +
      `\nSiguiente paso: clasifica “no presupuestado” y ajusta presupuesto si se queda corto.` +
      merchants
    )
  }

  return (
    `📊 *Resumen ejecutivo (${ctx.month})*\n\n` +
    `• Disponible real: *${formatMoney(ctx.availableReal, ctx.currency)}*\n` +
    `• Variable: ${formatMoney(ctx.totalVariableSpent, ctx.currency)} de ${formatMoney(ctx.totalVariableBudget, ctx.currency)} (${budgetPercent}% vs esperado ~${expectedPercent}%)\n` +
    (ctx.totalUnbudgeted > 0 ? `• No presupuestado: ${formatMoney(ctx.totalUnbudgeted, ctx.currency)}\n` : '') +
    `\nSiguiente paso: revisa “No presupuestado” y clasifica gastos nuevos.` +
    merchants
  )
}

async function sendRecentExpenses(chatId: number, link: { household_id: string; user_id: string }) {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('expenses')
    .select('amount, merchant, description, expense_date, status')
    .eq('household_id', link.household_id)
    .eq('status', 'confirmed')
    .order('expense_date', { ascending: false })
    .limit(5)

  if (error) {
    await sendTelegramMessage(chatId, 'No pude cargar tus últimos gastos.', { reply_markup: mainKeyboard(true) })
    return
  }

  const rows = (data || []).map((e: any) => {
    const title = e.merchant || e.description || 'Gasto'
    return `• ${String(e.expense_date)} — ${title}: ${formatMoney(Number(e.amount) || 0)}`
  })

  await sendTelegramMessage(chatId, `🧾 *Últimos gastos*\n\n${rows.join('\n') || 'Sin gastos aún.'}`, {
    reply_markup: mainKeyboard(true),
  })
}

async function proposeExpenseForConfirmation(
  chatId: number,
  odId: number,
  text: string,
  link: { household_id: string; user_id: string }
) {
  // Best effort: let Groq interpret messy/free-form inputs
  const parsed = await parseExpenseSmart(link.household_id, text)

  if (!parsed.amount) {
    await sendTelegramMessage(
      chatId,
      'No pude detectar el monto. Ejemplos:\n' +
        '• `12990 en Jumbo`\n' +
        '• `Gasto 15.000 en Falabella`\n' +
        '• `Almuerzo 8500 crédito`',
      { reply_markup: mainKeyboard(true) }
    )
    return
  }

  const supabase = getSupabase()
  const expenseDate = parsed.date || parseDateFromText(text) || new Date().toISOString().split('T')[0]

  // Category suggestion (best effort)
  const catSuggestion = await suggestCategoryForExpense(link.household_id, {
    merchant: parsed.merchant,
    description: parsed.description,
    amount: parsed.amount,
  })
  const suggestedCategoryId = catSuggestion?.category_id || null
  const applyCategoryId = catSuggestion && catSuggestion.confidence >= 0.75 ? catSuggestion.category_id : null
  const categoryLabel = catSuggestion?.category_name || null

  // Create pending expense (confirmed only after user presses button)
  const extraNotes = [parsed.notes].filter(Boolean).join('\n').trim()
  const notes = [`telegram_user:${odId}`, extraNotes].filter(Boolean).join('\n')

  const { data: inserted, error } = await supabase
    .from('expenses')
    .insert({
      household_id: link.household_id,
      amount: parsed.amount,
      merchant: parsed.merchant,
      description: parsed.description || (parsed.merchant ? null : text),
      expense_date: expenseDate,
      payment_method: parsed.payment_method || 'unknown',
      source: 'api',
      status: 'pending',
      category_id: applyCategoryId,
      ai_category_suggestion: suggestedCategoryId,
      ai_confidence: catSuggestion?.confidence ?? null,
      ai_reason: catSuggestion?.reason ?? null,
      created_by: link.user_id,
      updated_by: link.user_id,
      notes,
    })
    .select('id')
    .single()

  if (error || !inserted?.id) {
    console.error('Error creating pending expense:', error)
    await sendTelegramMessage(chatId, '❌ Error preparando el gasto. Intenta de nuevo.', {
      reply_markup: mainKeyboard(true),
    })
    return
  }

  const expenseId = inserted.id as string

  const categories = await getActiveCategoriesForHousehold(link.household_id)
  const preview =
    `📝 *Gasto detectado*\n\n` +
    `• Monto: ${formatMoney(parsed.amount)}\n` +
    (parsed.merchant ? `• Comercio: ${parsed.merchant}\n` : '') +
    (parsed.description ? `• Descripción: ${parsed.description}\n` : '') +
    (parsed.notes ? `• Notas: ${parsed.notes}\n` : '') +
    `• Fecha: ${expenseDate}\n` +
    (parsed.payment_method ? `• Pago: ${parsed.payment_method}\n` : '') +
    (categoryLabel
      ? `• Categoría sugerida: ${categoryLabel} (${Math.round((catSuggestion?.confidence || 0) * 100)}%)\n`
      : '') +
    `\n¿Lo guardo? (puedes tocar una categoría para cambiarla)`

  await sendTelegramMessage(chatId, preview, {
    reply_markup: buildExpenseInlineKeyboard(expenseId, categories, applyCategoryId, 0),
  })
}

async function parseExpenseSmart(
  householdId: string,
  text: string
): Promise<ReturnType<typeof parseExpenseFromText> & { date: string | null }> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    return { ...parseExpenseFromText(text), date: null }
  }

  const groq = createOpenAI({ apiKey, baseURL: 'https://api.groq.com/openai/v1' })

  const prompt = `Extrae un gasto desde un mensaje informal (Chile). Responde SOLO JSON válido.

MENSAJE:
${text}

Objetivo:
- merchant: comercio (ej: Líder, Jumbo, Shell)
- description: qué se compró (corto, ej: galletas)
- notes: contexto adicional (largo, ej: "para cumpleaños de ...")
- date: fecha en YYYY-MM-DD si el usuario la indicó (ayer/anteayer/dd/mm), si no null
- payment_method: cash|debit|credit|transfer|null (si el usuario lo dice)

Reglas:
- Si el texto viene como "12990 en Líder, galletas, para cumpleaños", merchant=Líder, description=galletas, notes="para cumpleaños".
- Si el usuario no indica fecha, date=null.

Devuelve este formato exacto:
{"amount":0,"merchant":null,"description":null,"notes":null,"payment_method":null,"date":null,"confidence":0.0}
`

  const { text: out } = await generateText({
    model: groq(GROQ_MODEL),
    system: 'Responde únicamente en JSON válido, sin markdown.',
    prompt,
    temperature: 0.1,
    maxTokens: 220,
  })

  const trimmed = String(out || '').trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  const jsonCandidate = start >= 0 && end >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed

  try {
    const parsed = JSON.parse(jsonCandidate) as any
    const amount = Number(parsed.amount)
    const merchant = parsed.merchant ? String(parsed.merchant).trim() : null
    const description = parsed.description ? String(parsed.description).trim() : null
    const notes = parsed.notes ? String(parsed.notes).trim() : null
    const payment_method = parsed.payment_method ? String(parsed.payment_method).trim() : null
    const date = parsed.date ? String(parsed.date).trim() : null
    const confidence = Math.max(0, Math.min(1, Number(parsed.confidence ?? 0.5)))

    // If low confidence or amount missing, fall back to deterministic parser
    if (!Number.isFinite(amount) || amount <= 0 || confidence < 0.55) {
      return { ...parseExpenseFromText(text), date: null }
    }

    return {
      amount: Math.round(amount),
      merchant: merchant || null,
      description: description || null,
      notes: notes || null,
      payment_method: (['cash', 'debit', 'credit', 'transfer'].includes(payment_method) ? payment_method : null) as any,
      date: date || null,
    }
  } catch {
    return { ...parseExpenseFromText(text), date: null }
  }
}

function parseDateFromText(text: string): string | null {
  const t = String(text || '').toLowerCase()
  const now = new Date()

  if (/\banteayer\b/.test(t)) {
    const d = new Date(now)
    d.setDate(d.getDate() - 2)
    return d.toISOString().slice(0, 10)
  }
  if (/\bayer\b/.test(t)) {
    const d = new Date(now)
    d.setDate(d.getDate() - 1)
    return d.toISOString().slice(0, 10)
  }
  // dd/mm(/yyyy) or dd-mm(-yyyy)
  const m = t.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/)
  if (m) {
    const dd = Number(m[1])
    const mm = Number(m[2])
    const yyRaw = m[3]
    const yyyy = yyRaw ? (yyRaw.length === 2 ? Number(`20${yyRaw}`) : Number(yyRaw)) : now.getFullYear()
    if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12 && yyyy >= 2000 && yyyy <= 2100) {
      const d = new Date(yyyy, mm - 1, dd)
      // Ensure date didn't overflow
      if (d.getFullYear() === yyyy && d.getMonth() === mm - 1 && d.getDate() === dd) {
        return d.toISOString().slice(0, 10)
      }
    }
  }
  return null
}

async function suggestCategoryForExpense(
  householdId: string,
  expense: { merchant: string | null; description: string | null; amount: number }
): Promise<{ category_id: string; category_name: string; confidence: number; reason: string } | null> {
  const supabase = getSupabase()

  const { data: cats, error } = await supabase
    .from('categories')
    .select('id, name, is_system, household_id, is_active')
    .or(`household_id.eq.${householdId},is_system.eq.true`)
    .eq('is_active', true)
    .order('sort_order')

  if (error || !cats || cats.length === 0) return null

  // Heuristic first (fast + stable)
  const merchant = (expense.merchant || '').toLowerCase()
  if (merchant) {
    const keywordToCategoryNameContains: Array<{ keyword: RegExp; catContains: RegExp; reason: string }> = [
      { keyword: /l[ií]der|lider/, catContains: /supermerc|aliment/i, reason: 'Comercio coincide con Líder' },
      { keyword: /jumbo/, catContains: /supermerc|aliment/i, reason: 'Comercio coincide con Jumbo' },
      { keyword: /santa isabel/, catContains: /supermerc|aliment/i, reason: 'Comercio coincide con Santa Isabel' },
      { keyword: /unimarc/, catContains: /supermerc|aliment/i, reason: 'Comercio coincide con Unimarc' },
    ]
    for (const rule of keywordToCategoryNameContains) {
      if (!rule.keyword.test(merchant)) continue
      const match = cats.find((c: any) => rule.catContains.test(String(c.name || '')))
      if (match) {
        return {
          category_id: match.id,
          category_name: match.name,
          confidence: 0.78,
          reason: rule.reason,
        }
      }
    }
  }

  // AI fallback (best effort)
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return null

  const groq = createOpenAI({
    apiKey,
    baseURL: 'https://api.groq.com/openai/v1',
  })

  const categories = cats.map((c: any) => ({ id: c.id, name: c.name }))
  const prompt = `Clasifica este gasto en UNA categoría de la lista. Responde SOLO JSON válido.

GASTO:
- comercio: ${expense.merchant || ''}
- descripción: ${expense.description || ''}
- monto: ${expense.amount}

CATEGORÍAS DISPONIBLES (id, name):
${categories.map((c) => `- ${c.id}: ${c.name}`).join('\n')}

Formato exacto:
{"category_id":"<id>","confidence":0.0,"reason":"<breve>"}
Reglas:
- confidence entre 0 y 1
- Si no estás seguro, usa confidence <= 0.6 y elige la mejor opción igual.
`

  const { text } = await generateText({
    model: groq(GROQ_MODEL),
    system: 'Responde únicamente en JSON válido, sin markdown ni explicación extra.',
    prompt,
    temperature: 0.2,
    maxTokens: 180,
  })

  const trimmed = String(text || '').trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  const jsonCandidate = start >= 0 && end >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed

  try {
    const parsed = JSON.parse(jsonCandidate) as { category_id?: string; confidence?: number; reason?: string }
    if (!parsed.category_id) return null
    const found = categories.find((c) => c.id === parsed.category_id)
    if (!found) return null
    const conf = Math.max(0, Math.min(1, Number(parsed.confidence ?? 0.5)))
    return {
      category_id: found.id,
      category_name: found.name,
      confidence: conf,
      reason: String(parsed.reason || 'Sugerencia IA'),
    }
  } catch {
    return null
  }
}

async function handleCallbackQuery(cb: TelegramCallbackQuery) {
  const chatId = cb.message?.chat.id
  const messageId = cb.message?.message_id
  const data = cb.data || ''
  if (!chatId || !messageId || !data) return

  const supabase = getSupabase()
  const parts = data.split(':')
  const action = parts[0]
  if (!action) return

  // Stop Telegram "loading…" immediately
  await answerTelegramCallbackQuery(cb.id, { text: 'Listo' })
  await touchTelegramActivity(cb.from.id)

  // Category selection / pagination (keeps the message, edits it)
  if (action === 'cat' || action === 'catp') {
    const expenseId = parts[1]
    if (!expenseId) return

    const { data: link } = await supabase
      .from('telegram_links')
      .select('household_id, user_id')
      .eq('telegram_user_id', cb.from.id)
      .not('linked_at', 'is', null)
      .single()
    if (!link) return

    const categories = await getActiveCategoriesForHousehold(link.household_id)
    if (!categories || categories.length === 0) return

    const pageSize = 6
    let nextOffset = 0

    if (action === 'cat') {
      const idx = Number(parts[2] || -1)
      const cat = Number.isFinite(idx) && idx >= 0 && idx < categories.length ? categories[idx] : null
      if (cat) {
        await supabase
          .from('expenses')
          .update({ category_id: cat.id })
          .eq('id', expenseId)
          .eq('status', 'pending')
      }
      nextOffset = Number.isFinite(idx) && idx >= 0 ? Math.floor(idx / pageSize) * pageSize : 0
    } else {
      const offset = Number(parts[2] || 0)
      nextOffset = Number.isFinite(offset) && offset >= 0 ? offset : 0
    }

    // Refresh message with updated category and keyboard
    const { data: exp } = await supabase
      .from('expenses')
      .select('id, amount, merchant, description, expense_date, payment_method, notes, category_id, ai_category_suggestion, ai_confidence')
      .eq('id', expenseId)
      .single()
    if (!exp) return

    const preview = buildExpensePreviewText(exp, categories)
    const kb = buildExpenseInlineKeyboard(expenseId, categories, exp.category_id || null, nextOffset)
    await editTelegramMessageText(chatId, messageId, preview, { reply_markup: kb })
    return
  }

  // Household selection (multi-hogar)
  if (action === 'hh') {
    const householdId = parts[1]
    if (!householdId) return

    const { data: link } = await supabase
      .from('telegram_links')
      .select('id, user_id')
      .eq('telegram_user_id', cb.from.id)
      .not('linked_at', 'is', null)
      .single()
    if (!link) return

    const { data: membership } = await supabase
      .from('household_memberships')
      .select('household_id, households(name)')
      .eq('user_id', link.user_id)
      .eq('household_id', householdId)
      .eq('is_active', true)
      .maybeSingle()

    if (!membership) {
      await sendTelegramMessage(chatId, '❌ No tienes acceso a ese hogar.', { reply_markup: mainKeyboard(true) })
      return
    }

    await supabase
      .from('telegram_links')
      .update({ household_id: householdId })
      .eq('id', link.id)

    await sendTelegramMessage(
      chatId,
      `✅ Hogar seleccionado: *${membership.households?.name || 'Hogar'}*.\n` +
        'Los gastos y consultas se aplicarán a este hogar.',
      { reply_markup: mainKeyboard(true) }
    )
    return
  }

  if (action === 'confirm') {
    const expenseId = parts[1]
    if (!expenseId) return
    // Remove buttons so it can't be pressed again
    await editTelegramMessageReplyMarkup(chatId, messageId, { inline_keyboard: [] })
    const { data: updated, error } = await supabase
      .from('expenses')
      .update({ status: 'confirmed' })
      .eq('id', expenseId)
      .eq('status', 'pending')
      .select('id')
    if (error) {
      await sendTelegramMessage(chatId, '❌ No pude confirmar el gasto. Intenta de nuevo.', { reply_markup: mainKeyboard(true) })
      return
    }
    // Idempotent: if it was already confirmed/cancelled, don't spam messages
    if (updated && updated.length > 0) {
      await sendTelegramMessage(chatId, '✅ *Gasto guardado.*', { reply_markup: mainKeyboard(true) })
    }
    return
  }

  if (action === 'cancel') {
    const expenseId = parts[1]
    if (!expenseId) return
    // Remove buttons so it can't be pressed again
    await editTelegramMessageReplyMarkup(chatId, messageId, { inline_keyboard: [] })
    const { data: updated, error } = await supabase
      .from('expenses')
      .update({ status: 'cancelled' })
      .eq('id', expenseId)
      .eq('status', 'pending')
      .select('id')
    if (error) {
      await sendTelegramMessage(chatId, '❌ No pude cancelar el gasto. Intenta de nuevo.', { reply_markup: mainKeyboard(true) })
      return
    }
    if (updated && updated.length > 0) {
      await sendTelegramMessage(chatId, 'Cancelado. No guardé ese gasto.', { reply_markup: mainKeyboard(true) })
    }
  }
}

type Cat = { id: string; name: string }

async function getActiveCategoriesForHousehold(householdId: string): Promise<Cat[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, is_system, household_id, is_active')
    .or(`household_id.eq.${householdId},is_system.eq.true`)
    .eq('is_active', true)
    .order('sort_order')
  if (error) return []
  return (data || [])
    .filter((c: any) => c?.name && String(c.name).toLowerCase() !== 'sin clasificar')
    .map((c: any) => ({ id: c.id, name: c.name }))
}

function buildExpenseInlineKeyboard(expenseId: string, categories: Cat[], selectedCategoryId: string | null, offset = 0) {
  const pageSize = 6
  const start = Math.max(0, Math.min(offset, Math.max(0, categories.length - 1)))
  const page = categories.slice(start, start + pageSize)
  const rows: any[] = []

  // Row 1: confirm/cancel
  rows.push([
    { text: '✅ Confirmar', callback_data: `confirm:${expenseId}` },
    { text: '❌ Cancelar', callback_data: `cancel:${expenseId}` },
  ])

  // Category rows (2 per row)
  for (let i = 0; i < page.length; i += 2) {
    const a = page[i]
    const b = page[i + 1]
    const row: any[] = []
    const aIdx = start + i
    const bIdx = start + i + 1
    row.push({
      text: `${selectedCategoryId === a.id ? '✅ ' : ''}${a.name}`,
      callback_data: `cat:${expenseId}:${aIdx}`,
    })
    if (b) {
      row.push({
        text: `${selectedCategoryId === b.id ? '✅ ' : ''}${b.name}`,
        callback_data: `cat:${expenseId}:${bIdx}`,
      })
    }
    rows.push(row)
  }

  // Pagination
  const nav: any[] = []
  if (start > 0) nav.push({ text: '⬅️ Más', callback_data: `catp:${expenseId}:${Math.max(0, start - pageSize)}` })
  if (start + pageSize < categories.length) nav.push({ text: 'Más ➡️', callback_data: `catp:${expenseId}:${start + pageSize}` })
  if (nav.length > 0) rows.push(nav)

  return { inline_keyboard: rows }
}

function extractUserNotesFromStoredNotes(notes: unknown): string | null {
  const n = String(notes || '').trim()
  if (!n) return null
  const lines = n.split('\n').map((l) => l.trim()).filter(Boolean)
  const filtered = lines.filter((l) => !l.startsWith('telegram_user:') && !l.startsWith('telegram_chat:'))
  return filtered.length > 0 ? filtered.join('\n').slice(0, 300) : null
}

function buildExpensePreviewText(exp: any, categories: Cat[]): string {
  const amount = Number(exp.amount) || 0
  const catName = exp.category_id ? categories.find((c) => c.id === exp.category_id)?.name : null
  const suggestedName = exp.ai_category_suggestion ? categories.find((c) => c.id === exp.ai_category_suggestion)?.name : null
  const notes = extractUserNotesFromStoredNotes(exp.notes)
  const lines: string[] = []
  lines.push('📝 *Gasto detectado*')
  lines.push('')
  lines.push(`• Monto: ${formatMoney(amount)}`)
  if (exp.merchant) lines.push(`• Comercio: ${exp.merchant}`)
  if (exp.description) lines.push(`• Descripción: ${exp.description}`)
  if (notes) lines.push(`• Notas: ${notes}`)
  if (exp.expense_date) lines.push(`• Fecha: ${String(exp.expense_date)}`)
  if (exp.payment_method && exp.payment_method !== 'unknown') lines.push(`• Pago: ${exp.payment_method}`)
  if (catName) lines.push(`• Categoría: ${catName}`)
  else if (suggestedName) lines.push(`• Categoría sugerida: ${suggestedName} (${Math.round((Number(exp.ai_confidence) || 0) * 100)}%)`)
  lines.push('')
  lines.push('¿Lo guardo? (puedes tocar una categoría para cambiarla)')
  return lines.join('\n')
}

async function handleCommand(
  chatId: number, 
  odId: number, 
  text: string,
  link: { household_id: string; user_id: string } | null,
  username?: string
) {
  const [command, ...args] = text.split(' ')
  
  switch (command.toLowerCase()) {
    case '/start':
      await sendTelegramMessage(chatId,
        '👋 ¡Bienvenido a SpendPlan Bot!\n\n' +
        '📸 Envía una foto de tu boleta para registrar un gasto\n' +
        '💬 O escribe algo como: "Gasto 12.990 en Jumbo"\n\n' +
        'Comandos:\n' +
        '/vincular CODIGO - Vincular con tu cuenta\n' +
        '/estado - Ver resumen del mes\n' +
        '/ayuda - Ver todos los comandos'
      )
      break
      
    case '/vincular':
      if (args.length === 0) {
        await sendTelegramMessage(chatId,
          '❌ Debes proporcionar un código.\n\n' +
          'Ejemplo: `/vincular ABC123`\n\n' +
          'Obtén tu código en SpendPlan web → Configuración → Telegram'
        )
        return
      }
      await handleVerification(chatId, odId, args[0].toUpperCase(), username)
      break
      
    case '/estado':
      if (!link) {
        await sendTelegramMessage(chatId, '❌ Primero vincula tu cuenta con /vincular')
        return
      }
      {
        const ensured = await ensureHouseholdSelection(chatId, odId, link, { silentIfAlreadySelected: true })
        if (!ensured) return
        link = ensured
      }
      await sendTelegramMessage(chatId,
        '📊 *Resumen del mes*\n\n' +
        'Para ver el resumen completo con gráficos,\n' +
        'visita SpendPlan web → Resumen\n\n' +
        '💡 Tip: Usa /ia ¿cómo voy este mes? para un análisis rápido'
      )
      break
      
    case '/ia':
    case '/analizar':
      if (!link) {
        await sendTelegramMessage(chatId, '❌ Primero vincula tu cuenta con /vincular')
        return
      }
      {
        const ensuredAI = await ensureHouseholdSelection(chatId, odId, link, { silentIfAlreadySelected: true })
        if (!ensuredAI) return
        link = ensuredAI
      }
      await analyzeWithAI(chatId, args.join(' '))
      break

    case '/hogar':
    case '/household':
      if (!link) {
        await sendTelegramMessage(chatId, '❌ Primero vincula tu cuenta con /vincular')
        return
      }
      await ensureHouseholdSelection(chatId, odId, link, { silentIfAlreadySelected: false })
      break
      
    case '/ayuda':
    case '/help':
      await sendTelegramMessage(chatId,
        '📚 *Comandos disponibles:*\n\n' +
        '💬 *Texto* - "Gasto 12.990 en Jumbo"\n\n' +
        '/vincular CODIGO - Vincular cuenta\n' +
        '/estado - Resumen del mes\n' +
        '/ia PREGUNTA - Consultar copiloto IA\n' +
        '/ayuda - Ver este mensaje'
      )
      break
      
    default:
      await sendTelegramMessage(chatId, '❓ Comando no reconocido. Usa /ayuda para ver los comandos.')
  }
}

async function handleVerification(
  chatId: number,
  odId: number,
  code: string,
  username?: string
) {
  const supabase = getSupabase()
  
  // Find pending verification code
  const { data: pending } = await supabase
    .from('telegram_links')
    .select('*')
    .eq('verification_code', code)
    .is('linked_at', null)
    .gt('code_expires_at', new Date().toISOString())
    .single()
  
  if (!pending) {
    await sendTelegramMessage(chatId,
      '❌ Código no válido o expirado.\n\n' +
      'Genera un nuevo código en SpendPlan web → Configuración → Telegram'
    )
    return
  }
  
  // Link the user
  const { error } = await supabase
    .from('telegram_links')
    .update({
      telegram_user_id: odId,
      telegram_username: username,
      linked_at: new Date().toISOString(),
      verification_code: null,
      code_expires_at: null
    })
    .eq('id', pending.id)
  
  if (error) {
    console.error('Error linking telegram:', error)
    await sendTelegramMessage(chatId, '❌ Error al vincular. Intenta de nuevo.')
    return
  }

  // Mark profile as connected (best-effort; does not block linking)
  const { error: profileUpdateError } = await supabase
    .from('profiles')
    .update({
      telegram_connected: true,
      telegram_reminder_dismissed_at: null,
    })
    .eq('id', pending.user_id)
  if (profileUpdateError) {
    console.error('Error marking telegram_connected on profile:', profileUpdateError)
  }
  
  await sendTelegramMessage(chatId,
    '✅ *¡Cuenta vinculada correctamente!*\n\n' +
    'Ahora puedes:\n' +
    '💬 Escribir gastos: "12990 en Jumbo"\n' +
    '📊 Ver estado: /estado\n' +
    '🤖 Consultar IA: /ia ¿cómo voy este mes?'
  )
}

async function handleTextExpense(
  chatId: number, 
  odId: number, 
  text: string,
  link: { household_id: string; user_id: string }
) {
  const parsed = parseExpenseFromText(text)
  
  if (!parsed.amount) {
    await sendTelegramMessage(chatId,
      '❓ No pude detectar el monto.\n\n' +
      'Intenta con un formato como:\n' +
      '• "12990 en Jumbo"\n' +
      '• "Gasto 15.000 en Falabella"\n' +
      '• "Almuerzo 8500 crédito"'
    )
    return
  }
  
  const supabase = getSupabase()
  const today = new Date().toISOString().split('T')[0]
  
  // Save expense to database
  const { error } = await supabase
    .from('expenses')
    .insert({
      household_id: link.household_id,
      amount: parsed.amount,
      merchant: parsed.merchant,
      description: parsed.description || text,
      expense_date: today,
      payment_method: parsed.payment_method || 'unknown',
      source: 'api',
      created_by: link.user_id
    })
  
  if (error) {
    console.error('Error saving expense:', error)
    await sendTelegramMessage(chatId, '❌ Error al guardar el gasto. Intenta de nuevo.')
    return
  }
  
  const response = formatExpenseResponse({
    amount: parsed.amount,
    merchant: parsed.merchant,
    date: today,
    category: null,
    payment_method: parsed.payment_method
  })
  
  await sendTelegramMessage(chatId, 
    '✅ *¡Gasto guardado!*\n\n' +
    `💰 $${parsed.amount.toLocaleString('es-CL')}\n` +
    `🏪 ${parsed.merchant || 'Sin comercio'}\n` +
    `📅 ${today}\n\n` +
    'Puedes verlo en SpendPlan web → Gastos'
  )
}

async function analyzeWithAI(chatId: number, question: string) {
  if (!question.trim()) {
    await sendTelegramMessage(chatId,
      '🤖 *Copiloto IA*\n\n' +
      'Pregúntame sobre tu presupuesto:\n' +
      '• /ia ¿cómo voy este mes?\n' +
      '• /ia ¿cuánto queda disponible?\n' +
      '• /ia ¿dónde me pasé del presupuesto?'
    )
    return
  }
  
  await sendTelegramMessage(chatId, '🤖 Analizando...')
  
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'https://spendplan.vercel.app'}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: question,
        context: 'Usuario consultando desde Telegram.',
        history: ''
      })
    })
    
    if (response.ok) {
      const data = await response.json()
      await sendTelegramMessage(chatId, `🤖 *Copiloto:*\n\n${data.message}`)
    } else {
      await sendTelegramMessage(chatId, '❌ Error al consultar la IA. Intenta de nuevo.')
    }
  } catch (error) {
    console.error('AI analysis error:', error)
    await sendTelegramMessage(chatId, '❌ Error al consultar la IA.')
  }
}

async function analyzeWithAIWithContext(
  chatId: number,
  link: { household_id: string; user_id: string },
  question: string
) {
  if (!question.trim()) return
  await sendTelegramMessage(chatId, '🤖 Analizando…', { reply_markup: mainKeyboard(true) })

  const month = currentMonthYYYYMM()
  const ctx = await buildMonthlyContext(link.household_id, month)
  const contextText = ctx
    ? [
        `Mes: ${ctx.month} (día ${ctx.daysPassed}/${ctx.daysInMonth})`,
        `Moneda: ${ctx.currency}`,
        ctx.hasIncome ? `Ingresos: ${formatMoney(ctx.totalIncome, ctx.currency)}` : null,
        `Fijos: ${formatMoney(ctx.totalFixed, ctx.currency)}`,
        `Variable presup.: ${formatMoney(ctx.totalVariableBudget, ctx.currency)}`,
        `Variable gastado: ${formatMoney(ctx.totalVariableSpent, ctx.currency)}`,
        ctx.totalUnbudgeted > 0 ? `No presupuestado: ${formatMoney(ctx.totalUnbudgeted, ctx.currency)}` : null,
        ctx.hasIncome
          ? `Balance real: ${formatMoney(ctx.availableReal, ctx.currency)}`
          : `Presupuesto restante: ${formatMoney(ctx.totalVariableBudget - (ctx.totalVariableSpent + ctx.totalUnbudgeted), ctx.currency)}`,
      ]
        .filter(Boolean)
        .join('\n')
    : 'Sin contexto disponible'

  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || 'https://spendplan.vercel.app'}/api/ai/chat`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: question,
          context: contextText,
          history: '',
        }),
      }
    )

    if (response.ok) {
      const data = await response.json()
      await sendTelegramMessage(chatId, `🤖 *SpendPlan:*\n\n${data.message}`, { reply_markup: mainKeyboard(true) })
    } else {
      await sendTelegramMessage(chatId, '❌ Error al consultar la IA. Intenta de nuevo.', { reply_markup: mainKeyboard(true) })
    }
  } catch (error) {
    console.error('AI analysis error:', error)
    await sendTelegramMessage(chatId, '❌ Error al consultar la IA.', { reply_markup: mainKeyboard(true) })
  }
}

// API to generate verification code (called from web)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')
  const odId = searchParams.get('user_id')
  const householdId = searchParams.get('household_id')
  
  if (action === 'generate_code' && odId && householdId) {
    const supabase = getSupabase()
    const code = Math.random().toString(36).substring(2, 8).toUpperCase()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 minutes
    
    console.log('📱 Generating telegram code for user:', odId, 'household:', householdId)
    
    // Upsert: create or update
    const { data: upsertData, error: upsertError } = await supabase
      .from('telegram_links')
      .upsert({
        user_id: odId,
        household_id: householdId,
        verification_code: code,
        code_expires_at: expiresAt,
        linked_at: null,
        telegram_user_id: null
      }, {
        onConflict: 'user_id'
      })
      .select()
    
    if (upsertError) {
      console.log('📱 Upsert failed, trying insert:', upsertError.message)
      // Try insert if upsert fails
      const { data: insertData, error: insertError } = await supabase
        .from('telegram_links')
        .insert({
          user_id: odId,
          household_id: householdId,
          verification_code: code,
          code_expires_at: expiresAt
        })
        .select()
      
      if (insertError) {
        console.error('📱 Insert also failed:', insertError)
        return NextResponse.json({ 
          error: `Error guardando código: ${insertError.message}`,
          code: null 
        })
      }
      console.log('📱 Insert succeeded:', insertData)
    } else {
      console.log('📱 Upsert succeeded:', upsertData)
    }
    
    return NextResponse.json({ code, expires_in: 600 })
  }
  
  if (action === 'status') {
    return NextResponse.json({ 
      ok: true, 
      bot_configured: !!process.env.TELEGRAM_BOT_TOKEN 
    })
  }
  
  return NextResponse.json({ ok: true })
}
