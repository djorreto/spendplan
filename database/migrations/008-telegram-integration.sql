-- ========================================
-- 🤖 Telegram integration tracking
-- ========================================
alter table if exists public.profiles
  add column if not exists telegram_connected boolean default false;

alter table if exists public.profiles
  add column if not exists telegram_reminder_dismissed_at timestamptz;

create index if not exists idx_profiles_telegram_connected
  on public.profiles (telegram_connected);

