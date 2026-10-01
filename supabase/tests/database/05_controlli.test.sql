-- =============================================================================
-- Test di catalogo controlli, esiti e scadenze (pgTAP).
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path to public, extensions;

select plan(7);

create function pg_temp.come(p_sub uuid, p_ruolo text, p_studio uuid, p_aal text default 'aal1')
returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_sub, 'role', 'authenticated', 'app_ruolo', p_ruolo,
    'app_studio_id', p_studio, 'aal', p_aal)::text, true);
$$;
grant execute on function pg_temp.come(uuid, text, uuid, text) to authenticated;

-- Un neonato di 30 giorni: deve comparire l'ecografia delle anche (4ª–6ª settimana)
insert into anagrafica.pazienti (id, studio_id, pediatra_id, nome, cognome, codice_fiscale_cifrato,
  codice_fiscale_impronta, data_nascita, sesso)
values ('d0000000-0000-4000-8000-000000000009', 'c0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001', 'Neo', 'Nato', anagrafica.cifra_cf('DEMNEO26A01X000Z'),
  anagrafica.impronta_cf('DEMNEO26A01X000Z'), current_date - 30, 'M');

select ok((select count(*) from anagrafica.catalogo_controlli where fonte_url like 'https://%') >= 10,
  'ogni controllo del catalogo ha una fonte con link');

-- ---------------------------------------------------------------- pediatra
select pg_temp.come('a0000000-0000-4000-8000-000000000001', 'pediatra',
                    'c0000000-0000-4000-8000-000000000001', 'aal2');
set local role authenticated;
select ok(exists (select 1 from api.controlli_in_scadenza(30)
                  where paziente_id = 'd0000000-0000-4000-8000-000000000009' and codice = 'eco_anche'),
  'neonato di 30 giorni: ecografia delle anche in scadenza');
select ok(not exists (select 1 from api.controlli_in_scadenza(30)
                      where paziente_id = 'd0000000-0000-4000-8000-000000000009' and codice = 'udito_rischio'),
  'la sorveglianza audiologica compare solo con fattori di rischio');
select lives_ok($$ insert into clinica.controlli_eseguiti (pseudo_id, codice_controllo, esito)
                   values (api.apri_cartella('d0000000-0000-4000-8000-000000000009'), 'eco_anche', 'nella_norma') $$,
  'il pediatra registra l''esito');
select ok(not exists (select 1 from api.controlli_in_scadenza(30)
                      where paziente_id = 'd0000000-0000-4000-8000-000000000009' and codice = 'eco_anche'),
  'dopo l''esito il controllo non è più in scadenza');
reset role;

-- ---------------------------------------------------------------- segreteria
select pg_temp.come('a0000000-0000-4000-8000-000000000002', 'segreteria',
                    'c0000000-0000-4000-8000-000000000001', 'aal2');
set local role authenticated;
select throws_ok($$ select * from api.controlli_in_scadenza() $$, 'P0001', null,
  'la segreteria non vede gli esiti clinici dei controlli');
select is((select count(*)::int from clinica.controlli_eseguiti), 0,
  'la segreteria non legge la tabella degli esiti');
reset role;

select * from finish();
rollback;
