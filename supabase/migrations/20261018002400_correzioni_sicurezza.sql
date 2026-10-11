-- =============================================================================
-- 2400 · Correzioni di sicurezza emerse dalla revisione del codice
-- =============================================================================

-- Amministratore che è anche pediatra: l'unico che governa ruoli clinici e cataloghi.
create or replace function sicurezza.is_admin_pediatra()
returns boolean
language sql stable
set search_path = ''
as $$
  select sicurezza.is_admin() and sicurezza.ruolo() = 'pediatra';
$$;
grant execute on function sicurezza.is_admin_pediatra() to authenticated;

-- -----------------------------------------------------------------------------
-- 1. Allergologia: l'essere amministratore non apre i dati clinici a segreteria o
--    sostituto. Accedono i membri accettati e gli amministratori pediatri o allergologi.
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
         and (m.allergologia or (m.amministratore and m.ruolo in ('pediatra', 'allergologo')))
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
begin
  select m.ruolo, m.studio_id, m.amministratore,
         s.allergologia_attiva and m.ruolo <> 'segreteria'
           and (m.allergologia or (m.amministratore and m.ruolo in ('pediatra', 'allergologo')))
    into v_ruolo, v_studio, v_admin, v_allerg
  from anagrafica.membri_studio m
  join anagrafica.studi s on s.id = m.studio_id
  where m.utente_id = v_utente and m.attivo;

  if v_ruolo is null and exists (select 1 from anagrafica.tutori t where t.utente_id = v_utente) then
    v_ruolo := 'tutore';
  end if;

  v_claims := jsonb_set(v_claims, '{app_ruolo}', to_jsonb(coalesce(v_ruolo, 'nessuno')));
  v_claims := jsonb_set(v_claims, '{app_admin}', to_jsonb(coalesce(v_admin, false)));
  v_claims := jsonb_set(v_claims, '{app_allergologia}', to_jsonb(coalesce(v_allerg, false)));
  if v_studio is not null then
    v_claims := jsonb_set(v_claims, '{app_studio_id}', to_jsonb(v_studio));
  else
    v_claims := v_claims - 'app_studio_id';
  end if;

  return jsonb_set(event, '{claims}', v_claims);
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Amministratori: chi non è pediatra non può togliere il ruolo a un pediatra né
--    disattivarlo; lo studio deve avere sempre almeno un pediatra amministratore attivo.
-- -----------------------------------------------------------------------------
create or replace function api.imposta_amministratore(p_utente uuid, p_amministratore boolean)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_studio uuid := sicurezza.studio_id();
  v_ruolo  text;
begin
  if not sicurezza.is_admin() or not sicurezza.mfa_ok() then
    raise exception 'Solo un amministratore dello studio nomina gli amministratori';
  end if;
  if p_utente = auth.uid() and not p_amministratore then
    raise exception 'Non puoi revocare a te stesso il ruolo di amministratore';
  end if;
  select ruolo into v_ruolo from anagrafica.membri_studio where utente_id = p_utente and studio_id = v_studio and attivo;
  if v_ruolo is null then
    raise exception 'Membro non trovato o disattivato';
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
    case when p_amministratore then 'Esci e rientra per vedere le funzioni di amministrazione (Account).' else null end,
    '#/account');
end;
$$;

