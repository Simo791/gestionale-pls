-- =============================================================================
-- 1500 · Presenti alla visita, modelli di testo, catalogo diagnosi per nome,
--        certificati, lista dei pazienti da ricontattare
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Chi accompagna il bambino alla visita (genitori registrati o "altro")
-- -----------------------------------------------------------------------------
alter table clinica.visite add column accompagnatori text[] not null default '{}';

-- -----------------------------------------------------------------------------
-- Modelli di testo per esame obiettivo, terapia, anamnesi, indicazioni,
-- nominati per patologia. Personali del medico, visibili ai medici dello studio.
-- -----------------------------------------------------------------------------
create table anagrafica.modelli_testo (
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid not null default sicurezza.studio_id() references anagrafica.studi(id),
  autore      uuid not null default auth.uid(),
  campo       text not null check (campo in ('anamnesi', 'esame_obiettivo', 'terapia', 'indicazioni')),
  patologia   text not null check (length(trim(patologia)) > 0),
  nome        text not null check (length(trim(nome)) > 0),
  testo       text not null check (length(trim(testo)) > 0),
  creato_il   timestamptz not null default now(),
  aggiornato_il timestamptz not null default now()
);
create index on anagrafica.modelli_testo (studio_id, campo, patologia);
alter table anagrafica.modelli_testo enable row level security;
grant select, insert, update, delete on anagrafica.modelli_testo to authenticated;
create policy medici_leggono_modelli on anagrafica.modelli_testo
  for select to authenticated
  using (studio_id = sicurezza.studio_id() and sicurezza.ruolo() in ('pediatra', 'sostituto'));
create policy medico_gestisce_propri_modelli on anagrafica.modelli_testo
  for all to authenticated
  using (autore = auth.uid() and studio_id = sicurezza.studio_id() and sicurezza.ruolo() in ('pediatra', 'sostituto'))
  with check (autore = auth.uid() and studio_id = sicurezza.studio_id() and sicurezza.ruolo() in ('pediatra', 'sostituto'));

-- -----------------------------------------------------------------------------
-- Catalogo delle diagnosi frequenti in pediatria, ricercabili per nome.
-- Codici ICD-9-CM (versione italiana 2007, in uso per le prescrizioni SSN);
-- descrizioni sintetiche: per la dicitura ufficiale fa fede il manuale.
-- L'amministratore può aggiungere voci.
-- -----------------------------------------------------------------------------
create table anagrafica.catalogo_diagnosi (
  codice       text primary key check (codice ~ '^(V\d{2}(\.\d{1,2})?|E\d{3}(\.\d)?|\d{3}(\.\d{1,2})?)$'),
  descrizione  text not null,
  sinonimi     text[] not null default '{}',
  area         text not null default 'generale'
);
alter table anagrafica.catalogo_diagnosi enable row level security;
grant select, insert, update on anagrafica.catalogo_diagnosi to authenticated;
create policy staff_legge_diagnosi on anagrafica.catalogo_diagnosi
  for select to authenticated using (sicurezza.is_staff());
create policy admin_aggiunge_diagnosi on anagrafica.catalogo_diagnosi
  for insert to authenticated with check (sicurezza.is_admin());
create policy admin_modifica_diagnosi on anagrafica.catalogo_diagnosi
  for update to authenticated using (sicurezza.is_admin()) with check (sicurezza.is_admin());
create trigger audit after insert or update on anagrafica.catalogo_diagnosi
  for each row execute function audit.traccia_modifica();

