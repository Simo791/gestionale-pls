-- =============================================================================
-- Test delle policy RLS (pgTAP). Si lanciano con: supabase test db
-- Si basano sui dati di supabase/seed.sql.
-- Ogni blocco "impersona" un utente impostando ruolo e claim del JWT.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path to public, extensions;

select plan(22);

-- Helper: imposta i claim come farebbe PostgREST con il JWT dell'utente.
create function pg_temp.come(p_sub uuid, p_ruolo text, p_studio uuid, p_aal text default 'aal1')
returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_sub, 'role', 'authenticated', 'app_ruolo', p_ruolo,
    'app_studio_id', p_studio, 'aal', p_aal)::text, true);
$$;
grant execute on function pg_temp.come(uuid, text, uuid, text) to authenticated;

-- Pseudonimo di Luca letto come amministratore, per simulare chi lo conosce già.
select set_config('test.pseudo_luca', (select pseudo_id::text from pseudonimi.mappa
  where paziente_id = 'd0000000-0000-4000-8000-000000000001'), true);

-- ---------------------------------------------------------------- segreteria
select pg_temp.come('a0000000-0000-4000-8000-000000000002', 'segreteria',
                    'c0000000-0000-4000-8000-000000000001', 'aal2');
set local role authenticated;

select is((select count(*)::int from anagrafica.pazienti), 2,
  'segreteria: vede i 2 pazienti del proprio studio');
select is((select count(*)::int from clinica.misurazioni), 0,
  'segreteria: non vede nessuna misurazione clinica');
select is((select count(*)::int from clinica.cartelle), 0,
  'segreteria: non vede nessuna cartella');
select throws_ok($$ select api.apri_cartella('d0000000-0000-4000-8000-000000000001') $$,
  'P0001', 'Accesso alla cartella non consentito',
  'segreteria: non può aprire una cartella');
select throws_ok($$ insert into clinica.visite (pseudo_id, motivo)
                    values (current_setting('test.pseudo_luca')::uuid, 'test') $$,
  '42501', null, 'segreteria: non può scrivere una visita anche conoscendo lo pseudonimo');
reset role;

-- ------------------------------------------------- pediatra senza secondo fattore
select pg_temp.come('a0000000-0000-4000-8000-000000000001', 'pediatra',
                    'c0000000-0000-4000-8000-000000000001', 'aal1');
set local role authenticated;
select is((select count(*)::int from clinica.misurazioni), 0,
  'pediatra senza MFA: nessun dato clinico');
select throws_ok($$ select api.apri_cartella('d0000000-0000-4000-8000-000000000001') $$,
  'P0001', 'Accesso alla cartella non consentito',
  'pediatra senza MFA: non apre la cartella');
reset role;

-- ------------------------------------------------- pediatra con secondo fattore
select pg_temp.come('a0000000-0000-4000-8000-000000000001', 'pediatra',
                    'c0000000-0000-4000-8000-000000000001', 'aal2');
set local role authenticated;
select is((select count(*)::int from anagrafica.pazienti), 2,
  'pediatra: vede solo i pazienti del proprio studio');
select is((select count(*)::int from clinica.misurazioni), 5,
  'pediatra con MFA: vede le 5 misurazioni di Luca');
select isnt(api.apri_cartella('d0000000-0000-4000-8000-000000000001'), null,
  'pediatra con MFA: apre la cartella e ottiene lo pseudonimo');
select lives_ok($$ insert into clinica.misurazioni (pseudo_id, eta_giorni, peso_kg)
                   values (api.apri_cartella('d0000000-0000-4000-8000-000000000001'), 900, 13.1) $$,
  'pediatra con MFA: registra una misurazione');
select throws_ok($$ select * from pseudonimi.mappa $$, '42501', null,
  'pediatra: nessun accesso diretto alla mappa degli pseudonimi');
select throws_ok($$ select * from audit.eventi $$, '42501', null,
  'pediatra: nessun accesso diretto al registro di audit');
reset role;

-- --------------------------------------------- pediatra di un altro studio
select pg_temp.come('a0000000-0000-4000-8000-000000000003', 'pediatra',
                    'c0000000-0000-4000-8000-000000000002', 'aal2');
set local role authenticated;
select is((select count(*)::int from clinica.misurazioni), 0,
  'altro studio: non vede la clinica dei pazienti altrui');
select is((select count(*)::int from anagrafica.pazienti), 1,
  'altro studio: vede solo il proprio paziente');
reset role;

-- --------------------------------------------- sostituto fuori periodo
select pg_temp.come('a0000000-0000-4000-8000-000000000004', 'sostituto',
                    'c0000000-0000-4000-8000-000000000001', 'aal2');
set local role authenticated;
select is((select count(*)::int from clinica.misurazioni), 0,
  'sostituto a sostituzione conclusa: nessun dato clinico');
reset role;

-- --------------------------------------------- tutori
select pg_temp.come('b0000000-0000-4000-8000-000000000001', 'tutore', null);
set local role authenticated;
select is((select count(*)::int from anagrafica.pazienti), 2,
  'madre: vede entrambi i figli');
select is((select count(*)::int from clinica.misurazioni), 6,
  'madre: vede le misurazioni di Luca (curve di crescita)');
select is((select count(*)::int from clinica.cartelle), 0,
  'madre: non vede anamnesi e cartella');
select throws_ok($$ insert into anagrafica.consensi (paziente_id, tutore_id, finalita,
                      versione_informativa, stato, canale)
                    values ('d0000000-0000-4000-8000-000000000002',
                            'e0000000-0000-4000-8000-000000000002', 'portale', '2026-10',
                            'concesso', 'portale') $$,
  '42501', null, 'madre: non può dichiarare un consenso al posto del padre');
reset role;

select pg_temp.come('b0000000-0000-4000-8000-000000000002', 'tutore', null);
set local role authenticated;
select is((select count(*)::int from anagrafica.pazienti), 1,
  'padre: vede solo Luca (per Sofia non ha ancora dato il consenso al portale)');
insert into anagrafica.consensi (paziente_id, tutore_id, finalita, versione_informativa, stato, canale)
values ('d0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000002',
        'portale', '2026-10', 'concesso', 'portale');
select is((select count(*)::int from anagrafica.pazienti), 2,
  'padre: dopo il consenso al portale vede anche Sofia');
reset role;

select * from finish();
rollback;
