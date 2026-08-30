'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useAuth } from '@/hooks/use-auth'
import { useHousehold } from '@/hooks/use-household'
import { useToast } from '@/components/ui/toast'
import { supabaseBrowser } from '@/lib/supabase'
import { getInitials } from '@/lib/utils'
import { generateInboundToken, householdInboundAddress } from '@/lib/inbound-email'
import { DebugLogPanel } from '@/components/ui/debug-log-panel'
import { 
  User,
  Home,
  Users,
  Save,
  Plus,
  Trash2,
  Copy,
  Check,
  Send,
  RefreshCw,
  Mail
} from 'lucide-react'

export default function SettingsPage() {
  const { profile, updateProfile } = useAuth()
  const { currentHousehold, members, invitations, updateHousehold, inviteMember, revokeInvitation, isOwner, deleteHousehold, leaveHousehold } = useHousehold()
  const { addToast } = useToast()

  // Profile state
  const [profileData, setProfileData] = useState({
    full_name: '',
    phone: '',
  })
  const [savingProfile, setSavingProfile] = useState(false)

  // Household state
  const [householdData, setHouseholdData] = useState({
    name: '',
    currency: 'CLP',
    timezone: 'America/Santiago',
    whatsapp_phone_number: '',
  })
  const [savingHousehold, setSavingHousehold] = useState(false)

  // Invite state
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)

  // Telegram state
  const [telegramCode, setTelegramCode] = useState<string | null>(null)
  const [generatingCode, setGeneratingCode] = useState(false)
  const [codeCopied, setCodeCopied] = useState(false)
  const [inboxCopied, setInboxCopied] = useState(false)
  const [creatingInbox, setCreatingInbox] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [confirmText, setConfirmText] = useState('')

  useEffect(() => {
    if (profile) {
      setProfileData({
        full_name: profile.full_name || '',
        phone: profile.phone || '',
      })
    }
  }, [profile])

  useEffect(() => {
    if (currentHousehold) {
      setHouseholdData({
        name: currentHousehold.name,
        currency: currentHousehold.currency,
        timezone: currentHousehold.timezone,
        whatsapp_phone_number: currentHousehold.whatsapp_phone_number || '',
      })
    }
  }, [currentHousehold])

  const handleSaveProfile = async () => {
    setSavingProfile(true)
    const { error } = await updateProfile(profileData)
    setSavingProfile(false)
    
    if (error) {
      addToast({ type: 'error', message: error })
    } else {
      addToast({ type: 'success', message: 'Perfil actualizado' })
    }
  }

  const handleSaveHousehold = async () => {
    if (!currentHousehold) return
    
    setSavingHousehold(true)
    const { error } = await updateHousehold(currentHousehold.id, householdData)
    setSavingHousehold(false)
    
    if (error) {
      addToast({ type: 'error', message: error })
    } else {
      addToast({ type: 'success', message: 'Hogar actualizado' })
    }
  }

  const inboundToken = currentHousehold?.settings?.inbound_email_token || null
  const inboundAddress = householdInboundAddress(inboundToken)

  const handleCreateInbox = async () => {
    if (!currentHousehold || !isOwner) return
    setCreatingInbox(true)
    const token = generateInboundToken()
    const { error } = await updateHousehold(currentHousehold.id, {
      settings: {
        ...(currentHousehold.settings || {}),
        inbound_email_token: token,
      },
    })
    setCreatingInbox(false)
    if (error) {
      addToast({ type: 'error', message: error })
    } else {
      addToast({ type: 'success', message: 'Casilla del hogar creada' })
    }
  }

  const copyInboundAddress = async () => {
    if (!inboundAddress) return
    await navigator.clipboard.writeText(inboundAddress)
    setInboxCopied(true)
    addToast({ type: 'success', message: 'Casilla copiada' })
    setTimeout(() => setInboxCopied(false), 2000)
  }

  const handleInvite = async () => {
    if (!inviteEmail) return
    
    setInviting(true)
    const { token, error, opId } = await inviteMember(inviteEmail)
    setInviting(false)
    
    if (error) {
      addToast({ type: 'error', message: `${error}${opId ? ` (opId: ${opId})` : ''}` })
    } else {
      addToast({ type: 'success', message: `Invitación creada para ${inviteEmail} (pendiente)` })
      setInviteEmail('')
    }
  }

  const handleGenerateTelegramCode = async () => {
    if (!profile?.id || !currentHousehold?.id) {
      console.error('Missing profile or household:', { profile, currentHousehold })
      addToast({ type: 'error', message: 'Cargando información... intenta de nuevo en unos segundos' })
      return
    }
    
    setGeneratingCode(true)
    try {
      const response = await fetch(
        `/api/telegram/webhook?action=generate_code&user_id=${profile.id}&household_id=${currentHousehold.id}`
      )
      const data = await response.json()
      if (data.error) {
        addToast({ type: 'error', message: data.error })
      } else if (data.code) {
        setTelegramCode(data.code)
        addToast({ type: 'success', message: 'Código generado. Expira en 10 minutos.' })
      } else {
        addToast({ type: 'error', message: 'Error al generar código' })
      }
    } catch (error) {
      console.error('Telegram code error:', error)
      addToast({ type: 'error', message: 'Error al generar código' })
    } finally {
      setGeneratingCode(false)
    }
  }

  const copyTelegramCode = () => {
    if (telegramCode) {
      navigator.clipboard.writeText(telegramCode)
      setCodeCopied(true)
      setTimeout(() => setCodeCopied(false), 2000)
      addToast({ type: 'success', message: 'Código copiado' })
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold">Configuración</h1>
        <p className="text-muted-foreground">Administra tu cuenta y hogar</p>
      </div>

      <Tabs defaultValue="profile">
        <div className="w-full overflow-x-auto pb-1">
          <TabsList className="flex w-max sm:w-full sm:flex-wrap gap-2 rounded-lg bg-muted/60 p-2">
            <TabsTrigger value="profile" className="text-sm px-3 py-2 whitespace-nowrap">
              <User className="h-4 w-4 mr-2" />
              Perfil
            </TabsTrigger>
            <TabsTrigger value="household" className="text-sm px-3 py-2 whitespace-nowrap">
              <Home className="h-4 w-4 mr-2" />
              Hogar
            </TabsTrigger>
            <TabsTrigger value="members" className="text-sm px-3 py-2 whitespace-nowrap">
              <Users className="h-4 w-4 mr-2" />
              Miembros
            </TabsTrigger>
            <TabsTrigger value="integrations" className="text-sm px-3 py-2 whitespace-nowrap">
              <Send className="h-4 w-4 mr-2" />
              Integraciones
            </TabsTrigger>
            <TabsTrigger value="legal" className="text-sm px-3 py-2 whitespace-nowrap">
              Legal
            </TabsTrigger>
            <TabsTrigger value="debug" className="text-sm px-3 py-2 whitespace-nowrap">
              Debug
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Profile Tab */}
        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Tu Perfil</CardTitle>
              <CardDescription>Información personal de tu cuenta</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-4">
                <Avatar className="h-20 w-20">
                  <AvatarImage src={profile?.avatar_url || undefined} />
                  <AvatarFallback className="text-2xl">
                    {getInitials(profile?.full_name || profile?.email || 'U')}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{profile?.email}</p>
                  <p className="text-sm text-muted-foreground">Email de la cuenta (no editable)</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="full_name">Nombre completo</Label>
                  <Input
                    id="full_name"
                    value={profileData.full_name}
                    onChange={(e) => setProfileData({ ...profileData, full_name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Teléfono</Label>
                  <Input
                    id="phone"
                    value={profileData.phone}
                    onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                    placeholder="+56 9 1234 5678"
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={handleSaveProfile} disabled={savingProfile}>
                <Save className="mr-2 h-4 w-4" />
                {savingProfile ? 'Guardando...' : 'Guardar Cambios'}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        {/* Household Tab */}
        <TabsContent value="household">
          <Card>
            <CardHeader>
              <CardTitle>Configuración del Hogar</CardTitle>
              <CardDescription>Nombre, moneda y preferencias</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="household_name">Nombre del hogar</Label>
                <Input
                  id="household_name"
                  value={householdData.name}
                  onChange={(e) => setHouseholdData({ ...householdData, name: e.target.value })}
                  disabled={!isOwner}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="currency">Moneda</Label>
                  <Select 
                    value={householdData.currency} 
                    onValueChange={(v) => setHouseholdData({ ...householdData, currency: v })}
                    disabled={!isOwner}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CLP">Peso Chileno (CLP)</SelectItem>
                      <SelectItem value="USD">Dólar (USD)</SelectItem>
                      <SelectItem value="EUR">Euro (EUR)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="timezone">Zona horaria</Label>
                  <Select 
                    value={householdData.timezone} 
                    onValueChange={(v) => setHouseholdData({ ...householdData, timezone: v })}
                    disabled={!isOwner}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="America/Santiago">Santiago, Chile</SelectItem>
                      <SelectItem value="America/Buenos_Aires">Buenos Aires</SelectItem>
                      <SelectItem value="America/Lima">Lima</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col sm:flex-row gap-3 sm:justify-between sm:items-center">
              {isOwner ? (
                <>
                  <Button onClick={handleSaveHousehold} disabled={savingHousehold}>
                    <Save className="mr-2 h-4 w-4" />
                    {savingHousehold ? 'Guardando...' : 'Guardar Cambios'}
                  </Button>
                  <div className="flex-1" />
                  <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                    <Label className="text-sm text-muted-foreground">Escribe <strong>ELIMINAR</strong> para confirmar</Label>
                    <div className="flex gap-2">
                      <Input
                        className="w-32"
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        placeholder="ELIMINAR"
                      />
                      <Button
                        variant="destructive"
                        disabled={deleting || confirmText !== 'ELIMINAR'}
                        onClick={async () => {
                          if (!currentHousehold) return
                          setDeleting(true)
                          const res = await deleteHousehold(currentHousehold.id)
                          setDeleting(false)
                          if (res.error) {
                            addToast({ type: 'error', message: res.error })
                          } else {
                            addToast({ type: 'success', message: 'Hogar eliminado' })
                          }
                        }}
                      >
                        {deleting ? 'Eliminando...' : 'Eliminar hogar'}
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full">
                  <p className="text-sm text-muted-foreground">Puedes abandonar este hogar.</p>
                  <Button
                    variant="destructive"
                    className="w-full sm:w-auto"
                    disabled={leaving}
                    onClick={async () => {
                      if (!currentHousehold) return
                      setLeaving(true)
                      const res = await leaveHousehold(currentHousehold.id)
                      setLeaving(false)
                      if (res.error) {
                        addToast({ type: 'error', message: res.error })
                      } else {
                        addToast({ type: 'success', message: 'Saliste del hogar' })
                      }
                    }}
                  >
                    {leaving ? 'Saliendo...' : 'Abandonar hogar'}
                  </Button>
                </div>
              )}
            </CardFooter>
          </Card>
        </TabsContent>

        {/* Members Tab */}
        <TabsContent value="members">
          <Card>
            <CardHeader>
              <CardTitle>Miembros del Hogar</CardTitle>
              <CardDescription>Personas que pueden ver y registrar gastos</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Current members */}
              <div className="space-y-3">
                {members.map((member) => (
                  <div key={member.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarImage src={member.profile?.avatar_url || undefined} />
                        <AvatarFallback>
                          {getInitials(member.profile?.full_name || member.profile?.email || 'U')}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{member.profile?.full_name || member.profile?.email}</p>
                        <p className="text-sm text-muted-foreground">{member.profile?.email}</p>
                      </div>
                    </div>
                    <Badge variant={member.role === 'owner' ? 'default' : 'secondary'}>
                      {member.role === 'owner' ? 'Propietario' : 'Miembro'}
                    </Badge>
                  </div>
                ))}
              </div>

              {/* Pending invitations */}
              {isOwner && invitations?.length > 0 && (
                <div className="pt-4 border-t space-y-3">
                  <div>
                    <p className="font-medium">Invitaciones pendientes</p>
                    <p className="text-sm text-muted-foreground">
                      El invitado aparecerá como miembro cuando acepte la invitación.
                    </p>
                  </div>

                  <div className="space-y-2">
                    {invitations
                      .filter(inv => !inv.accepted_at)
                      .map((inv) => {
                        const inviteUrl =
                          typeof window !== 'undefined'
                            ? `${window.location.origin}/invite/${inv.token}`
                            : `/invite/${inv.token}`

                        return (
                          <div key={inv.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 bg-muted rounded-lg">
                            <div className="min-w-0">
                              <p className="font-medium truncate">{inv.email}</p>
                              <p className="text-xs text-muted-foreground">
                                Rol: {inv.role === 'owner' ? 'Propietario' : 'Miembro'} · Expira: {new Date(inv.expires_at).toLocaleDateString('es-CL')}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={async () => {
                                  await navigator.clipboard.writeText(inviteUrl)
                                  addToast({ type: 'success', message: 'Link de invitación copiado' })
                                }}
                              >
                                <Copy className="mr-2 h-4 w-4" />
                                Copiar link
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={async () => {
                                  const res = await revokeInvitation(inv.id)
                                  if (res.error) {
                                    addToast({ type: 'error', message: `${res.error}${res.opId ? ` (opId: ${res.opId})` : ''}` })
                                  } else {
                                    addToast({ type: 'success', message: 'Invitación cancelada' })
                                  }
                                }}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Cancelar
                              </Button>
                            </div>
                          </div>
                        )
                      })}
                  </div>
                </div>
              )}

              {/* Invite new member */}
              {isOwner && (
                <div className="pt-4 border-t">
                  <Label className="mb-2 block">Invitar nuevo miembro</Label>
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      placeholder="email@ejemplo.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                    />
                    <Button onClick={handleInvite} disabled={inviting || !inviteEmail}>
                      <Plus className="mr-2 h-4 w-4" />
                      {inviting ? 'Enviando...' : 'Invitar'}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Integrations Tab */}
        <TabsContent value="integrations" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Casilla de gastos del hogar
              </CardTitle>
              <CardDescription>
                Una dirección para este hogar. Cada miembro reenvía solo los correos del banco.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                No uses djorreto@spendplan.cl (Titan/GoDaddy). Esa casilla es de contacto.
                Esta es virtual: <code className="text-xs bg-muted px-1 rounded">gastos+codigo@mail.spendplan.cl</code>.
                El reenvío del banco llega aquí y crea un gasto pendiente. Confírmalo en Gastos para que sume al mes.
              </p>

              {inboundAddress ? (
                <div className="space-y-2">
                  <Label>Dirección de este hogar</Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-muted px-4 py-2 rounded text-sm font-mono break-all">
                      {inboundAddress}
                    </code>
                    <Button variant="outline" size="icon" onClick={copyInboundAddress}>
                      {inboxCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    En Gmail: filtro por Itaú → reenviar a esta dirección. Diego y Mari usan la misma. El gasto aparece como Pendiente hasta que lo confirmes.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Este hogar todavía no tiene casilla.
                  </p>
                  {isOwner && (
                    <Button onClick={handleCreateInbox} disabled={creatingInbox}>
                      {creatingInbox ? 'Creando...' : 'Crear casilla del hogar'}
                    </Button>
                  )}
                </div>
              )}

              <details className="rounded-lg border bg-muted/20 p-4">
                <summary className="cursor-pointer text-sm font-medium">
                  Cómo reenviar todo Itaú desde Gmail
                </summary>
                <div className="mt-4 space-y-4 text-sm text-muted-foreground">
                  <p>
                    La confirmación de Gmail no llega a tu bandeja: va a Resend.
                    Casilla: <code className="text-xs bg-muted px-1 rounded">{inboundAddress || 'gastos+codigo@mail.spendplan.cl'}</code>
                  </p>
                  <ol className="list-decimal pl-5 space-y-2">
                    <li>
                      En la App Itaú o itau.cl, confirma que el email registrado es tu Gmail
                      y que los avisos de compra/transferencia van por correo, no solo push.
                    </li>
                    <li>
                      Haz una compra chica y verifica que el mail de Itaú llegó a Gmail
                      (bandeja, Promociones o Spam). Si no llega, SpendPlan no puede verlo.
                    </li>
                    <li>
                      En Gmail (computador): engranaje → Ver toda la configuración →
                      Reenvío y correo POP/IMAP → Añadir una dirección de reenvío.
                      Pega la casilla de arriba. No actives “reenviar una copia de todos los mensajes”.
                    </li>
                    <li>
                      Abre resend.com/emails → Receiving. Busca el mail de Google
                      (“Gmail Forwarding Confirmation”), ábrelo y confirma el enlace o el código.
                    </li>
                    <li>
                      Configuración → Filtros → Crear filtro. En De pega exactamente:
                      <code className="block mt-1 text-xs bg-muted px-2 py-1 rounded">@itau.cl OR @correo.itau.cl</code>
                      Deja Para y Asunto vacíos.
                    </li>
                    <li>
                      Crear filtro → marca “Reenviarlo a” esa casilla y aplica la etiqueta Itaú.
                      No marques Eliminarlo.
                    </li>
                    <li>
                      Si Mari también recibe Itaú, repite 3–6 en su Gmail con la misma casilla.
                    </li>
                    <li>
                      Prueba: el aviso debe tener etiqueta Itaú, aparecer en Resend Receiving,
                      y en SpendPlan → Gastos como Pendiente. Menú ⋮ → Confirmar.
                    </li>
                  </ol>
                  <p>
                    La hoja “Reenvio Itaú Gmail” de <em>Costos casa.xlsx</em> tiene el detalle
                    paso a paso, incluyendo qué hacer si no aparece el gasto.
                  </p>
                </div>
              </details>
            </CardContent>
          </Card>

          {/* Telegram */}
          <Card id="telegram">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5" />
                Telegram Bot
              </CardTitle>
              <CardDescription>
                Registra gastos y consulta tu presupuesto desde Telegram
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="flex-1 space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Vincula tu cuenta de Telegram para registrar gastos enviando fotos de boletas o mensajes de texto.
                  </p>
                  
                  {!telegramCode ? (
                    <Button onClick={handleGenerateTelegramCode} disabled={generatingCode}>
                      {generatingCode ? (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                          Generando...
                        </>
                      ) : (
                        <>
                          <Plus className="mr-2 h-4 w-4" />
                          Generar código de vinculación
                        </>
                      )}
                    </Button>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <code className="flex-1 bg-muted px-4 py-2 rounded text-lg font-mono tracking-wider">
                          {telegramCode}
                        </code>
                        <Button variant="outline" size="icon" onClick={copyTelegramCode}>
                          {codeCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Expira en 10 minutos
                      </p>
                    </div>
                  )}
                </div>
              </div>
              
              {telegramCode && (
                <div className="p-4 bg-blue-50 rounded-lg space-y-2">
                  <p className="text-sm font-medium text-blue-800">📱 Instrucciones:</p>
                  <ol className="text-sm text-blue-700 list-decimal list-inside space-y-1">
                    <li>Descarga Telegram (App Store / Google Play) y abre sesión.</li>
                    <li>En Telegram, busca el chat <strong>@spendplan_cl_bot</strong> y toca <strong>Start / Iniciar</strong>.</li>
                    <li>
                      Pégale este código:
                      <code className="bg-blue-100 px-1 rounded ml-1">{telegramCode}</code>
                      <span className="ml-1">(también sirve</span>
                      <code className="bg-blue-100 px-1 rounded ml-1">/vincular {telegramCode}</code>
                      <span className="ml-1">).</span>
                    </li>
                    <li>Cuando te confirme, ya quedas vinculado.</li>
                    <li>
                      Cómo usarlo (ejemplos):
                      <ul className="list-disc list-inside ml-4 mt-1 space-y-1">
                        <li><strong>Registrar gasto:</strong> <code className="bg-blue-100 px-1 rounded">12990 en Jumbo</code></li>
                        <li><strong>Balance:</strong> <code className="bg-blue-100 px-1 rounded">Balance</code></li>
                        <li><strong>Resumen:</strong> <code className="bg-blue-100 px-1 rounded">Resumen</code></li>
                      </ul>
                    </li>
                    <li>Tip: cuando registres un gasto, el bot te pedirá <strong>Confirmar</strong> antes de guardarlo.</li>
                  </ol>
                </div>
              )}
            </CardContent>
          </Card>

        </TabsContent>

        {/* Legal Tab */}
        <TabsContent value="legal">
          <Card>
            <CardHeader>
              <CardTitle>Legal</CardTitle>
              <CardDescription>Documentos vigentes de la aplicación</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="text-sm font-medium">Términos y Condiciones (v1.1)</h3>
                <p className="text-sm text-muted-foreground">
                  Última actualización: 2025-12-17. Revisa la versión vigente:{' '}
                  <a
                    href="https://soghkhyleaknrmcqmubb.supabase.co/storage/v1/object/public/assets/Terminos%20y%20Condiciones%20(v1.1)%2020251217%20%20.pdf"
                    className="text-primary underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    PDF
                  </a>{' '}
                  o la versión web en{' '}
                  <a href="/legal/terminos" className="text-primary underline" target="_blank" rel="noreferrer">
                    /legal/terminos
                  </a>.
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium">Política de Privacidad (v1.1)</h3>
                <p className="text-sm text-muted-foreground">
                  Última actualización: 2025-12-17. Revisa la versión vigente:{' '}
                  <a
                    href="https://soghkhyleaknrmcqmubb.supabase.co/storage/v1/object/public/assets/Politica%20de%20Privacidad%20(v1.1)%2020251217.pdf"
                    className="text-primary underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    PDF
                  </a>{' '}
                  o la versión web en{' '}
                  <a href="/legal/privacidad" className="text-primary underline" target="_blank" rel="noreferrer">
                    /legal/privacidad
                  </a>.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Debug Tab */}
        <TabsContent value="debug" className="space-y-6">
          <DebugLogPanel />
        </TabsContent>
      </Tabs>
    </div>
  )
}

