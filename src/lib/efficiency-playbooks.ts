export const EFFICIENCY_TOPICS = [
  'internet',
  'water',
  'gas',
  'electricity',
  'supermarket',
  'restaurants',
  'delivery',
  'streaming',
  'transport',
  'other',
] as const

export type EfficiencyTopic = (typeof EFFICIENCY_TOPICS)[number]

export type EfficiencyTopicMeta = {
  id: EfficiencyTopic
  label: string
  blurb: string
}

export const EFFICIENCY_TOPIC_META: EfficiencyTopicMeta[] = [
  { id: 'internet', label: 'Internet / TV', blurb: 'Comparar fibra y cortar el pack caro' },
  { id: 'supermarket', label: 'Supermercado', blurb: 'Lista, una compra grande, menos relleno' },
  { id: 'delivery', label: 'Delivery', blurb: 'Bajar apps y markup' },
  { id: 'restaurants', label: 'Restoranes', blurb: 'Tope de salidas y menú' },
  { id: 'electricity', label: 'Luz', blurb: 'Horario, hábitos y tarifa' },
  { id: 'water', label: 'Agua', blurb: 'Filtraciones, jardín y ducha' },
  { id: 'gas', label: 'Gas', blurb: 'Agua caliente y calefacción' },
  { id: 'streaming', label: 'Streaming', blurb: 'Dejar una o dos plataformas' },
  { id: 'transport', label: 'Uber / taxis', blurb: 'Juntar recados y recortar flojera' },
]

export type MarketOffer = {
  provider: string
  plan: string
  promoPrice: number
  promoMonths: number
  regularPrice: number
  speedMbps?: number
  includesTv?: boolean
  notes: string
  contractUrl: string
  salesPhone?: string
}

export type ContactChannel = {
  name: string
  phone?: string
  url?: string
  when: string
}

export type EfficiencyPlaybook = {
  topic: EfficiencyTopic
  marketUpdated: string
  marketSource: string
  questions: string[]
  offers: MarketOffer[]
  whoToCall: ContactChannel[]
  cancelSteps: string[]
  habits: string[]
  sizing: string[]
}

export const MARKET_AS_OF = '2026-08-30'

