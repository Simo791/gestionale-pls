-- =============================================================================
-- 2700 · Figure professionali, permessi della segreteria, accompagnatori,
--        integrazioni (WhatsApp, Google Calendar), portale genitori e firme.
--
-- Figure:
--  * Amministratore (flag su pediatra, sostituto o allergologo): può fare tutto,
--    cartelle cliniche di tutti i bambini dello studio comprese. La segreteria
--    non può essere amministratore.
--  * Segreteria: anagrafiche, agenda e consensi. Le cartelle cliniche le vede
--    (in sola lettura) solo se un pediatra gliele apre per i propri assistiti,
--    o l'amministratore per conto di un pediatra.
--  * Pediatra di libera scelta: i propri assistiti; Allergologia solo se abilitato.
--  * Pediatra allergologo: solo il modulo Allergologia.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Amministratore: mai la segreteria; controllo "dal vivo" sul database
-- -----------------------------------------------------------------------------
update anagrafica.membri_studio set amministratore = false, aggiornato_il = now()
 where ruolo = 'segreteria' and amministratore;
alter table anagrafica.membri_studio
  add constraint segreteria_non_amministratore check (not (amministratore and ruolo = 'segreteria'));

-- Il claim app_admin del token vale fino a un'ora: per i dati clinici si
-- ricontrolla la tabella a ogni richiesta.
create or replace function sicurezza.admin_attivo()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from anagrafica.membri_studio m
    where m.utente_id = auth.uid() and m.attivo and m.amministratore
      and m.ruolo <> 'segreteria' and m.studio_id = sicurezza.studio_id()
  );
$$;

-- L'allergologo amministratore lavora anche sul resto del gestionale.
create or replace function sicurezza.is_staff()
returns boolean
language sql stable
set search_path = ''
as $$
  select (sicurezza.ruolo() in ('pediatra', 'segreteria', 'sostituto')
          or (sicurezza.ruolo() = 'allergologo' and sicurezza.is_admin()))
     and sicurezza.studio_id() is not null;
$$;

