-- =============================================================================
-- Test della coda messaggi WhatsApp (pgTAP).
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path to public, extensions;

select plan(11);

create function pg_temp.come(p_sub uuid, p_ruolo text, p_studio uuid, p_aal text default 'aal1')
returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_sub, 'role', 'authenticated', 'app_ruolo', p_ruolo,
    'app_studio_id', p_studio, 'aal', p_aal)::text, true);
$$;
grant execute on function pg_temp.come(uuid, text, uuid, text) to authenticated;

-- La madre di Luca e Sofia accetta i messaggi WhatsApp; il padre no.
insert into anagrafica.consensi (paziente_id, tutore_id, finalita, versione_informativa, stato, canale, registrato_da)
values ('d0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'whatsapp', '2026-10', 'concesso', 'cartaceo_studio', 'a0000000-0000-4000-8000-000000000002'),
       ('d0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001', 'whatsapp', '2026-10', 'concesso', 'cartaceo_studio', 'a0000000-0000-4000-8000-000000000002');

-- ---------------------------------------------------------------- la segreteria fissa un bilancio
select pg_temp.come('a0000000-0000-4000-8000-000000000002', 'segreteria',
                    'c0000000-0000-4000-8000-000000000001', 'aal2');
set local role authenticated;
insert into anagrafica.appuntamenti (id, studio_id, pediatra_id, paziente_id, inizio, fine, tipo, stato)
values ('f0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
        'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
        date_trunc('day', now()) + interval '45 days 9 hours', date_trunc('day', now()) + interval '45 days 9 hours 20 minutes',
        'bilancio_salute', 'confermato');
reset role;

select is((select count(*)::int from anagrafica.messaggi_outbox
           where appuntamento_id = 'f0000000-0000-4000-8000-000000000001' and stato = 'in_coda'), 3,
  'bilancio confermato: 1 conferma + promemoria a 30 e 5 giorni');
select is((select count(distinct tutore_id)::int from anagrafica.messaggi_outbox
           where appuntamento_id = 'f0000000-0000-4000-8000-000000000001'), 1,
  'solo il genitore con consenso WhatsApp riceve i messaggi');
select is((select (programmato_per at time zone 'Europe/Rome')::time from anagrafica.messaggi_outbox
           where appuntamento_id = 'f0000000-0000-4000-8000-000000000001' and giorni_prima = 30),
  time '10:00', 'il promemoria parte alle 10:00 ora italiana');

-- ---------------------------------------------------------------- spostamento e annullamento
update anagrafica.appuntamenti set inizio = inizio + interval '1 day', fine = fine + interval '1 day'
where id = 'f0000000-0000-4000-8000-000000000001';
select is((select count(*)::int from anagrafica.messaggi_outbox
           where appuntamento_id = 'f0000000-0000-4000-8000-000000000001' and stato = 'in_coda'), 3,
  'spostamento: i messaggi vengono riprogrammati');
select is((select count(*)::int from anagrafica.messaggi_outbox
           where appuntamento_id = 'f0000000-0000-4000-8000-000000000001' and stato = 'annullato'), 3,
  'spostamento: i vecchi messaggi sono annullati');

update anagrafica.appuntamenti set stato = 'annullato' where id = 'f0000000-0000-4000-8000-000000000001';
select is((select count(*)::int from anagrafica.messaggi_outbox
           where appuntamento_id = 'f0000000-0000-4000-8000-000000000001' and stato = 'in_coda'), 0,
  'annullamento: nessun messaggio resta in coda');

-- ---------------------------------------------------------------- richiesta del genitore
select pg_temp.come('b0000000-0000-4000-8000-000000000001', 'tutore', null);
set local role authenticated;
insert into anagrafica.appuntamenti (id, studio_id, pediatra_id, paziente_id, prenotato_da, inizio, fine, tipo, stato)
values ('f0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001',
        'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002',
        'b0000000-0000-4000-8000-000000000001',
        date_trunc('day', now()) + interval '10 days 15 hours', date_trunc('day', now()) + interval '10 days 15 hours 20 minutes',
        'visita', 'richiesto');
reset role;
select is((select count(*)::int from anagrafica.messaggi_outbox
           where appuntamento_id = 'f0000000-0000-4000-8000-000000000002'), 0,
  'richiesta del genitore: nessun messaggio finché non è confermata');

update anagrafica.appuntamenti set stato = 'confermato' where id = 'f0000000-0000-4000-8000-000000000002';
select is((select tipo from anagrafica.messaggi_outbox
           where appuntamento_id = 'f0000000-0000-4000-8000-000000000002'), 'conferma',
  'conferma della segreteria: parte il messaggio di conferma (nessun promemoria per le visite)');

-- ---------------------------------------------------------------- accessi
select pg_temp.come('a0000000-0000-4000-8000-000000000002', 'segreteria',
                    'c0000000-0000-4000-8000-000000000001', 'aal2');
set local role authenticated;
select ok((select count(*) from anagrafica.messaggi_outbox) > 0,
  'la segreteria vede lo stato degli invii del proprio studio');
select throws_ok($$ select * from api.invio_messaggi_dovuti() $$, '42501', null,
  'gli utenti dell''app non possono leggere la coda di invio con i telefoni');
reset role;

set local role service_role;
select set_config('test.dovuti', (select count(*) from api.invio_messaggi_dovuti() where tipo = 'conferma')::text, true);
reset role;
select is(current_setting('test.dovuti')::int, 1, 'la Edge Function trova la conferma da inviare');

select * from finish();
rollback;
