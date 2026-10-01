-- =============================================================================
-- Test di amministrazione dello staff, sostituzioni, notifiche e storico patologie.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path to public, extensions;

select plan(18);

create function pg_temp.come(p_sub uuid, p_ruolo text, p_studio uuid, p_aal text default 'aal2', p_admin boolean default false)
returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_sub, 'role', 'authenticated', 'app_ruolo', p_ruolo, 'app_admin', p_admin,
    'app_studio_id', p_studio, 'aal', p_aal)::text, true);
$$;
grant execute on function pg_temp.come(uuid, text, uuid, text, boolean) to authenticated;

-- hook: il token del pediatra amministratore porta app_admin
select is((public.custom_access_token_hook(jsonb_build_object('user_id', 'a0000000-0000-4000-8000-000000000001', 'claims', '{}'::jsonb))
          -> 'claims' ->> 'app_admin'), 'true', 'il token del titolare indica che è amministratore');

-- ------------------------------------------------ segreteria non amministra
select pg_temp.come('a0000000-0000-4000-8000-000000000002', 'segreteria', 'c0000000-0000-4000-8000-000000000001');
set local role authenticated;
select throws_ok($$ select api.imposta_membro('a0000000-0000-4000-8000-000000000004', false) $$,
  'P0001', 'Solo l''amministratore dello studio gestisce lo staff', 'la segreteria non gestisce lo staff');
reset role;

-- ------------------------------------------------ titolare amministratore
select pg_temp.come('a0000000-0000-4000-8000-000000000001', 'pediatra', 'c0000000-0000-4000-8000-000000000001', 'aal2', true);
set local role authenticated;
select throws_ok($$ select api.imposta_membro('a0000000-0000-4000-8000-000000000001', false) $$,
  'P0001', 'Non puoi disattivare il tuo stesso account', 'l''amministratore non disattiva se stesso');
select lives_ok($$ select set_config('test.sost', api.attiva_sostituzione('a0000000-0000-4000-8000-000000000004',
                     current_date, current_date + 7, 'Luca: rivedere tra 3 giorni')::text, true) $$,
  'il titolare attiva la sostituzione');
select throws_ok($$ select api.attiva_sostituzione('a0000000-0000-4000-8000-000000000004', current_date + 2, current_date + 3) $$,
  'P0001', 'Esiste già una sostituzione in questo periodo', 'niente sostituzioni sovrapposte');
reset role;
select is(sicurezza.responsabile_oggi('a0000000-0000-4000-8000-000000000001'), 'a0000000-0000-4000-8000-000000000004'::uuid,
  'oggi il responsabile dei pazienti del titolare è il sostituto');

-- ------------------------------------------------ sostituto in servizio
select pg_temp.come('a0000000-0000-4000-8000-000000000004', 'sostituto', 'c0000000-0000-4000-8000-000000000001');
set local role authenticated;
select ok((select count(*) from anagrafica.notifiche where tipo = 'sostituzione') = 1, 'il sostituto riceve la notifica di attivazione');
select ok((select testo from anagrafica.notifiche where tipo = 'sostituzione') like '%Consegne: Luca%', 'la notifica contiene le consegne');
select ok(sicurezza.puo_accedere_paziente('d0000000-0000-4000-8000-000000000001'), 'il sostituto accede ai pazienti del titolare');
reset role;

-- richiesta dal portale: notifica al sostituto (di turno) e alla segreteria
delete from anagrafica.notifiche where tipo = 'richiesta_appuntamento';  -- quelle generate dai dati di prova
insert into anagrafica.appuntamenti (paziente_id, studio_id, pediatra_id, prenotato_da, inizio, fine, tipo, stato)
values ('d0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
        'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
        now() + interval '2 days', now() + interval '2 days 20 minutes', 'visita', 'richiesto');
select is((select count(*)::int from anagrafica.notifiche where tipo = 'richiesta_appuntamento'
            and destinatario in ('a0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000002')), 2,
  'la richiesta arriva a sostituto e segreteria');
select is((select count(*)::int from anagrafica.notifiche where tipo = 'richiesta_appuntamento'
            and destinatario = 'a0000000-0000-4000-8000-000000000001'), 0, 'il titolare in sostituzione non la riceve');

-- revoca: il sostituto perde l'accesso
select pg_temp.come('a0000000-0000-4000-8000-000000000001', 'pediatra', 'c0000000-0000-4000-8000-000000000001', 'aal2', true);
set local role authenticated;
select lives_ok($$ select api.revoca_sostituzione(current_setting('test.sost')::uuid) $$, 'il titolare revoca la sostituzione');
-- storico patologie: modifica tracciata con i valori
insert into clinica.patologie_paziente (pseudo_id, patologia, stato)
  values (api.apri_cartella('d0000000-0000-4000-8000-000000000001'), 'celiachia', 'sospetta');
select lives_ok($$ update clinica.patologie_paziente set stato = 'confermata', centro_riferimento = 'Centro X'
                   where patologia = 'celiachia' $$,
  'il pediatra modifica una patologia');
select is((select campi from clinica.patologie_storico where operazione = 'UPDATE' order by id desc limit 1),
  array['centro_riferimento', 'stato'], 'lo storico registra i campi modificati');
reset role;
select pg_temp.come('a0000000-0000-4000-8000-000000000004', 'sostituto', 'c0000000-0000-4000-8000-000000000001');
set local role authenticated;
select ok(not sicurezza.puo_accedere_paziente('d0000000-0000-4000-8000-000000000001'), 'dopo la revoca il sostituto non accede più');
reset role;

-- catalogo patologie: modifica dell'amministratore con storico e motivo
select pg_temp.come('a0000000-0000-4000-8000-000000000001', 'pediatra', 'c0000000-0000-4000-8000-000000000001', 'aal2', true);
set local role authenticated;
update anagrafica.catalogo_patologie set note = 'Nota di prova' where codice = 'asma';
select api.motiva_modifica_catalogo('asma', 'Prova di aggiornamento');
select is((select motivo from anagrafica.catalogo_patologie_storico where codice = 'asma'), 'Prova di aggiornamento',
  'la modifica al catalogo è nello storico con il motivo');
reset role;
select pg_temp.come('a0000000-0000-4000-8000-000000000002', 'segreteria', 'c0000000-0000-4000-8000-000000000001');
set local role authenticated;
update anagrafica.catalogo_patologie set note = 'Manomessa' where codice = 'asma';
reset role;
select is((select note from anagrafica.catalogo_patologie where codice = 'asma'), 'Nota di prova', 'la segreteria non modifica il catalogo');
select pg_temp.come('a0000000-0000-4000-8000-000000000001', 'pediatra', 'c0000000-0000-4000-8000-000000000001', 'aal2', true);
set local role authenticated;
select throws_ok($$ delete from clinica.patologie_paziente $$, '42501', null, 'le patologie del bambino non si cancellano');
reset role;

select * from finish();
rollback;
