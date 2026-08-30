import type { Category, Expense } from '@/types'

const GROUP_BY_NAME: Record<string, string> = {
  supermercado: 'Alimentación',
  restaurantes: 'Alimentación',
  delivery: 'Alimentación',
  transporte: 'Transporte',
  auto: 'Transporte',
  'deuda/hipoteca': 'Vivienda',
  hogar: 'Vivienda',
  'cuidado del hogar': 'Vivienda',
  servicios: 'Servicios',
  seguros: 'Servicios',
  salud: 'Salud',
  ropa: 'Familia',
  león: 'Familia',
  leon: 'Familia',
  educación: 'Familia',
  mascotas: 'Familia',
  ocio: 'Ocio',
  viajes: 'Ocio',
  regalos: 'Ocio',
  suscripciones: 'Digital',
  'mercado pago': 'Digital',
  'cargos tarjeta': 'Finanzas',
  'sin clasificar': 'Otros',
}

export function categoryGroupName(categoryName: string | null | undefined): string {
  if (!categoryName) return 'Sin categoría'
  const key = categoryName.trim().toLowerCase()
  return GROUP_BY_NAME[key] || 'Otros'
}

export function resolveCategoryParts(
  category: Category | null | undefined,
  all: Category[]
): { group: string; subcategory: string } {
  if (!category) return { group: 'Sin categoría', subcategory: '—' }
  if (category.parent_id) {
    const parent = all.find((item) => item.id === category.parent_id)
    return {
      group: parent?.name || categoryGroupName(category.name),
      subcategory: category.name,
    }
  }
  return {
    group: categoryGroupName(category.name),
    subcategory: category.name,
  }
}

export function originalExpenseText(expense: Pick<Expense, 'merchant' | 'description' | 'notes'>): string {
  const asunto = (expense.notes || '')
    .split('\n')
    .find((line) => line.toLowerCase().startsWith('asunto:'))
    ?.slice(7)
    .trim()
  if (asunto) return asunto

  const merchant = expense.merchant?.trim() || ''
  const description = expense.description?.trim() || ''
  if (merchant) return merchant
  if (description) return description
  return '—'
}

export function originalExpenseDetail(expense: Pick<Expense, 'merchant' | 'description'>): string | null {
  const merchant = expense.merchant?.trim() || ''
  const description = expense.description?.trim() || ''
  if (merchant && description && merchant.toLowerCase() !== description.toLowerCase()) {
    return description
  }
  return null
}
