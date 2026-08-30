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
      'Cualquier correo que termine en @itau.cl',
      'Cualquier correo que termine en @correo.itau.cl',
    ],
    activateAlerts: [
      'Abre la app Itaú Chile o entra a itau.cl con tu RUT.',
      'En tu perfil, el correo del banco debe ser el mismo Gmail que usas aquí. Si Itaú tiene otro mail, los avisos nunca llegan.',
      'Activa avisos por correo de compras, transferencias y tarjeta. Suele estar en perfil, seguridad o notificaciones.',
      'Si solo te llega la campanita del celular y no un mail, SpendPlan no ve el gasto.',
    ],
    notes: [
      'No reenvíes todo Gmail. Solo el filtro de Itaú.',
      'Si en el hogar hay dos Gmail, cada persona hace el filtro en el suyo, con la misma casilla.',
    ],
  },
]

export function getBankEmailGuide(id: string): BankEmailGuide | undefined {
  return BANK_EMAIL_GUIDES.find((bank) => bank.id === id)
}