-- Cartella clinica: pediatra titolare, sostituto in turno, o amministratore.
create or replace function sicurezza.puo_accedere_paziente(p_paziente_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select sicurezza.mfa_ok()
     and sicurezza.ruolo() in ('pediatra', 'sostituto', 'allergologo')
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

create or replace function api.imposta_amministratore(p_utente uuid, p_amministratore boolean)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_studio uuid := sicurezza.studio_id();
  v_ruolo  text;
begin
  if not sicurezza.admin_attivo() or not sicurezza.mfa_ok() then
    raise exception 'Solo un amministratore dello studio nomina gli amministratori';
  end if;
  if p_utente = auth.uid() and not p_amministratore then
    raise exception 'Non puoi revocare a te stesso il ruolo di amministratore';
  end if;
  select ruolo into v_ruolo from anagrafica.membri_studio where utente_id = p_utente and studio_id = v_studio and attivo;
  if v_ruolo is null then
    raise exception 'Membro non trovato o disattivato';
  end if;
  if v_ruolo = 'segreteria' and p_amministratore then
    raise exception 'La segreteria non può essere amministratore: l''amministratore accede a tutte le cartelle cliniche';
  end if;
  if v_ruolo = 'pediatra' and not p_amministratore and not sicurezza.is_admin_pediatra() then
    raise exception 'Solo un pediatra amministratore può revocare il ruolo a un pediatra';
  end if;
  update anagrafica.membri_studio set amministratore = p_amministratore, aggiornato_il = now()
   where utente_id = p_utente and studio_id = v_studio;
  if not exists (select 1 from anagrafica.membri_studio
                 where studio_id = v_studio and amministratore and attivo and ruolo = 'pediatra') then
    raise exception 'Lo studio deve avere almeno un pediatra amministratore';
  end if;
  perform anagrafica.notifica(v_studio, p_utente, 'amministratore',
    case when p_amministratore then 'Sei amministratore dello studio' else 'Non sei più amministratore dello studio' end,
    case when p_amministratore then 'Esci e rientra per vedere la sezione Amministrazione.' else null end,
    '#/amministrazione');
end;
$$;

create or replace function api.tutti_amministratori()
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  if not sicurezza.admin_attivo() or not sicurezza.mfa_ok() then
    raise exception 'Solo un amministratore dello studio nomina gli amministratori';
  end if;
  update anagrafica.membri_studio set amministratore = true, aggiornato_il = now()
   where studio_id = sicurezza.studio_id() and attivo and not amministratore and ruolo <> 'segreteria';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Segreteria: lettura delle cartelle concessa dal pediatra (per i suoi assistiti)
-- -----------------------------------------------------------------------------
create table anagrafica.permessi_cartelle (
  studio_id     uuid not null references anagrafica.studi(id),
  segreteria_id uuid not null references anagrafica.membri_studio(utente_id) on delete cascade,
  pediatra_id   uuid not null references anagrafica.pediatri(id),
  concesso_da   uuid not null,
  concesso_il   timestamptz not null default now(),
  primary key (segreteria_id, pediatra_id)
);
alter table anagrafica.permessi_cartelle enable row level security;
grant select on anagrafica.permessi_cartelle to authenticated;
grant select on anagrafica.permessi_cartelle to supabase_auth_admin;
create policy staff_vede_permessi on anagrafica.permessi_cartelle
  for select to authenticated using (sicurezza.is_staff() and studio_id = sicurezza.studio_id());
create policy auth_legge_permessi on anagrafica.permessi_cartelle
  as permissive for select to supabase_auth_admin using (true);
create trigger audit after insert or update or delete on anagrafica.permessi_cartelle
  for each row execute function audit.traccia_modifica();

create or replace function sicurezza.segreteria_legge_paziente(p_paziente_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select sicurezza.ruolo() = 'segreteria'
     and sicurezza.mfa_ok()
     and exists (
       select 1
       from anagrafica.pazienti p
       join anagrafica.permessi_cartelle pc on pc.pediatra_id = p.pediatra_id and pc.studio_id = p.studio_id
       join anagrafica.membri_studio m on m.utente_id = pc.segreteria_id and m.studio_id = p.studio_id
       where p.id = p_paziente_id
         and p.studio_id = sicurezza.studio_id()
         and pc.segreteria_id = auth.uid()
         and m.attivo and m.ruolo = 'segreteria'
     );
$$;

create or replace function sicurezza.segreteria_legge_clinica(p_pseudo_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select sicurezza.ruolo() = 'segreteria' and exists (
    select 1 from pseudonimi.mappa m
    where m.pseudo_id = p_pseudo_id and sicurezza.segreteria_legge_paziente(m.paziente_id)
  );
$$;

-- Sola lettura: una policy SELECT in più; scrittura e modifica restano al medico.
do $$
declare
  t text;
begin
  foreach t in array array['allergie', 'cartelle', 'certificati', 'controlli_eseguiti', 'misurazioni',
                           'patologie_paziente', 'patologie_storico', 'prescrizioni', 'vaccinazioni', 'visite'] loop
    execute format('create policy segreteria_autorizzata_legge on clinica.%I for select to authenticated '
                   'using (sicurezza.segreteria_legge_clinica(pseudo_id))', t);
  end loop;
end;
$$;

create or replace function api.apri_cartella(p_paziente_id uuid)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_pseudo uuid;
  v_azione text;
begin
  if sicurezza.puo_accedere_paziente(p_paziente_id) then
    v_azione := 'APERTURA_CARTELLA';
  elsif sicurezza.segreteria_legge_paziente(p_paziente_id) then
    v_azione := 'APERTURA_CARTELLA_LETTURA';
  else
    raise exception 'Accesso alla cartella non consentito';
  end if;
  select pseudo_id into v_pseudo from pseudonimi.mappa where paziente_id = p_paziente_id;
  perform audit.registra(v_azione, 'clinica.cartelle', null, v_pseudo);
  return v_pseudo;
end;
$$;

-- Il pediatra concede o toglie la lettura dei PROPRI assistiti; l'amministratore per qualunque pediatra.
create or replace function api.imposta_permesso_cartelle(p_segreteria uuid, p_pediatra uuid, p_concesso boolean)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_studio uuid := sicurezza.studio_id();
begin
  if not sicurezza.mfa_ok() then
    raise exception 'Serve la verifica in due passaggi';
  end if;
  if not ((sicurezza.ruolo() = 'pediatra' and p_pediatra = auth.uid()) or sicurezza.admin_attivo()) then
    raise exception 'Solo il pediatra (per i propri assistiti) o l''amministratore decide l''accesso della segreteria alle cartelle';
  end if;
  if not exists (select 1 from anagrafica.membri_studio
                 where utente_id = p_segreteria and studio_id = v_studio and ruolo = 'segreteria' and attivo) then
    raise exception 'Segreteria non trovata o disattivata in questo studio';
  end if;
  if not exists (select 1 from anagrafica.pediatri where id = p_pediatra and studio_id = v_studio) then
    raise exception 'Pediatra non trovato in questo studio';
  end if;
  if p_concesso then
    insert into anagrafica.permessi_cartelle (studio_id, segreteria_id, pediatra_id, concesso_da)
    values (v_studio, p_segreteria, p_pediatra, auth.uid())
    on conflict (segreteria_id, pediatra_id) do nothing;
  else
    delete from anagrafica.permessi_cartelle where segreteria_id = p_segreteria and pediatra_id = p_pediatra;
  end if;
  perform anagrafica.notifica(v_studio, p_segreteria, 'permessi',
    case when p_concesso then 'Puoi consultare le cartelle cliniche (sola lettura)' else 'Accesso alle cartelle cliniche revocato' end,
    case when p_concesso then 'Esci e rientra: nella scheda del bambino compare «Apri cartella (sola lettura)».' else null end,
    '#/assistiti');
end;
$$;
grant execute on function api.imposta_permesso_cartelle(uuid, uuid, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Token: claim app_cartelle (solo per mostrare il pulsante; decide il database)
-- -----------------------------------------------------------------------------
-- (la funzione aggiornata è nella sezione 12, insieme all'accesso dell'amministratore ad Allergologia)

-- -----------------------------------------------------------------------------
-- 4. Accompagnatori: chi porta il bambino oltre ai genitori (anagrafica del bambino)
--    Nelle visite si salva solo un riferimento opaco ("a:<id>", "t:<id>"):
--    i nomi restano nello schema anagrafica.
-- -----------------------------------------------------------------------------
create table anagrafica.accompagnatori (
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid not null references anagrafica.studi(id),
  paziente_id uuid not null references anagrafica.pazienti(id),
  nome        text not null check (char_length(trim(nome)) between 1 and 80),
  cognome     text not null check (char_length(trim(cognome)) between 1 and 80),
  parentela   text not null check (char_length(trim(parentela)) between 2 and 60),
  telefono    text check (char_length(telefono) <= 30),
  delega      boolean not null default false,
  note        text check (char_length(note) <= 500),
  attivo      boolean not null default true,
  creato_il   timestamptz not null default now(),
  creato_da   uuid default auth.uid()
);
create index on anagrafica.accompagnatori (paziente_id);
comment on column anagrafica.accompagnatori.delega is 'Delega scritta dei genitori acquisita dallo studio';
alter table anagrafica.accompagnatori enable row level security;
grant select, insert, update on anagrafica.accompagnatori to authenticated;
create policy staff_gestisce_accompagnatori on anagrafica.accompagnatori
  for all to authenticated
  using (sicurezza.is_staff() and studio_id = sicurezza.studio_id())
  with check (sicurezza.is_staff() and studio_id = sicurezza.studio_id()
              and exists (select 1 from anagrafica.pazienti p where p.id = paziente_id and p.studio_id = sicurezza.studio_id()));
create trigger audit after insert or update or delete on anagrafica.accompagnatori
  for each row execute function audit.traccia_modifica();

-- -----------------------------------------------------------------------------
-- 5. Integrazioni: percorso per WhatsApp e Google Calendar.
--    Qui solo impostazioni NON segrete; token e chiavi stanno nei Secrets
--    delle Edge Functions (mai nel database, mai nel browser).
-- -----------------------------------------------------------------------------
create table anagrafica.integrazioni (
  studio_id      uuid not null references anagrafica.studi(id),
  tipo           text not null check (tipo in ('whatsapp', 'google_calendar')),
  attiva         boolean not null default false,
  stato          text not null default 'da_configurare'
                 check (stato in ('da_configurare', 'configurata', 'attiva', 'sospesa', 'errore')),
  impostazioni   jsonb not null default '{}'::jsonb check (jsonb_typeof(impostazioni) = 'object'),
  ultimo_errore  text,
  aggiornato_il  timestamptz not null default now(),
  aggiornato_da  uuid,
  primary key (studio_id, tipo)
);
alter table anagrafica.integrazioni enable row level security;
grant select on anagrafica.integrazioni to authenticated;
create policy admin_vede_integrazioni on anagrafica.integrazioni
  for select to authenticated using (sicurezza.is_admin() and studio_id = sicurezza.studio_id());
create trigger audit after insert or update or delete on anagrafica.integrazioni
  for each row execute function audit.traccia_modifica();

-- Mappa appuntamento ↔ evento Google: SOLO l'Edge Function di sincronizzazione (service role).
-- L'evento su Google porta un titolo generico, mai nome del bambino o motivo.
create table anagrafica.calendario_eventi_esterni (
  appuntamento_id  uuid primary key references anagrafica.appuntamenti(id) on delete cascade,
  studio_id        uuid not null references anagrafica.studi(id),
  evento_id        text not null,
  etag             text,
  sincronizzato_il timestamptz not null default now(),
  unique (studio_id, evento_id)
);
alter table anagrafica.calendario_eventi_esterni enable row level security;
revoke all on anagrafica.calendario_eventi_esterni from authenticated, anon;

create or replace function api.imposta_integrazione(p_tipo text, p_attiva boolean, p_impostazioni jsonb)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_chiave text;
  v_ammesse text[] := case p_tipo
    when 'whatsapp' then array['numero_mittente', 'nome_mittente', 'modalita', 'note']
    when 'google_calendar' then array['calendario', 'direzione', 'titolo_evento', 'note']
    else null end;
begin
  if not sicurezza.admin_attivo() or not sicurezza.mfa_ok() then
    raise exception 'Solo l''amministratore configura le integrazioni';
  end if;
  if v_ammesse is null then
    raise exception 'Integrazione sconosciuta';
  end if;
  if jsonb_typeof(coalesce(p_impostazioni, '{}'::jsonb)) <> 'object' then
    raise exception 'Impostazioni non valide';
  end if;
  for v_chiave in select jsonb_object_keys(coalesce(p_impostazioni, '{}'::jsonb)) loop
    if not v_chiave = any(v_ammesse) then
      raise exception 'Impostazione «%» non ammessa. Token e chiavi si inseriscono solo nei Secrets delle Edge Functions.', v_chiave;
    end if;
    if char_length(p_impostazioni ->> v_chiave) > 200 then
      raise exception 'Impostazione «%» troppo lunga', v_chiave;
    end if;
  end loop;
  insert into anagrafica.integrazioni (studio_id, tipo, attiva, stato, impostazioni, aggiornato_il, aggiornato_da)
  values (sicurezza.studio_id(), p_tipo, p_attiva, case when p_attiva then 'configurata' else 'da_configurare' end,
          coalesce(p_impostazioni, '{}'::jsonb), now(), auth.uid())
  on conflict (studio_id, tipo) do update set
    attiva = excluded.attiva, impostazioni = excluded.impostazioni, aggiornato_il = now(), aggiornato_da = auth.uid(),
    stato = case when excluded.attiva then
              case when anagrafica.integrazioni.stato in ('attiva', 'errore') then anagrafica.integrazioni.stato else 'configurata' end
            else 'sospesa' end;
end;
$$;
grant execute on function api.imposta_integrazione(text, boolean, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- 6. Informative, letture e firme dei consensi dal portale genitori
-- -----------------------------------------------------------------------------
create table anagrafica.informative (
  finalita      text not null check (finalita in ('dati_sanitari', 'portale', 'comunicazioni', 'condivisione_altro_genitore', 'whatsapp')),
  versione      text not null,
  titolo        text not null,
  testo         text not null,
  in_vigore_dal date not null default current_date,
  attiva        boolean not null default true,
  primary key (finalita, versione)
);
create unique index informativa_attiva_unica on anagrafica.informative (finalita) where attiva;
alter table anagrafica.informative enable row level security;
grant select on anagrafica.informative to authenticated;
create policy tutti_leggono_informative on anagrafica.informative for select to authenticated using (true);

create table anagrafica.letture_informativa (
  id          uuid primary key default gen_random_uuid(),
  tutore_id   uuid not null references anagrafica.tutori(id),
  paziente_id uuid not null references anagrafica.pazienti(id),
  finalita    text not null,
  versione    text not null,
  letta_il    timestamptz not null default now(),
  unique (tutore_id, paziente_id, finalita, versione)
);
alter table anagrafica.letture_informativa enable row level security;
grant select on anagrafica.letture_informativa to authenticated;
create policy staff_vede_letture on anagrafica.letture_informativa for select to authenticated
  using (sicurezza.is_staff() and exists (select 1 from anagrafica.pazienti p where p.id = paziente_id and p.studio_id = sicurezza.studio_id()));
create policy tutore_vede_proprie_letture on anagrafica.letture_informativa for select to authenticated
  using (sicurezza.ruolo() = 'tutore' and exists (select 1 from anagrafica.tutori t where t.id = tutore_id and t.utente_id = auth.uid()));

-- Firma su schermo (firma elettronica semplice): immagine del tratto + impronta SHA-256
-- di ciò che è stato firmato. Non è una firma grafometrica avanzata (FEA): per quella
-- serve un fornitore certificato che cifri i dati biometrici (DPCM 22/02/2013).
create table anagrafica.firme_consenso (
  consenso_id uuid primary key references anagrafica.consensi(id),
  immagine    text not null check (immagine like 'data:image/png;base64,%' and char_length(immagine) <= 300000),
  tratti      integer check (tratti between 1 and 500),
  impronta    text not null check (impronta ~ '^[0-9a-f]{64}$'),
  dispositivo text check (char_length(dispositivo) <= 300),
  firmato_il  timestamptz not null default now()
);
alter table anagrafica.firme_consenso enable row level security;
grant select on anagrafica.firme_consenso to authenticated;
create policy staff_vede_firme on anagrafica.firme_consenso for select to authenticated
  using (sicurezza.is_staff() and exists (
    select 1 from anagrafica.consensi c join anagrafica.pazienti p on p.id = c.paziente_id
    where c.id = consenso_id and p.studio_id = sicurezza.studio_id()));
create policy tutore_vede_proprie_firme on anagrafica.firme_consenso for select to authenticated
  using (sicurezza.ruolo() = 'tutore' and exists (
    select 1 from anagrafica.consensi c join anagrafica.tutori t on t.id = c.tutore_id
    where c.id = consenso_id and t.utente_id = auth.uid()));
create trigger audit after insert or update or delete on anagrafica.firme_consenso
  for each row execute function audit.traccia_modifica();

-- Consensi del genitore collegato: visibili anche SENZA il consenso al portale
-- (altrimenti non potrebbe darlo). Solo figli con relazione e responsabilità valide.
create or replace function api.portale_consensi()
returns table (paziente_id uuid, nome_figlio text, finalita text, titolo text, versione text,
               stato text, canale text, registrato_il timestamptz, firmato boolean, letta boolean)
language sql stable security definer
set search_path = ''
as $$
  select p.id, p.nome, i.finalita, i.titolo, i.versione,
         c.stato, c.canale, c.registrato_il,
         exists (select 1 from anagrafica.consensi c2 join anagrafica.firme_consenso f on f.consenso_id = c2.id
                 where c2.paziente_id = p.id and c2.tutore_id = t.id and c2.finalita = i.finalita
                   and c2.registrato_il = c.registrato_il),
         exists (select 1 from anagrafica.letture_informativa l
                 where l.tutore_id = t.id and l.paziente_id = p.id and l.finalita = i.finalita and l.versione = i.versione)
  from anagrafica.tutori t
  join anagrafica.relazioni_tutela r on r.tutore_id = t.id
  join anagrafica.pazienti p on p.id = r.paziente_id
  cross join anagrafica.informative i
  left join anagrafica.consensi_correnti c on c.paziente_id = p.id and c.tutore_id = t.id and c.finalita = i.finalita
  where sicurezza.ruolo() = 'tutore' and t.utente_id = auth.uid()
    and r.responsabilita_genitoriale and r.valida_dal <= current_date
    and (r.valida_al is null or r.valida_al >= current_date)
    and i.attiva
  order by p.nome, i.finalita;
$$;
grant execute on function api.portale_consensi() to authenticated;

create or replace function api.segna_informativa_letta(p_paziente_id uuid, p_finalita text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_tutore uuid;
  v_versione text;
begin
  select t.id into v_tutore
  from anagrafica.tutori t join anagrafica.relazioni_tutela r on r.tutore_id = t.id
  where t.utente_id = auth.uid() and r.paziente_id = p_paziente_id and r.responsabilita_genitoriale
    and r.valida_dal <= current_date and (r.valida_al is null or r.valida_al >= current_date);
  if sicurezza.ruolo() <> 'tutore' or v_tutore is null then
    raise exception 'Non autorizzato';
  end if;
  select versione into v_versione from anagrafica.informative where finalita = p_finalita and attiva;
  if v_versione is null then
    raise exception 'Informativa non disponibile';
  end if;
  insert into anagrafica.letture_informativa (tutore_id, paziente_id, finalita, versione)
  values (v_tutore, p_paziente_id, p_finalita, v_versione)
  on conflict do nothing;
end;
$$;
grant execute on function api.segna_informativa_letta(uuid, text) to authenticated;

create or replace function api.firma_consenso(p_paziente_id uuid, p_finalita text, p_stato text,
                                              p_firma text, p_tratti integer, p_dispositivo text default null)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_tutore uuid;
  v_info anagrafica.informative;
  v_id uuid;
  v_ora timestamptz := clock_timestamp();
begin
  select t.id into v_tutore
  from anagrafica.tutori t join anagrafica.relazioni_tutela r on r.tutore_id = t.id
  where t.utente_id = auth.uid() and r.paziente_id = p_paziente_id and r.responsabilita_genitoriale
    and r.valida_dal <= current_date and (r.valida_al is null or r.valida_al >= current_date);
  if sicurezza.ruolo() <> 'tutore' or v_tutore is null then
    raise exception 'Non autorizzato';
  end if;
  if p_stato not in ('concesso', 'negato', 'revocato') then
    raise exception 'Scelta non valida';
  end if;
  select * into v_info from anagrafica.informative where finalita = p_finalita and attiva;
  if v_info.finalita is null then
    raise exception 'Informativa non disponibile';
  end if;
  if not exists (select 1 from anagrafica.letture_informativa l where l.tutore_id = v_tutore and l.paziente_id = p_paziente_id
                 and l.finalita = p_finalita and l.versione = v_info.versione) then
    raise exception 'Apri e leggi l''informativa prima di firmare';
  end if;
  if p_firma is null or p_firma not like 'data:image/png;base64,%' or coalesce(p_tratti, 0) < 1 then
    raise exception 'Manca la firma';
  end if;

  insert into anagrafica.consensi (paziente_id, tutore_id, finalita, versione_informativa, stato, canale)
  values (p_paziente_id, v_tutore, p_finalita, v_info.versione, p_stato, 'portale')
  returning id into v_id;

  insert into anagrafica.firme_consenso (consenso_id, immagine, tratti, impronta, dispositivo, firmato_il)
  values (v_id, p_firma, p_tratti,
          encode(sha256(convert_to(concat_ws('|', v_id, v_tutore, p_paziente_id, p_finalita, v_info.versione,
                                             p_stato, v_info.testo, p_firma, v_ora), 'UTF8')), 'hex'),
          left(p_dispositivo, 300), v_ora);
  perform audit.registra('FIRMA_CONSENSO', 'anagrafica.consensi', v_id::text, null);
  return v_id;
end;
$$;
grant execute on function api.firma_consenso(uuid, text, text, text, integer, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 7. Portale: storico del figlio (visite, documenti, appuntamenti passati)
--    Stesse condizioni dei dati clinici: tutore con consenso al portale e
--    almeno un consenso ai dati sanitari. Nessuna nota interna dello studio.
-- -----------------------------------------------------------------------------
create or replace function api.portale_storico_figlio(p_paziente_id uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_pseudo uuid;
  v_r jsonb;
begin
  if not sicurezza.tutore_di(p_paziente_id) or sicurezza.stato_consenso(p_paziente_id, 'dati_sanitari') = 'assente' then
    raise exception 'Non autorizzato';
  end if;
  select pseudo_id into v_pseudo from pseudonimi.mappa where paziente_id = p_paziente_id;
  select jsonb_build_object(
    'appuntamenti', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'inizio', a.inizio, 'tipo', a.tipo, 'stato', a.stato) order by a.inizio desc)
        from anagrafica.appuntamenti a where a.paziente_id = p_paziente_id and a.inizio < now()), '[]'::jsonb),
    'visite', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'data', v.data, 'tipo', v.tipo, 'motivo', v.motivo,
          'terapia', v.terapia, 'indicazioni', v.indicazioni_genitori, 'prossimo_controllo', v.prossimo_controllo,
          'appuntamento_id', v.appuntamento_id) order by v.data desc)
        from clinica.visite v where v.pseudo_id = v_pseudo), '[]'::jsonb),
    'certificati', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'data', c.data, 'tipo', c.tipo,
          'valido_fino', c.valido_fino, 'contenuto', c.contenuto) order by c.data desc)
        from clinica.certificati c where c.pseudo_id = v_pseudo), '[]'::jsonb),
    'prescrizioni', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'data', x.data, 'priorita', x.priorita,
          'quesito', x.quesito, 'prestazioni', x.prestazioni) order by x.data desc)
        from clinica.prescrizioni x where x.pseudo_id = v_pseudo), '[]'::jsonb)
  ) into v_r;
  perform audit.registra('CONSULTAZIONE_PORTALE', 'clinica.visite', null, v_pseudo);
  return v_r;
