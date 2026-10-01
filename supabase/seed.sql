-- =============================================================================
-- Dati di esempio — SOLO SVILUPPO LOCALE (supabase db reset)
-- Persone inventate, codici fiscali volutamente non validi.
-- La chiave di cifratura qui sotto è pubblica: in produzione si crea a mano
-- in Supabase Vault con un valore casuale e NON si usa questo file.
-- =============================================================================

-- Crea la chiave solo se manca (online va creata prima a mano, con valore casuale).
select vault.create_secret('chiave-solo-sviluppo-non-usare-in-produzione', 'pls_cf_key')
where not exists (select 1 from vault.decrypted_secrets where name = 'pls_cf_key');

-- -----------------------------------------------------------------------------
-- Utenti (login via OTP email: in locale le email arrivano su Mailpit/Inbucket)
-- -----------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated',
  u.email, '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
from (values
  ('a0000000-0000-4000-8000-000000000001'::uuid, 'pediatra@example.com'),
  ('a0000000-0000-4000-8000-000000000002'::uuid, 'segreteria@example.com'),
  ('a0000000-0000-4000-8000-000000000003'::uuid, 'pediatra.altrostudio@example.com'),
  ('a0000000-0000-4000-8000-000000000004'::uuid, 'sostituto@example.com'),
  ('b0000000-0000-4000-8000-000000000001'::uuid, 'mamma.bianchi@example.com'),
  ('b0000000-0000-4000-8000-000000000002'::uuid, 'papa.bianchi@example.com')
) as u(id, email);

insert into auth.identities (id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', now(), now(), now()
from auth.users u
where u.email like '%@example.com';

-- -----------------------------------------------------------------------------
-- Studi e personale
-- -----------------------------------------------------------------------------
insert into anagrafica.studi (id, nome, asl, indirizzo, telefono) values
  ('c0000000-0000-4000-8000-000000000001', 'Studio Pediatrico Demo', 'ASP Demo',
   'Via degli Esempi 1, Città Demo', '0000 000000'),
  ('c0000000-0000-4000-8000-000000000002', 'Altro Studio Demo', 'ASP Demo',
   'Via di Prova 2, Città Demo', '0000 111111');

insert into anagrafica.membri_studio (utente_id, studio_id, ruolo) values
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'pediatra'),
  ('a0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', 'segreteria'),
  ('a0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000002', 'pediatra'),
  ('a0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000001', 'sostituto');

insert into anagrafica.pediatri (id, studio_id, nome, cognome, codice_regionale, email) values
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
   'Anna', 'Rossi', 'DEMO-0001', 'pediatra@example.com'),
  ('a0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000002',
   'Paolo', 'Neri', 'DEMO-0002', 'pediatra.altrostudio@example.com');

-- Sostituzione già conclusa: il sostituto NON deve vedere la clinica oggi.
insert into anagrafica.sostituzioni (studio_id, titolare_id, sostituto_id, dal, al) values
  ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   'a0000000-0000-4000-8000-000000000004', current_date - 30, current_date - 20);

-- -----------------------------------------------------------------------------
-- Bambini (il trigger crea pseudonimo e cartella)
-- -----------------------------------------------------------------------------
insert into anagrafica.pazienti (id, studio_id, pediatra_id, nome, cognome,
  codice_fiscale_cifrato, codice_fiscale_impronta, data_nascita, sesso) values
  ('d0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
   'a0000000-0000-4000-8000-000000000001', 'Luca', 'Bianchi',
   anagrafica.cifra_cf('DEMLCU23C10X000A'), anagrafica.impronta_cf('DEMLCU23C10X000A'),
   date '2023-03-10', 'M'),
  ('d0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001',
   'a0000000-0000-4000-8000-000000000001', 'Sofia', 'Bianchi',
   anagrafica.cifra_cf('DEMSFO20L62X000B'), anagrafica.impronta_cf('DEMSFO20L62X000B'),
   date '2020-07-22', 'F'),
  ('d0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000002',
   'a0000000-0000-4000-8000-000000000003', 'Marta', 'Gialli',
   anagrafica.cifra_cf('DEMMRT21A41X000C'), anagrafica.impronta_cf('DEMMRT21A41X000C'),
   date '2021-01-01', 'F');

