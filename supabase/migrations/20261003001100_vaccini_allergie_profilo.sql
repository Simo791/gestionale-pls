-- =============================================================================
-- 1100 · Calendario vaccinale, allergie strutturate, profilo professionale
-- Contenuti di consultazione con fonte: non sostituiscono il giudizio clinico
-- né il calendario vaccinale della propria Regione.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Calendario vaccinale (PNPV 2023-2025, prorogato al 31/12/2026)
-- Il nome del vaccino coincide con clinica.vaccinazioni.vaccino.
-- -----------------------------------------------------------------------------
create table anagrafica.calendario_vaccinale (
  codice          text primary key,
  vaccino         text not null,
  dose            smallint not null,
  eta_da_giorni   integer not null,
  eta_a_giorni    integer not null,
  obbligatoria    boolean not null,
  quando          text not null,          -- descrizione leggibile dell'età
  note            text,
  ordine          smallint not null,
  unique (vaccino, dose),
  check (eta_a_giorni >= eta_da_giorni)
);
alter table anagrafica.calendario_vaccinale enable row level security;
grant select on anagrafica.calendario_vaccinale to authenticated;
create policy staff_legge_calendario_vaccinale on anagrafica.calendario_vaccinale
  for select to authenticated using (sicurezza.is_staff());

insert into anagrafica.calendario_vaccinale
  (codice, vaccino, dose, eta_da_giorni, eta_a_giorni, obbligatoria, quando, note, ordine) values
('esa1', 'Esavalente', 1, 61, 90, true, '3° mese (dal 61° giorno)', 'Difterite, tetano, pertosse, polio, epatite B, Haemophilus influenzae b', 10),
('esa2', 'Esavalente', 2, 121, 150, true, '5° mese (dal 121° giorno)', null, 11),
('esa3', 'Esavalente', 3, 301, 365, true, '11° mese (dal 301° giorno)', null, 12),
('pcv1', 'Pneumococco coniugato', 1, 61, 90, false, '3° mese', 'Co-somministrabile con l''esavalente', 20),
('pcv2', 'Pneumococco coniugato', 2, 121, 150, false, '5° mese', null, 21),
('pcv3', 'Pneumococco coniugato', 3, 301, 365, false, '11° mese', null, 22),
('rv1', 'Rotavirus', 1, 42, 90, false, 'Dalla 6ª settimana', 'Ciclo da completare entro la 24ª settimana (vaccino monovalente, 2 dosi; il pentavalente prevede 3 dosi)', 30),
('rv2', 'Rotavirus', 2, 70, 168, false, 'Entro la 24ª settimana', null, 31),
('menb1', 'Meningococco B', 1, 76, 91, false, '76°–91° giorno', 'Circa 15 giorni dopo la prima dose di esavalente', 40),
('menb2', 'Meningococco B', 2, 136, 151, false, '136°–151° giorno', null, 41),
('menb3', 'Meningococco B', 3, 395, 456, false, '13°–15° mese (richiamo)', 'Il mese del richiamo varia tra Regioni', 42),
('mprv1', 'Morbillo-Parotite-Rosolia-Varicella', 1, 365, 456, true, '13°–15° mese', 'Morbillo, parotite, rosolia e varicella sono obbligatorie (Legge 119/2017)', 50),
('mprv2', 'Morbillo-Parotite-Rosolia-Varicella', 2, 1826, 2190, true, '5–6 anni', null, 51),
('acwy1', 'Meningococco ACWY', 1, 365, 456, false, '13°–15° mese', null, 60),
('acwy2', 'Meningococco ACWY', 2, 4383, 6574, false, '12–18 anni', 'Alcune Regioni prevedono una dose aggiuntiva tra 6 e 9 anni', 61),
('dtp4', 'Difterite-Tetano-Pertosse-Polio', 4, 1826, 2190, true, '5–6 anni (richiamo)', null, 70),
('dtp5', 'Difterite-Tetano-Pertosse-Polio', 5, 4383, 6574, true, '12–18 anni (richiamo dTpa-IPV)', 'Obbligo vaccinale fino ai 16 anni', 71),
('hpv1', 'Papillomavirus (HPV)', 1, 4018, 4748, false, '11–12 anni', 'Due dosi (0, 6 mesi) se iniziato prima dei 15 anni; tre dosi dopo', 80),
('hpv2', 'Papillomavirus (HPV)', 2, 4200, 4930, false, '6 mesi dopo la 1ª dose', null, 81);

