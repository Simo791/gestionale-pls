-- =============================================================================
-- Modulo Auxologia: attivazione, abilitazione, anagrafica separata, RLS, controlli
-- sui dati (età calcolata, date, intervalli, coerenza con il sesso), audit, invio.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path to public, extensions;

select plan(56);

create function pg_temp.come(p_sub uuid, p_ruolo text, p_admin boolean default false, p_aal text default 'aal2')
returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_sub, 'role', 'authenticated', 'app_ruolo', p_ruolo, 'app_admin', p_admin,
    'app_studio_id', 'c0000000-0000-4000-8000-000000000001', 'aal', p_aal)::text, true);
$$;
grant execute on function pg_temp.come(uuid, text, boolean, text) to authenticated;

-- Si parte con il modulo spento e l'auxologa non abilitata.
update anagrafica.studi set auxologia_attiva = false;
update anagrafica.membri_studio set auxologia = false;

-- ------------------------------------------------ token
select is((public.custom_access_token_hook(jsonb_build_object('user_id', 'a0000000-0000-4000-8000-000000000006', 'claims', '{}'::jsonb))
          -> 'claims' ->> 'app_ruolo'), 'auxologo', 'il token dell''auxologa porta il ruolo auxologo');
select is((public.custom_access_token_hook(jsonb_build_object('user_id', 'a0000000-0000-4000-8000-000000000006', 'claims', '{}'::jsonb))
          -> 'claims' ->> 'app_auxologia'), 'false', 'con modulo spento il token non abilita la sezione');

-- ------------------------------------------------ attivazione e abilitazione
select pg_temp.come('a0000000-0000-4000-8000-000000000004', 'sostituto');
set local role authenticated;
select throws_ok($$ select api.imposta_auxologia(true) $$, 'P0001',
  'Solo l''amministratore dello studio attiva il modulo Auxologia', 'il sostituto non attiva il modulo');
reset role;

select pg_temp.come('a0000000-0000-4000-8000-000000000001', 'pediatra', true);
set local role authenticated;
select ok(not sicurezza.auxologia_ok(), 'modulo spento: neppure l''amministratore accede');
select lives_ok($$ select api.imposta_auxologia(true) $$, 'l''amministratore attiva il modulo');
select ok(sicurezza.auxologia_ok(), 'modulo attivo: l''amministratore accede');
select throws_ok($$ select api.abilita_auxologia('a0000000-0000-4000-8000-000000000002', true) $$, 'P0001',
  'Membro non trovato o non abilitabile (la segreteria non accede al modulo clinico)', 'la segreteria non è abilitabile');
reset role;

select pg_temp.come('a0000000-0000-4000-8000-000000000006', 'auxologo');
set local role authenticated;
select ok(not sicurezza.auxologia_ok(), 'auxologa non abilitata: nessun accesso');
select is((select count(*)::int from anagrafica.auxo_pazienti), 0, 'non vede i pazienti');
reset role;

select pg_temp.come('a0000000-0000-4000-8000-000000000001', 'pediatra', true);
set local role authenticated;
select lives_ok($$ select api.abilita_auxologia('a0000000-0000-4000-8000-000000000006', true) $$, 'l''amministratore abilita l''auxologa');
reset role;
select is((public.custom_access_token_hook(jsonb_build_object('user_id', 'a0000000-0000-4000-8000-000000000006', 'claims', '{}'::jsonb))
          -> 'claims' ->> 'app_auxologia'), 'true', 'abilitata: il token mostra la sezione');

-- ------------------------------------------------ l'auxologa: solo il suo modulo
select pg_temp.come('a0000000-0000-4000-8000-000000000006', 'auxologo');
set local role authenticated;
select ok(sicurezza.auxologia_ok(), 'abilitata con MFA: accede');
select is((select count(*)::int from anagrafica.auxo_pazienti), 2, 'vede i pazienti di Auxologia dello studio');
select is((select count(*)::int from anagrafica.pazienti), 0, 'non vede gli assistiti del pediatra');
select is((select count(*)::int from clinica.allergo_cartelle), 0, 'non vede l''Allergologia');
select ok(not sicurezza.is_staff(), 'non è staff (agenda, anagrafiche)');
select throws_ok($$ select codice_fiscale_cifrato from anagrafica.auxo_pazienti $$, '42501', null,
  'il codice fiscale cifrato non è leggibile direttamente');
select throws_ok($$ update anagrafica.auxo_pazienti set data_nascita = '2015-01-01' $$, '42501', null,
  'la data di nascita non è modificabile (da essa dipendono le età)');

select lives_ok($$ select set_config('test.paz', api.auxo_registra_paziente('Luca', 'Prova', 'PRVLCU18A01X000C',
  (current_date - interval '8 years')::date, 'M')::text, true) $$, 'registra un paziente');
