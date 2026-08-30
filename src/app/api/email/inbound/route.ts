import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { extractEmailAddress, extractInboundToken } from '@/lib/inbound-email'
import { defaultExpenseDate, htmlToText, parseBankEmail } from '@/lib/parse-bank-email'
import { verifyResendWebhook } from '@/lib/resend-webhook'

export const runtime = 'nodejs'

type ResendReceivedEvent = {
  type?: string
  data?: {
    email_id?: string
    from?: string
    to?: string[]
    cc?: string[]
    bcc?: string[]
    received_for?: string[]
    subject?: string
  }
}

type ReceivedEmail = {
  id?: string
  from?: string
  to?: string[]
  cc?: string[]
  subject?: string
  text?: string | null
  html?: string | null
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error('Supabase service role is not configured')
  }
  return createClient(url, serviceKey)
}

function collectAddresses(event: ResendReceivedEvent, email: ReceivedEmail | null): string[] {
  return [
    ...(event.data?.to || []),
    ...(event.data?.cc || []),
    ...(event.data?.received_for || []),
    ...(email?.to || []),
    ...(email?.cc || []),
  ]
}

async function fetchReceivedEmail(emailId: string): Promise<ReceivedEmail | null> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return null
  const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok) {
    console.error('Resend receiving.get failed', res.status, await res.text())
    return null
  }
  return (await res.json()) as ReceivedEmail
}

async function findHouseholdByToken(token: string) {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('households')
    .select('id, settings')
    .eq('settings->>inbound_email_token', token)
    .maybeSingle()
  if (error) throw error
  return data
}

async function resolveCreatedBy(householdId: string, fromAddress: string | null) {
  const supabase = getSupabase()
  if (fromAddress) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', fromAddress)
      .maybeSingle()
    if (profile?.id) {
      const { data: membership } = await supabase
        .from('household_memberships')
        .select('user_id')
        .eq('household_id', householdId)
        .eq('user_id', profile.id)
        .eq('is_active', true)
        .maybeSingle()
      if (membership?.user_id) return membership.user_id
    }
  }

  const { data: owner } = await supabase
    .from('household_memberships')
    .select('user_id')
    .eq('household_id', householdId)
    .eq('role', 'owner')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()
  return owner?.user_id || null
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.text()
    const secret = process.env.RESEND_WEBHOOK_SECRET
    if (!secret) {
      console.error('RESEND_WEBHOOK_SECRET is not set')
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 })
    }

    const id = req.headers.get('svix-id')
    const timestamp = req.headers.get('svix-timestamp')
    const signature = req.headers.get('svix-signature')
    if (!id || !timestamp || !signature) {
      return NextResponse.json({ error: 'Missing signature headers' }, { status: 400 })
    }

    try {
      verifyResendWebhook(payload, { id, timestamp, signature }, secret)
    } catch (error) {
      console.error('Resend webhook verify failed', error)
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
    }

    const event = JSON.parse(payload) as ResendReceivedEvent
    if (event.type !== 'email.received') {
      return NextResponse.json({ ok: true, ignored: event.type || 'unknown' })
    }

    const emailId = event.data?.email_id
    if (!emailId) {
      return NextResponse.json({ ok: true, ignored: 'missing_email_id' })
    }

    const supabase = getSupabase()
    const { data: existing } = await supabase
      .from('inbound_emails')
      .select('id, expense_id')
      .eq('resend_email_id', emailId)
      .maybeSingle()
    if (existing) {
      return NextResponse.json({ ok: true, duplicate: true, expense_id: existing.expense_id })
    }

    const received = await fetchReceivedEmail(emailId)
    const toAddresses = collectAddresses(event, received)
    const token = extractInboundToken(toAddresses)
    if (!token) {
      return NextResponse.json({ ok: true, ignored: 'no_household_token' })
    }

    const household = await findHouseholdByToken(token)
    if (!household) {
      return NextResponse.json({ ok: true, ignored: 'unknown_token' })
    }

    const subject = received?.subject || event.data?.subject || null
    const textBody = (received?.text || htmlToText(received?.html) || '').trim()
    const parsed = parseBankEmail({ subject, text: textBody, html: received?.html })
    const fromAddress = extractEmailAddress(received?.from || event.data?.from || '')
    const createdBy = await resolveCreatedBy(household.id, fromAddress || null)

    let expenseId: string | null = null
    let status = 'unparsed'
    let error: string | null = null

    if (parsed.amount) {
      const { data: inserted, error: insertError } = await supabase
        .from('expenses')
        .insert({
          household_id: household.id,
          amount: parsed.amount,
          merchant: parsed.merchant,
          description: parsed.description,
          expense_date: defaultExpenseDate(parsed),
          payment_method: parsed.payment_method,
          source: 'api',
          status: 'pending',
          is_unbudgeted: true,
          created_by: createdBy,
          updated_by: createdBy,
          notes: [`email:${emailId}`, subject ? `asunto:${subject}` : null].filter(Boolean).join('\n'),
          tags: ['email'],
        })
        .select('id')
        .single()

      if (insertError || !inserted?.id) {
        console.error('Inbound expense insert failed', insertError)
        status = 'error'
        error = insertError?.message || 'expense_insert_failed'
      } else {
        expenseId = inserted.id
        status = 'parsed'
      }
    }

    const { error: logError } = await supabase.from('inbound_emails').insert({
      household_id: household.id,
      resend_email_id: emailId,
      from_address: fromAddress || null,
      to_addresses: toAddresses,
      subject,
      text_body: textBody.slice(0, 20_000),
      parsed,
      expense_id: expenseId,
      status,
      error,
    })

    if (logError) {
      if (logError.code === '23505') {
        return NextResponse.json({ ok: true, duplicate: true })
      }
      console.error('Inbound email log failed', logError)
    }

    return NextResponse.json({ ok: true, status, expense_id: expenseId })
  } catch (error) {
    console.error('Inbound email webhook error', error)
    return NextResponse.json({ ok: true, error: 'handler_failed' })
  }
}
