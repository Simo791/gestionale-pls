-- =============================================================================
-- Test del catalogo patologie e delle patologie del bambino (pgTAP).
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

select is((select esenzione from anagrafica.catalogo_patologie where codice = 'turner'), 'RN0680',
  'Turner: codice di malattia rara RN0680');
select is((select esenzione from anagrafica.catalogo_patologie where codice = 'celiachia'), '059',
  'celiachia: codice di patologia cronica 059');
select is((select count(*)::int from anagrafica.catalogo_patologie where tipo = 'rara' and esenzione !~ '^R'), 0,
  'tutte le malattie rare esenti hanno un codice R...');

select is((select esenzione from anagrafica.catalogo_patologie where codice = 'sferocitosi'), 'RDG010',
  'sferocitosi ereditaria: codice RDG010 (anemie ereditarie)');
select ok((select count(*) from anagrafica.catalogo_patologie where tipo = 'rara') >= 70, 'catalogo ampliato con le malattie rare pediatriche frequenti');

select is((select esenzione from anagrafica.catalogo_patologie where codice = 'henoch_schonlein'), 'RD0030',
  'porpora di Henoch-Schönlein ricorrente: RD0030');
select is((select codice from anagrafica.catalogo_diagnosi where 'nefrosi lipoidea' = any(sinonimi)), '581.3',
  'la sindrome nefrosica a lesioni minime si trova per nome tra le diagnosi');

-- pediatra con secondo fattore
select pg_temp.come('a0000000-0000-4000-8000-000000000001', 'pediatra', 'c0000000-0000-4000-8000-000000000001');
set local role authenticated;
select lives_ok($$ insert into clinica.patologie_paziente (pseudo_id, patologia, stato)
                   values (api.apri_cartella('d0000000-0000-4000-8000-000000000001'), 'asma', 'confermata') $$,
  'il pediatra registra una patologia');
select throws_ok($$ insert into clinica.patologie_paziente (pseudo_id, patologia)
                    values (api.apri_cartella('d0000000-0000-4000-8000-000000000001'), 'asma') $$,
  '23505', null, 'la stessa patologia non si registra due volte');
reset role;

-- segreteria: legge il catalogo, non le patologie del bambino
select pg_temp.come('a0000000-0000-4000-8000-000000000002', 'segreteria', 'c0000000-0000-4000-8000-000000000001');
set local role authenticated;
select ok((select count(*) from anagrafica.catalogo_patologie) > 50, 'la segreteria consulta il catalogo');
select is((select count(*)::int from clinica.patologie_paziente), 0, 'la segreteria non vede le patologie (dato clinico)');
reset role;

-- pediatra senza secondo fattore
select pg_temp.come('a0000000-0000-4000-8000-000000000001', 'pediatra', 'c0000000-0000-4000-8000-000000000001', 'aal1');
set local role authenticated;
select is((select count(*)::int from clinica.patologie_paziente), 0, 'senza MFA le patologie non sono visibili');
reset role;

select * from finish();
rollback;
