-- =============================================================================
-- 2000 · Fase beta: l'amministratore può nominare amministratore qualunque membro
--        dello studio (pediatra, sostituto, segreteria, allergologo).
--
-- Essere amministratore dà la gestione dello studio (staff, moduli, catalogo) e
-- l'accesso al modulo Allergologia, ma NON apre le cartelle degli assistiti: quelle
-- restano legate al ruolo (pediatra titolare / sostituto in servizio).
-- =============================================================================

alter table anagrafica.membri_studio drop constraint admin_solo_pediatra;

-- Amministratore = claim app_admin del proprio studio, qualunque sia il ruolo.
create or replace function sicurezza.is_admin()
returns boolean
language sql stable
set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'app_admin')::boolean, false)
     and sicurezza.ruolo() in ('pediatra', 'segreteria', 'sostituto', 'allergologo')
     and sicurezza.studio_id() is not null;
$$;

-- Nomina o revoca di un amministratore. Lo studio deve sempre averne almeno uno e
-- non ci si revoca da soli (si evita di restare senza chi gestisce lo studio).
create or replace function api.imposta_amministratore(p_utente uuid, p_amministratore boolean)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_studio uuid := sicurezza.studio_id();
begin
  if not sicurezza.is_admin() or not sicurezza.mfa_ok() then
    raise exception 'Solo un amministratore dello studio nomina gli amministratori';
  end if;
  if p_utente = auth.uid() and not p_amministratore then
    raise exception 'Non puoi revocare a te stesso il ruolo di amministratore';
  end if;
  update anagrafica.membri_studio
     set amministratore = p_amministratore, aggiornato_il = now()
   where utente_id = p_utente and studio_id = v_studio and attivo;
  if not found then
    raise exception 'Membro non trovato o disattivato';
  end if;
  if not exists (select 1 from anagrafica.membri_studio where studio_id = v_studio and amministratore and attivo) then
    raise exception 'Lo studio deve avere almeno un amministratore';
  end if;
  perform anagrafica.notifica(v_studio, p_utente, 'amministratore',
    case when p_amministratore then 'Sei amministratore dello studio' else 'Non sei più amministratore dello studio' end,
    case when p_amministratore then 'Esci e rientra per vedere le funzioni di amministrazione (Account).' else null end,
    '#/account');
end;
$$;
grant execute on function api.imposta_amministratore(uuid, boolean) to authenticated;

-- Beta: tutti i membri attivi dello studio diventano amministratori in un colpo solo.
create or replace function api.tutti_amministratori()
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  if not sicurezza.is_admin() or not sicurezza.mfa_ok() then
    raise exception 'Solo un amministratore dello studio nomina gli amministratori';
  end if;
  update anagrafica.membri_studio set amministratore = true, aggiornato_il = now()
   where studio_id = sicurezza.studio_id() and attivo and not amministratore;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
grant execute on function api.tutti_amministratori() to authenticated;
