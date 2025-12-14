import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { ToastProvider } from '@/components/ui/toast'
import dynamic from 'next/dynamic'

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-inter',
  display: 'swap',
})

const PwaProvider = dynamic(() => import('@/components/pwa/pwa-provider'), { ssr: false })
const InstallPrompt = dynamic(() => import('@/components/pwa/install-prompt'), { ssr: false })

export const metadata: Metadata = {
  title: 'SpendPlan - Control de Gastos del Hogar',
  description: 'Gestiona el presupuesto y gastos de tu hogar de forma simple e inteligente.',
  keywords: ['presupuesto', 'gastos', 'finanzas', 'hogar', 'familia', 'ahorro'],
  robots: {
    index: true,
    follow: true,
  }
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="apple-touch-icon" href="/icons/icon-180.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="theme-color" content="#12b76a" />
      </head>
      <body className={`${inter.className} min-h-screen`}>
        <ToastProvider>
          <PwaProvider />
          <InstallPrompt />
          {children}
        </ToastProvider>
      </body>
    </html>
  )
}
