-- =============================================================================
-- 0300 · Pseudonimi e schema clinica
-- I dati clinici usano solo pseudo_id. La mappa paziente ↔ pseudo_id sta nello
-- schema "pseudonimi", su cui nessun ruolo applicativo ha permessi: la leggono
-- solo funzioni SECURITY DEFINER che controllano chi chiede.
-- =============================================================================

create table pseudonimi.mappa (
  paziente_id  uuid primary key references anagrafica.pazienti(id) on delete restrict,
  pseudo_id    uuid not null unique default gen_random_uuid(),
  creato_il    timestamptz not null default now()
);
revoke all on pseudonimi.mappa from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Tabelle cliniche: nessun nome, codice fiscale, contatto o data di nascita.
-- -----------------------------------------------------------------------------
create table clinica.cartelle (
  pseudo_id           uuid primary key references pseudonimi.mappa(pseudo_id),
  sesso               char(1) not null check (sesso in ('M', 'F')),
  gruppo_sanguigno    text,
  allergie            text[] not null default '{}',
  patologie_croniche  text[] not null default '{}',
  note_anamnesi       text,
  aggiornata_il       timestamptz not null default now()
);

create table clinica.visite (
  id               uuid primary key default gen_random_uuid(),
  pseudo_id        uuid not null references clinica.cartelle(pseudo_id),
  pediatra_id      uuid not null default auth.uid(),
  appuntamento_id  uuid,          -- nessuna FK verso anagrafica: gli schemi restano separati
  data             timestamptz not null default now(),
  motivo           text not null,
  esame_obiettivo  text,
  diagnosi_icd9cm  text[] not null default '{}',
  terapia          text
);
create index on clinica.visite (pseudo_id, data desc);

-- L'età in giorni è calcolata dal frontend (che conosce la data di nascita):
-- così lo schema clinica non contiene date di nascita.
create table clinica.misurazioni (
  id                        uuid primary key default gen_random_uuid(),
  pseudo_id                 uuid not null references clinica.cartelle(pseudo_id),
  visita_id                 uuid references clinica.visite(id),
  eta_giorni                integer not null check (eta_giorni between 0 and 6600),
  peso_kg                   numeric(5,2) check (peso_kg > 0 and peso_kg < 200),
  altezza_cm                numeric(5,1) check (altezza_cm > 20 and altezza_cm < 230),
  circonferenza_cranica_cm  numeric(4,1) check (circonferenza_cranica_cm > 20 and circonferenza_cranica_cm < 70),
  bmi                       numeric(4,1) generated always as (
                              case when peso_kg is not null and altezza_cm is not null
                                   then round(peso_kg / ((altezza_cm / 100) ^ 2), 1) end
                            ) stored,
  creato_il                 timestamptz not null default now(),
  check (peso_kg is not null or altezza_cm is not null or circonferenza_cranica_cm is not null)
);
create index on clinica.misurazioni (pseudo_id, eta_giorni);

-- -----------------------------------------------------------------------------
-- Alla registrazione di un bambino: crea pseudonimo e cartella vuota.
-- -----------------------------------------------------------------------------
create or replace function pseudonimi.crea_per_paziente()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  nuovo_pseudo uuid;
begin
  insert into pseudonimi.mappa (paziente_id) values (new.id)
  returning pseudo_id into nuovo_pseudo;
  insert into clinica.cartelle (pseudo_id, sesso) values (nuovo_pseudo, new.sesso);
  return new;
end;
$$;

create trigger crea_pseudonimo
after insert on anagrafica.pazienti
for each row execute function pseudonimi.crea_per_paziente();

-- -----------------------------------------------------------------------------
-- Funzioni di controllo accesso (usate dalle policy RLS)
-- -----------------------------------------------------------------------------

-- Pediatra titolare, o sostituto nel periodo di sostituzione, con MFA attiva.
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
               and current_date between s.dal and s.al
           )
         )
     );
$$;

-- L'utente è un tutore con responsabilità genitoriale valida e consenso al portale.
create or replace function sicurezza.tutore_di(p_paziente_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select sicurezza.ruolo() = 'tutore'
     and exists (
       select 1
       from anagrafica.relazioni_tutela r
       join anagrafica.tutori t on t.id = r.tutore_id
       where r.paziente_id = p_paziente_id
         and t.utente_id = auth.uid()
         and r.responsabilita_genitoriale
         and r.valida_dal <= current_date
         and (r.valida_al is null or r.valida_al >= current_date)
         and exists (
           select 1 from anagrafica.consensi_correnti c
           where c.paziente_id = r.paziente_id
             and c.tutore_id = r.tutore_id
             and c.finalita = 'portale'
             and c.stato = 'concesso'
         )
     );
$$;

create or replace function sicurezza.puo_accedere_clinica(p_pseudo_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from pseudonimi.mappa m
    where m.pseudo_id = p_pseudo_id
      and sicurezza.puo_accedere_paziente(m.paziente_id)
  );
$$;

-- Stato del consenso per un bambino e una finalità:
--   'completo'  tutti i tutori con responsabilità hanno concesso
--   'parziale'  almeno uno ha concesso, non tutti
--   'assente'   nessuno ha concesso
create or replace function sicurezza.stato_consenso(p_paziente_id uuid, p_finalita text)
returns text
language sql stable security definer
set search_path = ''
as $$
  with aventi_diritto as (
    select r.tutore_id
    from anagrafica.relazioni_tutela r
    where r.paziente_id = p_paziente_id
      and r.responsabilita_genitoriale
      and r.valida_dal <= current_date
      and (r.valida_al is null or r.valida_al >= current_date)
  ),
  concessi as (
    select c.tutore_id
    from anagrafica.consensi_correnti c
    join aventi_diritto a using (tutore_id)
    where c.paziente_id = p_paziente_id
      and c.finalita = p_finalita
      and c.stato = 'concesso'
  )
  select case
    when (select count(*) from concessi) = 0 then 'assente'
    when (select count(*) from concessi) = (select count(*) from aventi_diritto) then 'completo'
    else 'parziale'
  end;
$$;

-- I tutori vedono una parte della clinica (es. curve di crescita) solo se
-- esiste il consenso al trattamento dei dati sanitari.
create or replace function sicurezza.tutore_vede_clinica(p_pseudo_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from pseudonimi.mappa m
    where m.pseudo_id = p_pseudo_id
      and sicurezza.tutore_di(m.paziente_id)
      and sicurezza.stato_consenso(m.paziente_id, 'dati_sanitari') <> 'assente'
  );
$$;

grant execute on function
  sicurezza.puo_accedere_paziente(uuid), sicurezza.tutore_di(uuid),
  sicurezza.puo_accedere_clinica(uuid), sicurezza.tutore_vede_clinica(uuid),
  sicurezza.stato_consenso(uuid, text)
to authenticated;
