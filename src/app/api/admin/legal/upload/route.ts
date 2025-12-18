import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/admin-auth'
import { BUCKETS } from '@/lib/storage'
import { createLegalDocument, getNextVersionFor } from '@/lib/legal'
import { supabaseAdmin } from '@/lib/supabase'
import type { LegalDocType } from '@/types'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const { user } = await requireSuperAdmin()
    if (!supabaseAdmin) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured')

    const formData = await req.formData()
    const docTypeRaw = formData.get('doc_type')
    const makeCurrentRaw = formData.get('make_current')
    const titleRaw = formData.get('title')
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 })
    }

    const docType = docTypeRaw === 'privacy' ? 'privacy' : 'terms'
    const makeCurrent = String(makeCurrentRaw || '').toLowerCase() === 'true'
    const title = (titleRaw as string | null)?.trim() || file.name || 'Legal'

    const version = await getNextVersionFor(docType as LegalDocType)
    const path = `legal/${docType}/${version}.pdf`

    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKETS.LEGAL)
      .upload(path, file, { upsert: true, cacheControl: '3600' })
    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }

    const doc = await createLegalDocument({
      docType: docType as LegalDocType,
      title,
      storagePath: path,
      createdBy: user.id,
      makeCurrent,
      version,
    })

    return NextResponse.json({ data: doc })
  } catch (error: any) {
    console.error('legal upload error', error)
    const message = error?.message || 'Unexpected error'
    const status = message === 'unauthorized' ? 401 : message === 'forbidden' ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