export const INTERNET_PLAYBOOK: EfficiencyPlaybook = {
  topic: 'internet',
  marketUpdated: MARKET_AS_OF,
  marketSource:
    'Comparaiso.cl (actualizado 30 jun 2026) + sitios WOM, Movistar y GTD (promos agosto 2026). Precios de lista web; hay que chequear factibilidad en la dirección.',
  questions: [
    '¿Cuántas personas viven y cuántos usan internet a la vez (teletrabajo, streaming, juegos)?',
    '¿Hoy es pack TV+internet de cable (VTR u otro) o solo internet? ¿Usan el pack de TV?',
    '¿Comuna y si el edificio/casa ya tiene fibra (Mundo, GTD, WOM, Movistar)?',
    '¿Hay permanencia o equipos en comodato? ¿La boleta dice el plan y los Mbps?',
  ],
  offers: [
    {
      provider: 'WOM',
      plan: 'Fibra 600 Mbps',
      promoPrice: 11990,
      promoMonths: 12,
      regularPrice: 21990,
      speedMbps: 600,
      notes: 'Oferta flash web agosto 2026. Instalación a menudo incluida. Wifi 6. Verificar cobertura.',
      contractUrl: 'https://store.wom.cl/hogar/internet-fibra-optica',
      salesPhone: '*3000 o sucursal WOM Hogar',
    },
    {
      provider: 'WOM',
      plan: 'Fibra 800 Mbps',
      promoPrice: 14990,
      promoMonths: 12,
      regularPrice: 24990,
      speedMbps: 800,
      notes: 'Para 3–4 personas con streaming y teletrabajo a la vez.',
      contractUrl: 'https://store.wom.cl/hogar/internet-fibra-optica',
      salesPhone: '*3000 o sucursal WOM Hogar',
    },
    {
      provider: 'Movistar',
      plan: 'Fibra 600 Mbps',
      promoPrice: 14990,
      promoMonths: 12,
      regularPrice: 22990,
      speedMbps: 600,
      notes: 'Promo web agosto 2026. Instalación a menudo $0 contratando online (valor normal ~$24.990).',
      contractUrl: 'https://www.movistar.cl/hogar/internet',
      salesPhone: '600 600 3000',
    },
    {
      provider: 'Movistar',
      plan: 'Fibra 800 Mbps',
      promoPrice: 15990,
      promoMonths: 12,
      regularPrice: 24990,
      speedMbps: 800,
      notes: 'Algunas promos web incluyen streaming por tiempo limitado. Preguntar precio del mes 13.',
      contractUrl: 'https://www.movistar.cl/hogar/internet',
      salesPhone: '600 600 3000',
    },
    {
      provider: 'GTD',
      plan: 'Fibra 600 Mbps',
      promoPrice: 15990,
      promoMonths: 12,
      regularPrice: 25990,
      speedMbps: 600,
      notes: 'Vigencia publicada 1–31 ago 2026 para nuevas contrataciones. Buena opción si ya hay GTD en el barrio.',
      contractUrl: 'https://www.gtd.cl/hogar/productos-hogar-internet-fibra',
      salesPhone: '600 600 1300',
    },
    {
      provider: 'Mundo',
      plan: 'Fibra 800 Mbps',
      promoPrice: 15990,
      promoMonths: 12,
      regularPrice: 25990,
      speedMbps: 800,
      notes: 'Suele ser competitiva en velocidad. Mundo Go! (TV/streaming) sube el plan a ~$25.990: evítalo si no lo van a usar.',
      contractUrl: 'https://www.mundo.cl',
      salesPhone: '600 500 0050',
    },
    {
      provider: 'VTR',
      plan: 'Fibra Hogar 600 Mbps (solo internet)',
      promoPrice: 14990,
      promoMonths: 12,
      regularPrice: 24990,
      speedMbps: 600,
      notes: 'Si ya son de VTR, a veces conviene renegociar a solo fibra y soltar TV. El pack TV+cable es lo que infla la boleta.',
      contractUrl: 'https://www.vtr.com',
      salesPhone: '600 800 9000',
    },
  ],
  whoToCall: [
    {
      name: 'WOM Hogar',
      phone: '*3000',
      url: 'https://store.wom.cl/hogar/internet-fibra-optica',
      when: 'Para cotizar y pedir factibilidad. Contrata por web si hay oferta flash.',
    },
    {
      name: 'Movistar Hogar',
      phone: '600 600 3000',
      url: 'https://www.movistar.cl/hogar/internet',
      when: 'Factibilidad + instalación. Pide el precio del mes 13 por escrito.',
    },
    {
      name: 'GTD',
      phone: '600 600 1300',
      url: 'https://www.gtd.cl/hogar/productos-hogar-internet-fibra',
      when: 'Si en el edificio ya hay GTD, suele instalar más rápido.',
    },
    {
      name: 'Mundo',
      phone: '600 500 0050',
      url: 'https://www.mundo.cl',
      when: 'Buena si quieren 800 Mbps sin pack de TV.',
    },
    {
      name: 'VTR (retención o baja)',
      phone: '600 800 9000',
      url: 'https://www.vtr.com',
      when: 'Primero pide retención: “me cambio a fibra de $15 mil”. Si no bajan, da de baja.',
    },
    {
      name: 'SERNAC Me Quiero Salir',
      url: 'https://www.sernac.cl/portal/617/w3-article-58403.html',
      when: 'Si VTR/otro no da de baja el internet o la TV. ClaveÚnica. La empresa tiene 1 día hábil para terminar el contrato.',
    },
  ],
  cancelSteps: [
    'Anota en la boleta: RUT del titular, número de cliente, plan y si hay permanencia o equipos en comodato.',
    'Contrata primero el plan nuevo y pide fecha de instalación. No dejes al hogar un fin de semana sin internet.',
    'El día que instalan la fibra nueva, llama a VTR al 600 800 9000 (24/7) o usa la sucursal virtual y pide término de internet y TV. Exige número de requerimiento y mail de confirmación.',
    'Si el pack incluye teléfono fijo y te lo quieres llevar, la portabilidad la pide la compañía NUEVA. El internet/TV se dan de baja aparte.',
    'Devuelve decodificadores y módem. Si no los entregan, te los cobran.',
    'Si no contestan o te retienen, entra a Me Quiero Salir (SERNAC) con ClaveÚnica: https://www.sernac.cl/portal/617/w3-article-58403.html',
    'Revisa la siguiente boleta: a veces cobran un mes proporcional o el mes 13 del plan antiguo. Reclama si aparece el pack completo.',
  ],
  habits: [
    'Una familia de 3–4 con teletrabajo y streaming 4K está bien con 600–800 Mbps simétricos. 940+ es lujo, no necesidad.',
    'Si nadie mira el cable, el pack TV es el primer recorte. Zapping o una app sale más barato que el pack.',
    'Pide siempre el precio DESPUÉS de la promo. Un plan de $11.990 que pasa a $21.990 al mes 13 hay que anotarlo.',
    'Antes de cambiarte, llama a retención del actual: a veces igualan. Si igualan, pide el nuevo precio por escrito.',
  ],
  sizing: [
    '1–2 personas, mail y Netflix: 500–600 Mbps.',
    '3–4 personas, teletrabajo + 2 streaming: 600–800 Mbps.',
    'Casa grande, muchas pantallas o smart home: 800–940 Mbps.',
  ],
}

