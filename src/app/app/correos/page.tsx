'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/hooks/use-auth'
import { useHousehold } from '@/hooks/use-household'
import { useToast } from '@/components/ui/toast'
import { generateInboundToken, householdInboundAddress } from '@/lib/inbound-email'
import { BANK_EMAIL_GUIDES, type BankEmailGuide } from '@/lib/bank-email-guides'
import { supabaseBrowser } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { HouseholdSettings } from '@/types'
import { Mail, Copy, Check, Building2, AlertTriangle, CircleCheck } from 'lucide-react'

function CopyRow({
  label,
  value,
  onCopy,
  copied,
}: {
  label: string
  value: string
  onCopy: () => void
  copied: boolean
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono break-all">
          {value}
        </code>
        <Button variant="outline" size="icon" onClick={onCopy} aria-label={`Copiar ${label}`}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}

export default function CorreosPage() {
  const { profile } = useAuth()
  const { currentHousehold, updateHousehold, isOwner } = useHousehold()
  const { addToast } = useToast()
  const [creatingInbox, setCreatingInbox] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [bankId, setBankId] = useState(BANK_EMAIL_GUIDES[0].id)
  const [forwarding, setForwarding] = useState(currentHousehold?.settings?.gmail_forwarding)

  const inboundToken = currentHousehold?.settings?.inbound_email_token || null
  const inboundAddress = householdInboundAddress(inboundToken)
  const bank = BANK_EMAIL_GUIDES.find((item) => item.id === bankId) || BANK_EMAIL_GUIDES[0]
  const userEmail = profile?.email || null
  const gmailIsGmail = /@gmail\.com$/i.test(userEmail || '')

  useEffect(() => {
    setForwarding(currentHousehold?.settings?.gmail_forwarding)
  }, [currentHousehold?.settings?.gmail_forwarding])

  useEffect(() => {
    if (!currentHousehold?.id || forwarding?.status === 'confirmed') return
    const supabase = supabaseBrowser()
    const tick = async () => {
      const { data } = await supabase
        .from('households')
        .select('settings')
        .eq('id', currentHousehold.id)
        .maybeSingle()
      const next = (data?.settings as HouseholdSettings | undefined)?.gmail_forwarding
      if (next) setForwarding(next)
    }
    const timer = window.setInterval(tick, 4000)
    return () => window.clearInterval(timer)
  }, [currentHousehold?.id, forwarding?.status])

  const copy = async (key: string, value: string, ok: string) => {
    await navigator.clipboard.writeText(value)
    setCopied(key)
    addToast({ type: 'success', message: ok })
    setTimeout(() => setCopied((current) => (current === key ? null : current)), 2000)
  }

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
      addToast({ type: 'success', message: 'Casilla del hogar lista' })
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold">Correos del banco</h1>
        <p className="text-muted-foreground mt-1">
          Itaú le escribe a tu Gmail. Gmail le reenvía solo esos avisos a este hogar.
          SpendPlan los lee y los deja pendientes en Gastos.
        </p>
      </div>

      {forwarding?.status === 'confirmed' && (
        <Card className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30">
          <CardContent className="p-4 text-sm flex items-start gap-2">
            <CircleCheck className="h-5 w-5 text-green-700 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-green-950 dark:text-green-100">
                Listo: SpendPlan ya confirmó el reenvío de Gmail
                {forwarding.gmail_address ? ` de ${forwarding.gmail_address}` : ''}.
              </p>
              <p className="text-green-800 dark:text-green-200 mt-1">
                Sigue con el filtro de Itaú (paso 3). No actives “reenviar todos los mensajes”.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {forwarding?.status === 'needs_click' && (
        <Card className="border-sky-200 bg-sky-50 dark:border-sky-900 dark:bg-sky-950/30">
          <CardContent className="p-4 text-sm space-y-3">
            <p className="font-medium">Gmail ya pidió confirmar el reenvío. Confírmalo aquí, no en otro sitio.</p>
            {forwarding.confirmation_url ? (
              <Button asChild>
                <a href={forwarding.confirmation_url} target="_blank" rel="noreferrer">
                  Confirmar reenvío de Gmail
                </a>
              </Button>
            ) : forwarding.confirmation_code ? (
              <p>
                En Gmail → Reenvío y correo POP/IMAP, pega este código:{' '}
                <code className="bg-white px-1.5 py-0.5 rounded">{forwarding.confirmation_code}</code>
              </p>
            ) : (
              <p className="text-muted-foreground">Espera unos segundos y recarga esta página.</p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Tu correo en esta sesión
          </CardTitle>
          <CardDescription>
            Estos pasos se hacen con la cuenta que está abierta ahora. Si entra otra persona
            del hogar, verá el suyo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-lg border bg-muted/30 px-4 py-3">
            <p className="text-xs text-muted-foreground">Correo con el que entraste a SpendPlan</p>
            <p className="font-medium mt-0.5">{userEmail || 'Cargando…'}</p>
            {!gmailIsGmail && userEmail && (
              <p className="text-sm text-muted-foreground mt-2">
                El filtro se hace en Gmail. Si Itaú te escribe a otra cuenta, abre ese Gmail
                o cambia el mail en Itaú a este.
              </p>
            )}
          </div>
          {inboundAddress ? (
            <CopyRow
              label="Casilla de este hogar (pégala en Gmail)"
              value={inboundAddress}
              copied={copied === 'inbox'}
              onCopy={() => copy('inbox', inboundAddress, 'Casilla copiada')}
            />
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Este hogar todavía no tiene casilla.</p>
              {isOwner && (
                <Button onClick={handleCreateInbox} disabled={creatingInbox}>
                  {creatingInbox ? 'Creando...' : 'Crear casilla del hogar'}
                </Button>
              )}
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            Si dos personas del hogar reciben Itaú, cada una hace el filtro en su Gmail
            con <strong>esta misma casilla</strong>.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cómo se configura, en orden</CardTitle>
          <CardDescription>
            Hazlo en el computador. En el celular Gmail no muestra bien el reenvío.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 text-sm leading-relaxed">
          <ol className="list-decimal pl-5 space-y-4">
            <li>
              <strong>Abre tu Gmail</strong> ({userEmail || 'el correo de arriba'}) en{' '}
              <a href="https://mail.google.com" className="underline" target="_blank" rel="noreferrer">
                mail.google.com
              </a>
              .
            </li>
            <li>
              Arriba a la derecha: engranaje → <strong>Ver toda la configuración</strong> →
              pestaña <strong>Reenvío y correo POP/IMAP</strong>.
            </li>
            <li>
              <strong>Añadir una dirección de reenvío</strong> y pega la casilla de este hogar.
              Gmail manda un mail de confirmación a SpendPlan. <strong>No te llega a ti</strong>:
              esta página se actualiza sola cuando SpendPlan lo confirma.
              Quédate acá unos segundos. Si aparece el botón azul, tócalo.
            </li>
            <li>
              Cuando la dirección quede verificada, <strong>no</strong> actives
              “Reenviar una copia de todos los mensajes”. Eso mandaría todo tu Gmail.
              El reenvío va solo en el filtro de Itaú, abajo.
            </li>
          </ol>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-[220px_1fr]">
        <Card className="h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Banco</CardTitle>
            <CardDescription>Empieza por Itaú. Después sumamos los demás.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {BANK_EMAIL_GUIDES.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setBankId(item.id)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-left',
                  bankId === item.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                )}
              >
                <Building2 className="h-4 w-4 shrink-0" />
                <span className="flex-1">{item.name}</span>
                <Badge variant={bankId === item.id ? 'secondary' : 'outline'} className="text-[10px]">
                  {item.country}
                </Badge>
              </button>
            ))}
          </CardContent>
        </Card>

        <BankPanel
          bank={bank}
          userEmail={userEmail}
          inboundAddress={inboundAddress}
          copied={copied}
          onCopy={copy}
        />
      </div>
    </div>
  )
}

function BankPanel({
  bank,
  userEmail,
  inboundAddress,
  copied,
  onCopy,
}: {
  bank: BankEmailGuide
  userEmail: string | null
  inboundAddress: string | null
  copied: string | null
  onCopy: (key: string, value: string, ok: string) => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{bank.name}</CardTitle>
        <CardDescription>
          Primero que el banco te escriba a {userEmail || 'tu Gmail'}. Después Gmail reenvía solo eso.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 text-sm leading-relaxed">
        <section className="space-y-2">
          <h3 className="font-semibold text-foreground">1. Avisos en {bank.name}</h3>
          <ol className="list-decimal pl-5 space-y-2">
            {bank.activateAlerts.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <p className="text-muted-foreground">
            Haz una compra chica o espera un aviso. Tiene que aparecer en{' '}
            {userEmail || 'tu Gmail'} (bandeja, Promociones o Spam) antes de seguir.
          </p>
        </section>

        <section className="space-y-3">
          <h3 className="font-semibold text-foreground">2. Filtro en Gmail: solo {bank.name}</h3>
          <ol className="list-decimal pl-5 space-y-2">
            <li>
              En la misma configuración de Gmail, pestaña{' '}
              <strong>Filtros y direcciones bloqueadas</strong> → Crear un filtro.
            </li>
            <li>En <strong>De</strong> pega esto. Deja Para y Asunto vacíos:</li>
          </ol>
          <CopyRow
            label="Campo De"
            value={bank.filter}
            copied={copied === `filter-${bank.id}`}
            onCopy={() => onCopy(`filter-${bank.id}`, bank.filter, 'Filtro copiado')}
          />
          <ol className="list-decimal pl-5 space-y-2" start={3}>
            <li>Crear filtro.</li>
            <li>
              Marca <strong>Reenviarlo a</strong>{' '}
              {inboundAddress ? (
                <code className="text-xs bg-muted px-1 rounded">{inboundAddress}</code>
              ) : (
                'la casilla del hogar'
              )}
              . Ponle la etiqueta <strong>{bank.label}</strong>. No marques Eliminarlo.
            </li>
          </ol>
        </section>

        <section className="space-y-2">
          <h3 className="font-semibold text-foreground">3. Comprobar</h3>
          <ol className="list-decimal pl-5 space-y-2">
            <li>En Gmail busca esto. El aviso nuevo debe tener la etiqueta {bank.label}.</li>
          </ol>
          <CopyRow
            label="Búsqueda en Gmail"
            value={bank.search}
            copied={copied === `search-${bank.id}`}
            onCopy={() => onCopy(`search-${bank.id}`, bank.search, 'Búsqueda copiada')}
          />
          <ol className="list-decimal pl-5 space-y-2" start={2}>
            <li>
              En SpendPlan →{' '}
              <Link href="/app/expenses" className="underline">
                Gastos
              </Link>
              , mes actual, badge Pendiente. Revísalo y confírmalo.
            </li>
          </ol>
        </section>

        <section className="space-y-2">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Si no aparece
          </h3>
          <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
            <li>¿El aviso está en {userEmail || 'tu Gmail'}? Si no, Itaú tiene otro mail o solo te avisa al celular.</li>
            <li>¿Tiene la etiqueta {bank.label}? Si no, el remitente no calza. Abre el mail → mostrar original.</li>
            <li>¿Gmail ya verificó la casilla? Si esta página no dice “Listo”, espera o toca el botón de confirmar.</li>
          </ul>
          <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
            {bank.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>
      </CardContent>
    </Card>
  )
}
