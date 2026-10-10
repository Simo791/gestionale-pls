-- =============================================================================
-- 2300 · Dati del medico per la validità del referto: iscrizione all'Ordine dei
--        Medici e recapito della struttura (compaiono in intestazione e firma).
-- =============================================================================
alter table anagrafica.allergo_impostazioni
  add column ordine_provincia text,
  add column ordine_numero    text,
  add column telefono         text;