end;
$$;
grant execute on function api.portale_storico_figlio(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 8. Amministrazione: account dei genitori
-- -----------------------------------------------------------------------------
create or replace function api.admin_account_genitori()
returns table (tutore_id uuid, nome text, cognome text, email text, telefono text,
               account_collegato boolean, email_confermata boolean, ultimo_accesso timestamptz,
               figli jsonb, consensi jsonb)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not sicurezza.admin_attivo() or not sicurezza.mfa_ok() then
    raise exception 'Solo l''amministratore gestisce gli account dei genitori';
  end if;
  return query
  select t.id, t.nome, t.cognome, t.email, t.telefono,
         t.utente_id is not null, u.email_confirmed_at is not null, u.last_sign_in_at,
         coalesce((select jsonb_agg(jsonb_build_object('paziente_id', p.id, 'nome', p.nome, 'cognome', p.cognome,
                    'tipo', r.tipo, 'responsabilita', r.responsabilita_genitoriale) order by p.cognome, p.nome)
                   from anagrafica.relazioni_tutela r join anagrafica.pazienti p on p.id = r.paziente_id
                   where r.tutore_id = t.id and (r.valida_al is null or r.valida_al >= current_date)), '[]'::jsonb),
         coalesce((select jsonb_agg(jsonb_build_object('paziente_id', c.paziente_id, 'finalita', c.finalita, 'stato', c.stato,
                    'canale', c.canale, 'versione', c.versione_informativa, 'registrato_il', c.registrato_il,
                    'firmato', exists (select 1 from anagrafica.consensi c2 join anagrafica.firme_consenso f on f.consenso_id = c2.id
                                       where c2.paziente_id = c.paziente_id and c2.tutore_id = t.id and c2.finalita = c.finalita
                                         and c2.registrato_il = c.registrato_il),
                    'letta', exists (select 1 from anagrafica.letture_informativa l where l.tutore_id = t.id
                                     and l.paziente_id = c.paziente_id and l.finalita = c.finalita)))
                   from anagrafica.consensi_correnti c where c.tutore_id = t.id), '[]'::jsonb)
  from anagrafica.tutori t
  left join auth.users u on u.id = t.utente_id
  where t.studio_id = sicurezza.studio_id()
  order by t.cognome, t.nome;
end;
$$;
grant execute on function api.admin_account_genitori() to authenticated;

create or replace function api.admin_scollega_genitore(p_tutore_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not sicurezza.admin_attivo() or not sicurezza.mfa_ok() then
    raise exception 'Solo l''amministratore gestisce gli account dei genitori';
  end if;
  update anagrafica.tutori set utente_id = null
   where id = p_tutore_id and studio_id = sicurezza.studio_id() and utente_id is not null;
  if not found then
    raise exception 'Account non trovato o già scollegato';
  end if;
  perform audit.registra('SCOLLEGA_ACCOUNT_GENITORE', 'anagrafica.tutori', p_tutore_id::text, null);
end;
$$;
grant execute on function api.admin_scollega_genitore(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 9. Testi delle informative (versione 2026-10). Da far validare al DPO prima
--    dell'uso reale: sono una base, non un parere legale.
-- -----------------------------------------------------------------------------
insert into anagrafica.informative (finalita, versione, titolo, testo) values
('dati_sanitari', '2026-10', 'Trattamento dei dati sanitari del bambino',
 'Il pediatra di libera scelta tratta i dati sanitari del bambino (visite, misure, vaccinazioni, allergie, patologie, prescrizioni) per finalità di diagnosi, cura e prevenzione (art. 9, par. 2, lett. h del Regolamento UE 2016/679 – GDPR).
I dati sono conservati in forma pseudonimizzata: i dati clinici sono separati da nome e codice fiscale e ogni accesso viene registrato in un registro non modificabile, che puoi consultare dal portale.
Vi accedono solo il pediatra titolare, il sostituto durante il turno e, se autorizzato, il personale dello studio. Non sono comunicati a terzi salvo obblighi di legge e Servizio Sanitario Nazionale.
Puoi chiedere accesso, rettifica, limitazione e copia dei dati scrivendo allo studio. Il titolare del trattamento è il pediatra; i contatti del Responsabile della protezione dei dati sono disponibili in studio.'),
('portale', '2026-10', 'Uso del portale genitori',
 'Il portale ti permette di vedere visite, documenti, appuntamenti e misure di tuo figlio, prenotare visite e firmare i consensi.
L''accesso avviene con codice inviato alla tua email; non condividere l''account. Ogni consultazione viene registrata.
Puoi revocare in qualsiasi momento questo consenso: il portale smetterà di mostrarti i dati, che restano comunque disponibili in studio.'),
('comunicazioni', '2026-10', 'Comunicazioni dello studio',
 'Acconsenti a ricevere dallo studio comunicazioni organizzative (promemoria di bilanci di salute, vaccinazioni, avvisi di chiusura) via email o telefono.
Le comunicazioni non contengono diagnosi né dettagli clinici. Puoi revocare il consenso in qualsiasi momento.'),
('condivisione_altro_genitore', '2026-10', 'Condivisione con l''altro genitore',
 'Se acconsenti, l''altro genitore con responsabilità genitoriale potrà vedere nel portale i dati sanitari di vostro figlio anche se non ha ancora espresso un proprio consenso ai dati sanitari.
Le decisioni sulla salute del minore spettano a entrambi i genitori (art. 316 e 337-ter c.c.); in caso di limitazioni disposte dal giudice informa lo studio.'),
('whatsapp', '2026-10', 'Promemoria via WhatsApp',
 'Acconsenti a ricevere su WhatsApp conferme e promemoria degli appuntamenti al numero indicato allo studio.
I messaggi contengono solo data, ora e indirizzo dello studio, mai il nome del bambino o informazioni sanitarie. WhatsApp è un servizio di Meta: il numero di telefono viene trattato anche da Meta secondo le sue condizioni. Puoi revocare il consenso in qualsiasi momento.');

-- -----------------------------------------------------------------------------
-- 10. Catalogo prestazioni: codici ripetuti nel file regionale
--     (ON CONFLICT non può aggiornare due volte la stessa riga nello stesso comando).
--     L'app unisce già i doppioni; qui si tiene comunque la prima occorrenza.
--     Importa il pediatra o l'amministratore.
-- -----------------------------------------------------------------------------
create or replace function api.importa_catalogo_prestazioni(p_righe jsonb, p_versione text, p_regione text default 'CAL')
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_studio uuid := sicurezza.studio_id();
  v_n int;
  v_inattive int;
begin
  if not (sicurezza.ruolo() = 'pediatra' or sicurezza.admin_attivo()) then
    raise exception 'Solo il pediatra o l''amministratore importa il catalogo delle prestazioni';
  end if;
  if jsonb_typeof(p_righe) <> 'array' or jsonb_array_length(p_righe) = 0 then
    raise exception 'Nessuna riga da importare';
  end if;
  if coalesce(trim(p_versione), '') = '' then
    raise exception 'Indicare la versione del catalogo (es. atto regionale)';
  end if;

  insert into anagrafica.catalogo_prestazioni
    (studio_id, regione, codice_regionale, codice_nazionale, descrizione, branca, nota_erogabilita, attivo, versione, importato_il)
  select distinct on (trim(r->>'codice_regionale'))
         v_studio, p_regione, trim(r->>'codice_regionale'), nullif(trim(r->>'codice_nazionale'), ''),
         left(trim(r->>'descrizione'), 1000), nullif(left(trim(r->>'branca'), 200), ''), nullif(left(trim(r->>'nota_erogabilita'), 500), ''),
         true, trim(p_versione), now()
  from jsonb_array_elements(p_righe) with ordinality as e(r, n)
  where coalesce(trim(r->>'codice_regionale'), '') <> '' and coalesce(trim(r->>'descrizione'), '') <> ''
  order by trim(r->>'codice_regionale'), n
  on conflict (studio_id, regione, codice_regionale) do update set
    codice_nazionale = excluded.codice_nazionale, descrizione = excluded.descrizione, branca = excluded.branca,
    nota_erogabilita = excluded.nota_erogabilita, attivo = true, versione = excluded.versione,
    importato_il = excluded.importato_il;
  get diagnostics v_n = row_count;

  update anagrafica.catalogo_prestazioni set attivo = false
  where studio_id = v_studio and regione = p_regione and attivo and versione <> trim(p_versione);
  get diagnostics v_inattive = row_count;

  perform audit.registra('IMPORTA_CATALOGO_PRESTAZIONI', 'anagrafica.catalogo_prestazioni', null, null);
  return jsonb_build_object('importate', v_n, 'disattivate', v_inattive);
end;
$$;

-- -----------------------------------------------------------------------------
-- 11. Registro di audit e controlli in scadenza: anche l'amministratore
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION api.verifica_audit()
 RETURNS TABLE(eventi_verificati bigint, primo_evento_non_valido bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not ((sicurezza.ruolo() = 'pediatra' or sicurezza.admin_attivo()) and sicurezza.mfa_ok()) then
    raise exception 'Solo il pediatra o l''amministratore può verificare il registro di audit';
  end if;
  return query select * from audit.verifica_catena();
end;
$function$

;
CREATE OR REPLACE FUNCTION api.attivita_recente(p_limite integer DEFAULT 20)
 RETURNS TABLE(avvenuto_il timestamp with time zone, ruolo text, azione text, tabella text, paziente text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not ((sicurezza.ruolo() = 'pediatra' or sicurezza.admin_attivo()) and sicurezza.mfa_ok()) then
    raise exception 'Solo il pediatra o l''amministratore può consultare il registro';
  end if;
  return query
  select e.avvenuto_il, e.ruolo, e.azione, e.tabella,
         case when p.id is not null then p.nome || ' ' || p.cognome end
  from audit.eventi e
  left join pseudonimi.mappa m on m.pseudo_id = e.pseudo_id
  left join anagrafica.pazienti p on p.id = m.paziente_id
  where (p.studio_id = sicurezza.studio_id())
     or e.actor_id in (select ms.utente_id from anagrafica.membri_studio ms
                       where ms.studio_id = sicurezza.studio_id())
  order by e.id desc
  limit least(greatest(p_limite, 1), 200);
end;
$function$

;
CREATE OR REPLACE FUNCTION api.controlli_in_scadenza(p_giorni integer DEFAULT 30)
 RETURNS TABLE(paziente_id uuid, nome text, cognome text, codice text, controllo text, dal date, al date, scaduto boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not ((sicurezza.ruolo() in ('pediatra', 'sostituto') or sicurezza.admin_attivo()) and sicurezza.mfa_ok()) then
    raise exception 'Solo il pediatra può vedere i controlli clinici';
  end if;
  return query
  select p.id, p.nome, p.cognome, c.codice, c.nome,
         p.data_nascita + c.finestra_da_giorni, p.data_nascita + c.finestra_a_giorni,
         p.data_nascita + c.finestra_a_giorni < current_date
  from anagrafica.pazienti p
  join pseudonimi.mappa m on m.paziente_id = p.id
  join clinica.cartelle ca on ca.pseudo_id = m.pseudo_id
  cross join anagrafica.catalogo_controlli c
  where p.studio_id = sicurezza.studio_id()
    and p.stato = 'attivo'
    and sicurezza.puo_accedere_paziente(p.id)
    and (c.destinatari = 'tutti' or cardinality(ca.fattori_rischio) > 0)
    and p.data_nascita + c.finestra_da_giorni <= current_date + p_giorni
    and p.data_nascita + c.finestra_a_giorni >= current_date - 60
    and not exists (select 1 from clinica.controlli_eseguiti e
                    where e.pseudo_id = m.pseudo_id and e.codice_controllo = c.codice)
  order by p.data_nascita + c.finestra_a_giorni, p.cognome;
end;
$function$

;

-- -----------------------------------------------------------------------------
-- 12. Allergologia: l'amministratore (qualunque ruolo clinico) vi accede sempre
-- -----------------------------------------------------------------------------
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
         and (m.allergologia or m.amministratore)
     );
$$;

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
  v_cartelle boolean := false;
begin
  select m.ruolo, m.studio_id, m.amministratore and m.ruolo <> 'segreteria',
         s.allergologia_attiva and m.ruolo <> 'segreteria' and (m.allergologia or m.amministratore),
         m.ruolo = 'segreteria' and exists (select 1 from anagrafica.permessi_cartelle pc where pc.segreteria_id = m.utente_id)
    into v_ruolo, v_studio, v_admin, v_allerg, v_cartelle
  from anagrafica.membri_studio m
  join anagrafica.studi s on s.id = m.studio_id
  where m.utente_id = v_utente and m.attivo;
  if v_ruolo is null and exists (select 1 from anagrafica.tutori t where t.utente_id = v_utente) then
    v_ruolo := 'tutore';
  end if;
  v_claims := jsonb_set(v_claims, '{app_ruolo}', to_jsonb(coalesce(v_ruolo, 'nessuno')));
  v_claims := jsonb_set(v_claims, '{app_admin}', to_jsonb(coalesce(v_admin, false)));
  v_claims := jsonb_set(v_claims, '{app_allergologia}', to_jsonb(coalesce(v_allerg, false)));
  v_claims := jsonb_set(v_claims, '{app_cartelle}', to_jsonb(coalesce(v_cartelle, false)));
  if v_studio is not null then
    v_claims := jsonb_set(v_claims, '{app_studio_id}', to_jsonb(v_studio));
  else
    v_claims := v_claims - 'app_studio_id';
  end if;
  return jsonb_set(event, '{claims}', v_claims);
end;
$$;

-- =============================================================================
-- 13. Correzioni dalla revisione
-- =============================================================================

-- a) Dal portale i consensi passano SOLO da api.firma_consenso (informativa letta + firma).
drop policy if exists tutore_dichiara_propri_consensi on anagrafica.consensi;

-- b) is_admin() non riconosce mai la segreteria (anche con un token vecchio).
create or replace function sicurezza.is_admin()
returns boolean
language sql stable
set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'app_admin')::boolean, false)
     and sicurezza.ruolo() in ('pediatra', 'sostituto', 'allergologo')
     and sicurezza.studio_id() is not null;
$$;

-- c) Dati sanitari al genitore: serve il SUO consenso ai dati sanitari, oppure il
--    consenso dell'altro genitore insieme alla sua «condivisione con l'altro genitore».
create or replace function sicurezza.tutore_vede_dati(p_paziente_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select sicurezza.tutore_di(p_paziente_id) and exists (
    select 1
    from anagrafica.consensi_correnti c
    join anagrafica.relazioni_tutela r on r.paziente_id = c.paziente_id and r.tutore_id = c.tutore_id
    join anagrafica.tutori t on t.id = c.tutore_id
    where c.paziente_id = p_paziente_id and c.finalita = 'dati_sanitari' and c.stato = 'concesso'
      and r.responsabilita_genitoriale and r.valida_dal <= current_date
      and (r.valida_al is null or r.valida_al >= current_date)
      and (t.utente_id = auth.uid() or exists (
            select 1 from anagrafica.consensi_correnti s
            where s.paziente_id = c.paziente_id and s.tutore_id = c.tutore_id
              and s.finalita = 'condivisione_altro_genitore' and s.stato = 'concesso'))
  );
$$;

create or replace function sicurezza.tutore_vede_clinica(p_pseudo_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from pseudonimi.mappa m
    where m.pseudo_id = p_pseudo_id and sicurezza.tutore_vede_dati(m.paziente_id)
  );
$$;

-- d) Misure e vaccini al genitore solo tramite RPC (niente note interne, lotto; consultazione registrata).
drop policy if exists tutore_vede_vaccinazioni on clinica.vaccinazioni;
drop policy if exists tutore_vede_misurazioni on clinica.misurazioni;

create or replace function api.portale_storico_figlio(p_paziente_id uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_pseudo uuid;
  v_r jsonb;
begin
  if not sicurezza.tutore_vede_dati(p_paziente_id) then
    raise exception 'Non autorizzato';
  end if;
  select pseudo_id into v_pseudo from pseudonimi.mappa where paziente_id = p_paziente_id;
  select jsonb_build_object(
    'appuntamenti', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'inizio', a.inizio, 'tipo', a.tipo, 'stato', a.stato) order by a.inizio desc)
        from anagrafica.appuntamenti a where a.paziente_id = p_paziente_id and a.inizio < now()), '[]'::jsonb),
    'visite', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'data', v.data, 'tipo', v.tipo, 'motivo', v.motivo,
          'terapia', v.terapia, 'indicazioni', v.indicazioni_genitori, 'prossimo_controllo', v.prossimo_controllo) order by v.data desc)
        from clinica.visite v where v.pseudo_id = v_pseudo), '[]'::jsonb),
    'certificati', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'data', c.data, 'tipo', c.tipo,
          'valido_fino', c.valido_fino, 'contenuto', c.contenuto) order by c.data desc)
        from clinica.certificati c where c.pseudo_id = v_pseudo), '[]'::jsonb),
    'prescrizioni', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'data', x.data, 'priorita', x.priorita,
          'quesito', x.quesito, 'prestazioni', x.prestazioni) order by x.data desc)
        from clinica.prescrizioni x where x.pseudo_id = v_pseudo), '[]'::jsonb),
    'misure', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'eta_giorni', m.eta_giorni, 'peso_kg', m.peso_kg,
          'altezza_cm', m.altezza_cm, 'circonferenza_cranica_cm', m.circonferenza_cranica_cm) order by m.eta_giorni desc)
        from clinica.misurazioni m where m.pseudo_id = v_pseudo), '[]'::jsonb),
    'vaccini', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'vaccino', x.vaccino, 'dose', x.dose, 'data', x.data) order by x.data desc)
        from clinica.vaccinazioni x where x.pseudo_id = v_pseudo), '[]'::jsonb)
  ) into v_r;
  perform audit.registra('CONSULTAZIONE_PORTALE', 'clinica.visite', null, v_pseudo);
  return v_r;
