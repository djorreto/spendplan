/**
 * API Route para Análisis de OCR
 * Groq analiza directamente el texto OCR sin reglas intermedias
 */

import { createOpenAI } from '@ai-sdk/openai'
import { generateText } from 'ai'
import { NextRequest, NextResponse } from 'next/server'
import { GROQ_MODEL } from '@/lib/ai/groq-model'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const { rawText } = await req.json()

    if (!rawText || rawText.trim().length < 5) {
      return NextResponse.json({ 
        error: 'No se pudo leer texto de la imagen',
        merchant_name: null,
        purchase_date: null,
        total_amount_clp: null,
        suggested_category: null,
        confidence: 0,
        notes: 'El OCR no detectó texto legible'
      })
    }

    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
    }

    const groq = createOpenAI({
      apiKey,
      baseURL: 'https://api.groq.com/openai/v1',
    })

    const prompt = `Eres un experto en leer boletas y tickets de compra chilenos. 

Analiza el siguiente texto extraído por OCR de una boleta/ticket y extrae la información de compra.

TEXTO DE LA BOLETA:
---
${rawText}
---

INSTRUCCIONES:
1. Busca el NOMBRE DEL COMERCIO (restaurant, tienda, supermercado, etc.) - suele estar al inicio o en mayúsculas
2. Busca el MONTO TOTAL - busca "TOTAL", "TOTAL A PAGAR", "MONTO", o el número más grande con formato de precio chileno ($XX.XXX o XX.XXX)
3. Busca la FECHA - formato dd/mm/yyyy, dd-mm-yyyy o similar
4. Sugiere una CATEGORÍA apropiada
5. Detecta el MÉTODO DE PAGO - busca palabras como "CREDITO", "DEBITO", "EFECTIVO", "TRANSBANK", "TARJETA", "REDCOMPRA", "VISA", "MASTERCARD"

IMPORTANTE:
- Los montos en Chile usan punto como separador de miles (ej: $12.990 = doce mil novecientos noventa pesos)
- Si ves "TOTAL" seguido de un número, ese es probablemente el monto
- El nombre del comercio suele estar en las primeras líneas
- CREDITO/VISA/MASTERCARD = credit, DEBITO/REDCOMPRA = debit, EFECTIVO = cash, TRANSFERENCIA = transfer
- Si no encuentras algo con certeza, pon null

Responde SOLO en JSON válido:
{
  "merchant_name": "nombre exacto del comercio",
  "purchase_date": "YYYY-MM-DD",
  "total_amount_clp": número entero sin puntos ni comas,
  "suggested_category": "Restaurantes|Supermercado|Transporte|Salud|Hogar|Entretenimiento|Servicios|Café|Farmacia|Otros",
  "payment_method": "cash|debit|credit|transfer" o null si no se detecta,
  "confidence": número entre 0 y 1,
  "notes": "qué encontraste en la boleta"
}`

    const { text } = await generateText({
      model: groq(GROQ_MODEL),
      system: 'Eres un experto en leer boletas chilenas. Responde únicamente en JSON válido, sin markdown ni explicaciones adicionales.',
      prompt,
      temperature: 0.1, // Muy bajo para respuestas consistentes
      maxTokens: 400,
    })

    // Limpiar respuesta (a veces viene con ```json)
    let cleanText = text.trim()
    if (cleanText.startsWith('```')) {
      cleanText = cleanText.replace(/```json?\n?/g, '').replace(/```$/g, '').trim()
    }

    const parsed = JSON.parse(cleanText)
    
    // Asegurar que el monto sea número
    if (parsed.total_amount_clp && typeof parsed.total_amount_clp === 'string') {
      parsed.total_amount_clp = parseInt(parsed.total_amount_clp.replace(/\D/g, ''), 10) || null
    }

    return NextResponse.json(parsed)
  } catch (error) {
    console.error('OCR API error:', error)
    return NextResponse.json(
      { 
        merchant_name: null,
        purchase_date: null,
        total_amount_clp: null,
        suggested_category: null,
        confidence: 0.1,
        notes: 'Error al analizar el texto'
      },
      { status: 200 }
    )
  }
}
