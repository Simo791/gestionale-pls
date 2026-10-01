-- =============================================================================
-- 1300 · Visita completa, registrazione rapida (urgenze), prescrizioni
--
-- Prescrizioni: il gestionale prepara un PROMEMORIA da ricopiare nel software di
-- ricetta elettronica (Sistema TS / SAR). Non è una ricetta valida e non viene
-- trasmesso a nessun sistema esterno.
-- I codici delle prestazioni NON sono scritti qui: si importano dal file ufficiale
-- del catalogo regionale (Calabria: DCA 442/2024 e 29/2025 di recepimento del
-- DM 25/11/2024), così restano quelli in vigore e aggiornabili.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Visita: anamnesi, parametri vitali, indicazioni ai genitori
-- -----------------------------------------------------------------------------
alter table clinica.visite
  add column tipo                  text not null default 'ambulatoriale'
                                   check (tipo in ('ambulatoriale', 'urgenza', 'bilancio_salute', 'controllo', 'domiciliare')),
  add column anamnesi              text,
  add column temperatura_c         numeric(3,1) check (temperatura_c between 30 and 45),
  add column frequenza_cardiaca    smallint check (frequenza_cardiaca between 20 and 260),
  add column frequenza_respiratoria smallint check (frequenza_respiratoria between 5 and 120),
  add column saturazione_o2        smallint check (saturazione_o2 between 50 and 100),
  add column pa_sistolica          smallint check (pa_sistolica between 40 and 250),
  add column pa_diastolica         smallint check (pa_diastolica between 20 and 160),
  add column indicazioni_genitori  text,
  add column prossimo_controllo    date,
  add constraint pa_coerente check (pa_sistolica is null or pa_diastolica is null or pa_sistolica > pa_diastolica);

