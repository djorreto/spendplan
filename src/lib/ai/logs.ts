/**
 * ========================================
 * 📝 AI INTERACTION LOGS
 * ========================================
 * Sistema de logging para interacciones con AI
 * Almacena en localStorage para modo demo
 */

export interface AIInteractionLog {
  id: string
  type: 'chat' | 'ocr_assist' | 'insights' | 'categorize'
  timestamp: string
  input_text: string
  output_text: string
  user_id?: string
  household_id?: string
  provider: 'grok' | 'mock'
  success: boolean
  duration_ms?: number
}

const AI_LOGS_KEY = 'spendplan_ai_logs'
const MAX_LOGS = 100 // Keep last 100 logs

/**
 * Get all AI interaction logs
 */
export function getAILogs(): AIInteractionLog[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(AI_LOGS_KEY) || '[]')
  } catch {
    return []
  }
}

/**
 * Log an AI interaction
 */
export function logAIInteraction(log: Omit<AIInteractionLog, 'id' | 'timestamp'>): void {
  if (typeof window === 'undefined') return
  
  const logs = getAILogs()
  
  const newLog: AIInteractionLog = {
    ...log,
    id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString()
  }
  
  // Add to beginning
  logs.unshift(newLog)
  
  // Keep only last MAX_LOGS
  const trimmedLogs = logs.slice(0, MAX_LOGS)
  
  try {
    localStorage.setItem(AI_LOGS_KEY, JSON.stringify(trimmedLogs))
  } catch (e) {
    console.warn('Failed to save AI log:', e)
  }
}

/**
 * Clear all AI logs
 */
export function clearAILogs(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(AI_LOGS_KEY)
}

/**
 * Get logs by type
 */
export function getLogsByType(type: AIInteractionLog['type']): AIInteractionLog[] {
  return getAILogs().filter(log => log.type === type)
}

/**
 * Get recent logs (last n)
 */
export function getRecentLogs(count: number = 10): AIInteractionLog[] {
  return getAILogs().slice(0, count)
}

/**
 * Get logs for a specific date range
 */
export function getLogsInRange(startDate: Date, endDate: Date): AIInteractionLog[] {
  return getAILogs().filter(log => {
    const logDate = new Date(log.timestamp)
    return logDate >= startDate && logDate <= endDate
  })
}

/**
 * Get AI usage statistics
 */
export function getAIUsageStats(): {
  total: number
  byType: Record<string, number>
  byProvider: Record<string, number>
  successRate: number
  avgDuration: number
} {
  const logs = getAILogs()
  
  if (logs.length === 0) {
    return {
      total: 0,
      byType: {},
      byProvider: {},
      successRate: 0,
      avgDuration: 0
    }
  }
  
  const byType: Record<string, number> = {}
  const byProvider: Record<string, number> = {}
  let successCount = 0
  let totalDuration = 0
  let durationCount = 0
  
  logs.forEach(log => {
    byType[log.type] = (byType[log.type] || 0) + 1
    byProvider[log.provider] = (byProvider[log.provider] || 0) + 1
    if (log.success) successCount++
    if (log.duration_ms) {
      totalDuration += log.duration_ms
      durationCount++
    }
  })
  
  return {
    total: logs.length,
    byType,
    byProvider,
    successRate: Math.round((successCount / logs.length) * 100),
    avgDuration: durationCount > 0 ? Math.round(totalDuration / durationCount) : 0
  }
}
