#!/bin/bash
# ========================================
# Setup Telegram Webhook for Production
# ========================================
# Uso: ./scripts/setup-telegram-webhook.sh <URL_DE_TU_APP>
# Ejemplo: ./scripts/setup-telegram-webhook.sh https://spendplan.vercel.app

if [ -z "$1" ]; then
    echo "❌ Error: Debes proporcionar la URL de tu app"
    echo ""
    echo "Uso: ./scripts/setup-telegram-webhook.sh <URL_DE_TU_APP>"
    echo "Ejemplo: ./scripts/setup-telegram-webhook.sh https://spendplan.vercel.app"
    exit 1
fi

APP_URL=$1
WEBHOOK_URL="${APP_URL}/api/telegram/webhook"

# Cargar token desde .env.local si existe
if [ -f .env.local ]; then
    export $(cat .env.local | grep TELEGRAM_BOT_TOKEN | xargs)
fi

if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
    echo "❌ Error: TELEGRAM_BOT_TOKEN no está configurado"
    echo ""
    echo "Configúralo en .env.local o como variable de entorno:"
    echo "export TELEGRAM_BOT_TOKEN=tu-token"
    exit 1
fi

echo "🔧 Configurando webhook de Telegram..."
echo "   URL: $WEBHOOK_URL"
echo ""

# Configurar webhook
RESPONSE=$(curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook?url=${WEBHOOK_URL}")

if echo "$RESPONSE" | grep -q '"ok":true'; then
    echo "✅ Webhook configurado correctamente!"
    echo ""
    echo "📱 Bot: @spendplan_cl_bot"
    echo "🔗 Webhook: $WEBHOOK_URL"
else
    echo "❌ Error al configurar webhook:"
    echo "$RESPONSE"
    exit 1
fi

# Verificar info del webhook
echo ""
echo "📊 Estado del webhook:"
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo" | python3 -m json.tool 2>/dev/null || curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"
