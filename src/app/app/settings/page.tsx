'use client'

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
  RefreshCw
} from 'lucide-react'

export default function SettingsPage() {
  const { profile, updateProfile } = useAuth()
  const { currentHousehold, members, updateHousehold, inviteMember, isOwner } = useHousehold()
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

  const handleInvite = async () => {
    if (!inviteEmail) return
    
    setInviting(true)
    const { token, error } = await inviteMember(inviteEmail)
    setInviting(false)
    
    if (error) {
      addToast({ type: 'error', message: error })
    } else {
      addToast({ type: 'success', message: `Invitación enviada a ${inviteEmail}` })
      setInviteEmail('')
    }
  }

  const handleGenerateTelegramCode = async () => {
    setGeneratingCode(true)
    try {
      const response = await fetch('/api/telegram/webhook?action=generate_code')
      const data = await response.json()
      if (data.code) {
        setTelegramCode(data.code)
        addToast({ type: 'success', message: 'Código generado. Expira en 10 minutos.' })
      }
    } catch (error) {
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
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="profile">
            <User className="h-4 w-4 mr-2" />
            Perfil
          </TabsTrigger>
          <TabsTrigger value="household">
            <Home className="h-4 w-4 mr-2" />
            Hogar
          </TabsTrigger>
          <TabsTrigger value="members">
            <Users className="h-4 w-4 mr-2" />
            Miembros
          </TabsTrigger>
          <TabsTrigger value="integrations">
            <Send className="h-4 w-4 mr-2" />
            Integraciones
          </TabsTrigger>
        </TabsList>

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
            {isOwner && (
              <CardFooter>
                <Button onClick={handleSaveHousehold} disabled={savingHousehold}>
                  <Save className="mr-2 h-4 w-4" />
                  {savingHousehold ? 'Guardando...' : 'Guardar Cambios'}
                </Button>
              </CardFooter>
            )}
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
          {/* Telegram */}
          <Card>
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
                    <li>Abre Telegram y busca <strong>@spendplan_cl_bot</strong></li>
                    <li>Envía el comando: <code className="bg-blue-100 px-1 rounded">/vincular {telegramCode}</code></li>
                    <li>¡Listo! Ya puedes enviar gastos</li>
                  </ol>
                </div>
              )}
            </CardContent>
          </Card>

        </TabsContent>
      </Tabs>
    </div>
  )
}

