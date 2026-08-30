export type BankEmailGuide = {
  id: string
  name: string
  country: string
  filter: string
  search: string
  label: string
  senders: string[]
  activateAlerts: string[]
  notes: string[]
}

export const BANK_EMAIL_GUIDES: BankEmailGuide[] = [
  {
    id: 'itau',
    name: 'Itaú',
    country: 'Chile',
    filter: '@itau.cl OR @correo.itau.cl',
    search: 'from:(@itau.cl OR @correo.itau.cl)',
    label: 'Itaú',
    senders: [
      'Cualquier dirección que termine en @itau.cl',
      'Cualquier dirección que termine en @correo.itau.cl',
      'Ejemplos: notificaciones@itau.cl, avisos@itau.cl, no-reply@itau.cl',
    ],
    activateAlerts: [
      'Entra a la App Itaú Chile o a itau.cl con tu RUT.',
      'En tu perfil, confirma que el correo registrado es tu Gmail. Si Itaú tiene otro mail, los avisos nunca llegan a SpendPlan.',
      'Activa avisos por email de compras, transferencias y movimientos de tarjeta. Suele estar en tarjetas, seguridad o notificaciones.',
      'Si solo tienes campanita en el celular (push) y no correo, SpendPlan no ve el gasto.',
      'Haz una compra chica o espera un aviso real. Tiene que aparecer en Gmail (bandeja, Promociones o Spam) antes de seguir.',
    ],
    notes: [
      'No reenvíes todo Gmail. Solo el filtro de Itaú.',
      'Diego y Mari usan la misma casilla del hogar.',
      'El mail de confirmación de Gmail no llega a tu bandeja: está en Resend → Receiving.',
    ],
  },
]

export function getBankEmailGuide(id: string): BankEmailGuide | undefined {
  return BANK_EMAIL_GUIDES.find((bank) => bank.id === id)
}