-- -----------------------------------------------------------------------------
-- Tutori, relazioni, consensi
-- -----------------------------------------------------------------------------
insert into anagrafica.tutori (id, studio_id, utente_id, nome, cognome,
  codice_fiscale_cifrato, codice_fiscale_impronta, email, telefono) values
  ('e0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
   'b0000000-0000-4000-8000-000000000001', 'Giulia', 'Verdi',
   anagrafica.cifra_cf('DEMGLI90A41X000D'), anagrafica.impronta_cf('DEMGLI90A41X000D'),
   'mamma.bianchi@example.com', '+39 000 0000001'),
  ('e0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001',
   'b0000000-0000-4000-8000-000000000002', 'Marco', 'Bianchi',
   anagrafica.cifra_cf('DEMMRC88A01X000E'), anagrafica.impronta_cf('DEMMRC88A01X000E'),
   'papa.bianchi@example.com', '+39 000 0000002');

insert into anagrafica.relazioni_tutela (paziente_id, tutore_id, tipo) values
  ('d0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'madre'),
  ('d0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002', 'padre'),
  ('d0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001', 'madre'),
  ('d0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000002', 'padre');

-- Luca: consensi completi da entrambi. Sofia: solo la madre → consenso "parziale".
insert into anagrafica.consensi (paziente_id, tutore_id, finalita, versione_informativa,
  stato, canale, registrato_da)
select c.paziente_id::uuid, c.tutore_id::uuid, c.finalita, '2026-10', 'concesso',
  'cartaceo_studio', 'a0000000-0000-4000-8000-000000000002'
from (values
  ('d0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'portale'),
  ('d0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'dati_sanitari'),
  ('d0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002', 'portale'),
  ('d0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002', 'dati_sanitari'),
  ('d0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001', 'portale'),
  ('d0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001', 'dati_sanitari')
) as c(paziente_id, tutore_id, finalita);

-- -----------------------------------------------------------------------------
-- Agenda e dati clinici di esempio
-- -----------------------------------------------------------------------------
insert into anagrafica.appuntamenti (studio_id, pediatra_id, paziente_id, prenotato_da,
  inizio, fine, tipo, stato) values
  ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   'd0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002',
   date_trunc('day', now()) + interval '1 day 9 hours',
   date_trunc('day', now()) + interval '1 day 9 hours 20 minutes', 'bilancio_salute', 'confermato'),
  ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   'd0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001',
   date_trunc('day', now()) + interval '2 days 10 hours',
   date_trunc('day', now()) + interval '2 days 10 hours 20 minutes', 'visita', 'richiesto');

insert into clinica.misurazioni (pseudo_id, eta_giorni, peso_kg, altezza_cm, circonferenza_cranica_cm)
select m.pseudo_id, v.eta, v.peso, v.altezza, v.cc
from pseudonimi.mappa m
cross join (values
  (30,  4.4, 54.5, 37.0),
  (90,  6.1, 60.5, 40.2),
  (180, 7.8, 67.5, 43.5),
  (365, 9.9, 75.8, 46.1),
  (730, 12.4, 87.6, 48.3)
) as v(eta, peso, altezza, cc)
where m.paziente_id = 'd0000000-0000-4000-8000-000000000001';

update clinica.cartelle c
set allergie = array['Nessuna allergia nota'], note_anamnesi = 'Nato a termine, allattamento materno.'
from pseudonimi.mappa m
where m.pseudo_id = c.pseudo_id and m.paziente_id = 'd0000000-0000-4000-8000-000000000001';

-- Profilo professionale di esempio del pediatra (dati inventati)
update anagrafica.pediatri set ordine_provincia = 'Catanzaro', ordine_numero = '00000',
  partita_iva = '00000000000', telefono = '0000 000000'
where id = 'a0000000-0000-4000-8000-000000000001';
