import { NextResponse } from 'next/server'
import { getCurrentLegalDocuments } from '@/lib/legal'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const data = await getCurrentLegalDocuments()
    return NextResponse.json({ data })
  } catch (error: any) {
    const message = error?.message || 'Unexpected error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
