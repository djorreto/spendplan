# 🚀 Guía de Deploy - SpendPlan

## Requisitos previos

1. **Cuenta de Supabase** - [supabase.com](https://supabase.com)
2. **Cuenta de Vercel** - [vercel.com](https://vercel.com)
3. **API Key de Groq** - [console.groq.com](https://console.groq.com) (gratis)
4. **Bot de Telegram** - Ya creado: @spendplan_cl_bot

---

## Paso 1: Configurar Supabase

### 1.1 Crear proyecto
1. Ve a [supabase.com/dashboard](https://supabase.com/dashboard)
2. Click "New Project"
3. Elige nombre y contraseña de base de datos
4. Espera que se cree (~2 min)

### 1.2 Ejecutar migraciones
1. Ve a **SQL Editor** en Supabase
2. Copia y ejecuta el contenido de `supabase/migrations/*.sql`
3. O usa Supabase CLI:
   ```bash
   supabase link --project-ref <tu-project-ref>
   supabase db push
   ```

### 1.3 Obtener credenciales
Ve a **Settings → API** y copia:
- `Project URL` → NEXT_PUBLIC_SUPABASE_URL
- `anon public` → NEXT_PUBLIC_SUPABASE_ANON_KEY
- `service_role` → SUPABASE_SERVICE_ROLE_KEY

---

## Paso 2: Deploy en Vercel

### 2.1 Conectar repositorio
1. Ve a [vercel.com/new](https://vercel.com/new)
2. Importa tu repositorio de GitHub
3. Selecciona el directorio `SpendPlan V1`

### 2.2 Configurar variables de entorno
En **Settings → Environment Variables**, agrega:

| Variable | Valor |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | https://xxx.supabase.co |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | eyJ... |
| `SUPABASE_SERVICE_ROLE_KEY` | eyJ... |
| `NEXT_PUBLIC_APP_URL` | https://tu-app.vercel.app |
| `NEXT_PUBLIC_APP_NAME` | SpendPlan |
| `GROQ_API_KEY` | gsk_... |
| `TELEGRAM_BOT_TOKEN` | 8230111347:AAH... |

### 2.3 Deploy
Click **Deploy** y espera (~2-3 min)

---

## Paso 3: Configurar Telegram Webhook

Después del deploy, ejecuta este comando para conectar el bot:

```bash
curl "https://api.telegram.org/bot8230111347:AAHUY9VAb1CLNOSCe9k8VnHD5LkM-mmbCWg/setWebhook?url=https://TU-APP.vercel.app/api/telegram/webhook"
```

Respuesta esperada:
```json
{"ok":true,"result":true,"description":"Webhook was set"}
```

---

## Paso 4: Verificar

1. **Web**: Abre tu URL de Vercel
2. **Telegram**: Envía `/start` a @spendplan_cl_bot
3. **IA**: Prueba el copiloto y OCR

---

## Variables de entorno (resumen)

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# App
NEXT_PUBLIC_APP_URL=https://tu-app.vercel.app
NEXT_PUBLIC_APP_NAME=SpendPlan

# IA (Groq - gratis)
GROQ_API_KEY=gsk_...

# Telegram
TELEGRAM_BOT_TOKEN=8230111347:AAHUY9VAb1CLNOSCe9k8VnHD5LkM-mmbCWg
```

---

## Troubleshooting

### Error: Supabase URL is required
- Verifica que las variables de Supabase estén configuradas en Vercel
- Haz redeploy después de agregar variables

### Telegram bot no responde
- Verifica que el webhook esté configurado con la URL correcta
- Revisa logs en Vercel Dashboard → Logs

### OCR no funciona
- El OCR usa tesseract.js en el navegador
- Funciona mejor en desktop que en móvil
- Si falla, usa ingreso manual

### IA no responde
- Verifica que GROQ_API_KEY esté configurado
- Revisa que no hayas excedido el límite gratuito de Groq

---

## Comandos útiles

```bash
# Verificar webhook de Telegram
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"

# Eliminar webhook (para desarrollo local)
curl "https://api.telegram.org/bot<TOKEN>/deleteWebhook"

# Probar build local
npm run build && npm start
```
