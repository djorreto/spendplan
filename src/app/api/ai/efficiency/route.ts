import { createOpenAI } from '@ai-sdk/openai'
import { generateText } from 'ai'
import { NextRequest, NextResponse } from 'next/server'
import { GROQ_MODEL } from '@/lib/ai/groq-model'
import { formatEfficiencyContext, playbookToPrompt, type EfficiencyHouseholdContext } from '@/lib/efficiency-context'
import { getEfficiencyPlaybook, isEfficiencyTopic } from '@/lib/efficiency-playbooks'

export const runtime = 'nodejs'

type ChatTurn = { role: 'user' | 'assistant'; content: string }

const SYSTEM_PROMPT = `Eres el cazador de eficiencias de SpendPlan para un hogar en Chile.

MISIÓN:
Ayudar a bajar un gasto concreto. No eres un copiloto genérico: eres un analista serio de ese tema (internet, agua, gas, luz, súper, restorán, delivery, streaming o Uber).

REGLAS:
- Habla en español de Chile, claro, sin marketing.
- USA los números del hogar (boletas/gastos de SpendPlan) y el snapshot de mercado que te pasan. No inventes planes más baratos ni teléfonos que no estén en el snapshot.
- Si el snapshot no cubre un dato, dilo: “esto hay que chequear en la web/boleta”.
- Pregunta UNA cosa a la vez si te falta para recomendar (personas, si usan la TV, comuna/fibra, permanencia, cuántas veces van al súper).
- Cuando ya puedas recomendar, cierra con este orden:
  1) Qué plan/hábito tienen hoy (según sus cargos)
  2) Qué DEBERÍAN tener (dimensionado a las personas y uso)
  3) Alternativas reales de mercado o de hábito, con plata
  4) A quién / cómo llamar o contratar, y cómo cortar el actual
  5) Ahorro mensual estimado contra SU boleta, no contra un promedio inventado
- Distingue precio (mismo servicio más barato) de demanda (pedir menos / otra rutina).
- Los precios promo duran 6–12 meses: siempre menciona el precio del mes 13.
- No pidas claves bancarias ni que reenvíen boletas con RUT a un tercero.

ESTILO:
- Directo, útil, 1–3 párrafos + bullets. Puedes extendirte cuando armás el plan de llamada.
- Cero relleno (“¡genial pregunta!”).`

function asContext(value: unknown): EfficiencyHouseholdContext | null {
  if (!value || typeof value !== 'object') return null
  const row = value as EfficiencyHouseholdContext
  if (!row.topic || !isEfficiencyTopic(String(row.topic))) return null
  return row
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const message = typeof body.message === 'string' ? body.message.trim() : ''
    const history = Array.isArray(body.history) ? (body.history as ChatTurn[]) : []
    const household = asContext(body.context)
    const topicRaw = household?.topic || (typeof body.topic === 'string' ? body.topic : 'other')
    const topic = isEfficiencyTopic(topicRaw) ? topicRaw : 'other'

    if (!household && !message && history.length === 0) {
      return NextResponse.json({ error: 'Falta el contexto del hogar' }, { status: 400 })
    }

    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
    }

    const playbook = getEfficiencyPlaybook(topic)
    const start = !message || message === '__start__'
    const historyText = history
      .slice(-12)
      .map((turn) => `${turn.role === 'user' ? 'Usuario' : 'Asistente'}: ${turn.content}`)
      .join('\n')

    const groq = createOpenAI({
      apiKey,
      baseURL: 'https://api.groq.com/openai/v1',
    })

    const { text } = await generateText({
      model: groq(GROQ_MODEL),
      system: SYSTEM_PROMPT,
      prompt: `TEMA: ${topic}

DATOS DEL HOGAR:
${household ? formatEfficiencyContext(household) : 'Sin contexto de gastos'}

PLAYBOOK Y MERCADO:
${playbookToPrompt(playbook)}

${historyText ? `CONVERSACIÓN:\n${historyText}\n` : ''}
${start ? 'El usuario acaba de abrir el asistente. Empieza tú: diagnostica con SUS números y haz UNA pregunta concreta para afinar.' : `Usuario: ${message}`}

Asistente:`,
      temperature: 0.3,
      maxTokens: 1200,
    })

    const suggestions = start
      ? playbook.questions.slice(0, 3).map((item) =>
          item.length > 72 ? `${item.slice(0, 70)}…` : item
        )
      : defaultSuggestions(topic)

    return NextResponse.json({
      message: String(text || '').trim(),
      suggestions,
      topic,
    })
  } catch (error) {
    console.error('Efficiency assistant error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error processing request' },
      { status: 500 }
    )
  }
}

function defaultSuggestions(topic: string): string[] {
  if (topic === 'internet') {
    return [
      'Somos 4, teletrabajo y streaming. No usamos el cable',
      'Sí hay fibra en el edificio (Mundo o GTD)',
      'Arma el guion para llamar a VTR y a WOM',
    ]
  }
  if (topic === 'supermarket') {
    return ['Somos 3 (2 adultos y 1 niño)', 'Vamos 4 veces por semana sin lista', 'Arma la lista tipo de la semana']
  }
  if (topic === 'delivery') {
    return ['Pedimos 8–10 veces al mes', 'Es por cansancio entre semana', 'Quiero un tope de 4 al mes']
  }
  if (topic === 'electricity' || topic === 'water' || topic === 'gas') {
    return ['Hay jardín / aire / calefacción', 'La boleta subió de golpe', 'Dame el plan de hábitos de esta semana']
  }
  return ['Sigue con la recomendación', 'Dame el paso a paso para esta semana']
}
