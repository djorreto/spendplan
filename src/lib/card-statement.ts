import { classifyCardLine } from '@/lib/merchant-aliases'
import { parseCuotaFromText, parseCuotaPair, type ParsedCuota } from '@/lib/installments'

export type CardStatementLine = {
  date: string
  description: string
  merchant: string
  billedAmount: number
  principal?: number
  cuotaIndex?: number
  cuotaTotal?: number
}

export function cuotaFromStatementLine(line: CardStatementLine): ParsedCuota | null {
  if (line.cuotaIndex != null && line.cuotaTotal != null) {
    return parseCuotaPair(line.cuotaIndex, line.cuotaTotal)
  }
  return parseCuotaFromText(`${line.description} ${line.merchant}`)
}

export function shouldSkipCardLine(line: CardStatementLine): { skip: boolean; reason: string } | null {
  const kind = classifyCardLine(`${line.description} ${line.merchant}`)
  if (kind === 'payment') {
    return { skip: true, reason: 'Pago a la tarjeta, no es gasto' }
  }
  if (line.billedAmount <= 0 && kind !== 'refund') {
    return { skip: true, reason: 'Monto cero o negativo' }
  }
  const cuota = cuotaFromStatementLine(line)
  if (cuota?.deferred && line.billedAmount === 0) {
    return null
  }
  return null
}

export function billedAmountOf(line: CardStatementLine): number {
  if (line.billedAmount > 0) return line.billedAmount
  const cuota = cuotaFromStatementLine(line)
  if (cuota && line.principal && cuota.total >= 2) {
    return Math.round(line.principal / cuota.total)
  }
  return Math.abs(line.principal || 0)
}
