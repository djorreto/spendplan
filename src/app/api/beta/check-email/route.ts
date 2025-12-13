import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { isBetaModeEnabled, normalizeEmail } from '@/lib/beta-allowlist'

export async function POST(req: Request) {
  const betaMode = isBetaModeEnabled()

  let body: any = null
  try {
    body = await req.json()
  } catch {
    body = null
  }

  const email = normalizeEmail(body?.email)
  if (!email) {
    return NextResponse.json({ betaMode, allowed: false }, { status: 400 })
  }

  // When beta is disabled, behave like normal signup.
  if (!betaMode) {
    return NextResponse.json({ betaMode: false, allowed: true })
  }

  if (!supabaseAdmin) {
    return NextResponse.json(
      { betaMode: true, allowed: false, error: 'SUPABASE_SERVICE_ROLE_KEY not configured' },
      { status: 500 }
    )
  }

  const { data, error } = await supabaseAdmin
    .from('beta_allowlist')
    .select('email')
    .eq('email', email)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ betaMode: true, allowed: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ betaMode: true, allowed: !!data })
}

