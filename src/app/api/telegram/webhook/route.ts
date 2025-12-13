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

// Supabase client for server-side (uses service role to bypass RLS)
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function POST(req: NextRequest) {
  try {
    const update = await req.json()
    
    if (update.message) {
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
  
  // User not linked
  if (!link) {
    await sendTelegramMessage(chatId, 
      '👋 ¡Hola! Soy el bot de SpendPlan.\n\n' +
      'Para usar este bot, primero debes vincular tu cuenta.\n\n' +
      '1️⃣ Ve a SpendPlan web → Configuración → Integraciones\n' +
      '2️⃣ Genera un código de vinculación\n' +
      '3️⃣ Envíame: `/vincular CODIGO`\n\n' +
      'Ejemplo: `/vincular ABC123`'
    )
    return
  }
  
  // Handle text expense
  if (text) {
    await handleTextExpense(chatId, odId, text, link)
    return
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
    
    // Upsert: create or update
    const { error } = await supabase
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
    
    if (error) {
      // Try insert if upsert fails
      await supabase
        .from('telegram_links')
        .insert({
          user_id: odId,
          household_id: householdId,
          verification_code: code,
          code_expires_at: expiresAt
        })
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