const WATER_PLAYBOOK: EfficiencyPlaybook = {
  topic: 'water',
  marketUpdated: MARKET_AS_OF,
  marketSource: 'Hábitos residenciales Chile (Aguas Andinas / SISS). No hay “plan más barato”: se baja el m³.',
  questions: [
    '¿Cuántas personas y hay jardín, piscina o riego automático?',
    '¿La boleta viene muy por sobre el promedio de invierno? ¿Han tenido filtración o estanque que pierde?',
    '¿Duchas largas, lavadora todos los días, riego al mediodía?',
  ],
  offers: [],
  whoToCall: [
    {
      name: 'Solicitar lectura / filtración (sanitaria de tu comuna)',
      when: 'El número está en la boleta (Aguas Andinas, Esval, Essbio, etc.). Pide revisión de medidor si el salto fue brusco.',
    },
    {
      name: 'Aguas Andinas (RM)',
      phone: '600 386 8000',
      url: 'https://www.aguasandinas.cl',
      when: 'Si son clientes RM: denunciar fuga en la calle o pedir consejo de consumo.',
    },
  ],
  cancelSteps: [
    'Acá no se “cambia de compañía” de agua. El ahorro es consumo y cazar fugas.',
    'Si el medidor está malo, reclama en la sanitaria de la boleta y, si no pescan, SERNAC.',
  ],
  habits: [
    'Una ducha de 10 minutos vs 5 puede ser el mayor gasto de agua caliente + agua.',
    'Riego: madrugada o noche, 2–3 veces por semana en verano, no todos los días a las 14:00.',
    'Revisa estanque del WC (colorante en el estanque: si pasa al bowl sin tirar, pierde).',
    'Lavadora: cargas llenas. Lavavajillas lleno, no “solo enjuague”.',
    'Si hay jardín grande, el riego se come la boleta: temporizador y aspersores que no mojen la vereda.',
  ],
  sizing: [
    'Depto 2–3 personas sin jardín: boleta chica. Si está alta, busca fuga.',
    'Casa con jardín y 3–4 personas: el riego es el primer recorte, no las duchas solas.',
  ],
}

