-- IgE totali, specifiche e molecolari (metodica e data del prelievo).
begin;
create extension if not exists pgtap with schema extensions;
set search_path to public, extensions;
select plan(5);

create function pg_temp.come(p_sub uuid, p_ruolo text)
returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_sub, 'role', 'authenticated', 'app_ruolo', p_ruolo,
    'app_studio_id', 'c0000000-0000-4000-8000-000000000001', 'aal', 'aal2')::text, true);
$$;
grant execute on function pg_temp.come(uuid, text) to authenticated;

select has_column('clinica', 'allergo_test', 'metodica', 'colonna metodica');
select has_column('clinica', 'allergo_test', 'data_prelievo', 'colonna data del prelievo');

select pg_temp.come('a0000000-0000-4000-8000-000000000005', 'allergologo');
set local role authenticated;
select set_config('test.p', api.allergo_apri_cartella('e0000000-0000-4000-8000-000000000001')::text, true);
select lives_ok($$
  insert into clinica.allergo_test (pseudo_id, data, data_prelievo, tipo, allergene, valore, unita, esito, metodica) values
    (current_setting('test.p')::uuid, current_date, current_date - 10, 'ige_totali', 'IgE totali', 245, 'kU/L', null, 'ImmunoCAP ISAC E112i'),
    (current_setting('test.p')::uuid, current_date, current_date - 10, 'ige_componenti', 'Ara h 2', 12.5, 'ISU-E', 'positivo', 'ImmunoCAP ISAC E112i'),
    (current_setting('test.p')::uuid, current_date, current_date - 10, 'ige_componenti', 'Altri componenti del pannello', null, 'ISU-E', 'negativo', 'ImmunoCAP ISAC E112i') $$,
  'l''allergologa registra un pannello ISAC');
select is((select count(*)::int from clinica.allergo_test where pseudo_id = current_setting('test.p')::uuid and metodica = 'ImmunoCAP ISAC E112i'), 3,
  'le righe del pannello sono leggibili con la metodica');
select throws_ok($$ insert into clinica.allergo_test (pseudo_id, tipo, allergene, metodica)
                    values (current_setting('test.p')::uuid, 'ige_componenti', 'Ara h 2', repeat('x', 61)) $$,
  '23514', null, 'metodica troppo lunga rifiutata');
reset role;
select * from finish();
rollback;
