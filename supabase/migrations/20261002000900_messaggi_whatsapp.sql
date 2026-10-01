-- =============================================================================
-- 0900 · Coda dei messaggi ai genitori (WhatsApp)
-- -----------------------------------------------------------------------------
-- Il database decide COSA inviare e QUANDO, scrivendo righe in una coda.
-- Una Edge Function (supabase/functions/invia-messaggi) legge la coda ogni pochi
-- minuti e invia tramite WhatsApp Cloud API. Nei messaggi: nessun dato sanitario,
-- nessun nome del bambino, nessun codice fiscale (policy Meta + minimizzazione GDPR).
--
-- Regole:
--  * CONFERMA: quando lo staff inserisce un appuntamento già confermato, oppure
--    conferma una richiesta del genitore, oppure sposta un appuntamento confermato.
--  * PROMEMORIA: per i tipi indicati in regole_promemoria (es. bilancio di salute
--    a 30 e 5 giorni), alle 10:00 ora italiana del giorno previsto.
--  * Si scrive solo ai genitori con responsabilità, telefono e consenso "whatsapp".
--  * Annullamento o spostamento dell'appuntamento: i messaggi non ancora inviati
--    vengono annullati (e, se spostato, riprogrammati).
-- =============================================================================

create table anagrafica.regole_promemoria (
  tipo_appuntamento  text not null check (tipo_appuntamento in
                       ('visita', 'bilancio_salute', 'vaccino', 'urgenza', 'certificato')),
  giorni_prima       smallint not null check (giorni_prima between 1 and 90),
  primary key (tipo_appuntamento, giorni_prima)
);
alter table anagrafica.regole_promemoria enable row level security;
grant select on anagrafica.regole_promemoria to authenticated;
grant insert, delete on anagrafica.regole_promemoria to authenticated;
create policy staff_legge_regole on anagrafica.regole_promemoria
  for select to authenticated using (sicurezza.is_staff());
create policy pediatra_gestisce_regole on anagrafica.regole_promemoria
  for all to authenticated
  using (sicurezza.ruolo() = 'pediatra') with check (sicurezza.ruolo() = 'pediatra');

-- Controllo annuale (bilancio di salute): un mese prima e 5 giorni prima.
insert into anagrafica.regole_promemoria values ('bilancio_salute', 30), ('bilancio_salute', 5);

create table anagrafica.messaggi_outbox (
  id               uuid primary key default gen_random_uuid(),
  studio_id        uuid not null references anagrafica.studi(id),
  appuntamento_id  uuid not null references anagrafica.appuntamenti(id) on delete cascade,
  tutore_id        uuid not null references anagrafica.tutori(id),
  canale           text not null default 'whatsapp' check (canale in ('whatsapp')),
  tipo             text not null check (tipo in ('conferma', 'promemoria')),
  giorni_prima     smallint not null default 0,
  programmato_per  timestamptz not null,
  stato            text not null default 'in_coda'
                   check (stato in ('in_coda', 'inviato', 'simulato', 'errore', 'annullato')),
  tentativi        smallint not null default 0,
  ultimo_errore    text,
  id_messaggio     text,          -- id restituito da WhatsApp
  inviato_il       timestamptz,
  creato_il        timestamptz not null default now()
);
-- Un solo messaggio "vivo" per appuntamento, genitore, tipo e anticipo.
create unique index messaggi_unico_attivo on anagrafica.messaggi_outbox
  (appuntamento_id, tutore_id, tipo, giorni_prima) where stato <> 'annullato';
create index messaggi_da_inviare on anagrafica.messaggi_outbox (programmato_per)
  where stato = 'in_coda';

alter table anagrafica.messaggi_outbox enable row level security;
grant select on anagrafica.messaggi_outbox to authenticated;
-- Lo staff vede lo stato degli invii del proprio studio; scrive solo il database.
create policy staff_vede_messaggi on anagrafica.messaggi_outbox
  for select to authenticated
  using (sicurezza.is_staff() and studio_id = sicurezza.studio_id());

create trigger audit after insert or update or delete on anagrafica.messaggi_outbox
  for each row execute function audit.traccia_modifica();

-- -----------------------------------------------------------------------------
-- Accoda i messaggi per un appuntamento (conferma e/o promemoria).
-- -----------------------------------------------------------------------------
-- Genitori a cui si può scrivere su WhatsApp per un bambino:
-- responsabilità valida, telefono presente e consenso "whatsapp" concesso.
create or replace function anagrafica.destinatari_whatsapp(p_paziente_id uuid)
returns table (tutore_id uuid)
language sql stable security definer
set search_path = ''
as $$
  select r.tutore_id
  from anagrafica.relazioni_tutela r
  join anagrafica.tutori t on t.id = r.tutore_id
  where r.paziente_id = p_paziente_id
    and r.responsabilita_genitoriale
    and r.valida_dal <= current_date
    and (r.valida_al is null or r.valida_al >= current_date)
    and coalesce(t.telefono, '') <> ''
    and exists (select 1 from anagrafica.consensi_correnti c
                where c.paziente_id = r.paziente_id and c.tutore_id = r.tutore_id
                  and c.finalita = 'whatsapp' and c.stato = 'concesso');
