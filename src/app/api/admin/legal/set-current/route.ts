import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/admin-auth'
import { setCurrentVersion } from '@/lib/legal'
import type { LegalDocType } from '@/types'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    await requireSuperAdmin(req)
    const body = await req.json().catch(() => ({}))
    const docType = (body?.doc_type === 'privacy' ? 'privacy' : 'terms') as LegalDocType
    const version = String(body?.version || '').trim()
    if (!version) {
      return NextResponse.json({ error: 'version is required' }, { status: 400 })
    }
    const data = await setCurrentVersion(docType, version)
    return NextResponse.json({ data })
  } catch (error: any) {
    const message = error?.message || 'Unexpected error'
    const status = message === 'unauthorized' ? 401 : message === 'forbidden' ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
