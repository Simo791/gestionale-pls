-- =============================================================================
-- 2900 · Modulo Auxologia pediatrica (crescita, pubertà, ormone della crescita)
--
-- Stessa architettura del modulo Allergologia (1800):
-- - attivabile per studio dall'amministratore (studi.auxologia_attiva);
-- - visibile all'amministratore e ai membri abilitati (membri_studio.auxologia);
--   nuovo ruolo 'auxologo' per lo specialista che usa SOLO questo modulo;
-- - anagrafica pazienti propria (anagrafica.auxo_pazienti), separata dagli assistiti;
--   dati clinici con solo pseudo_id (clinica.auxo_*), mappa in "pseudonimi" senza permessi;
-- - nessun DELETE sui dati clinici, audit con catena di hash su ogni modifica.
--
-- Controlli specifici della materia (il database è la fonte di verità):
-- - l'età alla misura la calcola il database dalla data di nascita (mai digitata);
-- - nessuna misura prima della nascita o nel futuro; intervalli plausibili per ogni misura;
-- - posizione della misura (sdraiato/in piedi), necessaria per le curve OMS;
-- - stadi di Tanner coerenti con il sesso, volumi dell'orchidometro di Prader;
-- - target genetico calcolato (formula di Tanner) dalle stature dei genitori;
-- - soglia del picco di GH della Nota AIFA 39 calcolata dallo stimolo (8 o 20 µg/L).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Attivazione del modulo e abilitazione dei membri
-- -----------------------------------------------------------------------------
alter table anagrafica.studi
  add column auxologia_attiva      boolean not null default false,
  add column auxologia_attivata_il timestamptz;

alter table anagrafica.membri_studio drop constraint membri_studio_ruolo_check;
alter table anagrafica.membri_studio
  add constraint membri_studio_ruolo_check check (ruolo in ('pediatra', 'segreteria', 'sostituto', 'allergologo', 'auxologo')),
  add column auxologia              boolean not null default false,
  add column auxologia_abilitato_il timestamptz,
  add column auxologia_abilitato_da uuid;

-- Accesso verificato SUL MOMENTO nelle tabelle (non solo nel token).
create or replace function sicurezza.auxologia_ok()
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
         and s.auxologia_attiva
         and m.ruolo <> 'segreteria'
         and (m.amministratore or (m.auxologia and m.ruolo in ('pediatra', 'sostituto', 'auxologo')))
     );
$$;

-- Simmetrico per l'Allergologia: un auxologo non si abilita all'Allergologia (e viceversa).
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
         and m.ruolo <> 'segreteria'
         and (m.amministratore or (m.allergologia and m.ruolo in ('pediatra', 'sostituto', 'allergologo')))
     );
$$;

create or replace function api.abilita_allergologia(p_utente uuid, p_abilita boolean)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_studio uuid := sicurezza.studio_id();
begin
  if not sicurezza.admin_attivo() or not sicurezza.mfa_ok() then
    raise exception 'Solo l''amministratore dello studio abilita gli allergologi';
  end if;
  update anagrafica.membri_studio
     set allergologia = p_abilita,
         allergologia_abilitato_il = case when p_abilita then now() end,
         allergologia_abilitato_da = case when p_abilita then auth.uid() end,
         aggiornato_il = now()
   where utente_id = p_utente and studio_id = v_studio and not amministratore
     and ruolo in ('pediatra', 'sostituto', 'allergologo');
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

-- Token: anche app_auxologia (solo per decidere cosa mostrare nel menu).
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
  v_auxo   boolean := false;
  v_cartelle boolean := false;
begin
  select m.ruolo, m.studio_id, m.amministratore and m.ruolo <> 'segreteria',
         s.allergologia_attiva and m.ruolo <> 'segreteria'
           and (m.amministratore or (m.allergologia and m.ruolo in ('pediatra', 'sostituto', 'allergologo'))),
         s.auxologia_attiva and m.ruolo <> 'segreteria'
           and (m.amministratore or (m.auxologia and m.ruolo in ('pediatra', 'sostituto', 'auxologo'))),
         m.ruolo = 'segreteria' and exists (select 1 from anagrafica.permessi_cartelle pc where pc.segreteria_id = m.utente_id)
    into v_ruolo, v_studio, v_admin, v_allerg, v_auxo, v_cartelle
  from anagrafica.membri_studio m
  join anagrafica.studi s on s.id = m.studio_id
  where m.utente_id = v_utente and m.attivo;
  v_claims := jsonb_set(v_claims, '{app_ruolo}', to_jsonb(coalesce(v_ruolo, 'nessuno')));
  v_claims := jsonb_set(v_claims, '{app_admin}', to_jsonb(coalesce(v_admin, false)));
  v_claims := jsonb_set(v_claims, '{app_allergologia}', to_jsonb(coalesce(v_allerg, false)));
  v_claims := jsonb_set(v_claims, '{app_auxologia}', to_jsonb(coalesce(v_auxo, false)));
  v_claims := jsonb_set(v_claims, '{app_cartelle}', to_jsonb(coalesce(v_cartelle, false)));
  if v_studio is not null then
    v_claims := jsonb_set(v_claims, '{app_studio_id}', to_jsonb(v_studio));
  else
    v_claims := v_claims - 'app_studio_id';
  end if;
  return jsonb_set(event, '{claims}', v_claims);
end;
$$;

-- L'auxologo può essere amministratore come l'allergologo (mai la segreteria).
create or replace function sicurezza.is_admin()
returns boolean
language sql stable
set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'app_admin')::boolean, false)
     and sicurezza.ruolo() in ('pediatra', 'sostituto', 'allergologo', 'auxologo')
     and sicurezza.studio_id() is not null;
$$;

create or replace function sicurezza.is_staff()
returns boolean
language sql stable
set search_path = ''
as $$
  -- Per gli specialisti si ricontrolla la tabella: un token vecchio di un ex amministratore non basta.
  select (sicurezza.ruolo() in ('pediatra', 'segreteria', 'sostituto')
          or (sicurezza.ruolo() in ('allergologo', 'auxologo') and sicurezza.is_admin() and sicurezza.admin_attivo()))
     and sicurezza.studio_id() is not null;
$$;

