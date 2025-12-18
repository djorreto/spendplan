import { buildPublicLegalUrl, getCurrentLegalDocuments } from '@/lib/legal'
import { formatDate } from '@/lib/utils'

export default async function PrivacidadPage() {
  const current = await getCurrentLegalDocuments().catch(() => ({} as any))
  const doc = current?.privacy
  const version = doc?.version || 'v1.1'
  const title = doc?.title || 'Política de Privacidad'
  const updatedAt = doc?.created_at ? formatDate(doc.created_at) : '—'
  const pdfUrl = doc?.storage_path ? buildPublicLegalUrl(doc.storage_path) : '#'

  return (
    <div className="max-w-3xl mx-auto px-4 py-12 space-y-6">
      <h1 className="text-3xl font-bold">
        {title} ({version})
      </h1>
      <p className="text-muted-foreground">Última actualización: {updatedAt}</p>
      <p className="text-sm text-muted-foreground">
        Versión PDF:{" "}
        <a
          className="underline"
          href={pdfUrl}
          target="_blank"
          rel="noreferrer"
        >
          Descargar {title} ({version})
        </a>
      </p>
      <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
        <p>
          Esta Política de Privacidad describe cómo SpendPlan trata los datos personales de sus usuarios.
          Al usar la aplicación, aceptas esta política. Esta política se rige por la legislación vigente de la República de Chile.
        </p>

        <h2 className="text-xl font-semibold text-foreground">Qué datos recopilamos</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>Datos de cuenta: correo electrónico, nombre y configuraciones de usuario.</li>
          <li>Datos de uso: gastos, presupuestos, categorías, adjuntos, preferencias, integraciones que configures y metadatos técnicos necesarios para la operación del servicio.</li>
          <li>Datos opcionales: información adicional que el usuario decida ingresar voluntariamente.</li>
          <li>No recopilamos intencionalmente datos sensibles ni credenciales de servicios financieros (accesos a bancos o tarjetas).</li>
        </ul>

        <h2 className="text-xl font-semibold text-foreground">Para qué usamos los datos</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>Operar la aplicación (registro de gastos, presupuestos, reportes y funcionalidades asociadas).</li>
          <li>Brindar soporte y resolver incidencias.</li>
          <li>Mejorar el producto, generar métricas agregadas y anonimizadas y desarrollar nuevas funcionalidades.</li>
          <li>Detectar uso indebido, fraude o actividades que afecten la seguridad del servicio.</li>
        </ul>

        <h2 className="text-xl font-semibold text-foreground">Acceso administrativo a los datos</h2>
        <p>
          El equipo de SpendPlan puede acceder a los datos de los usuarios únicamente para fines de operación, soporte,
          mantenimiento, mejora del servicio, resolución de incidentes o cumplimiento legal, bajo criterios de
          confidencialidad, necesidad y minimización de acceso.
        </p>

        <h2 className="text-xl font-semibold text-foreground">Con quién compartimos los datos</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>Proveedores necesarios para la operación del servicio (infraestructura, base de datos, correo), bajo acuerdos de confidencialidad y protección de datos.</li>
          <li>Autoridades competentes cuando la ley lo exija o para proteger derechos legales.</li>
          <li>No vendemos ni comercializamos datos personales.</li>
          <li>En caso de fusión, adquisición, venta de activos o reorganización, los datos podrán transferirse al nuevo responsable, manteniendo protección equivalente.</li>
        </ul>

        <h2 className="text-xl font-semibold text-foreground">Retención de datos y derechos del usuario</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>Conservamos los datos mientras mantengas una cuenta activa o sea necesario para el servicio.</li>
          <li>
            Puedes solicitar acceso, rectificación o eliminación escribiendo a{" "}
            <a className="underline" href="mailto:djorreto@spendplan.cl">
              djorreto@spendplan.cl
            </a>
            .
          </li>
          <li>Al eliminar una cuenta, los datos serán eliminados o anonimizados, salvo obligaciones legales o copias de respaldo temporales.</li>
        </ul>

        <h2 className="text-xl font-semibold text-foreground">Seguridad</h2>
        <p>
          Implementamos medidas razonables (cifrado en tránsito, controles de acceso). Ningún sistema es completamente
          seguro y no podemos garantizar seguridad absoluta.
        </p>

        <h2 className="text-xl font-semibold text-foreground">Cambios a esta política</h2>
        <p>
          Podemos actualizar esta Política de Privacidad. Si los cambios son materiales, solicitaremos nuevamente la
          aceptación del usuario.
        </p>
      </div>
    </div>
  )
}
