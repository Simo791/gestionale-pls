-- =============================================================================
-- Modulo Allergologia: attivazione, abilitazione, anagrafica separata, RLS, audit.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path to public, extensions;

select plan(20);

create function pg_temp.come(p_sub uuid, p_ruolo text, p_studio uuid, p_aal text default 'aal2', p_admin boolean default false)
returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_sub, 'role', 'authenticated', 'app_ruolo', p_ruolo, 'app_admin', p_admin,
    'app_studio_id', p_studio, 'aal', p_aal)::text, true);
$$;
grant execute on function pg_temp.come(uuid, text, uuid, text, boolean) to authenticated;

-- Il test parte con il modulo spento e senza pazienti di prova.
delete from clinica.allergo_ait_dosi; delete from clinica.allergo_immunoterapie; delete from clinica.allergo_terapie;
delete from clinica.allergo_autoiniettori; delete from clinica.allergo_reazioni; delete from clinica.allergo_punteggi;
delete from clinica.allergo_spirometrie; delete from clinica.allergo_tpo; delete from clinica.allergo_test;
delete from clinica.allergo_diagnosi; delete from clinica.allergo_visite; delete from clinica.allergo_cartelle;
delete from pseudonimi.allergo_mappa; delete from anagrafica.allergo_pazienti;
update anagrafica.studi set allergologia_attiva = false;
update anagrafica.membri_studio set allergologia = false;

-- ------------------------------------------------ token
select is((public.custom_access_token_hook(jsonb_build_object('user_id', 'a0000000-0000-4000-8000-000000000005', 'claims', '{}'::jsonb))
          -> 'claims' ->> 'app_ruolo'), 'allergologo', 'il token dell''allergologa porta il ruolo allergologo');
select is((public.custom_access_token_hook(jsonb_build_object('user_id', 'a0000000-0000-4000-8000-000000000005', 'claims', '{}'::jsonb))
          -> 'claims' ->> 'app_allergologia'), 'false', 'con modulo spento il token non abilita la sezione');

-- ------------------------------------------------ solo l'amministratore attiva
select pg_temp.come('a0000000-0000-4000-8000-000000000004', 'sostituto', 'c0000000-0000-4000-8000-000000000001');
set local role authenticated;
select throws_ok($$ select api.imposta_allergologia(true) $$, 'P0001',
  'Solo l''amministratore dello studio attiva il modulo Allergologia', 'il sostituto non attiva il modulo');
reset role;

select pg_temp.come('a0000000-0000-4000-8000-000000000001', 'pediatra', 'c0000000-0000-4000-8000-000000000001', 'aal2', true);
set local role authenticated;
select ok(not sicurezza.allergologia_ok(), 'modulo spento: neppure l''amministratore accede');
select lives_ok($$ select api.imposta_allergologia(true) $$, 'l''amministratore attiva il modulo');
select ok(sicurezza.allergologia_ok(), 'modulo attivo: l''amministratore accede');
select throws_ok($$ select api.abilita_allergologia('a0000000-0000-4000-8000-000000000002', true) $$, 'P0001',
  'Membro non trovato o non abilitabile (la segreteria non accede al modulo clinico)', 'la segreteria non è abilitabile');
reset role;

-- ------------------------------------------------ allergologa non ancora accettata
select pg_temp.come('a0000000-0000-4000-8000-000000000005', 'allergologo', 'c0000000-0000-4000-8000-000000000001');
set local role authenticated;
select ok(not sicurezza.allergologia_ok(), 'allergologa non accettata: nessun accesso');
select throws_ok($$ select api.allergo_registra_paziente('Mario', 'Test', 'TSTMRA20A01X000Z', '2020-01-01', 'M') $$, 'P0001',
  'Accesso al modulo Allergologia non consentito', 'non può registrare pazienti');
reset role;

select pg_temp.come('a0000000-0000-4000-8000-000000000001', 'pediatra', 'c0000000-0000-4000-8000-000000000001', 'aal2', true);
set local role authenticated;
select lives_ok($$ select api.abilita_allergologia('a0000000-0000-4000-8000-000000000005', true) $$, 'l''amministratore accetta l''allergologa');
reset role;

-- ------------------------------------------------ allergologa accettata
select pg_temp.come('a0000000-0000-4000-8000-000000000005', 'allergologo', 'c0000000-0000-4000-8000-000000000001', 'aal1');
set local role authenticated;
select ok(not sicurezza.allergologia_ok(), 'senza secondo fattore niente accesso');
reset role;
select pg_temp.come('a0000000-0000-4000-8000-000000000005', 'allergologo', 'c0000000-0000-4000-8000-000000000001');
set local role authenticated;
select lives_ok($$ select set_config('test.paz', api.allergo_registra_paziente('Mario', 'Test', 'tstmra20a01x000z',
                   '2020-01-01', 'M', 'Anna Test')::text, true) $$, 'l''allergologa registra un nuovo paziente');
select throws_ok($$ select api.allergo_registra_paziente('Mario', 'Doppio', 'TSTMRA20A01X000Z', '2020-01-01', 'M') $$, '23505',
  'Paziente già presente in Allergologia', 'niente doppioni per codice fiscale');
select is((select count(*)::int from anagrafica.pazienti), 0, 'l''allergologa non vede gli assistiti del pediatra');
select lives_ok($$ select set_config('test.pseudo', api.allergo_apri_cartella(current_setting('test.paz')::uuid)::text, true) $$,
  'apre la cartella allergologica');
select lives_ok($$ insert into clinica.allergo_punteggi (pseudo_id, scala, punteggio, dettagli)
                   values (current_setting('test.pseudo')::uuid, 'scorad', 42.5, '{"A":30,"B":8,"C":8.5}') $$,
  'registra un punteggio SCORAD');
with r as (insert into clinica.allergo_spirometrie (pseudo_id, fev1_l, fev1_post_l)
           values (current_setting('test.pseudo')::uuid, 1.50, 1.71) returning reversibilita_pct)
select is((select reversibilita_pct from r), 14.0, 'la reversibilità dopo broncodilatatore è calcolata (+14%)');
select is(api.allergo_codice_fiscale(current_setting('test.paz')::uuid), 'TSTMRA20A01X000Z', 'il codice fiscale è cifrato e leggibile solo dal modulo');
reset role;

-- ------------------------------------------------ altri non vedono
select pg_temp.come('a0000000-0000-4000-8000-000000000002', 'segreteria', 'c0000000-0000-4000-8000-000000000001');
set local role authenticated;
select is((select count(*)::int from anagrafica.allergo_pazienti), 0, 'la segreteria non vede i pazienti allergologici');
reset role;

-- ------------------------------------------------ registro
select ok(exists (select 1 from audit.eventi where azione = 'APERTURA_CARTELLA_ALLERGO'
                  and pseudo_id = current_setting('test.pseudo')::uuid), 'l''apertura della cartella è nel registro');

select * from finish();
rollback;