-- -----------------------------------------------------------------------------
-- Registrazione rapida di un bambino (es. arriva in urgenza senza appuntamento):
-- paziente + eventuale genitore (riusato se già registrato con lo stesso CF).
-- -----------------------------------------------------------------------------
create or replace function api.registra_paziente_rapido(
  p_nome text, p_cognome text, p_codice_fiscale text, p_data_nascita date, p_sesso char(1),
  p_pediatra_id uuid, p_genitore jsonb default null
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_paziente uuid;
  v_tutore   uuid;
  v_cf       text := upper(trim(p_codice_fiscale));
begin
  if not sicurezza.is_staff() then
    raise exception 'Solo lo staff dello studio può registrare un paziente';
  end if;
  if v_cf !~ '^[A-Z0-9]{16}$' then
    raise exception 'Codice fiscale del bambino non valido';
  end if;
  if exists (select 1 from anagrafica.pazienti
             where studio_id = sicurezza.studio_id() and codice_fiscale_impronta = anagrafica.impronta_cf(v_cf)) then
    raise exception 'Bambino già registrato nello studio' using errcode = '23505';
  end if;

  v_paziente := api.registra_paziente(p_nome, p_cognome, v_cf, p_data_nascita, p_sesso, p_pediatra_id);

  if p_genitore is not null and coalesce(trim(p_genitore->>'codice_fiscale'), '') <> '' then
    select id into v_tutore from anagrafica.tutori
    where studio_id = sicurezza.studio_id()
      and codice_fiscale_impronta = anagrafica.impronta_cf(upper(trim(p_genitore->>'codice_fiscale')));
    if v_tutore is null then
      v_tutore := api.registra_tutore(p_genitore->>'nome', p_genitore->>'cognome',
        upper(trim(p_genitore->>'codice_fiscale')), p_genitore->>'email', nullif(trim(p_genitore->>'telefono'), ''));
    end if;
    insert into anagrafica.relazioni_tutela (paziente_id, tutore_id, tipo)
    values (v_paziente, v_tutore, coalesce(p_genitore->>'tipo', 'madre'));
  end if;
  return v_paziente;
end;
$$;
grant execute on function api.registra_paziente_rapido(text, text, text, date, char, uuid, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- Catalogo delle prestazioni prescrivibili (per studio, importato dal file ufficiale)
-- -----------------------------------------------------------------------------
create table anagrafica.catalogo_prestazioni (
  id                 uuid primary key default gen_random_uuid(),
  studio_id          uuid not null references anagrafica.studi(id),
  regione            text not null default 'CAL',
  codice_regionale   text not null,
  codice_nazionale   text,
  descrizione        text not null,
  branca             text,
  nota_erogabilita   text,
  attivo             boolean not null default true,
  versione           text not null,          -- es. "Catalogo Calabria DCA 29/2025"
  importato_il       timestamptz not null default now(),
  unique (studio_id, regione, codice_regionale)
);
create index on anagrafica.catalogo_prestazioni using gin (to_tsvector('italian', descrizione));
alter table anagrafica.catalogo_prestazioni enable row level security;
grant select on anagrafica.catalogo_prestazioni to authenticated;
create policy staff_legge_prestazioni on anagrafica.catalogo_prestazioni
  for select to authenticated using (studio_id = sicurezza.studio_id() and sicurezza.is_staff());

-- Importazione: solo il pediatra. Le righe non più presenti nel file diventano inattive
-- (le prescrizioni passate conservano codice e descrizione copiati).
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
  if sicurezza.ruolo() <> 'pediatra' then
    raise exception 'Solo il pediatra può importare il catalogo delle prestazioni';
  end if;
  if jsonb_typeof(p_righe) <> 'array' or jsonb_array_length(p_righe) = 0 then
    raise exception 'Nessuna riga da importare';
  end if;
  if coalesce(trim(p_versione), '') = '' then
    raise exception 'Indicare la versione del catalogo (es. atto regionale)';
  end if;

  insert into anagrafica.catalogo_prestazioni
    (studio_id, regione, codice_regionale, codice_nazionale, descrizione, branca, nota_erogabilita, attivo, versione, importato_il)
  select v_studio, p_regione, trim(r->>'codice_regionale'), nullif(trim(r->>'codice_nazionale'), ''),
         trim(r->>'descrizione'), nullif(trim(r->>'branca'), ''), nullif(trim(r->>'nota_erogabilita'), ''),
         true, trim(p_versione), now()
  from jsonb_array_elements(p_righe) r
  where coalesce(trim(r->>'codice_regionale'), '') <> '' and coalesce(trim(r->>'descrizione'), '') <> ''
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
grant execute on function api.importa_catalogo_prestazioni(jsonb, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Prescrizioni (promemoria): dato clinico, solo pseudo_id
-- -----------------------------------------------------------------------------
create table clinica.prescrizioni (
  id            uuid primary key default gen_random_uuid(),
  pseudo_id     uuid not null references clinica.cartelle(pseudo_id),
  visita_id     uuid references clinica.visite(id),
  pediatra_id   uuid not null default auth.uid(),
  data          timestamptz not null default now(),
  accesso       text not null default 'primo' check (accesso in ('primo', 'successivo')),
  priorita      text check (priorita in ('U', 'B', 'D', 'P')),
  quesito       text not null check (length(trim(quesito)) > 0),
  esenzione     text,
  -- [{codice_regionale, codice_nazionale, descrizione, branca, quantita}]
  prestazioni   jsonb not null check (jsonb_typeof(prestazioni) = 'array'
                                      and jsonb_array_length(prestazioni) between 1 and 8),
  note          text
);
create index on clinica.prescrizioni (pseudo_id, data desc);
alter table clinica.prescrizioni enable row level security;
grant select, insert, delete on clinica.prescrizioni to authenticated;
create policy pediatra_gestisce_prescrizioni on clinica.prescrizioni
  for all to authenticated
  using (sicurezza.puo_accedere_clinica(pseudo_id))
  with check (sicurezza.puo_accedere_clinica(pseudo_id));
create trigger audit after insert or update or delete on clinica.prescrizioni
  for each row execute function audit.traccia_modifica();
