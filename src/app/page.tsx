'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Logo } from '@/components/ui/logo'
import { 
  ArrowRight, 
  CheckCircle, 
  Wallet,
  PieChart,
  MessageSquare,
  Sparkles,
  Shield,
  Users,
  Menu,
  X,
  TrendingUp,
  Receipt,
  ChevronDown,
  Check
} from 'lucide-react'

// Sub-components defined before main component
function PricingFeature({ children, included }: { children: React.ReactNode; included?: boolean }) {
  return (
    <li className="flex items-center gap-3">
      <div className={`rounded-full p-0.5 ${included ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
        <Check className="h-4 w-4" />
      </div>
      <span className={included ? '' : 'text-muted-foreground'}>{children}</span>
    </li>
  )
}

export default function HomePage() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-accent/5 to-background">
      {/* Header */}
      <header className="sticky top-0 z-50 glass">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Logo size="md" />

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center space-x-8">
              <a href="#features" className="text-muted-foreground hover:text-foreground transition-colors">
                Características
              </a>
              <a href="#how-it-works" className="text-muted-foreground hover:text-foreground transition-colors">
                Cómo funciona
              </a>
              <a href="#pricing" className="text-muted-foreground hover:text-foreground transition-colors">
                Precios
              </a>
            </nav>

            {/* CTA Buttons */}
            <div className="hidden md:flex items-center space-x-3">
              <Link href="/login">
                <Button variant="ghost">Iniciar Sesión</Button>
              </Link>
              <Link href="/login?mode=signup">
                <Button>
                  Comenzar Gratis
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>

            {/* Mobile menu button */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </Button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="md:hidden border-t bg-background animate-slide-up">
            <div className="px-4 py-4 space-y-3">
              <a href="#features" className="block py-2 text-muted-foreground">Características</a>
              <a href="#how-it-works" className="block py-2 text-muted-foreground">Cómo funciona</a>
              <a href="#pricing" className="block py-2 text-muted-foreground">Precios</a>
              <div className="pt-4 space-y-2">
                <Link href="/login" className="block">
                  <Button variant="outline" className="w-full">Iniciar Sesión</Button>
                </Link>
                <Link href="/login?mode=signup" className="block">
                  <Button className="w-full">Comenzar Gratis</Button>
                </Link>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto">
            <Badge variant="secondary" className="mb-4 animate-fade-in">
              <Sparkles className="h-3 w-3 mr-1" />
              Con inteligencia artificial
            </Badge>
            <h1 className="text-4xl md:text-6xl font-bold mb-6 text-foreground animate-slide-up">
              Controla los gastos de tu hogar{' '}
              <span className="text-primary">sin complicaciones</span>
            </h1>
            <p className="text-xl text-muted-foreground mb-8 leading-relaxed animate-slide-up" style={{ animationDelay: '100ms' }}>
              SpendPlan te ayuda a presupuestar, registrar y visualizar los gastos de tu familia. 
              Registra gastos por WhatsApp, importa tu cartola bancaria y recibe recomendaciones con IA.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center animate-slide-up" style={{ animationDelay: '200ms' }}>
              <Link href="/login?mode=signup">
                <Button size="lg" className="text-lg px-8 w-full sm:w-auto">
                  Crear Cuenta Gratis
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link href="#how-it-works">
                <Button size="lg" variant="outline" className="text-lg px-8 w-full sm:w-auto">
                  Ver cómo funciona
                </Button>
              </Link>
            </div>
          </div>

          {/* Hero Image/Preview */}
          <div className="mt-16 relative animate-slide-up" style={{ animationDelay: '300ms' }}>
            <div className="bg-gradient-to-r from-primary/20 via-primary/10 to-accent/20 rounded-2xl p-1">
              <div className="bg-card rounded-xl shadow-2xl overflow-hidden">
                <div className="bg-secondary/10 px-4 py-3 flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-400" />
                    <div className="w-3 h-3 rounded-full bg-yellow-400" />
                    <div className="w-3 h-3 rounded-full bg-green-400" />
                  </div>
                  <span className="text-xs text-muted-foreground ml-2">SpendPlan Dashboard</span>
                </div>
                <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatsPreview label="Gastado este mes" value="$485.200" trend="-12%" positive />
                  <StatsPreview label="Presupuesto usado" value="68%" trend="En control" positive />
                  <StatsPreview label="Transacciones" value="47" />
                  <StatsPreview label="Ahorro vs mes anterior" value="$52.000" trend="+8%" positive />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-muted/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Todo lo que necesitas para controlar tus finanzas
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Diseñado para familias chilenas que quieren tener claridad sobre sus gastos
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 stagger-children">
            <FeatureCard
              icon={Wallet}
              title="Presupuesto Mensual"
              description="Define cuánto planeas gastar en cada categoría. Copia el presupuesto del mes anterior con un clic."
              color="primary"
            />
            <FeatureCard
              icon={Receipt}
              title="Registro Rápido"
              description="Agrega gastos en segundos. Manual, por WhatsApp o importando tu cartola bancaria."
              color="secondary"
            />
            <FeatureCard
              icon={MessageSquare}
              title="WhatsApp Integrado"
              description="Envía 'Jumbo 45.300 débito' y listo. También puedes enviar fotos de boletas."
              color="accent"
            />
            <FeatureCard
              icon={PieChart}
              title="Dashboard Visual"
              description="Gráficos claros de presupuesto vs real, evolución diaria y tendencias por categoría."
              color="primary"
            />
            <FeatureCard
              icon={Sparkles}
              title="IA que Ayuda"
              description="Categorización automática, detección de anomalías y recomendaciones personalizadas."
              color="secondary"
            />
            <FeatureCard
              icon={Users}
              title="Para toda la Familia"
              description="Invita a tu pareja al hogar. Ambos pueden registrar gastos y ver el mismo dashboard."
              color="accent"
            />
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section id="how-it-works" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Empieza en 3 simples pasos
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <StepCard
              number={1}
              title="Crea tu Hogar"
              description="Regístrate y crea tu hogar en menos de un minuto. Invita a tu familia si quieres."
            />
            <StepCard
              number={2}
              title="Define tu Presupuesto"
              description="Ingresa tus ingresos y cuánto quieres gastar por categoría este mes."
            />
            <StepCard
              number={3}
              title="Registra tus Gastos"
              description="Agrega gastos manualmente, por WhatsApp o importando tu cartola. La IA te ayuda a categorizar."
            />
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 px-4 sm:px-6 lg:px-8 bg-muted/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <Badge variant="secondary" className="mb-4">
              🎉 Oferta de Lanzamiento
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Precios simples y transparentes
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Comienza gratis y paga solo cuando veas el valor
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Plan Principal */}
            <Card className="relative border-2 border-primary shadow-xl">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                <Badge className="bg-primary text-primary-foreground px-4 py-1">
                  Más Popular
                </Badge>
              </div>
              <CardContent className="p-8 pt-10">
                <div className="text-center mb-6">
                  <h3 className="text-2xl font-bold mb-2">SpendPlan Pro</h3>
                  <p className="text-muted-foreground">Todo lo que necesitas para controlar tus finanzas</p>
                </div>
                
                <div className="text-center mb-6">
                  <div className="flex items-baseline justify-center gap-2">
                    <span className="text-5xl font-bold">$1.990</span>
                    <span className="text-muted-foreground">/mes</span>
                  </div>
                  <div className="mt-2 inline-flex items-center gap-2 bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-medium">
                    <Sparkles className="h-4 w-4" />
                    3 meses GRATIS
                  </div>
                </div>

                <ul className="space-y-3 mb-8">
                  <PricingFeature included>Dashboard completo con gráficos</PricingFeature>
                  <PricingFeature included>Presupuesto mensual ilimitado</PricingFeature>
                  <PricingFeature included>Gastos ilimitados</PricingFeature>
                  <PricingFeature included>Registro por WhatsApp</PricingFeature>
                  <PricingFeature included>Importación CSV bancario</PricingFeature>
                  <PricingFeature included>Categorización con IA</PricingFeature>
                  <PricingFeature included>Insights mensuales con IA</PricingFeature>
                  <PricingFeature included>Multi-usuario (invita a tu familia)</PricingFeature>
                  <PricingFeature included>Soporte prioritario</PricingFeature>
                </ul>

                <Link href="/login?mode=signup">
                  <Button className="w-full" size="lg">
                    Comenzar 3 Meses Gratis
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <p className="text-xs text-center text-muted-foreground mt-3">
                  Sin tarjeta de crédito para los 3 meses gratis
                </p>
              </CardContent>
            </Card>

            {/* Asesorías */}
            <Card className="border-2">
              <CardContent className="p-8">
                <div className="text-center mb-6">
                  <div className="w-16 h-16 rounded-2xl bg-secondary/10 flex items-center justify-center mx-auto mb-4">
                    <Users className="h-8 w-8 text-secondary" />
                  </div>
                  <h3 className="text-2xl font-bold mb-2">Asesorías Financieras</h3>
                  <p className="text-muted-foreground">Acompañamiento personalizado para mejorar tus finanzas</p>
                </div>

                <div className="bg-accent/50 rounded-xl p-4 mb-6 text-center">
                  <p className="text-sm font-medium text-accent-foreground">
                    🎁 Primera asesoría <span className="font-bold">GRATIS</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Exclusivo para usuarios inscritos
                  </p>
                </div>

                <ul className="space-y-3 mb-8">
                  <PricingFeature included>Sesión 1:1 por videollamada</PricingFeature>
                  <PricingFeature included>Análisis de tus gastos actuales</PricingFeature>
                  <PricingFeature included>Plan de acción personalizado</PricingFeature>
                  <PricingFeature included>Recomendaciones de ahorro</PricingFeature>
                  <PricingFeature included>Seguimiento de metas</PricingFeature>
                </ul>

                <div className="border-t pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-muted-foreground">Sesión adicional (45 min)</span>
                    <span className="font-bold">$15.000</span>
                  </div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-muted-foreground">Pack 4 sesiones</span>
                    <div className="text-right">
                      <span className="font-bold">$49.990</span>
                      <span className="text-xs text-green-600 ml-2">Ahorra 17%</span>
                    </div>
                  </div>
                </div>

                <Link href="/login?mode=signup">
                  <Button variant="outline" className="w-full" size="lg">
                    Agendar Asesoría Gratis
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>

          {/* FAQ rápido */}
          <div className="mt-16 max-w-2xl mx-auto">
            <h3 className="text-xl font-bold text-center mb-8">Preguntas Frecuentes</h3>
            <div className="space-y-4">
              <details className="group bg-background rounded-lg border p-4">
                <summary className="font-medium cursor-pointer list-none flex items-center justify-between">
                  ¿Qué pasa después de los 3 meses gratis?
                  <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-3 text-muted-foreground text-sm">
                  Después del período de prueba, tu suscripción continúa a $1.990/mes. Te avisaremos antes de cobrar. Puedes cancelar en cualquier momento.
                </p>
              </details>
              <details className="group bg-background rounded-lg border p-4">
                <summary className="font-medium cursor-pointer list-none flex items-center justify-between">
                  ¿Puedo cancelar cuando quiera?
                  <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-3 text-muted-foreground text-sm">
                  Sí, puedes cancelar tu suscripción en cualquier momento desde la configuración de tu cuenta. No hay contratos ni compromisos.
                </p>
              </details>
              <details className="group bg-background rounded-lg border p-4">
                <summary className="font-medium cursor-pointer list-none flex items-center justify-between">
                  ¿Cómo funciona la asesoría gratuita?
                  <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-3 text-muted-foreground text-sm">
                  Una vez inscrito, puedes agendar tu primera asesoría de 30 minutos sin costo. Te ayudaremos a configurar tu presupuesto y daremos recomendaciones iniciales.
                </p>
              </details>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <Card className="gradient-primary text-white overflow-hidden">
            <CardContent className="p-8 md:p-12 text-center relative">
              <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzRjMC0yLjIxLTEuNzktNC00LTRzLTQgMS43OS00IDQgMS43OSA0IDQgNCA0LTEuNzkgNC00eiIvPjwvZz48L2c+PC9zdmc+')] opacity-30" />
              <div className="relative">
                <h2 className="text-3xl md:text-4xl font-bold mb-4">
                  ¿Listo para tomar el control?
                </h2>
                <p className="text-lg text-white/90 mb-8 max-w-xl mx-auto">
                  Únete a las familias que ya están ahorrando y tomando mejores decisiones financieras.
                </p>
                <Link href="/login?mode=signup">
                  <Button size="lg" variant="secondary" className="text-lg px-8">
                    Comenzar Gratis
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <p className="text-sm text-white/70 mt-4">
                  Sin tarjeta de crédito • Gratis para siempre en plan básico
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 sm:px-6 lg:px-8 border-t">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div>
              <Logo size="md" />
              <p className="text-muted-foreground mt-2 text-sm">
                Control de gastos simple para tu hogar.
              </p>
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <a href="#" className="hover:text-foreground transition-colors">Privacidad</a>
              <a href="#" className="hover:text-foreground transition-colors">Términos</a>
              <a href="#" className="hover:text-foreground transition-colors">Contacto</a>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t text-center text-sm text-muted-foreground">
            © {new Date().getFullYear()} SpendPlan. Hecho con 💚 en Chile.
          </div>
        </div>
      </footer>
    </div>
  )
}

// Sub-components

function StatsPreview({ label, value, trend, positive }: {
  label: string
  value: string
  trend?: string
  positive?: boolean
}) {
  return (
    <div className="p-4 rounded-lg bg-muted/50">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-xl font-bold">{value}</p>
      {trend && (
        <p className={`text-xs mt-1 ${positive ? 'text-green-600' : 'text-muted-foreground'}`}>
          {trend}
        </p>
      )}
    </div>
  )
}

function FeatureCard({ icon: Icon, title, description, color }: {
  icon: React.ElementType
  title: string
  description: string
  color: 'primary' | 'secondary' | 'accent'
}) {
  const colorClasses = {
    primary: 'bg-primary/10 text-primary',
    secondary: 'bg-secondary/10 text-secondary-foreground',
    accent: 'bg-accent text-accent-foreground',
  }

  return (
    <Card className="group hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
      <CardContent className="p-6">
        <div className={`p-3 rounded-xl w-fit mb-4 ${colorClasses[color]}`}>
          <Icon className="h-6 w-6" />
        </div>
        <h3 className="text-lg font-semibold mb-2">{title}</h3>
        <p className="text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  )
}

function StepCard({ number, title, description }: {
  number: number
  title: string
  description: string
}) {
  return (
    <div className="text-center">
      <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground font-bold text-xl flex items-center justify-center mx-auto mb-4">
        {number}
      </div>
      <h3 className="text-xl font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground">{description}</p>
    </div>
  )
}