const GAS_PLAYBOOK: EfficiencyPlaybook = {
  topic: 'gas',
  marketUpdated: MARKET_AS_OF,
  marketSource: 'Hábitos + Metrogas / Abastible / Gasco. El “plan” es medidor vs cilindro y cómo calientas agua.',
  questions: [
    '¿Gas de cañería (Metrogas) o cilindro (Gasco/Abastible/Lipigas)?',
    '¿Calefón, caldera o termo eléctrico? ¿Calefacción a gas en invierno?',
    '¿Cuántas duchas al día y de cuántos minutos?',
  ],
  offers: [],
  whoToCall: [
    { name: 'Metrogas', phone: '600 337 4000', url: 'https://www.metrogas.cl', when: 'Boleta, lectura, o si quieren revisar caldera.' },
    { name: 'Abastible / Gasco / Lipigas', when: 'Si es cilindro: compara el precio del kilo esa semana y pide despacho programado, no de urgencia.' },
  ],
  cancelSteps: [
    'No conviene “cambiarse” de Metrogas si ya hay red. El ahorro es hábito y mantenimiento de calefón/caldera.',
    'Si es cilindro, cotiza las 3 marcas el mismo día: el precio del kilo se mueve.',
  ],
  habits: [
    'Baja 1–2 °C la calefacción: se nota en la boleta y casi no en el confort.',
    'Ducha: 5–7 minutos. El agua caliente es gas + agua.',
    'No dejes el calefón “de visita” eterno si nadie se está duchando.',
    'Mantención anual del calefón/caldera: un equipo sucio gasta más.',
    'En invierno cierra puertas y usa burletes antes de subir la calefacción.',
  ],
  sizing: [
    'Depto sin calefacción a gas: el gasto grande es ducha y cocina.',
    'Casa con caldera y radiadores: el invierno es el 70% de la boleta. Ahí se recorta.',
  ],
}

const ELECTRICITY_PLAYBOOK: EfficiencyPlaybook = {
  topic: 'electricity',
  marketUpdated: MARKET_AS_OF,
  marketSource: 'Hábitos residenciales + Enel/CGE/Chilquinta. La tarifa regulada no se “cambia de plan” como el internet; se baja kWh y se mira opción horaria si existe.',
  questions: [
    '¿Distribuidora (Enel, CGE, Chilquinta, Saesa) y si la casa tiene aire, piscina, secadora o calefacción eléctrica?',
    '¿La boleta sube mucho en invierno o en verano (aire)?',
    '¿Dejan luces, PC y cargadores 24/7? ¿Secadora vs tendedero?',
  ],
  offers: [],
  whoToCall: [
    { name: 'Enel (RM)', phone: '600 696 0000', url: 'https://www.enel.cl', when: 'Boleta, medidor, o preguntar si aplica tarifa con horario.' },
    { name: 'CGE', phone: '600 777 7777', url: 'https://www.cge.cl', when: 'Si la boleta es CGE.' },
    { name: 'El número de TU boleta', when: 'Siempre manda el de la cuenta. Pide desglose si el salto fue raro (medidor).' },
  ],
  cancelSteps: [
    'No hay portabilidad eléctrica residencial barata tipo telecomunicaciones. El recorte es kWh y artefactos.',
    'Si el medidor está malo o hay un cargo raro, reclama a la distribuidora y después SEC/SERNAC.',
  ],
  habits: [
    'Secadora y lavavajillas: ciclo lleno, no media carga. Tendedero cuando el clima deja.',
    'Aire: 24 °C en verano, puertas cerradas, filtro limpio. Cada grado menos se paga.',
    'LED en todo. Apaga el termo eléctrico si también hay gas (no calientes agua dos veces).',
    'Modo ahorro en TV, consolas y PC. El “standby” de muchos equipos se nota a fin de mes.',
    'Piscina/bomba: temporizador, no 24 horas.',
  ],
  sizing: [
    'Depto 2–3 personas sin aire: si la boleta es alta, caza el termo o un equipo que quedó prendido.',
    'Casa con aire + secadora + jardín: esos tres son el plan de ataque, no “apagar una ampolleta”.',
  ],
}

