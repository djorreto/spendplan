/**
 * ========================================
 * 📱 TELEGRAM WEBHOOK
 * ========================================
 * Recibe mensajes de Telegram y los procesa
 * Usa Supabase para persistencia
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { 
  sendTelegramMessage, 
  parseExpenseFromText,
  formatExpenseResponse,
  type TelegramMessage 
} from '@/lib/telegram'

export const runtime = 'nodejs'

type TelegramCallbackQuery = {
  id: string
  from: { id: number; username?: string }
  message?: { chat: { id: number } }
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
    .select('household_id, user_id')
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
  
  if (text) {
    await handleConversationalText(chatId, odId, text, link)
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
    ],
    resize_keyboard: true,
  }
}

function detectIntent(text: string): 'help' | 'link_help' | 'balance' | 'summary' | 'recent' | 'new_expense' | 'expense_like' | 'ai' {
  const t = normalizeText(text).toLowerCase()
  if (!t) return 'help'
  if (t.includes('vincul') || t.includes('codigo') || t.includes('código') || t.includes('config')) return 'link_help'
  if (/(balance|disponible|cu[aá]nto queda|queda|resta|plata)/i.test(t)) return 'balance'
  if (/(resumen|estado|c[oó]mo voy|seguimiento|insights|reporte)/i.test(t)) return 'summary'
  if (/(últimos|ultimos|recientes)/i.test(t)) return 'recent'
  if (/(registrar|anotar|agregar|cargar)\s+(un\s+)?gasto/i.test(t)) return 'new_expense'
  // if it has an amount, it's likely an expense
  if (/\d{3,}/.test(t) && /(\$|clp|mil|lucas)?/.test(t)) return 'expense_like'
  // default to AI for free-form budget questions
  return 'ai'
}

async function handleConversationalText(
  chatId: number,
  odId: number,
  text: string,
  link: { household_id: string; user_id: string }
) {
  const intent = detectIntent(text)

  if (intent === 'help' || intent === 'new_expense') {
    await sendTelegramMessage(
      chatId,
      'Cuéntame qué necesitas:\n' +
        '• *Resumen* del mes\n' +
        '• *Balance* disponible\n' +
        '• *Registrar gasto* (ej: `12990 en Jumbo`)\n\n' +
        'También puedes escribir directo: `8500 almuerzo crédito`',
      { reply_markup: mainKeyboard(true) }
    )
    return
  }

  if (intent === 'recent') {
    await sendTelegramMessage(chatId, 'Dame un segundo…', { reply_markup: mainKeyboard(true) })
    await sendRecentExpenses(chatId, link)
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
  const merchants =
    ctx.topMerchants.length > 0
      ? `\n\nTop comercios:\n${ctx.topMerchants
          .map((m) => `• ${m.name}: ${formatMoney(m.amount, ctx.currency)} (${m.count})`)
          .join('\n')}`
      : ''

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
  const parsed = parseExpenseFromText(text)

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
  const today = new Date().toISOString().split('T')[0]

  // Create pending expense (confirmed only after user presses button)
  const { data: inserted, error } = await supabase
    .from('expenses')
    .insert({
      household_id: link.household_id,
      amount: parsed.amount,
      merchant: parsed.merchant,
      description: parsed.description || text,
      expense_date: today,
      payment_method: parsed.payment_method || 'unknown',
      source: 'api',
      status: 'pending',
      created_by: link.user_id,
      updated_by: link.user_id,
      notes: `telegram_user:${odId}`,
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

  const preview =
    `📝 *Gasto detectado*\n\n` +
    `• Monto: ${formatMoney(parsed.amount)}\n` +
    `• Comercio: ${parsed.merchant || 'Sin comercio'}\n` +
    `• Fecha: ${today}\n` +
    (parsed.payment_method ? `• Pago: ${parsed.payment_method}\n` : '') +
    `\n¿Lo guardo?`

  await sendTelegramMessage(chatId, preview, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Confirmar', callback_data: `confirm:${expenseId}` },
          { text: '❌ Cancelar', callback_data: `cancel:${expenseId}` },
        ],
      ],
    },
  })
}

async function handleCallbackQuery(cb: TelegramCallbackQuery) {
  const chatId = cb.message?.chat.id
  const data = cb.data || ''
  if (!chatId || !data) return

  const supabase = getSupabase()
  const [action, expenseId] = data.split(':')
  if (!action || !expenseId) return

  if (action === 'confirm') {
    const { error } = await supabase.from('expenses').update({ status: 'confirmed' }).eq('id', expenseId)
    if (error) {
      await sendTelegramMessage(chatId, '❌ No pude confirmar el gasto. Intenta de nuevo.', { reply_markup: mainKeyboard(true) })
      return
    }
    await sendTelegramMessage(chatId, '✅ *Gasto guardado.*', { reply_markup: mainKeyboard(true) })
    return
  }

  if (action === 'cancel') {
    const { error } = await supabase.from('expenses').update({ status: 'cancelled' }).eq('id', expenseId)
    if (error) {
      await sendTelegramMessage(chatId, '❌ No pude cancelar el gasto. Intenta de nuevo.', { reply_markup: mainKeyboard(true) })
      return
    }
    await sendTelegramMessage(chatId, 'Cancelado. No guardé ese gasto.', { reply_markup: mainKeyboard(true) })
  }
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
      await analyzeWithAI(chatId, args.join(' '))
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
        `Ingresos: ${formatMoney(ctx.totalIncome, ctx.currency)}`,
        `Fijos: ${formatMoney(ctx.totalFixed, ctx.currency)}`,
        `Variable presup.: ${formatMoney(ctx.totalVariableBudget, ctx.currency)}`,
        `Variable gastado: ${formatMoney(ctx.totalVariableSpent, ctx.currency)}`,
        ctx.totalUnbudgeted > 0 ? `No presupuestado: ${formatMoney(ctx.totalUnbudgeted, ctx.currency)}` : null,
        `Balance real: ${formatMoney(ctx.availableReal, ctx.currency)}`,
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
