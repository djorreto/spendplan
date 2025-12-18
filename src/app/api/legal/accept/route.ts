import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/admin-auth'
import { ensureSupabaseAdmin, getCurrentLegalDocuments } from '@/lib/legal'

export async function POST(req: Request) {
  try {
    const user = await getSessionUser(req)
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const admin = ensureSupabaseAdmin()
    const current = await getCurrentLegalDocuments()
    const termsVersion = current.terms?.version || null
    const privacyVersion = current.privacy?.version || null

    if (!termsVersion && !privacyVersion) {
      return NextResponse.json({ error: 'No hay versiones vigentes' }, { status: 400 })
    }

    const now = new Date().toISOString()
    const updates: Record<string, any> = {}
    if (termsVersion) {
      updates.terms_version = termsVersion
      updates.terms_accepted_at = now
    }
    if (privacyVersion) {
      updates.privacy_version = privacyVersion
      updates.privacy_accepted_at = now
    }

    const { error: updateError } = await admin.from('profiles').update(updates).eq('id', user.id)
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    const { error: insertError } = await admin.from('legal_acceptances').insert({
      user_id: user.id,
      terms_version: termsVersion,
      privacy_version: privacyVersion,
      action: 'accepted',
    })
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, versions: { terms: termsVersion, privacy: privacyVersion } })
  } catch (error: any) {
    const message = error?.message || 'Unexpected error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
