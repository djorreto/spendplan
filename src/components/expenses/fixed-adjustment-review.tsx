'use client'

import { useState } from 'react'
import type { Expense } from '@/types'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import { useHousehold } from '@/hooks/use-household'
import { useToast } from '@/components/ui/toast'
import { acceptFixedAdjustment, rejectFixedAdjustment } from '@/lib/fixed-adjustment-actions'
import { isProposedAdjustment, type FixedAdjustment } from '@/lib/match-fixed-item'
import { supabaseBrowser } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'

type ExpensePatch = Partial<Expense> & { category?: Expense['category'] | null }

export function FixedAdjustmentReview({
  expense,
  onPatched,
  compact = false,
}: {
  expense: Expense
  onPatched: (id: string, patch: ExpensePatch) => void
  compact?: boolean
}) {
  const { user } = useAuth()
  const { currentHousehold } = useHousehold()
  const { addToast } = useToast()
  const [saving, setSaving] = useState(false)
  const adjustment = expense.ai_adjustment
  if (!isProposedAdjustment(adjustment) || !currentHousehold) return null

  const changed = adjustment.previous_amount !== adjustment.new_amount
  const currency = currentHousehold.currency

  const handleAccept = async () => {
    setSaving(true)
    const supabase = supabaseBrowser()
    const { error } = await acceptFixedAdjustment(supabase, {
      expenseId: expense.id,
      householdId: currentHousehold.id,
      adjustment,
      userId: user?.id,
      confirmExpense: expense.status === 'pending',
    })
    setSaving(false)
    if (error) {
      addToast({ type: 'error', message: 'No pude actualizar el fijo' })
      return
    }
    onPatched(expense.id, {
      ai_adjustment: { ...adjustment, status: 'accepted' },
      is_unbudgeted: false,
      status: expense.status === 'pending' ? 'confirmed' : expense.status,
    })
    addToast({
      type: 'success',
      message: changed
        ? `Actualicé ${adjustment.item_name} a ${formatCurrency(adjustment.new_amount, currency)}`
        : `Confirmé que es el fijo ${adjustment.item_name}`,
    })
  }

  const handleReject = async () => {
    setSaving(true)
    const supabase = supabaseBrowser()
    const { error } = await rejectFixedAdjustment(supabase, {
      expenseId: expense.id,
      adjustment,
      userId: user?.id,
    })
    setSaving(false)
    if (error) {
      addToast({ type: 'error', message: 'No pude rechazar el ajuste' })
      return
    }
    onPatched(expense.id, {
      ai_adjustment: { ...adjustment, status: 'rejected' },
      category_id: null,
      category: null,
      is_unbudgeted: true,
      ai_reason: `SpendPlan pensó que era el fijo ${adjustment.item_name}, pero no era. Recategoriza este gasto.`,
    })
    addToast({ type: 'success', message: 'Listo. Elige la categoría correcta.' })
  }

  return (
    <div
      className={
        compact
          ? 'rounded-md border border-sky-200 bg-sky-50 px-2 py-1.5 text-xs dark:border-sky-900 dark:bg-sky-950/40'
          : 'rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm dark:border-sky-900 dark:bg-sky-950/40'
      }
      onClick={(event) => event.stopPropagation()}
    >
      <p className="font-medium text-sky-950 dark:text-sky-100">
        SpendPlan cree que es el fijo {adjustment.item_name}
      </p>
      <p className="text-sky-800 dark:text-sky-200 mt-0.5">
        Presupuesto {formatCurrency(adjustment.previous_amount, currency)}
        {changed ? ` → cargo ${formatCurrency(adjustment.new_amount, currency)}` : ' · el cargo coincide'}
      </p>
      {adjustment.reason && (
        <p className="text-muted-foreground mt-0.5 leading-snug">{adjustment.reason}</p>
      )}
      <div className="flex flex-wrap gap-2 mt-2">
        <Button type="button" size="sm" className="h-7 text-xs" disabled={saving} onClick={handleAccept}>
          {changed
            ? `Sí, actualizar el fijo`
            : 'Sí, es este fijo'}
        </Button>
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={saving} onClick={handleReject}>
          No era este — recategorizar
        </Button>
      </div>
    </div>
  )
}

export function hasProposedAdjustment(expense: Pick<Expense, 'ai_adjustment'>): expense is Expense & {
  ai_adjustment: FixedAdjustment
} {
  return isProposedAdjustment(expense.ai_adjustment)
}
