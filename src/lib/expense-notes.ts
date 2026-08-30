const SYSTEM_PREFIXES = ['email:', 'asunto:', 'excel:', 'telegram', 'telegram_user:']

function isSystemLine(line: string): boolean {
  const value = line.trim().toLowerCase()
  return SYSTEM_PREFIXES.some((prefix) => value.startsWith(prefix))
}

export function expenseUserComment(notes: string | null | undefined): string {
  if (!notes) return ''
  return notes
    .split('\n')
    .filter((line) => line.trim() && !isSystemLine(line))
    .join('\n')
}

export function withExpenseUserComment(notes: string | null | undefined, comment: string): string | null {
  const system = (notes || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && isSystemLine(line))
  const clean = comment.trim()
  const next = [...system, clean].filter(Boolean)
  return next.length ? next.join('\n') : null
}
