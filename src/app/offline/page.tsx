'use client'

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md text-center space-y-3">
        <h1 className="text-2xl font-bold">Sin conexión</h1>
        <p className="text-muted-foreground">
          Parece que no tienes internet. Revisa tu conexión y vuelve a intentarlo.
        </p>
      </div>
    </div>
  )
}

