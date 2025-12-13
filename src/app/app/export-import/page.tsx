'use client'

export const dynamic = 'force-dynamic'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useHousehold } from '@/hooks/use-household'
import { useSelectedMonth } from '@/hooks/use-selected-month'
import { supabaseBrowser } from '@/lib/supabase'
import { formatMonth, getMonthDateRange } from '@/lib/utils'
import { Download, Upload, ArrowRight, FileSpreadsheet, Info } from 'lucide-react'

// Demo mode constants (same as in layout-client)
const DEMO_BUDGET_KEY = 'spendplan_demo_budget_v2'
const DEMO_EXPENSES_KEY = 'spendplan_demo_expenses'

function toCsvValue(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  const escaped = s.replace(/"/g, '""')
  // Quote if needed
  if (/[",\n;]/.test(escaped)) return `"${escaped}"`
  return escaped
}

function downloadCsv(filename: string, rows: Array<Record<string, unknown>>) {
  if (!rows || rows.length === 0) {
    const blob = new Blob([''], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
    return
  }

  const headers = Object.keys(rows[0])
  const lines = [
    headers.map(toCsvValue).join(','),
    ...rows.map((r) => headers.map((h) => toCsvValue(r[h])).join(',')),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function ExportImportPage() {
  const router = useRouter()
  const { currentHousehold, isDemoMode } = useHousehold()
  const { selectedMonth } = useSelectedMonth(currentHousehold?.id)

  const [exporting, setExporting] = useState<null | 'expenses' | 'budget' | 'bank'>(null)

  const isDemo = isDemoMode && !!currentHousehold?.id?.startsWith('demo-')
  const monthLabel = useMemo(() => formatMonth(selectedMonth), [selectedMonth])

  const exportExpenses = async () => {
    if (!currentHousehold) return
    setExporting('expenses')
    try {
      if (typeof window === 'undefined') return

      if (isDemo) {
        const allExpenses = JSON.parse(localStorage.getItem(DEMO_EXPENSES_KEY) || '[]')
        const monthExpenses = allExpenses.filter((e: any) => String(e.expense_date || '').startsWith(selectedMonth))
        const rows = monthExpenses.map((e: any) => ({
          expense_date: e.expense_date,
          amount: e.amount,
          description: e.description,
          merchant: e.merchant,
          category_id: e.category_id,
          is_unbudgeted: e.is_unbudgeted,
          source: e.source,
        }))
        downloadCsv(`spendplan_gastos_${selectedMonth}.csv`, rows)
        return
      }

      const supabase = supabaseBrowser()
      const range = getMonthDateRange(selectedMonth)
      const { data, error } = await supabase
        .from('expenses')
        .select('id, expense_date, amount, description, merchant, category_id, is_unbudgeted, source, status, created_at')
        .eq('household_id', currentHousehold.id)
        .gte('expense_date', range.start)
        .lt('expense_date', range.endExclusive)
        .order('expense_date', { ascending: false })
        .limit(5000)

      if (error) throw error
      const rows = (data || []).map((e: any) => ({
        id: e.id,
        expense_date: e.expense_date,
        amount: e.amount,
        description: e.description,
        merchant: e.merchant,
        category_id: e.category_id,
        is_unbudgeted: e.is_unbudgeted,
        source: e.source,
        status: e.status,
        created_at: e.created_at,
      }))
      downloadCsv(`spendplan_gastos_${selectedMonth}.csv`, rows)
    } finally {
      setExporting(null)
    }
  }

  const exportBudget = async () => {
    if (!currentHousehold) return
    setExporting('budget')
    try {
      if (typeof window === 'undefined') return

      if (isDemo) {
        const budgetData = JSON.parse(localStorage.getItem(DEMO_BUDGET_KEY) || '{"items":[]}')
        const items = budgetData.items || []
        const rows = items.map((i: any) => ({
          name: i.name,
          kind: i.kind,
          type: i.type,
          amount: i.amount,
          category_id: i.category_id,
          is_active: i.is_active,
        }))
        downloadCsv(`spendplan_presupuesto_${selectedMonth}.csv`, rows)
        return
      }

      const supabase = supabaseBrowser()
      const { data, error } = await supabase
        .from('budget_items')
        .select('id, name, kind, type, amount, category_id, is_active, start_date, end_date, is_indefinite, created_at')
        .eq('household_id', currentHousehold.id)
        .order('kind', { ascending: true })
        .order('type', { ascending: true })
        .order('name', { ascending: true })
        .limit(2000)

      if (error) throw error
      const rows = (data || []).map((i: any) => ({
        id: i.id,
        name: i.name,
        kind: i.kind,
        type: i.type,
        amount: i.amount,
        category_id: i.category_id,
        is_active: i.is_active,
        start_date: i.start_date,
        end_date: i.end_date,
        is_indefinite: i.is_indefinite,
        created_at: i.created_at,
      }))
      downloadCsv(`spendplan_presupuesto_${selectedMonth}.csv`, rows)
    } finally {
      setExporting(null)
    }
  }

  const exportBankTransactions = async () => {
    if (!currentHousehold) return
    setExporting('bank')
    try {
      if (typeof window === 'undefined') return
      if (isDemo) {
        // demo: no guardamos bank_transactions, export vacío
        downloadCsv(`spendplan_movimientos_${selectedMonth}.csv`, [])
        return
      }
      const supabase = supabaseBrowser()
      const range = getMonthDateRange(selectedMonth)
      const { data, error } = await supabase
        .from('bank_transactions')
        .select('id, transaction_date, amount, description, status, import_batch_id, created_at')
        .eq('household_id', currentHousehold.id)
        .gte('transaction_date', range.start)
        .lt('transaction_date', range.endExclusive)
        .order('transaction_date', { ascending: false })
        .limit(5000)

      if (error) throw error
      const rows = (data || []).map((t: any) => ({
        id: t.id,
        transaction_date: t.transaction_date,
        amount: t.amount,
        description: t.description,
        status: t.status,
        import_batch_id: t.import_batch_id,
        created_at: t.created_at,
      }))
      downloadCsv(`spendplan_movimientos_${selectedMonth}.csv`, rows)
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold">Exportar e importar</h1>
        <p className="text-muted-foreground">
          Respalda tu información en CSV e importa cartolas del banco.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            ¿Qué hace esta sección?
          </CardTitle>
          <CardDescription>
            Transparencia sobre qué se exporta/importa y qué pasa con tu data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">Exportación</Badge>
            <span>
              Descarga CSV del <strong>mes seleccionado</strong> ({monthLabel}). Puedes cambiar el mes desde el selector superior.
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">Importación</Badge>
            <span>
              Importar desde el banco <strong>agrega</strong> gastos/movimientos; no borra tus datos actuales. Si hay duplicados, intentamos omitirlos.
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">Clasificación con IA</Badge>
            <span>
              Luego de importar, puedes ir a <strong>Clasificar</strong> y usar “Sugerir con IA” para proponer categorías (y guardar los cambios).
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Exportar CSV
            </CardTitle>
            <CardDescription>
              Exporta información para respaldo y/o análisis externo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={exportExpenses} disabled={!currentHousehold || exporting !== null} className="w-full">
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              {exporting === 'expenses' ? 'Exportando gastos...' : `Exportar gastos (${selectedMonth})`}
            </Button>
            <Button onClick={exportBudget} disabled={!currentHousehold || exporting !== null} variant="outline" className="w-full">
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              {exporting === 'budget' ? 'Exportando presupuesto...' : 'Exportar presupuesto'}
            </Button>
            <Button onClick={exportBankTransactions} disabled={!currentHousehold || exporting !== null} variant="outline" className="w-full">
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              {exporting === 'bank' ? 'Exportando movimientos...' : `Exportar movimientos (${selectedMonth})`}
            </Button>
          </CardContent>
          <CardFooter className="text-xs text-muted-foreground">
            Si necesitas exportar “todo el histórico”, lo dejamos como siguiente iteración (para no traer miles de filas sin control).
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Importar desde banco
            </CardTitle>
            <CardDescription>
              Sube tu CSV bancario y crea gastos en la plataforma.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={() => router.push('/app/import')} className="w-full">
              Ir a importar movimientos
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button onClick={() => router.push('/app/classify')} variant="outline" className="w-full">
              Ir a clasificar con IA
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

