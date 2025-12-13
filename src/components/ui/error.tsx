import { AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from './button'
import { cn } from '@/lib/utils'

interface ErrorProps {
  title?: string
  message?: string
  onRetry?: () => void
  className?: string
}

/**
 * Mensaje de error en línea
 */
export function ErrorMessage({ 
  title = 'Error', 
  message = 'Algo salió mal. Por favor, inténtalo de nuevo.',
  onRetry,
  className 
}: ErrorProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center p-8 text-center', className)}>
      <AlertCircle className="h-12 w-12 text-destructive mb-4" />
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground mb-4 max-w-md">{message}</p>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Reintentar
        </Button>
      )}
    </div>
  )
}

/**
 * Página completa de error
 */
export function ErrorPage({ 
  title = 'Error', 
  message = 'No se pudo cargar la página.',
  onRetry 
}: ErrorProps) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <ErrorMessage title={title} message={message} onRetry={onRetry} />
    </div>
  )
}

