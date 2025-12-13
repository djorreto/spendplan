import { cn } from '@/lib/utils'

interface LoadingProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

/**
 * Spinner de carga simple
 */
export function Loading({ size = 'md', className }: LoadingProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12'
  }

  return (
    <div className={cn('animate-spin rounded-full border-2 border-muted border-t-primary', sizeClasses[size], className)} />
  )
}

/**
 * Spinner centrado en un contenedor
 */
export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center p-8">
      <Loading size="lg" />
    </div>
  )
}

/**
 * Página completa de carga
 */
export function LoadingPage() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <Loading size="lg" />
        <p className="mt-4 text-muted-foreground">Cargando...</p>
      </div>
    </div>
  )
}

