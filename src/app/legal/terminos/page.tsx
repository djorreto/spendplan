export default function TerminosPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12 space-y-6">
      <h1 className="text-3xl font-bold">Términos y Condiciones (v1.1)</h1>
      <p className="text-muted-foreground">
        Última actualización: 2025-12-17
      </p>
      <p className="text-sm text-muted-foreground">
        Versión PDF:{" "}
        <a
          className="underline"
          href="https://soghkhyleaknrmcqmubb.supabase.co/storage/v1/object/public/assets/Terminos%20y%20Condiciones%20(v1.1)%2020251217%20%20.pdf"
          target="_blank"
          rel="noreferrer"
        >
          Descargar Términos y Condiciones (v1.1)
        </a>
      </p>
      <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
        <p>
          Bienvenido a SpendPlan. Al usar la aplicación, aceptas estos Términos y Condiciones.
          Si no estás de acuerdo, no utilices el servicio. Estos términos se rigen por las leyes de la República de Chile.
        </p>

        <h2 className="text-xl font-semibold text-foreground">Uso del servicio</h2>
        <p>SpendPlan es una aplicación de apoyo para la gestión de gastos y presupuestos personales.</p>
        <ul className="list-disc pl-5 space-y-2">
          <li>El servicio se ofrece “tal cual”; no garantizamos disponibilidad continua ni exactitud absoluta.</li>
          <li>SpendPlan no constituye asesoría financiera, contable ni legal; las decisiones son responsabilidad del usuario.</li>
          <li>El usuario es responsable de la información que ingresa y de cumplir la normativa aplicable.</li>
        </ul>

        <h2 className="text-xl font-semibold text-foreground">Cuentas y seguridad</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>El usuario es responsable de proteger sus credenciales y no compartir su contraseña.</li>
          <li>Podemos suspender o terminar el acceso ante uso indebido, incumplimiento o riesgos para la plataforma.</li>
        </ul>

        <h2 className="text-xl font-semibold text-foreground">Contenido y propiedad</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>Los datos ingresados por el usuario siguen siendo de su propiedad.</li>
          <li>
            El usuario concede a SpendPlan una licencia limitada, no exclusiva y gratuita, solo para operar, mantener
            y mejorar el servicio.
          </li>
          <li>
            “SpendPlan” es un nombre comercial en uso; la titularidad de marcas, dominios o denominaciones puede
            cambiar sin afectar la continuidad del servicio.
          </li>
          <li>El software, diseño y demás elementos de la plataforma son propiedad de sus respectivos titulares.</li>
        </ul>

        <h2 className="text-xl font-semibold text-foreground">Proyecto en desarrollo</h2>
        <p>SpendPlan es un producto en desarrollo.</p>
        <ul className="list-disc pl-5 space-y-2">
          <li>Podemos modificar, suspender, discontinuar o transferir el servicio, total o parcialmente, en cualquier momento.</li>
        </ul>

        <h2 className="text-xl font-semibold text-foreground">Limitación de responsabilidad</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>El uso del servicio es bajo responsabilidad del usuario.</li>
          <li>
            SpendPlan no será responsable por daños indirectos, incidentales, pérdida de datos o decisiones tomadas con base
            en la información de la aplicación.
          </li>
          <li>
            La responsabilidad total, en caso de existir, no excederá el monto efectivamente pagado por el usuario por el
            servicio, si lo hubiere.
          </li>
        </ul>

        <h2 className="text-xl font-semibold text-foreground">Contacto</h2>
        <p>
          Para dudas o soporte:{" "}
          <a className="underline" href="mailto:djorreto@spendplan.cl">
            djorreto@spendplan.cl
          </a>
          .
        </p>
      </div>
    </div>
  )
}
