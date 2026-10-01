-- =============================================================================
-- Test di calendario vaccinale, allergie e profilo professionale (pgTAP).
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path to public, extensions;

select plan(9);

create function pg_temp.come(p_sub uuid, p_ruolo text, p_studio uuid, p_aal text default 'aal1')
returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_sub, 'role', 'authenticated', 'app_ruolo', p_ruolo,
    'app_studio_id', p_studio, 'aal', p_aal)::text, true);
$$;
grant execute on function pg_temp.come(uuid, text, uuid, text) to authenticated;

select is((select count(*)::int from anagrafica.calendario_vaccinale where obbligatoria), 7,
  'calendario: 7 dosi obbligatorie (3 esavalente, 2 MPRV, 2 richiami DTP-polio)');
select is((select count(*)::int from anagrafica.catalogo_allergeni where categoria = 'alimento'), 15,
  'catalogo allergeni: i 14 allergeni del Reg. UE 1169/2011 più frutta e verdura fresche');

-- ---------------------------------------------------------------- pediatra
select pg_temp.come('a0000000-0000-4000-8000-000000000001', 'pediatra',
                    'c0000000-0000-4000-8000-000000000001', 'aal2');
set local role authenticated;
update anagrafica.pediatri set partita_iva = '12345678901', ordine_numero = '1234' where id = 'a0000000-0000-4000-8000-000000000001';
select is((select partita_iva from anagrafica.pediatri where id = 'a0000000-0000-4000-8000-000000000001'), '12345678901',
  'il pediatra aggiorna il proprio profilo');
select throws_ok($$ update anagrafica.pediatri set partita_iva = '123' where id = 'a0000000-0000-4000-8000-000000000001' $$,
  '23514', null, 'la partita IVA deve avere 11 cifre');
update anagrafica.studi set telefono = '0961 000000' where id = 'c0000000-0000-4000-8000-000000000001';
select is((select telefono from anagrafica.studi where id = 'c0000000-0000-4000-8000-000000000001'), '0961 000000',
  'il pediatra aggiorna i dati dello studio');
select lives_ok($$ insert into clinica.allergie (pseudo_id, allergene, gravita, stato, test)
                   values (api.apri_cartella('d0000000-0000-4000-8000-000000000001'), 'uovo', 'lieve', 'sospetta', array['prick']) $$,
  'il pediatra registra un''allergia');
reset role;

-- ---------------------------------------------------------------- segreteria
select pg_temp.come('a0000000-0000-4000-8000-000000000002', 'segreteria',
                    'c0000000-0000-4000-8000-000000000001', 'aal2');
set local role authenticated;
update anagrafica.pediatri set partita_iva = '99999999999';
reset role;
select is((select partita_iva from anagrafica.pediatri where id = 'a0000000-0000-4000-8000-000000000001'), '12345678901',
  'la segreteria non modifica il profilo del pediatra');
set local role authenticated;
select is((select count(*)::int from clinica.allergie), 0, 'la segreteria non vede le allergie (dato clinico)');
reset role;

-- ---------------------------------------------------------------- altro studio
select pg_temp.come('a0000000-0000-4000-8000-000000000003', 'pediatra',
                    'c0000000-0000-4000-8000-000000000002', 'aal2');
set local role authenticated;
update anagrafica.studi set nome = 'Manomesso' where id = 'c0000000-0000-4000-8000-000000000001';
reset role;
select is((select nome from anagrafica.studi where id = 'c0000000-0000-4000-8000-000000000001'), 'Studio Pediatrico Demo',
  'un pediatra non modifica lo studio di un altro');

select * from finish();
rollback;
