-- =============================================================================
-- Correzioni di sicurezza (migrazione 2400).
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path to public, extensions;
select plan(14);

create function pg_temp.come(p_sub uuid, p_ruolo text, p_studio uuid, p_admin boolean default false)
returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_sub, 'role', 'authenticated', 'app_ruolo', p_ruolo,
    'app_admin', p_admin, 'app_studio_id', p_studio, 'aal', 'aal2', 'email', 'x@example.com')::text, true);
$$;
grant execute on function pg_temp.come(uuid, text, uuid, boolean) to authenticated;

-- segreteria resa amministratore (beta)
update anagrafica.membri_studio set amministratore = true where utente_id = 'a0000000-0000-4000-8000-000000000002';
select pg_temp.come('a0000000-0000-4000-8000-000000000002', 'segreteria', 'c0000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select ok(not sicurezza.allergologia_ok(), 'la segreteria amministratore NON accede ai dati allergologici');
select is((select count(*)::int from clinica.allergo_diagnosi), 0, 'e non legge le diagnosi allergologiche');
select throws_ok($$ select api.imposta_amministratore('a0000000-0000-4000-8000-000000000001', false) $$, 'P0001',
  'Solo un pediatra amministratore può revocare il ruolo a un pediatra', 'non toglie il ruolo al pediatra titolare');
select throws_ok($$ select anagrafica.decifra_cf(codice_fiscale_cifrato) from anagrafica.pazienti $$, '42501', null,
  'il codice fiscale non si decifra senza registro accessi');
select throws_ok($$ update anagrafica.pazienti set pediatra_id = 'a0000000-0000-4000-8000-000000000003' where id = 'd0000000-0000-4000-8000-000000000001' $$,
  'P0001', 'Il pediatra indicato non appartiene allo studio del paziente', 'i pazienti non passano a pediatri di altri studi');
reset role;

-- pediatra di un altro studio: niente appuntamenti per pazienti altrui
select pg_temp.come('a0000000-0000-4000-8000-000000000003', 'pediatra', 'c0000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select throws_ok($$ insert into anagrafica.appuntamenti (paziente_id, studio_id, pediatra_id, inizio, fine, tipo, stato)
  values ('d0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000003',
          now() + interval '1 day', now() + interval '1 day 20 minutes', 'visita', 'confermato') $$,
  'P0001', 'Paziente e pediatra devono appartenere allo studio dell''appuntamento', 'niente appuntamenti tra studi diversi');
reset role;

-- genitore
select pg_temp.come('b0000000-0000-4000-8000-000000000001', 'tutore', null);
set local role authenticated;
select is((select count(*)::int from anagrafica.appuntamenti), 0, 'il genitore non legge la tabella appuntamenti (note interne)');
select lives_ok($$ select * from api.appuntamenti_figlio('d0000000-0000-4000-8000-000000000001') $$, 'ma vede data e stato con la RPC');
select throws_ok($$ select * from api.appuntamenti_figlio('d0000000-0000-4000-8000-000000000003') $$, 'P0001', 'Non autorizzato',
  'non vede gli appuntamenti di bambini non suoi');
insert into anagrafica.consensi (paziente_id, tutore_id, finalita, versione_informativa, stato, canale, registrato_il, registrato_da)
values ('d0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'comunicazioni', '2026-10', 'concesso', 'portale',
        '2099-01-01', 'a0000000-0000-4000-8000-000000000001');
reset role;
select ok((select registrato_il < now() + interval '1 minute' and registrato_da = 'b0000000-0000-4000-8000-000000000001'
           from anagrafica.consensi where finalita = 'comunicazioni' order by registrato_il desc limit 1),
  'data e autore del consenso li fissa il database');

-- collegamento con email non verificata
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'f0000000-0000-4000-8000-000000000009', 'authenticated', 'authenticated',
        'nonverificata@example.com', '', now(), now());
select set_config('request.jwt.claims', jsonb_build_object('sub', 'f0000000-0000-4000-8000-000000000009', 'role', 'authenticated',
  'app_ruolo', 'nessuno', 'email', 'nonverificata@example.com')::text, true);
set local role authenticated;
select throws_ok($$ select api.collega_account_tutore() $$, 'P0001', 'Email non verificata: accedi con il codice ricevuto via email',
  'niente collegamento senza email verificata');
reset role;

-- revoca WhatsApp: i messaggi in coda vengono annullati
select ok(exists (select 1 from anagrafica.appuntamenti where paziente_id = 'd0000000-0000-4000-8000-000000000001' and inizio > now()),
  'premessa: c''è un appuntamento futuro a cui collegare il messaggio');
insert into anagrafica.messaggi_outbox (studio_id, appuntamento_id, tutore_id, tipo, programmato_per)
select a.studio_id, a.id, 'e0000000-0000-4000-8000-000000000001', 'promemoria', now() + interval '1 hour'
from anagrafica.appuntamenti a where a.paziente_id = 'd0000000-0000-4000-8000-000000000001' and a.inizio > now() limit 1
on conflict do nothing;
insert into anagrafica.consensi (paziente_id, tutore_id, finalita, versione_informativa, stato, canale, registrato_da)
values ('d0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'whatsapp', '2026-10', 'revocato',
        'cartaceo_studio', 'a0000000-0000-4000-8000-000000000002');
select is((select count(*)::int from anagrafica.messaggi_outbox o join anagrafica.appuntamenti a on a.id = o.appuntamento_id
           where a.paziente_id = 'd0000000-0000-4000-8000-000000000001' and o.tutore_id = 'e0000000-0000-4000-8000-000000000001'
             and o.stato = 'in_coda'), 0, 'la revoca del consenso WhatsApp annulla i messaggi in coda');

-- l'allergologo amministratore vede lo staff dello studio
update anagrafica.membri_studio set amministratore = true where utente_id = 'a0000000-0000-4000-8000-000000000005';
select pg_temp.come('a0000000-0000-4000-8000-000000000005', 'allergologo', 'c0000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select ok((select count(*) from anagrafica.membri_studio) > 1, 'l''allergologo amministratore vede lo staff dello studio');
reset role;

select * from finish();
rollback;
