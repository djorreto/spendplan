import { redirect } from 'next/navigation'

// Beta privada: sin acceso "demo" público.
export default function DashboardPage() {
  redirect('/app/dashboard')
}

