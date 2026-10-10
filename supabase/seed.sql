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
  ('a0000000-0000-4000-8000-000000000005'::uuid, 'allergologa@example.com'),
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

-- Blocco 5: amministratore dello studio e nomi dello staff
update anagrafica.membri_studio set amministratore = true where utente_id = 'a0000000-0000-4000-8000-000000000001';
update anagrafica.membri_studio set amministratore = true where utente_id = 'a0000000-0000-4000-8000-000000000003';
update anagrafica.membri_studio set nome = 'Giulia', cognome = 'Verdi', email = 'segreteria@example.com'
 where utente_id = 'a0000000-0000-4000-8000-000000000002';
update anagrafica.membri_studio set nome = 'Marco', cognome = 'Gialli', email = 'sostituto@example.com'
 where utente_id = 'a0000000-0000-4000-8000-000000000004';
update anagrafica.membri_studio m set nome = p.nome, cognome = p.cognome, email = p.email
  from anagrafica.pediatri p where p.id = m.utente_id;

-- Modulo Allergologia: attivo nello studio demo, con un'allergologa abilitata e
-- due pazienti inventati (anagrafica separata dagli assistiti del pediatra).
update anagrafica.studi set allergologia_attiva = true, allergologia_attivata_il = now()
 where id = 'c0000000-0000-4000-8000-000000000001';
insert into anagrafica.membri_studio (utente_id, studio_id, ruolo, nome, cognome, email, allergologia, allergologia_abilitato_il)
values ('a0000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000001', 'allergologo',
        'Elena', 'Neri', 'allergologa@example.com', true, now());

insert into anagrafica.allergo_pazienti (id, studio_id, nome, cognome, codice_fiscale_cifrato, codice_fiscale_impronta,
  data_nascita, sesso, genitore_nome, genitore_telefono, pediatra_curante, inviato_da, creato_da) values
  ('e0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'Tommaso', 'Demo',
   anagrafica.cifra_cf('DMOTMS17H05X000E'), anagrafica.impronta_cf('DMOTMS17H05X000E'), current_date - interval '9 years 3 months',
   'M', 'Laura Demo', '0000 222222', 'Dott. Esempio', 'Pediatra di libera scelta', 'a0000000-0000-4000-8000-000000000005'),
  ('e0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', 'Alice', 'Prova',
   anagrafica.cifra_cf('PRVLCA22M50X000F'), anagrafica.impronta_cf('PRVLCA22M50X000F'), current_date - interval '3 years 2 months',
   'F', 'Paolo Prova', '0000 333333', 'Dott.ssa Esempio', 'Pronto soccorso pediatrico', 'a0000000-0000-4000-8000-000000000005');

do $$
declare
  t uuid := (select pseudo_id from pseudonimi.allergo_mappa where paziente_id = 'e0000000-0000-4000-8000-000000000001');
  a uuid := (select pseudo_id from pseudonimi.allergo_mappa where paziente_id = 'e0000000-0000-4000-8000-000000000002');
