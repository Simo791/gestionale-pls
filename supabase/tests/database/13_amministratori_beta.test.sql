-- =============================================================================
-- Beta: nomina di amministratori con qualunque ruolo.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path to public, extensions;

select plan(8);

create function pg_temp.come(p_sub uuid, p_ruolo text, p_admin boolean)
returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_sub, 'role', 'authenticated', 'app_ruolo', p_ruolo, 'app_admin', p_admin,
    'app_studio_id', 'c0000000-0000-4000-8000-000000000001', 'aal', 'aal2')::text, true);
$$;
grant execute on function pg_temp.come(uuid, text, boolean) to authenticated;

select pg_temp.come('a0000000-0000-4000-8000-000000000002', 'segreteria', false);
set local role authenticated;
select throws_ok($$ select api.imposta_amministratore('a0000000-0000-4000-8000-000000000002', true) $$, 'P0001',
  'Solo un amministratore dello studio nomina gli amministratori', 'chi non è amministratore non si autonomina');
reset role;

select pg_temp.come('a0000000-0000-4000-8000-000000000001', 'pediatra', true);
set local role authenticated;
select lives_ok($$ select api.imposta_amministratore('a0000000-0000-4000-8000-000000000002', true) $$, 'il titolare nomina amministratore la segreteria');
select throws_ok($$ select api.imposta_amministratore('a0000000-0000-4000-8000-000000000001', false) $$, 'P0001',
  'Non puoi revocare a te stesso il ruolo di amministratore', 'non ci si revoca da soli');
reset role;
select is((public.custom_access_token_hook(jsonb_build_object('user_id', 'a0000000-0000-4000-8000-000000000002', 'claims', '{}'::jsonb))
          -> 'claims' ->> 'app_admin'), 'true', 'il token della segreteria ora porta app_admin');

select pg_temp.come('a0000000-0000-4000-8000-000000000002', 'segreteria', true);
set local role authenticated;
select ok(sicurezza.is_admin(), 'la segreteria amministratore è riconosciuta');
select ok(not sicurezza.puo_accedere_paziente('d0000000-0000-4000-8000-000000000001'), 'ma non apre le cartelle degli assistiti');
select lives_ok($$ select api.tutti_amministratori() $$, 'beta: tutti amministratori');
reset role;
select is((select count(*)::int from anagrafica.membri_studio where studio_id = 'c0000000-0000-4000-8000-000000000001' and attivo and not amministratore), 0,
  'nessun membro attivo resta senza il ruolo di amministratore');

select * from finish();
rollback;
