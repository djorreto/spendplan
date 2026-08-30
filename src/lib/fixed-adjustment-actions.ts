import type { SupabaseClient } from '@supabase/supabase-js'
import { isProposedAdjustment, type FixedAdjustment } from '@/lib/match-fixed-item'

export async function acceptFixedAdjustment(
  supabase: SupabaseClient,
  params: {
    expenseId: string
    householdId: string
    adjustment: FixedAdjustment
    userId?: string | null
    confirmExpense?: boolean
  }
) {
  if (!isProposedAdjustment(params.adjustment)) {
    return { error: new Error('no_proposed_adjustment') }
  }

  const { error: budgetError } = await supabase
    .from('budget_items')
    .update({
      amount: params.adjustment.new_amount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.adjustment.budget_item_id)
    .eq('household_id', params.householdId)
  if (budgetError) return { error: budgetError }

  const expensePatch: Record<string, unknown> = {
    ai_adjustment: { ...params.adjustment, status: 'accepted' },
    is_unbudgeted: false,
    updated_by: params.userId || null,
  }
  if (params.confirmExpense) expensePatch.status = 'confirmed'

  const { error } = await supabase.from('expenses').update(expensePatch).eq('id', params.expenseId)
  return { error }
}

export async function rejectFixedAdjustment(
  supabase: SupabaseClient,
  params: {
    expenseId: string
    adjustment: FixedAdjustment
    userId?: string | null
    keepCategory?: boolean
  }
) {
  if (!isProposedAdjustment(params.adjustment)) {
    return { error: new Error('no_proposed_adjustment') }
  }

  const { error } = await supabase
    .from('expenses')
    .update({
      ai_adjustment: { ...params.adjustment, status: 'rejected' },
      category_id: params.keepCategory ? undefined : null,
      is_unbudgeted: true,
      ai_reason: `SpendPlan pensó que era el fijo ${params.adjustment.item_name}, pero no era. Recategoriza este gasto.`,
      updated_by: params.userId || null,
    })
    .eq('id', params.expenseId)
  return { error }
}