insert into anagrafica.catalogo_diagnosi (codice, descrizione, sinonimi, area) values
('V20.2', 'Controllo di routine del bambino sano (bilancio di salute)', '{bilancio,controllo}', 'prevenzione'),
('V70.3', 'Visita medica per scopi amministrativi', '{certificato,idoneità}', 'prevenzione'),
('460', 'Rinofaringite acuta (raffreddore comune)', '{raffreddore,rinite acuta}', 'respiratorio'),
('461.9', 'Sinusite acuta, non specificata', '{sinusite}', 'respiratorio'),
('462', 'Faringite acuta', '{mal di gola,faringite}', 'respiratorio'),
('463', 'Tonsillite acuta', '{tonsillite,angina}', 'respiratorio'),
('034.0', 'Faringotonsillite streptococcica', '{streptococco,angina streptococcica}', 'respiratorio'),
('034.1', 'Scarlattina', '{}', 'infezioni'),
('464.00', 'Laringite acuta senza ostruzione', '{laringite}', 'respiratorio'),
('464.4', 'Croup (laringite ipoglottica)', '{laringite ipoglottica,laringospasmo}', 'respiratorio'),
('465.9', 'Infezione acuta delle vie respiratorie superiori, non specificata', '{IVAS,infezione vie aeree}', 'respiratorio'),
('466.0', 'Bronchite acuta', '{bronchite,tracheobronchite}', 'respiratorio'),
('466.11', 'Bronchiolite acuta da virus respiratorio sinciziale', '{bronchiolite,VRS,RSV}', 'respiratorio'),
('466.19', 'Bronchiolite acuta da altri agenti', '{bronchiolite}', 'respiratorio'),
('486', 'Polmonite, agente non specificato', '{polmonite,broncopolmonite}', 'respiratorio'),
('487.1', 'Influenza con altre manifestazioni respiratorie', '{influenza}', 'respiratorio'),
('493.90', 'Asma, non specificata', '{asma,broncospasmo}', 'respiratorio'),
('786.2', 'Tosse', '{}', 'sintomi'),
('786.07', 'Respiro sibilante', '{wheezing,sibili}', 'sintomi'),
('477.0', 'Rinite allergica da pollini', '{pollinosi,febbre da fieno}', 'allergologia'),
('477.9', 'Rinite allergica, causa non specificata', '{rinite allergica}', 'allergologia'),
('381.00', 'Otite media acuta non suppurativa', '{otite}', 'orl'),
('382.00', 'Otite media acuta suppurativa senza perforazione', '{otite purulenta,otite}', 'orl'),
('380.10', 'Otite esterna infettiva', '{otite esterna}', 'orl'),
('372.00', 'Congiuntivite acuta', '{congiuntivite}', 'occhio'),
('372.30', 'Congiuntivite, non specificata', '{congiuntivite}', 'occhio'),
('079.99', 'Infezione virale, non specificata', '{virosi}', 'infezioni'),
('780.6', 'Febbre', '{iperpiressia,febbre}', 'sintomi'),
('780.31', 'Convulsioni febbrili', '{convulsione febbrile}', 'neurologia'),
('008.61', 'Enterite da rotavirus', '{rotavirus,gastroenterite}', 'gastro'),
('008.8', 'Enterite virale', '{gastroenterite virale}', 'gastro'),
('009.1', 'Gastroenterite di presunta origine infettiva', '{gastroenterite}', 'gastro'),
('558.9', 'Gastroenterite e colite non infettive, non specificate', '{gastroenterite}', 'gastro'),
('787.01', 'Nausea con vomito', '{vomito}', 'sintomi'),
('787.03', 'Vomito', '{}', 'sintomi'),
('787.91', 'Diarrea', '{}', 'sintomi'),
('564.00', 'Stipsi', '{stitichezza}', 'gastro'),
('789.00', 'Dolore addominale, sede non specificata', '{mal di pancia}', 'sintomi'),
('530.81', 'Reflusso gastroesofageo', '{reflusso,rigurgito}', 'gastro'),
('579.0', 'Malattia celiaca', '{celiachia}', 'gastro'),
('599.0', 'Infezione delle vie urinarie, sede non specificata', '{IVU,cistite}', 'nefro'),
('691.8', 'Dermatite atopica ed eczema', '{eczema,dermatite atopica}', 'cute'),
('691.0', 'Dermatite da pannolino', '{eritema da pannolino}', 'cute'),
('690.12', 'Dermatite seborroica infantile', '{crosta lattea}', 'cute'),
('708.9', 'Orticaria, non specificata', '{orticaria,pomfi}', 'cute'),
('692.9', 'Dermatite da contatto, causa non specificata', '{dermatite da contatto}', 'cute'),
('693.1', 'Dermatite da alimenti ingeriti', '{}', 'allergologia'),
('684', 'Impetigine', '{}', 'cute'),
('112.0', 'Candidosi orale (mughetto)', '{mughetto}', 'cute'),
('112.3', 'Candidosi della cute e delle unghie', '{candida}', 'cute'),
('133.0', 'Scabbia', '{}', 'cute'),
('132.0', 'Pediculosi del capo', '{pidocchi}', 'cute'),
('078.0', 'Mollusco contagioso', '{}', 'cute'),
('078.10', 'Verruche virali, non specificate', '{verruche}', 'cute'),
('782.1', 'Esantema ed eruzioni cutanee non specifiche', '{esantema,rash}', 'sintomi'),
('052.9', 'Varicella senza complicazioni', '{varicella}', 'infezioni'),
('057.0', 'Eritema infettivo (quinta malattia)', '{quinta malattia}', 'infezioni'),
('057.8', 'Altri esantemi virali specificati (es. esantema critico, sesta malattia)', '{sesta malattia,roseola}', 'infezioni'),
('074.0', 'Herpangina', '{}', 'infezioni'),
('074.3', 'Malattia mani-piedi-bocca', '{mani piedi bocca}', 'infezioni'),
('054.2', 'Gengivostomatite erpetica', '{herpes,stomatite}', 'infezioni'),
('075', 'Mononucleosi infettiva', '{mononucleosi}', 'infezioni'),
('785.6', 'Linfoadenomegalia', '{linfonodi ingrossati}', 'sintomi'),
('995.3', 'Allergia, non specificata', '{allergia}', 'allergologia'),
('995.60', 'Shock anafilattico da alimento non specificato', '{anafilassi}', 'allergologia'),
('280.9', 'Anemia sideropenica, non specificata', '{anemia,carenza di ferro}', 'ematologia'),
('783.41', 'Mancato accrescimento', '{scarso accrescimento,failure to thrive}', 'crescita'),
('783.43', 'Bassa statura', '{}', 'crescita'),
('278.00', 'Obesità, non specificata', '{obesità,sovrappeso}', 'crescita'),
('784.0', 'Cefalea', '{mal di testa}', 'sintomi'),
('315.31', 'Disturbo del linguaggio espressivo', '{ritardo del linguaggio}', 'neurosviluppo'),
('299.00', 'Disturbo autistico', '{autismo}', 'neurosviluppo'),
('754.30', 'Lussazione congenita dell''anca, unilaterale', '{displasia anca}', 'ortopedia'),
('550.90', 'Ernia inguinale unilaterale', '{ernia inguinale}', 'chirurgia'),
('553.1', 'Ernia ombelicale', '{}', 'chirurgia'),
('752.51', 'Criptorchidismo', '{testicolo ritenuto}', 'chirurgia'),
('605', 'Fimosi', '{}', 'chirurgia'),
('774.6', 'Ittero neonatale, non specificato', '{ittero}', 'neonato'),
('850.0', 'Commozione cerebrale senza perdita di coscienza', '{trauma cranico}', 'traumi'),
('845.00', 'Distorsione della caviglia', '{distorsione}', 'traumi');