-- -----------------------------------------------------------------------------
-- Catalogo allergeni e test allergologici
-- -----------------------------------------------------------------------------
create table anagrafica.catalogo_allergeni (
  codice     text primary key,
  nome       text not null,
  categoria  text not null check (categoria in ('alimento', 'farmaco', 'inalante', 'veleno', 'contatto')),
  note       text,
  ordine     smallint not null default 0
);
create table anagrafica.catalogo_test_allergologici (
  codice       text primary key,
  nome         text not null,
  descrizione  text not null,
  quando       text not null,
  ordine       smallint not null default 0
);
alter table anagrafica.catalogo_allergeni enable row level security;
alter table anagrafica.catalogo_test_allergologici enable row level security;
grant select on anagrafica.catalogo_allergeni, anagrafica.catalogo_test_allergologici to authenticated;
create policy staff_legge_allergeni on anagrafica.catalogo_allergeni
  for select to authenticated using (sicurezza.is_staff());
create policy staff_legge_test on anagrafica.catalogo_test_allergologici
  for select to authenticated using (sicurezza.is_staff());

insert into anagrafica.catalogo_allergeni (codice, nome, categoria, note, ordine) values
-- Alimenti: i 14 allergeni dell'Allegato II del Reg. UE 1169/2011
('latte', 'Latte (proteine del latte vaccino)', 'alimento', 'Tra i più frequenti nel bambino piccolo', 10),
('uovo', 'Uova', 'alimento', 'Tra i più frequenti nel bambino piccolo', 11),
('glutine', 'Cereali contenenti glutine (grano)', 'alimento', 'Distinguere allergia al grano da celiachia', 12),
('arachidi', 'Arachidi', 'alimento', null, 13),
('frutta_guscio', 'Frutta a guscio (nocciole, noci, mandorle, anacardi…)', 'alimento', null, 14),
('soia', 'Soia', 'alimento', null, 15),
('pesce', 'Pesce', 'alimento', null, 16),
('crostacei', 'Crostacei', 'alimento', null, 17),
('molluschi', 'Molluschi', 'alimento', null, 18),
('sesamo', 'Semi di sesamo', 'alimento', null, 19),
('sedano', 'Sedano', 'alimento', null, 20),
('senape', 'Senape', 'alimento', null, 21),
('lupini', 'Lupini', 'alimento', null, 22),
('solfiti', 'Anidride solforosa e solfiti', 'alimento', null, 23),
('frutta_verdura', 'Frutta e verdura fresche (es. pesca, kiwi)', 'alimento', 'Possibili reazioni crociate con i pollini', 24),
-- Farmaci
('betalattamici', 'Beta-lattamici (penicilline, amoxicillina, cefalosporine)', 'farmaco', 'Prima causa di sospetta allergia a farmaci in età pediatrica', 40),
('fans', 'FANS (ibuprofene e altri antinfiammatori)', 'farmaco', null, 41),
('macrolidi', 'Macrolidi (claritromicina, azitromicina)', 'farmaco', null, 42),
('altro_farmaco', 'Altro farmaco (specificare)', 'farmaco', null, 49),
-- Inalanti
('acari', 'Acari della polvere', 'inalante', null, 60),
('graminacee', 'Pollini di graminacee', 'inalante', null, 61),
('parietaria', 'Pollini di parietaria', 'inalante', null, 62),
('olivo', 'Pollini di olivo', 'inalante', null, 63),
('cipresso', 'Pollini di cipresso', 'inalante', null, 64),
('betulla', 'Pollini di betulla e nocciolo', 'inalante', null, 65),
('epiteli', 'Epiteli di animali (gatto, cane)', 'inalante', null, 66),
('alternaria', 'Muffe (Alternaria)', 'inalante', null, 67),
-- Altri
('imenotteri', 'Veleno di imenotteri (api, vespe)', 'veleno', null, 80),
('lattice', 'Lattice', 'contatto', null, 81),
('nichel', 'Nichel e apteni da contatto', 'contatto', 'Diagnosi con patch test', 82);

