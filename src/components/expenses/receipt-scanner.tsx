'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { 
  Camera, 
  Upload, 
  X, 
  Sparkles, 
  Check, 
  AlertTriangle,
  RotateCcw,
  Loader2
} from 'lucide-react'
import { runOCR, type OCRResult } from '@/lib/ocr'
import { formatCurrency } from '@/lib/utils'

interface ReceiptScannerProps {
  onExtracted: (data: {
    amount: number
    merchant: string
    date: string
    category?: string
    description?: string
    paymentMethod?: 'cash' | 'debit' | 'credit' | 'transfer'
  }) => void
  onCancel: () => void
  currency?: string
}

export function ReceiptScanner({ onExtracted, onCancel, currency = 'CLP' }: ReceiptScannerProps) {
  const [step, setStep] = useState<'upload' | 'processing' | 'review'>('upload')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [ocrResult, setOcrResult] = useState<OCRResult | null>(null)
  const [aiAnalysis, setAiAnalysis] = useState<{
    merchant_name: string | null
    purchase_date: string | null
    total_amount_clp: number | null
    suggested_category: string | null
    payment_method: 'cash' | 'debit' | 'credit' | 'transfer' | null
    confidence: number
    notes: string | null
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  // Form fields
  const [amount, setAmount] = useState('')
  const [merchant, setMerchant] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [description, setDescription] = useState('')
  
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Por favor selecciona una imagen')
      return
    }
    
    setImageFile(file)
    setError(null)
    
    // Create preview
    const reader = new FileReader()
    reader.onload = (e) => setImagePreview(e.target?.result as string)
    reader.readAsDataURL(file)
    
    // Start OCR + AI Analysis
    setStep('processing')
    setProgress(0)
    
    try {
      // 1. Extraer texto con OCR local
      const result = await runOCR(file, (p) => setProgress(Math.min(p, 70)))
      setOcrResult(result)
      
      // 2. Enviar texto a Groq para análisis inteligente
      setProgress(75)
      try {
        const response = await fetch('/api/ai/ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rawText: result.raw_text })
        })
        
        if (response.ok) {
          const analysis = await response.json()
          setAiAnalysis(analysis)
          
          // Pre-fill form con resultados de IA
          if (analysis.total_amount_clp) {
            setAmount(analysis.total_amount_clp.toString())
          }
          if (analysis.merchant_name) {
            setMerchant(analysis.merchant_name)
          }
          if (analysis.purchase_date) {
            setDate(analysis.purchase_date)
          }
        }
      } catch (aiErr) {
        console.error('AI analysis error:', aiErr)
        // Fallback a reglas locales si IA falla
        const fields = result.extracted_fields
        if (fields.total_amount_clp) setAmount(fields.total_amount_clp.toString())
        if (fields.merchant_name) setMerchant(fields.merchant_name)
        if (fields.purchase_date) setDate(fields.purchase_date)
      }
      
      setProgress(100)
      setStep('review')
    } catch (err) {
      console.error('OCR error:', err)
      setError('Error al procesar la imagen. Intenta de nuevo.')
      setStep('upload')
    }
  }



  const handleConfirm = () => {
    const parsedAmount = parseFloat(amount)
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Ingresa un monto válido')
      return
    }
    
    onExtracted({
      amount: parsedAmount,
      merchant: merchant || 'Sin comercio',
      date: date,
      category: aiAnalysis?.suggested_category || undefined,
      description: description || undefined,
      paymentMethod: aiAnalysis?.payment_method || undefined
    })
  }

  const handleRetry = () => {
    setStep('upload')
    setImageFile(null)
    setImagePreview(null)
    setOcrResult(null)
    setAiAnalysis(null)
    setProgress(0)
    setError(null)
    setAmount('')
    setMerchant('')
    setDate(new Date().toISOString().split('T')[0])
    setDescription('')
  }

  return (
    <Card className="w-full max-w-lg mx-auto">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5" />
              Escanear Boleta
            </CardTitle>
            <CardDescription>
              {step === 'upload' && 'Sube una foto de tu boleta'}
              {step === 'processing' && 'Procesando imagen...'}
              {step === 'review' && 'Revisa y confirma los datos'}
            </CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={onCancel}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Upload Step */}
        {step === 'upload' && (
          <div className="space-y-4">
            {/* Hidden inputs */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
            />
            
            {/* Upload buttons */}
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="h-24 flex-col gap-2"
                onClick={() => cameraInputRef.current?.click()}
              >
                <Camera className="h-8 w-8" />
                <span>Tomar Foto</span>
              </Button>
              <Button
                variant="outline"
                className="h-24 flex-col gap-2"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-8 w-8" />
                <span>Subir Archivo</span>
              </Button>
            </div>
            
            {error && (
              <div className="p-3 bg-destructive/10 text-destructive rounded-lg text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                {error}
              </div>
            )}
            
            <p className="text-xs text-muted-foreground text-center">
              Soporta JPG, PNG. El OCR funciona mejor con fotos claras y bien iluminadas.
            </p>
          </div>
        )}
        
        {/* Processing Step */}
        {step === 'processing' && (
          <div className="space-y-4 py-8">
            {imagePreview && (
              <div className="relative aspect-[3/4] max-h-48 mx-auto overflow-hidden rounded-lg">
                <img 
                  src={imagePreview} 
                  alt="Boleta" 
                  className="object-contain w-full h-full"
                />
              </div>
            )}
            
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Procesando OCR...</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
            
            <p className="text-xs text-muted-foreground text-center">
              Extrayendo texto de la imagen...
            </p>
          </div>
        )}
        
        {/* Review Step */}
        {step === 'review' && ocrResult && (
          <div className="space-y-4">
            {/* Image preview */}
            {imagePreview && (
              <div className="relative aspect-[3/4] max-h-32 mx-auto overflow-hidden rounded-lg">
                <img 
                  src={imagePreview} 
                  alt="Boleta" 
                  className="object-contain w-full h-full opacity-75"
                />
              </div>
            )}
            
            {/* OCR Confidence */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Confianza OCR:</span>
              <Badge variant={ocrResult.confidence > 0.7 ? 'default' : 'secondary'}>
                {Math.round(ocrResult.confidence * 100)}%
              </Badge>
            </div>
            
            {/* Form Fields */}
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="amount">Monto (CLP)</Label>
                <Input
                  id="amount"
                  type="number"
                  placeholder="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="text-lg font-semibold"
                />
              </div>
              
              <div className="space-y-1">
                <Label htmlFor="merchant">Comercio</Label>
                <Input
                  id="merchant"
                  placeholder="Nombre del comercio"
                  value={merchant}
                  onChange={(e) => setMerchant(e.target.value)}
                />
              </div>
              
              <div className="space-y-1">
                <Label htmlFor="date">Fecha</Label>
                <Input
                  id="date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              
              <div className="space-y-1">
                <Label htmlFor="description">Descripción (opcional)</Label>
                <Input
                  id="description"
                  placeholder="Notas adicionales"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </div>
            
            
            {/* AI Analysis Result */}
            {aiAnalysis && (
              <div className="flex items-center gap-2 text-sm text-purple-700 bg-purple-50 p-2 rounded">
                <Sparkles className="h-4 w-4" />
                <span>Analizado con IA</span>
                {aiAnalysis.suggested_category && (
                  <Badge variant="outline" className="text-purple-600 ml-auto">
                    {aiAnalysis.suggested_category}
                  </Badge>
                )}
              </div>
            )}
            
            {/* Raw Text (collapsible) */}
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                Ver texto OCR extraído
              </summary>
              <pre className="mt-2 p-2 bg-muted rounded text-[10px] max-h-32 overflow-auto whitespace-pre-wrap">
                {ocrResult.raw_text || 'Sin texto detectado'}
              </pre>
            </details>
            
            {error && (
              <div className="p-3 bg-destructive/10 text-destructive rounded-lg text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                {error}
              </div>
            )}
            
            {/* Action Buttons */}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={handleRetry}>
                <RotateCcw className="mr-1 h-4 w-4" />
                Reintentar
              </Button>
              <Button className="flex-1" onClick={handleConfirm}>
                <Check className="mr-1 h-4 w-4" />
                Confirmar
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