select throws_ok($$ select api.auxo_registra_paziente('Luca', 'Prova', 'prvlcu18a01x000c', '2018-01-01', 'M') $$, '23505', null,
  'stesso codice fiscale: rifiutato');
select lives_ok($$ select set_config('test.pseudo', api.auxo_apri_cartella(current_setting('test.paz')::uuid)::text, true) $$,
  'apre la cartella');

-- Età calcolata dal database, posizione predefinita, BMI generato
select lives_ok($$ insert into clinica.auxo_misure (pseudo_id, data, altezza_cm, peso_kg, eta_anni)
  values (current_setting('test.pseudo')::uuid, current_date, 125.0, 25.0, 99) $$, 'inserisce una misura');
select is((select eta_anni from clinica.auxo_misure where pseudo_id = current_setting('test.pseudo')::uuid),
  round(((current_date - (current_date - interval '8 years')::date) / 365.25)::numeric, 2),
  'l''età è quella calcolata dalla data di nascita, non quella inviata');
select is((select posizione from clinica.auxo_misure where pseudo_id = current_setting('test.pseudo')::uuid), 'in_piedi',
  'sopra i 2 anni la statura è «in piedi» se non indicato');
select is((select bmi from clinica.auxo_misure where pseudo_id = current_setting('test.pseudo')::uuid), 16.00::numeric,
  'BMI = 25 / 1,25² = 16,00');
select throws_ok($$ update clinica.auxo_misure set eta_anni = 1 where pseudo_id = current_setting('test.pseudo')::uuid $$, '42501', null,
  'l''età non si modifica a mano');

-- Date e intervalli
select throws_ok($$ insert into clinica.auxo_misure (pseudo_id, data, peso_kg)
  values (current_setting('test.pseudo')::uuid, (current_date - interval '9 years')::date, 3) $$, 'P0001', null,
  'misura prima della nascita: rifiutata');
select throws_ok($$ insert into clinica.auxo_misure (pseudo_id, data, peso_kg)
  values (current_setting('test.pseudo')::uuid, current_date + 10, 30) $$, 'P0001', null, 'misura nel futuro: rifiutata');
select throws_ok($$ insert into clinica.auxo_misure (pseudo_id, data, altezza_cm)
  values (current_setting('test.pseudo')::uuid, current_date, 300) $$, '23514', null, 'statura di 300 cm: rifiutata');
select throws_ok($$ insert into clinica.auxo_misure (pseudo_id, data, altezza_cm, altezza_seduto_cm)
  values (current_setting('test.pseudo')::uuid, current_date, 120, 125) $$, '23514', null, 'altezza da seduto maggiore della statura: rifiutata');
select throws_ok($$ insert into clinica.auxo_misure (pseudo_id, data, pas_mmhg, pad_mmhg)
  values (current_setting('test.pseudo')::uuid, current_date, 90, 95) $$, '23514', null, 'diastolica maggiore della sistolica: rifiutata');
select throws_ok($$ insert into clinica.auxo_misure (pseudo_id, data) values (current_setting('test.pseudo')::uuid, current_date) $$,
  '23514', null, 'misura senza alcun valore: rifiutata');

-- Pubertà coerente con il sesso, orchidometro di Prader
select throws_ok($$ insert into clinica.auxo_puberta (pseudo_id, data, tanner_b) values (current_setting('test.pseudo')::uuid, current_date, 2) $$,
  'P0001', 'Stadio mammario e menarca si registrano solo nelle femmine', 'stadio B in un maschio: rifiutato');
select throws_ok($$ insert into clinica.auxo_puberta (pseudo_id, data, testicolo_dx_ml) values (current_setting('test.pseudo')::uuid, current_date, 7) $$,
  '23514', null, 'volume di 7 ml (non è un valore dell''orchidometro): rifiutato');
select lives_ok($$ insert into clinica.auxo_puberta (pseudo_id, data, tanner_g, tanner_ph, testicolo_dx_ml, testicolo_sx_ml)
  values (current_setting('test.pseudo')::uuid, current_date, 1, 1, 3, 3) $$, 'stadio puberale maschile valido');

-- Target genetico e test del GH
select lives_ok($$ update clinica.auxo_cartelle set altezza_padre_cm = 175, altezza_madre_cm = 160
  where pseudo_id = current_setting('test.pseudo')::uuid $$, 'registra le stature dei genitori');
select is((select target_genetico_cm from clinica.auxo_cartelle where pseudo_id = current_setting('test.pseudo')::uuid), 174.0::numeric,
  'target genetico maschio: (175 + 160 + 13) / 2 = 174');
select throws_ok($$ update clinica.auxo_cartelle set sesso = 'F' where pseudo_id = current_setting('test.pseudo')::uuid $$, '42501', null,
  'il sesso della cartella non si modifica');
