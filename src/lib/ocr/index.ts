/**
 * ========================================
 * 📷 OCR LOCAL - TESSERACT.JS
 * ========================================
 * OCR gratuito en el navegador para boletas chilenas
 * Carga tesseract.js dinámicamente desde CDN
 */

export interface OCRResult {
  raw_text: string
  confidence: number
  extracted_fields: ExtractedFields
  processing_time_ms: number
}

export interface ExtractedFields {
  merchant_name: string | null
  purchase_date: string | null // YYYY-MM-DD
  total_amount_clp: number | null
  confidence: number
  notes: string[]
}

// Cargar Tesseract.js dinámicamente
let tesseractLoaded = false
let Tesseract: any = null

async function loadTesseract(): Promise<void> {
  if (tesseractLoaded && Tesseract) return

  return new Promise((resolve, reject) => {
    // Check if already loaded
    if ((window as any).Tesseract) {
      Tesseract = (window as any).Tesseract
      tesseractLoaded = true
      resolve()
      return
    }

    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'
    script.async = true
    script.onload = () => {
      Tesseract = (window as any).Tesseract
      tesseractLoaded = true
      resolve()
    }
    script.onerror = () => reject(new Error('Failed to load Tesseract.js'))
    document.head.appendChild(script)
  })
}

/**
 * Preprocesar imagen para mejorar OCR
 */
async function preprocessImage(imageFile: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const reader = new FileReader()

    reader.onload = (e) => {
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')!
        
        // Resize to max 1400px width
        const maxWidth = 1400
        let width = img.width
        let height = img.height
        
        if (width > maxWidth) {
          height = (maxWidth / width) * height
          width = maxWidth
        }
        
        canvas.width = width
        canvas.height = height
        
        // Draw original
        ctx.drawImage(img, 0, 0, width, height)
        
        // Get image data
        const imageData = ctx.getImageData(0, 0, width, height)
        const data = imageData.data
        
        // Convert to grayscale and increase contrast
        for (let i = 0; i < data.length; i += 4) {
          // Grayscale
          const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
          
          // Increase contrast
          const contrast = 1.3
          const factor = (259 * (contrast * 255 + 255)) / (255 * (259 - contrast * 255))
          let newValue = factor * (gray - 128) + 128
          
          // Clamp
          newValue = Math.max(0, Math.min(255, newValue))
          
          data[i] = newValue
          data[i + 1] = newValue
          data[i + 2] = newValue
        }
        
        ctx.putImageData(imageData, 0, 0)
        
        // Return as base64
        resolve(canvas.toDataURL('image/png'))
      }
      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = e.target?.result as string
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(imageFile)
  })
}

/**
 * Extraer campos de texto OCR (reglas para Chile)
 */
function extractFieldsFromText(rawText: string): ExtractedFields {
  const notes: string[] = []
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean)
  
  // === EXTRAER MONTO TOTAL ===
  let totalAmount: number | null = null
  const totalPatterns = [
    /TOTAL\s*(?:A\s*PAGAR|VENTA)?\s*[:\$]?\s*\$?\s*([\d.,]+)/i,
    /MONTO\s*TOTAL\s*[:\$]?\s*\$?\s*([\d.,]+)/i,
    /TOTAL\s*[:\$]?\s*\$?\s*([\d.,]+)/i,
    /\$\s*([\d.,]+)\s*$/m,
  ]
  
  for (const pattern of totalPatterns) {
    const match = rawText.match(pattern)
    if (match) {
      const amountStr = match[1].replace(/\./g, '').replace(',', '.')
      const amount = parseFloat(amountStr)
      if (!isNaN(amount) && amount > 0 && amount < 100000000) {
        totalAmount = Math.round(amount)
        notes.push(`Monto detectado: ${match[0]}`)
        break
      }
    }
  }
  
  // Si no encontramos con patrones, buscar el número más grande
  if (!totalAmount) {
    const allAmounts = rawText.match(/\$?\s*([\d]{1,3}(?:[.,]?\d{3})*)/g) || []
    const parsed = allAmounts
      .map(a => {
        const clean = a.replace(/[$\s]/g, '').replace(/\./g, '').replace(',', '.')
        return parseFloat(clean)
      })
      .filter(n => !isNaN(n) && n > 100 && n < 10000000)
      .sort((a, b) => b - a)
    
    if (parsed.length > 0) {
      totalAmount = Math.round(parsed[0])
      notes.push('Monto inferido del número más grande')
    }
  }
  
  // === EXTRAER FECHA ===
  let purchaseDate: string | null = null
  const datePatterns = [
    /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/,  // dd/mm/yyyy
    /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2})/,   // dd/mm/yy
  ]
  
  for (const pattern of datePatterns) {
    const match = rawText.match(pattern)
    if (match) {
      let day = parseInt(match[1])
      let month = parseInt(match[2])
      let year = parseInt(match[3])
      
      // Handle 2-digit year
      if (year < 100) {
        year += year > 50 ? 1900 : 2000
      }
      
      // Validate
      if (month > 12 && day <= 12) {
        // Swap if month looks wrong
        [day, month] = [month, day]
      }
      
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 2020 && year <= 2030) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        const parsed = new Date(dateStr)
        const today = new Date()
        
        // Don't accept future dates
        if (parsed <= today) {
          purchaseDate = dateStr
          notes.push(`Fecha detectada: ${match[0]}`)
          break
        }
      }
    }
  }
  
  // === EXTRAER COMERCIO ===
  let merchantName: string | null = null
  const excludePatterns = [
    /RUT/i, /SII/i, /BOLETA/i, /GIRO/i, /CAJA/i, /ATENDIO/i,
    /FACTURA/i, /TICKET/i, /TOTAL/i, /SUBTOTAL/i, /IVA/i,
    /VUELTO/i, /EFECTIVO/i, /CREDITO/i, /DEBITO/i, /TRANSBANK/i,
    /^\d+$/, /^\$/, /^[0-9\-\/.,:\s]+$/
  ]
  
  // Look in first 5 lines for merchant
  for (const line of lines.slice(0, 5)) {
    const cleanLine = line.trim()
    
    // Skip if matches exclude patterns
    if (excludePatterns.some(p => p.test(cleanLine))) continue
    
    // Skip if too short or mostly numbers
    if (cleanLine.length < 3) continue
    const letterCount = (cleanLine.match(/[a-zA-ZáéíóúñÁÉÍÓÚÑ]/g) || []).length
    if (letterCount < cleanLine.length * 0.4) continue
    
    merchantName = cleanLine.substring(0, 50)
    notes.push(`Comercio detectado de línea: "${cleanLine}"`)
    break
  }
  
  // Calculate overall confidence
  let confidence = 0
  if (totalAmount) confidence += 0.4
  if (purchaseDate) confidence += 0.3
  if (merchantName) confidence += 0.3
  
  return {
    merchant_name: merchantName,
    purchase_date: purchaseDate,
    total_amount_clp: totalAmount,
    confidence: Math.round(confidence * 100) / 100,
    notes
  }
}

