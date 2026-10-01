-- =============================================================================
-- Test delle funzioni del cruscotto e delle vaccinazioni (pgTAP).
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path to public, extensions;

select plan(12);

create function pg_temp.come(p_sub uuid, p_ruolo text, p_studio uuid, p_aal text default 'aal1')
returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_sub, 'role', 'authenticated', 'app_ruolo', p_ruolo,
    'app_studio_id', p_studio, 'aal', p_aal)::text, true);
$$;
grant execute on function pg_temp.come(uuid, text, uuid, text) to authenticated;

-- Una vaccinazione per Luca, inserita come amministratore.
insert into clinica.vaccinazioni (pseudo_id, vaccino, dose, data)
select pseudo_id, 'Esavalente', 1, date '2023-05-10'
from pseudonimi.mappa where paziente_id = 'd0000000-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------- segreteria
select pg_temp.come('a0000000-0000-4000-8000-000000000002', 'segreteria',
                    'c0000000-0000-4000-8000-000000000001', 'aal2');
set local role authenticated;
select lives_ok($$ select * from api.bilanci_in_scadenza(365) $$,
  'segreteria: vede i bilanci di salute da programmare');
select ok((select count(*) from api.consensi_incompleti()
           where paziente_id = 'd0000000-0000-4000-8000-000000000002') > 0,
  'segreteria: Sofia risulta con consensi incompleti');
select is((select mancanti from api.consensi_incompleti()
           where paziente_id = 'd0000000-0000-4000-8000-000000000002'
             and finalita = 'portale'), array['Marco Bianchi'],
  'consensi incompleti: indica il genitore che manca');
select throws_ok($$ select * from api.attivita_recente() $$, 'P0001', null,
  'segreteria: non consulta il registro attività');
select is((select count(*)::int from clinica.vaccinazioni), 0,
  'segreteria: non vede le vaccinazioni');
select isnt(api.codice_fiscale('d0000000-0000-4000-8000-000000000001'), null,
  'segreteria: legge il codice fiscale (operazione tracciata)');
reset role;

select is((select azione from audit.eventi order by id desc limit 1), 'LETTURA_CODICE_FISCALE',
  'la lettura del codice fiscale finisce nell''audit');

-- ---------------------------------------------------------------- pediatra
select pg_temp.come('a0000000-0000-4000-8000-000000000001', 'pediatra',
                    'c0000000-0000-4000-8000-000000000001', 'aal2');
set local role authenticated;
select is((select count(*)::int from clinica.vaccinazioni), 1,
  'pediatra: vede la vaccinazione di Luca');
select ok((select count(*) from api.attivita_recente(50)) > 0,
  'pediatra: consulta il registro attività');
reset role;

-- ---------------------------------------------------------------- altro studio e tutore
select pg_temp.come('a0000000-0000-4000-8000-000000000003', 'pediatra',
                    'c0000000-0000-4000-8000-000000000002', 'aal2');
set local role authenticated;
select throws_ok($$ select api.codice_fiscale('d0000000-0000-4000-8000-000000000001') $$,
  'P0001', 'Paziente non trovato', 'altro studio: non legge codici fiscali altrui');
reset role;

select pg_temp.come('b0000000-0000-4000-8000-000000000001', 'tutore', null);
set local role authenticated;
select throws_ok($$ select * from api.consensi_incompleti() $$, 'P0001', null,
  'genitore: non accede alle funzioni dello staff');
select is((select count(*)::int from clinica.vaccinazioni), 1,
  'madre: vede il libretto vaccinale di Luca');
reset role;

select * from finish();
rollback;
