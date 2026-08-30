'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Category, Expense } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { supabaseBrowser } from '@/lib/supabase'
import { categoryGroupName } from '@/lib/category-taxonomy'
import { expenseUserComment, withExpenseUserComment } from '@/lib/expense-notes'
import { isProposedAdjustment } from '@/lib/match-fixed-item'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/components/ui/toast'

type ExpensePatch = Partial<Expense> & {
  is_unbudgeted?: boolean
  category?: Category | null
}

export function ExpenseQuickEdit({
  expense,
  categories,
  budgetedCategoryIds = [],
  onPatched,
  compact = false,
}: {
  expense: Expense
  categories: Category[]
  budgetedCategoryIds?: string[]
  onPatched: (id: string, patch: ExpensePatch) => void
  compact?: boolean
}) {
  const { user } = useAuth()
  const { addToast } = useToast()
  const [saving, setSaving] = useState(false)
  const [comment, setComment] = useState(() => expenseUserComment(expense.notes))

  useEffect(() => {
    setComment(expenseUserComment(expense.notes))
  }, [expense.id, expense.notes])

  const groups = useMemo(() => {
    const map = new Map<string, Category[]>()
    for (const category of categories.filter((item) => item.name !== 'Sin clasificar')) {
      const group = categoryGroupName(category.name)
      const list = map.get(group) || []
      list.push(category)
      map.set(group, list)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'))
  }, [categories])

  const savePatch = async (patch: ExpensePatch) => {
    setSaving(true)
    const supabase = supabaseBrowser()
    const { error } = await supabase
      .from('expenses')
      .update({
        category_id: patch.category_id === undefined ? undefined : patch.category_id,
        is_unbudgeted: patch.is_unbudgeted,
        notes: patch.notes,
        ai_adjustment: patch.ai_adjustment,
        updated_by: user?.id || null,
      })
      .eq('id', expense.id)

    setSaving(false)
    if (error) {
      addToast({ type: 'error', message: 'No pude guardar el cambio' })
      return false
    }
    onPatched(expense.id, patch)
    return true
  }

  const handleCategory = async (value: string) => {
    const categoryId = value === 'unbudgeted' ? null : value
    const category = categoryId ? categories.find((item) => item.id === categoryId) || null : null
    const isUnbudgeted = !categoryId || !budgetedCategoryIds.includes(categoryId)
    const implicitReject = isProposedAdjustment(expense.ai_adjustment)
      ? { ...expense.ai_adjustment, status: 'rejected' as const }
      : undefined
    const ok = await savePatch({
      category_id: categoryId,
      is_unbudgeted: isUnbudgeted,
      category,
      ...(implicitReject ? { ai_adjustment: implicitReject } : {}),
    })
    if (ok) addToast({ type: 'success', message: 'Categoría actualizada' })
  }

  const handleComment = async () => {
    const nextNotes = withExpenseUserComment(expense.notes, comment)
    if ((nextNotes || '') === (expense.notes || '')) return
    const ok = await savePatch({ notes: nextNotes })
    if (ok) addToast({ type: 'success', message: 'Comentario guardado' })
  }

  return (
    <div
      className={compact ? 'space-y-1.5' : 'grid grid-cols-1 sm:grid-cols-2 gap-1.5 min-w-[220px]'}
      onClick={(event) => event.stopPropagation()}
    >
      <Select
        value={expense.category_id || 'unbudgeted'}
        onValueChange={handleCategory}
        disabled={saving}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="Elegir categoría" />
        </SelectTrigger>
        <SelectContent>
          {groups.map(([group, items]) => (
            <div key={group}>
              <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground">{group}</div>
              {items.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </div>
          ))}
          <SelectItem value="unbudgeted">Sin categoría / no presupuestado</SelectItem>
        </SelectContent>
      </Select>
      <div className="flex items-center gap-1">
        <Input
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          onBlur={handleComment}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              event.currentTarget.blur()
            }
          }}
          placeholder="Comentario..."
          className="h-8 text-xs"
          disabled={saving}
        />
        {comment !== expenseUserComment(expense.notes) && (
          <Button type="button" size="sm" variant="outline" className="h-8 px-2 text-xs" onClick={handleComment}>
            OK
          </Button>
        )}
      </div>
    </div>
  )
}
