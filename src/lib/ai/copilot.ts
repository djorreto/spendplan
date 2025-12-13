/**
 * ========================================
 * 🤖 COPILOTO FINANCIERO - GROQ (Llama)
 * ========================================
 * Chat interactivo para análisis financiero
 * Solo texto, activado por el usuario
 * Usa Groq (gratuito) con modelo Llama
 */

import { logAIInteraction } from './logs'
import { generateCopilotResponse as generateGroqResponse } from './groq'

export interface FinancialContext {
  month: string
  currency: string
  totalIncome: number
  totalFixed: number
  totalVariableBudget: number
  totalVariableSpent: number
  totalUnbudgeted: number
  availableReal: number
  daysInMonth: number
  daysPassed: number
  categoriesOverBudget: Array<{
    name: string
    budgeted: number
    spent: number
    percentage: number
  }>
  topMerchants: Array<{
    name: string
    amount: number
    count: number
  }>
  uncategorizedExpenses: Array<{
    description: string
    amount: number
    date: string
  }>
  recentExpenses: Array<{
    description: string
    amount: number
    category: string
    date: string
  }>
}

export interface CopilotMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

export interface CopilotResponse {
  message: string
  suggestions?: string[]
}

/**
 * Generar respuesta del copiloto usando API Route (key segura en servidor)
 */
export async function getCopilotResponse(
  userMessage: string,
  context: FinancialContext,
  conversationHistory: CopilotMessage[],
  _apiKey?: string // Ya no se usa, la key está en el servidor
): Promise<CopilotResponse> {
  // Build context summary
  const contextSummary = buildContextSummary(context)
  
  // Build conversation history string
  const historyStr = conversationHistory.slice(-6)
    .map(m => `${m.role === 'user' ? 'Usuario' : 'Copiloto'}: ${m.content}`)
    .join('\n')

  const startTime = Date.now()
  
  try {
    const response = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: userMessage,
        context: contextSummary,
        history: historyStr
      })
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    const data = await response.json()
    const content = data.message || 'No pude generar una respuesta.'

    // Extract any suggestions from the response
    const suggestions = extractSuggestions(content)

    // Log the interaction
    logAIInteraction({
      type: 'chat',
      input_text: userMessage,
      output_text: content,
      provider: 'grok',
      success: true,
      duration_ms: Date.now() - startTime
    })

    return {
      message: content,
      suggestions
    }
  } catch (error) {
    console.error('Copilot error:', error)
    
    // Log the error
    logAIInteraction({
      type: 'chat',
      input_text: userMessage,
      output_text: String(error),
      provider: 'grok',
      success: false,
      duration_ms: Date.now() - startTime
    })
    
    return {
      message: 'Lo siento, hubo un error al procesar tu consulta. Por favor intenta de nuevo.',
      suggestions: ['¿Cómo vamos este mes?', '¿Cuánto queda disponible?']
    }
  }
}

/**
 * Build context summary for Grok
 */
function buildContextSummary(ctx: FinancialContext): string {
  const lines: string[] = []
  
  lines.push(`📅 Mes: ${ctx.month} (día ${ctx.daysPassed} de ${ctx.daysInMonth})`)
  lines.push(`💰 Ingresos del mes: $${ctx.totalIncome.toLocaleString('es-CL')}`)
  lines.push(`🔒 Gastos fijos: $${ctx.totalFixed.toLocaleString('es-CL')}`)
  lines.push(`📊 Presupuesto variable: $${ctx.totalVariableBudget.toLocaleString('es-CL')}`)
  lines.push(`💸 Gasto variable real: $${ctx.totalVariableSpent.toLocaleString('es-CL')}`)
  
  if (ctx.totalUnbudgeted > 0) {
    lines.push(`⚠️ Gastos no presupuestados: $${ctx.totalUnbudgeted.toLocaleString('es-CL')}`)
  }
  
  lines.push(`✅ Balance disponible real: $${ctx.availableReal.toLocaleString('es-CL')}`)
  
  // Budget compliance
  const budgetPercent = ctx.totalVariableBudget > 0 
    ? Math.round((ctx.totalVariableSpent / ctx.totalVariableBudget) * 100) 
    : 0
  const expectedPercent = Math.round((ctx.daysPassed / ctx.daysInMonth) * 100)
  lines.push(`📈 Uso presupuesto variable: ${budgetPercent}% (esperado ~${expectedPercent}% del mes)`)
  
  // Over budget categories
  if (ctx.categoriesOverBudget.length > 0) {
    lines.push('\n🔴 Categorías sobre presupuesto:')
    ctx.categoriesOverBudget.slice(0, 5).forEach(cat => {
      lines.push(`  - ${cat.name}: $${cat.spent.toLocaleString('es-CL')} de $${cat.budgeted.toLocaleString('es-CL')} (+${Math.round(cat.percentage - 100)}%)`)
    })
  }
  
  // Top merchants
  if (ctx.topMerchants.length > 0) {
    lines.push('\n🏪 Principales comercios:')
    ctx.topMerchants.slice(0, 5).forEach(m => {
      lines.push(`  - ${m.name}: $${m.amount.toLocaleString('es-CL')} (${m.count} compras)`)
    })
  }
  
  // Uncategorized
  if (ctx.uncategorizedExpenses.length > 0) {
    lines.push(`\n❓ Gastos sin categoría: ${ctx.uncategorizedExpenses.length} gastos`)
    ctx.uncategorizedExpenses.slice(0, 3).forEach(e => {
      lines.push(`  - ${e.description || 'Sin descripción'}: $${e.amount.toLocaleString('es-CL')}`)
    })
  }
  
  // Recent expenses
  if (ctx.recentExpenses.length > 0) {
    lines.push('\n🧾 Últimos gastos:')
    ctx.recentExpenses.slice(0, 5).forEach(e => {
      lines.push(`  - ${e.date}: ${e.description} - $${e.amount.toLocaleString('es-CL')} (${e.category})`)
    })
  }
  
  return lines.join('\n')
}

