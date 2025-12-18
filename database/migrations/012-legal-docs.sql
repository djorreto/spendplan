-- ========================================
-- 📄 Legal documents versioning & acceptance
-- ========================================

-- 1) Legal documents table
create table if not exists public.legal_documents (
  id uuid primary key default uuid_generate_v4(),
  doc_type text not null check (doc_type in ('terms', 'privacy')),
  version text not null,
  title text not null,
  storage_path text not null,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  is_current boolean not null default false
);

create unique index if not exists legal_documents_doc_type_version_uq
  on public.legal_documents (doc_type, version);

create unique index if not exists legal_documents_one_current_per_type
  on public.legal_documents (doc_type)
  where is_current = true;

create index if not exists legal_documents_doc_type_created_at_idx
  on public.legal_documents (doc_type, created_at desc);

-- 2) Legal acceptances log
create table if not exists public.legal_acceptances (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles (id),
  terms_version text,
  privacy_version text,
  action text not null default 'accepted' check (action in ('accepted', 'force_reset')),
  created_at timestamptz not null default now()
);

create index if not exists legal_acceptances_user_created_at_idx
  on public.legal_acceptances (user_id, created_at desc);

-- 3) Storage bucket for legal PDFs
insert into storage.buckets (id, name, public)
values ('legal', 'legal', true)
on conflict (id) do nothing;

-- Grants básicos (por si no existen default privileges)
grant all on public.legal_documents to service_role;
grant select on public.legal_documents to authenticated;

grant all on public.legal_acceptances to service_role;
grant select, insert on public.legal_acceptances to authenticated;

alter table if exists public.legal_documents enable row level security;
alter table if exists public.legal_acceptances enable row level security;

-- Legal documents: anyone can read current, only super admins manage
drop policy if exists "Legal current readable" on public.legal_documents;
create policy "Legal current readable"
  on public.legal_documents
  for select
  using (is_current = true);

drop policy if exists "Super admins manage legal docs" on public.legal_documents;
create policy "Super admins manage legal docs"
  on public.legal_documents
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_super_admin = true
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_super_admin = true
    )
  );

-- Legal acceptances: users see/insert their own; super admins can audit
drop policy if exists "Users read own legal acceptances" on public.legal_acceptances;
create policy "Users read own legal acceptances"
  on public.legal_acceptances
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users insert own legal acceptances" on public.legal_acceptances;
create policy "Users insert own legal acceptances"
  on public.legal_acceptances
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Super admins read all legal acceptances" on public.legal_acceptances;
create policy "Super admins read all legal acceptances"
  on public.legal_acceptances
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_super_admin = true
    )
  );

-- Storage: policies requieren ser owner de storage.objects.
-- Ejecútalas manualmente en el SQL editor de Supabase (rol con permisos, p.ej. supabase_admin):
--   create policy "Public read legal bucket"
--     on storage.objects
--     for select
--     using (bucket_id = 'legal');
--
--   create policy "Super admins manage legal bucket"
--     on storage.objects
--     for all
--     to authenticated
--     using (
--       bucket_id = 'legal' and exists (
--         select 1 from public.profiles p
--         where p.id = auth.uid() and p.is_super_admin = true
--       )
--     )
--     with check (
--       bucket_id = 'legal' and exists (
--         select 1 from public.profiles p
--         where p.id = auth.uid() and p.is_super_admin = true
--       )
--     );
