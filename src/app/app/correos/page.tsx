'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
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
import { cn } from '@/lib/utils'
import { Mail, Copy, Check, Building2, AlertTriangle } from 'lucide-react'

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

  const inboundToken = currentHousehold?.settings?.inbound_email_token || null
  const inboundAddress = householdInboundAddress(inboundToken)
  const bank = BANK_EMAIL_GUIDES.find((item) => item.id === bankId) || BANK_EMAIL_GUIDES[0]
  const gmail = profile?.email || 'tu Gmail'
  const gmailIsGmail = /@gmail\.com$/i.test(profile?.email || '')

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
      addToast({ type: 'success', message: 'Casilla del hogar creada' })
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold">Correos del banco</h1>
        <p className="text-muted-foreground mt-1">
          Gmail es tu bandeja. SpendPlan solo recibe el reenvío de los avisos del banco,
          una casilla por hogar.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Casilla de este hogar
          </CardTitle>
          <CardDescription>
            No uses djorreto@spendplan.cl. Esa es Titan, de contacto. Esta casilla es virtual.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {inboundAddress ? (
            <CopyRow
              label="Reenviar aquí"
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
            Groq lee el mail y sugiere si es un <strong>fijo del plan</strong>, un{' '}
            <strong>variable</strong> o algo <strong>no presupuestado</strong>. Queda{' '}
            <strong>Pendiente</strong> en{' '}
            <Link href="/app/expenses" className="underline">
              Gastos
            </Link>
            : tú confirmas, corriges o lo borras.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>1. Gmail, tu correo principal</CardTitle>
          <CardDescription>
            El banco escribe a Gmail. Gmail reenvía solo esos avisos a SpendPlan.
            Esto se hace una vez; después eliges el banco.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="rounded-lg border bg-muted/30 px-4 py-3">
            <p className="text-muted-foreground">Correo con el que entras a SpendPlan</p>
            <p className="font-medium mt-0.5">{gmail}</p>
            {!gmailIsGmail && (
              <p className="text-muted-foreground mt-2">
                Si Itaú no llega a esta cuenta, registra este Gmail en el banco o haz
                el filtro en el Gmail donde sí llegan los avisos.
              </p>
            )}
          </div>

          <ol className="list-decimal pl-5 space-y-3 leading-relaxed">
            <li>
              Ábrelo en el <strong>computador</strong>, no en la app del celular:{' '}
              <a
                href="https://mail.google.com"
                className="underline"
                target="_blank"
                rel="noreferrer"
              >
                mail.google.com
              </a>
            </li>
            <li>
              Engranaje → <strong>Ver toda la configuración</strong> → pestaña{' '}
              <strong>Reenvío y correo POP/IMAP</strong>.
            </li>
            <li>
              <strong>Añadir una dirección de reenvío</strong> y pega la casilla de arriba.
              Gmail manda un mail de confirmación a esa casilla. No llega a {gmail}:
              ábrelo en{' '}
              <a
                href="https://resend.com/emails"
                className="underline"
                target="_blank"
                rel="noreferrer"
              >
                resend.com/emails
              </a>{' '}
              → Receiving → asunto “Gmail Forwarding Confirmation”. Confirma el enlace o el código.
            </li>
            <li>
              Cuando la dirección figure como verificada, <strong>no</strong> actives
              “Reenviar una copia de todos los mensajes a…”. Eso mandaría todo tu Gmail.
              El reenvío va en el filtro del banco, abajo.
            </li>
          </ol>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-[220px_1fr]">
        <Card className="h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">2. Banco</CardTitle>
            <CardDescription>Instrucciones distintas por banco.</CardDescription>
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
            <p className="text-xs text-muted-foreground pt-2">
              Después sumamos Santander, BancoEstado y los demás.
            </p>
          </CardContent>
        </Card>

        <BankPanel
          bank={bank}
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
  inboundAddress,
  copied,
  onCopy,
}: {
  bank: BankEmailGuide
  inboundAddress: string | null
  copied: string | null
  onCopy: (key: string, value: string, ok: string) => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{bank.name}</CardTitle>
        <CardDescription>
          Primero que el banco escriba a Gmail. Después el filtro reenvía todo {bank.name} a SpendPlan.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 text-sm leading-relaxed">
        <section className="space-y-2">
          <h3 className="font-semibold text-foreground">Activar avisos en {bank.name}</h3>
          <ol className="list-decimal pl-5 space-y-2">
            {bank.activateAlerts.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>

        <section className="space-y-3">
          <h3 className="font-semibold text-foreground">Filtro en Gmail, solo este banco</h3>
          <ol className="list-decimal pl-5 space-y-2">
            <li>
              Configuración → <strong>Filtros y direcciones bloqueadas</strong> → Crear un filtro.
            </li>
            <li>En De pega esto. Deja Para y Asunto vacíos, para que entre todo el banco:</li>
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
              . Aplica la etiqueta <strong>{bank.label}</strong>. No marques Eliminarlo.
            </li>
            <li>Si otra persona del hogar también recibe {bank.name}, repite Gmail + este filtro en su cuenta, con la misma casilla.</li>
          </ol>
        </section>

        <section className="space-y-2">
          <h3 className="font-semibold text-foreground">Comprobar</h3>
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
            <li>En SpendPlan → Gastos, el mes actual, badge Pendiente. Menú ⋮ → Confirmar.</li>
          </ol>
        </section>

        <section className="space-y-2">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Si no aparece
          </h3>
          <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
            <li>¿El aviso está en Gmail? Si no, el email en {bank.name} está mal o los avisos van solo al celular.</li>
            <li>¿Tiene la etiqueta {bank.label}? Si no, el From no coincide. Abre el mail → mostrar original.</li>
            <li>¿La casilla está verificada en Reenvío y correo POP/IMAP?</li>
            <li>Remitentes que cubre este filtro:</li>
          </ul>
          <ul className="list-disc pl-8 text-muted-foreground">
            {bank.senders.map((sender) => (
              <li key={sender}>{sender}</li>
            ))}
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
