const WEAK_TOKENS = new Set([
  'cuota',
  'compra',
  'pago',
  'pagos',
  'chile',
  'santiago',
  'mercado',
  'mercadopago',
  'tarjeta',
  'supermercado',
  'comercio',
  'store',
  'spa',
  'ltda',
  'tcom',
])

const ALIAS_GROUPS: string[][] = [
  ['granja magdalena', 'granjama', 'mercado pago granjama', 'mercadopago granjama'],
  ['frutas ama', 'mercado pago ama', 'mercadopago ama', 'mercadopago *ama'],
  ['uber eats', 'payu uber', 'payu *uber eats'],
  ['vtr', 'vtr pat'],
  ['zapping', 'zapping chile', 'zapping/netflix', 'zapping / netflix'],
  ['leche leon', 'bk gruppe', 'bk gruppe ltda'],
  ['lider', 'hip lider', 'hip lider buenaventura'],
  ['unimarc', 'unimarc las tranqueras', 'unimarc los trapenses'],
  ['jumbo', 'jumbo alto las condes'],
  ['salcobrand', 'salcobrand vitacura'],
  ['sodimac', 'sodimac las condes'],
  ['clinica alemana', 'auto cl alemana', 'clinica alemana de stg'],
  ['mestiere', 'safqa', 'comercial safqa'],
  ['cruz verde', 'cruzverd', 'mercadopago cruzverd'],
  ['fuentema', 'mercadopago fuentema'],
  ['sur365', 'mercadopago sur365', 'sur365sp'],
  ['monkitoys', 'monkitoys-vitacura'],
  ['h&m', 'h&m casascostanera', 'hm casascostanera'],
  ['ticketmaster', 'ticketmaster santiago'],
  ['comision tarjeta', 'comision administracion', 'comision administracion mensual'],
  ['impuesto tarjeta', 'impuesto decreto ley'],
  ['deuda internacional', 'traspaso deuda internacional'],
  ['interes rotativo', 'intereses rotativos'],
]

function fold(value: string) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function strongTokens(value: string): string[] {
  return fold(value)
    .split(' ')
    .filter((item) => item.length >= 3 && !WEAK_TOKENS.has(item))
}

export function merchantKey(value: string): string {
  const folded = fold(value)
  if (!folded) return ''
  for (const group of ALIAS_GROUPS) {
    if (group.some((alias) => folded.includes(fold(alias)))) {
      return group[0]
    }
  }
  const strong = strongTokens(value)
  return strong.length > 0 ? strong.join(' ') : folded
}

export function merchantsMatch(a: string, b: string): boolean {
  const left = fold(a)
  const right = fold(b)
  if (!left || !right) return false
  if (left === right) return true

  const keyA = merchantKey(a)
  const keyB = merchantKey(b)
  if (keyA && keyB && keyA === keyB) return true

  const aTokens = strongTokens(a)
  const bTokens = strongTokens(b)
  if (aTokens.length === 0 || bTokens.length === 0) return false
  const overlap = aTokens.filter((item) => bTokens.includes(item)).length
  return overlap >= 1 && overlap / Math.min(aTokens.length, bTokens.length) >= 0.5
}

export function classifyCardLine(text: string): 'payment' | 'refund' | 'fee' | 'purchase' {
  const raw = fold(text)
  if (/monto cancelado|pagos a la cuenta|pago recibido|pago de tarjeta/.test(raw)) return 'payment'
  if (/\babono\b|devolucion|nota de credito/.test(raw)) return 'refund'
  if (
    /impuesto decreto|comision administracion|intereses rotativos|traspaso deuda|cargo automatico/.test(
      raw
    )
  ) {
    return 'fee'
  }
  return 'purchase'
}
