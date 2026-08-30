export type GmailForwardingStatus = 'confirmed' | 'needs_click'

export type GmailForwardingState = {
  status: GmailForwardingStatus
  confirmed_at?: string
  confirmation_url?: string | null
  confirmation_code?: string | null
  gmail_address?: string | null
}

export function isGmailForwardingConfirmation(input: {
  subject?: string | null
  from?: string | null
  text?: string | null
}): boolean {
  const from = (input.from || '').toLowerCase()
  const subject = (input.subject || '').toLowerCase()
  const text = (input.text || '').toLowerCase()
  if (from.includes('forwarding-noreply@google.com')) return true
  if (subject.includes('gmail forwarding confirmation')) return true
  if (subject.includes('confirmacion de reenvio') || subject.includes('confirmación de reenvío')) return true
  if (text.includes('gmail forwarding confirmation')) return true
  if (text.includes('confirmación de reenvío de gmail') || text.includes('confirmacion de reenvio de gmail')) {
    return true
  }
  return false
}

export function parseGmailForwardingConfirmation(text: string, html?: string | null) {
  const hay = `${text}\n${html || ''}`
  const urlMatch =
    hay.match(/https:\/\/mail\.google\.com\/mail\/[^\s"'<>\\]+/i) ||
    hay.match(/https:\/\/[^\s"'<>\\]*google\.com\/mail\/vf-[^\s"'<>\\]+/i)
  const codeMatch = hay.match(
    /(?:confirmation code|c[oó]digo de confirmaci[oó]n)[:\s]+([A-Z0-9]{6,12})/i
  )
  const gmailMatch = hay.match(/([a-z0-9._%+-]+@gmail\.com)/i)
  const rawUrl = urlMatch?.[0] || null
  return {
    confirmation_url: rawUrl ? rawUrl.replace(/[.,;)\]]+$/, '') : null,
    confirmation_code: codeMatch?.[1] || null,
    gmail_address: gmailMatch?.[1].toLowerCase() || null,
  }
}

export async function tryConfirmGmailForwarding(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
    })
    const body = (await res.text()).toLowerCase()
    if (!res.ok) return false
    if (
      body.includes('unable to verify') ||
      body.includes('link has expired') ||
      body.includes('el v[ií]nculo ha caducado') ||
      body.includes('no se pudo verificar')
    ) {
      return false
    }
    return (
      body.includes('forwarding is confirmed') ||
      body.includes('has been confirmed') ||
      body.includes('confirmation was successful') ||
      body.includes('thank you for confirming') ||
      body.includes('reenvío confirmado') ||
      body.includes('reenvio confirmado') ||
      body.includes('ha sido confirmado') ||
      body.includes('gracias por confirmar') ||
      body.includes('confirmación correcta')
    )
  } catch {
    return false
  }
}
