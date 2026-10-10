-- =============================================================================
-- 2100 · Allergologia: anamnesi guidata (abitazione, fumo, alimenti, farmaci,
--        sport, sonno) e immagini di riferimento per lo SCORAD.
-- =============================================================================

-- Sonno e scelte strutturate dei menu (il testo del referto resta nelle colonne di testo).
alter table clinica.allergo_cartelle
  add column sonno           text,
  add column anamnesi_scelte jsonb not null default '{}';

-- Immagini di riferimento per i gradi di intensità dello SCORAD (sezione B), caricate
-- dallo studio: foto proprie o con licenza d'uso (campo «fonte»). Nessun dato di
-- pazienti identificabili: sono immagini di esempio, non documentazione clinica.
create table anagrafica.allergo_scorad_immagini (
  id            uuid primary key default gen_random_uuid(),
  studio_id     uuid not null references anagrafica.studi(id),
  voce          smallint not null check (voce between 0 and 5),   -- eritema … xerosi
  grado         smallint not null check (grado between 1 and 3),
  immagine      text not null check (immagine like 'data:image/%' and length(immagine) < 600000),
  didascalia    text,
  fonte         text not null,                                    -- autore / licenza
  caricato_da   uuid not null default auth.uid(),
  caricato_il   timestamptz not null default now(),
  unique (studio_id, voce, grado)
);
alter table anagrafica.allergo_scorad_immagini enable row level security;
grant select, insert, update, delete on anagrafica.allergo_scorad_immagini to authenticated;
create policy immagini_scorad on anagrafica.allergo_scorad_immagini for all to authenticated
  using (sicurezza.allergologia_ok() and studio_id = sicurezza.studio_id())
  with check (sicurezza.allergologia_ok() and studio_id = sicurezza.studio_id());
create trigger audit after insert or update or delete on anagrafica.allergo_scorad_immagini
  for each row execute function audit.traccia_modifica();
