'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { clearDebugLogs, readDebugLogs, type DebugLogEntry } from '@/lib/debug-log'

export function DebugLogPanel() {
  const [logs, setLogs] = useState<DebugLogEntry[]>([])
  const [filter, setFilter] = useState('')

  const refresh = () => setLogs(readDebugLogs())

  useEffect(() => {
    refresh()
    const id = window.setInterval(refresh, 1000)
    return () => window.clearInterval(id)
  }, [])

  const filtered = useMemo(() => {
    if (!filter.trim()) return logs
    const q = filter.toLowerCase()
    return logs.filter((l) => {
      return (
        l.opId.toLowerCase().includes(q) ||
        l.op.toLowerCase().includes(q) ||
        (l.step || '').toLowerCase().includes(q) ||
        l.message.toLowerCase().includes(q)
      )
    })
  }, [logs, filter])

  const copyJson = async () => {
    const text = JSON.stringify(logs, null, 2)
    await navigator.clipboard.writeText(text)
  }

  const levelBadge = (level: DebugLogEntry['level']) => {
    if (level === 'error') return <Badge variant="secondary" className="text-red-700">error</Badge>
    if (level === 'warn') return <Badge variant="secondary" className="text-amber-700">warn</Badge>
    if (level === 'info') return <Badge variant="secondary" className="text-blue-700">info</Badge>
    return <Badge variant="secondary" className="text-muted-foreground">debug</Badge>
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Debug Logs</CardTitle>
        <CardDescription>
          Registro local (solo este navegador). Útil para ver errores de Supabase “silenciosos”.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
          <div className="flex gap-2">
            <Button variant="outline" onClick={refresh}>Refrescar</Button>
            <Button
              variant="outline"
              onClick={() => {
                clearDebugLogs()
                refresh()
              }}
            >
              Limpiar
            </Button>
            <Button variant="outline" onClick={copyJson} disabled={logs.length === 0}>
              Copiar JSON
            </Button>
          </div>
          <div className="md:w-[340px]">
            <Input
              placeholder="Filtrar por opId / op / step / mensaje…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
        </div>

        <div className="border rounded-lg overflow-auto max-h-[420px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[90px]">Level</TableHead>
                <TableHead className="w-[180px]">Op</TableHead>
                <TableHead className="w-[260px]">OpId</TableHead>
                <TableHead className="w-[140px]">Step</TableHead>
                <TableHead>Mensaje</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground text-sm">
                    No hay logs todavía.
                  </TableCell>
                </TableRow>
              ) : (
                filtered
                  .slice()
                  .reverse()
                  .map((l, idx) => (
                    <TableRow key={`${l.ts}-${idx}`}>
                      <TableCell>{levelBadge(l.level)}</TableCell>
                      <TableCell className="font-mono text-xs">{l.op}</TableCell>
                      <TableCell className="font-mono text-xs">{l.opId}</TableCell>
                      <TableCell className="font-mono text-xs">{l.step || '-'}</TableCell>
                      <TableCell className="text-sm">
                        <div className="space-y-1">
                          <div>{l.message}</div>
                          {l.data && (
                            <details className="text-xs">
                              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                                ver data
                              </summary>
                              <pre className="mt-1 p-2 bg-muted rounded overflow-auto whitespace-pre-wrap">
                                {JSON.stringify(l.data, null, 2)}
                              </pre>
                            </details>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

