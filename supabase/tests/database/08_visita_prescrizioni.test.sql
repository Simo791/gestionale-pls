-- =============================================================================
-- Test di registrazione rapida, visita completa, catalogo prestazioni e prescrizioni.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path to public, extensions;

select plan(12);

create function pg_temp.come(p_sub uuid, p_ruolo text, p_studio uuid, p_aal text default 'aal2')
returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_sub, 'role', 'authenticated', 'app_ruolo', p_ruolo,
    'app_studio_id', p_studio, 'aal', p_aal)::text, true);
$$;
grant execute on function pg_temp.come(uuid, text, uuid, text) to authenticated;

-- ------------------------------------------------ segreteria: registrazione rapida
select pg_temp.come('a0000000-0000-4000-8000-000000000002', 'segreteria', 'c0000000-0000-4000-8000-000000000001');
set local role authenticated;
select lives_ok($$ select set_config('test.nuovo', api.registra_paziente_rapido(
    'Paolo', 'Urgente', 'RGNPLA20A01C352X', current_date - 400, 'M',
    'a0000000-0000-4000-8000-000000000001',
    '{"nome":"Anna","cognome":"Urgente","codice_fiscale":"RGNNNA90A41C352Y","email":"anna@example.org","tipo":"madre"}'::jsonb)::text, true) $$,
  'la segreteria registra un bambino arrivato in urgenza con la madre');
select is((select count(*)::int from anagrafica.relazioni_tutela where paziente_id = current_setting('test.nuovo')::uuid), 1,
  'la madre è collegata al bambino');
select throws_ok($$ select api.registra_paziente_rapido('Paolo', 'Urgente', 'RGNPLA20A01C352X', current_date - 400, 'M',
    'a0000000-0000-4000-8000-000000000001') $$, '23505', null, 'lo stesso bambino non si registra due volte');
select throws_ok($$ select api.registra_paziente_rapido('X', 'Y', 'CORTO', current_date, 'M',
    'a0000000-0000-4000-8000-000000000001') $$, 'P0001', 'Codice fiscale del bambino non valido', 'codice fiscale controllato');
select throws_ok($$ select api.importa_catalogo_prestazioni('[{"codice_regionale":"X1","descrizione":"Prova"}]', 'v1') $$,
  'P0001', 'Solo il pediatra può importare il catalogo delle prestazioni', 'la segreteria non importa il catalogo');
reset role;

-- ------------------------------------------------ pediatra
select pg_temp.come('a0000000-0000-4000-8000-000000000001', 'pediatra', 'c0000000-0000-4000-8000-000000000001');
set local role authenticated;
select is((select (api.importa_catalogo_prestazioni(
    '[{"codice_regionale":"R1","codice_nazionale":"N1","descrizione":"Esame di prova uno","branca":"Laboratorio"},
      {"codice_regionale":"R2","descrizione":"Esame di prova due"},
      {"codice_regionale":"","descrizione":"riga vuota scartata"}]', 'Versione 1') ->> 'importate')::int), 2,
  'il pediatra importa il catalogo (righe senza codice scartate)');
select is((select (api.importa_catalogo_prestazioni('[{"codice_regionale":"R1","descrizione":"Esame di prova uno"}]', 'Versione 2') ->> 'disattivate')::int), 1,
  'una nuova versione disattiva le prestazioni non più presenti');
select lives_ok($$ insert into clinica.visite (pseudo_id, motivo, tipo, temperatura_c, saturazione_o2, indicazioni_genitori)
                   values (api.apri_cartella('d0000000-0000-4000-8000-000000000001'), 'Febbre', 'urgenza', 38.7, 98, 'Idratazione') $$,
  'visita con parametri vitali e indicazioni');
select throws_ok($$ insert into clinica.visite (pseudo_id, motivo, saturazione_o2)
                    values (api.apri_cartella('d0000000-0000-4000-8000-000000000001'), 'Prova', 120) $$,
  '23514', null, 'saturazione oltre 100 rifiutata');
select lives_ok($$ insert into clinica.prescrizioni (pseudo_id, priorita, quesito, prestazioni)
                   values (api.apri_cartella('d0000000-0000-4000-8000-000000000001'), 'B', 'Febbre persistente',
                           '[{"codice_regionale":"R1","descrizione":"Esame di prova uno","quantita":1}]') $$,
  'il pediatra salva un promemoria di prescrizione');
select throws_ok($$ insert into clinica.prescrizioni (pseudo_id, quesito, prestazioni)
                    values (api.apri_cartella('d0000000-0000-4000-8000-000000000001'), 'Troppe',
                            (select jsonb_agg(jsonb_build_object('codice_regionale', g, 'descrizione', 'x')) from generate_series(1, 9) g)) $$,
  '23514', null, 'al massimo 8 prestazioni per ricetta');
reset role;

-- ------------------------------------------------ segreteria non vede le prescrizioni
select pg_temp.come('a0000000-0000-4000-8000-000000000002', 'segreteria', 'c0000000-0000-4000-8000-000000000001');
set local role authenticated;
select is((select count(*)::int from clinica.prescrizioni), 0, 'la segreteria non vede le prescrizioni');
reset role;

select * from finish();
rollback;
