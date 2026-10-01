-- =============================================================================
-- Test dell'audit log a catena di hash e dell'Auth Hook (pgTAP).
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path to public, extensions;

select plan(13);

create function pg_temp.come(p_sub uuid, p_ruolo text, p_studio uuid, p_aal text default 'aal1')
returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_sub, 'role', 'authenticated', 'app_ruolo', p_ruolo,
    'app_studio_id', p_studio, 'aal', p_aal)::text, true);
$$;
grant execute on function pg_temp.come(uuid, text, uuid, text) to authenticated;

-- ---------------------------------------------------------------- catena integra
select ok((select count(*) from audit.eventi) > 0,
  'il seed ha prodotto eventi di audit');
select is((select primo_evento_non_valido from audit.verifica_catena()), null,
  'la catena è integra dopo il seed');

-- ---------------------------------------------------------------- immutabilità
select throws_like($$ update audit.eventi set azione = 'X' where id = 1 $$,
  '%sola aggiunta%', 'nemmeno l''amministratore può modificare un evento');
select throws_like($$ delete from audit.eventi where id = 1 $$,
  '%sola aggiunta%', 'nemmeno l''amministratore può cancellare un evento');

-- ---------------------------------------------------------------- tracciamento accessi
select pg_temp.come('a0000000-0000-4000-8000-000000000001', 'pediatra',
                    'c0000000-0000-4000-8000-000000000001', 'aal2');
set local role authenticated;
select api.apri_cartella('d0000000-0000-4000-8000-000000000001');
reset role;

select is((select azione from audit.eventi order by id desc limit 1), 'APERTURA_CARTELLA',
  'l''apertura della cartella è registrata');
select is((select actor_id from audit.eventi order by id desc limit 1),
  'a0000000-0000-4000-8000-000000000001'::uuid, 'con l''identità del pediatra');

select pg_temp.come('b0000000-0000-4000-8000-000000000001', 'tutore', null);
set local role authenticated;
select ok((select count(*) from api.registro_accessi('d0000000-0000-4000-8000-000000000001')) > 0,
  'la madre vede il registro accessi della cartella del figlio');
reset role;

select pg_temp.come('a0000000-0000-4000-8000-000000000002', 'segreteria',
                    'c0000000-0000-4000-8000-000000000001', 'aal2');
set local role authenticated;
select throws_ok($$ select * from api.verifica_audit() $$, 'P0001',
  'Solo il pediatra può verificare il registro di audit',
  'la segreteria non può verificare il registro');
reset role;

-- ---------------------------------------------------------------- manomissione
-- Simuliamo un attaccante con accesso al database che disattiva il trigger.
alter table audit.eventi disable trigger solo_aggiunta;
update audit.eventi set ruolo = 'manomesso' where id = 3;
alter table audit.eventi enable trigger solo_aggiunta;

select is((select primo_evento_non_valido from audit.verifica_catena()), 3::bigint,
  'la manomissione dell''evento 3 viene rilevata');

-- ---------------------------------------------------------------- Auth Hook
select is(public.custom_access_token_hook(jsonb_build_object(
    'user_id', 'a0000000-0000-4000-8000-000000000001', 'claims', '{}'::jsonb)) #>> '{claims,app_ruolo}',
  'pediatra', 'hook: il pediatra riceve app_ruolo = pediatra');
select is(public.custom_access_token_hook(jsonb_build_object(
    'user_id', 'a0000000-0000-4000-8000-000000000001', 'claims', '{}'::jsonb)) #>> '{claims,app_studio_id}',
  'c0000000-0000-4000-8000-000000000001', 'hook: e lo studio di appartenenza');
select is(public.custom_access_token_hook(jsonb_build_object(
    'user_id', 'b0000000-0000-4000-8000-000000000001', 'claims', '{}'::jsonb)) #>> '{claims,app_ruolo}',
  'tutore', 'hook: un genitore collegato riceve app_ruolo = tutore');
select is(public.custom_access_token_hook(jsonb_build_object(
    'user_id', gen_random_uuid(), 'claims', '{}'::jsonb)) #>> '{claims,app_ruolo}',
  'nessuno', 'hook: un account sconosciuto non riceve alcun ruolo');

select * from finish();
rollback;
