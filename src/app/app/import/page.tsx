'use client'

export const dynamic = 'force-dynamic'

import { useState, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { useHousehold } from '@/hooks/use-household'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/components/ui/toast'
import { supabaseBrowser } from '@/lib/supabase'
import { formatCurrency, generateId } from '@/lib/utils'
import {
  addMonthsToDate,
  planImportMutation,
  reviewStatementRows,
  type ReviewAction,
  type StatementReview,
} from '@/lib/installments'
import { endOp, formatSupabaseError, isLikelyDuplicateError, isLikelyRlsOrAuthError, logOp, startOp, withRetry } from '@/lib/debug-log'
import { 
  Upload,
  FileSpreadsheet,
  ArrowRight,
  Check,
  X,
  Download
} from 'lucide-react'

interface CSVRow {
  [key: string]: string
}

interface ParsedTransaction {
  id: string
  date: string
  amount: number
  description: string
}

export default function ImportPage() {
  const { currentHousehold } = useHousehold()
  const { user } = useAuth()
  const { addToast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<'upload' | 'map' | 'preview' | 'done'>('upload')
  const [csvData, setCsvData] = useState<CSVRow[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [mapping, setMapping] = useState({
    date: '',
    amount: '',
    description: ''
  })
  const [reviews, setReviews] = useState<StatementReview[]>([])
  const [analyzing, setAnalyzing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResults, setImportResults] = useState({ imported: 0, skipped: 0, attached: 0 })

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      parseCSV(text)
    }
    reader.readAsText(file)
  }

  const parseCSV = (text: string) => {
    const lines = text.split('\n').filter(line => line.trim())
    if (lines.length < 2) {
      addToast({ type: 'error', message: 'El archivo está vacío o no tiene datos' })
      return
    }

    // Parse headers
    const headerLine = lines[0]
    const csvHeaders = headerLine.split(/[,;]/).map(h => h.trim().replace(/"/g, ''))
    setHeaders(csvHeaders)

    // Parse data
    const data: CSVRow[] = []
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(/[,;]/).map(v => v.trim().replace(/"/g, ''))
      if (values.length >= csvHeaders.length) {
        const row: CSVRow = {}
        csvHeaders.forEach((header, index) => {
          row[header] = values[index] || ''
        })
        data.push(row)
      }
    }

    setCsvData(data)
    
    // Try to auto-detect columns
    const autoMapping = { date: '', amount: '', description: '' }
    csvHeaders.forEach(h => {
      const lower = h.toLowerCase()
      if (lower.includes('fecha') || lower.includes('date')) autoMapping.date = h
      if (lower.includes('monto') || lower.includes('amount') || lower.includes('valor')) autoMapping.amount = h
      if (lower.includes('descripcion') || lower.includes('description') || lower.includes('detalle') || lower.includes('glosa')) autoMapping.description = h
    })
    setMapping(autoMapping)
    
    setStep('map')
    addToast({ type: 'success', message: `${data.length} filas cargadas` })
  }

  const processMapping = async () => {
    if (!mapping.date || !mapping.amount) {
      addToast({ type: 'error', message: 'Selecciona al menos fecha y monto' })
      return
    }
    if (!currentHousehold) return

    const parsed: ParsedTransaction[] = csvData.map((row) => {
      let dateStr = row[mapping.date]
      const dateMatch = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/)
      if (dateMatch) {
        const [, d, m, y] = dateMatch
        const year = y.length === 2 ? '20' + y : y
        dateStr = `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
      }
      let amountStr = row[mapping.amount]
      amountStr = amountStr.replace(/[$\s"]/g, '').replace(/\./g, '').replace(',', '.')
      const amount = Math.abs(parseFloat(amountStr) || 0)
      return {
        id: generateId(),
        date: dateStr,
        amount,
        description: row[mapping.description] || '',
      }
    }).filter((t) => t.amount > 0)

    setAnalyzing(true)
    const supabase = supabaseBrowser()
    const from = addMonthsToDate(new Date().toISOString().slice(0, 10), -14)
    const to = addMonthsToDate(new Date().toISOString().slice(0, 10), 14)
    const { data, error } = await supabase
      .from('expenses')
      .select('id, amount, expense_date, merchant, description, installment_group_id, installment_index, installment_total')
      .eq('household_id', currentHousehold.id)
      .neq('status', 'cancelled')
      .gte('expense_date', from)
      .lte('expense_date', to)
      .limit(4000)

    if (error) {
      addToast({ type: 'error', message: 'Pude leer el CSV pero no los gastos actuales' })
      setAnalyzing(false)
      return
    }

    setReviews(reviewStatementRows(parsed, data || []))
    setAnalyzing(false)
    setStep('preview')
  }

  const toggleTransaction = (id: string) => {
    setReviews((prev) =>
      prev.map((item) => (item.row.id === id ? { ...item, selected: !item.selected } : item))
    )
  }

  const setAction = (id: string, action: ReviewAction) => {
    setReviews((prev) =>
      prev.map((item) =>
        item.row.id === id
          ? { ...item, action, selected: action !== 'skip' }
          : item
      )
    )
  }

  const toggleAll = (selected: boolean) => {
    setReviews((prev) =>
      prev.map((item) =>
        item.verdict === 'duplicate' ? item : { ...item, selected }
      )
    )
  }

  const importTransactions = async () => {
    if (!currentHousehold || !user) return
    
    const selected = reviews.filter((item) => item.selected && item.action !== 'skip')
    if (selected.length === 0) {
      addToast({ type: 'warning', message: 'Selecciona al menos una transacción' })
      return
    }

    setImporting(true)
    const supabase = supabaseBrowser()
    const batchId = generateId()
    let imported = 0
    let skipped = reviews.filter((item) => !item.selected || item.action === 'skip').length
    let attached = 0
    const op = startOp('import.csv', {
      householdId: currentHousehold.id,
      userId: user.id,
      selectedCount: selected.length,
      batchId,
    })

    try {
      // Insert bank transactions
      const bankTxData = selected.map((item) => ({
        household_id: currentHousehold.id,
        import_batch_id: batchId,
        transaction_date: item.row.date,
        amount: item.row.amount,
        description: item.row.description,
        status: 'unreconciled',
        imported_by: user.id
      }))

      const txResp = await withRetry(
        () => supabase.from('bank_transactions').insert(bankTxData),
        { retries: 2, baseDelayMs: 300, ctx: op, step: 'insert.bank_transactions' }
      )
      if (txResp.error) throw txResp.error

      // Validate: count inserted for this batch (head-only count)
      const countResp = await withRetry(
        () =>
          supabase
            .from('bank_transactions')
            .select('id', { count: 'exact', head: true })
            .eq('import_batch_id', batchId)
            .eq('household_id', currentHousehold.id),
        { retries: 2, baseDelayMs: 300, ctx: op, step: 'validate.bank_transactions.count' }
      )
      if (countResp.error) throw countResp.error
      const insertedCount = countResp.count ?? null
      if (insertedCount !== null && insertedCount !== selected.length) {
        logOp(op, 'warn', 'bank_transactions count mismatch', 'validate.bank_transactions.count', {
          expected: selected.length,
          actual: insertedCount,
        })
      }

      // Create expenses
      const failures: Array<{ transactionId: string; error: Record<string, unknown> }> = []
      for (const item of selected) {
        const t = item.row
        const base = {
          household_id: currentHousehold.id,
          amount: t.amount,
          description: t.description,
          merchant: t.description,
          expense_date: t.date,
          source: 'csv_import' as const,
          status: 'confirmed' as const,
          created_by: user.id,
        }

        const plan = planImportMutation(item, base)
        if (plan.update) {
          const upd = await withRetry(
            () =>
              supabase
                .from('expenses')
                .update(plan.update!.patch)
                .eq('id', plan.update!.id)
                .eq('household_id', currentHousehold.id),
            { retries: 2, baseDelayMs: 300, ctx: op, step: 'update.installment' }
          )
          if (upd.error) throw upd.error
        }
        if (plan.attached) attached += 1
        const rows = plan.rows
        if (rows.length === 0) {
          imported += plan.update ? 1 : 0
          continue
        }

        const expResp = await withRetry(
          () => supabase.from('expenses').insert(rows).select('id'),
          { retries: 2, baseDelayMs: 300, ctx: op, step: 'insert.expense' }
        )

        if (expResp.error) {
          if (isLikelyDuplicateError(expResp.error)) {
            skipped++
            logOp(op, 'info', 'duplicate expense skipped', 'insert.expense', {
              transactionId: t.id,
              error: formatSupabaseError(expResp.error),
            })
            continue
          }
          failures.push({ transactionId: t.id, error: formatSupabaseError(expResp.error) })
          logOp(op, 'error', 'expense insert failed', 'insert.expense', {
            transactionId: t.id,
            error: formatSupabaseError(expResp.error),
          })
          if (isLikelyRlsOrAuthError(expResp.error)) {
            throw expResp.error
          }
        } else {
          imported += rows.length
        }
      }

      setImportResults({ imported, skipped, attached })
      setStep('done')
      endOp(op, true, { imported, skipped })
      if (failures.length > 0) {
        addToast({
          type: 'warning',
          message: `${imported} importados, ${failures.length} fallaron (opId: ${op.opId})`,
        })
      } else {
        addToast({ type: 'success', message: `${imported} gastos importados (opId: ${op.opId})` })
      }
    } catch (error) {
      console.error('Import error:', error)
      logOp(op, 'error', 'import failed', 'import', { error: formatSupabaseError(error) })
      endOp(op, false)
      addToast({ type: 'error', message: `Error al importar (opId: ${op.opId})` })
    } finally {
      setImporting(false)
    }
  }

  const reset = () => {
    setStep('upload')
    setCsvData([])
    setHeaders([])
    setMapping({ date: '', amount: '', description: '' })
    setReviews([])
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Importar Movimientos</h1>
        <p className="text-muted-foreground">
          Importa tu cartola y la comparamos con tus gastos: duplicados, cuotas y meses que faltan.
          En Itaú, el monto que cuenta es la cuota del mes, no el total de la compra. 01/01 no es cuota; 00/03 se cobra el mes siguiente.
        </p>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-4 mb-8">
        {['upload', 'map', 'preview', 'done'].map((s, i) => (
          <div key={s} className="flex items-center">
            <div className={`
              w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
              ${step === s ? 'bg-primary text-primary-foreground' : 
                ['upload', 'map', 'preview', 'done'].indexOf(step) > i ? 'bg-primary text-primary-foreground' : 
                'bg-muted text-muted-foreground'}
            `}>
              {['upload', 'map', 'preview', 'done'].indexOf(step) > i ? (
                <Check className="h-4 w-4" />
              ) : (
                i + 1
              )}
            </div>
            {i < 3 && (
              <div className={`w-12 h-1 mx-2 ${['upload', 'map', 'preview', 'done'].indexOf(step) > i ? 'bg-primary' : 'bg-muted'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <Card>
          <CardHeader>
            <CardTitle>Subir archivo CSV</CardTitle>
            <CardDescription>
              Descarga tu cartola desde el banco y súbela aquí
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div 
              className="border-2 border-dashed rounded-lg p-12 text-center cursor-pointer hover:border-primary transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium mb-2">Arrastra tu archivo aquí</p>
              <p className="text-sm text-muted-foreground mb-4">o haz clic para seleccionar</p>
              <Button variant="outline">
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Seleccionar CSV
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>
          </CardContent>
          <CardFooter>
            <p className="text-sm text-muted-foreground">
              Formatos soportados: CSV con columnas de fecha, monto y descripción
            </p>
          </CardFooter>
        </Card>
      )}

      {/* Step 2: Map columns */}
      {step === 'map' && (
        <Card>
          <CardHeader>
            <CardTitle>Mapear columnas</CardTitle>
            <CardDescription>
              Indica qué columna corresponde a cada campo
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Fecha *</Label>
                <Select value={mapping.date} onValueChange={(v) => setMapping({ ...mapping, date: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar columna" />
                  </SelectTrigger>
                  <SelectContent>
                    {headers.map(h => (
                      <SelectItem key={h} value={h}>{h}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Monto *</Label>
                <Select value={mapping.amount} onValueChange={(v) => setMapping({ ...mapping, amount: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar columna" />
                  </SelectTrigger>
                  <SelectContent>
                    {headers.map(h => (
                      <SelectItem key={h} value={h}>{h}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Descripción</Label>
                <Select value={mapping.description} onValueChange={(v) => setMapping({ ...mapping, description: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar columna" />
                  </SelectTrigger>
                  <SelectContent>
                    {headers.map(h => (
                      <SelectItem key={h} value={h}>{h}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Preview */}
            <div className="mt-6">
              <p className="text-sm font-medium mb-2">Vista previa (primeras 3 filas):</p>
              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {headers.map(h => (
                        <TableHead key={h} className="text-xs">{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {csvData.slice(0, 3).map((row, i) => (
                      <TableRow key={i}>
                        {headers.map(h => (
                          <TableCell key={h} className="text-xs">{row[h]}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button variant="outline" onClick={reset}>
              <X className="mr-2 h-4 w-4" />
              Cancelar
            </Button>
            <Button onClick={() => void processMapping()} disabled={analyzing}>
              {analyzing ? 'Comparando con tus gastos…' : 'Continuar'}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Step 3: Preview and select */}
      {step === 'preview' && (
        <Card>
          <CardHeader>
            <CardTitle>Revisar contra lo que ya tienes</CardTitle>
            <CardDescription>
              Comparé la cartola con tus gastos. Los duplicados vienen destildados.
              Si es una cuota, puedes cargar solo este mes o la serie que falta.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4">
                <Button variant="outline" size="sm" onClick={() => toggleAll(true)}>
                  Seleccionar todo
                </Button>
                <Button variant="outline" size="sm" onClick={() => toggleAll(false)}>
                  Deseleccionar todo
                </Button>
              </div>
              <Badge variant="secondary">
                {reviews.filter((item) => item.selected).length} de {reviews.length} seleccionadas
              </Badge>
            </div>

            <div className="border rounded-lg max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12"></TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead>Análisis</TableHead>
                    <TableHead>Acción</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reviews.map((item) => (
                    <TableRow key={item.row.id} className={item.selected ? '' : 'opacity-50'}>
                      <TableCell>
                        <Checkbox
                          checked={item.selected}
                          onCheckedChange={() => toggleTransaction(item.row.id)}
                        />
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{item.row.date}</TableCell>
                      <TableCell className="max-w-[220px]">
                        <p className="truncate">{item.row.description}</p>
                        {item.cuota ? (
                          <p className="text-xs text-purple-700">Cuota {item.cuota.index}/{item.cuota.total}</p>
                        ) : null}
                      </TableCell>
                      <TableCell className="max-w-[280px]">
                        <Badge
                          variant={
                            item.verdict === 'duplicate' || item.verdict === 'maybe_duplicate'
                              ? 'secondary'
                              : item.verdict === 'missing_month'
                                ? 'outline'
                                : 'default'
                          }
                          className="text-[10px] mb-1"
                        >
                          {item.verdict === 'duplicate'
                            ? 'Duplicado'
                            : item.verdict === 'maybe_duplicate'
                              ? 'Revisar'
                              : item.verdict === 'missing_month'
                                ? 'Falta un mes'
                                : item.verdict === 'new_installment'
                                  ? 'Cuotas nuevas'
                                  : 'Nuevo'}
                        </Badge>
                        <p className="text-xs text-muted-foreground leading-snug">{item.reason}</p>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={item.action}
                          onValueChange={(value) => setAction(item.row.id, value as ReviewAction)}
                        >
                          <SelectTrigger className="h-8 w-[150px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="skip">No cargar</SelectItem>
                            <SelectItem value="one">Solo este cargo</SelectItem>
                            {item.verdict === 'new_installment' || item.cuota ? (
                              <SelectItem value="series">Este mes y los que faltan</SelectItem>
                            ) : null}
                            {item.match ? (
                              <SelectItem value="attach">Sumar a la compra ya cargada</SelectItem>
                            ) : null}
                            {item.match ? (
                              <SelectItem value="extend">Ya está: completar meses que faltan</SelectItem>
                            ) : null}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right font-medium whitespace-nowrap">
                        {formatCurrency(item.row.amount, currentHousehold?.currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button variant="outline" onClick={() => setStep('map')}>
              Atrás
            </Button>
            <Button onClick={importTransactions} disabled={importing}>
              {importing ? 'Importando...' : 'Importar seleccionados'}
              <Download className="ml-2 h-4 w-4" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Step 4: Done */}
      {step === 'done' && (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
              <Check className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-2xl font-bold mb-2">¡Importación completada!</h2>
            <p className="text-muted-foreground mb-6">
              Se cargaron {importResults.imported} gastos
              {importResults.attached > 0 ? ` (${importResults.attached} sumados a compras en cuotas)` : ''}
              {importResults.skipped > 0 ? ` · ${importResults.skipped} no se cargaron` : ''}
            </p>
            <div className="flex gap-4 justify-center">
              <Button variant="outline" onClick={reset}>
                Importar más
              </Button>
              <Button onClick={() => window.location.href = '/app/classify'}>
                Clasificar gastos
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

