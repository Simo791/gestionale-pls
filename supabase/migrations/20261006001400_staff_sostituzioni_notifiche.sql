-- =============================================================================
-- 1400 · Gestione dello staff, passaggio titolare ↔ sostituto, notifiche,
--        storico delle modifiche a patologie del bambino e catalogo patologie
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Amministratore dello studio (di solito il pediatra titolare) e dati del membro
-- -----------------------------------------------------------------------------
alter table anagrafica.membri_studio
  add column amministratore boolean not null default false,
  add column nome           text,
  add column cognome        text,
  add column email          text,
  add column aggiornato_il  timestamptz not null default now(),
  add constraint admin_solo_pediatra check (not amministratore or ruolo = 'pediatra');

-- I pediatri titolari già presenti diventano amministratori del proprio studio.
update anagrafica.membri_studio set amministratore = true where ruolo = 'pediatra';
update anagrafica.membri_studio m set nome = p.nome, cognome = p.cognome, email = p.email
from anagrafica.pediatri p where p.id = m.utente_id;

create trigger audit after insert or update or delete on anagrafica.membri_studio
  for each row execute function audit.traccia_modifica();

-- Sostituzioni: consegne del titolare e revoca anticipata
alter table anagrafica.sostituzioni
  add column consegne     text,
  add column creato_da    uuid default auth.uid(),
  add column creato_il    timestamptz not null default now(),
  add column revocata_il  timestamptz;

-- Il token porta anche app_admin: le policy lo leggono senza interrogare tabelle.
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
begin
  select m.ruolo, m.studio_id, m.amministratore into v_ruolo, v_studio, v_admin
  from anagrafica.membri_studio m
  where m.utente_id = v_utente and m.attivo;

  if v_ruolo is null and exists (select 1 from anagrafica.tutori t where t.utente_id = v_utente) then
    v_ruolo := 'tutore';
  end if;

  v_claims := jsonb_set(v_claims, '{app_ruolo}', to_jsonb(coalesce(v_ruolo, 'nessuno')));
  v_claims := jsonb_set(v_claims, '{app_admin}', to_jsonb(coalesce(v_admin, false)));
  if v_studio is not null then
    v_claims := jsonb_set(v_claims, '{app_studio_id}', to_jsonb(v_studio));
  else
    v_claims := v_claims - 'app_studio_id';
  end if;

  return jsonb_set(event, '{claims}', v_claims);
end;
$$;

create or replace function sicurezza.is_admin()
returns boolean
language sql stable
set search_path = ''
as $$
  select sicurezza.ruolo() = 'pediatra'
     and coalesce((auth.jwt() ->> 'app_admin')::boolean, false)
     and sicurezza.studio_id() is not null;
$$;
grant execute on function sicurezza.is_admin() to authenticated;

