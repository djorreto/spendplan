'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Logo } from '@/components/ui/logo'
import { useToast } from '@/components/ui/toast'
import { Loading } from '@/components/ui/loading'
import { Eye, EyeOff, ArrowLeft, Mail, Lock, User, Sparkles } from 'lucide-react'

type Mode = 'login' | 'signup' | 'forgot'

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { signIn, signInDemo, signUp, resetPassword, loading: authLoading, isAuthenticated } = useAuth()
  const { addToast } = useToast()
  
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Check URL params for mode
  useEffect(() => {
    const urlMode = searchParams.get('mode')
    if (urlMode === 'signup') setMode('signup')
  }, [searchParams])

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      router.push('/app/dashboard')
    }
  }, [isAuthenticated, router])

  // Demo mode handler
  const handleDemoMode = async () => {
    setIsSubmitting(true)
    try {
      const { user, error } = await signInDemo('demo@spendplan.cl', 'Usuario Demo')
      if (error) {
        addToast({ type: 'error', message: 'Error al iniciar modo demo' })
      } else if (user) {
        addToast({ 
          type: 'success', 
          title: '¡Modo Demo activado!',
          message: 'Explora la app sin necesidad de registro' 
        })
        router.push('/onboarding')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!email) {
      addToast({ type: 'error', message: 'Ingresa tu email' })
      return
    }

    setIsSubmitting(true)

    try {
      if (mode === 'forgot') {
        const { error } = await resetPassword(email)
        if (error) {
          addToast({ type: 'error', message: error.message })
        } else {
          addToast({ 
            type: 'success', 
            title: 'Email enviado',
            message: 'Revisa tu correo para restablecer tu contraseña' 
          })
          setMode('login')
        }
      } else if (mode === 'signup') {
        if (!password || password.length < 6) {
          addToast({ type: 'error', message: 'La contraseña debe tener al menos 6 caracteres' })
          setIsSubmitting(false)
          return
        }
        
        const { user, error } = await signUp(email, password, { full_name: fullName })
        
        if (error) {
          addToast({ type: 'error', message: error.message })
        } else if (user) {
          addToast({ 
            type: 'success', 
            title: '¡Cuenta creada!',
            message: 'Revisa tu email para confirmar tu cuenta' 
          })
          setMode('login')
        }
      } else {
        if (!password) {
          addToast({ type: 'error', message: 'Ingresa tu contraseña' })
          setIsSubmitting(false)
          return
        }

        const { user, error } = await signIn(email, password)
        
        if (error) {
          addToast({ 
            type: 'error', 
            title: 'Error al iniciar sesión',
            message: error.message || 'Credenciales incorrectas'
          })
        } else if (user) {
          addToast({ type: 'success', message: '¡Bienvenido!' })
          router.push('/app/dashboard')
        }
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const titles: Record<Mode, { title: string; description: string }> = {
    login: {
      title: 'Bienvenido de vuelta',
      description: 'Ingresa a tu cuenta para continuar'
    },
    signup: {
      title: 'Crea tu cuenta',
      description: 'Comienza a controlar tus gastos hoy'
    },
    forgot: {
      title: 'Recuperar contraseña',
      description: 'Te enviaremos un link para restablecerla'
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loading size="lg" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex">
      {/* Left side - Form */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <Link href="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Volver al inicio
            </Link>
            <Logo size="lg" className="mb-6" />
          </div>

          <Card className="border-0 shadow-xl">
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl">{titles[mode].title}</CardTitle>
              <CardDescription>{titles[mode].description}</CardDescription>
            </CardHeader>
            
            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-4">
                {mode === 'signup' && (
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Nombre completo</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="fullName"
                        type="text"
                        placeholder="Tu nombre"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        disabled={isSubmitting}
                        className="pl-10"
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="tu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={isSubmitting}
                      autoComplete="email"
                      className="pl-10"
                    />
                  </div>
                </div>
                
                {mode !== 'forgot' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">Contraseña</Label>
                      {mode === 'login' && (
                        <button
                          type="button"
                          onClick={() => setMode('forgot')}
                          className="text-sm text-primary hover:underline"
                        >
                          ¿Olvidaste tu contraseña?
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={isSubmitting}
                        autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                        className="pl-10 pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                    {mode === 'signup' && (
                      <p className="text-xs text-muted-foreground">Mínimo 6 caracteres</p>
                    )}
                  </div>
                )}
              </CardContent>
              
              <CardFooter className="flex flex-col gap-4">
                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={isSubmitting}
                  size="lg"
                >
                  {isSubmitting ? (
                    <>
                      <Loading size="sm" className="mr-2" />
                      {mode === 'login' ? 'Ingresando...' : mode === 'signup' ? 'Creando cuenta...' : 'Enviando...'}
                    </>
                  ) : (
                    mode === 'login' ? 'Ingresar' : mode === 'signup' ? 'Crear Cuenta' : 'Enviar Link'
                  )}
                </Button>

                {/* Demo mode button */}
                {mode !== 'forgot' && (
                  <div className="relative w-full">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">o</span>
                    </div>
                  </div>
                )}

                {mode !== 'forgot' && (
                  <Button 
                    type="button"
                    variant="outline"
                    className="w-full" 
                    disabled={isSubmitting}
                    size="lg"
                    onClick={handleDemoMode}
                  >
                    <Sparkles className="mr-2 h-4 w-4" />
                    Probar sin registro
                  </Button>
                )}
                
                {mode === 'login' && (
                  <p className="text-sm text-muted-foreground text-center">
                    ¿No tienes cuenta?{' '}
                    <button
                      type="button"
                      onClick={() => setMode('signup')}
                      className="text-primary hover:underline font-medium"
                    >
                      Regístrate gratis
                    </button>
                  </p>
                )}

                {mode === 'signup' && (
                  <p className="text-sm text-muted-foreground text-center">
                    ¿Ya tienes cuenta?{' '}
                    <button
                      type="button"
                      onClick={() => setMode('login')}
                      className="text-primary hover:underline font-medium"
                    >
                      Inicia sesión
                    </button>
                  </p>
                )}

                {mode === 'forgot' && (
                  <button
                    type="button"
                    onClick={() => setMode('login')}
                    className="text-sm text-primary hover:underline"
                  >
                    Volver al login
                  </button>
                )}
              </CardFooter>
            </form>
          </Card>

          <p className="text-xs text-muted-foreground text-center mt-6">
            Al continuar, aceptas nuestros{' '}
            <a href="#" className="underline">Términos de Servicio</a>
            {' '}y{' '}
            <a href="#" className="underline">Política de Privacidad</a>
          </p>
        </div>
      </div>

      {/* Right side - Decorative */}
      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-primary via-primary to-secondary items-center justify-center p-12">
        <div className="max-w-md text-white">
          <h2 className="text-3xl font-bold mb-6">
            Toma el control de tus finanzas familiares
          </h2>
          <ul className="space-y-4">
            <li className="flex items-start gap-3">
              <div className="rounded-full bg-white/20 p-1">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <span>Presupuesto mensual por categorías</span>
            </li>
            <li className="flex items-start gap-3">
              <div className="rounded-full bg-white/20 p-1">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <span>Registro de gastos por WhatsApp</span>
            </li>
            <li className="flex items-start gap-3">
              <div className="rounded-full bg-white/20 p-1">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <span>Importación de cartola bancaria</span>
            </li>
            <li className="flex items-start gap-3">
              <div className="rounded-full bg-white/20 p-1">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <span>Categorización automática con IA</span>
            </li>
            <li className="flex items-start gap-3">
              <div className="rounded-full bg-white/20 p-1">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <span>Dashboard claro y gráficos intuitivos</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}