end;
$$;

-- e) Consensi del portale: una nuova versione dell'informativa rende il consenso «da rinnovare».
drop function api.portale_consensi();
create or replace function api.portale_consensi()
returns table (paziente_id uuid, nome_figlio text, finalita text, titolo text, versione text,
               stato text, canale text, registrato_il timestamptz, firmato boolean, letta boolean, versione_firmata text)
language sql stable security definer
set search_path = ''
as $$
  select p.id, p.nome, i.finalita, i.titolo, i.versione,
         case when c.stato = 'concesso' and c.versione_informativa <> i.versione then 'da_rinnovare' else c.stato end,
         c.canale, c.registrato_il,
         exists (select 1 from anagrafica.consensi c2 join anagrafica.firme_consenso f on f.consenso_id = c2.id
                 where c2.paziente_id = p.id and c2.tutore_id = t.id and c2.finalita = i.finalita
                   and c2.registrato_il = c.registrato_il),
         exists (select 1 from anagrafica.letture_informativa l
                 where l.tutore_id = t.id and l.paziente_id = p.id and l.finalita = i.finalita and l.versione = i.versione),
         c.versione_informativa
  from anagrafica.tutori t
  join anagrafica.relazioni_tutela r on r.tutore_id = t.id
  join anagrafica.pazienti p on p.id = r.paziente_id
  cross join anagrafica.informative i
  left join anagrafica.consensi_correnti c on c.paziente_id = p.id and c.tutore_id = t.id and c.finalita = i.finalita
  where sicurezza.ruolo() = 'tutore' and t.utente_id = auth.uid()
    and r.responsabilita_genitoriale and r.valida_dal <= current_date
    and (r.valida_al is null or r.valida_al >= current_date)
    and i.attiva
  order by p.nome, i.finalita;
