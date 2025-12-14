-- ========================================
-- Permisos para beta_allowlist con RLS
-- ========================================
-- El policy ya limita a super admins; aquí damos privilegios a role authenticated.

grant select, insert, delete on table public.beta_allowlist to authenticated;

