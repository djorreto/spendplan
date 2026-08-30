import { createHmac, timingSafeEqual } from 'crypto'

export function verifyResendWebhook(
  payload: string,
  headers: { id: string; timestamp: string; signature: string },
  secret: string
): void {
  const timestamp = Number(headers.timestamp)
  if (!Number.isFinite(timestamp)) {
    throw new Error('Missing webhook timestamp')
  }
  const ageSeconds = Math.abs(Date.now() / 1000 - timestamp)
  if (ageSeconds > 5 * 60) {
    throw new Error('Webhook timestamp too old')
  }

  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const expected = createHmac('sha256', secretBytes)
    .update(`${headers.id}.${headers.timestamp}.${payload}`)
    .digest('base64')
  const expectedBuf = Buffer.from(expected)
  const candidates = headers.signature.split(/\s+/).map((part) =>
    part.startsWith('v1,') ? part.slice(3) : part
  )

  const ok = candidates.some((sig) => {
    const buf = Buffer.from(sig)
    return buf.length === expectedBuf.length && timingSafeEqual(buf, expectedBuf)
  })
  if (!ok) {
    throw new Error('Invalid webhook signature')
  }
}
