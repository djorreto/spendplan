-- ========================================
-- 📱 TELEGRAM: sesión conversacional (inactividad)
-- ========================================
-- Agrega tracking de última actividad para poder "reiniciar" UX
-- en el próximo mensaje si hubo silencio > N minutos.

ALTER TABLE IF EXISTS telegram_links
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_telegram_links_last_activity
  ON telegram_links (last_activity_at);

