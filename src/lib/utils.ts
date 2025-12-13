import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Combina clases de Tailwind de forma inteligente
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Formatea un número como moneda
 */
export function formatCurrency(amount: number, currency: string = 'CLP'): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

/**
 * Formatea un número grande de forma compacta
 */
export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat('es-CL', {
    notation: 'compact',
    compactDisplay: 'short',
  }).format(value)
}

/**
 * Formatea una fecha en formato corto
 */
export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('es-CL', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(date))
}

/**
 * Formatea una fecha con hora
 */
export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat('es-CL', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

/**
 * Formatea fecha relativa (hace X tiempo)
 */
export function formatRelativeDate(date: string | Date): string {
  const now = new Date()
  const d = new Date(date)
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Hoy'
  if (diffDays === 1) return 'Ayer'
  if (diffDays < 7) return `Hace ${diffDays} días`
  if (diffDays < 30) return `Hace ${Math.floor(diffDays / 7)} semanas`
  return formatDate(date)
}

/**
 * Obtiene el mes actual en formato YYYY-MM
 */
export function getCurrentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Obtiene el rango de fechas para un mes YYYY-MM
 * - start: YYYY-MM-01 (inclusive)
 * - endExclusive: primer día del mes siguiente (exclusive)
 *
 * Esto evita bugs tipo "2025-11-31" (fecha inválida) y funciona para febrero.
 */
export function getMonthDateRange(month: string): { start: string; endExclusive: string } {
  const [yearStr, monthStr] = month.split('-')
  const year = Number(yearStr)
  const m = Number(monthStr)
  if (!year || !m) {
    const cur = getCurrentMonth()
    return getMonthDateRange(cur)
  }
  const start = `${year}-${String(m).padStart(2, '0')}-01`
  const next = new Date(year, m, 1) // JS month is 0-based; passing m gives next month
  const endExclusive = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`
  return { start, endExclusive }
}

/**
 * Obtiene la fecha actual en formato YYYY-MM-DD
 */
export function getCurrentDate(): string {
  return new Date().toISOString().split('T')[0]
}

/**
 * Formatea un mes YYYY-MM a texto legible
 */
export function formatMonth(month: string): string {
  const [year, m] = month.split('-')
  const date = new Date(parseInt(year), parseInt(m) - 1, 1)
  return new Intl.DateTimeFormat('es-CL', {
    year: 'numeric',
    month: 'long',
  }).format(date)
}

/**
 * Obtiene el mes anterior en formato YYYY-MM
 */
export function getPreviousMonth(month: string): string {
  const [year, m] = month.split('-').map(Number)
  const date = new Date(year, m - 2, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Obtiene el mes siguiente en formato YYYY-MM
 */
export function getNextMonth(month: string): string {
  const [year, m] = month.split('-').map(Number)
  const date = new Date(year, m, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Obtiene las iniciales de un nombre
 */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(word => word.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

/**
 * Genera un ID único simple
 */
export function generateId(): string {
  return Math.random().toString(36).substr(2, 9)
}

/**
 * Función debounce
 */
export function debounce<T extends (...args: Parameters<T>) => ReturnType<T>>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout
  return (...args: Parameters<T>) => {
    clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

/**
 * Capitaliza la primera letra
 */
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

/**
 * Trunca un texto
 */
export function truncate(str: string, length: number): string {
  if (str.length <= length) return str
  return str.slice(0, length) + '...'
}

/**
 * Espera un tiempo determinado
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Calcula el porcentaje
 */
export function percentage(value: number, total: number): number {
  if (total === 0) return 0
  return Math.round((value / total) * 100)
}

/**
 * Colores para categorías
 */
export const categoryColors: Record<string, string> = {
  'supermercado': '#22c55e',
  'servicios': '#3b82f6',
  'transporte': '#f59e0b',
  'salud': '#ef4444',
  'deuda/hipoteca': '#8b5cf6',
  'seguros': '#06b6d4',
  'ocio': '#ec4899',
  'educación': '#14b8a6',
  'hogar': '#f97316',
  'auto': '#84cc16',
  'suscripciones': '#a855f7',
  'restaurantes': '#f43f5e',
  'mascotas': '#10b981',
  'ropa': '#6366f1',
  'regalos': '#d946ef',
  'viajes': '#0ea5e9',
  'sin clasificar': '#9ca3af',
}

/**
 * Obtiene el color de una categoría
 */
export function getCategoryColor(categoryName: string, fallback?: string): string {
  const key = categoryName.toLowerCase()
  return categoryColors[key] || fallback || '#9ca3af'
}

/**
 * Métodos de pago con labels
 */
export const paymentMethodLabels: Record<string, string> = {
  cash: 'Efectivo',
  debit: 'Débito',
  credit: 'Crédito',
  transfer: 'Transferencia',
  unknown: 'No especificado',
}

/**
 * Obtiene el label de un método de pago
 */
export function getPaymentMethodLabel(method: string): string {
  return paymentMethodLabels[method] || method
}

/**
 * Parsea un monto desde string (soporta formato chileno)
 */
export function parseAmount(value: string): number {
  // Remover $ y espacios
  let clean = value.replace(/[$\s]/g, '')
  // Si tiene puntos como separador de miles y coma como decimal
  if (clean.includes('.') && clean.includes(',')) {
    clean = clean.replace(/\./g, '').replace(',', '.')
  } else if (clean.includes('.') && !clean.includes(',')) {
    // Solo puntos: asumir que es separador de miles si hay más de 2 decimales implícitos
    const parts = clean.split('.')
    if (parts.length > 1 && parts[parts.length - 1].length > 2) {
      clean = clean.replace(/\./g, '')
    }
  } else if (clean.includes(',')) {
    clean = clean.replace(',', '.')
  }
  return parseFloat(clean) || 0
}