create or replace function api.imposta_membro(p_utente uuid, p_attivo boolean, p_nome text default null, p_cognome text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_ruolo text;
  v_admin boolean;
begin
  if not sicurezza.is_admin() then
    raise exception 'Solo l''amministratore dello studio gestisce lo staff';
  end if;
  if p_utente = auth.uid() then
    raise exception 'Non puoi disattivare il tuo stesso account';
  end if;
  select ruolo, amministratore into v_ruolo, v_admin
  from anagrafica.membri_studio where utente_id = p_utente and studio_id = sicurezza.studio_id();
  if v_ruolo is null then
    raise exception 'Membro non trovato in questo studio';
  end if;
  if v_admin then
    raise exception 'Togli prima il ruolo di amministratore, poi disattiva il membro';
  end if;
  if v_ruolo = 'pediatra' and not sicurezza.is_admin_pediatra() then
    raise exception 'Solo un pediatra amministratore può disattivare un pediatra';
  end if;
  update anagrafica.membri_studio
     set attivo = p_attivo,
         nome = coalesce(nullif(trim(p_nome), ''), nome),
         cognome = coalesce(nullif(trim(p_cognome), ''), cognome),
         aggiornato_il = now()
   where utente_id = p_utente and studio_id = sicurezza.studio_id();
end;
$$;

-- L'amministratore vede tutto lo staff e i pediatri del proprio studio (anche se è allergologo).
create policy admin_vede_staff on anagrafica.membri_studio
  for select to authenticated using (sicurezza.is_admin() and studio_id = sicurezza.studio_id());
create policy admin_vede_pediatri on anagrafica.pediatri
  for select to authenticated using (sicurezza.is_admin() and studio_id = sicurezza.studio_id());

-- -----------------------------------------------------------------------------
-- 3. Codice fiscale: si legge solo con le RPC che lo registrano nel registro accessi.
-- -----------------------------------------------------------------------------
revoke execute on function anagrafica.decifra_cf(bytea) from authenticated, public;

do $$
declare
  t text;
  colonne text;
begin
  foreach t in array array['pazienti', 'tutori'] loop
    select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into colonne
    from information_schema.columns
    where table_schema = 'anagrafica' and table_name = t and column_name not like 'codice_fiscale_%';
    execute format('revoke select on anagrafica.%I from authenticated', t);
    execute format('grant select (%s) on anagrafica.%I to authenticated', colonne, t);
  end loop;
end;
$$;

create or replace function api.allergo_codice_fiscale(p_paziente_id uuid)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  v_cf bytea;
  v_pseudo uuid;
begin
  if not sicurezza.allergologia_ok() then
    raise exception 'Accesso al modulo Allergologia non consentito';
  end if;
  select p.codice_fiscale_cifrato, m.pseudo_id into v_cf, v_pseudo
  from anagrafica.allergo_pazienti p
  join pseudonimi.allergo_mappa m on m.paziente_id = p.id
  where p.id = p_paziente_id and p.studio_id = sicurezza.studio_id();
  if v_cf is null then
    raise exception 'Paziente non trovato';
  end if;
  perform audit.registra('LETTURA_CODICE_FISCALE', 'anagrafica.allergo_pazienti', p_paziente_id::text, v_pseudo);
  return extensions.pgp_sym_decrypt(v_cf, sicurezza.chiave_cf());
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Consensi: data e autore li decide il database (storico non falsificabile).
-- -----------------------------------------------------------------------------
create or replace function anagrafica.consenso_timbro()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.registrato_il := clock_timestamp();
    new.registrato_da := auth.uid();
  end if;
  return new;
end;
$$;
create trigger timbro before insert on anagrafica.consensi
  for each row execute function anagrafica.consenso_timbro();

-- -----------------------------------------------------------------------------
-- 5. Pazienti: il pediatra di riferimento è dello stesso studio e lo cambia solo
--    un pediatra amministratore (evita di «prendersi» le cartelle di un collega).
-- -----------------------------------------------------------------------------
create or replace function anagrafica.paziente_pediatra_coerente()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from anagrafica.pediatri where id = new.pediatra_id and studio_id = new.studio_id) then
    raise exception 'Il pediatra indicato non appartiene allo studio del paziente';
  end if;
  if tg_op = 'UPDATE' and new.pediatra_id is distinct from old.pediatra_id
     and auth.uid() is not null and not sicurezza.is_admin_pediatra() then
    raise exception 'Solo un pediatra amministratore può cambiare il pediatra di riferimento';
  end if;
  return new;
end;
$$;
create trigger pediatra_coerente before insert or update of pediatra_id, studio_id on anagrafica.pazienti
  for each row execute function anagrafica.paziente_pediatra_coerente();

-- -----------------------------------------------------------------------------
-- 6. Collegamento dell'account genitore: solo con email verificata; lo stesso
--    genitore può essere registrato da più studi (più righe con lo stesso account).
-- -----------------------------------------------------------------------------
alter table anagrafica.tutori drop constraint if exists tutori_utente_id_key;
create index if not exists tutori_utente on anagrafica.tutori (utente_id);

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

  update anagrafica.tutori
  set utente_id = auth.uid()
  where lower(email) = v_email and utente_id is null;
  get diagnostics v_n = row_count;

  if v_n > 0 then
    perform audit.registra('COLLEGAMENTO_TUTORE', 'anagrafica.tutori', auth.uid()::text);
  end if;
  return v_n;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. Appuntamenti: paziente e pediatra devono appartenere allo studio indicato.
