export type DebugLogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface DebugLogEntry {
  ts: string
  level: DebugLogLevel
  opId: string
  op: string
  step?: string
  message: string
  data?: Record<string, unknown>
}

const STORAGE_KEY = 'spendplan_debug_logs_v1'
const MAX_ENTRIES = 300

function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export function createOpId(): string {
  // Prefer crypto.randomUUID (supported in modern browsers)
  const uuid = globalThis.crypto?.randomUUID?.()
  if (uuid) return uuid
  return `op_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function readDebugLogs(): DebugLogEntry[] {
  if (typeof window === 'undefined') return []
  return safeJsonParse<DebugLogEntry[]>(localStorage.getItem(STORAGE_KEY), [])
}

export function clearDebugLogs() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(STORAGE_KEY)
}

export function pushDebugLog(entry: DebugLogEntry) {
  // Store a bounded ring-buffer in localStorage for quick inspection
  if (typeof window !== 'undefined') {
    const prev = readDebugLogs()
    const next = [...prev, entry].slice(-MAX_ENTRIES)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }

  // Also log to console (structured)
  const payload = { ...entry }
  if (entry.level === 'error') console.error(payload)
  else if (entry.level === 'warn') console.warn(payload)
  else if (entry.level === 'info') console.info(payload)
  else console.log(payload)
}

export interface OpContext {
  opId: string
  op: string
}

export function startOp(op: string, data?: Record<string, unknown>): OpContext {
  const ctx = { opId: createOpId(), op }
  pushDebugLog({
    ts: new Date().toISOString(),
    level: 'info',
    opId: ctx.opId,
    op: ctx.op,
    step: 'start',
    message: 'operation started',
    data,
  })
  return ctx
}

export function logOp(
  ctx: OpContext,
  level: DebugLogLevel,
  message: string,
  step?: string,
  data?: Record<string, unknown>
) {
  pushDebugLog({
    ts: new Date().toISOString(),
    level,
    opId: ctx.opId,
    op: ctx.op,
    step,
    message,
    data,
  })
}

export function endOp(ctx: OpContext, ok: boolean, data?: Record<string, unknown>) {
  pushDebugLog({
    ts: new Date().toISOString(),
    level: ok ? 'info' : 'error',
    opId: ctx.opId,
    op: ctx.op,
    step: 'end',
    message: ok ? 'operation completed' : 'operation failed',
    data,
  })
}

export function formatSupabaseError(err: unknown): Record<string, unknown> {
  if (!err) return { message: 'Unknown error' }
  if (typeof err === 'string') return { message: err }
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(typeof (err as any).status !== 'undefined' ? { status: (err as any).status } : {}),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(typeof (err as any).code !== 'undefined' ? { code: (err as any).code } : {}),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(typeof (err as any).details !== 'undefined' ? { details: (err as any).details } : {}),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(typeof (err as any).hint !== 'undefined' ? { hint: (err as any).hint } : {}),
    }
  }
  if (typeof err === 'object') {
    return err as Record<string, unknown>
  }
  return { message: String(err) }
}

export function isLikelyDuplicateError(err: unknown): boolean {
  // Postgres unique violation: 23505
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const code = (err as any)?.code
  return code === '23505'
}

export function isLikelyRlsOrAuthError(err: unknown): boolean {
  // RLS / auth often shows as 401/403 or "permission denied"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const status = (err as any)?.status
  const msg = String(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (err as any)?.message || (err as any)?.error_description || ''
  ).toLowerCase()
  return status === 401 || status === 403 || msg.includes('permission') || msg.includes('rls')
}

export function isTransientError(err: unknown): boolean {
  // Best-effort classification: network hiccups, timeouts, 429/5xx
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const status = (err as any)?.status
  const msg = String((err as Error)?.message || '').toLowerCase()
  if (status === 429 || (typeof status === 'number' && status >= 500)) return true
  if (msg.includes('failed to fetch') || msg.includes('network') || msg.includes('timeout')) return true
  return false
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { retries: number; baseDelayMs: number; ctx: OpContext; step: string }
): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    try {
      if (attempt > 0) {
        logOp(opts.ctx, 'warn', 'retrying', opts.step, { attempt })
      }
      return await fn()
    } catch (err) {
      lastErr = err
      const transient = isTransientError(err)
      logOp(opts.ctx, transient ? 'warn' : 'error', 'attempt failed', opts.step, {
        attempt,
        transient,
        error: formatSupabaseError(err),
      })
      if (!transient || attempt === opts.retries) break
      const delay = Math.round(opts.baseDelayMs * Math.pow(2, attempt) + Math.random() * 100)
      await new Promise((r) => setTimeout(r, delay))
    }
  }
  throw lastErr
}

