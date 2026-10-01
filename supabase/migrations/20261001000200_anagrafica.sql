-- =============================================================================
-- 0200 · Schema anagrafica
-- Dati identificativi: studi, personale, bambini, tutori, consensi, agenda.
-- Il codice fiscale è salvato cifrato (pgcrypto) + un'impronta HMAC per cercarlo
-- senza decifrarlo. La chiave sta in Supabase Vault con nome 'pls_cf_key'.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Cifratura del codice fiscale
-- -----------------------------------------------------------------------------
create or replace function sicurezza.chiave_cf()
returns text
language plpgsql stable security definer
set search_path = ''
as $$
declare
  k text;
begin
  select decrypted_secret into k from vault.decrypted_secrets where name = 'pls_cf_key';
  if k is null then
    raise exception 'Chiave pls_cf_key assente in Supabase Vault';
  end if;
  return k;
end;
$$;

create or replace function anagrafica.cifra_cf(cf text)
returns bytea
language sql stable security definer
set search_path = ''
as $$
  select extensions.pgp_sym_encrypt(upper(trim(cf)), sicurezza.chiave_cf());
$$;

create or replace function anagrafica.impronta_cf(cf text)
returns text
language sql stable security definer
set search_path = ''
as $$
  select encode(extensions.hmac(upper(trim(cf)), sicurezza.chiave_cf(), 'sha256'), 'hex');
$$;

-- Decifrare è permesso solo allo staff dello studio (controllo nella funzione).
create or replace function anagrafica.decifra_cf(dato bytea)
returns text
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not sicurezza.is_staff() then
    raise exception 'Non autorizzato a leggere il codice fiscale';
  end if;
  return extensions.pgp_sym_decrypt(dato, sicurezza.chiave_cf());
end;
$$;

-- cifra_cf e impronta_cf restano interne: le usano solo le funzioni RPC dello
-- schema api (Fase 1), che girano con i permessi del proprietario.
grant execute on function anagrafica.decifra_cf(bytea) to authenticated;

-- -----------------------------------------------------------------------------
-- Studi e personale
-- -----------------------------------------------------------------------------
create table anagrafica.studi (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  asl         text not null,
  indirizzo   text not null,
  telefono    text,
  creato_il   timestamptz not null default now()
);

-- Collega un utente di Supabase Auth a uno studio con un ruolo.
create table anagrafica.membri_studio (
  utente_id   uuid primary key references auth.users(id) on delete cascade,
  studio_id   uuid not null references anagrafica.studi(id),
  ruolo       text not null check (ruolo in ('pediatra', 'segreteria', 'sostituto')),
  attivo      boolean not null default true,
  creato_il   timestamptz not null default now()
);

create table anagrafica.pediatri (
  id                  uuid primary key references anagrafica.membri_studio(utente_id),
  studio_id           uuid not null references anagrafica.studi(id),
  nome                text not null,
  cognome             text not null,
  codice_regionale    text not null,
  email               text not null,
  massimale_assistiti integer not null default 800 check (massimale_assistiti > 0)
);

-- Periodi in cui un sostituto può accedere ai pazienti di un titolare.
create table anagrafica.sostituzioni (
  id            uuid primary key default gen_random_uuid(),
  studio_id     uuid not null references anagrafica.studi(id),
  titolare_id   uuid not null references anagrafica.pediatri(id),
  sostituto_id  uuid not null references anagrafica.membri_studio(utente_id),
  dal           date not null,
  al            date not null,
  check (al >= dal)
);

-- -----------------------------------------------------------------------------
-- Bambini e tutori
-- -----------------------------------------------------------------------------
create table anagrafica.pazienti (
  id                      uuid primary key default gen_random_uuid(),
  studio_id               uuid not null references anagrafica.studi(id),
  pediatra_id             uuid not null references anagrafica.pediatri(id),
  nome                    text not null,
  cognome                 text not null,
  codice_fiscale_cifrato  bytea not null,
  codice_fiscale_impronta text not null,
  data_nascita            date not null check (data_nascita <= current_date),
  sesso                   char(1) not null check (sesso in ('M', 'F')),
  data_scelta_pediatra    date not null default current_date,
  stato                   text not null default 'attivo'
                          check (stato in ('attivo', 'revocato', 'maggiorenne')),
  creato_il               timestamptz not null default now(),
  unique (studio_id, codice_fiscale_impronta)
);
create index on anagrafica.pazienti (pediatra_id);