select lives_ok($$ insert into clinica.auxo_test_gh (pseudo_id, data, stimolo, picco_ug_l) values
  (current_setting('test.pseudo')::uuid, current_date, 'ghrh_arginina', 15) $$, 'registra un test GHRH + arginina');
select is((select soglia_ug_l::text || '/' || sotto_soglia::text from clinica.auxo_test_gh where pseudo_id = current_setting('test.pseudo')::uuid),
  '20.0/true', 'GHRH + arginina: soglia 20 µg/L, picco 15 sotto soglia');
select throws_ok($$ insert into clinica.auxo_terapie (pseudo_id, classe, farmaco, dose_ug_kg_die) values
  (current_setting('test.pseudo')::uuid, 'levotiroxina', 'Levotiroxina', 30) $$, '23514', null,
  'la dose in µg/kg/die si indica solo per la somatropina');

-- Autore, date di registrazione e coerenza
select lives_ok($$ insert into clinica.auxo_visite (pseudo_id, medico_id, data, motivo)
  values (current_setting('test.pseudo')::uuid, 'a0000000-0000-4000-8000-000000000003', now(), 'Prova') $$, 'inserisce una visita');
select is((select medico_id from clinica.auxo_visite where pseudo_id = current_setting('test.pseudo')::uuid),
  'a0000000-0000-4000-8000-000000000006'::uuid, 'l''autore della visita è chi la registra, non quello indicato');
select throws_ok($$ update clinica.auxo_visite set medico_id = 'a0000000-0000-4000-8000-000000000001' where pseudo_id = current_setting('test.pseudo')::uuid $$,
  '42501', null, 'l''autore della visita non si modifica');
select throws_ok($$ insert into clinica.auxo_visite (pseudo_id, data, motivo)
  values (current_setting('test.pseudo')::uuid, now() + interval '1 year', 'Futura') $$, 'P0001', null, 'visita nel futuro: rifiutata');
select lives_ok($$ insert into clinica.auxo_esami (pseudo_id, data, esame, valore, creato_il)
  values (current_setting('test.pseudo')::uuid, current_date, 'tsh', 2.1, '2000-01-01') $$, 'inserisce un esame');
select ok((select creato_il > now() - interval '1 minute' from clinica.auxo_esami where pseudo_id = current_setting('test.pseudo')::uuid),
  'la data di registrazione la scrive il database');
select throws_ok($$ insert into clinica.auxo_puberta (pseudo_id, data, tanner_ph, data_menarca)
  values (current_setting('test.pseudo')::uuid, current_date, 2, current_date) $$, 'P0001', null, 'data del menarca in un maschio: rifiutata');

-- Nessuna cancellazione dei dati clinici; pseudo_id fisso
select throws_ok($$ delete from clinica.auxo_misure $$, '42501', null, 'i dati clinici non si cancellano');
select throws_ok($$ update clinica.auxo_misure set pseudo_id = (select pseudo_id from pseudonimi.auxo_mappa limit 1) $$, '42501', null,
  'la mappa degli pseudonimi non è leggibile');
reset role;

select ok(exists (select 1 from audit.eventi where azione = 'APERTURA_CARTELLA_AUXO'), 'apertura della cartella registrata');
select ok((select count(*) from audit.eventi where tabella = 'clinica.auxo_misure') >= 1, 'modifiche alle misure registrate nell''audit');

-- ------------------------------------------------ segreteria e pediatra non amministratore: nessun accesso
select pg_temp.come('a0000000-0000-4000-8000-000000000002', 'segreteria');
set local role authenticated;
select is((select count(*)::int from clinica.auxo_misure), 0, 'la segreteria non vede l''Auxologia');
reset role;

-- ------------------------------------------------ niente abilitazioni incrociate tra moduli; token vecchio
select pg_temp.come('a0000000-0000-4000-8000-000000000001', 'pediatra', true);
set local role authenticated;
select throws_ok($$ select api.abilita_auxologia('a0000000-0000-4000-8000-000000000005', true) $$, 'P0001', null,
  'l''allergologa non si abilita all''Auxologia');
reset role;
select pg_temp.come('a0000000-0000-4000-8000-000000000006', 'auxologo', true);
set local role authenticated;
select ok(not sicurezza.is_staff(), 'token con app_admin ma non amministratore in tabella: non è staff');
reset role;

-- ------------------------------------------------ invio documenti per i pazienti di Auxologia
select pg_temp.come('a0000000-0000-4000-8000-000000000006', 'auxologo');
set local role authenticated;
select lives_ok($$ select * from api.prepara_invio(null, null, null, 'email', 'genitore@example.com', null, 'Referto auxologico', true,
  current_setting('test.paz')::uuid) $$, 'l''auxologa prepara un invio per il suo paziente');
reset role;

select * from finish();
rollback;
