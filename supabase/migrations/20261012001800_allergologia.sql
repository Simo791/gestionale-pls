-- =============================================================================
-- 1800 · Modulo Allergologia pediatrica
--
-- - Attivabile per studio dall'amministratore (studi.allergologia_attiva).
-- - Visibile solo all'amministratore e ai membri che l'amministratore ha abilitato
--   (membri_studio.allergologia). Nuovo ruolo 'allergologo' per lo specialista che
--   usa SOLO questo modulo: non vede assistiti, agenda né cartelle del pediatra.
-- - Anagrafica pazienti propria (anagrafica.allergo_pazienti), NON collegata agli
--   assistiti del gestionale. Stessa architettura: dati identificativi separati,
--   dati clinici con solo pseudo_id (clinica.allergo_*), mappa in "pseudonimi"
--   senza permessi, audit con catena di hash su ogni modifica.
-- - Le tabelle stanno negli schemi già esposti (anagrafica, clinica): nessuna
--   modifica alla configurazione "Exposed schemas" del progetto Supabase.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Attivazione del modulo e abilitazione dei membri
-- -----------------------------------------------------------------------------
alter table anagrafica.studi
  add column allergologia_attiva      boolean not null default false,
  add column allergologia_attivata_il timestamptz;

alter table anagrafica.membri_studio drop constraint membri_studio_ruolo_check;
alter table anagrafica.membri_studio
  add constraint membri_studio_ruolo_check check (ruolo in ('pediatra', 'segreteria', 'sostituto', 'allergologo')),
  add column allergologia              boolean not null default false,
  add column allergologia_abilitato_il timestamptz,
  add column allergologia_abilitato_da uuid;

