'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/use-auth'
import { useHousehold } from '@/hooks/use-household'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Logo } from '@/components/ui/logo'
import { useToast } from '@/components/ui/toast'
import { Loading } from '@/components/ui/loading'
import { Home, DollarSign, Users, ArrowRight, CheckCircle, Plus, X } from 'lucide-react'

const CURRENCIES = [
  { value: 'CLP', label: 'Peso Chileno (CLP)' },
  { value: 'USD', label: 'Dólar (USD)' },
  { value: 'EUR', label: 'Euro (EUR)' },
  { value: 'ARS', label: 'Peso Argentino (ARS)' },
  { value: 'MXN', label: 'Peso Mexicano (MXN)' },
]

const TIMEZONES = [
  { value: 'America/Santiago', label: 'Santiago, Chile' },
  { value: 'America/Buenos_Aires', label: 'Buenos Aires, Argentina' },
  { value: 'America/Mexico_City', label: 'Ciudad de México' },
  { value: 'America/Lima', label: 'Lima, Perú' },
  { value: 'America/Bogota', label: 'Bogotá, Colombia' },
]

export default function OnboardingPageClient() {
  const router = useRouter()
  const { profile, completeOnboarding } = useAuth()
  const { createHousehold } = useHousehold()
  const { addToast } = useToast()

  const [step, setStep] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Form state
  const [householdName, setHouseholdName] = useState('')
  const [currency, setCurrency] = useState('CLP')
  const [timezone, setTimezone] = useState('America/Santiago')
  const [inviteEmails, setInviteEmails] = useState<string[]>([])
  const [newEmail, setNewEmail] = useState('')

  const totalSteps = 3

  const handleAddEmail = () => {
    if (newEmail && newEmail.includes('@') && !inviteEmails.includes(newEmail)) {
      setInviteEmails([...inviteEmails, newEmail])
      setNewEmail('')
    }
  }

  const handleRemoveEmail = (email: string) => {
    setInviteEmails(inviteEmails.filter((e) => e !== email))
  }

  const handleComplete = async () => {
    if (!householdName.trim()) {
      addToast({ type: 'error', message: 'Ingresa un nombre para tu hogar' })
      return
    }

    setIsSubmitting(true)

    try {
      // Crear hogar
      const { household, error } = await createHousehold(householdName, currency, timezone)

      if (error || !household) {
        addToast({ type: 'error', message: error || 'Error al crear el hogar' })
        setIsSubmitting(false)
        return
      }

      // TODO: Enviar invitaciones
      // for (const email of inviteEmails) {
      //   await inviteMember(email)
      // }

      // Marcar onboarding como completado (no bloquear si falla)
      try {
        await completeOnboarding()
      } catch (e) {
        console.warn('Could not complete onboarding in Supabase, continuing in demo mode')
      }

      addToast({
        type: 'success',
        title: '¡Hogar creado!',
        message: 'Ya puedes comenzar a registrar tus gastos',
      })

      // Redirigir al dashboard
      router.push('/app/dashboard')
    } catch (error) {
      console.error('Onboarding error:', error)
      addToast({ type: 'error', message: 'Error al completar el setup' })
    } finally {
      setIsSubmitting(false)
    }
  }

  const canProceed = () => {
    if (step === 1) return householdName.trim().length > 0
    return true
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex flex-col">
      {/* Header */}
      <header className="p-6">
        <Logo size="md" />
      </header>

      {/* Progress */}
      <div className="max-w-xl mx-auto w-full px-4 mb-8">
        <div className="flex items-center justify-between mb-2">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center">
              <div
                className={`
                w-10 h-10 rounded-full flex items-center justify-center font-semibold
                ${s < step ? 'bg-primary text-primary-foreground' : s === step ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}
              `}
              >
                {s < step ? <CheckCircle className="h-5 w-5" /> : s}
              </div>
              {s < 3 && (
                <div className={`w-24 sm:w-32 h-1 mx-2 rounded ${s < step ? 'bg-primary' : 'bg-muted'}`} />
              )}
            </div>
          ))}
        </div>
        <p className="text-sm text-muted-foreground text-center">
          Paso {step} de {totalSteps}
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-start justify-center px-4 pb-8">
        <Card className="w-full max-w-xl">
          {/* Step 1: Nombre del hogar */}
          {step === 1 && (
            <>
              <CardHeader className="text-center">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Home className="h-8 w-8 text-primary" />
                </div>
                <CardTitle className="text-2xl">¿Cómo se llama tu hogar?</CardTitle>
                <CardDescription>
                  Dale un nombre a tu espacio de finanzas. Puede ser tu apellido, apodo familiar, etc.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="householdName">Nombre del hogar</Label>
                  <Input
                    id="householdName"
                    placeholder="Ej: Casa García, Depto Centro, Mi Hogar..."
                    value={householdName}
                    onChange={(e) => setHouseholdName(e.target.value)}
                    className="text-lg h-12"
                    autoFocus
                  />
                </div>
              </CardContent>
            </>
          )}

          {/* Step 2: Configuración */}
          {step === 2 && (
            <>
              <CardHeader className="text-center">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <DollarSign className="h-8 w-8 text-primary" />
                </div>
                <CardTitle className="text-2xl">Configuración básica</CardTitle>
                <CardDescription>Selecciona tu moneda y zona horaria</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="currency">Moneda</Label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger id="currency" className="h-12">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="timezone">Zona horaria</Label>
                  <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger id="timezone" className="h-12">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map((tz) => (
                        <SelectItem key={tz.value} value={tz.value}>
                          {tz.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </>
          )}

          {/* Step 3: Invitar familia */}
          {step === 3 && (
            <>
              <CardHeader className="text-center">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Users className="h-8 w-8 text-primary" />
                </div>
                <CardTitle className="text-2xl">Invita a tu familia</CardTitle>
                <CardDescription>
                  Opcional: invita a otras personas para que registren gastos contigo
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    type="email"
                    placeholder="email@ejemplo.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddEmail())}
                  />
                  <Button type="button" variant="outline" onClick={handleAddEmail}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                {inviteEmails.length > 0 && (
                  <div className="space-y-2">
                    {inviteEmails.map((email) => (
                      <div
                        key={email}
                        className="flex items-center justify-between bg-muted rounded-lg px-3 py-2"
                      >
                        <span className="text-sm">{email}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleRemoveEmail(email)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-sm text-muted-foreground">Puedes invitar más personas después desde Configuración.</p>
              </CardContent>
            </>
          )}

          {/* Footer */}
          <div className="p-6 pt-0 flex gap-3">
            {step > 1 && (
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setStep(step - 1)}
                disabled={isSubmitting}
              >
                Atrás
              </Button>
            )}

            {step < totalSteps ? (
              <Button className="flex-1" onClick={() => setStep(step + 1)} disabled={!canProceed()}>
                Continuar
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button className="flex-1" onClick={handleComplete} disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loading size="sm" className="mr-2" />
                    Creando...
                  </>
                ) : (
                  <>
                    Comenzar
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}