/**
 * Ejecutar OCR en una imagen
 */
export async function runOCR(imageFile: File, onProgress?: (progress: number) => void): Promise<OCRResult> {
  const startTime = Date.now()
  
  // Load Tesseract
  await loadTesseract()
  
  // Preprocess image
  onProgress?.(10)
  const processedImage = await preprocessImage(imageFile)
  
  // Run OCR
  onProgress?.(30)
  const worker = await Tesseract.createWorker('spa', 1, {
    logger: (m: any) => {
      if (m.status === 'recognizing text' && m.progress) {
        onProgress?.(30 + m.progress * 60)
      }
    }
  })
  
  try {
    const result = await worker.recognize(processedImage)
    onProgress?.(95)
    
    const rawText = result.data.text
    const ocrConfidence = result.data.confidence / 100
    
    // Extract fields
    const extractedFields = extractFieldsFromText(rawText)
    
    onProgress?.(100)
    
    return {
      raw_text: rawText,
      confidence: ocrConfidence,
      extracted_fields: extractedFields,
      processing_time_ms: Date.now() - startTime
    }
  } finally {
    await worker.terminate()
  }
}

/**
 * Analizar texto OCR con Grok (texto only)
 */
export interface GrokOCRAnalysis {
  merchant_name: string | null
  purchase_date: string | null
  total_amount_clp: number | null
  suggested_category: string | null
  confidence: number
  notes: string | null
}

export async function analyzeOCRWithGrok(
  rawText: string,
  extractedFields: ExtractedFields,
  apiKey: string
): Promise<GrokOCRAnalysis> {
  const prompt = `Analiza el siguiente texto extraído por OCR de una boleta chilena.

TEXTO OCR:
${rawText}

CAMPOS EXTRAÍDOS POR REGLAS:
- Comercio: ${extractedFields.merchant_name || 'No detectado'}
- Fecha: ${extractedFields.purchase_date || 'No detectada'}  
- Monto: ${extractedFields.total_amount_clp ? `$${extractedFields.total_amount_clp}` : 'No detectado'}

Contexto: Esta es una boleta de gasto de hogar en Chile, moneda CLP.

Responde SOLO en JSON válido con este formato:
{
  "merchant_name": "nombre del comercio corregido o null",
  "purchase_date": "YYYY-MM-DD o null",
  "total_amount_clp": número entero o null,
  "suggested_category": "Supermercado|Restaurantes|Transporte|Salud|Hogar|Entretenimiento|Otros",
  "confidence": número entre 0 y 1,
  "notes": "observaciones breves o null"
}`

  try {
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'grok-beta',
        messages: [
          { role: 'system', content: 'Responde únicamente en JSON válido, sin markdown ni explicaciones.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 500,
      }),
    })

    if (!response.ok) {
      throw new Error(`Grok API error: ${response.status}`)
    }

    const data = await response.json()
    const content = data.choices[0]?.message?.content || '{}'
    const parsed = JSON.parse(content)

    return {
      merchant_name: parsed.merchant_name || null,
      purchase_date: parsed.purchase_date || null,
      total_amount_clp: parsed.total_amount_clp || null,
      suggested_category: parsed.suggested_category || null,
      confidence: parsed.confidence || 0.5,
      notes: parsed.notes || null,
    }
  } catch (error) {
    console.error('Grok OCR analysis error:', error)
    return {
      merchant_name: extractedFields.merchant_name,
      purchase_date: extractedFields.purchase_date,
      total_amount_clp: extractedFields.total_amount_clp,
      suggested_category: null,
      confidence: extractedFields.confidence,
      notes: 'Error al analizar con Grok',
    }
  }
}
