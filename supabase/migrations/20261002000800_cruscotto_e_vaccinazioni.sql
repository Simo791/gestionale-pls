-- =============================================================================
-- 0800 · Vaccinazioni, calendario bilanci di salute, funzioni per il cruscotto
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Vaccinazioni (schema clinica, solo pseudo_id)
-- -----------------------------------------------------------------------------
create table clinica.vaccinazioni (
  id          uuid primary key default gen_random_uuid(),
  pseudo_id   uuid not null references clinica.cartelle(pseudo_id),
  vaccino     text not null,
  dose        smallint not null check (dose between 1 and 10),
  data        date not null,
  lotto       text,
  note        text,
  creato_il   timestamptz not null default now()
);
create index on clinica.vaccinazioni (pseudo_id, data);

alter table clinica.vaccinazioni enable row level security;
grant select, insert, update on clinica.vaccinazioni to authenticated;

create policy pediatra_gestisce_vaccinazioni on clinica.vaccinazioni
  for all to authenticated
  using (sicurezza.puo_accedere_clinica(pseudo_id))
  with check (sicurezza.puo_accedere_clinica(pseudo_id));

-- I genitori vedono il libretto vaccinale (con consenso ai dati sanitari).
create policy tutore_vede_vaccinazioni on clinica.vaccinazioni
  for select to authenticated
  using (sicurezza.tutore_vede_clinica(pseudo_id));

create trigger audit after insert or update or delete on clinica.vaccinazioni
  for each row execute function audit.traccia_modifica();

-- -----------------------------------------------------------------------------
-- Calendario dei bilanci di salute: età indicative, da adattare all'accordo
-- regionale. È configurazione, non dato clinico: la legge tutto lo staff.
-- -----------------------------------------------------------------------------
create table anagrafica.calendario_bilanci (
  eta_mesi     smallint primary key check (eta_mesi > 0),
  descrizione  text not null
);
alter table anagrafica.calendario_bilanci enable row level security;
grant select on anagrafica.calendario_bilanci to authenticated;
create policy staff_legge_calendario on anagrafica.calendario_bilanci
  for select to authenticated using (sicurezza.is_staff());

insert into anagrafica.calendario_bilanci (eta_mesi, descrizione) values
  (1,   'Primo bilancio (entro 45 giorni)'),
  (3,   'Bilancio 3 mesi'),
  (6,   'Bilancio 6 mesi'),
  (9,   'Bilancio 9 mesi'),
  (12,  'Bilancio 12 mesi'),
  (18,  'Bilancio 18 mesi'),
  (24,  'Bilancio 2 anni'),
  (36,  'Bilancio 3 anni'),
  (60,  'Bilancio 5 anni'),
  (96,  'Bilancio 8 anni'),
  (120, 'Bilancio 10 anni'),
  (144, 'Bilancio 12 anni');

-- -----------------------------------------------------------------------------
-- Bilanci di salute da programmare: scadenza entro p_giorni (o già passata da
-- meno di 60 giorni) e nessun appuntamento "bilancio_salute" vicino a quella data.
-- Dati organizzativi: accessibile a tutto lo staff, segreteria compresa.
-- -----------------------------------------------------------------------------
create or replace function api.bilanci_in_scadenza(p_giorni integer default 30)
returns table (paziente_id uuid, nome text, cognome text, data_nascita date,
               eta_mesi smallint, descrizione text, data_prevista date, in_ritardo boolean)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not sicurezza.is_staff() then
    raise exception 'Non autorizzato';
  end if;
  return query
  select p.id, p.nome, p.cognome, p.data_nascita, c.eta_mesi, c.descrizione,
         (p.data_nascita + make_interval(months => c.eta_mesi))::date as prevista,
         (p.data_nascita + make_interval(months => c.eta_mesi))::date < current_date
  from anagrafica.pazienti p
  cross join anagrafica.calendario_bilanci c
  where p.studio_id = sicurezza.studio_id()
    and p.stato = 'attivo'
    and (p.data_nascita + make_interval(months => c.eta_mesi))::date
        between current_date - 60 and current_date + p_giorni
    and not exists (
      select 1 from anagrafica.appuntamenti a
      where a.paziente_id = p.id
        and a.tipo = 'bilancio_salute'
        and a.stato in ('richiesto', 'confermato', 'svolto')
        and a.inizio::date between (p.data_nascita + make_interval(months => c.eta_mesi))::date - 45
                               and (p.data_nascita + make_interval(months => c.eta_mesi))::date + 60
    )
  order by prevista;