-- Attiva/disattiva un membro dello staff (non se stessi). L'effetto è immediato sui
-- nuovi token; la sessione aperta dell'interessato decade al rinnovo del token.
create or replace function api.imposta_membro(p_utente uuid, p_attivo boolean, p_nome text default null, p_cognome text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not sicurezza.is_admin() then
    raise exception 'Solo l''amministratore dello studio gestisce lo staff';
  end if;
  if p_utente = auth.uid() then
    raise exception 'Non puoi disattivare il tuo stesso account';
  end if;
  update anagrafica.membri_studio
     set attivo = p_attivo,
         nome = coalesce(nullif(trim(p_nome), ''), nome),
         cognome = coalesce(nullif(trim(p_cognome), ''), cognome),
         aggiornato_il = now()
   where utente_id = p_utente and studio_id = sicurezza.studio_id() and not amministratore;
  if not found then
    raise exception 'Membro non trovato in questo studio';
  end if;
end;
$$;
grant execute on function api.imposta_membro(uuid, boolean, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Notifiche interne (nessun dato clinico nel testo)
-- -----------------------------------------------------------------------------
create table anagrafica.notifiche (
  id            uuid primary key default gen_random_uuid(),
  studio_id     uuid not null references anagrafica.studi(id),
  destinatario  uuid not null references auth.users(id) on delete cascade,
  tipo          text not null,
  titolo        text not null,
  testo         text,
  link          text,          -- rotta interna, es. '#/agenda'
  creato_il     timestamptz not null default now(),
  letta_il      timestamptz
);
create index on anagrafica.notifiche (destinatario, letta_il, creato_il desc);
alter table anagrafica.notifiche enable row level security;
grant select on anagrafica.notifiche to authenticated;
grant update (letta_il) on anagrafica.notifiche to authenticated;
create policy legge_proprie_notifiche on anagrafica.notifiche
  for select to authenticated using (destinatario = auth.uid());
create policy segna_proprie_notifiche on anagrafica.notifiche
  for update to authenticated using (destinatario = auth.uid()) with check (destinatario = auth.uid());

create or replace function anagrafica.notifica(p_studio uuid, p_destinatario uuid, p_tipo text, p_titolo text,
                                               p_testo text default null, p_link text default null)
returns void
language sql security definer
set search_path = ''
as $$
  insert into anagrafica.notifiche (studio_id, destinatario, tipo, titolo, testo, link)
  values (p_studio, p_destinatario, p_tipo, p_titolo, p_testo, p_link);
$$;
revoke execute on function anagrafica.notifica(uuid, uuid, text, text, text, text) from public, anon, authenticated;

-- Chi segue oggi i pazienti di un titolare: il sostituto in servizio, altrimenti il titolare.
-- È lo "scambio" titolare ↔ sostituto: notifiche e responsabilità seguono il turno.
create or replace function sicurezza.responsabile_oggi(p_titolare uuid)
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select coalesce(
    (select s.sostituto_id from anagrafica.sostituzioni s
       join anagrafica.membri_studio m on m.utente_id = s.sostituto_id and m.attivo
      where s.titolare_id = p_titolare and s.revocata_il is null
        and current_date between s.dal and s.al
      order by s.dal desc limit 1),
    p_titolare);
$$;

-- -----------------------------------------------------------------------------
-- Sostituzioni: attivazione, consegne, revoca
-- -----------------------------------------------------------------------------
create trigger audit after insert or update or delete on anagrafica.sostituzioni
  for each row execute function audit.traccia_modifica();

-- L'accesso del sostituto vale solo per sostituzioni non revocate.
create or replace function sicurezza.puo_accedere_paziente(p_paziente_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select sicurezza.ruolo() in ('pediatra', 'sostituto')
     and sicurezza.mfa_ok()
     and exists (
       select 1
       from anagrafica.pazienti p
       where p.id = p_paziente_id
         and p.studio_id = sicurezza.studio_id()
         and (
           p.pediatra_id = auth.uid()
           or exists (
             select 1 from anagrafica.sostituzioni s
             where s.titolare_id = p.pediatra_id
               and s.sostituto_id = auth.uid()
               and s.revocata_il is null
               and current_date between s.dal and s.al
           )
         )
     );
$$;

create or replace function api.attiva_sostituzione(p_sostituto uuid, p_dal date, p_al date, p_consegne text default null)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_studio uuid := sicurezza.studio_id();
  v_titolare text;
  v_assistiti int;
begin
  if sicurezza.ruolo() <> 'pediatra' then
    raise exception 'Solo il pediatra titolare attiva una sostituzione';
  end if;
  if p_al < p_dal or p_al < current_date then
    raise exception 'Periodo non valido';
  end if;
  if not exists (select 1 from anagrafica.membri_studio
                 where utente_id = p_sostituto and studio_id = v_studio and ruolo = 'sostituto' and attivo) then
    raise exception 'Il sostituto deve essere un membro attivo dello studio con ruolo sostituto';
  end if;
  if exists (select 1 from anagrafica.sostituzioni
             where titolare_id = auth.uid() and revocata_il is null and daterange(dal, al, '[]') && daterange(p_dal, p_al, '[]')) then
    raise exception 'Esiste già una sostituzione in questo periodo';
  end if;

  insert into anagrafica.sostituzioni (studio_id, titolare_id, sostituto_id, dal, al, consegne)
  values (v_studio, auth.uid(), p_sostituto, p_dal, p_al, nullif(trim(p_consegne), ''))
  returning id into v_id;

  select titolo || ' ' || nome || ' ' || cognome into v_titolare from anagrafica.pediatri where id = auth.uid();
  select count(*) into v_assistiti from anagrafica.pazienti where pediatra_id = auth.uid() and stato = 'attivo';
  perform anagrafica.notifica(v_studio, p_sostituto, 'sostituzione',
    format('Sostituzione di %s dal %s al %s', v_titolare, to_char(p_dal, 'DD/MM/YYYY'), to_char(p_al, 'DD/MM/YYYY')),
    format('%s assistiti in carico durante il periodo.%s', v_assistiti,
           coalesce(E'\nConsegne: ' || nullif(trim(p_consegne), ''), '')),
    '#/cruscotto');
  perform anagrafica.notifica(v_studio, auth.uid(), 'sostituzione',
    format('Sostituzione attivata dal %s al %s', to_char(p_dal, 'DD/MM/YYYY'), to_char(p_al, 'DD/MM/YYYY')),
    'Durante il periodo le notifiche dei tuoi assistiti arrivano al sostituto.', '#/account');
  return v_id;
end;
$$;

create or replace function api.revoca_sostituzione(p_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_s anagrafica.sostituzioni;
begin
  select * into v_s from anagrafica.sostituzioni where id = p_id and studio_id = sicurezza.studio_id();
  if v_s.id is null or not (v_s.titolare_id = auth.uid() or sicurezza.is_admin()) then
    raise exception 'Sostituzione non trovata o non modificabile';
  end if;
  update anagrafica.sostituzioni set revocata_il = now(), al = greatest(dal, least(al, current_date)) where id = p_id;
  perform anagrafica.notifica(v_s.studio_id, v_s.sostituto_id, 'sostituzione',
    'Sostituzione terminata', 'L''accesso ai dati clinici degli assistiti del titolare è stato chiuso.', '#/cruscotto');
end;
$$;
grant execute on function api.attiva_sostituzione(uuid, date, date, text), api.revoca_sostituzione(uuid) to authenticated;

-- Notifica di richiesta appuntamento dal portale genitori: segreteria + responsabile di turno.
create or replace function anagrafica.notifica_richiesta_appuntamento()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_p anagrafica.pazienti;
  v_dest uuid;
begin
  if new.stato <> 'richiesto' then
    return new;
  end if;
  select * into v_p from anagrafica.pazienti where id = new.paziente_id;
  for v_dest in
    select utente_id from anagrafica.membri_studio
     where studio_id = v_p.studio_id and attivo and ruolo = 'segreteria'
    union
    select sicurezza.responsabile_oggi(v_p.pediatra_id)
  loop
    perform anagrafica.notifica(v_p.studio_id, v_dest, 'richiesta_appuntamento',
      'Nuova richiesta di appuntamento',
      format('%s %s · %s', v_p.cognome, v_p.nome, to_char(new.inizio at time zone 'Europe/Rome', 'DD/MM/YYYY HH24:MI')),
      '#/agenda');
  end loop;
  return new;
end;
$$;
create trigger notifica_richiesta after insert on anagrafica.appuntamenti
  for each row execute function anagrafica.notifica_richiesta_appuntamento();

-- -----------------------------------------------------------------------------
-- Patologie del bambino: modificabili, mai cancellate, con storico dei valori
-- -----------------------------------------------------------------------------
revoke delete on clinica.patologie_paziente from authenticated;

create table clinica.patologie_storico (
  id            bigint generated always as identity primary key,
  riga_id       uuid not null,               -- clinica.patologie_paziente.id
  pseudo_id     uuid not null,
  operazione    text not null check (operazione in ('INSERT', 'UPDATE')),
  campi         text[] not null default '{}',
  prima         jsonb,
  dopo          jsonb not null,
  autore        uuid default auth.uid(),
  ruolo         text default sicurezza.ruolo(),
  avvenuto_il   timestamptz not null default now()
);
create index on clinica.patologie_storico (riga_id, avvenuto_il);
alter table clinica.patologie_storico enable row level security;
grant select on clinica.patologie_storico to authenticated;
create policy legge_storico_patologie on clinica.patologie_storico
  for select to authenticated using (sicurezza.puo_accedere_clinica(pseudo_id));

create or replace function clinica.registra_storico_patologia()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_prima jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) - 'pseudo_id' end;
  v_dopo  jsonb := to_jsonb(new) - 'pseudo_id';
begin
  insert into clinica.patologie_storico (riga_id, pseudo_id, operazione, campi, prima, dopo)
  values (new.id, new.pseudo_id, tg_op,
          coalesce((select array_agg(k order by k) from jsonb_object_keys(v_dopo) k
                    where v_prima is null or v_prima -> k is distinct from v_dopo -> k), '{}'),
          v_prima, v_dopo);
  return new;
end;
$$;
create trigger storico after insert or update on clinica.patologie_paziente
  for each row execute function clinica.registra_storico_patologia();

-- -----------------------------------------------------------------------------
-- Catalogo patologie: modificabile dall'amministratore, con storico
-- (catalogo condiviso: in un SaaS multi-studio questo diritto spetterebbe a un
--  amministratore di piattaforma; nel progetto è l'amministratore dello studio)
-- -----------------------------------------------------------------------------
grant insert, update (nome, sinonimi, area, esenzione, orpha, icd9cm, descrizione, segni_allarme, diagnosi,
                      follow_up, specialisti, emergenza, note, fonti) on anagrafica.catalogo_patologie to authenticated;
create policy admin_modifica_patologie on anagrafica.catalogo_patologie
  for update to authenticated using (sicurezza.is_admin()) with check (sicurezza.is_admin());
create policy admin_aggiunge_patologie on anagrafica.catalogo_patologie
  for insert to authenticated with check (sicurezza.is_admin());

create table anagrafica.catalogo_patologie_storico (
  id            bigint generated always as identity primary key,
  codice        text not null,
  operazione    text not null,
  campi         text[] not null default '{}',
  prima         jsonb,
  dopo          jsonb not null,
  autore        uuid default auth.uid(),
  autore_nome   text,
  motivo        text,
  avvenuto_il   timestamptz not null default now()
);
alter table anagrafica.catalogo_patologie_storico enable row level security;
grant select on anagrafica.catalogo_patologie_storico to authenticated;
create policy staff_legge_storico_catalogo on anagrafica.catalogo_patologie_storico
  for select to authenticated using (sicurezza.is_staff());

create or replace function anagrafica.registra_storico_catalogo()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_prima jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end;
  v_dopo  jsonb := to_jsonb(new);
  v_campi text[];
begin
  select coalesce(array_agg(k order by k), '{}') into v_campi from jsonb_object_keys(v_dopo) k
   where v_prima is null or v_prima -> k is distinct from v_dopo -> k;
  if tg_op = 'UPDATE' and cardinality(v_campi) = 0 then
    return new;
  end if;
  insert into anagrafica.catalogo_patologie_storico (codice, operazione, campi, prima, dopo, autore_nome)
  values (new.codice, tg_op, v_campi, v_prima, v_dopo,
          (select trim(coalesce(nome, '') || ' ' || coalesce(cognome, '')) from anagrafica.membri_studio where utente_id = auth.uid()));
  return new;
end;
$$;
-- Solo le modifiche fatte da utenti: il caricamento iniziale della migrazione 1200 è già avvenuto.
create trigger storico after insert or update on anagrafica.catalogo_patologie
  for each row when (auth.uid() is not null) execute function anagrafica.registra_storico_catalogo();
create trigger audit after insert or update on anagrafica.catalogo_patologie
  for each row execute function audit.traccia_modifica();

-- Registro e notifica di benvenuto quando la Edge Function gestione-staff aggiunge un membro.
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
    case p_ruolo when 'sostituto'
      then 'Al primo accesso configura il secondo fattore. Vedrai i dati clinici solo durante i periodi di sostituzione attivati dal titolare.'
      else 'Al primo accesso configura il secondo fattore. Gestisci agenda, anagrafiche e consensi.' end,
    '#/cruscotto');
end;
$$;
revoke execute on function api.registra_evento_staff(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function api.registra_evento_staff(uuid, uuid, uuid, text) to service_role;

-- La Edge Function gestione-staff (service_role) scrive solo l'appartenenza allo studio.
grant usage on schema anagrafica to service_role;
grant select, insert, update on anagrafica.membri_studio to service_role;
grant select on anagrafica.tutori to service_role;

-- Motivo e fonte di una modifica al catalogo: si allega all'ultima voce di storico dell'autore.
create or replace function api.motiva_modifica_catalogo(p_codice text, p_motivo text)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not sicurezza.is_admin() then
    raise exception 'Solo l''amministratore modifica il catalogo';
  end if;
  update anagrafica.catalogo_patologie_storico set motivo = left(trim(p_motivo), 1000)
   where id = (select max(id) from anagrafica.catalogo_patologie_storico
                where codice = p_codice and autore = auth.uid() and avvenuto_il > now() - interval '10 minutes')
     and motivo is null;
end;
$$;
grant execute on function api.motiva_modifica_catalogo(text, text) to authenticated;
