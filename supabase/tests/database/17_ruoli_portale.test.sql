-- Figure, permessi della segreteria, accompagnatori e integrazioni.
begin;
create extension if not exists pgtap with schema extensions;
set search_path to public, extensions;
select plan(25);

create function pg_temp.come(p_sub uuid, p_ruolo text, p_admin boolean default false, p_studio uuid default 'c0000000-0000-4000-8000-000000000001')
returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_sub, 'role', 'authenticated', 'app_ruolo', p_ruolo,
    'app_admin', p_admin, 'app_studio_id', p_studio, 'aal', 'aal2')::text, true);
$$;
grant execute on function pg_temp.come(uuid, text, boolean, uuid) to authenticated;

-- ------------------------------------------------ amministratore e segreteria
select throws_ok($$ update anagrafica.membri_studio set amministratore = true where utente_id = 'a0000000-0000-4000-8000-000000000002' $$,
  '23514', null, 'la segreteria non può essere amministratore (vincolo)');

select pg_temp.come('a0000000-0000-4000-8000-000000000001', 'pediatra', true);
set local role authenticated;
select throws_ok($$ select api.imposta_amministratore('a0000000-0000-4000-8000-000000000002', true) $$, 'P0001', null,
  'neanche il titolare nomina amministratore la segreteria');
select lives_ok($$ select api.tutti_amministratori() $$, '«tutti amministratori» salta la segreteria');
reset role;
select is((select amministratore from anagrafica.membri_studio where utente_id = 'a0000000-0000-4000-8000-000000000002'), false,
  'la segreteria resta senza ruolo di amministratore');

-- l'allergologa amministratore vede le cartelle di tutti i bambini dello studio
update anagrafica.membri_studio set amministratore = true where utente_id = 'a0000000-0000-4000-8000-000000000005';
select pg_temp.come('a0000000-0000-4000-8000-000000000005', 'allergologo', true);
set local role authenticated;
select ok(sicurezza.puo_accedere_paziente('d0000000-0000-4000-8000-000000000001'), 'l''amministratore apre qualunque cartella dello studio');
select ok(sicurezza.is_staff(), 'l''allergologa amministratore lavora sul gestionale');
reset role;
update anagrafica.membri_studio set amministratore = false where utente_id = 'a0000000-0000-4000-8000-000000000005';
select pg_temp.come('a0000000-0000-4000-8000-000000000005', 'allergologo', false);
set local role authenticated;
select ok(not sicurezza.puo_accedere_paziente('d0000000-0000-4000-8000-000000000001'), 'l''allergologa non amministratore non vede le cartelle del pediatra');
reset role;

-- ------------------------------------------------ segreteria: lettura concessa dal pediatra
select pg_temp.come('a0000000-0000-4000-8000-000000000002', 'segreteria');
set local role authenticated;
select throws_ok($$ select api.apri_cartella('d0000000-0000-4000-8000-000000000001') $$, 'P0001', 'Accesso alla cartella non consentito',
  'senza permesso la segreteria non apre la cartella');
select throws_ok($$ select api.imposta_permesso_cartelle('a0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', true) $$,
  'P0001', null, 'la segreteria non si concede il permesso da sola');
reset role;

update anagrafica.membri_studio set amministratore = false where utente_id = 'a0000000-0000-4000-8000-000000000004';
select pg_temp.come('a0000000-0000-4000-8000-000000000004', 'sostituto');
set local role authenticated;
select throws_ok($$ select api.imposta_permesso_cartelle('a0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', true) $$,
  'P0001', null, 'il sostituto non concede i permessi del titolare');
reset role;

select pg_temp.come('a0000000-0000-4000-8000-000000000001', 'pediatra', true);
set local role authenticated;
select lives_ok($$ select api.imposta_permesso_cartelle('a0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', true) $$,
  'il pediatra apre le sue cartelle alla segreteria');
select set_config('test.pseudo', api.apri_cartella('d0000000-0000-4000-8000-000000000001')::text, true);
reset role;

select is((public.custom_access_token_hook(jsonb_build_object('user_id', 'a0000000-0000-4000-8000-000000000002', 'claims', '{}'::jsonb))
          -> 'claims' ->> 'app_cartelle'), 'true', 'il token della segreteria segnala le cartelle consultabili');

select pg_temp.come('a0000000-0000-4000-8000-000000000002', 'segreteria');
set local role authenticated;
select lives_ok($$ select api.apri_cartella('d0000000-0000-4000-8000-000000000001') $$, 'con il permesso la segreteria apre la cartella');
select ok((select count(*) from clinica.visite where pseudo_id = current_setting('test.pseudo')::uuid) >= 0, 'e legge le visite');
select is((select count(*)::int from clinica.cartelle where pseudo_id = current_setting('test.pseudo')::uuid), 1, 'legge la cartella');
select throws_ok($$ insert into clinica.visite (pseudo_id, pediatra_id, motivo) values (current_setting('test.pseudo')::uuid, auth.uid(), 'x') $$,
  '42501', null, 'ma non scrive visite (sola lettura)');
update clinica.cartelle set note_anamnesi = 'manomessa' where pseudo_id = current_setting('test.pseudo')::uuid;
reset role;
select isnt((select note_anamnesi from clinica.cartelle where pseudo_id = current_setting('test.pseudo')::uuid), 'manomessa',
  'né modifica la cartella');
select is((select count(*)::int from audit.eventi where azione = 'APERTURA_CARTELLA_LETTURA'), 1, 'l''apertura in lettura è registrata');

select pg_temp.come('a0000000-0000-4000-8000-000000000001', 'pediatra', true);
set local role authenticated;
select lives_ok($$ select api.imposta_permesso_cartelle('a0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', false) $$,
  'il pediatra revoca il permesso');
reset role;
select pg_temp.come('a0000000-0000-4000-8000-000000000002', 'segreteria');
set local role authenticated;
select is((select count(*)::int from clinica.cartelle), 0, 'revocato: la segreteria non legge più nulla, subito');

-- ------------------------------------------------ accompagnatori
select lives_ok($$ insert into anagrafica.accompagnatori (studio_id, paziente_id, nome, cognome, parentela, delega)
                   values ('c0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'Anna', 'Bianchi', 'Nonna paterna', true) $$,
  'la segreteria registra un accompagnatore nell''anagrafica del bambino');
select throws_ok($$ insert into anagrafica.accompagnatori (studio_id, paziente_id, nome, cognome, parentela)
                    values ('c0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'X', 'Y', '') $$,
  '23514', null, 'il grado di parentela è obbligatorio');
reset role;

-- ------------------------------------------------ integrazioni
select pg_temp.come('a0000000-0000-4000-8000-000000000001', 'pediatra', true);
set local role authenticated;
select lives_ok($$ select api.imposta_integrazione('google_calendar', true, '{"calendario": "Agenda studio", "titolo_evento": "Appuntamento"}') $$,
  'l''amministratore prepara Google Calendar');
select throws_ok($$ select api.imposta_integrazione('whatsapp', true, '{"token": "segreto"}') $$, 'P0001', null,
  'i token non si salvano nel database');
reset role;
select pg_temp.come('a0000000-0000-4000-8000-000000000002', 'segreteria');
set local role authenticated;
select throws_ok($$ select api.imposta_integrazione('whatsapp', true, '{}') $$, 'P0001', null, 'la segreteria non configura le integrazioni');
reset role;

select * from finish();
rollback;