create table anagrafica.tutori (
  id                      uuid primary key default gen_random_uuid(),
  studio_id               uuid not null references anagrafica.studi(id),
  utente_id               uuid unique references auth.users(id) on delete set null,
  nome                    text not null,
  cognome                 text not null,
  codice_fiscale_cifrato  bytea not null,
  codice_fiscale_impronta text not null,
  email                   text not null,
  telefono                text,
  creato_il               timestamptz not null default now(),
  unique (studio_id, codice_fiscale_impronta)
);
create index on anagrafica.tutori (lower(email));

create table anagrafica.relazioni_tutela (
  paziente_id                 uuid not null references anagrafica.pazienti(id),
  tutore_id                   uuid not null references anagrafica.tutori(id),
  tipo                        text not null
                              check (tipo in ('madre', 'padre', 'tutore_legale', 'affidatario')),
  responsabilita_genitoriale  boolean not null default true,
  limitazioni                 text,
  valida_dal                  date not null default current_date,
  valida_al                   date,
  primary key (paziente_id, tutore_id),
  check (valida_al is null or valida_al >= valida_dal)
);

-- -----------------------------------------------------------------------------
-- Consensi: una riga per ogni dichiarazione, mai modificata.
-- Lo stato corrente è l'ultima riga per (paziente, tutore, finalità).
-- -----------------------------------------------------------------------------
create table anagrafica.consensi (
  id                    uuid primary key default gen_random_uuid(),
  paziente_id           uuid not null,
  tutore_id             uuid not null,
  finalita              text not null check (finalita in (
                          'dati_sanitari', 'portale', 'comunicazioni',
                          'condivisione_altro_genitore', 'whatsapp')),
  versione_informativa  text not null,
  stato                 text not null check (stato in ('concesso', 'negato', 'revocato', 'da_rinnovare')),
  canale                text not null check (canale in ('portale', 'cartaceo_studio')),
  registrato_da         uuid not null default auth.uid(),
  registrato_il         timestamptz not null default clock_timestamp(),
  foreign key (paziente_id, tutore_id) references anagrafica.relazioni_tutela(paziente_id, tutore_id)
);
create index on anagrafica.consensi (paziente_id, tutore_id, finalita, registrato_il desc);

create view anagrafica.consensi_correnti
with (security_invoker = true) as
select distinct on (paziente_id, tutore_id, finalita)
  paziente_id, tutore_id, finalita, stato, versione_informativa, canale, registrato_il
from anagrafica.consensi
order by paziente_id, tutore_id, finalita, registrato_il desc;

-- -----------------------------------------------------------------------------
-- Agenda (sta in anagrafica: serve alla segreteria, non contiene dati clinici)
-- -----------------------------------------------------------------------------
create table anagrafica.appuntamenti (
  id                uuid primary key default gen_random_uuid(),
  studio_id         uuid not null references anagrafica.studi(id),
  pediatra_id       uuid not null references anagrafica.pediatri(id),
  paziente_id       uuid not null references anagrafica.pazienti(id),
  prenotato_da      uuid not null default auth.uid(),
  inizio            timestamptz not null,
  fine              timestamptz not null,
  tipo              text not null
                    check (tipo in ('visita', 'bilancio_salute', 'vaccino', 'urgenza', 'certificato')),
  stato             text not null default 'richiesto'
                    check (stato in ('richiesto', 'confermato', 'annullato', 'svolto', 'non_presentato')),
  note_segreteria   text,
  creato_il         timestamptz not null default now(),
  check (fine > inizio)
);
create index on anagrafica.appuntamenti (pediatra_id, inizio);
