import type { PaymentMethod } from '@/types'

export type ParsedBankEmail = {
  amount: number | null
  merchant: string | null
  description: string | null
  expense_date: string | null
  payment_method: PaymentMethod
  confidence: number
}

const PURCHASE_NEAR =
  /compra|cargo|pago|pagaste|pag\u00f3|transferiste|giro|monto|cobro|d[e\u00e9]bito|consumo|transacci[o\u00f3]n/i
const IGNORE_NEAR =
  /saldo|disponible|cupo|deuda|l[i\u00ed]nea|avance en efectivo|pago m[i\u00ed]nimo/i
const BANKISH =
  /banco|santander|estado|bci|ita[u\u00fa]|scotiabank|mach|tenpo|transbank|cmr|notificaci[o\u00f3]n|aviso|correo/i

export function htmlToText(html: string | null | undefined): string {
  if (!html) return ''
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

export function parseChileanAmount(raw: string): number | null {
  const s = raw.replace(/\s/g, '').replace(/^(clp|\$)+/i, '').replace(/(clp|pesos)$/i, '')
  if (!s) return null

  if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    return parseInt(s.replace(/\./g, ''), 10)
  }
  if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(s)) {
    return Math.round(parseFloat(s.replace(/\./g, '').replace(',', '.')))
  }
  if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s)) {
    return Math.round(parseFloat(s.replace(/,/g, '')))
  }
  if (/^\d+,\d{1,2}$/.test(s)) {
    return Math.round(parseFloat(s.replace(',', '.')))
  }
  if (/^\d+\.\d{1,2}$/.test(s)) {
    return Math.round(parseFloat(s))
  }
  if (/^\d+$/.test(s)) {
    const n = parseInt(s, 10)
    return n > 0 ? n : null
  }
  return null
}

function todayInSantiago(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function parseDate(text: string): string | null {
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

  const dmy = text.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/)
  if (dmy) {
    const day = dmy[1].padStart(2, '0')
    const month = dmy[2].padStart(2, '0')
    let year = dmy[3]
    if (year.length === 2) year = `20${year}`
    if (Number(month) >= 1 && Number(month) <= 12 && Number(day) >= 1 && Number(day) <= 31) {
      return `${year}-${month}-${day}`
    }
  }

  const months: Record<string, string> = {
    enero: '01',
    febrero: '02',
    marzo: '03',
    abril: '04',
    mayo: '05',
    junio: '06',
    julio: '07',
    agosto: '08',
    septiembre: '09',
    setiembre: '09',
    octubre: '10',
    noviembre: '11',
    diciembre: '12',
  }
  const named = text.match(/\b(\d{1,2})\s+de\s+([a-z\u00e1\u00e9\u00ed\u00f3\u00fa]+)\s+(?:de\s+)?(20\d{2})/i)
  if (named) {
    const month = months[named[2].toLowerCase()]
    if (month) return `${named[3]}-${month}-${named[1].padStart(2, '0')}`
  }

  return null
}

function parsePaymentMethod(text: string): PaymentMethod {
  const t = text.toLowerCase()
  if (/cr[e\u00e9]dito|visa|mastercard|amex|tarjeta de cr[e\u00e9]dito/.test(t)) return 'credit'
  if (/d[e\u00e9]bito|tarjeta de d[e\u00e9]bito/.test(t)) return 'debit'
  if (/transferencia|tef|transferiste/.test(t)) return 'transfer'
  if (/efectivo/.test(t)) return 'cash'
  return 'unknown'
}

function cleanMerchant(value: string): string | null {
  const cut = value
    .split(/\s+(?:el|con|por|usando|fecha)\s+|\s+\d{1,2}[\/\-.]|[,.;]|\bsaldo\b/i)[0]
  const cleaned = cut
    .replace(/\s+/g, ' ')
    .replace(/[.,;:]+$/, '')
    .trim()
  if (cleaned.length < 2 || cleaned.length > 80) return null
  if (BANKISH.test(cleaned) && cleaned.split(' ').length <= 3) return null
  return cleaned
}

function pickMerchant(text: string): string | null {
  const patterns = [
    /(?:comercio|establecimiento|local|comercio adherido)\s*[:\-]\s*([^\n]{2,80})/i,
    /(?:compra|cargo|pago|consumo)\s+(?:por\s+)?(?:\$?\s*[\d.]+(?:[,.]\d+)?\s+)?en\s+([A-Z\u00c1\u00c9\u00cd\u00d3\u00da\u00d10-9][^\n]{1,80})/i,
    /\ben\s+([A-Z\u00c1\u00c9\u00cd\u00d3\u00da\u00d1][A-Z\u00c1\u00c9\u00cd\u00d3\u00da\u00d10-9\s.&'\-]{1,60})/,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (!match) continue
    const merchant = cleanMerchant(match[1])
    if (merchant) return merchant
  }
  return null
}

function pickAmount(text: string): { amount: number | null; confidence: number } {
  const re = /(?:clp\s*)?\$?\s*(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:[.,]\d{1,2})?)/gi
  let best: { amount: number; score: number } | null = null
  let match: RegExpExecArray | null
  while ((match = re.exec(text))) {
    const amount = parseChileanAmount(match[0])
    if (!amount || amount < 100 || amount > 99_000_000) continue
    const start = Math.max(0, match.index - 48)
    const end = Math.min(text.length, match.index + match[0].length + 48)
    const window = text.slice(start, end)
    if (IGNORE_NEAR.test(window)) continue
    let score = 1
    if (PURCHASE_NEAR.test(window)) score += 3
    if (/\$/.test(match[0])) score += 1
    if (/\.\d{3}/.test(match[0])) score += 1
    if (!best || score > best.score || (score === best.score && amount > best.amount && score >= 3)) {
      best = { amount, score }
    }
  }
  if (!best) return { amount: null, confidence: 0 }
  return { amount: best.amount, confidence: Math.min(0.95, 0.45 + best.score * 0.12) }
}

export function parseBankEmail(input: {
  subject?: string | null
  text?: string | null
  html?: string | null
}): ParsedBankEmail {
  const subject = (input.subject || '').replace(/^fwd:\s*/i, '').replace(/^rv:\s*/i, '').trim()
  const body = (input.text || htmlToText(input.html) || '').trim()
  const combined = `${subject}\n${body}`

  const { amount, confidence } = pickAmount(combined)
  const merchant = pickMerchant(combined)
  const expense_date = parseDate(combined)
  const payment_method = parsePaymentMethod(combined)

  return {
    amount,
    merchant,
    description: subject || merchant || 'Correo banco',
    expense_date,
    payment_method,
    confidence: amount ? (merchant ? Math.max(confidence, 0.6) : confidence) : 0,
  }
}

export function defaultExpenseDate(parsed: ParsedBankEmail): string {
  return parsed.expense_date || todayInSantiago()
}
