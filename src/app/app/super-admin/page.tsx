'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/hooks/use-auth'
import { supabaseBrowser } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'
import { endOp, formatSupabaseError, startOp } from '@/lib/debug-log'
import { Trash2, ShieldCheck, AlertTriangle, Loader2 } from 'lucide-react'

type AllowEntry = {
  email: string
  created_at?: string | null
}

export default function SuperAdminPage() {
  const { profile, loading: authLoading } = useAuth()
  const { addToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [entries, setEntries] = useState<AllowEntry[]>([])
  const [newEmail, setNewEmail] = useState('')
  const [saving, setSaving] = useState(false)

  const isSuperAdmin = !!profile?.is_super_admin

  useEffect(() => {
    if (authLoading) return
    if (!isSuperAdmin) {
      setLoading(false)
      return
    }
    void loadAllowlist()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isSuperAdmin])

  const loadAllowlist = async () => {
    setLoading(true)
    const supabase = supabaseBrowser()
    const op = startOp('superadmin.loadAllowlist', {})
    try {
      const { data, error } = await supabase
        .from('beta_allowlist')
        .select('email, created_at')
        .order('created_at', { ascending: false })
      if (error) throw error
      setEntries(data || [])
      endOp(op, true, { count: data?.length || 0 })
    } catch (error) {
      endOp(op, false, { error: formatSupabaseError(error) })
      addToast({ type: 'error', message: 'Error al cargar lista' })
    } finally {
      setLoading(false)
    }
  }

  const addEmail = async () => {
    const email = newEmail.trim().toLowerCase()
    if (!email) return
    setSaving(true)
    const supabase = supabaseBrowser()
    const op = startOp('superadmin.addEmail', { email })
    try {
      const { error } = await supabase.from('beta_allowlist').insert({ email })
      if (error) throw error
      setNewEmail('')
      addToast({ type: 'success', message: 'Correo agregado' })
      await loadAllowlist()
      endOp(op, true)
    } catch (error) {
      endOp(op, false, { error: formatSupabaseError(error) })
      addToast({ type: 'error', message: 'No se pudo agregar' })
    } finally {
      setSaving(false)
    }
  }

  const removeEmail = async (email: string) => {
    if (!confirm(`Eliminar ${email} de la lista?`)) return
    const supabase = supabaseBrowser()
    const op = startOp('superadmin.removeEmail', { email })
    try {
      const { error } = await supabase.from('beta_allowlist').delete().eq('email', email)
      if (error) throw error
      addToast({ type: 'success', message: 'Correo eliminado' })
      setEntries((prev) => prev.filter((e) => e.email !== email))
      endOp(op, true)
    } catch (error) {
      endOp(op, false, { error: formatSupabaseError(error) })
      addToast({ type: 'error', message: 'No se pudo eliminar' })
    }
  }

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Cargando...
      </div>
    )
  }

  if (!isSuperAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Acceso restringido
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Esta sección es solo para super administradores.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            Super admin
          </h1>
          <p className="text-muted-foreground">Gestiona la lista beta_allowlist</p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="correo@ejemplo.com"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            className="w-64"
          />
          <Button onClick={addEmail} disabled={saving}>
            {saving ? 'Guardando...' : 'Agregar'}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Correos permitidos</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 text-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin inline mr-2" />
              Cargando...
            </div>
          ) : entries.length === 0 ? (
            <p className="text-muted-foreground text-sm">Aún no hay correos en la lista.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Correo</TableHead>
                  <TableHead>Creado</TableHead>
                  <TableHead className="w-20 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.email}>
                    <TableCell>{entry.email}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {entry.created_at ? formatDate(entry.created_at) : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => removeEmail(entry.email)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
