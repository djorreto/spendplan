/**
 * ========================================
 * 🤖 MOCK AI PROVIDER
 * ========================================
 * Provider de prueba que simula respuestas de IA
 */

import type {
  AIProvider,
  CategorizeInput,
  CategorizeOutput,
  InsightsInput,
  InsightsOutput,
  OCRInput,
  OCROutput,
  ParseMessageInput,
  ParseMessageOutput,
} from './types'

export class MockAIProvider implements AIProvider {
  name = 'mock'

  async categorize(input: CategorizeInput): Promise<CategorizeOutput> {
    // Simular delay de API
    await this.delay(300)

    const description = (input.description || '').toLowerCase()
    const merchant = (input.merchant || '').toLowerCase()
    const searchText = `${description} ${merchant}`

    // Primero intentar con reglas
    for (const rule of input.rules) {
      const pattern = rule.pattern.toLowerCase()
      if (rule.rule_type === 'contains' && searchText.includes(pattern)) {
        return {
          category_id: rule.category_id,
          confidence: 0.95,
          reason: `Coincide con regla: contiene "${rule.pattern}"`,
        }
      }
      if (rule.rule_type === 'exact' && (description === pattern || merchant === pattern)) {
        return {
          category_id: rule.category_id,
          confidence: 0.99,
          reason: `Coincide exactamente con regla: "${rule.pattern}"`,
        }
      }
    }

    // Categorización por keywords comunes
    const keywordMap: Record<string, string[]> = {
      'supermercado': ['jumbo', 'lider', 'unimarc', 'tottus', 'santa isabel', 'supermercado'],
      'restaurantes': ['restaurant', 'rappi', 'uber eats', 'pedidos ya', 'mcdonald', 'burger', 'pizza', 'sushi'],
      'transporte': ['uber', 'cabify', 'didi', 'copec', 'shell', 'petrobras', 'bencina', 'estacionamiento'],
      'servicios': ['enel', 'aguas', 'metrogas', 'vtr', 'movistar', 'entel', 'claro', 'wom'],
      'suscripciones': ['netflix', 'spotify', 'disney', 'hbo', 'amazon prime', 'youtube', 'apple'],
      'salud': ['farmacia', 'ahumada', 'cruz verde', 'salcobrand', 'doctor', 'clinica', 'hospital'],
      'hogar': ['sodimac', 'easy', 'homecenter', 'ferreteria', 'mueble'],
    }

    for (const [categoryName, keywords] of Object.entries(keywordMap)) {
      if (keywords.some(kw => searchText.includes(kw))) {
        const category = input.categories.find(
          c => c.name.toLowerCase() === categoryName || 
               c.name.toLowerCase().includes(categoryName)
        )
        if (category) {
          return {
            category_id: category.id,
            confidence: 0.75,
            reason: `Detectado como ${categoryName} por palabras clave`,
          }
        }
      }
    }

    // Si no hay match, retornar sin categoría
    return {
      category_id: null,
      confidence: 0.3,
      reason: 'No se encontró una categoría con suficiente confianza',
    }
  }

