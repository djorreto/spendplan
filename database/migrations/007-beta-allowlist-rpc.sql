-- ========================================
-- 🔒 BETA PRIVADA: RPC seguro para allowlist
-- ========================================
-- Permite verificar si un email está permitido SIN exponer la tabla.
-- La tabla `beta_allowlist` sigue cerrada (RLS + revoke).

create or replace function public.beta_is_allowed(p_email text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.beta_allowlist
    where email = lower(trim(p_email))
  );
$$;

-- Asegurar que el dueño del function pueda leer la tabla (evita "permission denied")
do $$
declare fn_owner text;
begin
  select pg_get_userbyid(p.proowner) into fn_owner
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'beta_is_allowed';

  if fn_owner is not null then
    execute format('grant select on table public.beta_allowlist to %I', fn_owner);
  end if;
end $$;

revoke all on function public.beta_is_allowed(text) from public;
grant execute on function public.beta_is_allowed(text) to anon, authenticated;

