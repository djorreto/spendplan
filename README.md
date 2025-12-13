# 💰 SpendPlan

**Control de gastos del hogar simple, bonito e inteligente.**

SpendPlan es una aplicación web para presupuesto y seguimiento de gastos familiares. Permite registrar gastos manualmente, por Telegram, escaneando boletas con OCR, o importando cartolas bancarias, con categorización automática usando IA (Groq).

## ✨ Características

- 📊 **Dashboard visual** con gráficos de presupuesto vs real
- 💵 **Presupuesto mensual** - gastos fijos, variables e imprevistos
- 📱 **Registro de gastos** - manual, Telegram, OCR de boletas, CSV bancario
- 🤖 **IA Groq (gratis)** - categorización automática e insights
- 📷 **OCR de boletas** - escanea con la cámara del celular
- 💬 **Bot de Telegram** - registra gastos desde el chat
- 👨‍👩‍👧 **Multi-usuario** - invita a tu familia al hogar
- 🔒 **Seguro** - Row Level Security en Supabase
- 📈 **Copiloto financiero** - pregunta sobre tu presupuesto

## 🛠️ Stack Tecnológico

- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **UI**: shadcn/ui + Radix UI + Recharts
- **Backend**: Supabase (Auth, Postgres, Storage, Edge Functions)
- **AI**: Sistema de providers enchufable (Mock, Grok, OpenAI)

## 🚀 Inicio Rápido

### 1. Clonar el proyecto

```bash
git clone <repo-url>
cd SpendPlan\ V1
npm install
```

### 2. Configurar Supabase

1. Crea un proyecto en [Supabase](https://supabase.com)
2. Copia `env.example` a `.env.local`:

```bash
cp env.example .env.local
```

3. Completa las variables:

```env
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key
```

### 3. Ejecutar migraciones SQL

En **Supabase Dashboard > SQL Editor**, ejecuta en orden:

1. `database/migrations/001-spendplan-schema.sql` - Tablas e índices
2. `database/migrations/002-spendplan-rls.sql` - Políticas de seguridad
3. `database/migrations/003-spendplan-seeds.sql` - Categorías por defecto
4. `database/migrations/005-telegram-session.sql` - Sesión conversacional Telegram
5. `database/migrations/006-beta-allowlist.sql` - Beta privada (allowlist)
6. `database/migrations/007-beta-allowlist-rpc.sql` - RPC seguro (beta)

---

## 🔒 Beta privada (allowlist)

SpendPlan puede correr en **beta privada**, donde solo usuarios con email explícitamente invitado pueden registrarse y usar la app.

- **Agregar/quitar acceso**: En Supabase, agrega o elimina filas en `public.beta_allowlist` (emails en minúsculas).

```sql
insert into public.beta_allowlist (email) values ('tu@email.com');
```

- **Desactivar beta privada**: En variables de entorno (Vercel o `.env.local`), setea:

```env
BETA_MODE=false
```

### 4. Crear buckets de Storage

En **Supabase Dashboard > Storage**, crea:

- `receipts` (privado) - Para boletas y fotos

### 5. Ejecutar en desarrollo

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000)

---

## 🚀 Deploy a Vercel

### 1. Conectar repositorio

