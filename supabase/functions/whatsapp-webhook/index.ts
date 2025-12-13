/**
 * ========================================
 * 🔗 SPENDPLAN - WHATSAPP WEBHOOK
 * ========================================
 * Edge Function para recibir mensajes de WhatsApp
 * 
 * Deploy: supabase functions deploy whatsapp-webhook
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Tipos
interface WhatsAppMessage {
  from: string
  id: string
  timestamp: string
  type: 'text' | 'image' | 'document'
  text?: { body: string }
  image?: { id: string; mime_type: string }
}

interface WebhookPayload {
  object: string
  entry: Array<{
    id: string
    changes: Array<{
      value: {
        messaging_product: string
        metadata: { phone_number_id: string }
        messages?: WhatsAppMessage[]
      }
    }>
  }>
}

interface ParsedExpense {
  amount: number | null
  merchant: string | null
  description: string | null
  payment_method: string | null
  confidence: number
}

// Parsear mensaje de texto para extraer gasto
function parseExpenseMessage(message: string): ParsedExpense {
  const text = message.toLowerCase()
  
  // Extraer monto con regex
  const amountMatch = text.match(/\$?\s*([\d.,]+)/i)
  let amount: number | null = null
  if (amountMatch) {
    let amountStr = amountMatch[1].replace(/\./g, '').replace(',', '.')
    amount = parseFloat(amountStr)
  }

  // Detectar método de pago
  let payment_method: string | null = null
  if (text.includes('efectivo') || text.includes('cash')) payment_method = 'cash'
  else if (text.includes('débito') || text.includes('debito')) payment_method = 'debit'
  else if (text.includes('crédito') || text.includes('credito') || text.includes('tarjeta')) payment_method = 'credit'
  else if (text.includes('transfer')) payment_method = 'transfer'

  // Extraer comercio
  let merchant: string | null = null
  const enMatch = text.match(/en\s+([a-záéíóúñ\s]+)/i)
  if (enMatch) {
    merchant = enMatch[1].trim()
  } else {
    // Buscar palabras que podrían ser comercios
    const words = message.split(/\s+/)
    for (const word of words) {
      if (word.length > 3 && !/^\d/.test(word) && !['gasto', 'compra', 'pago', 'débito', 'crédito'].includes(word.toLowerCase())) {
        merchant = word
        break
      }
    }
  }

  return {
    amount,
    merchant: merchant ? merchant.charAt(0).toUpperCase() + merchant.slice(1) : null,
    description: message,
    payment_method,
    confidence: amount ? 0.7 : 0.3
  }
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    
    // WhatsApp verification challenge (GET request)
    if (req.method === 'GET') {
      const mode = url.searchParams.get('hub.mode')
      const token = url.searchParams.get('hub.verify_token')
      const challenge = url.searchParams.get('hub.challenge')
      
      const verifyToken = Deno.env.get('WHATSAPP_VERIFY_TOKEN')
      
      if (mode === 'subscribe' && token === verifyToken) {
        console.log('WhatsApp webhook verified')
        return new Response(challenge, { status: 200 })
      }
      
      return new Response('Verification failed', { status: 403 })
    }

    // Process webhook (POST request)
    if (req.method === 'POST') {
      const body: WebhookPayload = await req.json()
      
      // Initialize Supabase client
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const supabase = createClient(supabaseUrl, supabaseKey)

      // Process each message
      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          const messages = change.value.messages || []
          
          for (const message of messages) {
            console.log('Processing message from:', message.from)

            // Find household by phone number
            const { data: household } = await supabase
              .from('households')
              .select('id, currency')
              .eq('whatsapp_phone_number', message.from)
              .single()

            // Log inbound message
            await supabase
              .from('whatsapp_messages_in')
              .insert({
                household_id: household?.id || null,
                from_number: message.from,
                message_id: message.id,
                message_type: message.type,
                content: message.text?.body || null,
                media_id: message.image?.id || null,
                processed: false
              })

            if (!household) {
              console.log('No household found for phone:', message.from)
              continue
            }

            // Process text message
            if (message.type === 'text' && message.text?.body) {
              const parsed = parseExpenseMessage(message.text.body)
              
              if (parsed.amount && parsed.amount > 0) {
                // Create expense
                const { data: expense, error } = await supabase
                  .from('expenses')
                  .insert({
                    household_id: household.id,
                    amount: parsed.amount,
                    description: parsed.description,
                    merchant: parsed.merchant,
                    expense_date: new Date().toISOString().split('T')[0],
                    payment_method: parsed.payment_method || 'unknown',
                    source: 'whatsapp',
                    status: parsed.confidence >= 0.7 ? 'confirmed' : 'pending',
                    ai_confidence: parsed.confidence
                  })
                  .select()
                  .single()

                if (!error && expense) {
                  // Update inbound message with expense reference
                  await supabase
                    .from('whatsapp_messages_in')
                    .update({ 
                      expense_id: expense.id,
                      processed: true,
                      parsed_data: parsed
                    })
                    .eq('message_id', message.id)

                  // Format confirmation message
                  const formattedAmount = new Intl.NumberFormat('es-CL', {
                    style: 'currency',
                    currency: household.currency || 'CLP',
                    minimumFractionDigits: 0
                  }).format(parsed.amount)

                  const confirmationMsg = parsed.confidence >= 0.7
                    ? `✅ Listo: ${formattedAmount} ${parsed.merchant ? `en ${parsed.merchant}` : ''} registrado.`
                    : `📝 Gasto pendiente: ${formattedAmount}. Por favor confirma en la app.`

                  // Log outbound message (actual sending would require WhatsApp API)
                  await supabase
                    .from('whatsapp_messages_out')
                    .insert({
                      household_id: household.id,
                      to_number: message.from,
                      content: confirmationMsg,
                      related_expense_id: expense.id
                    })

                  console.log('Expense created:', expense.id)
                }
              } else {
                console.log('Could not parse expense from message:', message.text.body)
              }
            }

            // Process image message (OCR would go here)
            if (message.type === 'image' && message.image?.id) {
              // TODO: Download image from WhatsApp API
              // TODO: Upload to Supabase Storage
              // TODO: Process with AI OCR
              
              // For now, create a pending expense
              const { data: expense } = await supabase
                .from('expenses')
                .insert({
                  household_id: household.id,
                  amount: 0, // To be filled after OCR
                  description: 'Boleta recibida por WhatsApp',
                  expense_date: new Date().toISOString().split('T')[0],
                  source: 'whatsapp',
                  status: 'pending'
                })
                .select()
                .single()

              console.log('Image expense placeholder created:', expense?.id)
            }
          }
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      })
    }

    return new Response('Method not allowed', { status: 405 })
    
  } catch (error) {
    console.error('Webhook error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    })
  }
})

