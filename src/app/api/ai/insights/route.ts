/**
 * API Route para Generación de Insights
 * La API key está segura en el servidor
 */

import { createOpenAI } from '@ai-sdk/openai'
import { generateText } from 'ai'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const { month, totalIncome, totalBudgeted, totalSpent, expensesSummary } = await req.json()

    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
    }

    const groq = createOpenAI({
      apiKey,
      baseURL: 'https://api.groq.com/openai/v1',
    })

    const prompt = `Eres un asesor financiero para hogares chilenos. Analiza los gastos del mes ${month}.

RESUMEN FINANCIERO:
- Ingresos del mes: $${totalIncome?.toLocaleString('es-CL') || 0}
- Presupuesto variable: $${totalBudgeted?.toLocaleString('es-CL') || 0}
- Total gastado: $${totalSpent?.toLocaleString('es-CL') || 0}
- Balance: $${((totalIncome || 0) - (totalSpent || 0)).toLocaleString('es-CL')}

GASTOS DEL MES:
${expensesSummary || 'Sin gastos registrados'}

Genera un análisis en JSON con este formato exacto:
{
  "bullets": ["insight 1 específico con números", "insight 2", "insight 3"],
  "flags": [
    {
      "category_name": "nombre categoría",
      "type": "over_budget|trending_up|unusual",
      "message": "descripción del problema",
      "percentage": número
    }
  ],
  "recommendations": ["recomendación práctica 1", "recomendación 2", "recomendación 3"]
}

Sé específico, usa números reales del contexto, y da consejos prácticos para Chile.`

    const { text } = await generateText({
      model: groq('llama-3.3-70b-versatile'),
      system: 'Responde únicamente en JSON válido, sin markdown ni explicaciones.',
      prompt,
      temperature: 0.3,
      maxTokens: 1000,
    })

    const parsed = JSON.parse(text)
    return NextResponse.json(parsed)
  } catch (error) {
    console.error('Insights API error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error processing request' },
      { status: 500 }
    )
  }
}
