-- Invio dei documenti di una visita via email / WhatsApp con link personale e codice.
begin;
create extension if not exists pgtap with schema extensions;
set search_path to public, extensions;
select plan(18);

create function pg_temp.come(p_sub uuid, p_ruolo text, p_admin boolean default false)
returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_sub, 'role', 'authenticated', 'app_ruolo', p_ruolo,
    'app_admin', p_admin, 'app_studio_id', 'c0000000-0000-4000-8000-000000000001', 'aal', 'aal2')::text, true);
$$;
grant execute on function pg_temp.come(uuid, text, boolean) to authenticated;

-- segreteria: non invia documenti clinici
select pg_temp.come('a0000000-0000-4000-8000-000000000002', 'segreteria');
set local role authenticated;
select throws_ok($$ select * from api.prepara_invio('d0000000-0000-4000-8000-000000000001', null, null, 'email',
                    'mamma@example.com', null, 'Visita del 11/10/2026', true) $$, 'P0001', null,
  'la segreteria non invia documenti clinici');
reset role;

-- il padre ha negato l'invio dei documenti
insert into anagrafica.consensi (paziente_id, tutore_id, finalita, versione_informativa, stato, canale)
values ('d0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002', 'invio_documenti', '2026-10', 'negato', 'cartaceo_studio');

select pg_temp.come('a0000000-0000-4000-8000-000000000001', 'pediatra', true);
set local role authenticated;
select throws_ok($$ select * from api.prepara_invio('d0000000-0000-4000-8000-000000000001', null, 'e0000000-0000-4000-8000-000000000002', 'email',
                    'papa@example.com', null, 'Visita', true) $$, 'P0001', null, 'niente invio a chi ha negato il consenso');
select throws_ok($$ select * from api.prepara_invio('d0000000-0000-4000-8000-000000000001', null, null, 'email',
                    'mamma@example.com', null, 'Visita', false) $$, 'P0001', null,
  'serve la conferma che il genitore ha chiesto l''invio');
select throws_ok($$ select * from api.prepara_invio('d0000000-0000-4000-8000-000000000001', null, null, 'email',
                    'non-una-email', null, 'Visita', true) $$, 'P0001', 'Indirizzo email non valido', 'email controllata');
select throws_ok($$ select * from api.prepara_invio('d0000000-0000-4000-8000-000000000001', null, 'e0000000-0000-4000-8000-000000000003', 'email',
                    'x@example.com', null, 'Visita', true) $$, 'P0001', null, 'il genitore deve essere collegato al bambino');
select lives_ok($$ select set_config('test.invio', (select row_to_json(r)::text from api.prepara_invio('d0000000-0000-4000-8000-000000000001', null,
                    'e0000000-0000-4000-8000-000000000001', 'whatsapp', '333 123 4567', 'Giulia Verdi', 'Visita del 11/10/2026', true) r), true) $$,
  'il pediatra prepara l''invio su WhatsApp');
select is((select destinatario from anagrafica.invii_documenti where id = (current_setting('test.invio')::json ->> 'id')::uuid), '+393331234567',
  'il numero è normalizzato con il prefisso internazionale');
select throws_ok(format($$ select api.completa_invio(%L, '[{"nome":"Referto.pdf","percorso":"altro/x.pdf"}]') $$, current_setting('test.invio')::json ->> 'id'),
  'P0001', 'Documento non valido', 'i file devono stare nella cartella dell''invio');
select lives_ok(format($$ select api.completa_invio(%L, %L) $$, current_setting('test.invio')::json ->> 'id',
  json_build_array(json_build_object('nome', 'Referto.pdf', 'percorso',
    'c0000000-0000-4000-8000-000000000001/' || (current_setting('test.invio')::json ->> 'id') || '/1.pdf'))::text),
  'registra i PDF caricati');
select lives_ok(format($$ select api.esito_invio(%L, 'consegnato_manualmente') $$, current_setting('test.invio')::json ->> 'id'),
  'invio fatto dallo studio con WhatsApp');
select is((select count(*)::int from anagrafica.invii_documenti), 1, 'lo staff vede il registro degli invii');
select throws_ok($$ select api.ritiro_documenti('x', '10032023') $$, '42501', null, 'il ritiro non si chiama dall''app dello staff');
reset role;

-- ritiro dalla funzione pubblica (service role)
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select set_config('test.r1', api.ritiro_documenti('token-sbagliato', '10032023')::text, true);
select set_config('test.r2', api.ritiro_documenti(current_setting('test.invio')::json ->> 'token', '01012020')::text, true);
select set_config('test.r3', api.ritiro_documenti(current_setting('test.invio')::json ->> 'token', '10/03/2023')::text, true);
reset role;
select is(current_setting('test.r1')::jsonb ->> 'motivo', 'link_non_valido', 'link sconosciuto rifiutato');
select is(current_setting('test.r2')::jsonb ->> 'motivo', 'codice_errato', 'codice errato');
select is((current_setting('test.r3')::jsonb ->> 'ok')::boolean, true, 'con la data di nascita del bambino i documenti si aprono');
select is((select ritiri from anagrafica.invii_documenti), 1, 'il ritiro è contato');

select pg_temp.come('a0000000-0000-4000-8000-000000000001', 'pediatra', true);
set local role authenticated;
select lives_ok(format($$ select api.revoca_invio(%L) $$, current_setting('test.invio')::json ->> 'id'), 'il pediatra revoca il link');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select set_config('test.r4', api.ritiro_documenti(current_setting('test.invio')::json ->> 'token', '10032023')::text, true);
reset role;
select is(current_setting('test.r4')::jsonb ->> 'motivo', 'revocato', 'link revocato: niente documenti');

select * from finish();
rollback;
