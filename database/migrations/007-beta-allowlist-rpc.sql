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

revoke all on function public.beta_is_allowed(text) from public;
grant execute on function public.beta_is_allowed(text) to anon, authenticated;

