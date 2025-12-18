import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/admin-auth'
import { getLegalDocuments } from '@/lib/legal'
import type { LegalDocType } from '@/types'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    await requireSuperAdmin(req)
    const { searchParams } = new URL(req.url)
    const docType = searchParams.get('doc_type') as LegalDocType | null
    const docs = await getLegalDocuments(docType || undefined)
    if (docType) {
      return NextResponse.json({ data: docs })
    }
    const grouped: Record<LegalDocType, any[]> = { terms: [], privacy: [] }
    docs.forEach((d) => grouped[d.doc_type as LegalDocType]?.push(d))
    return NextResponse.json({ data: grouped })
  } catch (error: any) {
    const message = error?.message || 'Unexpected error'
    const status = message === 'unauthorized' ? 401 : message === 'forbidden' ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
