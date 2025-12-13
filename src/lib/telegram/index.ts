/**
 * ========================================
 * 📱 TELEGRAM BOT SERVICE
 * ========================================
 * Canal adicional de entrada/salida para SpendPlan
 * Reutiliza el mismo pipeline de OCR, parsing y Groq
 */

// Storage key for telegram user links
export const TELEGRAM_LINKS_KEY = 'spendplan_telegram_links'

export interface TelegramUserLink {
  telegram_user_id: number
  telegram_username?: string
  household_id: string
  user_id: string
  linked_at: string
  verification_code?: string
}

export interface TelegramMessage {
  message_id: number
  from: {
    id: number
    first_name: string
    username?: string
  }
  chat: {
    id: number
    type: string
  }
  text?: string
  photo?: Array<{
    file_id: string
    file_unique_id: string
    width: number
    height: number
  }>
  date: number
}

/**
 * Get linked user by Telegram ID
 */
export function getLinkedUser(telegramUserId: number): TelegramUserLink | null {
  if (typeof window !== 'undefined') {
    const links = JSON.parse(localStorage.getItem(TELEGRAM_LINKS_KEY) || '[]')
    return links.find((l: TelegramUserLink) => l.telegram_user_id === telegramUserId) || null
  }
  return null
}

/**
 * Link Telegram user to SpendPlan household
 */
export function linkTelegramUser(
  telegramUserId: number,
  telegramUsername: string | undefined,
  householdId: string,
  userId: string
): TelegramUserLink {
  const link: TelegramUserLink = {
    telegram_user_id: telegramUserId,
    telegram_username: telegramUsername,
    household_id: householdId,
    user_id: userId,
    linked_at: new Date().toISOString()
  }
  
  if (typeof window !== 'undefined') {
    const links = JSON.parse(localStorage.getItem(TELEGRAM_LINKS_KEY) || '[]')
    // Remove existing link for this telegram user
    const filtered = links.filter((l: TelegramUserLink) => l.telegram_user_id !== telegramUserId)
    filtered.push(link)
    localStorage.setItem(TELEGRAM_LINKS_KEY, JSON.stringify(filtered))
  }
  
  return link
}

/**
 * Generate verification code for linking
 */
export function generateVerificationCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

/**
 * Parse expense from text message (same logic as web)
 */
export function parseExpenseFromText(text: string): {
  amount: number | null
  merchant: string | null
  description: string | null
  payment_method: 'cash' | 'debit' | 'credit' | 'transfer' | null
} {
  const result: ReturnType<typeof parseExpenseFromText> = {
    amount: null,
    merchant: null,
    description: null,
    payment_method: null
  }
  
  // Extract amount (various formats)
  const amountPatterns = [
    /\$?\s*([\d.,]+)\s*(?:pesos|clp)?/i,
    /(?:gasto|compra|pago)\s+(?:de\s+)?\$?\s*([\d.,]+)/i,
    /([\d.,]+)\s+(?:en|a)\s+/i,
  ]
  
  for (const pattern of amountPatterns) {
    const match = text.match(pattern)
    if (match) {
      const amountStr = match[1].replace(/\./g, '').replace(',', '.')
      const amount = parseFloat(amountStr)
      if (!isNaN(amount) && amount > 0 && amount < 100000000) {
        result.amount = Math.round(amount)
        break
      }
    }
  }
  
  // Extract merchant (after "en" or capitalized words)
  const merchantPatterns = [
    /(?:en|a)\s+([A-Za-zÁÉÍÓÚáéíóúñÑ\s]+?)(?:\s+con|\s+\$|\s+\d|$)/i,
    /(?:compra|gasto|pago)\s+(?:en\s+)?([A-Za-zÁÉÍÓÚáéíóúñÑ\s]+?)(?:\s+\$|\s+\d|$)/i,
  ]
  
  for (const pattern of merchantPatterns) {
    const match = text.match(pattern)
    if (match && match[1].trim().length > 2) {
      result.merchant = match[1].trim()
      break
    }
  }
  
  // Extract payment method
  if (/cr[eé]dito|visa|mastercard/i.test(text)) {
    result.payment_method = 'credit'
  } else if (/d[eé]bito|redcompra/i.test(text)) {
    result.payment_method = 'debit'
  } else if (/efectivo|cash/i.test(text)) {
    result.payment_method = 'cash'
  } else if (/transferencia|transfer/i.test(text)) {
    result.payment_method = 'transfer'
  }
  
  // Use original text as description if no merchant found
  if (!result.merchant) {
    result.description = text.substring(0, 100)
  }
  
  return result
}

/**
 * Format expense for Telegram response
 */
export function formatExpenseResponse(data: {
  amount: number | null
  merchant: string | null
  date: string | null
  category: string | null
  payment_method: string | null
  confidence?: number
}): string {
  const lines: string[] = ['📝 *Gasto detectado:*\n']
  
  if (data.merchant) {
    lines.push(`🏪 Comercio: ${data.merchant}`)
  }
  if (data.amount) {
    lines.push(`💰 Monto: $${data.amount.toLocaleString('es-CL')}`)
  }
  if (data.date) {
    lines.push(`📅 Fecha: ${data.date}`)
  }
  if (data.category) {
    lines.push(`📁 Categoría: ${data.category}`)
  }
  if (data.payment_method) {
    const methods: Record<string, string> = {
      'cash': 'Efectivo',
      'debit': 'Débito',
      'credit': 'Crédito',
      'transfer': 'Transferencia'
    }
    lines.push(`💳 Pago: ${methods[data.payment_method] || data.payment_method}`)
  }
  if (data.confidence !== undefined) {
    lines.push(`\n🎯 Confianza: ${Math.round(data.confidence * 100)}%`)
  }
  
  lines.push('\n✅ /confirmar - Guardar gasto')
  lines.push('✏️ /editar - Modificar datos')
  lines.push('❌ /cancelar - Descartar')
  
  return lines.join('\n')
}

/**
 * Send message via Telegram API
 */
export async function sendTelegramMessage(
  chatId: number,
  text: string,
  options?: {
    parse_mode?: 'Markdown' | 'HTML'
    reply_markup?: object
  }
): Promise<boolean> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  if (!botToken) {
    console.error('TELEGRAM_BOT_TOKEN not configured')
    return false
  }
  
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: options?.parse_mode || 'Markdown',
        reply_markup: options?.reply_markup
      })
    })
    
    return response.ok
  } catch (error) {
    console.error('Error sending Telegram message:', error)
    return false
  }
}

/**
 * Download file from Telegram
 */
export async function downloadTelegramFile(fileId: string): Promise<Buffer | null> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  if (!botToken) return null
  
  try {
    // Get file path
    const fileResponse = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`)
    const fileData = await fileResponse.json()
    
    if (!fileData.ok || !fileData.result.file_path) {
      return null
    }
    
    // Download file
    const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`
    const response = await fetch(downloadUrl)
    const arrayBuffer = await response.arrayBuffer()
    
    return Buffer.from(arrayBuffer)
  } catch (error) {
    console.error('Error downloading Telegram file:', error)
    return null
  }
}
