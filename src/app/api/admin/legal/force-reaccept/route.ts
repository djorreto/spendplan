import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/admin-auth'
import { forceReacceptance } from '@/lib/legal'
import type { LegalDocType } from '@/types'

export async function POST(req: Request) {
  try {
    await requireSuperAdmin(req)
    const body = await req.json().catch(() => ({}))
    const docType = body?.doc_type as LegalDocType | 'both' | undefined
    const docTypes: LegalDocType[] =
      docType === 'terms' ? ['terms'] : docType === 'privacy' ? ['privacy'] : ['terms', 'privacy']

    await forceReacceptance(docTypes)
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    const message = error?.message || 'Unexpected error'
    const status = message === 'unauthorized' ? 401 : message === 'forbidden' ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