$$;
-- La firma copre il testo: un'informativa pubblicata non si modifica, se ne crea una nuova versione.
create or replace function anagrafica.informativa_immutabile()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.testo is distinct from old.testo or new.versione is distinct from old.versione
     or new.titolo is distinct from old.titolo or new.finalita is distinct from old.finalita then
    raise exception 'Un''informativa pubblicata non si modifica: crea una nuova versione';
  end if;
  return new;
end;
$$;
create trigger immutabile before update on anagrafica.informative
  for each row execute function anagrafica.informativa_immutabile();
create trigger audit after insert or update or delete on anagrafica.informative
  for each row execute function audit.traccia_modifica();

-- f) Firma: controlli espliciti con messaggi in italiano.
create or replace function api.firma_consenso(p_paziente_id uuid, p_finalita text, p_stato text,
                                              p_firma text, p_tratti integer, p_dispositivo text default null)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_tutore uuid;
  v_info anagrafica.informative;
  v_id uuid;
  v_ora timestamptz := clock_timestamp();
begin
  select t.id into v_tutore
  from anagrafica.tutori t join anagrafica.relazioni_tutela r on r.tutore_id = t.id
  where t.utente_id = auth.uid() and r.paziente_id = p_paziente_id and r.responsabilita_genitoriale
    and r.valida_dal <= current_date and (r.valida_al is null or r.valida_al >= current_date)
  order by t.creato_il limit 1;
  if sicurezza.ruolo() <> 'tutore' or v_tutore is null then
    raise exception 'Non autorizzato';
  end if;
  if p_stato not in ('concesso', 'negato', 'revocato') then
    raise exception 'Scelta non valida';
  end if;
  select * into v_info from anagrafica.informative where finalita = p_finalita and attiva;
  if v_info.finalita is null then
    raise exception 'Informativa non disponibile';
  end if;
  if not exists (select 1 from anagrafica.letture_informativa l where l.tutore_id = v_tutore and l.paziente_id = p_paziente_id
                 and l.finalita = p_finalita and l.versione = v_info.versione) then
    raise exception 'Apri e leggi l''informativa prima di firmare';
  end if;
  if p_firma is null or p_firma not like 'data:image/png;base64,%' or coalesce(p_tratti, 0) < 1 then
    raise exception 'Manca la firma';
  end if;
  if char_length(p_firma) > 300000 or p_tratti > 500 then
    raise exception 'Firma troppo complessa: cancellala e rifirma';
  end if;

  insert into anagrafica.consensi (paziente_id, tutore_id, finalita, versione_informativa, stato, canale)
  values (p_paziente_id, v_tutore, p_finalita, v_info.versione, p_stato, 'portale')
  returning id into v_id;

  insert into anagrafica.firme_consenso (consenso_id, immagine, tratti, impronta, dispositivo, firmato_il)
  values (v_id, p_firma, p_tratti,
          encode(sha256(convert_to(concat_ws('|', v_id, v_tutore, p_paziente_id, p_finalita, v_info.versione,
                                             p_stato, v_info.testo, p_firma, v_ora), 'UTF8')), 'hex'),
          left(p_dispositivo, 300), v_ora);
  perform audit.registra('FIRMA_CONSENSO', 'anagrafica.consensi', v_id::text, null,
                         jsonb_build_object('finalita', p_finalita, 'stato', p_stato, 'versione', v_info.versione));
  return v_id;