1. Sube el código a GitHub
2. Ve a [vercel.com](https://vercel.com) y conecta tu repo
3. Vercel detectará automáticamente que es Next.js

### 2. Configurar variables de entorno

En **Vercel > Settings > Environment Variables**, agrega:

| Variable | Valor | Requerido |
|----------|-------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Tu URL de Supabase | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Tu anon key de Supabase | ✅ |
| `NEXT_PUBLIC_APP_URL` | `https://tu-app.vercel.app` | ✅ |
| `NEXT_PUBLIC_APP_NAME` | `SpendPlan` | ✅ |
| `GROQ_API_KEY` | Tu API key de Groq | ✅ |
| `TELEGRAM_BOT_TOKEN` | Token de @BotFather | Opcional |

### 3. Deploy

Haz click en **Deploy**. Vercel construirá y desplegará automáticamente.

### 4. Configurar Telegram (opcional)

Después del deploy, ejecuta:

```bash
./scripts/setup-telegram-webhook.sh https://tu-app.vercel.app
```

O manualmente:

```bash
curl "https://api.telegram.org/bot<TU_TOKEN>/setWebhook?url=https://tu-app.vercel.app/api/telegram/webhook"
```

---

## 📁 Estructura del Proyecto

```
├── database/
│   └── migrations/          # SQL para Supabase
├── supabase/
│   └── functions/           # Edge Functions
│       └── whatsapp-webhook/
├── src/
│   ├── app/                 # Next.js App Router
│   │   ├── app/             # Rutas protegidas
│   │   │   ├── dashboard/
│   │   │   ├── budget/
│   │   │   ├── expenses/
│   │   │   ├── classify/
│   │   │   ├── import/
│   │   │   ├── insights/
│   │   │   └── settings/
│   │   ├── login/
│   │   ├── onboarding/
│   │   └── page.tsx         # Landing
│   ├── components/
│   │   ├── layout/          # Sidebar, Topbar
│   │   └── ui/              # shadcn components
│   ├── hooks/               # useAuth, useHousehold
│   ├── lib/
│   │   ├── ai/              # AI Providers
│   │   ├── supabase.ts
│   │   └── utils.ts
│   └── types/
└── package.json
```

## 🤖 Configuración de IA (Groq - Gratis)

SpendPlan usa **Groq** para IA, que es gratis y muy rápido.

### Obtener API Key

1. Ve a [console.groq.com](https://console.groq.com)
2. Crea una cuenta (gratis)
3. Genera una API key
4. Agrégala a `.env.local`:

```env
GROQ_API_KEY=gsk_tu-api-key-aqui
```

### Funcionalidades con IA

- **OCR de boletas** - Extrae monto, comercio, fecha automáticamente
- **Categorización** - Sugiere categorías para gastos
- **Copiloto financiero** - Responde preguntas sobre tu presupuesto
- **Insights** - Análisis mensual de tus finanzas
3. Ingresa tu API key

### Agregar nuevo provider

```typescript
// src/lib/ai/my-provider.ts
import type { AIProvider } from './types'

export class MyAIProvider implements AIProvider {
  name = 'my-provider'
  
  async categorize(input) { /* ... */ }
  async generateInsights(input) { /* ... */ }
  async extractFromImage(input) { /* ... */ }
  async parseMessage(input) { /* ... */ }
}

// Registrar en src/lib/ai/provider.ts
```

## 📱 Telegram Bot

Registra gastos y consulta tu presupuesto desde Telegram.

### Crear el bot

1. Abre Telegram y busca **@BotFather**
2. Envía `/newbot` y sigue las instrucciones
3. Guarda el token que te da (ej: `123456789:ABCdef...`)

### Configurar en SpendPlan

1. Agrega el token a `.env.local`:

```env
TELEGRAM_BOT_TOKEN=tu-token-de-botfather
```

2. Configura el webhook (en producción):

```bash
curl "https://api.telegram.org/bot<TU_TOKEN>/setWebhook?url=https://tu-app.vercel.app/api/telegram/webhook"
```

### Vincular tu cuenta

1. Ve a **Configuración > Integraciones > Telegram**
2. Genera un código de vinculación
3. En Telegram, busca **@spendplan_cl_bot**
4. Envía `/vincular CODIGO` al bot

### Comandos del bot

| Comando | Descripción |
|---------|-------------|
| 📸 Foto | Escanear boleta |
| `12990 en Jumbo` | Registrar gasto |
| `/confirmar` | Guardar gasto pendiente |
| `/cancelar` | Descartar gasto |
| `/estado` | Ver resumen del mes |
| `/ia ¿cómo voy?` | Consultar copiloto IA |
| `/ayuda` | Ver comandos |

---

## 📱 Configuración de WhatsApp

### 1. Crear app en Meta

1. Ve a [developers.facebook.com](https://developers.facebook.com)
2. Crea una app de tipo Business
3. Agrega el producto WhatsApp

### 2. Configurar webhook

1. Despliega la Edge Function:

```bash
supabase functions deploy whatsapp-webhook
```

2. Configura la URL del webhook en Meta:
   - URL: `https://<project>.supabase.co/functions/v1/whatsapp-webhook`
   - Verify Token: El que definas en `WHATSAPP_VERIFY_TOKEN`

3. Suscríbete a `messages`

### 3. Variables de entorno (Edge Function)

```bash
supabase secrets set WHATSAPP_VERIFY_TOKEN=tu-token-secreto
supabase secrets set WHATSAPP_ACCESS_TOKEN=tu-access-token
```

### 4. Vincular número al hogar

En Settings > Integraciones, ingresa el número de WhatsApp que envía mensajes.

### Formato de mensajes soportados

```
Jumbo 45.300 débito
Gasto 12.990 en Spotify
Shell 35000 crédito
```

## 📊 Importar CSV Bancario

1. Descarga tu cartola desde el banco (formato CSV)
2. Ve a **Importar** en la app
3. Sube el archivo
4. Mapea las columnas (fecha, monto, descripción)
5. Revisa y selecciona transacciones
6. Importa

Formatos de fecha soportados: `DD/MM/YYYY`, `DD-MM-YYYY`, `YYYY-MM-DD`

## 🔐 Seguridad

### Row Level Security (RLS)

Todas las tablas tienen políticas RLS que aseguran:

- Los usuarios solo ven datos de hogares donde son miembros
- Solo owners pueden modificar configuración del hogar
- Las API keys de IA se almacenan de forma segura

### Roles

- **Owner**: Puede editar hogar, invitar/remover miembros, configurar IA
- **Member**: Puede ver y registrar gastos

## 🧪 Scripts

```bash
npm run dev       # Desarrollo
npm run build     # Build producción
npm run start     # Servidor producción
npm run lint      # Lint
```

## 📸 OCR de Boletas (Nuevo)

SpendPlan ahora incluye **OCR local gratuito** para escanear boletas:

### Cómo usar

1. Ve a **Gastos** y haz clic en **"Escanear Boleta"**
2. Toma una foto o sube una imagen de tu boleta
3. El OCR extrae automáticamente:
   - Monto total
   - Fecha de compra
   - Nombre del comercio
4. Revisa y confirma los datos
5. (Opcional) Haz clic en **"Analizar con Grok"** para mejorar la extracción

### Tecnología

- **Tesseract.js** - OCR local en el navegador (gratuito)
- **Grok AI** - Análisis opcional del texto OCR (requiere API key)
- Reglas de extracción optimizadas para boletas chilenas

### Tips para mejor OCR

- Usa buena iluminación
- Evita sombras y reflejos
- Centra la boleta en la foto
- Funciona mejor con boletas impresas (no manuscritas)

## 🤖 Copiloto Financiero (Nuevo)

Un chat interactivo para analizar tus finanzas:

### Cómo usar

1. Haz clic en el **botón flotante** (💬) en la esquina inferior derecha
2. Escribe tu pregunta o usa las sugerencias rápidas
3. El copiloto analiza tu data y responde

### Preguntas que puedes hacer

- "¿Cómo vamos este mes?"
- "¿Cuánto queda disponible?"
- "¿Dónde me pasé del presupuesto?"
- "¿Qué gastos no están categorizados?"
- "Dame recomendaciones para mejorar"

### Modos

- **Demo**: Respuestas basadas en reglas (sin API key)
- **Grok**: Análisis con IA real (requiere API key)

### Importante

- El copiloto **solo analiza texto**, nunca imágenes
- Se activa **solo cuando el usuario lo solicita**
- No es un proceso automático en background

## 🔑 Configuración de Groq AI (Gratis)

Para habilitar las funciones de IA:

1. **Obtén tu API key gratis** en [console.groq.com](https://console.groq.com)
2. Ve a **Insights > ⚙️ Configuración**
3. Ingresa tu API key (empieza con `gsk_...`)
4. La key se guarda localmente en tu navegador

Funciones que usan Groq:
- Análisis de texto OCR
- Copiloto financiero
- Generación de Insights

### ¿Por qué Groq?

- **100% Gratis** - Tier gratuito generoso
- **Muy rápido** - Inferencia optimizada
- **Llama 3.3 70B** - Modelo potente
- **Compatible con OpenAI API** - Fácil de integrar

## 📋 Funcionalidades

- [x] Landing page
- [x] Autenticación (login/signup)
- [x] Onboarding (crear hogar)
- [x] Resumen con estado del mes
- [x] Presupuesto mensual (fijos, variables, no presupuestados)
- [x] Balance estilo "estado de resultados"
- [x] Registro de gastos
- [x] **OCR de boletas local (Tesseract.js)**
- [x] **Copiloto financiero interactivo**
- [x] Clasificación con reglas
- [x] Sugerencias con IA
- [x] Importación CSV
- [x] **Insights con Grok AI**
- [x] Settings y configuración
- [x] WhatsApp webhook (Edge Function)
- [x] Multi-usuario por hogar
- [x] Sistema de AI providers
- [x] Logs de interacciones AI

## 📝 Próximos pasos

- [ ] Notificaciones push
- [ ] App móvil (React Native)
- [ ] Open Banking (conexión directa con bancos)
- [ ] Metas de ahorro
- [ ] Exportar reportes PDF

## 📄 Licencia

MIT - Usa este proyecto libremente.

---

**¿Preguntas?** Abre un issue o contacta al equipo.
