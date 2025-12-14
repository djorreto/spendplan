import { NextResponse } from 'next/server'
import { isBetaModeEnabled, normalizeEmail } from '@/lib/beta-allowlist'
import { createClient } from '@supabase/supabase-js'

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

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceKey || !supabaseUrl) {
    return NextResponse.json(
      { betaMode: true, allowed: false, error: 'Missing service role or Supabase URL' },
      { status: 500 }
    )
  }

  // Always use service role to avoid RLS/permission issues
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data, error } = await admin
    .from('beta_allowlist')
    .select('email')
    .eq('email', email)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ betaMode: true, allowed: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ betaMode: true, allowed: !!data })
}

