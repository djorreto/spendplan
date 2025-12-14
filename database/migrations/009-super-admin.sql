-- ========================================
-- 👑 SUPER ADMIN + ACCESS A BETA ALLOWLIST
-- ========================================

-- 1) Flag en profiles
alter table public.profiles
  add column if not exists is_super_admin boolean not null default false;

create index if not exists idx_profiles_super_admin on public.profiles(is_super_admin);

-- Backfill opcional: marca a Diego como super admin
update public.profiles
set is_super_admin = true
where lower(email) = 'djorreto@gmail.com';

-- 2) RLS para beta_allowlist: permitir a super admins leer/crear/borrar
drop policy if exists "Super admins can manage beta_allowlist" on public.beta_allowlist;

create policy "Super admins can manage beta_allowlist"
  on public.beta_allowlist
  for all
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.is_super_admin = true
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.is_super_admin = true
    )
  );