-- Ognuno vede la propria riga (serve all'allergologo, che non è "staff").
create policy membro_vede_se_stesso on anagrafica.membri_studio
  for select to authenticated using (utente_id = auth.uid());

-- Accesso al modulo: verificato SUL MOMENTO nelle tabelle (non solo nel token),
-- così disattivazione del modulo o revoca dell'abilitazione hanno effetto immediato.
create or replace function sicurezza.allergologia_ok()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select sicurezza.mfa_ok()
     and exists (
       select 1
       from anagrafica.membri_studio m
       join anagrafica.studi s on s.id = m.studio_id
       where m.utente_id = auth.uid()
         and m.attivo
         and m.studio_id = sicurezza.studio_id()
         and s.allergologia_attiva
         and (m.amministratore or m.allergologia)
     );
$$;
grant execute on function sicurezza.allergologia_ok() to authenticated;

-- Il token porta anche app_allergologia (solo per decidere cosa mostrare nel menu).
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql stable
set search_path = ''
as $$
declare
  v_utente uuid := (event ->> 'user_id')::uuid;
  v_claims jsonb := coalesce(event -> 'claims', '{}');
  v_ruolo  text;
  v_studio uuid;
  v_admin  boolean := false;
  v_allerg boolean := false;
begin
  select m.ruolo, m.studio_id, m.amministratore,
         s.allergologia_attiva and (m.amministratore or m.allergologia)
    into v_ruolo, v_studio, v_admin, v_allerg
  from anagrafica.membri_studio m
  join anagrafica.studi s on s.id = m.studio_id
  where m.utente_id = v_utente and m.attivo;

  if v_ruolo is null and exists (select 1 from anagrafica.tutori t where t.utente_id = v_utente) then
    v_ruolo := 'tutore';
  end if;

  v_claims := jsonb_set(v_claims, '{app_ruolo}', to_jsonb(coalesce(v_ruolo, 'nessuno')));
  v_claims := jsonb_set(v_claims, '{app_admin}', to_jsonb(coalesce(v_admin, false)));
  v_claims := jsonb_set(v_claims, '{app_allergologia}', to_jsonb(coalesce(v_allerg, false)));
  if v_studio is not null then
    v_claims := jsonb_set(v_claims, '{app_studio_id}', to_jsonb(v_studio));
  else
    v_claims := v_claims - 'app_studio_id';
  end if;

  return jsonb_set(event, '{claims}', v_claims);
end;
$$;
grant select on anagrafica.studi to supabase_auth_admin;
create policy auth_legge_studi on anagrafica.studi
  for select to supabase_auth_admin using (true);

-- L'amministratore attiva o disattiva il modulo per il proprio studio.
create or replace function api.imposta_allergologia(p_attiva boolean)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not sicurezza.is_admin() or not sicurezza.mfa_ok() then
    raise exception 'Solo l''amministratore dello studio attiva il modulo Allergologia';
  end if;
  update anagrafica.studi
     set allergologia_attiva = p_attiva,
         allergologia_attivata_il = case when p_attiva then now() else allergologia_attivata_il end
   where id = sicurezza.studio_id();
  perform audit.registra(case when p_attiva then 'ATTIVAZIONE_ALLERGOLOGIA' else 'DISATTIVAZIONE_ALLERGOLOGIA' end,
                         'anagrafica.studi', sicurezza.studio_id()::text, null, '{}'::jsonb);
end;
$$;
grant execute on function api.imposta_allergologia(boolean) to authenticated;

-- L'amministratore accetta (o revoca) un membro come allergologo pediatra.
create or replace function api.abilita_allergologia(p_utente uuid, p_abilita boolean)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_studio uuid := sicurezza.studio_id();
begin
  if not sicurezza.is_admin() or not sicurezza.mfa_ok() then
    raise exception 'Solo l''amministratore dello studio abilita gli allergologi';
  end if;
  update anagrafica.membri_studio
     set allergologia = p_abilita,
         allergologia_abilitato_il = case when p_abilita then now() end,
         allergologia_abilitato_da = case when p_abilita then auth.uid() end,
         aggiornato_il = now()
   where utente_id = p_utente and studio_id = v_studio and not amministratore and ruolo <> 'segreteria';
  if not found then
    raise exception 'Membro non trovato o non abilitabile (la segreteria non accede al modulo clinico)';
  end if;
  if p_abilita then
    perform anagrafica.notifica(v_studio, p_utente, 'allergologia',
      'Accesso al modulo Allergologia', 'L''amministratore ti ha abilitato. Esci e rientra per vedere la sezione.',
      '#/allergologia');
  end if;
end;
$$;
grant execute on function api.abilita_allergologia(uuid, boolean) to authenticated;

-- Messaggio di benvenuto anche per il ruolo allergologo (aggiunto dalla Edge Function).
create or replace function api.registra_evento_staff(p_autore uuid, p_utente uuid, p_studio uuid, p_ruolo text)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  perform audit.registra('AGGIUNTA_MEMBRO_STAFF', 'anagrafica.membri_studio', p_utente::text, null,
                         jsonb_build_object('autore', p_autore, 'ruolo', p_ruolo));
  perform anagrafica.notifica(p_studio, p_utente, 'benvenuto',
    'Benvenuto nel gestionale dello studio',
    case p_ruolo
      when 'sostituto' then 'Al primo accesso configura il secondo fattore. Vedrai i dati clinici solo durante i periodi di sostituzione attivati dal titolare.'
      when 'allergologo' then 'Al primo accesso configura il secondo fattore. Hai accesso al solo modulo Allergologia, con i suoi pazienti.'
      else 'Al primo accesso configura il secondo fattore. Gestisci agenda, anagrafiche e consensi.' end,
    case p_ruolo when 'allergologo' then '#/allergologia' else '#/cruscotto' end);
end;
$$;
revoke execute on function api.registra_evento_staff(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function api.registra_evento_staff(uuid, uuid, uuid, text) to service_role;

-- -----------------------------------------------------------------------------
-- Anagrafica dei pazienti allergologici (separata dagli assistiti)
-- -----------------------------------------------------------------------------
create table anagrafica.allergo_pazienti (
  id                      uuid primary key default gen_random_uuid(),
  studio_id               uuid not null references anagrafica.studi(id),
  nome                    text not null check (length(trim(nome)) > 0),
  cognome                 text not null check (length(trim(cognome)) > 0),
  codice_fiscale_cifrato  bytea not null,
  codice_fiscale_impronta text not null,
  data_nascita            date not null check (data_nascita <= current_date),
  sesso                   char(1) not null check (sesso in ('M', 'F')),
  genitore_nome           text,
  genitore_telefono       text,
  genitore_email          text,
  pediatra_curante        text,
  inviato_da              text,
  note_organizzative      text,
  stato                   text not null default 'attivo' check (stato in ('attivo', 'archiviato')),
  creato_da               uuid not null default auth.uid(),
  creato_il               timestamptz not null default now(),
  unique (studio_id, codice_fiscale_impronta)
);
create index on anagrafica.allergo_pazienti (studio_id, cognome, nome);
alter table anagrafica.allergo_pazienti enable row level security;
grant select (id, studio_id, nome, cognome, data_nascita, sesso, genitore_nome, genitore_telefono, genitore_email,
              pediatra_curante, inviato_da, note_organizzative, stato, creato_da, creato_il)
  on anagrafica.allergo_pazienti to authenticated;
grant update (nome, cognome, genitore_nome, genitore_telefono, genitore_email, pediatra_curante, inviato_da,
              note_organizzative, stato)
  on anagrafica.allergo_pazienti to authenticated;
create policy allergo_legge_pazienti on anagrafica.allergo_pazienti
  for select to authenticated using (sicurezza.allergologia_ok() and studio_id = sicurezza.studio_id());
create policy allergo_modifica_pazienti on anagrafica.allergo_pazienti
  for update to authenticated
  using (sicurezza.allergologia_ok() and studio_id = sicurezza.studio_id())
  with check (studio_id = sicurezza.studio_id());
create trigger audit after insert or update or delete on anagrafica.allergo_pazienti
  for each row execute function audit.traccia_modifica();

create table pseudonimi.allergo_mappa (
  paziente_id  uuid primary key references anagrafica.allergo_pazienti(id) on delete restrict,
  pseudo_id    uuid not null unique default gen_random_uuid(),
  creato_il    timestamptz not null default now()
);
revoke all on pseudonimi.allergo_mappa from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Dati clinici allergologici (solo pseudo_id)
-- -----------------------------------------------------------------------------
create table clinica.allergo_cartelle (
  pseudo_id            uuid primary key references pseudonimi.allergo_mappa(pseudo_id),
  sesso                char(1) not null check (sesso in ('M', 'F')),
  familiarita          text[] not null default '{}',  -- es. {asma:madre, rinite:padre}
  anamnesi_perinatale  text,
  alimentazione        text,          -- allattamento, divezzamento, introduzione allergeni
  fumo_passivo         boolean,
  animali              text,
  muffe_umidita        boolean,
  comunita             text,          -- nido, scuola, sport
  anamnesi_personale   text,
  note                 text,
  aggiornata_il        timestamptz not null default now()
);

create or replace function pseudonimi.crea_per_allergo_paziente()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_pseudo uuid;
begin
  insert into pseudonimi.allergo_mappa (paziente_id) values (new.id) returning pseudo_id into v_pseudo;
  insert into clinica.allergo_cartelle (pseudo_id, sesso) values (v_pseudo, new.sesso);
  return new;
end;
$$;
create trigger crea_pseudonimo after insert on anagrafica.allergo_pazienti
  for each row execute function pseudonimi.crea_per_allergo_paziente();

create or replace function sicurezza.puo_accedere_allergo(p_pseudo_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select sicurezza.allergologia_ok()
     and exists (
       select 1 from pseudonimi.allergo_mappa m
       join anagrafica.allergo_pazienti p on p.id = m.paziente_id
       where m.pseudo_id = p_pseudo_id and p.studio_id = sicurezza.studio_id()
     );
$$;
grant execute on function sicurezza.puo_accedere_allergo(uuid) to authenticated;

create table clinica.allergo_visite (
  id                 uuid primary key default gen_random_uuid(),
  pseudo_id          uuid not null references clinica.allergo_cartelle(pseudo_id),
  medico_id          uuid not null default auth.uid(),
  data               timestamptz not null default now(),
  tipo               text not null default 'controllo' check (tipo in ('prima_visita', 'controllo', 'urgenza', 'test', 'altro')),
  motivo             text not null,
  anamnesi           text,
  esame_obiettivo    text,
  peso_kg            numeric(5,2) check (peso_kg > 0 and peso_kg < 200),
  altezza_cm         numeric(5,1) check (altezza_cm > 20 and altezza_cm < 230),
  saturazione        smallint check (saturazione between 50 and 100),
  conclusioni        text,
  piano              text,
  prossimo_controllo date
);
create index on clinica.allergo_visite (pseudo_id, data desc);

create table clinica.allergo_diagnosi (
  id             uuid primary key default gen_random_uuid(),
  pseudo_id      uuid not null references clinica.allergo_cartelle(pseudo_id),
  area           text not null check (area in ('asma', 'wheezing_prescolare', 'rinite', 'congiuntivite', 'dermatite_atopica',
                                               'allergia_alimentare', 'anafilassi', 'orticaria', 'angioedema', 'farmaci',
                                               'imenotteri', 'eso_eosinofila', 'fpies', 'proctocolite', 'contatto', 'altro')),
  descrizione    text not null,
  data_diagnosi  date,
  gravita        text,
  stato          text not null default 'attiva' check (stato in ('sospetta', 'attiva', 'in_remissione', 'risolta')),
  note           text,
  creato_il      timestamptz not null default now(),
  aggiornato_il  timestamptz not null default now()
);
create index on clinica.allergo_diagnosi (pseudo_id);

-- Prick, prick by prick, IgE specifiche/componenti/totali, patch, intradermo.
create table clinica.allergo_test (
  id         uuid primary key default gen_random_uuid(),
  pseudo_id  uuid not null references clinica.allergo_cartelle(pseudo_id),
  data       date not null default current_date,
  tipo       text not null check (tipo in ('prick', 'prick_by_prick', 'ige_specifiche', 'ige_componenti', 'ige_totali',
                                           'patch', 'intradermo', 'altro')),
  allergene  text not null,
  valore     numeric(8,2),
  unita      text,                -- mm (pomfo), kU/L, kUA/L, ISU-E
  esito      text check (esito in ('positivo', 'negativo', 'dubbio')),
  note       text,
  creato_il  timestamptz not null default now()
);
create index on clinica.allergo_test (pseudo_id, data desc);

-- Test di provocazione orale con alimenti (TPO).
create table clinica.allergo_tpo (
  id                uuid primary key default gen_random_uuid(),
  pseudo_id         uuid not null references clinica.allergo_cartelle(pseudo_id),
  data              date not null default current_date,
  alimento          text not null,
  forma             text,            -- es. "uovo cotto al forno", "latte crudo"
  protocollo        text,
  dose_cumulativa   text,
  esito             text not null check (esito in ('negativo', 'positivo', 'non_conclusivo', 'sospeso')),
  dose_scatenante   text,
  sintomi           text,
  trattamento       text,
  adrenalina        boolean not null default false,
  indicazioni       text,
  creato_il         timestamptz not null default now()
);
create index on clinica.allergo_tpo (pseudo_id, data desc);

-- Spirometria e FeNO. La reversibilità è calcolata dal database.
create table clinica.allergo_spirometrie (
  id            uuid primary key default gen_random_uuid(),
  pseudo_id     uuid not null references clinica.allergo_cartelle(pseudo_id),
  data          date not null default current_date,
  fev1_l        numeric(4,2) check (fev1_l > 0 and fev1_l < 8),
  fev1_pct      numeric(5,1) check (fev1_pct > 0 and fev1_pct < 200),
  fvc_l         numeric(4,2) check (fvc_l > 0 and fvc_l < 9),
  fvc_pct       numeric(5,1) check (fvc_pct > 0 and fvc_pct < 200),
  fev1_fvc      numeric(4,1) check (fev1_fvc > 20 and fev1_fvc <= 100),
  fef2575_pct   numeric(5,1) check (fef2575_pct > 0 and fef2575_pct < 300),
  fev1_post_l   numeric(4,2) check (fev1_post_l > 0 and fev1_post_l < 8),
  reversibilita_pct numeric(5,1) generated always as (
                  case when fev1_l is not null and fev1_post_l is not null
                       then round((fev1_post_l - fev1_l) / fev1_l * 100, 1) end) stored,
  feno_ppb      smallint check (feno_ppb between 0 and 300),
  note          text,
  creato_il     timestamptz not null default now()
);
create index on clinica.allergo_spirometrie (pseudo_id, data desc);

-- Punteggi validati (calcolati nell'interfaccia; qui il totale e le singole voci).
create table clinica.allergo_punteggi (
  id         uuid primary key default gen_random_uuid(),
  pseudo_id  uuid not null references clinica.allergo_cartelle(pseudo_id),
  data       date not null default current_date,
  scala      text not null check (scala in ('c_act', 'act', 'scorad', 'poem', 'uas7')),
  punteggio  numeric(5,1) not null check (punteggio >= 0 and punteggio <= 103),
  dettagli   jsonb not null default '{}',
  note       text,
  creato_il  timestamptz not null default now()
);
create index on clinica.allergo_punteggi (pseudo_id, scala, data desc);

-- Episodi di reazione allergica / anafilassi.
create table clinica.allergo_reazioni (
  id                uuid primary key default gen_random_uuid(),
  pseudo_id         uuid not null references clinica.allergo_cartelle(pseudo_id),
  data              date not null,
  causa_categoria   text not null check (causa_categoria in ('alimento', 'farmaco', 'imenottero', 'esercizio',
                                                             'lattice', 'immunoterapia', 'idiopatica', 'altro')),
  causa             text,
  cute_mucose       boolean not null default false,
  respiratorio      boolean not null default false,
  cardiovascolare   boolean not null default false,
  gastrointestinale boolean not null default false,
  anafilassi        boolean not null default false,   -- giudizio del medico
  adrenalina        boolean not null default false,
  dosi_adrenalina   smallint check (dosi_adrenalina between 0 and 5),
  pronto_soccorso   boolean not null default false,
  ricovero          boolean not null default false,
  cofattori         text,             -- esercizio, FANS, febbre, infezione…
  descrizione       text,
  creato_il         timestamptz not null default now()
);
create index on clinica.allergo_reazioni (pseudo_id, data desc);

-- Autoiniettori di adrenalina prescritti (dose, numero, scadenza).
create table clinica.allergo_autoiniettori (
  id                 uuid primary key default gen_random_uuid(),
  pseudo_id          uuid not null references clinica.allergo_cartelle(pseudo_id),
  dispositivo        text not null,
  dose_mg            numeric(3,2) not null check (dose_mg in (0.15, 0.30, 0.50)),
  numero             smallint not null default 2 check (numero between 1 and 4),
  peso_kg            numeric(5,2) check (peso_kg > 0 and peso_kg < 200),
  data_prescrizione  date not null default current_date,
  scadenza           date,
  attivo             boolean not null default true,
  note               text,
  creato_il          timestamptz not null default now()
);
create index on clinica.allergo_autoiniettori (pseudo_id);

create table clinica.allergo_terapie (
  id         uuid primary key default gen_random_uuid(),
  pseudo_id  uuid not null references clinica.allergo_cartelle(pseudo_id),
  farmaco    text not null,
  classe     text not null check (classe in ('ics', 'ics_laba', 'saba', 'ltra', 'antistaminico', 'steroide_nasale',
                                             'steroide_topico', 'inibitore_calcineurina', 'emolliente', 'steroide_sistemico',
                                             'biologico', 'collirio', 'altro')),
  posologia  text,
  dal        date not null default current_date,
  al         date,
  note       text,
  creato_il  timestamptz not null default now(),
  check (al is null or al >= dal)
);
create index on clinica.allergo_terapie (pseudo_id, dal desc);

-- Immunoterapia allergene-specifica (sottocutanea, sublinguale, orale per alimenti).
create table clinica.allergo_immunoterapie (
  id            uuid primary key default gen_random_uuid(),
  pseudo_id     uuid not null references clinica.allergo_cartelle(pseudo_id),
  allergene     text not null,
  via           text not null check (via in ('SCIT', 'SLIT', 'OIT')),
  prodotto      text,
  inizio        date not null,
  fase          text not null default 'induzione' check (fase in ('induzione', 'mantenimento', 'sospesa', 'conclusa')),
  fine_prevista date,
  note          text,
  creato_il     timestamptz not null default now(),
  check (fine_prevista is null or fine_prevista >= inizio)
);
create index on clinica.allergo_immunoterapie (pseudo_id);

create table clinica.allergo_ait_dosi (
  id               uuid primary key default gen_random_uuid(),
  immunoterapia_id uuid not null references clinica.allergo_immunoterapie(id),
  pseudo_id        uuid not null references clinica.allergo_cartelle(pseudo_id),
  data             date not null default current_date,
  dose             text not null,
  lotto            text,
  reazione         text not null default 'nessuna' check (reazione in ('nessuna', 'locale', 'sistemica')),
  note             text,
  creato_il        timestamptz not null default now()
);
create index on clinica.allergo_ait_dosi (immunoterapia_id, data desc);

-- La dose deve appartenere allo stesso paziente dell'immunoterapia.
create or replace function clinica.allergo_ait_coerente()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from clinica.allergo_immunoterapie i
                 where i.id = new.immunoterapia_id and i.pseudo_id = new.pseudo_id) then
    raise exception 'La somministrazione non corrisponde all''immunoterapia del paziente';
  end if;
  return new;
end;
$$;
create trigger coerenza before insert or update on clinica.allergo_ait_dosi
  for each row execute function clinica.allergo_ait_coerente();

-- RLS, permessi e audit per tutte le tabelle cliniche del modulo.
-- Nessun DELETE: le correzioni si fanno modificando (tracciate nel registro).
do $$
declare
  t text;
begin
  foreach t in array array['allergo_cartelle', 'allergo_visite', 'allergo_diagnosi', 'allergo_test', 'allergo_tpo',
                           'allergo_spirometrie', 'allergo_punteggi', 'allergo_reazioni', 'allergo_autoiniettori',
                           'allergo_terapie', 'allergo_immunoterapie', 'allergo_ait_dosi'] loop
    execute format('alter table clinica.%I enable row level security', t);
    execute format('grant select, update on clinica.%I to authenticated', t);
    if t <> 'allergo_cartelle' then
      execute format('grant insert on clinica.%I to authenticated', t);
    end if;
    execute format('create policy allergologo_accede on clinica.%I for all to authenticated '
                   'using (sicurezza.puo_accedere_allergo(pseudo_id)) '
                   'with check (sicurezza.puo_accedere_allergo(pseudo_id))', t);
    execute format('create trigger audit after insert or update or delete on clinica.%I '
                   'for each row execute function audit.traccia_modifica()', t);
  end loop;
end;
$$;

-- pseudo_id della cartella non si cambia mai.
create or replace function clinica.allergo_pseudo_fisso()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.pseudo_id is distinct from old.pseudo_id then
    raise exception 'Il paziente di un dato clinico non si può cambiare';
  end if;
  return new;
end;
$$;
do $$
declare
  t text;
begin
  foreach t in array array['allergo_visite', 'allergo_diagnosi', 'allergo_test', 'allergo_tpo', 'allergo_spirometrie',
                           'allergo_punteggi', 'allergo_reazioni', 'allergo_autoiniettori', 'allergo_terapie',
                           'allergo_immunoterapie', 'allergo_ait_dosi'] loop
    execute format('create trigger pseudo_fisso before update on clinica.%I '
                   'for each row execute function clinica.allergo_pseudo_fisso()', t);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC del modulo
-- -----------------------------------------------------------------------------
create or replace function api.allergo_registra_paziente(
  p_nome text, p_cognome text, p_codice_fiscale text, p_data_nascita date, p_sesso char(1),
  p_genitore_nome text default null, p_genitore_telefono text default null, p_genitore_email text default null,
  p_pediatra_curante text default null, p_inviato_da text default null
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_cf text := upper(trim(p_codice_fiscale));
  v_id uuid;
begin
  if not sicurezza.allergologia_ok() then
    raise exception 'Accesso al modulo Allergologia non consentito';
  end if;
  if v_cf !~ '^[A-Z0-9]{16}$' then
    raise exception 'Codice fiscale non valido';
  end if;
  if exists (select 1 from anagrafica.allergo_pazienti
             where studio_id = sicurezza.studio_id() and codice_fiscale_impronta = anagrafica.impronta_cf(v_cf)) then
    raise exception 'Paziente già presente in Allergologia' using errcode = '23505';
  end if;
  insert into anagrafica.allergo_pazienti (studio_id, nome, cognome, codice_fiscale_cifrato, codice_fiscale_impronta,
    data_nascita, sesso, genitore_nome, genitore_telefono, genitore_email, pediatra_curante, inviato_da)
  values (sicurezza.studio_id(), trim(p_nome), trim(p_cognome), anagrafica.cifra_cf(v_cf), anagrafica.impronta_cf(v_cf),
    p_data_nascita, p_sesso, nullif(trim(p_genitore_nome), ''), nullif(trim(p_genitore_telefono), ''),
    nullif(lower(trim(p_genitore_email)), ''), nullif(trim(p_pediatra_curante), ''), nullif(trim(p_inviato_da), ''))
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function api.allergo_registra_paziente(text, text, text, date, char, text, text, text, text, text) to authenticated;

create or replace function api.allergo_apri_cartella(p_paziente_id uuid)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_pseudo uuid;
begin
  select m.pseudo_id into v_pseudo
  from pseudonimi.allergo_mappa m
  join anagrafica.allergo_pazienti p on p.id = m.paziente_id
  where m.paziente_id = p_paziente_id and p.studio_id = sicurezza.studio_id();
  if v_pseudo is null or not sicurezza.allergologia_ok() then
    raise exception 'Accesso alla cartella allergologica non consentito';
  end if;
  perform audit.registra('APERTURA_CARTELLA_ALLERGO', 'clinica.allergo_cartelle', null, v_pseudo);
  return v_pseudo;
end;
$$;
grant execute on function api.allergo_apri_cartella(uuid) to authenticated;

create or replace function api.allergo_codice_fiscale(p_paziente_id uuid)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  v_cf bytea;
begin
  if not sicurezza.allergologia_ok() then
    raise exception 'Accesso al modulo Allergologia non consentito';
  end if;
  select codice_fiscale_cifrato into v_cf from anagrafica.allergo_pazienti
  where id = p_paziente_id and studio_id = sicurezza.studio_id();
  if v_cf is null then
    raise exception 'Paziente non trovato';
  end if;
  return extensions.pgp_sym_decrypt(v_cf, sicurezza.chiave_cf());
end;
$$;
grant execute on function api.allergo_codice_fiscale(uuid) to authenticated;

-- Promemoria per l'elenco: controlli in scadenza e autoiniettori da rinnovare
-- (nessun dato clinico oltre al necessario, solo per chi accede al modulo).
create or replace function api.allergo_promemoria()
returns table (paziente_id uuid, tipo text, data date, dettaglio text)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not sicurezza.allergologia_ok() then
    raise exception 'Accesso al modulo Allergologia non consentito';
  end if;
  return query
    select m.paziente_id, 'controllo'::text, v.prossimo_controllo, null::text
    from clinica.allergo_visite v
    join pseudonimi.allergo_mappa m on m.pseudo_id = v.pseudo_id
    join anagrafica.allergo_pazienti p on p.id = m.paziente_id
    where p.studio_id = sicurezza.studio_id() and p.stato = 'attivo'
      and v.prossimo_controllo is not null and v.prossimo_controllo <= current_date + 30
      and v.data = (select max(v2.data) from clinica.allergo_visite v2 where v2.pseudo_id = v.pseudo_id)
    union all
    select m.paziente_id, 'autoiniettore', a.scadenza, a.dispositivo || ' ' || replace(a.dose_mg::text, '.', ',') || ' mg'
    from clinica.allergo_autoiniettori a
    join pseudonimi.allergo_mappa m on m.pseudo_id = a.pseudo_id
    join anagrafica.allergo_pazienti p on p.id = m.paziente_id
    where p.studio_id = sicurezza.studio_id() and p.stato = 'attivo'
      and a.attivo and a.scadenza is not null and a.scadenza <= current_date + 60
    order by 3;
end;
$$;
grant execute on function api.allergo_promemoria() to authenticated;
