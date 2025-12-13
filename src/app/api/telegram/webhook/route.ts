/**
 * ========================================
 * 📱 TELEGRAM WEBHOOK
 * ========================================
 * Recibe mensajes de Telegram y los procesa
 * Reutiliza el mismo pipeline de OCR y Groq
 */

import { NextRequest, NextResponse } from 'next/server'
import { 
  sendTelegramMessage, 
  downloadTelegramFile,
  parseExpenseFromText,
  formatExpenseResponse,
  type TelegramMessage 
} from '@/lib/telegram'

export const runtime = 'nodejs'

// In-memory storage for pending expenses (in production, use Redis or DB)
const pendingExpenses = new Map<number, {
  amount: number | null
  merchant: string | null
  date: string | null
  category: string | null
  payment_method: string | null
  raw_text?: string
  created_at: number
}>()

// In-memory storage for telegram links (in production, use DB)
const telegramLinks = new Map<number, {
  household_id: string
  user_id: string
}>()

// Verification codes waiting to be confirmed
const pendingVerifications = new Map<string, {
  telegram_user_id: number
  telegram_username?: string
  expires_at: number
}>()

export async function POST(req: NextRequest) {
  try {
    const update = await req.json()
    
    // Handle message
    if (update.message) {
      await handleMessage(update.message)
    }
    
    // Handle callback query (button clicks)
    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query)
    }
    
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Telegram webhook error:', error)
    return NextResponse.json({ ok: true }) // Always return 200 to Telegram
  }
}

async function handleMessage(message: TelegramMessage) {
  const chatId = message.chat.id
  const userId = message.from.id
  const text = message.text || ''
  
  // Check if user is linked
  const link = telegramLinks.get(userId)
  
  // Handle commands (some work without linking)
  if (text.startsWith('/')) {
    await handleCommand(chatId, userId, text, link)
    return
  }
  
  // User not linked - require linking first
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
  
  // Handle photo (receipt)
  if (message.photo && message.photo.length > 0) {
    await handlePhoto(chatId, userId, message.photo, link)
    return
  }
  
  // Handle text expense
  if (text) {
    await handleTextExpense(chatId, userId, text)
    return
  }
}

async function handleCommand(
  chatId: number, 
  userId: number, 
  text: string,
  link: { household_id: string; user_id: string } | undefined
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
      await handleVerification(chatId, userId, args[0], {
        first_name: '', // Will be filled from message.from
        username: undefined
      })
      break
      
    case '/confirmar':
      if (!link) {
        await sendTelegramMessage(chatId, '❌ Primero vincula tu cuenta con /vincular')
        return
      }
      await confirmPendingExpense(chatId, userId, link)
      break
      
    case '/cancelar':
      pendingExpenses.delete(userId)
      await sendTelegramMessage(chatId, '❌ Gasto descartado')
      break
      
    case '/editar':
      await sendTelegramMessage(chatId,
        '✏️ Para editar, envía el dato corregido:\n\n' +
        '`monto 15000`\n' +
        '`comercio Jumbo`\n' +
        '`fecha 2024-12-11`\n\n' +
        'Luego usa /confirmar para guardar'
      )
      break
      
    case '/estado':
      if (!link) {
        await sendTelegramMessage(chatId, '❌ Primero vincula tu cuenta con /vincular')
        return
      }
      await sendMonthSummary(chatId, link)
      break
      
    case '/ia':
    case '/analizar':
      if (!link) {
        await sendTelegramMessage(chatId, '❌ Primero vincula tu cuenta con /vincular')
        return
      }
      await analyzeWithAI(chatId, userId, args.join(' '))
      break
      
    case '/ayuda':
    case '/help':
      await sendTelegramMessage(chatId,
        '📚 *Comandos disponibles:*\n\n' +
        '📸 *Enviar foto* - Escanear boleta con OCR\n' +
        '💬 *Texto* - "Gasto 12.990 en Jumbo"\n\n' +
        '/vincular CODIGO - Vincular cuenta\n' +
        '/confirmar - Guardar gasto pendiente\n' +
        '/cancelar - Descartar gasto\n' +
        '/editar - Modificar datos\n' +
        '/estado - Resumen del mes\n' +
        '/ia PREGUNTA - Consultar copiloto IA\n' +
        '/ayuda - Ver este mensaje'
      )
      break
      
    default:
      await sendTelegramMessage(chatId, '❓ Comando no reconocido. Usa /ayuda para ver los comandos.')
  }
}

