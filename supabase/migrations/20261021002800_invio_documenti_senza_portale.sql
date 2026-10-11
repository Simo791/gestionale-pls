-- =============================================================================
-- 2800 · Niente portale genitori: i documenti di una visita si inviano
--        ai genitori via email o WhatsApp.
--
-- Come funziona l'invio (Linee guida del Garante sui referti online, 2009):
--  * i PDF si caricano in uno spazio privato (Storage, bucket «documenti»);
--  * al genitore arriva solo un link personale, valido 30 giorni, senza nomi né
--    dati sanitari nel testo del messaggio;
--  * per aprire i documenti serve un codice di verifica (la data di nascita del
--    bambino), con al massimo 5 tentativi; ogni ritiro è registrato;
--  * il link si può revocare in qualsiasi momento.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Portale genitori disattivato: niente ruolo «tutore», niente accesso dei genitori
-- -----------------------------------------------------------------------------
drop policy if exists tutore_vede_figli on anagrafica.pazienti;
drop policy if exists tutore_vede_se_stesso on anagrafica.tutori;
drop policy if exists tutore_vede_proprie_relazioni on anagrafica.relazioni_tutela;
drop policy if exists tutore_vede_propri_consensi on anagrafica.consensi;
drop policy if exists tutore_dichiara_propri_consensi on anagrafica.consensi;
drop policy if exists tutore_richiede_appuntamento on anagrafica.appuntamenti;
drop policy if exists tutore_vede_misurazioni on clinica.misurazioni;
drop policy if exists tutore_vede_vaccinazioni on clinica.vaccinazioni;

drop function if exists api.miei_figli();
drop function if exists api.appuntamenti_figlio(uuid);
drop function if exists api.portale_consensi();
drop function if exists api.segna_informativa_letta(uuid, text);
drop function if exists api.firma_consenso(uuid, text, text, text, integer, text);
drop function if exists api.portale_storico_figlio(uuid);
drop function if exists api.registro_accessi(uuid);
drop function if exists api.collega_account_tutore();
drop function if exists api.admin_account_genitori();
drop function if exists api.admin_scollega_genitore(uuid, boolean);
drop table if exists anagrafica.firme_consenso;
drop table if exists anagrafica.letture_informativa;

-- Il token dello staff resta com'era; nessun account viene più riconosciuto come genitore.
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

-- -----------------------------------------------------------------------------
-- 2. Consenso a ricevere i documenti via email / WhatsApp (al posto del portale)
-- -----------------------------------------------------------------------------
alter table anagrafica.consensi drop constraint consensi_finalita_check;
alter table anagrafica.consensi add constraint consensi_finalita_check
  check (finalita in ('dati_sanitari', 'portale', 'comunicazioni', 'condivisione_altro_genitore', 'whatsapp', 'invio_documenti'));
alter table anagrafica.informative drop constraint informative_finalita_check;
alter table anagrafica.informative add constraint informative_finalita_check
  check (finalita in ('dati_sanitari', 'portale', 'comunicazioni', 'condivisione_altro_genitore', 'whatsapp', 'invio_documenti'));

