import { supabaseAdmin } from './supabase'
import type { LegalDocument, LegalDocType } from '@/types'

export function ensureSupabaseAdmin() {
  if (!supabaseAdmin) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured')
  }
  return supabaseAdmin
}

export async function getLegalDocuments(docType?: LegalDocType) {
  const admin = ensureSupabaseAdmin()
  const query = admin.from('legal_documents').select('*').order('created_at', { ascending: false })
  if (docType) query.eq('doc_type', docType)
  const { data, error } = await query
  if (error) throw error
  return data as LegalDocument[]
}

export async function getCurrentLegalDocuments() {
  const admin = ensureSupabaseAdmin()
  const { data, error } = await admin
    .from('legal_documents')
    .select('*')
    .eq('is_current', true)
  if (error) throw error
  const current: Partial<Record<LegalDocType, LegalDocument | null>> = {}
  ;(data || []).forEach((doc) => {
    current[doc.doc_type as LegalDocType] = doc as LegalDocument
  })
  return current
}

export async function getCurrentVersion(docType: LegalDocType) {
  const current = await getCurrentLegalDocuments()
  return current[docType] || null
}

export function nextMinorVersion(latest?: string | null) {
  if (!latest) return 'v1.1'
  const match = latest.match(/^v(\d+)\.(\d+)$/i)
  if (!match) return 'v1.1'
  const major = Number(match[1])
  const minor = Number(match[2])
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return 'v1.1'
  return `v${major}.${minor + 1}`
}

export async function getNextVersionFor(docType: LegalDocType) {
  const admin = ensureSupabaseAdmin()
  const { data, error } = await admin
    .from('legal_documents')
    .select('version')
    .eq('doc_type', docType)
  if (error) throw error
  const latest = (data || [])
    .map((d) => d.version)
    .filter(Boolean)
    .reduce<string | null>((max, ver) => {
      if (!max) return ver
      const [mMajor, mMinor] = parseVersion(max)
      const [vMajor, vMinor] = parseVersion(ver)
      if (vMajor > mMajor) return ver
      if (vMajor === mMajor && vMinor > mMinor) return ver
      return max
    }, null)
  return nextMinorVersion(latest)
}

export async function createLegalDocument(params: {
  docType: LegalDocType
  title: string
  storagePath: string
  createdBy?: string | null
  makeCurrent?: boolean
  version?: string
}) {
  const admin = ensureSupabaseAdmin()
  const version = params.version || (await getNextVersionFor(params.docType))
  const { data, error } = await admin
    .from('legal_documents')
    .insert({
      doc_type: params.docType,
      version,
      title: params.title,
      storage_path: params.storagePath,
      created_by: params.createdBy || null,
      is_current: !!params.makeCurrent,
    })
    .select()
    .single()
  if (error) throw error

  if (params.makeCurrent) {
    await setCurrentVersion(params.docType, version)
  }

  return data as LegalDocument
}

export async function setCurrentVersion(docType: LegalDocType, version: string) {
  const admin = ensureSupabaseAdmin()
  // Turn off previous current
  const { error: clearError } = await admin
    .from('legal_documents')
    .update({ is_current: false })
    .eq('doc_type', docType)
  if (clearError) throw clearError

  const { error: setError, data } = await admin
    .from('legal_documents')
    .update({ is_current: true })
    .eq('doc_type', docType)
    .eq('version', version)
    .select()
    .single()

  if (setError) throw setError
  return data as LegalDocument
}

export async function forceReacceptance(docTypes: LegalDocType[]) {
  const admin = ensureSupabaseAdmin()
  const current = await getCurrentLegalDocuments()
  const targetTerms = docTypes.includes('terms') ? current.terms?.version || null : null
  const targetPrivacy = docTypes.includes('privacy') ? current.privacy?.version || null : null

  // Reset profiles fields
  const updates: Record<string, any> = {}
  if (docTypes.includes('terms')) {
    updates.terms_version = null
    updates.terms_accepted_at = null
  }
  if (docTypes.includes('privacy')) {
    updates.privacy_version = null
    updates.privacy_accepted_at = null
  }
  if (Object.keys(updates).length > 0) {
    const { error } = await admin.from('profiles').update(updates)
    if (error) throw error
  }

  // Log the force reset for auditing
  const { data: profiles, error: profilesError } = await admin
    .from('profiles')
    .select('id')
  if (profilesError) throw profilesError

  const rows =
    profiles?.map((p) => ({
      user_id: p.id,
      terms_version: targetTerms,
      privacy_version: targetPrivacy,
      action: 'force_reset',
    })) || []

  if (rows.length > 0) {
    const { error: insertError } = await admin.from('legal_acceptances').insert(rows)
    if (insertError) throw insertError
  }
}

export function buildPublicLegalUrl(path: string) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  if (!base) return path
  return `${base.replace(/\/$/, '')}/storage/v1/object/public/${path.replace(/^\/+/, '')}`
}

function parseVersion(version?: string | null): [number, number] {
  if (!version) return [0, 0]
  const match = version.match(/^v(\d+)\.(\d+)$/i)
  if (!match) return [0, 0]
  return [Number(match[1]) || 0, Number(match[2]) || 0]
}
