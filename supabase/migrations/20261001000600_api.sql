-- =============================================================================
-- 0600 · Funzioni RPC (schema api)
-- Operazioni che il frontend non può fare con semplici select/insert:
-- cifrare il codice fiscale, risolvere uno pseudonimo, verificare l'audit.
-- Ogni funzione controlla il ruolo e, dove serve, scrive nell'audit log.
-- =============================================================================

create or replace function api.registra_paziente(
  p_nome text, p_cognome text, p_codice_fiscale text, p_data_nascita date,
  p_sesso char(1), p_pediatra_id uuid
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not sicurezza.is_staff() then
    raise exception 'Solo lo staff dello studio può registrare un paziente';
  end if;
  if not exists (select 1 from anagrafica.pediatri
                 where id = p_pediatra_id and studio_id = sicurezza.studio_id()) then
    raise exception 'Pediatra non appartenente allo studio';
  end if;

  insert into anagrafica.pazienti (studio_id, pediatra_id, nome, cognome,
    codice_fiscale_cifrato, codice_fiscale_impronta, data_nascita, sesso)
  values (sicurezza.studio_id(), p_pediatra_id, trim(p_nome), trim(p_cognome),
    anagrafica.cifra_cf(p_codice_fiscale), anagrafica.impronta_cf(p_codice_fiscale),
    p_data_nascita, p_sesso)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function api.registra_tutore(
  p_nome text, p_cognome text, p_codice_fiscale text, p_email text, p_telefono text default null
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not sicurezza.is_staff() then
    raise exception 'Solo lo staff dello studio può registrare un tutore';
  end if;

  insert into anagrafica.tutori (studio_id, nome, cognome, codice_fiscale_cifrato,
    codice_fiscale_impronta, email, telefono)
  values (sicurezza.studio_id(), trim(p_nome), trim(p_cognome),
    anagrafica.cifra_cf(p_codice_fiscale), anagrafica.impronta_cf(p_codice_fiscale),
    lower(trim(p_email)), p_telefono)
  returning id into v_id;
  return v_id;
end;
$$;

-- Restituisce lo pseudonimo della cartella e registra l'apertura nell'audit.
-- È l'unico modo per il frontend di passare da un paziente alla sua clinica.
create or replace function api.apri_cartella(p_paziente_id uuid)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_pseudo uuid;
begin
  if not sicurezza.puo_accedere_paziente(p_paziente_id) then
    raise exception 'Accesso alla cartella non consentito';
  end if;
  select pseudo_id into v_pseudo from pseudonimi.mappa where paziente_id = p_paziente_id;
  perform audit.registra('APERTURA_CARTELLA', 'clinica.cartelle', null, v_pseudo);
  return v_pseudo;
end;
$$;

-- Dopo il primo login con OTP, collega l'account al tutore registrato dallo studio
-- con la stessa email. Il frontend poi rinnova la sessione per avere il ruolo nel JWT.
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

-- Per il portale genitori: figli accessibili e relativi pseudonimi (per le curve).
create or replace function api.miei_figli()
returns table (paziente_id uuid, pseudo_id uuid, nome text, data_nascita date, sesso char(1))
language plpgsql stable security definer
set search_path = ''
as $$
begin
  return query
  select p.id, m.pseudo_id, p.nome, p.data_nascita, p.sesso
  from anagrafica.pazienti p
  join pseudonimi.mappa m on m.paziente_id = p.id
  where sicurezza.tutore_di(p.id);
end;
$$;

-- Chi ha aperto o modificato la cartella di un bambino: per il pediatra e per i tutori.
create or replace function api.registro_accessi(p_paziente_id uuid)
returns table (avvenuto_il timestamptz, ruolo text, azione text, tabella text)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_pseudo uuid;
begin
  if not (sicurezza.puo_accedere_paziente(p_paziente_id) or sicurezza.tutore_di(p_paziente_id)) then
    raise exception 'Non autorizzato';
  end if;
  select m.pseudo_id into v_pseudo from pseudonimi.mappa m where m.paziente_id = p_paziente_id;
  return query
  select e.avvenuto_il, e.ruolo, e.azione, e.tabella
  from audit.eventi e
  where e.pseudo_id = v_pseudo
  order by e.avvenuto_il desc
  limit 200;
end;
$$;

-- Semaforo del cruscotto: integrità della catena di audit (solo pediatra con MFA).
create or replace function api.verifica_audit()
returns table (eventi_verificati bigint, primo_evento_non_valido bigint)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not (sicurezza.ruolo() = 'pediatra' and sicurezza.mfa_ok()) then
    raise exception 'Solo il pediatra può verificare il registro di audit';
  end if;
  return query select * from audit.verifica_catena();
end;
$$;

grant execute on function
  api.registra_paziente(text, text, text, date, char, uuid),
  api.registra_tutore(text, text, text, text, text),
  api.apri_cartella(uuid),
  api.collega_account_tutore(),
  api.miei_figli(),
  api.registro_accessi(uuid),
  api.verifica_audit()
to authenticated;
