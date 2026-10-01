-- =============================================================================
-- 0500 · Row Level Security, permessi di tabella e trigger di audit
-- Regola generale: RLS attiva ovunque, nessuna policy = nessun accesso.
-- Le policy usano le funzioni dello schema "sicurezza" (migrazioni 0100 e 0300).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- RLS attiva su tutte le tabelle applicative
-- -----------------------------------------------------------------------------
alter table anagrafica.studi             enable row level security;
alter table anagrafica.membri_studio     enable row level security;
alter table anagrafica.pediatri          enable row level security;
alter table anagrafica.sostituzioni      enable row level security;
alter table anagrafica.pazienti          enable row level security;
alter table anagrafica.tutori            enable row level security;
alter table anagrafica.relazioni_tutela  enable row level security;
alter table anagrafica.consensi          enable row level security;
alter table anagrafica.appuntamenti      enable row level security;
alter table pseudonimi.mappa             enable row level security;
alter table clinica.cartelle             enable row level security;
alter table clinica.visite               enable row level security;
alter table clinica.misurazioni          enable row level security;
alter table audit.eventi                 enable row level security;

-- -----------------------------------------------------------------------------
-- Permessi di tabella (RLS decide poi QUALI righe)
-- Nessun DELETE per authenticated: le cancellazioni sono logiche (stato).
-- -----------------------------------------------------------------------------
grant select on anagrafica.studi, anagrafica.membri_studio, anagrafica.pediatri,
               anagrafica.sostituzioni to authenticated;
-- Pazienti e tutori si creano solo con le RPC api.registra_* (cifrano il codice fiscale).
grant select on anagrafica.pazienti, anagrafica.tutori to authenticated;
grant select, insert, update on anagrafica.relazioni_tutela, anagrafica.appuntamenti to authenticated;
grant select, insert on anagrafica.consensi to authenticated;   -- mai update: storico
grant select on anagrafica.consensi_correnti to authenticated;
grant select, insert, update on clinica.cartelle, clinica.visite, clinica.misurazioni to authenticated;

-- Update solo su colonne precise: codice fiscale, studio e collegamento all'account
-- non si cambiano dal frontend (in Postgres un REVOKE su colonna non toglie un
-- GRANT di tabella, quindi elenchiamo le colonne permesse).
grant update (pediatra_id, nome, cognome, data_nascita, sesso, data_scelta_pediatra, stato)
  on anagrafica.pazienti to authenticated;
grant update (nome, cognome, email, telefono) on anagrafica.tutori to authenticated;

-- -----------------------------------------------------------------------------
-- Policy: studio e personale
-- -----------------------------------------------------------------------------
create policy staff_vede_proprio_studio on anagrafica.studi
  for select to authenticated
  using (id = sicurezza.studio_id());

create policy staff_vede_colleghi on anagrafica.membri_studio
  for select to authenticated
  using (sicurezza.is_staff() and studio_id = sicurezza.studio_id());

create policy staff_vede_pediatri on anagrafica.pediatri
  for select to authenticated
  using (sicurezza.is_staff() and studio_id = sicurezza.studio_id());

create policy staff_vede_sostituzioni on anagrafica.sostituzioni
  for select to authenticated
  using (sicurezza.is_staff() and studio_id = sicurezza.studio_id());

-- -----------------------------------------------------------------------------
-- Policy: pazienti
-- -----------------------------------------------------------------------------
create policy staff_gestisce_pazienti on anagrafica.pazienti
  for all to authenticated
  using (sicurezza.is_staff() and studio_id = sicurezza.studio_id())
  with check (sicurezza.is_staff() and studio_id = sicurezza.studio_id());

create policy tutore_vede_figli on anagrafica.pazienti
  for select to authenticated
  using (sicurezza.tutore_di(id));

-- -----------------------------------------------------------------------------
-- Policy: tutori e relazioni
-- -----------------------------------------------------------------------------
create policy staff_gestisce_tutori on anagrafica.tutori
  for all to authenticated
  using (sicurezza.is_staff() and studio_id = sicurezza.studio_id())
  with check (sicurezza.is_staff() and studio_id = sicurezza.studio_id());

create policy tutore_vede_se_stesso on anagrafica.tutori
  for select to authenticated
  using (sicurezza.ruolo() = 'tutore' and utente_id = auth.uid());

create policy staff_gestisce_relazioni on anagrafica.relazioni_tutela
  for all to authenticated
  using (sicurezza.is_staff() and exists (
    select 1 from anagrafica.pazienti p
    where p.id = relazioni_tutela.paziente_id and p.studio_id = sicurezza.studio_id()))
  with check (sicurezza.is_staff() and exists (
    select 1 from anagrafica.pazienti p
    where p.id = relazioni_tutela.paziente_id and p.studio_id = sicurezza.studio_id()));