insert into anagrafica.catalogo_test_allergologici (codice, nome, descrizione, quando, ordine) values
('prick', 'Prick test', 'Goccia di estratto allergenico sulla cute dell''avambraccio e puntura superficiale; si legge il pomfo dopo circa 15 minuti.', 'Primo livello per alimenti e inalanti', 10),
('prick_prick', 'Prick by prick', 'Prick eseguito con l''alimento fresco invece dell''estratto commerciale.', 'Sospetta allergia a frutta e verdura fresche', 20),
('ige_specifiche', 'IgE specifiche sieriche', 'Dosaggio nel sangue degli anticorpi IgE verso singoli allergeni.', 'Quando i test cutanei non sono eseguibili o per conferma; indicano sensibilizzazione, non necessariamente allergia', 30),
('molecolare', 'Diagnostica molecolare (componenti allergeniche)', 'Dosaggio delle IgE verso singole proteine dell''allergene.', 'Per stimare il rischio di reazioni gravi e le reattività crociate', 40),
('tpo', 'Test di provocazione orale', 'Somministrazione dell''alimento o del farmaco in dosi crescenti in ambiente protetto.', 'Gold standard per confermare o escludere l''allergia; solo in centro attrezzato', 50),
('intradermo', 'Test intradermici', 'Iniezione intradermica di piccole quantità di allergene.', 'Soprattutto per farmaci (beta-lattamici) e veleno di imenotteri, in centro specialistico', 60),
('patch', 'Patch test', 'Apteni applicati sulla schiena per 48 ore, lettura a 48–72 ore.', 'Dermatite allergica da contatto (es. nichel)', 70);

-- -----------------------------------------------------------------------------
-- Allergie del bambino (dato clinico, solo pseudo_id)
-- -----------------------------------------------------------------------------
create table clinica.allergie (
  id               uuid primary key default gen_random_uuid(),
  pseudo_id        uuid not null references clinica.cartelle(pseudo_id),
  allergene        text not null references anagrafica.catalogo_allergeni(codice),
  dettaglio        text,                       -- es. nome del farmaco se "altro"
  reazione         text,
  gravita          text not null default 'lieve' check (gravita in ('lieve', 'moderata', 'grave', 'anafilassi')),
  stato            text not null default 'sospetta' check (stato in ('sospetta', 'confermata', 'risolta')),
  test             text[] not null default '{}',   -- codici del catalogo test
  data_diagnosi    date,
  note             text,
  creato_il        timestamptz not null default now()
);
create index on clinica.allergie (pseudo_id);
alter table clinica.allergie enable row level security;
grant select, insert, update, delete on clinica.allergie to authenticated;
create policy pediatra_gestisce_allergie on clinica.allergie
  for all to authenticated
  using (sicurezza.puo_accedere_clinica(pseudo_id))
  with check (sicurezza.puo_accedere_clinica(pseudo_id));
create trigger audit after insert or update or delete on clinica.allergie
  for each row execute function audit.traccia_modifica();

-- -----------------------------------------------------------------------------
-- Profilo professionale del pediatra e dati dello studio (per intestazioni e firma)
-- -----------------------------------------------------------------------------
alter table anagrafica.pediatri
  add column titolo            text not null default 'Dott.',
  add column specializzazione  text not null default 'Specialista in Pediatria',
  add column ordine_provincia  text,
  add column ordine_numero     text,
  add column partita_iva       text check (partita_iva is null or partita_iva ~ '^[0-9]{11}$'),
  add column codice_fiscale    text check (codice_fiscale is null or codice_fiscale ~ '^[A-Z0-9]{16}$'),
  add column telefono          text,
  add column pec               text;

alter table anagrafica.studi
  add column email  text,
  add column pec    text;

-- Il pediatra modifica il proprio profilo e i dati dello studio.
grant update (titolo, nome, cognome, specializzazione, ordine_provincia, ordine_numero, partita_iva,
              codice_fiscale, telefono, pec, email, codice_regionale)
  on anagrafica.pediatri to authenticated;
grant update (nome, indirizzo, telefono, email, pec) on anagrafica.studi to authenticated;

create policy pediatra_modifica_se_stesso on anagrafica.pediatri
  for update to authenticated
  using (id = auth.uid() and sicurezza.ruolo() = 'pediatra')
  with check (id = auth.uid() and studio_id = sicurezza.studio_id());

create policy pediatra_modifica_studio on anagrafica.studi
  for update to authenticated
  using (id = sicurezza.studio_id() and sicurezza.ruolo() = 'pediatra')
  with check (id = sicurezza.studio_id());

create trigger audit after update on anagrafica.pediatri
  for each row execute function audit.traccia_modifica();
create trigger audit after update on anagrafica.studi
  for each row execute function audit.traccia_modifica();

