export default function PrivacidadPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12 space-y-6">
      <h1 className="text-3xl font-bold">Política de Privacidad (v1.0)</h1>
      <p className="text-muted-foreground">
        Última actualización: 2025-12-17
      </p>
      <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
        <p>
          Esta política describe cómo SpendPlan trata tus datos personales. Al usar la app, aceptas esta política.
        </p>
        <h2 className="text-xl font-semibold text-foreground">Qué datos recopilamos</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>Datos de cuenta: email, nombre, configuración.</li>
          <li>Datos de uso: gastos, presupuestos, categorías, adjuntos, metadatos técnicos.</li>
          <li>Datos opcionales: integraciones y preferencias que configures.</li>
        </ul>
        <h2 className="text-xl font-semibold text-foreground">Para qué usamos los datos</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>Operar la app (presupuestos, gastos, reportes) y brindar soporte.</li>
          <li>Mejorar el producto y generar métricas agregadas.</li>
          <li>Detectar abuso y mantener la seguridad.</li>
        </ul>
        <h2 className="text-xl font-semibold text-foreground">Con quién los compartimos</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>Proveedores necesarios (p.ej., hosting, base de datos, correo), bajo contrato de confidencialidad.</li>
          <li>Si la ley lo exige o para defender nuestros derechos.</li>
          <li>No vendemos datos personales.</li>
        </ul>
        <h2 className="text-xl font-semibold text-foreground">Retención y derechos</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>Conservamos los datos mientras tengas cuenta o sea necesario para el servicio.</li>
          <li>Puedes solicitar acceso, rectificación o eliminación escribiendo a <a className="underline" href="mailto:djorreto@spendplan.cl">djorreto@spendplan.cl</a>.</li>
        </ul>
        <h2 className="text-xl font-semibold text-foreground">Seguridad</h2>
        <p>Usamos medidas razonables (cifrado en tránsito, controles de acceso). Ningún sistema es 100% seguro.</p>
        <h2 className="text-xl font-semibold text-foreground">Cambios</h2>
        <p>Podemos actualizar esta política. Si el cambio es material, pediremos tu aceptación nuevamente.</p>
      </div>
    </div>
  )
}
