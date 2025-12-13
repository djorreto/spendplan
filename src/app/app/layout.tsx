export const dynamic = 'force-dynamic'
export const revalidate = 0

import { AppLayoutClient } from './layout-client'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppLayoutClient>{children}</AppLayoutClient>
}

