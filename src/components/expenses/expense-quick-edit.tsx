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
import { TableCell } from '@/components/ui/table'
import { supabaseBrowser } from '@/lib/supabase'
import {
  CATEGORY_GROUPS,
  categoriesInGroup,
  categoryGroupName,
} from '@/lib/category-taxonomy'
import { expenseUserComment, withExpenseUserComment } from '@/lib/expense-notes'
import { isProposedAdjustment } from '@/lib/match-fixed-item'
import { useAuth } from '@/hooks/use-auth'
import { useHousehold } from '@/hooks/use-household'
import { useToast } from '@/components/ui/toast'
import { Plus } from 'lucide-react'

type ExpensePatch = Partial<Expense> & {
  is_unbudgeted?: boolean
  category?: Category | null
}

const NONE_GROUP = 'Sin categoría'
const NEW_SUB = '__new__'
const UNBUDGETED = 'unbudgeted'
const PICK_SUB = '__pick__'

export function ExpenseQuickEdit({
  expense,
  categories,
  budgetedCategoryIds = [],
  onPatched,
  onCategoryCreated,
  compact = false,
  layout = 'stack',
}: {
  expense: Expense
  categories: Category[]
  budgetedCategoryIds?: string[]
  onPatched: (id: string, patch: ExpensePatch) => void
  onCategoryCreated?: (category: Category) => void
  compact?: boolean
  layout?: 'stack' | 'table'
}) {
  const { user } = useAuth()
  const { currentHousehold, updateHousehold } = useHousehold()
  const { addToast } = useToast()
  const [saving, setSaving] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [comment, setComment] = useState(() => expenseUserComment(expense.notes))
  const customGroups = currentHousehold?.settings?.category_groups || {}

  const currentCategory =
    (expense.category as Category | undefined) ||
    categories.find((item) => item.id === expense.category_id) ||
    null
  const savedGroup = currentCategory
    ? categoryGroupName(currentCategory.name, customGroups, currentCategory.id)
    : NONE_GROUP
  const [draftGroup, setDraftGroup] = useState(savedGroup)

  useEffect(() => {
    setComment(expenseUserComment(expense.notes))
  }, [expense.id, expense.notes])

  useEffect(() => {
    setDraftGroup(savedGroup)
    setAdding(false)
    setNewName('')
  }, [expense.id, savedGroup])

  const subs = useMemo(
    () => categoriesInGroup(categories, draftGroup, customGroups),
    [categories, draftGroup, customGroups]
  )

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

  const assignCategory = async (categoryId: string | null, category: Category | null) => {
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
    return ok
  }

  const handleGroup = async (value: string) => {
    setAdding(false)
    setNewName('')
    setDraftGroup(value)
    if (value === NONE_GROUP) {
      await assignCategory(null, null)
      return
    }
    if (currentCategory && categoryGroupName(currentCategory.name, customGroups, currentCategory.id) === value) {
      return
    }
  }

  const handleSub = async (value: string) => {
    if (value === NEW_SUB) {
      setAdding(true)
      return
    }
    setAdding(false)
    if (value === UNBUDGETED) {
      await assignCategory(null, null)
      return
    }
    const category = categories.find((item) => item.id === value) || null
    await assignCategory(value, category)
  }

  const persistGroup = async (categoryId: string, group: string) => {
    if (!currentHousehold) return
    const nextGroups = {
      ...(currentHousehold.settings?.category_groups || {}),
      [categoryId]: group,
    }
    await updateHousehold(currentHousehold.id, {
      settings: {
        ...(currentHousehold.settings || {}),
        category_groups: nextGroups,
      },
    })
  }

  const handleCreateSub = async () => {
    const name = newName.trim()
    if (!name || !currentHousehold || draftGroup === NONE_GROUP) return
    const existing = categories.find((item) => item.name.toLowerCase() === name.toLowerCase())
    if (existing) {
      setAdding(false)
      setNewName('')
      if (!existing.is_system) await persistGroup(existing.id, draftGroup)
      await assignCategory(existing.id, existing)
      return
    }

    setSaving(true)
    const supabase = supabaseBrowser()
    const { data, error } = await supabase
      .from('categories')
      .insert({
        household_id: currentHousehold.id,
        name,
        icon: null,
        color: '#6b7280',
        is_system: false,
        is_active: true,
        sort_order: 50,
      })
      .select('*')
      .single()
    if (error || !data) {
      setSaving(false)
      addToast({ type: 'error', message: 'No pude crear la subcategoría' })
      return
    }
    const created = data as Category
    await persistGroup(created.id, draftGroup)
    onCategoryCreated?.(created)
    setAdding(false)
    setNewName('')
    setSaving(false)
    await assignCategory(created.id, created)
  }

  const handleComment = async () => {
    const nextNotes = withExpenseUserComment(expense.notes, comment)
    if ((nextNotes || '') === (expense.notes || '')) return
    const ok = await savePatch({ notes: nextNotes })
    if (ok) addToast({ type: 'success', message: 'Comentario guardado' })
  }

  const groupSelect = (
    <Select value={draftGroup} onValueChange={handleGroup} disabled={saving}>
      <SelectTrigger className="h-8 text-xs">
        <SelectValue placeholder="Categoría" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE_GROUP}>Sin categoría</SelectItem>
        {CATEGORY_GROUPS.map((group) => (
          <SelectItem key={group} value={group}>
            {group}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  const subSelect = (
    <div className="space-y-1" onClick={(event) => event.stopPropagation()}>
      <Select
        value={
          adding
            ? NEW_SUB
            : draftGroup === savedGroup
              ? expense.category_id || UNBUDGETED
              : PICK_SUB
        }
        onValueChange={handleSub}
        disabled={saving || draftGroup === NONE_GROUP}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder={draftGroup === NONE_GROUP ? 'Elige categoría' : 'Subcategoría'} />
        </SelectTrigger>
        <SelectContent>
          {draftGroup !== savedGroup && !adding && (
            <SelectItem value={PICK_SUB}>Elige una subcategoría</SelectItem>
          )}
          {subs.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              {item.name}
            </SelectItem>
          ))}
          {draftGroup !== NONE_GROUP && (
            <SelectItem value={NEW_SUB}>
              <span className="inline-flex items-center gap-1">
                <Plus className="h-3 w-3" />
                Añadir subcategoría…
              </span>
            </SelectItem>
          )}
          <SelectItem value={UNBUDGETED}>Sin categoría / no presupuestado</SelectItem>
        </SelectContent>
      </Select>
      {adding && (
        <div className="flex items-center gap-1">
          <Input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void handleCreateSub()
              }
            }}
            placeholder="Nombre, ej. Farmacia"
            className="h-8 text-xs"
            autoFocus
            disabled={saving}
          />
          <Button
            type="button"
            size="sm"
            className="h-8 px-2 text-xs"
            disabled={saving || !newName.trim()}
            onClick={() => void handleCreateSub()}
          >
            Crear
          </Button>
        </div>
      )}
    </div>
  )

  const commentField = (
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
  )

  if (layout === 'table') {
    return (
      <>
        <TableCell className="px-2 py-1.5" onClick={(event) => event.stopPropagation()}>
          {groupSelect}
        </TableCell>
        <TableCell className="px-2 py-1.5">{subSelect}</TableCell>
        <TableCell className="px-2 py-1.5">{commentField}</TableCell>
      </>
    )
  }

  return (
    <div
      className={compact ? 'space-y-1.5' : 'grid grid-cols-1 sm:grid-cols-3 gap-1.5 min-w-[220px]'}
      onClick={(event) => event.stopPropagation()}
    >
      {groupSelect}
      {subSelect}
      {commentField}
    </div>
  )
}