create policy tutore_vede_proprie_relazioni on anagrafica.relazioni_tutela
  for select to authenticated
  using (sicurezza.ruolo() = 'tutore' and exists (
    select 1 from anagrafica.tutori t
    where t.id = relazioni_tutela.tutore_id and t.utente_id = auth.uid()));

-- -----------------------------------------------------------------------------
-- Policy: consensi (solo lettura e inserimento: lo storico non si tocca)
-- -----------------------------------------------------------------------------
create policy staff_gestisce_consensi on anagrafica.consensi
  for select to authenticated
  using (sicurezza.is_staff() and exists (
    select 1 from anagrafica.pazienti p
    where p.id = consensi.paziente_id and p.studio_id = sicurezza.studio_id()));

create policy staff_registra_consensi on anagrafica.consensi
  for insert to authenticated
  with check (sicurezza.is_staff() and canale = 'cartaceo_studio' and exists (
    select 1 from anagrafica.pazienti p
    where p.id = consensi.paziente_id and p.studio_id = sicurezza.studio_id()));

-- Un tutore vede e dichiara solo i PROPRI consensi.
-- Non usa tutore_di() perché il primo consenso al portale va dato prima di avere accesso.
create policy tutore_vede_propri_consensi on anagrafica.consensi
  for select to authenticated
  using (sicurezza.ruolo() = 'tutore' and exists (
    select 1 from anagrafica.tutori t
    where t.id = consensi.tutore_id and t.utente_id = auth.uid()));

create policy tutore_dichiara_propri_consensi on anagrafica.consensi
  for insert to authenticated
  with check (sicurezza.ruolo() = 'tutore' and canale = 'portale' and exists (
    select 1 from anagrafica.tutori t
    join anagrafica.relazioni_tutela r on r.tutore_id = t.id
    where t.id = consensi.tutore_id          -- qualificato: r ha anch'essa tutore_id
      and r.paziente_id = consensi.paziente_id
      and t.utente_id = auth.uid() and r.responsabilita_genitoriale));

-- -----------------------------------------------------------------------------
-- Policy: appuntamenti
-- -----------------------------------------------------------------------------
create policy staff_gestisce_appuntamenti on anagrafica.appuntamenti
  for all to authenticated
  using (sicurezza.is_staff() and studio_id = sicurezza.studio_id())
  with check (sicurezza.is_staff() and studio_id = sicurezza.studio_id());

create policy tutore_vede_appuntamenti_figli on anagrafica.appuntamenti
  for select to authenticated
  using (sicurezza.tutore_di(paziente_id));

create policy tutore_richiede_appuntamento on anagrafica.appuntamenti
  for insert to authenticated
  with check (sicurezza.tutore_di(paziente_id) and stato = 'richiesto'
              and prenotato_da = auth.uid() and note_segreteria is null);

-- -----------------------------------------------------------------------------
-- Policy: clinica (la segreteria non ha alcuna policy → nessun accesso)
-- -----------------------------------------------------------------------------
create policy pediatra_gestisce_cartelle on clinica.cartelle
  for all to authenticated
  using (sicurezza.puo_accedere_clinica(pseudo_id))
  with check (sicurezza.puo_accedere_clinica(pseudo_id));

create policy pediatra_gestisce_visite on clinica.visite
  for all to authenticated
  using (sicurezza.puo_accedere_clinica(pseudo_id))
  with check (sicurezza.puo_accedere_clinica(pseudo_id) and pediatra_id = auth.uid());

create policy pediatra_gestisce_misurazioni on clinica.misurazioni
  for all to authenticated
  using (sicurezza.puo_accedere_clinica(pseudo_id))
  with check (sicurezza.puo_accedere_clinica(pseudo_id));

-- I genitori vedono le misurazioni (curve di crescita), non visite e anamnesi.
create policy tutore_vede_misurazioni on clinica.misurazioni
  for select to authenticated
  using (sicurezza.tutore_vede_clinica(pseudo_id));

-- pseudonimi.mappa e audit.eventi: RLS attiva e nessuna policy.

-- -----------------------------------------------------------------------------
-- Trigger di audit sulle tabelle sensibili
-- -----------------------------------------------------------------------------
create trigger audit after insert or update or delete on anagrafica.pazienti
  for each row execute function audit.traccia_modifica();
create trigger audit after insert or update or delete on anagrafica.tutori
  for each row execute function audit.traccia_modifica();
create trigger audit after insert or update or delete on anagrafica.relazioni_tutela
  for each row execute function audit.traccia_modifica();
create trigger audit after insert or update or delete on anagrafica.consensi
  for each row execute function audit.traccia_modifica();
create trigger audit after insert or update or delete on anagrafica.appuntamenti
  for each row execute function audit.traccia_modifica();
create trigger audit after insert or update or delete on clinica.cartelle
  for each row execute function audit.traccia_modifica();
create trigger audit after insert or update or delete on clinica.visite
  for each row execute function audit.traccia_modifica();
create trigger audit after insert or update or delete on clinica.misurazioni
  for each row execute function audit.traccia_modifica();
