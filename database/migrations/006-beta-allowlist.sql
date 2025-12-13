-- ========================================
-- 🔒 BETA PRIVADA: allowlist de emails
-- ========================================
-- Fuente única de verdad para permitir acceso durante beta.
-- Guardar siempre email en minúsculas.

create table if not exists public.beta_allowlist (
  email text primary key
);

-- Normalización: siempre lower(email)
create or replace function public.beta_allowlist_normalize_email()
returns trigger
language plpgsql
as $$
begin
  new.email := lower(trim(new.email));
  return new;
end;
$$;

drop trigger if exists trg_beta_allowlist_normalize_email on public.beta_allowlist;
create trigger trg_beta_allowlist_normalize_email
before insert or update on public.beta_allowlist
for each row execute function public.beta_allowlist_normalize_email();

-- Seguridad: no exponer allowlist a anon/authenticated
alter table public.beta_allowlist enable row level security;
revoke all on table public.beta_allowlist from anon, authenticated;