  async generateInsights(input: InsightsInput): Promise<InsightsOutput> {
    await this.delay(500)

    const bullets: string[] = []
    const flags: InsightsOutput['flags'] = []
    const recommendations: string[] = []

    const totalSpent = input.expenses.reduce((sum, e) => sum + e.amount, 0)
    const expenseCount = input.expenses.length

    // Bullet básico
    bullets.push(
      `Este mes registraste ${expenseCount} gastos por un total de ${this.formatCurrency(totalSpent, input.currency)}.`
    )

    if (input.budget) {
      const percentUsed = (totalSpent / input.budget.total_budgeted) * 100

      if (percentUsed > 100) {
        bullets.push(
          `⚠️ Superaste tu presupuesto en ${this.formatCurrency(totalSpent - input.budget.total_budgeted, input.currency)} (${percentUsed.toFixed(0)}% del presupuesto).`
        )
      } else if (percentUsed > 80) {
        bullets.push(
          `Vas en ${percentUsed.toFixed(0)}% de tu presupuesto. Quedan ${this.formatCurrency(input.budget.total_budgeted - totalSpent, input.currency)} disponibles.`
        )
      } else {
        bullets.push(
          `Buen control: solo has usado ${percentUsed.toFixed(0)}% de tu presupuesto mensual.`
        )
      }

      // Analizar categorías sobre presupuesto
      const spentByCategory: Record<string, number> = {}
      input.expenses.forEach(e => {
        if (e.category_id) {
          spentByCategory[e.category_id] = (spentByCategory[e.category_id] || 0) + e.amount
        }
      })

      input.budget.lines.forEach(line => {
        const spent = spentByCategory[line.category_id] || 0
        if (spent > line.amount && line.amount > 0) {
          flags.push({
            category_id: line.category_id,
            category_name: line.category_name,
            type: 'over_budget',
            message: `${line.category_name} superó el presupuesto por ${this.formatCurrency(spent - line.amount, input.currency)}`,
            percentage: ((spent / line.amount) * 100) - 100,
          })
        }
      })
    }

    // Analizar comercios frecuentes
    const merchantCount: Record<string, { count: number; total: number }> = {}
    input.expenses.forEach(e => {
      const key = e.merchant || 'Otros'
      if (!merchantCount[key]) merchantCount[key] = { count: 0, total: 0 }
      merchantCount[key].count++
      merchantCount[key].total += e.amount
    })

    const topMerchants = Object.entries(merchantCount)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 3)

    if (topMerchants.length > 0) {
      const [topMerchant, data] = topMerchants[0]
      bullets.push(
        `Tu mayor gasto fue en ${topMerchant}: ${this.formatCurrency(data.total, input.currency)} en ${data.count} transacciones.`
      )
    }

    // Recomendaciones genéricas
    recommendations.push(
      'Revisa tus suscripciones mensuales y cancela las que no uses.',
      'Considera establecer un presupuesto para gastos discrecionales.',
      'Registra los gastos pequeños, ¡se acumulan rápido!'
    )

    if (flags.length > 0) {
      recommendations.unshift(
        `Tienes ${flags.length} categoría(s) sobre presupuesto. Revisa esos gastos primero.`
      )
    }

    return {
      bullets,
      flags,
      recommendations,
    }
  }

  async extractFromImage(input: OCRInput): Promise<OCROutput> {
    await this.delay(800)

    // Mock: simular extracción básica
    return {
      amount: null,
      date: null,
      merchant: null,
      description: 'Documento escaneado',
      raw_text: '[Mock OCR - Sin texto extraído]',
      confidence: 0.3,
    }
  }

  async parseMessage(input: ParseMessageInput): Promise<ParseMessageOutput> {
    await this.delay(200)

    const message = input.message.toLowerCase()
    
    // Extraer monto con regex
    const amountMatch = message.match(/\$?\s*([\d.,]+)/i)
    const amount = amountMatch ? parseFloat(amountMatch[1].replace(/\./g, '').replace(',', '.')) : null

    // Detectar método de pago
    let payment_method: string | null = null
    if (message.includes('efectivo') || message.includes('cash')) payment_method = 'cash'
    else if (message.includes('débito') || message.includes('debito')) payment_method = 'debit'
    else if (message.includes('crédito') || message.includes('credito') || message.includes('tarjeta')) payment_method = 'credit'
    else if (message.includes('transfer')) payment_method = 'transfer'

    // Intentar detectar comercio (palabra después del monto o antes de "en")
    let merchant: string | null = null
    const enMatch = message.match(/en\s+([a-záéíóúñ\s]+)/i)
    if (enMatch) {
      merchant = enMatch[1].trim()
    } else {
      // Buscar palabras capitalizadas o conocidas
      const words = message.split(/\s+/)
      for (const word of words) {
        if (word.length > 3 && !['gasto', 'compra', 'pago'].includes(word)) {
          merchant = word
          break
        }
      }
    }

    // Buscar categoría por keywords en mensaje
    let category_id: string | null = null
    for (const cat of input.categories) {
      if (message.includes(cat.name.toLowerCase())) {
        category_id = cat.id
        break
      }
    }

    return {
      amount,
      merchant: merchant ? merchant.charAt(0).toUpperCase() + merchant.slice(1) : null,
      description: input.message,
      category_id,
      payment_method,
      confidence: amount ? 0.7 : 0.3,
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  private formatCurrency(amount: number, currency: string): string {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
    }).format(amount)
  }
}

