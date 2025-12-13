/**
 * ========================================
 * 🤖 GROK AI PROVIDER
 * ========================================
 * Implementación del provider para Grok (xAI)
 * 
 * Para usar:
 * 1. Obtén tu API key de https://console.x.ai/
 * 2. Configura en la tabla ai_config del hogar
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

const GROK_API_URL = 'https://api.x.ai/v1/chat/completions'

export class GrokAIProvider implements AIProvider {
  name = 'grok'
  private apiKey: string
  private model: string

  constructor(apiKey: string, model: string = 'grok-beta') {
    this.apiKey = apiKey
    this.model = model
  }

  private async callGrok(messages: Array<{ role: string; content: string }>): Promise<string> {
    const response = await fetch(GROK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: 0.3,
        max_tokens: 1000,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Grok API error: ${response.status} - ${error}`)
    }

    const data = await response.json()
    return data.choices[0]?.message?.content || ''
  }

  async categorize(input: CategorizeInput): Promise<CategorizeOutput> {
    const categoriesList = input.categories
      .map(c => `- ${c.id}: ${c.name}`)
      .join('\n')

    const rulesContext = input.rules.length > 0
      ? `\nReglas existentes:\n${input.rules.map(r => `- Si contiene "${r.pattern}" → categoría ${r.category_id}`).join('\n')}`
      : ''

    const prompt = `Eres un asistente de categorización de gastos para un hogar chileno.

Dado el siguiente gasto:
- Descripción: ${input.description || 'N/A'}
- Comercio: ${input.merchant || 'N/A'}
- Monto: $${input.amount}

Categorías disponibles:
${categoriesList}
${rulesContext}

Responde SOLO en JSON con este formato exacto:
{
  "category_id": "uuid de la categoría más apropiada o null si no estás seguro",
  "confidence": número entre 0 y 1,
  "reason": "explicación breve en español"
}`

    try {
      const response = await this.callGrok([
        { role: 'system', content: 'Responde únicamente en JSON válido, sin markdown.' },
        { role: 'user', content: prompt },
      ])

      const parsed = JSON.parse(response)
      return {
        category_id: parsed.category_id || null,
        confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
        reason: parsed.reason || 'Sin explicación',
      }
    } catch (error) {
      console.error('Grok categorize error:', error)
      return {
        category_id: null,
        confidence: 0.3,
        reason: 'Error al procesar con IA',
      }
    }
  }

  async generateInsights(input: InsightsInput): Promise<InsightsOutput> {
    const expensesSummary = input.expenses.slice(0, 50).map(e => 
      `${e.expense_date}: $${e.amount} - ${e.merchant || e.category_name || 'Sin categoría'}`
    ).join('\n')

    const budgetInfo = input.budget
      ? `Presupuesto: $${input.budget.total_budgeted} | Ingresos: $${input.budget.total_income}`
      : 'Sin presupuesto definido'

    const prompt = `Eres un asesor financiero para hogares chilenos. Analiza los gastos del mes ${input.month}.

${budgetInfo}

Gastos del mes:
${expensesSummary}

Genera un análisis en JSON con este formato:
{
  "bullets": ["insight 1", "insight 2", "insight 3"],
  "flags": [
    {
      "category_id": "uuid",
      "category_name": "nombre",
      "type": "over_budget|trending_up|unusual",
      "message": "descripción del problema",
      "percentage": número opcional
    }
  ],
  "recommendations": ["recomendación 1", "recomendación 2"]
}

Sé específico, usa números, y da consejos prácticos para Chile.`

    try {
      const response = await this.callGrok([
        { role: 'system', content: 'Responde únicamente en JSON válido, sin markdown.' },
        { role: 'user', content: prompt },
      ])

      const parsed = JSON.parse(response)
      return {
        bullets: parsed.bullets || [],
        flags: parsed.flags || [],
        recommendations: parsed.recommendations || [],
      }
    } catch (error) {
      console.error('Grok insights error:', error)
      return {
        bullets: ['Error al generar insights'],
        flags: [],
        recommendations: ['Intenta nuevamente más tarde'],
      }
    }
  }

  async extractFromImage(input: OCRInput): Promise<OCROutput> {
    // Grok con visión (si está disponible)
    const prompt = `Analiza esta imagen de un recibo/boleta y extrae la información.

Responde en JSON:
{
  "amount": número o null,
  "date": "YYYY-MM-DD" o null,
  "merchant": "nombre del comercio" o null,
  "description": "descripción breve",
  "raw_text": "texto visible en la imagen",
  "confidence": número entre 0 y 1
}`

    try {
      const response = await this.callGrok([
        { 
          role: 'user', 
          content: [
            { type: 'text', text: prompt },
            { 
              type: 'image_url', 
              image_url: { url: `data:${input.mimeType};base64,${input.imageBase64}` }
            }
          ] as unknown as string
        },
      ])

      const parsed = JSON.parse(response)
      return {
        amount: parsed.amount,
        date: parsed.date,
        merchant: parsed.merchant,
        description: parsed.description,
        raw_text: parsed.raw_text || '',
        confidence: parsed.confidence || 0.5,
      }
    } catch (error) {
      console.error('Grok OCR error:', error)
      return {
        amount: null,
        date: null,
        merchant: null,
        description: null,
        raw_text: '',
        confidence: 0,
      }
    }
  }

  async parseMessage(input: ParseMessageInput): Promise<ParseMessageOutput> {
    const categoriesList = input.categories.map(c => `${c.id}: ${c.name}`).join(', ')

    const prompt = `Extrae información de este mensaje de WhatsApp sobre un gasto:

"${input.message}"

Categorías disponibles: ${categoriesList}

Responde en JSON:
{
  "amount": número o null,
  "merchant": "nombre" o null,
  "description": "descripción" o null,
  "category_id": "uuid de categoría" o null,
  "payment_method": "cash|debit|credit|transfer" o null,
  "confidence": número entre 0 y 1
}`

    try {
      const response = await this.callGrok([
        { role: 'system', content: 'Responde únicamente en JSON válido.' },
        { role: 'user', content: prompt },
      ])

      const parsed = JSON.parse(response)
      return {
        amount: parsed.amount,
        merchant: parsed.merchant,
        description: parsed.description,
        category_id: parsed.category_id,
        payment_method: parsed.payment_method,
        confidence: parsed.confidence || 0.5,
      }
    } catch (error) {
      console.error('Grok parse error:', error)
      return {
        amount: null,
        merchant: null,
        description: input.message,
        category_id: null,
        payment_method: null,
        confidence: 0.3,
      }
    }
  }
}

