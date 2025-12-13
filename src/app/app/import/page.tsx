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
import { formatCurrency, formatDate, generateId } from '@/lib/utils'
import { endOp, formatSupabaseError, isLikelyDuplicateError, isLikelyRlsOrAuthError, logOp, startOp, withRetry } from '@/lib/debug-log'
import { 
  Upload,
  FileSpreadsheet,
  ArrowRight,
  Check,
  AlertCircle,
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
  selected: boolean
  status: 'new' | 'duplicate' | 'imported'
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
  const [transactions, setTransactions] = useState<ParsedTransaction[]>([])
  const [importing, setImporting] = useState(false)
  const [importResults, setImportResults] = useState({ imported: 0, skipped: 0 })

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

  const processMapping = () => {
    if (!mapping.date || !mapping.amount) {
      addToast({ type: 'error', message: 'Selecciona al menos fecha y monto' })
      return
    }

    const parsed: ParsedTransaction[] = csvData.map(row => {
      // Parse date
      let dateStr = row[mapping.date]
      // Try to convert various date formats
      const dateMatch = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/)
      if (dateMatch) {
        const [, d, m, y] = dateMatch
        const year = y.length === 2 ? '20' + y : y
        dateStr = `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
      }

      // Parse amount
      let amountStr = row[mapping.amount]
      amountStr = amountStr.replace(/[$\s"]/g, '').replace(/\./g, '').replace(',', '.')
      const amount = Math.abs(parseFloat(amountStr) || 0)

      return {
        id: generateId(),
        date: dateStr,
        amount,
        description: row[mapping.description] || '',
        selected: amount > 0,
        status: 'new' as const
      }
    }).filter(t => t.amount > 0)

    setTransactions(parsed)
    setStep('preview')
  }

  const toggleTransaction = (id: string) => {
    setTransactions(prev => prev.map(t => 
      t.id === id ? { ...t, selected: !t.selected } : t
    ))
  }

  const toggleAll = (selected: boolean) => {
    setTransactions(prev => prev.map(t => ({ ...t, selected })))
  }

  const importTransactions = async () => {
    if (!currentHousehold || !user) return
    
    const selected = transactions.filter(t => t.selected)
    if (selected.length === 0) {
      addToast({ type: 'warning', message: 'Selecciona al menos una transacción' })
      return
    }

    setImporting(true)
    const supabase = supabaseBrowser()
    const batchId = generateId()
    let imported = 0
    let skipped = 0
    const op = startOp('import.csv', {
      householdId: currentHousehold.id,
      userId: user.id,
      selectedCount: selected.length,
      batchId,
    })

    try {
      // Insert bank transactions
      const bankTxData = selected.map(t => ({
        household_id: currentHousehold.id,
        import_batch_id: batchId,
        transaction_date: t.date,
        amount: t.amount,
        description: t.description,
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
      for (const t of selected) {
        const expResp = await withRetry(
          () =>
            supabase
              .from('expenses')
              .insert({
                household_id: currentHousehold.id,
                amount: t.amount,
                description: t.description,
                expense_date: t.date,
                source: 'csv_import',
                status: 'confirmed',
                created_by: user.id,
              })
              .select('id')
              .single(),
          { retries: 2, baseDelayMs: 300, ctx: op, step: 'insert.expense' }
        )

        if (expResp.error) {
          // If it's a unique constraint violation, treat as duplicate/skip.
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

          // If this looks like RLS/auth, fail fast (no more "silencing").
          if (isLikelyRlsOrAuthError(expResp.error)) {
            throw expResp.error
          }
        } else {
          imported++
        }
      }

      setImportResults({ imported, skipped })
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
    setTransactions([])
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Importar Movimientos</h1>
        <p className="text-muted-foreground">Importa tu cartola bancaria desde un archivo CSV</p>
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
            <Button onClick={processMapping}>
              Continuar
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Step 3: Preview and select */}
      {step === 'preview' && (
        <Card>
          <CardHeader>
            <CardTitle>Revisar transacciones</CardTitle>
            <CardDescription>
              Selecciona las transacciones que deseas importar
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
                {transactions.filter(t => t.selected).length} de {transactions.length} seleccionadas
              </Badge>
            </div>

            <div className="border rounded-lg max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12"></TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((t) => (
                    <TableRow key={t.id} className={t.selected ? '' : 'opacity-50'}>
                      <TableCell>
                        <Checkbox
                          checked={t.selected}
                          onCheckedChange={() => toggleTransaction(t.id)}
                        />
                      </TableCell>
                      <TableCell>{t.date}</TableCell>
                      <TableCell className="max-w-[300px] truncate">{t.description}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(t.amount, currentHousehold?.currency)}
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
              Se importaron {importResults.imported} gastos
              {importResults.skipped > 0 && ` (${importResults.skipped} omitidos por duplicados)`}
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

