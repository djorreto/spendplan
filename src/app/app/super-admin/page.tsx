'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/hooks/use-auth'
import { supabaseBrowser } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'
import { endOp, formatSupabaseError, startOp } from '@/lib/debug-log'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldCheck, Trash2, Upload } from 'lucide-react'
import type { LegalDocument, LegalDocType } from '@/types'
import { BUCKETS, StorageService } from '@/lib/storage'

type AllowEntry = {
  email: string
  created_at?: string | null
}

type LegalDocsState = Record<LegalDocType, LegalDocument[]>

export default function SuperAdminPage() {
  const { profile, loading: authLoading } = useAuth()
  const { addToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [entries, setEntries] = useState<AllowEntry[]>([])
  const [newEmail, setNewEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<'beta' | 'legal'>('beta')

  const [legalDocs, setLegalDocs] = useState<LegalDocsState>({ terms: [], privacy: [] })
  const [legalLoading, setLegalLoading] = useState(false)
  const [legalError, setLegalError] = useState<string | null>(null)
  const [uploading, setUploading] = useState<LegalDocType | null>(null)
  const [selectedFiles, setSelectedFiles] = useState<Partial<Record<LegalDocType, File | null>>>({})
  const [currentToggling, setCurrentToggling] = useState<string | null>(null)
  const [forcing, setForcing] = useState<LegalDocType | 'both' | null>(null)

  const isSuperAdmin = !!profile?.is_super_admin

  useEffect(() => {
    if (authLoading) return
    if (!isSuperAdmin) {
      setLoading(false)
      return
    }
    void loadAllowlist()
    void loadLegalDocs()
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

  const loadLegalDocs = async () => {
    setLegalLoading(true)
    setLegalError(null)
    try {
      const res = await fetch('/api/admin/legal/versions')
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json?.error || 'No se pudieron cargar versiones')
      }
      const data = json.data as Partial<LegalDocsState>
      setLegalDocs({
        terms: data?.terms || [],
        privacy: data?.privacy || [],
      })
    } catch (error: any) {
      setLegalError(error?.message || 'Error al cargar versiones')
      addToast({ type: 'error', message: 'Error al cargar versiones legales' })
    } finally {
      setLegalLoading(false)
    }
  }

  const currentDoc = useMemo(
    () => ({
      terms: legalDocs.terms.find((d) => d.is_current) || null,
      privacy: legalDocs.privacy.find((d) => d.is_current) || null,
    }),
    [legalDocs]
  )

  const publicUrl = (doc: LegalDocument) => {
    return StorageService.getPublicUrl(BUCKETS.LEGAL, doc.storage_path)
  }

  const onFileChange = (docType: LegalDocType, fileList: FileList | null) => {
    const file = fileList?.[0] || null
    setSelectedFiles((prev) => ({ ...prev, [docType]: file }))
  }

  const uploadVersion = async (docType: LegalDocType) => {
    const file = selectedFiles[docType]
    if (!file) {
      addToast({ type: 'error', message: 'Selecciona un PDF para subir' })
      return
    }
    setUploading(docType)
    const op = startOp('superadmin.legal.upload', { docType, name: file.name })
    try {
      const form = new FormData()
      form.append('doc_type', docType)
      form.append('file', file)
      form.append('make_current', 'true')
      form.append('title', file.name)
      const res = await fetch('/api/admin/legal/upload', { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'No se pudo subir')
      addToast({ type: 'success', message: 'Versión subida' })
      await loadLegalDocs()
      setSelectedFiles((prev) => ({ ...prev, [docType]: null }))
      endOp(op, true)
    } catch (error: any) {
      endOp(op, false, { error: error?.message })
      addToast({ type: 'error', message: error?.message || 'Error al subir' })
    } finally {
      setUploading(null)
    }
  }

  const toggleCurrent = async (docType: LegalDocType, version: string) => {
    setCurrentToggling(`${docType}-${version}`)
    try {
      const res = await fetch('/api/admin/legal/set-current', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc_type: docType, version }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'No se pudo actualizar vigente')
      addToast({ type: 'success', message: 'Versión marcada vigente' })
      await loadLegalDocs()
    } catch (error: any) {
      addToast({ type: 'error', message: error?.message || 'Error al marcar vigente' })
    } finally {
      setCurrentToggling(null)
    }
  }

  const forceReaccept = async (docType: LegalDocType | 'both') => {
    setForcing(docType)
    try {
      const res = await fetch('/api/admin/legal/force-reaccept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc_type: docType }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'No se pudo forzar aceptación')
      addToast({ type: 'success', message: 'Se forzó nueva aceptación' })
    } catch (error: any) {
      addToast({ type: 'error', message: error?.message || 'Error al forzar aceptación' })
    } finally {
      setForcing(null)
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
          <p className="text-muted-foreground">Configuración avanzada (beta & legal)</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'beta' | 'legal')}>
        <TabsList>
          <TabsTrigger value="beta">Usuarios beta</TabsTrigger>
          <TabsTrigger value="legal">Legal</TabsTrigger>
        </TabsList>

        <TabsContent value="beta" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Correos permitidos</CardTitle>
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
        </TabsContent>

        <TabsContent value="legal" className="mt-4 space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">
                Administra versiones de Términos y Privacidad. Las versiones vigentes se marcan en BD y se servirá el
                PDF desde Storage.
              </p>
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                Vigente Términos: {currentDoc.terms?.version || '—'} | Privacidad: {currentDoc.privacy?.version || '—'}
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => forceReaccept('both')}
              disabled={forcing === 'both'}
              className="flex items-center gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              {forcing === 'both' ? 'Forzando...' : 'Forzar re-aceptación global'}
            </Button>
          </div>

          {(['terms', 'privacy'] as LegalDocType[]).map((docType) => {
            const docs = legalDocs[docType] || []
            const current = currentDoc[docType]
            const label = docType === 'terms' ? 'Términos' : 'Privacidad'
            return (
              <Card key={docType}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>
                      {label} {current ? `(vigente ${current.version})` : '(sin versión vigente)'}
                    </span>
                    <div className="flex items-center gap-2">
                      <Input
                        type="file"
                        accept="application/pdf"
                        onChange={(e) => onFileChange(docType, e.target.files)}
                        className="w-56"
                      />
                      <Button
                        onClick={() => uploadVersion(docType)}
                        disabled={uploading === docType}
                        className="flex items-center gap-2"
                      >
                        <Upload className="h-4 w-4" />
                        {uploading === docType ? 'Subiendo...' : 'Subir nueva versión'}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => forceReaccept(docType)}
                        disabled={forcing === docType}
                        className="flex items-center gap-2"
                      >
                        <RefreshCw className="h-4 w-4" />
                        {forcing === docType ? 'Forzando...' : 'Forzar re-aceptación'}
                      </Button>
                    </div>
                  </CardTitle>
                  {legalError && <p className="text-sm text-destructive">{legalError}</p>}
                </CardHeader>
                <CardContent>
                  {legalLoading ? (
                    <div className="py-8 text-center text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin inline mr-2" />
                      Cargando...
                    </div>
                  ) : docs.length === 0 ? (
                    <p className="text-muted-foreground text-sm">Aún no hay versiones registradas.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Versión</TableHead>
                          <TableHead>Creado</TableHead>
                          <TableHead>Vigente</TableHead>
                          <TableHead>PDF</TableHead>
                          <TableHead className="w-24 text-right">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {docs.map((doc) => (
                          <TableRow key={`${doc.doc_type}-${doc.version}`}>
                            <TableCell className="font-medium">{doc.version}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {doc.created_at ? formatDate(doc.created_at) : '—'}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={doc.is_current}
                                  onCheckedChange={() => toggleCurrent(doc.doc_type as LegalDocType, doc.version)}
                                  disabled={currentToggling === `${doc.doc_type}-${doc.version}`}
                                />
                                <span className="text-sm text-muted-foreground">
                                  {doc.is_current ? 'Vigente' : 'No vigente'}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <a
                                href={publicUrl(doc)}
                                className="text-primary underline"
                                target="_blank"
                                rel="noreferrer"
                              >
                                Ver PDF
                              </a>
                            </TableCell>
                            <TableCell className="text-right text-sm text-muted-foreground">
                              {doc.created_by ? `Creado por ${doc.created_by.slice(0, 6)}...` : '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </TabsContent>
      </Tabs>
    </div>
  )
}
