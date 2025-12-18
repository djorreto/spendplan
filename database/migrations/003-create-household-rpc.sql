-- Crea hogar y membresía owner en un solo paso (bypasa RLS de select post-insert)
create or replace function public.create_household_with_owner(
  p_name text,
  p_currency text default 'CLP',
  p_timezone text default 'America/Santiago'
)
returns households
language plpgsql
security definer
set search_path = public
as $$
declare
  h households;
begin
  if auth.uid() is null then
    raise exception 'auth.uid() is null';
  end if;

  insert into households(name, currency, timezone)
  values (p_name, p_currency, p_timezone)
  returning * into h;

  insert into household_memberships(household_id, user_id, role)
  values (h.id, auth.uid(), 'owner')
  on conflict (household_id, user_id) do nothing;

  return h;
end;
$$;