end;
$$;

-- g) Account genitore: lo scollegamento blocca il ricollegamento automatico finché lo studio non lo sblocca.
alter table anagrafica.tutori add column portale_bloccato boolean not null default false;

create or replace function api.admin_scollega_genitore(p_tutore_id uuid, p_blocca boolean default true)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not sicurezza.admin_attivo() or not sicurezza.mfa_ok() then
    raise exception 'Solo l''amministratore gestisce gli account dei genitori';
  end if;
  update anagrafica.tutori set utente_id = case when p_blocca then null else utente_id end, portale_bloccato = p_blocca
   where id = p_tutore_id and studio_id = sicurezza.studio_id();
  if not found then
    raise exception 'Genitore non trovato';
  end if;
  perform audit.registra(case when p_blocca then 'SCOLLEGA_ACCOUNT_GENITORE' else 'SBLOCCA_ACCOUNT_GENITORE' end,
                         'anagrafica.tutori', p_tutore_id::text, null);
end;
$$;
grant execute on function api.admin_scollega_genitore(uuid, boolean) to authenticated;
drop function if exists api.admin_scollega_genitore(uuid);

create or replace function api.collega_account_tutore()
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_email text := lower(auth.jwt() ->> 'email');
  v_n     integer;
begin
  if auth.uid() is null or v_email is null then
    raise exception 'Sessione non valida';
  end if;
  if exists (select 1 from anagrafica.membri_studio where utente_id = auth.uid()) then
    raise exception 'Un account dello staff non può essere collegato a un tutore';
  end if;
  if not exists (select 1 from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null) then
    raise exception 'Email non verificata: accedi con il codice ricevuto via email';
  end if;
  if exists (select 1 from anagrafica.tutori where lower(email) = v_email and utente_id is null and portale_bloccato) then
    raise exception 'Accesso al portale sospeso dallo studio: contatta lo studio';
  end if;

  update anagrafica.tutori
  set utente_id = auth.uid()
  where lower(email) = v_email and utente_id is null and not portale_bloccato;
  get diagnostics v_n = row_count;

  if v_n > 0 then
    perform audit.registra('COLLEGAMENTO_TUTORE', 'anagrafica.tutori', auth.uid()::text);
  end if;
  return v_n;