end;
$$;

-- -----------------------------------------------------------------------------
-- Consensi incompleti per le finalità essenziali, con i genitori che mancano.
-- -----------------------------------------------------------------------------
create or replace function api.consensi_incompleti()
returns table (paziente_id uuid, nome text, cognome text, finalita text,
               stato text, mancanti text[])
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not sicurezza.is_staff() then
    raise exception 'Non autorizzato';
  end if;
  return query
  select p.id, p.nome, p.cognome, f.finalita,
         sicurezza.stato_consenso(p.id, f.finalita),
         array(
           select t.nome || ' ' || t.cognome
           from anagrafica.relazioni_tutela r
           join anagrafica.tutori t on t.id = r.tutore_id
           where r.paziente_id = p.id
             and r.responsabilita_genitoriale
             and r.valida_dal <= current_date
             and (r.valida_al is null or r.valida_al >= current_date)
             and not exists (
               select 1 from anagrafica.consensi_correnti cc
               where cc.paziente_id = p.id and cc.tutore_id = r.tutore_id
                 and cc.finalita = f.finalita and cc.stato = 'concesso')
           order by t.cognome, t.nome
         )
  from anagrafica.pazienti p
  cross join (values ('dati_sanitari'), ('portale')) as f(finalita)
  where p.studio_id = sicurezza.studio_id()
    and p.stato = 'attivo'
    and sicurezza.stato_consenso(p.id, f.finalita) <> 'completo'
  order by p.cognome, p.nome, f.finalita;
end;
$$;

-- -----------------------------------------------------------------------------
-- Attività recente nello studio, dal registro di audit (solo pediatra con MFA).
-- Restituisce il nome del bambino coinvolto, risolto dallo pseudonimo.
-- -----------------------------------------------------------------------------
create or replace function api.attivita_recente(p_limite integer default 20)
returns table (avvenuto_il timestamptz, ruolo text, azione text, tabella text, paziente text)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not (sicurezza.ruolo() = 'pediatra' and sicurezza.mfa_ok()) then
    raise exception 'Solo il pediatra può consultare il registro';
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
$$;

-- -----------------------------------------------------------------------------
-- Lettura del codice fiscale in chiaro: solo staff, e ogni lettura è tracciata.
-- -----------------------------------------------------------------------------
create or replace function api.codice_fiscale(p_paziente_id uuid)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  v_cf     bytea;
  v_pseudo uuid;
begin
  if not sicurezza.is_staff() then
    raise exception 'Non autorizzato';
  end if;
  select p.codice_fiscale_cifrato, m.pseudo_id into v_cf, v_pseudo
  from anagrafica.pazienti p
  join pseudonimi.mappa m on m.paziente_id = p.id
  where p.id = p_paziente_id and p.studio_id = sicurezza.studio_id();
  if v_cf is null then
    raise exception 'Paziente non trovato';
  end if;
  perform audit.registra('LETTURA_CODICE_FISCALE', 'anagrafica.pazienti', p_paziente_id::text, v_pseudo);
  return extensions.pgp_sym_decrypt(v_cf, sicurezza.chiave_cf());
end;
$$;

grant execute on function
  api.bilanci_in_scadenza(integer),
  api.consensi_incompleti(),
  api.attivita_recente(integer),
  api.codice_fiscale(uuid)
to authenticated;