update anagrafica.informative set attiva = false where finalita in ('portale', 'condivisione_altro_genitore');
insert into anagrafica.informative (finalita, versione, titolo, testo) values
('invio_documenti', '2026-10', 'Invio dei documenti via email o WhatsApp',
 'Acconsenti a ricevere dallo studio i documenti delle visite di tuo figlio (referti, prescrizioni, certificati) all''indirizzo email o al numero WhatsApp che indichi.
Il messaggio non contiene nomi né informazioni sanitarie: contiene un link personale, valido 30 giorni, che per aprire i documenti chiede la data di nascita del bambino. Ogni apertura viene registrata e lo studio può disattivare il link in qualsiasi momento.
WhatsApp è un servizio di Meta e la posta elettronica transita su server di terzi: se preferisci, puoi ritirare i documenti in studio. Puoi revocare il consenso in qualsiasi momento.');

-- I consensi necessari sono solo quelli ai dati sanitari.
create or replace function api.consensi_incompleti()
returns table (paziente_id uuid, nome text, cognome text, finalita text, stato text, mancanti text[])
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
  cross join (values ('dati_sanitari')) as f(finalita)
  where p.studio_id = sicurezza.studio_id()
    and p.stato = 'attivo'
    and sicurezza.stato_consenso(p.id, f.finalita) <> 'completo'
  order by p.cognome, p.nome, f.finalita;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Registro degli invii
-- -----------------------------------------------------------------------------
create table anagrafica.invii_documenti (
  id                  uuid primary key default gen_random_uuid(),
  studio_id           uuid not null references anagrafica.studi(id),
  paziente_id         uuid references anagrafica.pazienti(id),
  allergo_paziente_id uuid references anagrafica.allergo_pazienti(id),
  tutore_id           uuid references anagrafica.tutori(id),
  canale              text not null check (canale in ('email', 'whatsapp')),
  destinatario        text not null check (char_length(destinatario) between 5 and 254),
  destinatario_nome   text check (char_length(destinatario_nome) <= 120),
  descrizione         text not null check (char_length(descrizione) between 3 and 200),
  documenti           jsonb not null default '[]'::jsonb check (jsonb_typeof(documenti) = 'array'),
  token_hash          text not null unique,
  scade_il            timestamptz not null,
  stato               text not null default 'preparato'
                      check (stato in ('preparato', 'pronto', 'inviato', 'consegnato_manualmente', 'errore', 'revocato')),
  errore              text,
  tentativi           integer not null default 0,
  ritiri              integer not null default 0,
  primo_ritiro_il     timestamptz,
  ultimo_ritiro_il    timestamptz,
  inviato_da          uuid not null default auth.uid(),
  creato_il           timestamptz not null default now(),
  check ((paziente_id is null) <> (allergo_paziente_id is null))
);
create index on anagrafica.invii_documenti (studio_id, creato_il desc);
create index on anagrafica.invii_documenti (paziente_id);
create index on anagrafica.invii_documenti (allergo_paziente_id);
alter table anagrafica.invii_documenti enable row level security;
grant select (id, studio_id, paziente_id, allergo_paziente_id, tutore_id, canale, destinatario, destinatario_nome, descrizione,
              documenti, scade_il, stato, errore, tentativi, ritiri, primo_ritiro_il, ultimo_ritiro_il, inviato_da, creato_il)
  on anagrafica.invii_documenti to authenticated;
create policy staff_vede_invii on anagrafica.invii_documenti for select to authenticated
  using (studio_id = sicurezza.studio_id() and (
    (paziente_id is not null and sicurezza.is_staff())
    or (allergo_paziente_id is not null and sicurezza.allergologia_ok())));
create trigger audit after insert or update or delete on anagrafica.invii_documenti
  for each row execute function audit.traccia_modifica();

-- Chi può inviare: chi può aprire la cartella (medico, sostituto in turno, amministratore)
-- o, per l'Allergologia, chi è abilitato al modulo.
create or replace function sicurezza.puo_inviare(p_paziente_id uuid, p_allergo_paziente_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select case
    when p_paziente_id is not null then sicurezza.puo_accedere_paziente(p_paziente_id)
    when p_allergo_paziente_id is not null then sicurezza.allergologia_ok() and exists (
      select 1 from anagrafica.allergo_pazienti a where a.id = p_allergo_paziente_id and a.studio_id = sicurezza.studio_id())
    else false end;
$$;

create or replace function api.prepara_invio(
  p_paziente_id uuid, p_allergo_paziente_id uuid, p_tutore_id uuid, p_canale text,
  p_destinatario text, p_destinatario_nome text, p_descrizione text, p_conferma boolean)
returns table (id uuid, token text, scade_il timestamptz)
language plpgsql security definer
set search_path = ''
as $$
declare
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
  v_dest  text := trim(coalesce(p_destinatario, ''));
  v_id    uuid;
  v_scade timestamptz := now() + interval '30 days';
begin
  if not sicurezza.mfa_ok() or not sicurezza.puo_inviare(p_paziente_id, p_allergo_paziente_id) then
    raise exception 'Solo il medico del bambino o l''amministratore invia i documenti clinici';
  end if;
  if not coalesce(p_conferma, false) then
    raise exception 'Conferma che il genitore ha chiesto o accettato di ricevere i documenti con questo canale';
  end if;
  if p_canale = 'email' then
    v_dest := lower(v_dest);
    if v_dest !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' then
      raise exception 'Indirizzo email non valido';
    end if;
  elsif p_canale = 'whatsapp' then
    v_dest := regexp_replace(v_dest, '[\s\-\.\(\)/]', '', 'g');
    if v_dest ~ '^00' then v_dest := '+' || substr(v_dest, 3); end if;
    if v_dest !~ '^\+' then v_dest := '+39' || v_dest; end if;
    if v_dest !~ '^\+[0-9]{8,15}$' then
      raise exception 'Numero di telefono non valido';
    end if;
  else
    raise exception 'Canale non valido';
  end if;
  if p_tutore_id is not null and not exists (
       select 1 from anagrafica.tutori t join anagrafica.relazioni_tutela r on r.tutore_id = t.id
       where t.id = p_tutore_id and r.paziente_id = p_paziente_id and t.studio_id = sicurezza.studio_id()
         and r.responsabilita_genitoriale and r.valida_dal <= current_date
         and (r.valida_al is null or r.valida_al >= current_date)) then
    raise exception 'Il genitore indicato non ha (più) la responsabilità genitoriale su questo bambino';
  end if;
  if p_tutore_id is not null and exists (
       select 1 from anagrafica.consensi_correnti c
       where c.paziente_id = p_paziente_id and c.tutore_id = p_tutore_id
         and c.finalita = 'invio_documenti' and c.stato in ('negato', 'revocato')) then
    raise exception 'Questo genitore ha negato o revocato il consenso all''invio dei documenti';
  end if;

  insert into anagrafica.invii_documenti (studio_id, paziente_id, allergo_paziente_id, tutore_id, canale, destinatario,
                                          destinatario_nome, descrizione, token_hash, scade_il)
  values (sicurezza.studio_id(), p_paziente_id, p_allergo_paziente_id, p_tutore_id, p_canale, v_dest,
          nullif(trim(p_destinatario_nome), ''), trim(p_descrizione), encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), v_scade)
  returning invii_documenti.id into v_id;
  return query select v_id, v_token, v_scade;
end;
$$;

-- Dopo il caricamento dei PDF: elenco dei file (solo nella cartella dell'invio).
create or replace function api.completa_invio(p_id uuid, p_documenti jsonb)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v anagrafica.invii_documenti;
  d jsonb;
begin
  select * into v from anagrafica.invii_documenti i where i.id = p_id;
  if v.id is null or v.inviato_da is distinct from auth.uid() or v.stato <> 'preparato' or not sicurezza.mfa_ok() then
    raise exception 'Invio non trovato';
  end if;
  if jsonb_typeof(p_documenti) <> 'array' or jsonb_array_length(p_documenti) = 0 or jsonb_array_length(p_documenti) > 10 then
    raise exception 'Da 1 a 10 documenti per invio';
  end if;
  for d in select * from jsonb_array_elements(p_documenti) loop
    if (d ->> 'percorso') is null or (d ->> 'percorso') not like v.studio_id::text || '/' || v.id::text || '/%'
       or (d ->> 'percorso') like '%..%' or coalesce(d ->> 'nome', '') !~ '^[A-Za-z0-9 ._()-]{1,120}\.pdf$' then
      raise exception 'Documento non valido';
    end if;
  end loop;
  update anagrafica.invii_documenti set documenti = p_documenti, stato = 'pronto' where id = p_id;
end;
$$;

-- Esito dell'invio: automatico (dalla funzione di invio) o manuale (email/WhatsApp aperti dallo studio).
create or replace function api.esito_invio(p_id uuid, p_stato text, p_errore text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if p_stato not in ('inviato', 'consegnato_manualmente', 'errore') then
    raise exception 'Stato non valido';
  end if;
  -- Dall'app si registra solo l'invio fatto a mano; «inviato» ed «errore» li scrive la funzione di invio.
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' and (p_stato <> 'consegnato_manualmente' or not sicurezza.mfa_ok()) then
    raise exception 'Stato non valido';
  end if;
  update anagrafica.invii_documenti set stato = p_stato, errore = left(p_errore, 300)
   where id = p_id and stato in ('pronto', 'errore')
     and (coalesce(auth.jwt() ->> 'role', '') = 'service_role' or inviato_da = auth.uid());
  if not found then
    raise exception 'Invio non trovato';
  end if;
end;
$$;

create or replace function api.revoca_invio(p_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v anagrafica.invii_documenti;
begin
  select * into v from anagrafica.invii_documenti i where i.id = p_id and i.studio_id = sicurezza.studio_id();
  if v.id is null or not sicurezza.mfa_ok() or not (sicurezza.puo_inviare(v.paziente_id, v.allergo_paziente_id) or sicurezza.admin_attivo()) then
    raise exception 'Invio non trovato';
  end if;
  update anagrafica.invii_documenti set stato = 'revocato' where id = p_id;
end;
$$;

-- Ritiro: SOLO la funzione pubblica di ritiro (service role) la chiama.
-- Codice = data di nascita del bambino (ggmmaaaa); 5 tentativi.
create or replace function api.ritiro_documenti(p_token text, p_codice text, p_ip text default null)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v anagrafica.invii_documenti;
  v_nascita date;
  v_codice text := regexp_replace(coalesce(p_codice, ''), '\D', '', 'g');
begin
  -- Riga bloccata: tentativi in parallelo non superano il limite.
  select * into v from anagrafica.invii_documenti i
  where i.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
  for update;
  if v.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'link_non_valido');
  end if;
  if v.stato = 'revocato' then
    return jsonb_build_object('ok', false, 'motivo', 'revocato');
  end if;
  if v.scade_il < now() then
    return jsonb_build_object('ok', false, 'motivo', 'scaduto');
  end if;
  if v.stato not in ('pronto', 'inviato', 'consegnato_manualmente') then
    return jsonb_build_object('ok', false, 'motivo', 'non_disponibile');
  end if;
  if v.tentativi >= 5 then
    return jsonb_build_object('ok', false, 'motivo', 'bloccato');
  end if;
  select coalesce(p.data_nascita, a.data_nascita) into v_nascita
  from anagrafica.invii_documenti i
  left join anagrafica.pazienti p on p.id = i.paziente_id
  left join anagrafica.allergo_pazienti a on a.id = i.allergo_paziente_id
  where i.id = v.id;
  if v_codice <> to_char(v_nascita, 'DDMMYYYY') then
    update anagrafica.invii_documenti set tentativi = tentativi + 1 where id = v.id;
    perform audit.registra('RITIRO_DOCUMENTI_CODICE_ERRATO', 'anagrafica.invii_documenti', v.id::text, null,
                           jsonb_build_object('ip', left(p_ip, 64)));
    return jsonb_build_object('ok', false, 'motivo', case when v.tentativi + 1 >= 5 then 'bloccato' else 'codice_errato' end,
                              'tentativi_rimasti', greatest(0, 4 - v.tentativi));
  end if;
  update anagrafica.invii_documenti
     set ritiri = ritiri + 1, primo_ritiro_il = coalesce(primo_ritiro_il, now()), ultimo_ritiro_il = now()
   where id = v.id;
  perform audit.registra('RITIRO_DOCUMENTI', 'anagrafica.invii_documenti', v.id::text, null, jsonb_build_object('ip', left(p_ip, 64)));
  return jsonb_build_object('ok', true, 'descrizione', v.descrizione, 'scade_il', v.scade_il, 'documenti', v.documenti);
end;
$$;

-- Dati per la funzione di invio (service role): verifica che il token sia proprio di questo invio
-- e che chi chiede l'invio sia chi l'ha preparato.
create or replace function api.dati_invio(p_id uuid, p_token text, p_utente uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object('canale', i.canale, 'destinatario', i.destinatario, 'scade_il', i.scade_il,
                            'nome_studio', s.nome, 'integrazione', coalesce(to_jsonb(g) - 'studio_id', 'null'::jsonb))
  from anagrafica.invii_documenti i
  join anagrafica.studi s on s.id = i.studio_id
  left join lateral (select x.attiva, x.impostazioni from anagrafica.integrazioni x
                     where x.studio_id = i.studio_id and x.tipo = i.canale) g on true
  where i.id = p_id and i.inviato_da = p_utente and i.stato = 'pronto'
    and i.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
$$;

do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where (n.nspname = 'api' and p.proname in ('prepara_invio', 'completa_invio', 'esito_invio', 'revoca_invio', 'ritiro_documenti', 'dati_invio'))
              or (n.nspname = 'sicurezza' and p.proname = 'puo_inviare') loop
    execute format('revoke execute on function %s from public, anon', f);
  end loop;
end;
$$;
grant execute on function api.prepara_invio(uuid, uuid, uuid, text, text, text, text, boolean), api.completa_invio(uuid, jsonb),
  api.esito_invio(uuid, text, text), api.revoca_invio(uuid), sicurezza.puo_inviare(uuid, uuid) to authenticated;
revoke execute on function api.ritiro_documenti(text, text, text), api.dati_invio(uuid, text, uuid) from authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant usage on schema api to service_role;
    grant execute on function api.ritiro_documenti(text, text, text), api.esito_invio(uuid, text, text), api.dati_invio(uuid, text, uuid) to service_role;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 4. Spazio privato per i PDF (Supabase Storage). Lo staff carica solo nella
--    cartella del proprio studio; nessuno legge dal browser: i link temporanei
--    li crea la funzione di ritiro dopo il codice di verifica.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage')
     and exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'storage' and c.relname = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('documenti', 'documenti', false, 10485760, array['application/pdf'])
    on conflict (id) do nothing;
    execute $p$create policy staff_carica_documenti on storage.objects for insert to authenticated
      with check (bucket_id = 'documenti'
                  and (storage.foldername(name))[1] = sicurezza.studio_id()::text
                  and exists (select 1 from anagrafica.invii_documenti i
                              where i.id::text = (storage.foldername(name))[2]
                                and i.inviato_da = auth.uid() and i.stato = 'preparato'))$p$;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Integrazione email (invio automatico dei link ai documenti)
-- -----------------------------------------------------------------------------
alter table anagrafica.integrazioni drop constraint integrazioni_tipo_check;
alter table anagrafica.integrazioni add constraint integrazioni_tipo_check check (tipo in ('whatsapp', 'google_calendar', 'email'));

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
    when 'email' then array['indirizzo_mittente', 'nome_mittente', 'modalita']
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
  perform audit.registra('IMPOSTA_INTEGRAZIONE', 'anagrafica.integrazioni', p_tipo, null, jsonb_build_object('attiva', p_attiva));
end;
$$;
