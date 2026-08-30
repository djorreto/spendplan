/**
 * API Route para Generación de Insights
 * La API key está segura en el servidor
 */

import { createOpenAI } from '@ai-sdk/openai'
import { generateText } from 'ai'
import { NextRequest, NextResponse } from 'next/server'
import { GROQ_MODEL } from '@/lib/ai/groq-model'

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

    const hasIncome = Number(totalIncome || 0) > 0
    const prompt = `Eres un asesor financiero para hogares chilenos. Sé breve y concreto (respuestas cortas).
Analiza los gastos del mes ${month}.

RESUMEN FINANCIERO:
- Ingresos del mes: $${totalIncome?.toLocaleString('es-CL') || 0} ${hasIncome ? '' : '(no configurados)'}
- Presupuesto variable: $${totalBudgeted?.toLocaleString('es-CL') || 0}
- Total gastado: $${totalSpent?.toLocaleString('es-CL') || 0}
${hasIncome ? `- Balance: $${((totalIncome || 0) - (totalSpent || 0)).toLocaleString('es-CL')}` : `- Balance: N/A (no hay ingresos configurados)`}

GASTOS DEL MES:
${expensesSummary || 'Sin gastos registrados'}

Genera un análisis en JSON conciso con este formato exacto:
{
  "bullets": ["insight 1 específico con números", "insight 2 (máx 4 bullets)"],
  "flags": [
    {
      "category_name": "nombre categoría",
      "type": "over_budget|trending_up|unusual",
      "message": "descripción del problema",
      "percentage": número
    }
  ],
  "recommendations": ["recomendación práctica 1", "recomendación 2 (máx 3)"]
}

REGLA IMPORTANTE:
- Si no hay ingresos (ingresos=0), NO hables de "balance disponible" ni de déficit vs ingresos.
- En ese caso, enfócate en cumplimiento del presupuesto (gastado vs presupuestado), ritmo del mes y gastos no presupuestados.

Sé específico, usa números reales del contexto, y da consejos prácticos para Chile.`

    const { text } = await generateText({
      model: groq(GROQ_MODEL),
      system: 'Responde únicamente en JSON válido, sin markdown ni explicaciones.',
      prompt,
      temperature: 0.3,
      maxTokens: 1000,
    })

    // LLMs can occasionally include leading/trailing text. Be defensive.
    const trimmed = String(text || '').trim()
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    const jsonCandidate = start >= 0 && end >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed

    try {
      const parsed = JSON.parse(jsonCandidate)
      return NextResponse.json(parsed)
    } catch (e) {
      console.error('Insights JSON parse error:', e)
      return NextResponse.json(
        {
          error: 'AI returned invalid JSON',
          // Include a short snippet to debug in logs (not full payload)
          snippet: jsonCandidate.slice(0, 500),
        },
        { status: 502 }
      )
    }
  } catch (error) {
    console.error('Insights API error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error processing request' },
      { status: 500 }
    )
  }
}
