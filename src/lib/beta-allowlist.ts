export const PRIVATE_BETA_BLOCK_MESSAGE =
  'Debes contar con una invitación directa de SpendPlan. Ponte en contacto con nosotros para tener acceso.'

export function normalizeEmail(email: string): string {
  return String(email || '').trim().toLowerCase()
}

export function isBetaModeEnabled(): boolean {
  const raw = process.env.BETA_MODE
  if (!raw) return false
  const v = String(raw).trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes' || v === 'on'
}