/**
 * Extract action suggestions from response
 */
function extractSuggestions(content: string): string[] {
  // Default suggestions based on common follow-ups
  const suggestions: string[] = []
  
  if (content.toLowerCase().includes('presupuesto')) {
    suggestions.push('¿Cómo puedo ajustar el presupuesto?')
  }
  if (content.toLowerCase().includes('ahorro') || content.toLowerCase().includes('ahorrar')) {
    suggestions.push('Dame tips para ahorrar más')
  }
  if (content.toLowerCase().includes('categoría') || content.toLowerCase().includes('categorias')) {
    suggestions.push('¿Qué categorías debería revisar?')
  }
  
  // Add generic suggestions
  if (suggestions.length < 2) {
    suggestions.push('¿Alguna recomendación para el próximo mes?')
  }
  
  return suggestions.slice(0, 3)
}

/**
 * Quick questions for the copilot
 */
export const QUICK_QUESTIONS = [
  '¿Cómo vamos este mes?',
  '¿Cuánto queda disponible?',
  '¿Dónde me pasé del presupuesto?',
  '¿Qué gastos no están categorizados?',
  'Dame recomendaciones para mejorar',
]

/**
 * Mock response for demo/development
 */
export function getMockCopilotResponse(
  userMessage: string,
  context: FinancialContext
): CopilotResponse {
  const msg = userMessage.toLowerCase()
  
  if (msg.includes('cómo vamos') || msg.includes('como vamos') || msg.includes('estado')) {
    const budgetPercent = context.totalVariableBudget > 0 
      ? Math.round((context.totalVariableSpent / context.totalVariableBudget) * 100) 
      : 0
    const expectedPercent = Math.round((context.daysPassed / context.daysInMonth) * 100)
    
    let status = '¡Vas bien! '
    if (budgetPercent > expectedPercent + 20) {
      status = '⚠️ Vas un poco adelantado en gastos. '
    } else if (budgetPercent < expectedPercent - 10) {
      status = '🎉 ¡Excelente! Vas por debajo del ritmo esperado. '
    }
    
    return {
      message: `${status}Llevas gastado $${context.totalVariableSpent.toLocaleString('es-CL')} de tu presupuesto variable de $${context.totalVariableBudget.toLocaleString('es-CL')} (${budgetPercent}%). Van ${context.daysPassed} días del mes (${expectedPercent}%). Tu balance real es $${context.availableReal.toLocaleString('es-CL')}.`,
      suggestions: ['¿Dónde me pasé?', '¿Cómo puedo mejorar?']
    }
  }
  
  if (msg.includes('disponible') || msg.includes('queda')) {
    return {
      message: `Tu balance disponible real es $${context.availableReal.toLocaleString('es-CL')}. Esto considera tus ingresos ($${context.totalIncome.toLocaleString('es-CL')}) menos gastos fijos ($${context.totalFixed.toLocaleString('es-CL')}), gastos variables ($${context.totalVariableSpent.toLocaleString('es-CL')}) y no presupuestados ($${context.totalUnbudgeted.toLocaleString('es-CL')}).`,
      suggestions: ['¿Cómo vamos este mes?', '¿Qué categorías revisar?']
    }
  }
  
  if (msg.includes('pasé') || msg.includes('excedí') || msg.includes('sobre presupuesto')) {
    if (context.categoriesOverBudget.length === 0) {
      return {
        message: '¡Buenas noticias! No tienes ninguna categoría sobre presupuesto este mes. Sigue así 💪',
        suggestions: ['¿Cómo vamos en general?', 'Dame recomendaciones']
      }
    }
    const cats = context.categoriesOverBudget.map(c => 
      `${c.name}: $${c.spent.toLocaleString('es-CL')} de $${c.budgeted.toLocaleString('es-CL')} (+${Math.round(c.percentage - 100)}%)`
    ).join('\n• ')
    return {
      message: `Tienes ${context.categoriesOverBudget.length} categoría(s) sobre presupuesto:\n\n• ${cats}`,
      suggestions: ['¿Cómo puedo mejorar?', '¿Cuánto queda disponible?']
    }
  }
  
  if (msg.includes('recomendacion') || msg.includes('mejorar') || msg.includes('consejo')) {
    const tips: string[] = []
    
    if (context.totalUnbudgeted > 0) {
      tips.push(`Tienes $${context.totalUnbudgeted.toLocaleString('es-CL')} en gastos no presupuestados. Considera agregar estas categorías a tu presupuesto.`)
    }
    if (context.categoriesOverBudget.length > 0) {
      tips.push(`Revisa las categorías donde te excediste y considera aumentar el presupuesto o reducir gastos.`)
    }
    if (context.uncategorizedExpenses.length > 0) {
      tips.push(`Tienes ${context.uncategorizedExpenses.length} gastos sin categorizar. Clasificarlos te ayuda a entender mejor tus patrones.`)
    }
    
    if (tips.length === 0) {
      tips.push('¡Vas muy bien! Mantén el ritmo y sigue registrando tus gastos.')
    }
    
    return {
      message: tips.join('\n\n'),
      suggestions: ['¿Cómo vamos este mes?']
    }
  }
  
  return {
    message: `Entiendo tu pregunta. Actualmente tu balance disponible es $${context.availableReal.toLocaleString('es-CL')}. ¿Hay algo específico que quieras saber sobre tu presupuesto o gastos?`,
    suggestions: QUICK_QUESTIONS.slice(0, 3)
  }
}