end;
$$;

drop function api.admin_account_genitori();
create or replace function api.admin_account_genitori()
returns table (tutore_id uuid, nome text, cognome text, email text, telefono text,
               account_collegato boolean, email_confermata boolean, ultimo_accesso timestamptz, bloccato boolean,
               figli jsonb, consensi jsonb)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not sicurezza.admin_attivo() or not sicurezza.mfa_ok() then
    raise exception 'Solo l''amministratore gestisce gli account dei genitori';
  end if;
  return query
  select t.id, t.nome, t.cognome, t.email, t.telefono,
         t.utente_id is not null, u.email_confirmed_at is not null, u.last_sign_in_at, t.portale_bloccato,
         coalesce((select jsonb_agg(jsonb_build_object('paziente_id', p.id, 'nome', p.nome, 'cognome', p.cognome,
                    'tipo', r.tipo, 'responsabilita', r.responsabilita_genitoriale) order by p.cognome, p.nome)
                   from anagrafica.relazioni_tutela r join anagrafica.pazienti p on p.id = r.paziente_id
                   where r.tutore_id = t.id and (r.valida_al is null or r.valida_al >= current_date)), '[]'::jsonb),
         coalesce((select jsonb_agg(jsonb_build_object('paziente_id', c.paziente_id, 'finalita', c.finalita, 'stato', c.stato,
                    'canale', c.canale, 'versione', c.versione_informativa, 'registrato_il', c.registrato_il,
                    'firmato', exists (select 1 from anagrafica.consensi c2 join anagrafica.firme_consenso f on f.consenso_id = c2.id
                                       where c2.paziente_id = c.paziente_id and c2.tutore_id = t.id and c2.finalita = c.finalita
                                         and c2.registrato_il = c.registrato_il),
                    'letta', exists (select 1 from anagrafica.letture_informativa l where l.tutore_id = t.id
                                     and l.paziente_id = c.paziente_id and l.finalita = c.finalita
                                     and l.versione = c.versione_informativa)))
                   from anagrafica.consensi_correnti c where c.tutore_id = t.id), '[]'::jsonb)
  from anagrafica.tutori t
  left join auth.users u on u.id = t.utente_id
  where t.studio_id = sicurezza.studio_id()
  order by t.cognome, t.nome;
end;
$$;

-- h) Registro chiaro dei permessi e delle integrazioni (chi, cosa, per chi).
create or replace function anagrafica.registra_permesso()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r anagrafica.permessi_cartelle := coalesce(new, old);
begin
  perform audit.registra(case when tg_op = 'DELETE' then 'REVOCA_ACCESSO_CARTELLE' else 'CONCESSO_ACCESSO_CARTELLE' end,
    'anagrafica.permessi_cartelle', r.segreteria_id::text || ':' || r.pediatra_id::text, null,
    jsonb_build_object('segreteria', r.segreteria_id, 'pediatra', r.pediatra_id));
  return null;
end;
$$;
create trigger registra_permesso after insert or delete on anagrafica.permessi_cartelle
  for each row execute function anagrafica.registra_permesso();

