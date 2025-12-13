'use client'

import { useCallback, useEffect, useState } from 'react'
import { getCurrentMonth } from '@/lib/utils'

type MonthState = {
  selectedMonth: string
}

const DEFAULT_STATE: MonthState = {
  selectedMonth: getCurrentMonth(),
}

let globalMonthState: MonthState = DEFAULT_STATE
const monthListeners = new Set<(s: MonthState) => void>()

function storageKey(householdId?: string | null) {
  return householdId ? `spendplan_selected_month:${householdId}` : 'spendplan_selected_month'
}

function setGlobalMonthState(next: MonthState) {
  globalMonthState = next
  monthListeners.forEach((fn) => fn(globalMonthState))
}

export function useSelectedMonth(householdId?: string | null) {
  const [state, setLocalState] = useState<MonthState>(() => globalMonthState)

  // Subscribe
  useEffect(() => {
    monthListeners.add(setLocalState)
    setLocalState(globalMonthState)
    return () => {
      monthListeners.delete(setLocalState)
    }
  }, [])

  // Load from localStorage when household changes (or on mount)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const key = storageKey(householdId)
    const saved = localStorage.getItem(key)
    const current = getCurrentMonth()
    const month = saved && /^\d{4}-\d{2}$/.test(saved) ? saved : current
    setGlobalMonthState({ selectedMonth: month })
  }, [householdId])

  const setSelectedMonth = useCallback(
    (month: string) => {
      if (!month || !/^\d{4}-\d{2}$/.test(month)) return
      setGlobalMonthState({ selectedMonth: month })
      if (typeof window !== 'undefined') {
        localStorage.setItem(storageKey(householdId), month)
      }
    },
    [householdId]
  )

  // Keep a sane default if system month changes (e.g. new month) and user never picked one
  useEffect(() => {
    if (typeof window === 'undefined') return
    const key = storageKey(householdId)
    const saved = localStorage.getItem(key)
    if (!saved) {
      setSelectedMonth(getCurrentMonth())
    }
  }, [householdId, setSelectedMonth])

  return {
    selectedMonth: state.selectedMonth,
    setSelectedMonth,
  }
}

