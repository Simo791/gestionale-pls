-- Anamnesi guidata (sonno, scelte) e immagini di riferimento SCORAD.
begin;
create extension if not exists pgtap with schema extensions;
set search_path to public, extensions;
select plan(5);

create function pg_temp.come(p_sub uuid, p_ruolo text)
returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_sub, 'role', 'authenticated', 'app_ruolo', p_ruolo,
    'app_studio_id', 'c0000000-0000-4000-8000-000000000001', 'aal', 'aal2')::text, true);
$$;
grant execute on function pg_temp.come(uuid, text) to authenticated;

select pg_temp.come('a0000000-0000-4000-8000-000000000005', 'allergologo');
set local role authenticated;
select set_config('test.p', api.allergo_apri_cartella('e0000000-0000-4000-8000-000000000001')::text, true);
select lives_ok($$ update clinica.allergo_cartelle set sonno = 'Sonno tranquillo, roncopatia.',
                   anamnesi_scelte = '{"sonno":{"voci":["Sonno tranquillo","Roncopatia"],"note":""}}'
                   where pseudo_id = current_setting('test.p')::uuid $$, 'salva sonno e scelte guidate');
select lives_ok($$ insert into anagrafica.allergo_scorad_immagini (studio_id, voce, grado, immagine, fonte)
                   values ('c0000000-0000-4000-8000-000000000001', 0, 2, 'data:image/jpeg;base64,AAAA', 'Archivio ambulatorio') $$,
  'carica un''immagine di riferimento');
select throws_ok($$ insert into anagrafica.allergo_scorad_immagini (studio_id, voce, grado, immagine, fonte)
                    values ('c0000000-0000-4000-8000-000000000001', 0, 3, 'https://esempio.it/foto.jpg', 'x') $$,
  '23514', null, 'solo immagini incorporate (niente link esterni)');
reset role;

select pg_temp.come('a0000000-0000-4000-8000-000000000002', 'segreteria');
set local role authenticated;
select is((select count(*)::int from anagrafica.allergo_scorad_immagini), 0, 'la segreteria non vede le immagini');
select throws_ok($$ insert into anagrafica.allergo_scorad_immagini (studio_id, voce, grado, immagine, fonte)
                    values ('c0000000-0000-4000-8000-000000000001', 1, 1, 'data:image/jpeg;base64,AAAA', 'x') $$,
  '42501', null, 'e non può caricarle');
reset role;
select * from finish();
rollback;
