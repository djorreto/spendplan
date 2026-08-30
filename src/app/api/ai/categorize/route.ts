import { createOpenAI } from '@ai-sdk/openai'
import { generateText } from 'ai'
import { NextRequest, NextResponse } from 'next/server'
import { GROQ_MODEL } from '@/lib/ai/groq-model'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const merchant = String(body.merchant || '')
    const description = String(body.description || '')
    const amount = Number(body.amount)
    const categories = Array.isArray(body.categories) ? body.categories : []

    if (!categories.length) {
      return NextResponse.json({ error: 'missing_categories' }, { status: 400 })
    }

    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'missing_groq' }, { status: 503 })
    }

    const groq = createOpenAI({
      apiKey,
      baseURL: 'https://api.groq.com/openai/v1',
    })

    const prompt = `Clasifica este gasto de un hogar en Chile en UNA categoría. Responde SOLO JSON válido.

GASTO:
- comercio: ${merchant}
- descripción: ${description}
- monto: ${Number.isFinite(amount) ? amount : ''}

CATEGORÍAS (id, name):
${categories.map((item: { id?: string; name?: string }) => `- ${item.id}: ${item.name}`).join('\n')}

Formato:
{"category_id":"<id>","confidence":0.0,"reason":"frase corta"}
`

    const { text } = await generateText({
      model: groq(GROQ_MODEL),
      system: 'Responde únicamente en JSON válido, sin markdown.',
      prompt,
      temperature: 0.1,
      maxTokens: 180,
    })

    const trimmed = String(text || '').trim()
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    const parsed = JSON.parse(trimmed.slice(start, end + 1)) as {
      category_id?: string
      confidence?: number
      reason?: string
    }
    const found = categories.find((item: { id?: string }) => item.id === parsed.category_id)
    if (!found?.id) {
      return NextResponse.json({ category_id: null, confidence: 0, reason: 'Sin coincidencia' })
    }

    return NextResponse.json({
      category_id: found.id,
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence ?? 0.6))),
      reason: String(parsed.reason || 'Sugerencia Groq'),
    })
  } catch (error) {
    console.error('categorize API error', error)
    return NextResponse.json({ category_id: null, confidence: 0, reason: 'Error de IA' }, { status: 200 })
  }
}
