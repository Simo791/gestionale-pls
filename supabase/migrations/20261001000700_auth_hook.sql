-- =============================================================================
-- 0700 · Custom Access Token Hook
-- Supabase Auth chiama questa funzione ogni volta che emette un JWT.
-- Aggiungiamo app_ruolo e app_studio_id, che le policy RLS leggono.
-- Da attivare in: Dashboard → Authentication → Hooks → Customize Access Token.
-- =============================================================================

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql stable
set search_path = ''
as $$
declare
  v_utente uuid := (event ->> 'user_id')::uuid;
  v_claims jsonb := coalesce(event -> 'claims', '{}');
  v_ruolo  text;
  v_studio uuid;
begin
  select m.ruolo, m.studio_id into v_ruolo, v_studio
  from anagrafica.membri_studio m
  where m.utente_id = v_utente and m.attivo;

  if v_ruolo is null and exists (select 1 from anagrafica.tutori t where t.utente_id = v_utente) then
    v_ruolo := 'tutore';
  end if;

  v_claims := jsonb_set(v_claims, '{app_ruolo}', to_jsonb(coalesce(v_ruolo, 'nessuno')));
  if v_studio is not null then
    v_claims := jsonb_set(v_claims, '{app_studio_id}', to_jsonb(v_studio));
  else
    v_claims := v_claims - 'app_studio_id';
  end if;

  return jsonb_set(event, '{claims}', v_claims);
end;
$$;

-- Solo il servizio di Auth può eseguire l'hook e leggere le tabelle che usa.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

grant usage on schema anagrafica to supabase_auth_admin;
grant select on anagrafica.membri_studio, anagrafica.tutori to supabase_auth_admin;

create policy auth_legge_membri on anagrafica.membri_studio
  as permissive for select to supabase_auth_admin using (true);
create policy auth_legge_tutori on anagrafica.tutori
  as permissive for select to supabase_auth_admin using (true);