create or replace function sicurezza.puo_accedere_paziente(p_paziente_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select sicurezza.mfa_ok()
     and sicurezza.ruolo() in ('pediatra', 'sostituto', 'allergologo', 'auxologo')
     and exists (
       select 1
       from anagrafica.pazienti p
       where p.id = p_paziente_id
         and p.studio_id = sicurezza.studio_id()
         and (
           (sicurezza.ruolo() in ('pediatra', 'sostituto') and (
              p.pediatra_id = auth.uid()
              or exists (
                select 1 from anagrafica.sostituzioni s
                where s.titolare_id = p.pediatra_id
                  and s.sostituto_id = auth.uid()
                  and s.revocata_il is null
                  and current_date between s.dal and s.al
              )))
           or sicurezza.admin_attivo()
         )
     );
$$;

create or replace function api.imposta_auxologia(p_attiva boolean)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not sicurezza.admin_attivo() or not sicurezza.mfa_ok() then
    raise exception 'Solo l''amministratore dello studio attiva il modulo Auxologia';
  end if;
  update anagrafica.studi
     set auxologia_attiva = p_attiva,
         auxologia_attivata_il = case when p_attiva then now() else auxologia_attivata_il end
   where id = sicurezza.studio_id();
  perform audit.registra(case when p_attiva then 'ATTIVAZIONE_AUXOLOGIA' else 'DISATTIVAZIONE_AUXOLOGIA' end,
                         'anagrafica.studi', sicurezza.studio_id()::text, null, '{}'::jsonb);
end;
$$;

create or replace function api.abilita_auxologia(p_utente uuid, p_abilita boolean)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_studio uuid := sicurezza.studio_id();
begin
  if not sicurezza.admin_attivo() or not sicurezza.mfa_ok() then
    raise exception 'Solo l''amministratore dello studio abilita gli auxologi';
  end if;
  update anagrafica.membri_studio
     set auxologia = p_abilita,
         auxologia_abilitato_il = case when p_abilita then now() end,
         auxologia_abilitato_da = case when p_abilita then auth.uid() end,
         aggiornato_il = now()
   where utente_id = p_utente and studio_id = v_studio and not amministratore
     and ruolo in ('pediatra', 'sostituto', 'auxologo');
  if not found then
    raise exception 'Membro non trovato o non abilitabile (la segreteria non accede al modulo clinico)';
  end if;
  perform audit.registra(case when p_abilita then 'ABILITAZIONE_AUXOLOGIA' else 'REVOCA_AUXOLOGIA' end,
                         'anagrafica.membri_studio', p_utente::text, null, '{}'::jsonb);
  if p_abilita then
    perform anagrafica.notifica(v_studio, p_utente, 'auxologia',
      'Accesso al modulo Auxologia', 'L''amministratore ti ha abilitato. Esci e rientra per vedere la sezione.',
      '#/auxologia');
  end if;
end;
$$;

-- Messaggio di benvenuto anche per il ruolo auxologo (aggiunto dalla Edge Function).
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
      when 'auxologo' then 'Al primo accesso configura il secondo fattore. Hai accesso al solo modulo Auxologia, con i suoi pazienti.'
      else 'Al primo accesso configura il secondo fattore. Gestisci agenda, anagrafiche e consensi.' end,
    case p_ruolo when 'allergologo' then '#/allergologia' when 'auxologo' then '#/auxologia' else '#/cruscotto' end);