const SUPERMARKET_PLAYBOOK: EfficiencyPlaybook = {
  topic: 'supermarket',
  marketUpdated: MARKET_AS_OF,
  marketSource: 'Buenas prácticas de compra en Chile (Lider, Unimarc, Jumbo, Tottus, Santa Isabel) + ticket del hogar.',
  questions: [
    '¿Cuántas personas comen en la casa (adultos y niños) y cuántas veces piden delivery en la semana?',
    '¿Van al súper cuántas veces por semana? ¿Con lista o “a ver qué hay”?',
    '¿Compran marca propia o siempre marca cara? ¿Hay dieta especial?',
  ],
  offers: [],
  whoToCall: [
    {
      name: 'Una compra grande semanal',
      when: 'Elige UN local (Unimarc/Lider/Tottus según barrio). Mismo día, misma hora, con lista. No “pasar a comprar el yogur”.',
    },
  ],
  cancelSteps: [
    'Baja Cornershop / Jumbo Prime / Uber Eats súper para el diario. El markup y el envío se comen el ahorro.',
    'Deja la app solo para el faltante puntual, no para la compra de la semana.',
  ],
  habits: [
    'Domingo o un día fijo: menú de 5–6 comidas + lista por pasillo. No entres con hambre.',
    'Proteína + verdura + carbo + desayuno. Marca propia en lácteos, limpieza y conservas.',
    'Evita gondola de punta, “2x1” que no ibas a comprar, y el pasillo de galletas con cabro chico suelto.',
    'Precio por kg/litro, no por envase. El pack grande solo si se consume.',
    'Máximo 1 visita de relleno a la semana (pan, verdura de hoja). El resto ya está en la casa.',
    'Si piden delivery 2+ veces por semana, el súper “alto” a veces es el síntoma: están pagando comida dos veces.',
  ],
  sizing: [
    '2 adultos: una compra semanal chica + verdura a mitad de semana.',
    '2 adultos + 1 niño: proteína para 5 cenas, colaciones del jardín/colegio, menos snacks de impulso.',
    '4+ personas: dos carros grandes al mes salen más caros que uno bien armado + reposición de fresco. Congela porciones.',
  ],
}

const RESTAURANTS_PLAYBOOK: EfficiencyPlaybook = {
  topic: 'restaurants',
  marketUpdated: MARKET_AS_OF,
  marketSource: 'Hábitos de salida en Chile. El recorte es tope de veces, no “el restorán más barato”.',
  questions: [
    '¿Cuántas salidas a restorán al mes y de qué tipo (almuerzo menú vs cena con copas)?',
    '¿Es ocio de fin de semana, almuerzo de trabajo, o “no había nada en la casa”?',
    '¿Van en 2 o en familia? ¿Hay un tope mental hoy?',
  ],
  offers: [],
  whoToCall: [],
  cancelSteps: ['No hay contrato que cortar. El contrato es el hábito: un tope al mes y el resto se cocina.'],
  habits: [
    'Tope: 2 cenas afuera al mes si el mes está apretado; el almuerzo menú es más barato que la cena.',
    'Si el motivo es “no había comida”, el arreglo es el súper + meal prep, no otro restorán.',
    'Agua de la casa, no bebida por persona. Eso solo ya baja la cuenta.',
    'Junta cumpleaños: una salida buena > tres salidas mediocres.',
  ],
  sizing: [
    'Pareja: 2 restoranes + 2 delivery al mes es un presupuesto consciente.',
    'Familia con niño: restorán de día / menú, no cena larga entre semana.',
  ],
}

