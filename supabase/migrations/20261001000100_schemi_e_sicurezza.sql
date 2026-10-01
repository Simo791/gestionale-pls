-- =============================================================================
-- 0100 · Schemi e funzioni di sicurezza
-- -----------------------------------------------------------------------------
-- Quattro schemi separano i dati per livello di rischio:
--   anagrafica  → chi è il bambino (nomi, contatti, agenda, consensi)
--   clinica     → cosa ha il bambino, legato solo a uno pseudonimo
--   pseudonimi  → la mappa paziente ↔ pseudonimo: nessun ruolo applicativo la legge
--   audit       → registro eventi a catena di hash, solo in aggiunta
-- Più due schemi di servizio:
--   sicurezza   → funzioni usate dalle policy RLS
--   api         → funzioni RPC chiamabili dal frontend
-- Nota: "vault" è già usato da Supabase per i segreti, per questo la mappa
-- degli pseudonimi vive nello schema "pseudonimi".
-- =============================================================================

create schema if not exists anagrafica;
create schema if not exists clinica;
create schema if not exists pseudonimi;
create schema if not exists audit;
create schema if not exists sicurezza;
create schema if not exists api;

-- Nessuno parte con permessi: li concediamo uno per uno più avanti.
revoke all on schema anagrafica, clinica, pseudonimi, audit, sicurezza, api from public;
revoke all on schema anagrafica, clinica, pseudonimi, audit, sicurezza, api from anon;

grant usage on schema anagrafica, clinica, sicurezza, api to authenticated;
-- pseudonimi e audit: nessun accesso diretto per authenticated.

-- Le funzioni nuove non devono essere eseguibili da chiunque per default.
alter default privileges in schema sicurezza, api, pseudonimi, audit, anagrafica, clinica
  revoke execute on functions from public;

-- -----------------------------------------------------------------------------
-- Lettura dei claim del JWT
-- I claim app_ruolo e app_studio_id sono aggiunti dall'Auth Hook (migrazione 0700).
-- -----------------------------------------------------------------------------
create or replace function sicurezza.ruolo()
returns text
language sql stable
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'app_ruolo', 'nessuno');
$$;

create or replace function sicurezza.studio_id()
returns uuid
language sql stable
set search_path = ''
as $$
  select nullif(auth.jwt() ->> 'app_studio_id', '')::uuid;
$$;

-- Vero se l'utente ha completato il secondo fattore (TOTP) in questa sessione.
create or replace function sicurezza.mfa_ok()
returns boolean
language sql stable
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

create or replace function sicurezza.is_staff()
returns boolean
language sql stable
set search_path = ''
as $$
  select sicurezza.ruolo() in ('pediatra', 'segreteria', 'sostituto')
     and sicurezza.studio_id() is not null;
$$;

grant execute on function sicurezza.ruolo(), sicurezza.studio_id(),
  sicurezza.mfa_ok(), sicurezza.is_staff() to authenticated;