end;
$$;
revoke execute on function api.registra_evento_staff(uuid, uuid, uuid, text) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function api.registra_evento_staff(uuid, uuid, uuid, text) to service_role;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 2. Anagrafica dei pazienti auxologici (separata dagli assistiti)
-- -----------------------------------------------------------------------------
create table anagrafica.auxo_pazienti (
  id                      uuid primary key default gen_random_uuid(),
  studio_id               uuid not null references anagrafica.studi(id),
  nome                    text not null check (length(trim(nome)) > 0),
  cognome                 text not null check (length(trim(cognome)) > 0),
  codice_fiscale_cifrato  bytea not null,
  codice_fiscale_impronta text not null,
  data_nascita            date not null check (data_nascita <= current_date and data_nascita >= date '1990-01-01'),
  sesso                   char(1) not null check (sesso in ('M', 'F')),
  luogo_nascita           text,
  residenza               text,
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
create index on anagrafica.auxo_pazienti (studio_id, cognome, nome);
alter table anagrafica.auxo_pazienti enable row level security;
-- Codice fiscale mai leggibile direttamente: solo con api.auxo_codice_fiscale (registrata).
-- Data di nascita e sesso NON modificabili: da essi dipendono età e DS di tutte le misure.
grant select (id, studio_id, nome, cognome, data_nascita, sesso, luogo_nascita, residenza, genitore_nome, genitore_telefono,
              genitore_email, pediatra_curante, inviato_da, note_organizzative, stato, creato_da, creato_il)
  on anagrafica.auxo_pazienti to authenticated;
grant update (nome, cognome, luogo_nascita, residenza, genitore_nome, genitore_telefono, genitore_email, pediatra_curante,
              inviato_da, note_organizzative, stato)
  on anagrafica.auxo_pazienti to authenticated;
create policy auxo_legge_pazienti on anagrafica.auxo_pazienti
  for select to authenticated using (sicurezza.auxologia_ok() and studio_id = sicurezza.studio_id());
create policy auxo_modifica_pazienti on anagrafica.auxo_pazienti
  for update to authenticated
  using (sicurezza.auxologia_ok() and studio_id = sicurezza.studio_id())
  with check (studio_id = sicurezza.studio_id());
create trigger audit after insert or update or delete on anagrafica.auxo_pazienti
  for each row execute function audit.traccia_modifica();

create table pseudonimi.auxo_mappa (
  paziente_id  uuid primary key references anagrafica.auxo_pazienti(id) on delete restrict,
  pseudo_id    uuid not null unique default gen_random_uuid(),
  creato_il    timestamptz not null default now()
);
revoke all on pseudonimi.auxo_mappa from public, anon, authenticated;
alter table pseudonimi.auxo_mappa enable row level security;  -- seconda barriera: nessuna policy

-- -----------------------------------------------------------------------------
-- 3. Cartella auxologica (solo pseudo_id)
-- -----------------------------------------------------------------------------
create table clinica.auxo_cartelle (
  pseudo_id                 uuid primary key references pseudonimi.auxo_mappa(pseudo_id),
  sesso                     char(1) not null check (sesso in ('M', 'F')),
  -- Genitori biologici: stature (cm) e se misurate in studio o riferite.
  altezza_padre_cm          numeric(4,1) check (altezza_padre_cm between 120 and 230),
  altezza_madre_cm          numeric(4,1) check (altezza_madre_cm between 110 and 220),
  altezze_genitori_misurate boolean,
  -- Target genetico (Tanner): (padre + madre ± 13) / 2, intervallo ± 8,5 cm.
  target_genetico_cm        numeric(4,1) generated always as (
                              case when altezza_padre_cm is not null and altezza_madre_cm is not null
                                   then round((altezza_padre_cm + altezza_madre_cm + case sesso when 'M' then 13 else -13 end) / 2.0, 1) end) stored,
  eta_menarca_madre         numeric(3,1) check (eta_menarca_madre between 8 and 20),
  puberta_padre             text check (puberta_padre in ('anticipata', 'nella_norma', 'tardiva', 'non_nota')),
  -- Nascita
  eta_gestazionale_sett     smallint check (eta_gestazionale_sett between 22 and 44),
  peso_nascita_g            integer check (peso_nascita_g between 300 and 6500),
  lunghezza_nascita_cm      numeric(4,1) check (lunghezza_nascita_cm between 25 and 65),
  cc_nascita_cm             numeric(4,1) check (cc_nascita_cm between 18 and 45),
  -- DS alla nascita letti sulle carte neonatali (Nota 39: carte di Bertino / INeS).
  sds_peso_nascita          numeric(4,2) check (sds_peso_nascita between -8 and 8),
  sds_lunghezza_nascita     numeric(4,2) check (sds_lunghezza_nascita between -8 and 8),
  carte_neonatali           text,
  -- Anamnesi
  anamnesi_familiare        text,
  anamnesi_fisiologica      text,
  anamnesi_remota           text,
  anamnesi_personale        text,
  farmaci                   text,
  lesioni_ipotalamo_ipofisarie boolean,
  note                      text,
  aggiornata_il             timestamptz not null default now()
);

create or replace function pseudonimi.crea_per_auxo_paziente()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_pseudo uuid;
begin
  insert into pseudonimi.auxo_mappa (paziente_id) values (new.id) returning pseudo_id into v_pseudo;
  insert into clinica.auxo_cartelle (pseudo_id, sesso) values (v_pseudo, new.sesso);
  return new;
end;
$$;
create trigger crea_pseudonimo after insert on anagrafica.auxo_pazienti
  for each row execute function pseudonimi.crea_per_auxo_paziente();

create or replace function sicurezza.puo_accedere_auxo(p_pseudo_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select sicurezza.auxologia_ok()
     and exists (
       select 1 from pseudonimi.auxo_mappa m
       join anagrafica.auxo_pazienti p on p.id = m.paziente_id
       where m.pseudo_id = p_pseudo_id and p.studio_id = sicurezza.studio_id()
     );
$$;

-- Data di nascita dal solo pseudo_id (per i trigger; nessun permesso agli utenti).
create or replace function pseudonimi.auxo_nascita(p_pseudo_id uuid)
returns date
language sql stable security definer
set search_path = ''
as $$
  select p.data_nascita from pseudonimi.auxo_mappa m
  join anagrafica.auxo_pazienti p on p.id = m.paziente_id
  where m.pseudo_id = p_pseudo_id;
$$;
revoke execute on function pseudonimi.auxo_nascita(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. Visite, misure, pubertà, età ossea, esami, test del GH, diagnosi, terapie
-- -----------------------------------------------------------------------------
create table clinica.auxo_visite (
  id                   uuid primary key default gen_random_uuid(),
  pseudo_id            uuid not null references clinica.auxo_cartelle(pseudo_id),
  medico_id            uuid not null default auth.uid(),
  data                 timestamptz not null default now(),
  tipo                 text not null default 'controllo' check (tipo in ('prima_visita', 'controllo', 'terapia_gh', 'altro')),
  motivo               text not null check (length(trim(motivo)) > 0),
  anamnesi             text,
  decorso              text,
  esame_obiettivo      text,
  esami_eseguiti       text,
  conclusioni          text,
  diagnosi_testo       text,
  piano                text,
  prossimo_controllo   date,
  visita_precedente_id uuid references clinica.auxo_visite(id),
  modelli              text[] not null default '{}',
  anamnesi_snapshot    jsonb,
  aggiornata_il        timestamptz not null default now()
);
create index on clinica.auxo_visite (pseudo_id, data desc);

create or replace function clinica.auxo_visita_precedente_coerente()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.visita_precedente_id is not null and not exists (
       select 1 from clinica.auxo_visite v where v.id = new.visita_precedente_id and v.pseudo_id = new.pseudo_id and v.id <> new.id) then
    raise exception 'La visita precedente non appartiene a questo paziente';
  end if;
  return new;
end;
$$;
create trigger visita_precedente before insert or update on clinica.auxo_visite
  for each row execute function clinica.auxo_visita_precedente_coerente();

-- Misure antropometriche. L'età (anni decimali, giorni/365,25) la scrive il database.
create table clinica.auxo_misure (
  id                   uuid primary key default gen_random_uuid(),
  pseudo_id            uuid not null references clinica.auxo_cartelle(pseudo_id),
  visita_id            uuid references clinica.auxo_visite(id),
  data                 date not null default current_date,
  eta_anni             numeric(5,2) not null,
  altezza_cm           numeric(5,1) check (altezza_cm between 30 and 230),
  posizione            text check (posizione in ('sdraiato', 'in_piedi')),
  peso_kg              numeric(5,2) check (peso_kg between 0.3 and 250),
  bmi                  numeric(6,2) generated always as (
                         case when altezza_cm is not null and peso_kg is not null
                              then round(peso_kg / ((altezza_cm / 100.0) * (altezza_cm / 100.0)), 2) end) stored,
  cc_cm                numeric(4,1) check (cc_cm between 25 and 70),
  altezza_seduto_cm    numeric(5,1) check (altezza_seduto_cm between 15 and 130),
  apertura_braccia_cm  numeric(5,1) check (apertura_braccia_cm between 30 and 240),
  vita_cm              numeric(5,1) check (vita_cm between 30 and 200),
  pas_mmhg             smallint check (pas_mmhg between 50 and 250),
  pad_mmhg             smallint check (pad_mmhg between 20 and 160),
  -- Velocità di crescita in DS letta dal medico sulle tabelle di riferimento (non calcolabile qui:
  -- il gestionale non contiene tabelle di velocità validate), per l'intervallo che termina con questa misura.
  velocita_sds         numeric(4,2) check (velocita_sds between -8 and 8),
  velocita_riferimento text,
  strumento            text,
  note                 text,
  creato_il            timestamptz not null default now(),
  check (num_nonnulls(altezza_cm, peso_kg, cc_cm, altezza_seduto_cm, apertura_braccia_cm, vita_cm, pas_mmhg) > 0),
  check (altezza_seduto_cm is null or altezza_cm is null or altezza_seduto_cm < altezza_cm),
  check (vita_cm is null or altezza_cm is null or vita_cm < altezza_cm * 1.5),
  check ((pas_mmhg is null) = (pad_mmhg is null)),
  check (pad_mmhg is null or pad_mmhg < pas_mmhg),
  check ((altezza_cm is null) = (posizione is null)),
  check (velocita_sds is null or altezza_cm is not null)
);
create index on clinica.auxo_misure (pseudo_id, data desc);

-- Stadi puberali (Tanner) e volume testicolare (orchidometro di Prader).
create table clinica.auxo_puberta (
  id               uuid primary key default gen_random_uuid(),
  pseudo_id        uuid not null references clinica.auxo_cartelle(pseudo_id),
  visita_id        uuid references clinica.auxo_visite(id),
  data             date not null default current_date,
  eta_anni         numeric(5,2) not null,
  tanner_b         smallint check (tanner_b between 1 and 5),
  tanner_g         smallint check (tanner_g between 1 and 5),
  tanner_ph        smallint check (tanner_ph between 1 and 6),
  testicolo_dx_ml  numeric(3,1) check (testicolo_dx_ml in (1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25)),
  testicolo_sx_ml  numeric(3,1) check (testicolo_sx_ml in (1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25)),
  menarca          boolean,
  data_menarca     date,
  note             text,
  creato_il        timestamptz not null default now(),
  check (num_nonnulls(tanner_b, tanner_g, tanner_ph, testicolo_dx_ml, testicolo_sx_ml, menarca) > 0),
  check (data_menarca is null or menarca is true),
  check (data_menarca is null or data_menarca <= data)
);
create index on clinica.auxo_puberta (pseudo_id, data desc);

-- Età ossea (radiografia mano-polso) ed eventuale previsione di statura adulta.
create table clinica.auxo_eta_ossea (
  id                    uuid primary key default gen_random_uuid(),
  pseudo_id             uuid not null references clinica.auxo_cartelle(pseudo_id),
  data                  date not null default current_date,
  eta_anni              numeric(5,2) not null,
  metodo                text not null check (metodo in ('greulich_pyle', 'tw3_rus', 'tw2', 'fels', 'altro')),
  eta_ossea_anni        numeric(4,2) not null check (eta_ossea_anni between 0 and 19),
  refertata_da          text,
  previsione_statura_cm numeric(4,1) check (previsione_statura_cm between 100 and 230),
  metodo_previsione     text check (metodo_previsione in ('bayley_pinneau', 'tw3', 'roche_wainer_thissen', 'altro')),
  note                  text,
  creato_il             timestamptz not null default now(),
  check ((previsione_statura_cm is null) = (metodo_previsione is null))
);
create index on clinica.auxo_eta_ossea (pseudo_id, data desc);

-- Esami di laboratorio e genetici.
create table clinica.auxo_esami (
  id            uuid primary key default gen_random_uuid(),
  pseudo_id     uuid not null references clinica.auxo_cartelle(pseudo_id),
  data          date not null default current_date,
  esame         text not null check (esame in ('igf1', 'igfbp3', 'tsh', 'ft4', 'emocromo', 'ves', 'pcr', 'ttg_iga', 'iga_totali',
                                               'creatinina', 'elettroliti', 'glicemia', 'insulina', 'hba1c', 'ogtt',
                                               'colesterolo_totale', 'hdl', 'ldl', 'trigliceridi', 'alt', 'ast', 'lh', 'fsh',
                                               'estradiolo', 'testosterone', 'dheas', '17ohp', 'cortisolo', 'prolattina',
                                               'vitamina_d', 'cariotipo', 'shox', 'genetica', 'urine', 'altro')),
  descrizione   text,
  valore        numeric(12,3),
  unita         text,
  valore_testo  text,
  rif_min       numeric(12,3),
  rif_max       numeric(12,3),
  sds           numeric(4,2) check (sds between -10 and 10),
  laboratorio   text,
  note          text,
  creato_il     timestamptz not null default now(),
  check (valore is not null or nullif(trim(valore_testo), '') is not null),
  check (rif_min is null or rif_max is null or rif_min <= rif_max),
  check (esame <> 'altro' or nullif(trim(descrizione), '') is not null)
);
create index on clinica.auxo_esami (pseudo_id, data desc);

-- Test di stimolo del GH. Soglia della Nota AIFA 39: < 8 µg/L; < 20 µg/L con GHRH + arginina.
create table clinica.auxo_test_gh (
  id           uuid primary key default gen_random_uuid(),
  pseudo_id    uuid not null references clinica.auxo_cartelle(pseudo_id),
  data         date not null default current_date,
  stimolo      text not null check (stimolo in ('arginina', 'clonidina', 'glucagone', 'insulina', 'ghrh_arginina', 'levodopa', 'altro')),
  priming      boolean not null default false,       -- priming con steroidi sessuali
  picco_ug_l   numeric(5,2) not null check (picco_ug_l >= 0 and picco_ug_l < 100),
  soglia_ug_l  numeric(4,1) generated always as (case when stimolo = 'ghrh_arginina' then 20 else 8 end) stored,
  sotto_soglia boolean generated always as (picco_ug_l < case when stimolo = 'ghrh_arginina' then 20 else 8 end) stored,
  prelievi     jsonb not null default '[]'::jsonb check (jsonb_typeof(prelievi) = 'array'),
  note         text,
  creato_il    timestamptz not null default now()
);
create index on clinica.auxo_test_gh (pseudo_id, data desc);

create table clinica.auxo_diagnosi (
  id             uuid primary key default gen_random_uuid(),
  pseudo_id      uuid not null references clinica.auxo_cartelle(pseudo_id),
  area           text not null check (area in ('bassa_statura_familiare', 'ritardo_costituzionale', 'bassa_statura_idiopatica',
                                               'ghd', 'sga', 'turner', 'noonan', 'shox', 'prader_willi', 'irc', 'sindromica',
                                               'displasia_scheletrica', 'alta_statura', 'puberta_precoce', 'telarca_prematuro',
                                               'pubarca_prematuro', 'ritardo_puberale', 'ipogonadismo', 'sovrappeso', 'obesita',
                                               'magrezza', 'scarso_accrescimento', 'ipotiroidismo', 'celiachia', 'altro')),
  descrizione    text not null,
  data_diagnosi  date,
  stato          text not null default 'attiva' check (stato in ('sospetta', 'attiva', 'in_remissione', 'risolta')),
  note           text,
  creato_il      timestamptz not null default now(),
  aggiornato_il  timestamptz not null default now()
);
create index on clinica.auxo_diagnosi (pseudo_id);

-- Terapie (ormone della crescita, analoghi del GnRH, levotiroxina, steroidi sessuali…).
create table clinica.auxo_terapie (
  id                         uuid primary key default gen_random_uuid(),
  pseudo_id                  uuid not null references clinica.auxo_cartelle(pseudo_id),
  classe                     text not null check (classe in ('somatropina', 'gh_lunga_durata', 'analogo_gnrh', 'levotiroxina',
                                                             'testosterone', 'estrogeni', 'altro')),
  farmaco                    text not null check (length(trim(farmaco)) > 0),
  indicazione_nota39         text check (indicazione_nota39 in ('ghd', 'turner', 'irc', 'prader_willi', 'sga', 'shox', 'noonan',
                                                                  'craniofaringioma')),
  posologia                  text,
  dose_ug_kg_die             numeric(5,1) check (dose_ug_kg_die > 0 and dose_ug_kg_die <= 100),
  peso_riferimento_kg        numeric(5,2) check (peso_riferimento_kg between 1 and 250),
  dal                        date not null default current_date,
  al                         date,
  motivo_sospensione         text,
  piano_terapeutico_scadenza date,
  centro_prescrittore        text,
  note                       text,
  creato_il                  timestamptz not null default now(),
  check (al is null or al >= dal),
  check (indicazione_nota39 is null or classe in ('somatropina', 'gh_lunga_durata')),
  check (dose_ug_kg_die is null or classe = 'somatropina')
);
create index on clinica.auxo_terapie (pseudo_id, dal desc);

-- Età alla data e controlli sulla data: mai prima della nascita, mai nel futuro
-- (un giorno di tolleranza per il fuso orario del server).
create or replace function clinica.auxo_eta_alla_data()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_nascita date := pseudonimi.auxo_nascita(new.pseudo_id);
begin
  if v_nascita is null then
    raise exception 'Paziente non trovato';
  end if;
  if new.data < v_nascita then
    raise exception 'La data (%) precede la nascita del paziente', to_char(new.data, 'DD/MM/YYYY');
  end if;
  if new.data > current_date + 1 then
    raise exception 'La data (%) è nel futuro', to_char(new.data, 'DD/MM/YYYY');
  end if;
  new.eta_anni := round((new.data - v_nascita) / 365.25, 2);
  return new;
end;
$$;
create trigger eta before insert or update on clinica.auxo_misure
  for each row execute function clinica.auxo_eta_alla_data();
create trigger eta before insert or update on clinica.auxo_puberta
  for each row execute function clinica.auxo_eta_alla_data();
create trigger eta before insert or update on clinica.auxo_eta_ossea
  for each row execute function clinica.auxo_eta_alla_data();

-- Date di esami, test e terapie: non prima della nascita né nel futuro.
create or replace function clinica.auxo_data_valida()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_nascita date := pseudonimi.auxo_nascita(new.pseudo_id);
  v_data date := (to_jsonb(new) ->> case tg_table_name when 'auxo_terapie' then 'dal' else 'data' end)::date;
begin
  if v_nascita is null then
    raise exception 'Paziente non trovato';
  end if;
  if v_data < v_nascita or v_data > current_date + 1 then
    raise exception 'Data non valida: prima della nascita o nel futuro';
  end if;
  if tg_table_name = 'auxo_terapie' then
    if new.al is not null and new.al > new.dal + interval '30 years' then
      raise exception 'Data di fine terapia non plausibile';
    end if;
    if new.piano_terapeutico_scadenza is not null
       and (new.piano_terapeutico_scadenza < v_nascita or new.piano_terapeutico_scadenza > current_date + interval '3 years') then
      raise exception 'Scadenza del piano terapeutico non plausibile';
    end if;
  end if;
  return new;
end;
$$;
create trigger data_valida before insert or update on clinica.auxo_esami
  for each row execute function clinica.auxo_data_valida();
create trigger data_valida before insert or update on clinica.auxo_test_gh
  for each row execute function clinica.auxo_data_valida();
create trigger data_valida before insert or update on clinica.auxo_terapie
  for each row execute function clinica.auxo_data_valida();

-- Misura: posizione predefinita secondo l'età (OMS: sdraiato sotto i 2 anni) e visita dello stesso paziente.
create or replace function clinica.auxo_misura_coerente()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.altezza_cm is null then
    new.posizione := null;
  elsif new.posizione is null then
    -- Come l'OMS: da sdraiato fino a 730 giorni di vita, in piedi dal giorno 731.
    new.posizione := case when new.data - pseudonimi.auxo_nascita(new.pseudo_id) < 731 then 'sdraiato' else 'in_piedi' end;
  end if;
  if new.visita_id is not null and not exists (
       select 1 from clinica.auxo_visite v where v.id = new.visita_id and v.pseudo_id = new.pseudo_id) then
    raise exception 'La visita non appartiene a questo paziente';
  end if;
  return new;
end;
$$;
-- Dopo il trigger "eta" (ordine alfabetico: eta < misura_coerente).
create trigger misura_coerente before insert or update on clinica.auxo_misure
  for each row execute function clinica.auxo_misura_coerente();

-- Pubertà: stadi coerenti con il sesso e visita dello stesso paziente.
create or replace function clinica.auxo_puberta_coerente()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_sesso char(1);
begin
  select sesso into v_sesso from clinica.auxo_cartelle where pseudo_id = new.pseudo_id;
  if v_sesso = 'M' and (new.tanner_b is not null or new.menarca is not null or new.data_menarca is not null) then
    raise exception 'Stadio mammario e menarca si registrano solo nelle femmine';
  end if;
  if v_sesso = 'F' and (new.tanner_g is not null or new.testicolo_dx_ml is not null or new.testicolo_sx_ml is not null) then
    raise exception 'Stadio genitale e volume testicolare si registrano solo nei maschi';
  end if;
  if new.visita_id is not null and not exists (
       select 1 from clinica.auxo_visite v where v.id = new.visita_id and v.pseudo_id = new.pseudo_id) then
    raise exception 'La visita non appartiene a questo paziente';
  end if;
  return new;
end;
$$;
create trigger puberta_coerente before insert or update on clinica.auxo_puberta
  for each row execute function clinica.auxo_puberta_coerente();

-- RLS, permessi e audit per tutte le tabelle cliniche del modulo. Nessun DELETE.
do $$
declare
  t text;
begin
  foreach t in array array['auxo_cartelle', 'auxo_visite', 'auxo_misure', 'auxo_puberta', 'auxo_eta_ossea', 'auxo_esami',
                           'auxo_test_gh', 'auxo_diagnosi', 'auxo_terapie'] loop
    execute format('alter table clinica.%I enable row level security', t);
    execute format('grant select, update on clinica.%I to authenticated', t);
    if t <> 'auxo_cartelle' then
      execute format('grant insert on clinica.%I to authenticated', t);
    end if;
    execute format('create policy auxologo_accede on clinica.%I for all to authenticated '
                   'using (sicurezza.puo_accedere_auxo(pseudo_id)) '
                   'with check (sicurezza.puo_accedere_auxo(pseudo_id))', t);
    execute format('create trigger audit after insert or update or delete on clinica.%I '
                   'for each row execute function audit.traccia_modifica()', t);
  end loop;
end;
$$;
-- Il sesso della cartella segue l'anagrafica (non modificabile).
revoke update on clinica.auxo_cartelle from authenticated;
grant update (altezza_padre_cm, altezza_madre_cm, altezze_genitori_misurate, eta_menarca_madre, puberta_padre,
              eta_gestazionale_sett, peso_nascita_g, lunghezza_nascita_cm, cc_nascita_cm, sds_peso_nascita,
              sds_lunghezza_nascita, carte_neonatali, anamnesi_familiare, anamnesi_fisiologica, anamnesi_remota,
              anamnesi_personale, farmaci, lesioni_ipotalamo_ipofisarie, note, aggiornata_il)
  on clinica.auxo_cartelle to authenticated;
-- L'età la scrive il database: non è modificabile a mano.
do $$
declare
  t text;
  colonne text;
begin
  foreach t in array array['auxo_misure', 'auxo_puberta', 'auxo_eta_ossea'] loop
    select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into colonne
    from information_schema.columns
    where table_schema = 'clinica' and table_name = t and is_generated = 'NEVER'
      and column_name not in ('id', 'pseudo_id', 'eta_anni', 'creato_il');
    execute format('revoke update on clinica.%I from authenticated', t);
    execute format('grant update (%s) on clinica.%I to authenticated', colonne, t);
  end loop;
end;
$$;

-- Visita: l'autore è chi la registra (non modificabile) e la data è tra la nascita e oggi.
create or replace function clinica.auxo_visita_controlli()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_nascita date := pseudonimi.auxo_nascita(new.pseudo_id);
  v_giorno date := (new.data at time zone 'Europe/Rome')::date;
begin
  if tg_op = 'INSERT' then
    new.medico_id := coalesce(auth.uid(), new.medico_id);
  else
    new.medico_id := old.medico_id;
  end if;
  if v_nascita is null then
    raise exception 'Paziente non trovato';
  end if;
  if v_giorno < v_nascita or v_giorno > current_date + 1 then
    raise exception 'Data della visita non valida: prima della nascita o nel futuro';
  end if;
  if new.prossimo_controllo is not null and new.prossimo_controllo < v_giorno then
    raise exception 'Il prossimo controllo precede la data della visita';
  end if;
  return new;
end;
$$;
create trigger controlli before insert or update on clinica.auxo_visite
  for each row execute function clinica.auxo_visita_controlli();
revoke execute on function clinica.auxo_visita_controlli() from public, anon, authenticated;

-- Date di registrazione e di aggiornamento: le scrive il database (non falsificabili).
create or replace function clinica.auxo_timbri()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  n jsonb := to_jsonb(new);
  j jsonb := '{}'::jsonb;
begin
  if n ? 'creato_il' then
    j := j || jsonb_build_object('creato_il', case when tg_op = 'INSERT' then to_jsonb(now()) else to_jsonb(old) -> 'creato_il' end);
  end if;
  if n ? 'aggiornata_il' then j := j || jsonb_build_object('aggiornata_il', now()); end if;
  if n ? 'aggiornato_il' then j := j || jsonb_build_object('aggiornato_il', now()); end if;
  new := jsonb_populate_record(new, j);
  return new;
end;
$$;
do $$
declare
  t text;
begin
  foreach t in array array['auxo_cartelle', 'auxo_visite', 'auxo_misure', 'auxo_puberta', 'auxo_eta_ossea', 'auxo_esami',
                           'auxo_test_gh', 'auxo_diagnosi', 'auxo_terapie'] loop
    execute format('create trigger a_timbri before insert or update on clinica.%I '
                   'for each row execute function clinica.auxo_timbri()', t);
  end loop;
end;
$$;
-- L'autore della visita non si modifica.
revoke update on clinica.auxo_visite from authenticated;
grant update (data, tipo, motivo, anamnesi, decorso, esame_obiettivo, esami_eseguiti, conclusioni, diagnosi_testo, piano,
              prossimo_controllo, visita_precedente_id, modelli, anamnesi_snapshot, aggiornata_il)
  on clinica.auxo_visite to authenticated;

-- pseudo_id non si cambia mai.
create or replace function clinica.auxo_pseudo_fisso()
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
  foreach t in array array['auxo_visite', 'auxo_misure', 'auxo_puberta', 'auxo_eta_ossea', 'auxo_esami', 'auxo_test_gh',
                           'auxo_diagnosi', 'auxo_terapie'] loop
    -- "a_" nel nome: scatta prima degli altri trigger BEFORE (ordine alfabetico).
    execute format('create trigger a_pseudo_fisso before update on clinica.%I '
                   'for each row execute function clinica.auxo_pseudo_fisso()', t);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Impostazioni del referto e modelli di testo
-- -----------------------------------------------------------------------------
create table anagrafica.auxo_impostazioni (
  utente_id      uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  studio_id      uuid not null references anagrafica.studi(id),
  intestazione   text not null default 'Ambulatorio di Auxologia ed Endocrinologia pediatrica',
  sottotitolo    text,
  luogo          text,
  firma          text,
  qualifica      text default 'Pediatra auxologo',
  email_contatti text,
  telefono       text,
  ordine_provincia text,
  ordine_numero  text,
  chiusura       text default 'Per eventuali necessità e/o informazioni contattare l''ambulatorio all''indirizzo email: {{email}}.',
  aggiornato_il  timestamptz not null default now()
);
alter table anagrafica.auxo_impostazioni enable row level security;
grant select, insert, update on anagrafica.auxo_impostazioni to authenticated;
create policy proprie_impostazioni on anagrafica.auxo_impostazioni for all to authenticated
  using (utente_id = auth.uid() and sicurezza.auxologia_ok())
  with check (utente_id = auth.uid() and studio_id = sicurezza.studio_id() and sicurezza.auxologia_ok());
create trigger audit after insert or update or delete on anagrafica.auxo_impostazioni
  for each row execute function audit.traccia_modifica();

create table anagrafica.auxo_modelli (
  id            uuid primary key default gen_random_uuid(),
  studio_id     uuid references anagrafica.studi(id),
  codice        text not null,
  nome          text not null,
  profilo       text not null check (profilo in ('bassa_statura', 'gh', 'puberta_precoce', 'ritardo_puberale', 'obesita', 'generale')),
  sezione       text not null check (sezione in ('piano', 'conclusioni', 'esame_obiettivo', 'anamnesi', 'decorso')),
  testo         text not null,
  ordine        smallint not null default 100,
  attivo        boolean not null default true,
  creato_da     uuid default auth.uid(),
  aggiornato_il timestamptz not null default now(),
  unique nulls not distinct (studio_id, codice)
);
alter table anagrafica.auxo_modelli enable row level security;
grant select, insert, update on anagrafica.auxo_modelli to authenticated;
create policy legge_modelli on anagrafica.auxo_modelli for select to authenticated
  using (sicurezza.auxologia_ok() and (studio_id is null or studio_id = sicurezza.studio_id()));
create policy scrive_modelli on anagrafica.auxo_modelli for insert to authenticated
  with check (sicurezza.auxologia_ok() and studio_id = sicurezza.studio_id());
create policy modifica_modelli on anagrafica.auxo_modelli for update to authenticated
  using (sicurezza.auxologia_ok() and studio_id = sicurezza.studio_id())
  with check (studio_id = sicurezza.studio_id());
create trigger audit after insert or update or delete on anagrafica.auxo_modelli
  for each row execute function audit.traccia_modifica();

-- Modelli predefiniti: testi di partenza da adattare al singolo bambino. Niente dosi:
-- la posologia si decide e si scrive per ogni paziente.
insert into anagrafica.auxo_modelli (studio_id, codice, nome, profilo, sezione, ordine, testo) values
(null, 'eo_auxologico', 'Esame obiettivo auxologico', 'generale', 'esame_obiettivo', 10,
'Condizioni generali: ___. Proporzioni corporee: ___. Dismorfismi: ___. Tiroide: ___. Cute (macchie caffellatte, acanthosis nigricans, strie): ___. Stadio puberale secondo Tanner: vedi tabella.'),
(null, 'misura_controllo', 'Controllo auxologico', 'generale', 'piano', 10,
'- Controllo auxologico tra 6 mesi, con misurazione della statura allo stadiometro (stesso strumento, possibilmente stesso orario).'),
(null, 'eta_ossea', 'Età ossea', 'generale', 'piano', 20,
'- Radiografia della mano e del polso sinistri per la valutazione dell''età ossea.'),
(null, 'statura_genitori', 'Stature dei genitori', 'generale', 'piano', 30,
'- Portare al prossimo controllo, se possibile, entrambi i genitori per la misurazione della statura.'),
(null, 'esami_primo_livello', 'Esami di primo livello', 'bassa_statura', 'piano', 10,
'- Esami di primo livello: emocromo, VES, PCR, creatinina, elettroliti, calcio, fosforo, fosfatasi alcalina, transaminasi, glicemia, TSH e FT4, anticorpi anti-transglutaminasi IgA con IgA totali, IGF-1, esame delle urine; emogasanalisi venosa nei bambini più piccoli.'),
(null, 'cariotipo', 'Cariotipo (femmine)', 'bassa_statura', 'piano', 20,
'- Cariotipo su sangue periferico (nelle bambine con bassa statura non spiegata, per escludere la sindrome di Turner).'),
(null, 'bassa_statura_familiare', 'Bassa statura familiare', 'bassa_statura', 'conclusioni', 30,
'Statura entro l''intervallo del target genetico, con velocità di crescita regolare ed età ossea concorde: quadro compatibile con bassa statura familiare. Si consiglia il monitoraggio auxologico.'),
(null, 'ritardo_costituzionale', 'Ritardo costituzionale', 'bassa_statura', 'conclusioni', 40,
'Età ossea ritardata con velocità di crescita regolare per l''età ossea e familiarità per sviluppo puberale tardivo: quadro compatibile con ritardo costituzionale di crescita e pubertà. Si consiglia il monitoraggio auxologico e puberale.'),
(null, 'gh_test', 'Test di stimolo del GH', 'gh', 'piano', 10,
'- Test di stimolo per il GH (due test con stimoli diversi, in giorni diversi), secondo i criteri della Nota AIFA 39.'),
(null, 'gh_monitoraggio', 'Monitoraggio della terapia con GH', 'gh', 'piano', 20,
'- Prosegue la terapia con ormone della crescita (dose da adeguare al peso).
- Controllo auxologico ogni 3-6 mesi; IGF-1, glicemia e funzionalità tiroidea periodicamente.
- Contattare l''ambulatorio in caso di cefalea persistente, disturbi della vista, vomito, zoppia o dolore all''anca o al ginocchio.
- Rinnovare il piano terapeutico alla scadenza.'),
(null, 'pp_esami', 'Pubertà precoce: accertamenti', 'puberta_precoce', 'piano', 10,
'- LH, FSH ed estradiolo (femmine) o testosterone (maschi) basali; età ossea; ecografia pelvica nelle femmine. Test di stimolo con GnRH (o analogo) se indicato.'),
(null, 'rp_esami', 'Ritardo puberale: accertamenti', 'ritardo_puberale', 'piano', 10,
'- LH, FSH, testosterone (maschi) o estradiolo (femmine), TSH e FT4, età ossea. Rivalutazione della progressione puberale tra 6 mesi.'),
(null, 'obesita_stile', 'Obesità: stile di vita', 'obesita', 'piano', 10,
'- Alimentazione: cinque pasti al giorno (prima colazione, spuntino di metà mattina, pranzo, merenda, cena) equilibrati; frutta e verdura ogni giorno, acqua come bevanda; evitare bevande zuccherate e di mangiare fuori dai pasti.
- Attività fisica: almeno 60 minuti al giorno di attività di intensità moderata-vigorosa; limitare il tempo davanti agli schermi.
- Coinvolgimento di tutta la famiglia nel cambiamento delle abitudini.'),
(null, 'obesita_screening', 'Obesità: screening delle complicanze', 'obesita', 'piano', 20,
'- Misurazione della pressione arteriosa a ogni controllo (dai 3 anni).
- Dai 6 anni: glicemia a digiuno, colesterolo totale, HDL, trigliceridi, ALT; ecografia epatica se indicata.
- Curva da carico di glucosio (OGTT) dai 10 anni o all''inizio della pubertà, se sono presenti fattori di rischio.');

-- -----------------------------------------------------------------------------
-- 6. RPC del modulo
-- -----------------------------------------------------------------------------
create or replace function api.auxo_registra_paziente(
  p_nome text, p_cognome text, p_codice_fiscale text, p_data_nascita date, p_sesso char(1),
  p_genitore_nome text default null, p_genitore_telefono text default null, p_genitore_email text default null,
  p_pediatra_curante text default null, p_inviato_da text default null,
  p_luogo_nascita text default null, p_residenza text default null
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_cf text := upper(trim(p_codice_fiscale));
  v_id uuid;
begin
  if not sicurezza.auxologia_ok() then
    raise exception 'Accesso al modulo Auxologia non consentito';
  end if;
  if v_cf !~ '^[A-Z0-9]{16}$' then
    raise exception 'Codice fiscale non valido';
  end if;
  if p_sesso not in ('M', 'F') or p_data_nascita is null or p_data_nascita > current_date then
    raise exception 'Sesso o data di nascita non validi';
  end if;
  if exists (select 1 from anagrafica.auxo_pazienti
             where studio_id = sicurezza.studio_id() and codice_fiscale_impronta = anagrafica.impronta_cf(v_cf)) then
    raise exception 'Paziente già presente in Auxologia' using errcode = '23505';
  end if;
  insert into anagrafica.auxo_pazienti (studio_id, nome, cognome, codice_fiscale_cifrato, codice_fiscale_impronta,
    data_nascita, sesso, genitore_nome, genitore_telefono, genitore_email, pediatra_curante, inviato_da, luogo_nascita, residenza)
  values (sicurezza.studio_id(), trim(p_nome), trim(p_cognome), anagrafica.cifra_cf(v_cf), anagrafica.impronta_cf(v_cf),
    p_data_nascita, p_sesso, nullif(trim(p_genitore_nome), ''), nullif(trim(p_genitore_telefono), ''),
    nullif(lower(trim(p_genitore_email)), ''), nullif(trim(p_pediatra_curante), ''), nullif(trim(p_inviato_da), ''),
    nullif(trim(p_luogo_nascita), ''), nullif(trim(p_residenza), ''))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function api.auxo_apri_cartella(p_paziente_id uuid)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_pseudo uuid;
begin
  select m.pseudo_id into v_pseudo
  from pseudonimi.auxo_mappa m
  join anagrafica.auxo_pazienti p on p.id = m.paziente_id
  where m.paziente_id = p_paziente_id and p.studio_id = sicurezza.studio_id();
  if v_pseudo is null or not sicurezza.auxologia_ok() then
    raise exception 'Accesso alla cartella auxologica non consentito';
  end if;
  perform audit.registra('APERTURA_CARTELLA_AUXO', 'clinica.auxo_cartelle', null, v_pseudo);
  return v_pseudo;
end;
$$;

create or replace function api.auxo_codice_fiscale(p_paziente_id uuid)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  v_cf bytea;
  v_pseudo uuid;
begin
  if not sicurezza.auxologia_ok() then
    raise exception 'Accesso al modulo Auxologia non consentito';
  end if;
  select p.codice_fiscale_cifrato, m.pseudo_id into v_cf, v_pseudo
  from anagrafica.auxo_pazienti p
  join pseudonimi.auxo_mappa m on m.paziente_id = p.id
  where p.id = p_paziente_id and p.studio_id = sicurezza.studio_id();
  if v_cf is null then
    raise exception 'Paziente non trovato';
  end if;
  perform audit.registra('LETTURA_CODICE_FISCALE', 'anagrafica.auxo_pazienti', p_paziente_id::text, v_pseudo);
  return extensions.pgp_sym_decrypt(v_cf, sicurezza.chiave_cf());
end;
$$;

-- Promemoria per l'elenco: controlli in scadenza e piani terapeutici del GH da rinnovare.
create or replace function api.auxo_promemoria()
returns table (paziente_id uuid, tipo text, data date, dettaglio text)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not sicurezza.auxologia_ok() then
    raise exception 'Accesso al modulo Auxologia non consentito';
  end if;
  return query
    select m.paziente_id, 'controllo'::text, v.prossimo_controllo, null::text
    from clinica.auxo_visite v
    join pseudonimi.auxo_mappa m on m.pseudo_id = v.pseudo_id
    join anagrafica.auxo_pazienti p on p.id = m.paziente_id
    where p.studio_id = sicurezza.studio_id() and p.stato = 'attivo'
      and v.prossimo_controllo is not null and v.prossimo_controllo <= current_date + 30
      and v.id = (select v2.id from clinica.auxo_visite v2 where v2.pseudo_id = v.pseudo_id order by v2.data desc, v2.id limit 1)
    union all
    select m.paziente_id, 'piano_terapeutico', t.piano_terapeutico_scadenza, t.farmaco
    from clinica.auxo_terapie t
    join pseudonimi.auxo_mappa m on m.pseudo_id = t.pseudo_id
    join anagrafica.auxo_pazienti p on p.id = m.paziente_id
    where p.studio_id = sicurezza.studio_id() and p.stato = 'attivo'
      and t.al is null and t.piano_terapeutico_scadenza is not null and t.piano_terapeutico_scadenza <= current_date + 30
    order by 3;
end;
$$;

do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where (n.nspname = 'api' and p.proname in ('imposta_auxologia', 'abilita_auxologia', 'auxo_registra_paziente',
                                                       'auxo_apri_cartella', 'auxo_codice_fiscale', 'auxo_promemoria'))
              or (n.nspname = 'sicurezza' and p.proname in ('auxologia_ok', 'puo_accedere_auxo')) loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
revoke execute on function clinica.auxo_eta_alla_data(), clinica.auxo_data_valida(), clinica.auxo_misura_coerente(), pseudonimi.crea_per_auxo_paziente()
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 7. Invio dei documenti anche per i pazienti di Auxologia
-- -----------------------------------------------------------------------------
alter table anagrafica.invii_documenti
  add column auxo_paziente_id uuid references anagrafica.auxo_pazienti(id);
alter table anagrafica.invii_documenti drop constraint invii_documenti_check;
alter table anagrafica.invii_documenti
  add constraint invii_documenti_un_paziente check (num_nonnulls(paziente_id, allergo_paziente_id, auxo_paziente_id) = 1);
create index on anagrafica.invii_documenti (auxo_paziente_id);
grant select (auxo_paziente_id) on anagrafica.invii_documenti to authenticated;

drop policy staff_vede_invii on anagrafica.invii_documenti;
create policy staff_vede_invii on anagrafica.invii_documenti for select to authenticated
  using (studio_id = sicurezza.studio_id() and (
    (paziente_id is not null and sicurezza.is_staff())
    or (allergo_paziente_id is not null and sicurezza.allergologia_ok())
    or (auxo_paziente_id is not null and sicurezza.auxologia_ok())));

drop function api.prepara_invio(uuid, uuid, uuid, text, text, text, text, boolean);
drop function sicurezza.puo_inviare(uuid, uuid);

create or replace function sicurezza.puo_inviare(p_paziente_id uuid, p_allergo_paziente_id uuid, p_auxo_paziente_id uuid default null)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select case
    when num_nonnulls(p_paziente_id, p_allergo_paziente_id, p_auxo_paziente_id) <> 1 then false
    when p_paziente_id is not null then sicurezza.puo_accedere_paziente(p_paziente_id)
    when p_allergo_paziente_id is not null then sicurezza.allergologia_ok() and exists (
      select 1 from anagrafica.allergo_pazienti a where a.id = p_allergo_paziente_id and a.studio_id = sicurezza.studio_id())
    else sicurezza.auxologia_ok() and exists (
      select 1 from anagrafica.auxo_pazienti a where a.id = p_auxo_paziente_id and a.studio_id = sicurezza.studio_id())
    end;
$$;

create or replace function api.prepara_invio(
  p_paziente_id uuid, p_allergo_paziente_id uuid, p_tutore_id uuid, p_canale text,
  p_destinatario text, p_destinatario_nome text, p_descrizione text, p_conferma boolean,
  p_auxo_paziente_id uuid default null)
returns table (id uuid, token text, scade_il timestamptz)
language plpgsql security definer
set search_path = ''
as $$
declare
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
  v_dest  text := trim(coalesce(p_destinatario, ''));
  v_id    uuid;
  v_scade timestamptz := now() + interval '30 days';
begin
  if not sicurezza.mfa_ok() or not sicurezza.puo_inviare(p_paziente_id, p_allergo_paziente_id, p_auxo_paziente_id) then
    raise exception 'Solo il medico del bambino o l''amministratore invia i documenti clinici';
  end if;
  if not coalesce(p_conferma, false) then
    raise exception 'Conferma che il genitore ha chiesto o accettato di ricevere i documenti con questo canale';
  end if;
  if p_canale = 'email' then
    v_dest := lower(v_dest);
    if v_dest !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' then
      raise exception 'Indirizzo email non valido';
    end if;
  elsif p_canale = 'whatsapp' then
    v_dest := regexp_replace(v_dest, '[\s\-\.\(\)/]', '', 'g');
    if v_dest ~ '^00' then v_dest := '+' || substr(v_dest, 3); end if;
    if v_dest !~ '^\+' then v_dest := '+39' || v_dest; end if;
    if v_dest !~ '^\+[0-9]{8,15}$' then
      raise exception 'Numero di telefono non valido';
    end if;
  else
    raise exception 'Canale non valido';
  end if;
  if p_tutore_id is not null and (p_paziente_id is null or not exists (
       select 1 from anagrafica.tutori t join anagrafica.relazioni_tutela r on r.tutore_id = t.id
       where t.id = p_tutore_id and r.paziente_id = p_paziente_id and t.studio_id = sicurezza.studio_id()
         and r.responsabilita_genitoriale and r.valida_dal <= current_date
         and (r.valida_al is null or r.valida_al >= current_date))) then
    raise exception 'Il genitore indicato non ha (più) la responsabilità genitoriale su questo bambino';
  end if;
  if p_tutore_id is not null and exists (
       select 1 from anagrafica.consensi_correnti c
       where c.paziente_id = p_paziente_id and c.tutore_id = p_tutore_id
         and c.finalita = 'invio_documenti' and c.stato in ('negato', 'revocato')) then
    raise exception 'Questo genitore ha negato o revocato il consenso all''invio dei documenti';
  end if;

  insert into anagrafica.invii_documenti (studio_id, paziente_id, allergo_paziente_id, auxo_paziente_id, tutore_id, canale,
                                          destinatario, destinatario_nome, descrizione, token_hash, scade_il)
  values (sicurezza.studio_id(), p_paziente_id, p_allergo_paziente_id, p_auxo_paziente_id, p_tutore_id, p_canale, v_dest,
          nullif(trim(p_destinatario_nome), ''), trim(p_descrizione), encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), v_scade)
  returning invii_documenti.id into v_id;
  return query select v_id, v_token, v_scade;
end;
$$;

create or replace function api.revoca_invio(p_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v anagrafica.invii_documenti;
begin
  select * into v from anagrafica.invii_documenti i where i.id = p_id and i.studio_id = sicurezza.studio_id();
  if v.id is null or not sicurezza.mfa_ok()
     or not (sicurezza.puo_inviare(v.paziente_id, v.allergo_paziente_id, v.auxo_paziente_id) or sicurezza.admin_attivo()) then
    raise exception 'Invio non trovato';
  end if;
  update anagrafica.invii_documenti set stato = 'revocato' where id = p_id;
end;
$$;

-- Ritiro: codice = data di nascita del bambino, anche per i pazienti di Auxologia.
create or replace function api.ritiro_documenti(p_token text, p_codice text, p_ip text default null)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v anagrafica.invii_documenti;
  v_nascita date;
  v_codice text := regexp_replace(coalesce(p_codice, ''), '\D', '', 'g');
begin
  select * into v from anagrafica.invii_documenti i
  where i.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
  for update;
  if v.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'link_non_valido');
  end if;
  if v.stato = 'revocato' then
    return jsonb_build_object('ok', false, 'motivo', 'revocato');
  end if;
  if v.scade_il < now() then
    return jsonb_build_object('ok', false, 'motivo', 'scaduto');
  end if;
  if v.stato not in ('pronto', 'inviato', 'consegnato_manualmente') then
    return jsonb_build_object('ok', false, 'motivo', 'non_disponibile');
  end if;
  if v.tentativi >= 5 then
    return jsonb_build_object('ok', false, 'motivo', 'bloccato');
  end if;
  select coalesce(p.data_nascita, a.data_nascita, x.data_nascita) into v_nascita
  from anagrafica.invii_documenti i
  left join anagrafica.pazienti p on p.id = i.paziente_id
  left join anagrafica.allergo_pazienti a on a.id = i.allergo_paziente_id
  left join anagrafica.auxo_pazienti x on x.id = i.auxo_paziente_id
  where i.id = v.id;
  if v_nascita is null or v_codice <> to_char(v_nascita, 'DDMMYYYY') then
    update anagrafica.invii_documenti set tentativi = tentativi + 1 where id = v.id;
    perform audit.registra('RITIRO_DOCUMENTI_CODICE_ERRATO', 'anagrafica.invii_documenti', v.id::text, null,
                           jsonb_build_object('ip', left(p_ip, 64)));
    return jsonb_build_object('ok', false, 'motivo', case when v.tentativi + 1 >= 5 then 'bloccato' else 'codice_errato' end,
                              'tentativi_rimasti', greatest(0, 4 - v.tentativi));
  end if;
  update anagrafica.invii_documenti
     set ritiri = ritiri + 1, primo_ritiro_il = coalesce(primo_ritiro_il, now()), ultimo_ritiro_il = now()
   where id = v.id;
  perform audit.registra('RITIRO_DOCUMENTI', 'anagrafica.invii_documenti', v.id::text, null, jsonb_build_object('ip', left(p_ip, 64)));
  return jsonb_build_object('ok', true, 'descrizione', v.descrizione, 'scade_il', v.scade_il, 'documenti', v.documenti);
end;
$$;

do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where (n.nspname = 'api' and p.proname in ('prepara_invio', 'revoca_invio', 'ritiro_documenti'))
              or (n.nspname = 'sicurezza' and p.proname = 'puo_inviare') loop
    execute format('revoke execute on function %s from public, anon', f);
  end loop;
end;
$$;
grant execute on function api.prepara_invio(uuid, uuid, uuid, text, text, text, text, boolean, uuid), api.revoca_invio(uuid),
  sicurezza.puo_inviare(uuid, uuid, uuid) to authenticated;
revoke execute on function api.ritiro_documenti(text, text, text) from authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function api.ritiro_documenti(text, text, text) to service_role;
  end if;
end $$;
