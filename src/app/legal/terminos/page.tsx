export default function TerminosPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12 space-y-6">
      <h1 className="text-3xl font-bold">Términos y Condiciones (v1.0)</h1>
      <p className="text-muted-foreground">
        Última actualización: 2025-12-17
      </p>
      <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
        <p>
          Bienvenido a SpendPlan. Al usar la aplicación aceptas estos Términos y Condiciones.
          Si no estás de acuerdo, no uses el servicio.
        </p>
        <h2 className="text-xl font-semibold text-foreground">Uso del servicio</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>El servicio es para uso personal y no garantizamos disponibilidad o exactitud absoluta.</li>
          <li>Eres responsable de la información que ingresas y de cumplir la normativa aplicable.</li>
          <li>Podemos actualizar estos Términos; te pediremos re-aceptación si hay cambios relevantes.</li>
        </ul>
        <h2 className="text-xl font-semibold text-foreground">Cuentas y seguridad</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>Debes proteger tus credenciales. No compartas tu contraseña.</li>
          <li>Podemos suspender o terminar el acceso ante uso indebido o incumplimiento.</li>
        </ul>
        <h2 className="text-xl font-semibold text-foreground">Contenido y propiedad</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>Los datos que ingresas siguen siendo tuyos; nos concedes licencia para operarlos y mejorar el servicio.</li>
          <li>Las marcas y el software de SpendPlan son propiedad de sus titulares.</li>
        </ul>
        <h2 className="text-xl font-semibold text-foreground">Limitación de responsabilidad</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>El servicio se ofrece “tal cual”. No somos responsables por daños indirectos o pérdida de datos.</li>
          <li>Usa la app como apoyo; las decisiones financieras son tuyas.</li>
        </ul>
        <h2 className="text-xl font-semibold text-foreground">Contacto</h2>
        <p>Para dudas o soporte: <a className="underline" href="mailto:djorreto@spendplan.cl">djorreto@spendplan.cl</a>.</p>
      </div>
    </div>
  )
}