const DELIVERY_PLAYBOOK: EfficiencyPlaybook = {
  topic: 'delivery',
  marketUpdated: MARKET_AS_OF,
  marketSource: 'Uber Eats, PedidosYa, Rappi en Chile: markup + envío + servicio. El ahorro es frecuencia.',
  questions: [
    '¿Cuántos pedidos a la semana y en qué horario (almuerzo, cena, fin de semana)?',
    '¿Hay suscripción (Eats Pass / PedidosYa Plus) que “justifica” pedir más?',
    '¿El motivo es cansancio, no hay comida, o antojo?',
  ],
  offers: [],
  whoToCall: [
    { name: 'Cancelar Eats Pass / PedidosYa Plus', when: 'En la app → suscripciones. Si pides menos de 4 veces al mes, la suscripción no se paga sola.' },
  ],
  cancelSteps: [
    'Baja la frecuencia a un tope (ej. 4 al mes). Borra la tarjeta de la app o saca el ícono de la pantalla de inicio.',
    'Cancela el pass si no lo usas lo suficiente.',
  ],
  habits: [
    'El markup de la app + envío suele ser 25–40% sobre el local. Cocinar 1 noche extra es el recorte más limpio.',
    'Si piden porque no hay comida, arma 2 cenas congeladas el domingo.',
    'Junta el antojo al viernes. El pedido del martes a las 21:00 es el caro “por flojera”.',
  ],
  sizing: [
    '1–2 pedidos/semana ya es un ítem de presupuesto. 4+ es fuga.',
  ],
}

const STREAMING_PLAYBOOK: EfficiencyPlaybook = {
  topic: 'streaming',
  marketUpdated: MARKET_AS_OF,
  marketSource: 'Precios de lista Netflix, Disney, Max, Prime, Zapping, Spotify en Chile (orden de magnitud 2026).',
  questions: [
    '¿Qué plataformas pagan hoy y quién las usa de verdad este mes?',
    '¿Zapping o pack de TV del cable duplica lo mismo?',
    '¿Cuentas compartidas fuera del hogar que ya no corresponden?',
  ],
  offers: [],
  whoToCall: [
    { name: 'Cancelar en cada app', when: 'Cuenta → suscripción. Cancela 3 días antes del próximo cobro para no perder el mes pagado.' },
  ],
  cancelSteps: [
    'Deja 1 video + 1 música. Rota la otra cada 2–3 meses (una temporada).',
    'Si tienen pack TV del cable + Zapping + Netflix, suelta el pack del cable primero.',
  ],
  habits: [
    'Casi nadie usa 4 plataformas el mismo mes. El ahorro es rotar, no “por si acaso”.',
    'Mira el cargo en Gastos: si no hubo uso, córtalo este mes.',
  ],
  sizing: ['Casa con niños: a veces Disney o YouTube Premium rinde más que un tercer Netflix.'],
}

const TRANSPORT_PLAYBOOK: EfficiencyPlaybook = {
  topic: 'transport',
  marketUpdated: MARKET_AS_OF,
  marketSource: 'Uber / DiDi / Cabify en Santiago. El recorte es viajes de flojera, no el viaje necesario.',
  questions: [
    '¿Cuántos viajes al mes y para qué (trabajo, colegio, salidas, “no me dio el ánimo de micro”)?',
    '¿Hay auto en la casa? ¿Metro/micro viable en esos tramos?',
    '¿Viajes cortos de $4–8 mil que se pueden juntar?',
  ],
  offers: [],
  whoToCall: [],
  cancelSteps: ['No hay contrato. Baja la frecuencia y junta recados en un solo viaje.'],
  habits: [
    'Junta 2–3 recados en un viaje. El viaje de ida “solo a dejar una cosa” es el caro.',
    'Deja 2–3 viajes de flojera al mes como tope consciente, no como default.',
    'Si es el tramo al colegio/jardín, evalúa si 2 días de Uber se reemplazan por un acuerdo fijo más barato.',
  ],
  sizing: ['1 adulto al trabajo en Uber diario es un segundo pasaje de oficina: ahí sí cotiza mensualidad o auto compartido.'],
}