$$;

-- Accoda conferma (se richiesta) e promemoria per un appuntamento CONFERMATO e futuro.
create or replace function anagrafica.accoda_messaggi(p_app anagrafica.appuntamenti, p_conferma boolean)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if p_app.stato <> 'confermato' or p_app.inizio <= now() then
    return;
  end if;

  if p_conferma then
    insert into anagrafica.messaggi_outbox (studio_id, appuntamento_id, tutore_id, tipo, giorni_prima, programmato_per)
    select p_app.studio_id, p_app.id, d.tutore_id, 'conferma', 0, now()
    from anagrafica.destinatari_whatsapp(p_app.paziente_id) d
    on conflict do nothing;
  end if;

  -- Promemoria alle 10:00 (ora italiana) del giorno "giorni_prima" prima, se ancora nel futuro
  insert into anagrafica.messaggi_outbox (studio_id, appuntamento_id, tutore_id, tipo, giorni_prima, programmato_per)
  select p_app.studio_id, p_app.id, d.tutore_id, 'promemoria', r.giorni_prima, q.quando
  from anagrafica.regole_promemoria r
  cross join anagrafica.destinatari_whatsapp(p_app.paziente_id) d
  cross join lateral (
    select (((p_app.inizio at time zone 'Europe/Rome')::date - r.giorni_prima) + time '10:00')
             at time zone 'Europe/Rome' as quando
  ) q
  where r.tipo_appuntamento = p_app.tipo
    and q.quando > now()
  on conflict do nothing;
end;
$$;

create or replace function anagrafica.messaggi_su_appuntamento()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- Un appuntamento nasce confermato solo se lo inserisce lo staff: le richieste
    -- dei genitori (stato "richiesto") ricevono i messaggi al momento della conferma.
    perform anagrafica.accoda_messaggi(new, true);
    return new;
  end if;

  -- Annullato, svolto o spostato: i messaggi non ancora partiti non servono più
  if new.stato in ('annullato', 'svolto', 'non_presentato') or new.inizio is distinct from old.inizio then
    update anagrafica.messaggi_outbox
    set stato = 'annullato'
    where appuntamento_id = new.id and stato = 'in_coda';
  end if;

  -- Appena confermato, oppure spostato restando confermato: conferma + promemoria
  if new.stato = 'confermato'
     and (old.stato is distinct from 'confermato' or new.inizio is distinct from old.inizio) then
    perform anagrafica.accoda_messaggi(new, true);
  end if;
  return new;
end;
$$;

create trigger messaggi after insert or update of stato, inizio on anagrafica.appuntamenti
  for each row execute function anagrafica.messaggi_su_appuntamento();

-- -----------------------------------------------------------------------------
-- Per la Edge Function (chiave service_role): messaggi da inviare con i dati
-- necessari a comporli. Nessun dato clinico, nessun nome del bambino.
-- -----------------------------------------------------------------------------
-- Stanno nello schema api (già esposto) ma sono eseguibili SOLO da service_role.
grant usage on schema api to service_role;

create or replace function api.invio_messaggi_dovuti(p_limite integer default 50)
returns table (
  id uuid, tipo text, giorni_prima smallint, tentativi smallint,
  telefono text, nome_genitore text,
  studio_nome text, studio_indirizzo text, studio_telefono text,
  inizio timestamptz, fine timestamptz
)
language sql stable security definer
set search_path = ''
as $$
  select m.id, m.tipo, m.giorni_prima, m.tentativi,
         t.telefono, t.nome,
         s.nome, s.indirizzo, s.telefono,
         a.inizio, a.fine
  from anagrafica.messaggi_outbox m
  join anagrafica.tutori t on t.id = m.tutore_id
  join anagrafica.studi s on s.id = m.studio_id
  join anagrafica.appuntamenti a on a.id = m.appuntamento_id
  where m.stato = 'in_coda'
    and m.programmato_per <= now()
    and m.tentativi < 5
    and a.stato = 'confermato'
  order by m.programmato_per
  limit p_limite;
$$;

create or replace function api.invio_esito_messaggio(p_id uuid, p_stato text, p_id_messaggio text, p_errore text)
returns void
language sql security definer
set search_path = ''
as $$
  update anagrafica.messaggi_outbox
  set stato = case when p_stato = 'errore' and tentativi + 1 < 5 then 'in_coda' else p_stato end,
      tentativi = tentativi + case when p_stato = 'errore' then 1 else 0 end,
      id_messaggio = coalesce(p_id_messaggio, id_messaggio),
      ultimo_errore = p_errore,
      inviato_il = case when p_stato in ('inviato', 'simulato') then now() else inviato_il end,
      -- dopo un errore riprova tra 10 minuti
      programmato_per = case when p_stato = 'errore' then now() + interval '10 minutes' else programmato_per end
  where id = p_id;
$$;

revoke all on function api.invio_messaggi_dovuti(integer), api.invio_esito_messaggio(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function api.invio_messaggi_dovuti(integer), api.invio_esito_messaggio(uuid, text, text, text)
  to service_role;
