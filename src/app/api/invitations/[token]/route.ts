import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const runtime = 'nodejs'

export async function GET(_req: NextRequest, ctx: { params: { token: string } }) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 })
  }

  const token = ctx.params?.token
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 })

  const nowIso = new Date().toISOString()
  const { data, error } = await supabaseAdmin
    .from('household_invitations')
    .select('id, household_id, email, role, expires_at, accepted_at, created_at, household:households(name)')
    .eq('token', token)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
  }

  // Validate expiry / accepted
  if (data.accepted_at) {
    return NextResponse.json({ error: 'Invitation already accepted' }, { status: 409 })
  }
  if (data.expires_at && data.expires_at <= nowIso) {
    return NextResponse.json({ error: 'Invitation expired' }, { status: 410 })
  }

  return NextResponse.json({
    id: data.id,
    household_id: data.household_id,
    household_name: (data as unknown as { household?: { name?: string } }).household?.name ?? null,
    email: data.email,
    role: data.role,
    expires_at: data.expires_at,
    created_at: data.created_at,
  })
}