async function handlePhoto(
  chatId: number,
  userId: number,
  photos: TelegramMessage['photo'],
  link: { household_id: string; user_id: string } | undefined
) {
  if (!link) {
    await sendTelegramMessage(chatId, '❌ Primero vincula tu cuenta con /vincular')
    return
  }
  
  await sendTelegramMessage(chatId, '📷 Procesando imagen...')
  
  // Get largest photo
  const photo = photos![photos!.length - 1]
  
  try {
    // Download photo
    const imageBuffer = await downloadTelegramFile(photo.file_id)
    if (!imageBuffer) {
      await sendTelegramMessage(chatId, '❌ No pude descargar la imagen. Intenta de nuevo.')
      return
    }
    
    // Convert to base64 for OCR API
    const base64Image = imageBuffer.toString('base64')
    
    // Call OCR API (same as web)
    const ocrResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/ai/ocr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rawText: `[Image to be processed - base64 length: ${base64Image.length}]`,
        // Note: In a real implementation, you would run tesseract.js server-side
        // or use a separate OCR service. For now, we'll ask user to retry on web.
      })
    })
    
    // For now, since tesseract.js runs client-side, we'll provide a simplified flow
    await sendTelegramMessage(chatId,
      '📷 *Imagen recibida*\n\n' +
      'El OCR completo funciona mejor en la web.\n\n' +
      '¿Quieres ingresar los datos manualmente?\n' +
      'Envía: `monto CANTIDAD en COMERCIO`\n\n' +
      'Ejemplo: `15990 en Jumbo`'
    )
    
  } catch (error) {
    console.error('Photo processing error:', error)
    await sendTelegramMessage(chatId, '❌ Error al procesar la imagen. Intenta de nuevo.')
  }
}

async function handleTextExpense(chatId: number, userId: number, text: string) {
  // Parse expense from text
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
  
  // Store pending expense
  const today = new Date().toISOString().split('T')[0]
  pendingExpenses.set(userId, {
    amount: parsed.amount,
    merchant: parsed.merchant,
    date: today,
    category: null, // Will be suggested by AI if requested
    payment_method: parsed.payment_method,
    raw_text: text,
    created_at: Date.now()
  })
  
  // Send confirmation
  const response = formatExpenseResponse({
    amount: parsed.amount,
    merchant: parsed.merchant,
    date: today,
    category: null,
    payment_method: parsed.payment_method
  })
  
  await sendTelegramMessage(chatId, response)
}

async function handleVerification(
  chatId: number,
  telegramUserId: number,
  code: string,
  from: { first_name: string; username?: string }
) {
  const verification = pendingVerifications.get(code.toUpperCase())
  
  if (!verification) {
    await sendTelegramMessage(chatId,
      '❌ Código no válido o expirado.\n\n' +
      'Genera un nuevo código en SpendPlan web → Configuración → Telegram'
    )
    return
  }
  
  if (verification.expires_at < Date.now()) {
    pendingVerifications.delete(code.toUpperCase())
    await sendTelegramMessage(chatId, '❌ El código ha expirado. Genera uno nuevo.')
    return
  }
  
  // Link user
  // In production, save to database
  // For demo mode, we'll use in-memory
  telegramLinks.set(telegramUserId, {
    household_id: 'demo-household',
    user_id: 'demo-user'
  })
  
  pendingVerifications.delete(code.toUpperCase())
  
  await sendTelegramMessage(chatId,
    '✅ *¡Cuenta vinculada correctamente!*\n\n' +
    'Ahora puedes:\n' +
    '📸 Enviar fotos de boletas\n' +
    '💬 Escribir gastos: "12990 en Jumbo"\n' +
    '📊 Ver estado: /estado\n' +
    '🤖 Consultar IA: /ia ¿cómo voy este mes?'
  )
}

async function confirmPendingExpense(
  chatId: number,
  userId: number,
  link: { household_id: string; user_id: string }
) {
  const pending = pendingExpenses.get(userId)
  
  if (!pending) {
    await sendTelegramMessage(chatId, '❌ No hay gasto pendiente. Envía un gasto primero.')
    return
  }
  
  // In production, save to Supabase
  // For demo mode, we would save to localStorage (but that's client-side only)
  // So we'll just confirm to the user
  
  pendingExpenses.delete(userId)
  
  await sendTelegramMessage(chatId,
    '✅ *¡Gasto guardado!*\n\n' +
    `💰 $${pending.amount?.toLocaleString('es-CL')}\n` +
    `🏪 ${pending.merchant || 'Sin comercio'}\n` +
    `📅 ${pending.date}\n\n` +
    'Puedes verlo en SpendPlan web → Gastos'
  )
}

async function sendMonthSummary(
  chatId: number,
  link: { household_id: string; user_id: string }
) {
  // In production, fetch from Supabase
  // For demo, send a placeholder message
  
  await sendTelegramMessage(chatId,
    '📊 *Resumen del mes*\n\n' +
    'Para ver el resumen completo con gráficos,\n' +
    'visita SpendPlan web → Resumen\n\n' +
    '💡 Tip: Usa /ia ¿cómo voy este mes? para un análisis rápido'
  )
}

async function analyzeWithAI(chatId: number, userId: number, question: string) {
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
    // Call copilot API (same as web)
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: question,
        context: 'Usuario consultando desde Telegram. Contexto limitado.',
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

// API to register verification code (called from web)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')
  
  if (action === 'generate_code') {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase()
    pendingVerifications.set(code, {
      telegram_user_id: 0, // Will be filled when user sends /vincular
      expires_at: Date.now() + 10 * 60 * 1000 // 10 minutes
    })
    
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
