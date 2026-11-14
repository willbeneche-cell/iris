-- =============================================================================
-- Iris — disponibilité du nom d'utilisateur
-- `profiles` n'est lisible que par les utilisateurs authentifiés (RLS), donc
-- l'écran d'inscription interroge cette fonction SECURITY DEFINER, limitée à un
-- booléen : elle n'expose jamais la liste des pseudos.
-- =============================================================================

create or replace function public.is_username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_username ~ '^[A-Za-z0-9_.-]{3,30}$'
    and not exists (
      select 1
      from public.profiles p
      where lower(p.username) = lower(p_username)
    );
$$;

revoke all on function public.is_username_available(text) from public;
grant execute on function public.is_username_available(text) to anon, authenticated;
