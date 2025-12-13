#!/usr/bin/env node
/**
 * ========================================
 * 📱 TELEGRAM POLLING (Desarrollo Local)
 * ========================================
 * Ejecutar con: node scripts/telegram-polling.mjs
 * 
 * Este script escucha mensajes de Telegram y los procesa
 * usando el mismo código que el webhook de producción.
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'

// Cargar .env.local manualmente
const envPath = resolve(process.cwd(), '.env.local')
try {
  const envContent = readFileSync(envPath, 'utf-8')
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=')
    if (key && !key.startsWith('#')) {
      process.env[key.trim()] = valueParts.join('=').trim()
    }
  })
} catch (e) {
  console.error('⚠️ No se pudo leer .env.local')
}

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const API_URL = `https://api.telegram.org/bot${BOT_TOKEN}`
const PORT = process.env.PORT || 3000
const LOCAL_API = `http://localhost:${PORT}/api/telegram/webhook`

if (!BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN no configurado en .env.local')
  process.exit(1)
}

let lastUpdateId = 0

async function sendToLocalWebhook(update) {
  try {
    const response = await fetch(LOCAL_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update)
    })
    return response.ok
  } catch (error) {
    console.error('❌ Error: ¿Está corriendo el servidor? (npm run dev)')
    return false
  }
}

async function getUpdates() {
  try {
    const response = await fetch(
      `${API_URL}/getUpdates?offset=${lastUpdateId + 1}&timeout=30`
    )
    const data = await response.json()
    
    if (data.ok && data.result.length > 0) {
      for (const update of data.result) {
        lastUpdateId = update.update_id
        
        // Log del mensaje recibido
        if (update.message) {
          const msg = update.message
          const from = msg.from?.first_name || 'Usuario'
          const text = msg.text || (msg.photo ? '📷 Foto' : '???')
          console.log(`\n📩 ${from}: ${text}`)
        }
        
        // Enviar al webhook local
        const sent = await sendToLocalWebhook(update)
        if (sent) {
          console.log('✅ Procesado')
        }
      }
    }
  } catch (error) {
    // Silenciar errores de timeout, son normales
    if (!error.message?.includes('timeout')) {
      console.error('Error:', error.message)
    }
  }
}

async function deleteWebhook() {
  const response = await fetch(`${API_URL}/deleteWebhook`)
  const data = await response.json()
  if (data.ok) {
    console.log('✅ Modo polling activo')
  }
}

async function main() {
  console.log('')
  console.log('========================================')
  console.log('📱 SpendPlan Telegram Bot')
  console.log('========================================')
  console.log('Bot: @spendplan_cl_bot')
  console.log(`Servidor: http://localhost:${PORT}`)
  console.log('----------------------------------------')
  console.log('Esperando mensajes... (Ctrl+C para salir)')
  console.log('')
  
  await deleteWebhook()
  
  // Loop infinito de polling
  while (true) {
    await getUpdates()
  }
}

main().catch(console.error)