-- i) Integrazioni: «sospesa» solo se era già stata abilitata; mai segreti nelle note.
create or replace function api.imposta_integrazione(p_tipo text, p_attiva boolean, p_impostazioni jsonb)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_chiave text;
  v_ammesse text[] := case p_tipo
    when 'whatsapp' then array['numero_mittente', 'nome_mittente', 'modalita']
    when 'google_calendar' then array['calendario', 'direzione', 'titolo_evento']
    else null end;
begin
  if not sicurezza.admin_attivo() or not sicurezza.mfa_ok() then
    raise exception 'Solo l''amministratore configura le integrazioni';
  end if;
  if v_ammesse is null then
    raise exception 'Integrazione sconosciuta';
  end if;
  if jsonb_typeof(coalesce(p_impostazioni, '{}'::jsonb)) <> 'object' then
    raise exception 'Impostazioni non valide';
  end if;
  for v_chiave in select jsonb_object_keys(coalesce(p_impostazioni, '{}'::jsonb)) loop
    if not v_chiave = any(v_ammesse) then
      raise exception 'Impostazione «%» non ammessa. Token e chiavi si inseriscono solo nei Secrets delle Edge Functions.', v_chiave;
    end if;
    if char_length(p_impostazioni ->> v_chiave) > 120 then
      raise exception 'Impostazione «%» troppo lunga', v_chiave;
    end if;
  end loop;
  insert into anagrafica.integrazioni (studio_id, tipo, attiva, stato, impostazioni, aggiornato_il, aggiornato_da)
  values (sicurezza.studio_id(), p_tipo, p_attiva, case when p_attiva then 'configurata' else 'da_configurare' end,
          coalesce(p_impostazioni, '{}'::jsonb), now(), auth.uid())
  on conflict (studio_id, tipo) do update set
    attiva = excluded.attiva, impostazioni = excluded.impostazioni, aggiornato_il = now(), aggiornato_da = auth.uid(),
    stato = case
      when excluded.attiva then
        case when anagrafica.integrazioni.stato in ('attiva', 'errore') then anagrafica.integrazioni.stato else 'configurata' end
      when anagrafica.integrazioni.stato = 'da_configurare' then 'da_configurare'
      else 'sospesa' end;
  perform audit.registra('IMPOSTA_INTEGRAZIONE', 'anagrafica.integrazioni', p_tipo, null,
                         jsonb_build_object('attiva', p_attiva));
end;
$$;

-- j) Catalogo: secondo fattore obbligatorio; si importa in una sola chiamata e si disattiva
--    tutto ciò che non è stato appena importato (non dipende dal testo della versione).
create or replace function api.importa_catalogo_prestazioni(p_righe jsonb, p_versione text, p_regione text default 'CAL')
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_studio uuid := sicurezza.studio_id();
  v_inizio timestamptz := clock_timestamp();
  v_n int;
  v_inattive int;
begin
  if not ((sicurezza.ruolo() = 'pediatra' or sicurezza.admin_attivo()) and sicurezza.mfa_ok()) then
    raise exception 'Solo il pediatra o l''amministratore importa il catalogo delle prestazioni';
  end if;
  if jsonb_typeof(p_righe) <> 'array' or jsonb_array_length(p_righe) = 0 then
    raise exception 'Nessuna riga da importare';
  end if;
  if jsonb_array_length(p_righe) > 20000 then
    raise exception 'File troppo grande (massimo 20.000 prestazioni)';
  end if;
  if coalesce(trim(p_versione), '') = '' then
    raise exception 'Indicare la versione del catalogo (es. atto regionale)';
  end if;

  insert into anagrafica.catalogo_prestazioni
    (studio_id, regione, codice_regionale, codice_nazionale, descrizione, branca, nota_erogabilita, attivo, versione, importato_il)
  select distinct on (trim(r->>'codice_regionale'))
         v_studio, p_regione, trim(r->>'codice_regionale'), nullif(trim(r->>'codice_nazionale'), ''),
         left(trim(r->>'descrizione'), 1000), nullif(left(trim(r->>'branca'), 200), ''), nullif(left(trim(r->>'nota_erogabilita'), 500), ''),
         true, trim(p_versione), v_inizio
  from jsonb_array_elements(p_righe) with ordinality as e(r, n)
  where coalesce(trim(r->>'codice_regionale'), '') <> '' and coalesce(trim(r->>'descrizione'), '') <> ''
  order by trim(r->>'codice_regionale'), n
  on conflict (studio_id, regione, codice_regionale) do update set
    codice_nazionale = excluded.codice_nazionale, descrizione = excluded.descrizione, branca = excluded.branca,
    nota_erogabilita = excluded.nota_erogabilita, attivo = true, versione = excluded.versione,
    importato_il = excluded.importato_il;
  get diagnostics v_n = row_count;

  update anagrafica.catalogo_prestazioni set attivo = false
  where studio_id = v_studio and regione = p_regione and attivo and importato_il < v_inizio;
  get diagnostics v_inattive = row_count;

  perform audit.registra('IMPORTA_CATALOGO_PRESTAZIONI', 'anagrafica.catalogo_prestazioni', null, null,
                         jsonb_build_object('versione', trim(p_versione), 'importate', v_n, 'disattivate', v_inattive));
  return jsonb_build_object('importate', v_n, 'disattivate', v_inattive);
end;
$$;

-- k) Registro attività: il pediatra non amministratore vede solo i propri assistiti e le proprie azioni.
create or replace function api.attivita_recente(p_limite integer default 20)
returns table (avvenuto_il timestamptz, ruolo text, azione text, tabella text, paziente text)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_admin boolean := sicurezza.admin_attivo();
begin
  if not ((sicurezza.ruolo() = 'pediatra' or v_admin) and sicurezza.mfa_ok()) then
    raise exception 'Solo il pediatra o l''amministratore può consultare il registro';
  end if;
  return query
  select e.avvenuto_il, e.ruolo, e.azione, e.tabella,
         case when p.id is not null then p.nome || ' ' || p.cognome end
  from audit.eventi e
  left join pseudonimi.mappa m on m.pseudo_id = e.pseudo_id
  left join anagrafica.pazienti p on p.id = m.paziente_id
  where case when v_admin then
          (p.studio_id = sicurezza.studio_id())
          or e.actor_id in (select ms.utente_id from anagrafica.membri_studio ms where ms.studio_id = sicurezza.studio_id())
        else
          (p.studio_id = sicurezza.studio_id() and p.pediatra_id = auth.uid()) or e.actor_id = auth.uid()
        end
  order by e.id desc
  limit least(greatest(p_limite, 1), 200);
end;
$$;

-- l) Nessuna funzione nuova eseguibile da PUBLIC (solo dagli utenti autenticati).
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname in ('api', 'sicurezza')
             and p.proname in ('admin_attivo', 'segreteria_legge_paziente', 'segreteria_legge_clinica', 'tutore_vede_dati',
                               'imposta_permesso_cartelle', 'imposta_integrazione', 'portale_consensi', 'segna_informativa_letta',
                               'firma_consenso', 'portale_storico_figlio', 'admin_account_genitori', 'admin_scollega_genitore') loop
    execute format('revoke execute on function %s from public, anon', f);
  end loop;
end;
$$;
grant execute on function sicurezza.admin_attivo(), sicurezza.segreteria_legge_paziente(uuid),
  sicurezza.segreteria_legge_clinica(uuid), sicurezza.tutore_vede_dati(uuid) to authenticated;
grant execute on function api.portale_consensi(), api.segna_informativa_letta(uuid, text),
  api.firma_consenso(uuid, text, text, text, integer, text), api.portale_storico_figlio(uuid),
  api.admin_account_genitori(), api.admin_scollega_genitore(uuid, boolean),
  api.imposta_permesso_cartelle(uuid, uuid, boolean), api.imposta_integrazione(text, boolean, jsonb) to authenticated;
