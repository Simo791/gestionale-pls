-- =============================================================================
-- Allergologia: IgE totali, specifiche e molecolari (ISAC E112i, ALEX²).
-- Ogni componente positivo è una riga di clinica.allergo_test (tipo
-- 'ige_componenti'); la metodica dice su quale piattaforma è stato misurato
-- (unità e cut-off diversi: ISU-E per ISAC, kUA/L per ALEX e ImmunoCAP).
-- data_prelievo: data del prelievo indicata sul referto del laboratorio, che di
-- solito precede la visita in cui il risultato viene registrato e commentato.
-- =============================================================================

alter table clinica.allergo_test
  add column metodica      text check (char_length(metodica) <= 60),
  add column data_prelievo date;

comment on column clinica.allergo_test.metodica is
  'Piattaforma o metodo: ImmunoCAP ISAC E112i, ALEX² Allergy Xplorer, ImmunoCAP (singoli componenti)';
comment on column clinica.allergo_test.data_prelievo is
  'Data del prelievo riportata dal laboratorio (può precedere la data di registrazione)';
