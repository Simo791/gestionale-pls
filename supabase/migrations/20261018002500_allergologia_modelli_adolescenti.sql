-- =============================================================================
-- 2500 · Modelli: rinite con dosi da adolescente (≥ 12 anni) e indicazione d'età
--        nel modello pediatrico (bilastina 10 mg: 6–11 anni con peso ≥ 20 kg).
-- =============================================================================
update anagrafica.allergo_modelli
   set nome = 'Rinocongiuntivite allergica (6–11 anni): terapia a gradini',
       testo = replace(testo, 'Pr/ Bilastina 10 mg cpr orodispersibili (Robilas): 1 cpr orodispersibile al giorno',
                              'Pr/ Bilastina 10 mg cpr orodispersibili (Robilas), 6–11 anni con peso ≥ 20 kg: 1 cpr orodispersibile al giorno'),
       aggiornato_il = now()
 where studio_id is null and codice = 'rinite';

insert into anagrafica.allergo_modelli (studio_id, codice, nome, profilo, sezione, ordine, testo) values
(null, 'rinite_12', 'Rinocongiuntivite allergica (≥ 12 anni): terapia a gradini', 'rinite', 'piano', 21,
'- In caso di rinite con colanaso, starnuti, prurito nasale, prurito oculare, lacrimazione:
  Pr/ Bilastina 20 mg cpr (Robilas): 1 cpr al giorno a stomaco vuoto (un''ora prima o due ore dopo il pasto) per 10-15 giorni, poi se sta bene sospende oppure continua se persistono i sintomi.
- Se nonostante l''antistaminico presenta ostruzione nasale aggiungere:
  Pr/ Mometasone furoato spray nasale (Momil): 2 erogazioni per narice una volta al giorno (la sera) per 10-15 giorni, poi sospende per 3-4 giorni e riprende se necessario. Sospendere in caso di epistassi.
- Se nonostante l''antistaminico presenta congiuntivite:
  Pr/ Ketoftil collirio: 1 goccia per occhio per 3 volte/die per 4-5 giorni, a cicli ripetibili dopo 10 giorni di sospensione.')
on conflict do nothing;
