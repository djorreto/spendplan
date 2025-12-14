-- ========================================
-- Timestamp para beta_allowlist
-- ========================================

alter table public.beta_allowlist
  add column if not exists created_at timestamptz not null default now();

create index if not exists idx_beta_allowlist_created_at on public.beta_allowlist(created_at desc);