const OTHER_PLAYBOOK: EfficiencyPlaybook = {
  topic: 'other',
  marketUpdated: MARKET_AS_OF,
  marketSource: 'Diagnóstico con los gastos del hogar.',
  questions: [
    '¿Qué gasto quieres bajar y por qué ahora?',
    '¿Es un contrato (se puede cambiar de proveedor) o un hábito (se baja la frecuencia)?',
  ],
  offers: [],
  whoToCall: [],
  cancelSteps: [],
  habits: ['Separa precio (mismo servicio más barato) de demanda (pedir menos).'],
  sizing: [],
}

const PLAYBOOKS: Record<EfficiencyTopic, EfficiencyPlaybook> = {
  internet: INTERNET_PLAYBOOK,
  water: WATER_PLAYBOOK,
  gas: GAS_PLAYBOOK,
  electricity: ELECTRICITY_PLAYBOOK,
  supermarket: SUPERMARKET_PLAYBOOK,
  restaurants: RESTAURANTS_PLAYBOOK,
  delivery: DELIVERY_PLAYBOOK,
  streaming: STREAMING_PLAYBOOK,
  transport: TRANSPORT_PLAYBOOK,
  other: OTHER_PLAYBOOK,
}

export function getEfficiencyPlaybook(topic: EfficiencyTopic): EfficiencyPlaybook {
  return PLAYBOOKS[topic] || OTHER_PLAYBOOK
}

export function isEfficiencyTopic(value: string): value is EfficiencyTopic {
  return (EFFICIENCY_TOPICS as readonly string[]).includes(value)
}

function fold(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function resolveEfficiencyTopic(input: {
  opportunityId?: string | null
  group?: string | null
  merchant?: string | null
  category?: string | null
  text?: string | null
}): EfficiencyTopic {
  const id = input.opportunityId || ''
  if (id.includes('vtr') || id.includes('internet') || id.includes('telecom')) return 'internet'
  if (id.includes('supermarket') || id.includes('super')) return 'supermarket'
  if (id.includes('delivery')) return 'delivery'
  if (id.includes('streaming')) return 'streaming'
  if (id.includes('taxi') || id.includes('uber') || id.includes('transport')) return 'transport'
  if (id.includes('water') || id.includes('agua')) return 'water'
  if (id.includes('electric') || id.includes('luz')) return 'electricity'
  if (id.includes('gas')) return 'gas'
  if (id.includes('restaurant') || id.includes('food')) return 'restaurants'

  const blob = fold([input.group, input.merchant, input.category, input.text].filter(Boolean).join(' '))
  if (/\bvtr\b|fibra|mundo\b|gtd\b|movistar|wom|internet|cable/.test(blob)) return 'internet'
  if (/aguas andinas|esval|essbio|\bagua\b/.test(blob)) return 'water'
  if (/metrogas|abastible|gasco|lipigas|\bgas\b/.test(blob)) return 'gas'
  if (/enel|cge|chilectra|chilquinta|\bluz\b|electric/.test(blob)) return 'electricity'
  if (/uber\s*eats|rappi|pedidos\s*ya|cornershop|delivery/.test(blob)) return 'delivery'
  if (/jumbo|lider|unimarc|tottus|santa isabel|supermercado/.test(blob)) return 'supermarket'
  if (/netflix|disney|zapping|spotify|prime|max\b|streaming/.test(blob)) return 'streaming'
  if (/\buber\b|cabify|\bdidi\b|taxi/.test(blob)) return 'transport'
  if (/restaurant|restoran|restorán/.test(blob)) return 'restaurants'
  if (fold(input.group || '') === 'alimentacion') return 'supermarket'
  return 'other'
}
