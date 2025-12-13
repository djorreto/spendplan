import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
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

  // Prefer service role if configured; otherwise use a SECURITY DEFINER RPC
  // (keeps table private while allowing boolean checks without exposing emails).
  if (!supabaseAdmin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !anon) {
      return NextResponse.json(
        { betaMode: true, allowed: false, error: 'Supabase env not configured' },
        { status: 500 }
      )
    }

    const supabase = createClient(url, anon)
    const { data, error } = await supabase.rpc('beta_is_allowed', { p_email: email })
    if (error) {
      return NextResponse.json({ betaMode: true, allowed: false, error: error.message }, { status: 500 })
    }
    return NextResponse.json({ betaMode: true, allowed: !!data })
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

