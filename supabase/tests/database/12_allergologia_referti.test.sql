-- =============================================================================
-- Allergologia: modelli per tipo di bambino, impostazioni del referto,
-- collegamento alla visita precedente.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path to public, extensions;

select plan(11);

create function pg_temp.come(p_sub uuid, p_ruolo text, p_studio uuid)
returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_sub, 'role', 'authenticated', 'app_ruolo', p_ruolo,
    'app_studio_id', p_studio, 'aal', 'aal2')::text, true);
$$;
grant execute on function pg_temp.come(uuid, text, uuid) to authenticated;

-- ------------------------------------------------ allergologa (abilitata nei dati di prova)
select pg_temp.come('a0000000-0000-4000-8000-000000000005', 'allergologo', 'c0000000-0000-4000-8000-000000000001');
set local role authenticated;
select ok((select count(*) from anagrafica.allergo_modelli where studio_id is null) >= 20, 'l''allergologa vede i modelli predefiniti');
select ok(exists (select 1 from anagrafica.allergo_modelli where codice = 'asma_mart' and profilo = 'asma'), 'c''è il modello per l''asma sopra i 12 anni');
update anagrafica.allergo_modelli set testo = 'x' where codice = 'diario' and studio_id is null;
select isnt((select testo from anagrafica.allergo_modelli where codice = 'diario' and studio_id is null), 'x', 'i modelli predefiniti non si modificano');
select lives_ok($$ insert into anagrafica.allergo_modelli (studio_id, codice, nome, profilo, sezione, testo)
                   values ('c0000000-0000-4000-8000-000000000001', 'diario', 'Diario (mio)', 'generale', 'piano', '- Diario') $$,
  'crea un modello dello studio con lo stesso codice di un predefinito');
select throws_ok($$ insert into anagrafica.allergo_modelli (studio_id, codice, nome, profilo, sezione, testo)
                    values ('c0000000-0000-4000-8000-000000000002', 'z', 'z', 'generale', 'piano', 'z') $$,
  '42501', null, 'non crea modelli per un altro studio');
select lives_ok($$ insert into anagrafica.allergo_impostazioni (studio_id, luogo, firma, email_contatti)
                   values ('c0000000-0000-4000-8000-000000000001', 'Catanzaro', 'Dott.ssa Neri', 'allergologia@example.com') $$,
  'salva le proprie impostazioni del referto');
select lives_ok($$ select set_config('test.paz', api.allergo_registra_paziente('Nuovo', 'Test', 'NVOTST20A01X000Y', '2020-01-01', 'M',
                   p_luogo_nascita => 'Catanzaro', p_residenza => 'Catanzaro, via Roma 1')::text, true) $$,
  'registra un paziente con luogo di nascita e residenza');
select is((select residenza from anagrafica.allergo_pazienti where id = current_setting('test.paz')::uuid), 'Catanzaro, via Roma 1', 'residenza salvata');

-- visita precedente: deve essere dello stesso paziente
select set_config('test.t', api.allergo_apri_cartella('e0000000-0000-4000-8000-000000000001')::text, true);
select set_config('test.a', api.allergo_apri_cartella('e0000000-0000-4000-8000-000000000002')::text, true);
select lives_ok($$ insert into clinica.allergo_visite (pseudo_id, tipo, motivo, visita_precedente_id)
  values (current_setting('test.t')::uuid, 'controllo', 'Controllo clinico',
          (select id from clinica.allergo_visite where pseudo_id = current_setting('test.t')::uuid limit 1)) $$,
  'il controllo richiama la visita precedente dello stesso paziente');
select throws_ok($$ insert into clinica.allergo_visite (pseudo_id, tipo, motivo, visita_precedente_id)
  values (current_setting('test.a')::uuid, 'controllo', 'Controllo clinico',
          (select id from clinica.allergo_visite where pseudo_id = current_setting('test.t')::uuid limit 1)) $$,
  'P0001', 'La visita precedente non appartiene a questo paziente', 'non si collega la visita di un altro paziente');
reset role;

select pg_temp.come('a0000000-0000-4000-8000-000000000002', 'segreteria', 'c0000000-0000-4000-8000-000000000001');
set local role authenticated;
select is((select count(*)::int from anagrafica.allergo_modelli), 0, 'la segreteria non vede i modelli allergologici');
reset role;

select * from finish();
rollback;
