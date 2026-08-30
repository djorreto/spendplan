const DEFAULT_DOMAIN = 'mail.spendplan.cl'

export function inboundEmailDomain(): string {
  return process.env.NEXT_PUBLIC_INBOUND_EMAIL_DOMAIN || DEFAULT_DOMAIN
}

export function generateInboundToken(): string {
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function householdInboundAddress(token: string | null | undefined): string | null {
  if (!token) return null
  return `gastos+${token}@${inboundEmailDomain()}`
}

export function extractEmailAddress(raw: string): string {
  const angled = raw.match(/<([^>]+)>/)
  return (angled ? angled[1] : raw).trim().toLowerCase()
}

export function extractInboundToken(addresses: Array<string | null | undefined>): string | null {
  const domain = inboundEmailDomain().toLowerCase()
  const escaped = domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`^gastos\\+([a-f0-9]{8,16})@${escaped}$`, 'i')
  for (const raw of addresses) {
    if (!raw) continue
    const match = extractEmailAddress(raw).match(re)
    if (match) return match[1].toLowerCase()
  }
  return null
}