begin
  update clinica.allergo_cartelle set familiarita = '{"asma: madre","rinite: padre"}', fumo_passivo = false,
    animali = 'Gatto in casa', anamnesi_personale = 'Dermatite atopica nel primo anno di vita.' where pseudo_id = t;
  insert into clinica.allergo_visite (pseudo_id, medico_id, data, tipo, motivo, peso_kg, altezza_cm, conclusioni, piano, prossimo_controllo)
  values (t, 'a0000000-0000-4000-8000-000000000005', now() - interval '5 months', 'prima_visita',
          'Tosse notturna e sibili dopo lo sport', 31.5, 134, 'Asma allergico con sensibilizzazione ad acari',
          'Corticosteroide inalatorio a basse dosi, spirometria al controllo', current_date + 14);
  insert into clinica.allergo_diagnosi (pseudo_id, area, descrizione, data_diagnosi, gravita) values
    (t, 'asma', 'Asma allergico', current_date - 150, 'Lieve persistente'),
    (t, 'rinite', 'Rinite allergica persistente da acari', current_date - 150, 'Moderata-grave');
  insert into clinica.allergo_test (pseudo_id, data, tipo, allergene, valore, unita, esito) values
    (t, current_date - 150, 'prick', 'Istamina (controllo +)', 6, 'mm', 'positivo'),
    (t, current_date - 150, 'prick', 'Soluzione salina (controllo −)', 0, 'mm', 'negativo'),
    (t, current_date - 150, 'prick', 'Dermatophagoides pteronyssinus', 8, 'mm', 'positivo'),
    (t, current_date - 150, 'prick', 'Dermatophagoides farinae', 7, 'mm', 'positivo'),
    (t, current_date - 150, 'prick', 'Gatto (epitelio)', 2, 'mm', 'negativo');
  insert into clinica.allergo_spirometrie (pseudo_id, data, fev1_l, fev1_pct, fvc_l, fvc_pct, fev1_fvc, fev1_post_l, feno_ppb)
  values (t, current_date - 150, 1.62, 82, 2.05, 95, 79.0, 1.85, 38);
  insert into clinica.allergo_punteggi (pseudo_id, data, scala, punteggio, dettagli) values
    (t, current_date - 150, 'c_act', 17, '{"voci":[2,2,2,2,3,3,3]}'),
    (t, current_date - 60, 'c_act', 23, '{"voci":[3,3,3,3,4,4,3]}');
  insert into clinica.allergo_terapie (pseudo_id, farmaco, classe, posologia, dal) values
    (t, 'Fluticasone propionato 50 mcg spray predosato con distanziatore', 'ics', '2 puff × 2/die', current_date - 150),
    (t, 'Salbutamolo 100 mcg spray con distanziatore', 'saba', 'Al bisogno, secondo piano d''azione', current_date - 150);

  insert into clinica.allergo_visite (pseudo_id, medico_id, data, tipo, motivo, peso_kg, conclusioni, piano, prossimo_controllo)
  values (a, 'a0000000-0000-4000-8000-000000000005', now() - interval '20 days', 'urgenza',
          'Orticaria generalizzata e vomito dopo assunzione di anacardi', 14.2,
          'Anafilassi da frutta a guscio (anacardo)', 'Dieta di esclusione, autoiniettore 0,15 mg × 2, piano d''azione',
          current_date + 70);
  insert into clinica.allergo_diagnosi (pseudo_id, area, descrizione, data_diagnosi, gravita) values
    (a, 'allergia_alimentare', 'Allergia IgE-mediata ad anacardo e pistacchio', current_date - 20, null),
    (a, 'anafilassi', 'Anafilassi da alimento', current_date - 20, null);
  insert into clinica.allergo_reazioni (pseudo_id, data, causa_categoria, causa, cute_mucose, gastrointestinale,
    respiratorio, anafilassi, adrenalina, dosi_adrenalina, pronto_soccorso, descrizione)
  values (a, current_date - 21, 'alimento', 'Anacardo (biscotto)', true, true, true, true, true, 1, true,
          'Orticaria diffusa, vomito ripetuto, tosse; adrenalina IM in PS con risoluzione.');
  insert into clinica.allergo_test (pseudo_id, data, tipo, allergene, valore, unita, esito) values
    (a, current_date - 10, 'ige_componenti', 'Ana o 3 (anacardo, 2S albumina)', 4.8, 'kUA/L', 'positivo'),
    (a, current_date - 10, 'ige_specifiche', 'Pistacchio', 2.1, 'kUA/L', 'positivo');
  insert into clinica.allergo_autoiniettori (pseudo_id, dispositivo, dose_mg, numero, peso_kg, data_prescrizione, scadenza)
  values (a, 'Autoiniettore adrenalina', 0.15, 2, 14.2, current_date - 20, current_date + 45);
end;
$$;

-- Allergologia (1900): anamnesi strutturata e dati per il referto (inventati)
update anagrafica.allergo_pazienti set luogo_nascita = 'Città Demo', residenza = 'Città Demo, via degli Esempi 3'
 where id in ('e0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002');
update clinica.allergo_cartelle c set
  anamnesi_familiare = 'Madre: asma allergico. Padre: rinite allergica.',
  anamnesi_fisiologica = 'Primogenito nato a termine da gravidanza normodecorsa, parto spontaneo. PN 3.400 kg. LM esclusivo per 6 mesi. Divezzamento al 6° mese senza problemi.',
  anamnesi_remota = 'Bronchiolite a 4 mesi senza necessità di ossigeno. Dermatite atopica nel primo anno di vita.',
  abitazione = 'In città, apparentemente asciutta', fumo_dettaglio = 'NO', farmaci = 'Ben tollerati i farmaci finora assunti',
  alimentazione = 'Non reazioni avverse ad alimenti', sport = 'Calcio, con tosse da sforzo'
from pseudonimi.allergo_mappa m
where m.pseudo_id = c.pseudo_id and m.paziente_id = 'e0000000-0000-4000-8000-000000000001';
update clinica.allergo_visite v set anamnesi = 'Da circa un anno tosse notturna e sibili dopo lo sport, starnutazioni e prurito nasale al risveglio.',
  test_eseguiti = 'SPT: D. pteronyssinus 8 mm, D. farinae 7 mm, epitelio di gatto negativo, istamina 6 mm.'
from pseudonimi.allergo_mappa m
where m.pseudo_id = v.pseudo_id and m.paziente_id = 'e0000000-0000-4000-8000-000000000001';