-- -----------------------------------------------------------------------------
create or replace function anagrafica.appuntamento_coerente()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from anagrafica.pazienti p where p.id = new.paziente_id and p.studio_id = new.studio_id)
     or not exists (select 1 from anagrafica.pediatri d where d.id = new.pediatra_id and d.studio_id = new.studio_id) then
    raise exception 'Paziente e pediatra devono appartenere allo studio dell''appuntamento';
  end if;
  return new;
end;
$$;
create trigger coerenza_studio before insert or update of paziente_id, studio_id, pediatra_id on anagrafica.appuntamenti
  for each row execute function anagrafica.appuntamento_coerente();

-- Le note interne della segreteria non devono arrivare ai genitori: il portale legge
-- gli appuntamenti con una RPC che restituisce solo data, tipo e stato.
drop policy if exists tutore_vede_appuntamenti_figli on anagrafica.appuntamenti;

create or replace function api.appuntamenti_figlio(p_paziente_id uuid)
returns table (id uuid, inizio timestamptz, fine timestamptz, tipo text, stato text)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not sicurezza.tutore_di(p_paziente_id) then
    raise exception 'Non autorizzato';
  end if;
  return query
    select a.id, a.inizio, a.fine, a.tipo, a.stato
    from anagrafica.appuntamenti a
    where a.paziente_id = p_paziente_id and a.inizio >= now() and a.stato in ('richiesto', 'confermato')
    order by a.inizio;
end;
$$;
grant execute on function api.appuntamenti_figlio(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 8. Regole dei promemoria (globali): le modifica solo un pediatra amministratore, con audit.
-- -----------------------------------------------------------------------------
drop policy if exists pediatra_gestisce_regole on anagrafica.regole_promemoria;
create policy admin_gestisce_regole on anagrafica.regole_promemoria
  for all to authenticated
  using (sicurezza.is_admin_pediatra()) with check (sicurezza.is_admin_pediatra());
create trigger audit after insert or update or delete on anagrafica.regole_promemoria
  for each row execute function audit.traccia_modifica();

-- -----------------------------------------------------------------------------
-- 9. Cataloghi clinici condivisi: li modifica solo un pediatra amministratore.
-- -----------------------------------------------------------------------------
drop policy if exists admin_modifica_patologie on anagrafica.catalogo_patologie;
drop policy if exists admin_aggiunge_patologie on anagrafica.catalogo_patologie;
create policy admin_modifica_patologie on anagrafica.catalogo_patologie
  for update to authenticated using (sicurezza.is_admin_pediatra()) with check (sicurezza.is_admin_pediatra());
create policy admin_aggiunge_patologie on anagrafica.catalogo_patologie
  for insert to authenticated with check (sicurezza.is_admin_pediatra());
drop policy if exists admin_aggiunge_diagnosi on anagrafica.catalogo_diagnosi;
drop policy if exists admin_modifica_diagnosi on anagrafica.catalogo_diagnosi;
create policy admin_aggiunge_diagnosi on anagrafica.catalogo_diagnosi
  for insert to authenticated with check (sicurezza.is_admin_pediatra());
create policy admin_modifica_diagnosi on anagrafica.catalogo_diagnosi
  for update to authenticated using (sicurezza.is_admin_pediatra()) with check (sicurezza.is_admin_pediatra());

-- -----------------------------------------------------------------------------
-- 10. WhatsApp: il consenso si ricontrolla al momento dell'invio e una revoca
--     annulla i messaggi già in coda.
-- -----------------------------------------------------------------------------
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
    and exists (select 1 from anagrafica.destinatari_whatsapp(a.paziente_id) d where d.tutore_id = m.tutore_id)
  order by m.programmato_per
  limit p_limite;
$$;

create or replace function anagrafica.annulla_messaggi_revoca()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.finalita = 'whatsapp' and new.stato <> 'concesso' then
    update anagrafica.messaggi_outbox o set stato = 'annullato'
    from anagrafica.appuntamenti a
    where a.id = o.appuntamento_id and a.paziente_id = new.paziente_id
      and o.tutore_id = new.tutore_id and o.stato = 'in_coda';
  end if;
  return new;
end;
$$;
create trigger annulla_whatsapp after insert on anagrafica.consensi
  for each row execute function anagrafica.annulla_messaggi_revoca();

-- Audit anche sulle impostazioni del referto allergologico e sui modelli di testo.
create trigger audit after insert or update or delete on anagrafica.allergo_impostazioni
  for each row execute function audit.traccia_modifica();