-- -----------------------------------------------------------------------------
-- Certificati (dato clinico): dieta speciale scuola/mensa, dieta di esclusione, generici
-- -----------------------------------------------------------------------------
create table clinica.certificati (
  id            uuid primary key default gen_random_uuid(),
  pseudo_id     uuid not null references clinica.cartelle(pseudo_id),
  visita_id     uuid references clinica.visite(id),
  pediatra_id   uuid not null default auth.uid(),
  tipo          text not null check (tipo in ('dieta_speciale', 'dieta_esclusione', 'generico')),
  data          date not null default current_date,
  valido_fino   date,
  contenuto     jsonb not null,
  creato_il     timestamptz not null default now(),
  check (valido_fino is null or valido_fino >= data)
);
create index on clinica.certificati (pseudo_id, data desc);
alter table clinica.certificati enable row level security;
grant select, insert on clinica.certificati to authenticated;
create policy pediatra_gestisce_certificati on clinica.certificati
  for all to authenticated
  using (sicurezza.puo_accedere_clinica(pseudo_id))
  with check (sicurezza.puo_accedere_clinica(pseudo_id));
create trigger audit after insert or update or delete on clinica.certificati
  for each row execute function audit.traccia_modifica();

-- -----------------------------------------------------------------------------
-- Pazienti da ricontattare (es. rifiuto alla telefonata di conferma)
-- Solo dati organizzativi: il motivo non deve contenere informazioni cliniche.
-- -----------------------------------------------------------------------------
create table anagrafica.richiami (
  id                uuid primary key default gen_random_uuid(),
  studio_id         uuid not null default sicurezza.studio_id() references anagrafica.studi(id),
  paziente_id       uuid not null references anagrafica.pazienti(id),
  appuntamento_id   uuid references anagrafica.appuntamenti(id),
  tipo_visita       text not null default 'visita'
                    check (tipo_visita in ('visita', 'bilancio_salute', 'vaccino', 'urgenza', 'certificato')),
  motivo            text,
  ricontattare_dal  date not null default current_date,
  stato             text not null default 'aperto' check (stato in ('aperto', 'fissato', 'chiuso')),
  creato_da         uuid default auth.uid(),
  creato_il         timestamptz not null default now(),
  chiuso_il         timestamptz
);
create index on anagrafica.richiami (studio_id, stato, ricontattare_dal);
alter table anagrafica.richiami enable row level security;
grant select, insert, update on anagrafica.richiami to authenticated;
create policy staff_gestisce_richiami on anagrafica.richiami
  for all to authenticated
  using (sicurezza.is_staff() and studio_id = sicurezza.studio_id())
  with check (sicurezza.is_staff() and studio_id = sicurezza.studio_id()
              and exists (select 1 from anagrafica.pazienti p where p.id = paziente_id and p.studio_id = sicurezza.studio_id()));
create trigger audit after insert or update or delete on anagrafica.richiami
  for each row execute function audit.traccia_modifica();
