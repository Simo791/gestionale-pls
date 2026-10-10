-- =============================================================================
-- Test di modelli di testo, catalogo diagnosi, certificati e richiami.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path to public, extensions;

select plan(10);

create function pg_temp.come(p_sub uuid, p_ruolo text, p_studio uuid, p_aal text default 'aal2', p_admin boolean default false)
returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_sub, 'role', 'authenticated', 'app_ruolo', p_ruolo, 'app_admin', p_admin,
    'app_studio_id', p_studio, 'aal', p_aal)::text, true);
$$;
grant execute on function pg_temp.come(uuid, text, uuid, text, boolean) to authenticated;

select ok((select count(*) from anagrafica.catalogo_diagnosi) >= 70, 'catalogo diagnosi caricato');
select is((select codice from anagrafica.catalogo_diagnosi where 'bronchiolite' = any(sinonimi) and descrizione ilike '%sinciziale%'), '466.11',
  'la bronchiolite da VRS si trova per nome');

-- pediatra
select pg_temp.come('a0000000-0000-4000-8000-000000000001', 'pediatra', 'c0000000-0000-4000-8000-000000000001', 'aal2', true);
set local role authenticated;
select lives_ok($$ insert into anagrafica.modelli_testo (campo, patologia, nome, testo)
                   values ('esame_obiettivo', 'Faringite', 'Faringe iperemica', 'Faringe iperemica, tonsille ipertrofiche.') $$,
  'il pediatra crea un modello di esame obiettivo');
select lives_ok($$ insert into clinica.certificati (pseudo_id, tipo, contenuto)
                   values (api.apri_cartella('d0000000-0000-4000-8000-000000000001'), 'dieta_speciale', '{"allergeni":["uovo"]}') $$,
  'il pediatra registra un certificato di dieta speciale');
select lives_ok($$ insert into clinica.visite (pseudo_id, motivo, accompagnatori)
                   values (api.apri_cartella('d0000000-0000-4000-8000-000000000001'), 'Controllo', array['Madre', 'Nonna']) $$,
  'la visita registra chi accompagna il bambino');
reset role;

-- segreteria
select pg_temp.come('a0000000-0000-4000-8000-000000000002', 'segreteria', 'c0000000-0000-4000-8000-000000000001');
set local role authenticated;
select is((select count(*)::int from anagrafica.modelli_testo), 0, 'la segreteria non vede i modelli clinici');
select is((select count(*)::int from clinica.certificati), 0, 'la segreteria non vede i certificati');
select lives_ok($$ insert into anagrafica.richiami (paziente_id, motivo, ricontattare_dal)
                   values ('d0000000-0000-4000-8000-000000000001', 'Non può venire martedì', current_date + 7) $$,
  'la segreteria aggiunge un paziente alla lista da ricontattare');
select throws_ok($$ insert into anagrafica.catalogo_diagnosi (codice, descrizione) values ('999.9', 'Prova') $$,
  '42501', null, 'solo l''amministratore aggiunge diagnosi');
reset role;

-- altro studio
select pg_temp.come('a0000000-0000-4000-8000-000000000003', 'pediatra', 'c0000000-0000-4000-8000-000000000002');
set local role authenticated;
select is((select count(*)::int from anagrafica.richiami), 0, 'un altro studio non vede la lista da ricontattare');
reset role;

select * from finish();
rollback;
