-- =============================================================================
-- 0400 · Audit log non ripudiabile
-- Ogni evento contiene l'hash dell'evento precedente: modificare o cancellare
-- una riga rompe la catena da quel punto in poi, e verifica_catena() lo rileva.
-- Per non duplicare dati sanitari, il registro salva QUALI campi sono cambiati
-- e un'impronta della riga, non i valori.
-- =============================================================================

create table audit.eventi (
  id               bigint primary key,
  avvenuto_il      timestamptz not null,
  actor_id         uuid,
  ruolo            text not null,
  azione           text not null,
  tabella          text,
  record_id        text,
  pseudo_id        uuid,
  dettagli         jsonb not null default '{}',
  ip               text,
  hash_precedente  text not null,
  hash             text not null unique
);
create sequence audit.eventi_id_seq owned by audit.eventi.id;
create index on audit.eventi (pseudo_id, avvenuto_il desc) where pseudo_id is not null;
create index on audit.eventi (actor_id, avvenuto_il desc);

revoke all on audit.eventi from public, anon, authenticated;
revoke all on sequence audit.eventi_id_seq from public, anon, authenticated;

-- Hash di un evento: stessa formula in scrittura e in verifica.
-- Il timestamp è formattato in UTC per non dipendere dal fuso della sessione.
create or replace function audit.calcola_hash(
  p_prec text, p_id bigint, p_quando timestamptz, p_actor uuid, p_ruolo text,
  p_azione text, p_tabella text, p_record text, p_pseudo uuid, p_dettagli jsonb, p_ip text
)
returns text
language sql immutable
set search_path = ''
as $$
  select encode(extensions.digest(convert_to(concat_ws('|',
    p_prec,
    p_id::text,
    to_char(p_quando at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    coalesce(p_actor::text, '-'),
    p_ruolo,
    p_azione,
    coalesce(p_tabella, '-'),
    coalesce(p_record, '-'),
    coalesce(p_pseudo::text, '-'),
    p_dettagli::text,
    coalesce(p_ip, '-')
  ), 'UTF8'), 'sha256'), 'hex');
$$;

-- Unico punto di scrittura del registro.
-- Il lock serializza le scritture così la catena non ha mai due "ultimi" eventi.
create or replace function audit.registra(
  p_azione text,
  p_tabella text default null,
  p_record_id text default null,
  p_pseudo_id uuid default null,
  p_dettagli jsonb default '{}'
)
returns bigint
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id    bigint;
  v_prec  text;
  v_ora   timestamptz := clock_timestamp();
  v_actor uuid := auth.uid();
  v_ruolo text := sicurezza.ruolo();
  v_ip    text := nullif(split_part(
            coalesce(current_setting('request.headers', true), '{}')::jsonb ->> 'x-forwarded-for',
            ',', 1), '');
begin
  perform pg_advisory_xact_lock(hashtext('audit.eventi'));

  select e.hash into v_prec from audit.eventi e order by e.id desc limit 1;
  v_prec := coalesce(v_prec, 'GENESI');
  v_id := nextval('audit.eventi_id_seq');

  insert into audit.eventi (id, avvenuto_il, actor_id, ruolo, azione, tabella, record_id,
                            pseudo_id, dettagli, ip, hash_precedente, hash)
  values (v_id, v_ora, v_actor, v_ruolo, p_azione, p_tabella, p_record_id,
          p_pseudo_id, coalesce(p_dettagli, '{}'), v_ip, v_prec,
          audit.calcola_hash(v_prec, v_id, v_ora, v_actor, v_ruolo, p_azione, p_tabella,
                             p_record_id, p_pseudo_id, coalesce(p_dettagli, '{}'), v_ip));
  return v_id;
end;
$$;

-- Il registro non si modifica e non si cancella, nemmeno con permessi di tabella.
create or replace function audit.blocca_modifiche()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Il registro di audit è in sola aggiunta: % non consentito', tg_op;
end;
$$;

create trigger solo_aggiunta
before update or delete on audit.eventi
for each row execute function audit.blocca_modifiche();

create trigger niente_truncate
before truncate on audit.eventi
for each statement execute function audit.blocca_modifiche();

-- -----------------------------------------------------------------------------
-- Trigger generico per le tabelle sensibili
-- -----------------------------------------------------------------------------
create or replace function audit.traccia_modifica()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_nuovo   jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_vecchio jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_riga    jsonb := coalesce(v_nuovo, v_vecchio);
  v_campi   text[];
begin
  if tg_op = 'UPDATE' then
    select coalesce(array_agg(k order by k), '{}') into v_campi
    from jsonb_object_keys(v_nuovo) k
    where v_nuovo -> k is distinct from v_vecchio -> k;
    if cardinality(v_campi) = 0 then
      return new;  -- nessun cambiamento reale
    end if;
  end if;

  perform audit.registra(
    tg_op,
    tg_table_schema || '.' || tg_table_name,
    coalesce(v_riga ->> 'id', v_riga ->> 'pseudo_id', v_riga ->> 'paziente_id'),
    nullif(v_riga ->> 'pseudo_id', '')::uuid,
    jsonb_build_object(
      'campi', to_jsonb(v_campi),
      'impronta_riga', encode(extensions.digest(coalesce(v_nuovo, v_vecchio)::text, 'sha256'), 'hex')
    )
  );
  return coalesce(new, old);
end;
$$;

-- -----------------------------------------------------------------------------
-- Verifica della catena: ricalcola ogni hash in ordine.
-- -----------------------------------------------------------------------------
create or replace function audit.verifica_catena()
returns table (eventi_verificati bigint, primo_evento_non_valido bigint)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  e       record;
  v_prec  text := 'GENESI';
  v_n     bigint := 0;
begin
  for e in select * from audit.eventi order by id loop
    if e.hash_precedente <> v_prec
       or e.hash <> audit.calcola_hash(e.hash_precedente, e.id, e.avvenuto_il, e.actor_id,
                                       e.ruolo, e.azione, e.tabella, e.record_id,
                                       e.pseudo_id, e.dettagli, e.ip) then
      eventi_verificati := v_n;
      primo_evento_non_valido := e.id;
      return next;
      return;
    end if;
    v_prec := e.hash;
    v_n := v_n + 1;
  end loop;
  eventi_verificati := v_n;
  primo_evento_non_valido := null;
  return next;
end;
$$;

-- Hash dell'ultimo evento: è il valore da "ancorare" ogni notte fuori dal database.
create or replace function audit.hash_di_chiusura()
returns table (ultimo_id bigint, hash text, calcolato_il timestamptz)
language sql stable security definer
set search_path = ''
as $$
  select e.id, e.hash, now() from audit.eventi e order by e.id desc limit 1;
$$;
