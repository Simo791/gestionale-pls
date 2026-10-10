-- =============================================================================
-- 2200 · Modelli di esame obiettivo per patologia; il peso non è più nel testo
--        dell'esame obiettivo (ha il suo campo e compare nell'intestazione del referto).
-- =============================================================================

update anagrafica.allergo_modelli set testo = regexp_replace(testo, '\s*Peso:\s*\{\{peso\}\}\s*kg\.?', '', 'g'), aggiornato_il = now()
 where studio_id is null and sezione = 'esame_obiettivo';
-- Anche nei modelli personalizzati dello studio, se contengono il segnaposto del peso.
update anagrafica.allergo_modelli set testo = regexp_replace(testo, '\s*Peso:\s*\{\{peso\}\}\s*kg\.?', '', 'g'), aggiornato_il = now()
 where studio_id is not null and sezione = 'esame_obiettivo' and testo like '%{{peso}}%';

update anagrafica.allergo_modelli set nome = 'Esame obiettivo nella norma' where studio_id is null and codice = 'eo_normale';

insert into anagrafica.allergo_modelli (studio_id, codice, nome, profilo, sezione, ordine, testo) values
(null, 'asma_eo', 'Asma: esame obiettivo', 'asma', 'esame_obiettivo', 30,
'Buone condizioni generali. Cute rosea. Faringe ___. Al torace: murmure vescicolare ___, sibili / fischi espiratori ___, tempo espiratorio ___. Non rientramenti / rientramenti ___. Attività cardiaca valida e ritmica, toni netti e validi, pause apparentemente libere.'),
(null, 'asma_eo_crisi', 'Asma: esame obiettivo in broncospasmo', 'asma', 'esame_obiettivo', 31,
'Condizioni generali discrete. Dispnea ___ con FR ___/min. Al torace sibili espiratori diffusi, tempo espiratorio prolungato, rientramenti ___. SpO₂ ___% in aria ambiente. Attività cardiaca valida e ritmica, FC ___/min.'),
(null, 'alimenti_eo', 'Allergia alimentare / anafilassi: esame obiettivo', 'anafilassi', 'esame_obiettivo', 50,
'Buone condizioni generali. Cute rosea e ben idratata, non lesioni orticarioidi né angioedema in atto. Faringe deterso. Al torace buona penetrazione d''aria su tutto l''ambito polmonare, non rumori patologici aggiunti. Attività cardiaca valida e ritmica, toni netti e validi.'),
(null, 'orticaria_eo', 'Orticaria: esame obiettivo', 'orticaria', 'esame_obiettivo', 80,
'Buone condizioni generali. Cute: pomfi ___ (sedi: ___, dimensioni ___), angioedema ___. Dermografismo ___. Faringe deterso. Obiettività cardio-toracica nella norma.'),
(null, 'pollini_alimenti_eo', 'Oculorinite / sindrome orale allergica: esame obiettivo', 'pollini_alimenti', 'esame_obiettivo', 60,
'Buone condizioni generali. Congiuntive ___. Rinoscopia anteriore: turbinati ___, mucosa ___, secrezioni ___. Cavo orale e faringe ___. Al torace buona penetrazione d''aria bilateralmente, non rumori patologici aggiunti. Attività cardiaca valida e ritmica.'),
(null, 'dermatite_eo_lattante', 'Dermatite atopica (lattante): esame obiettivo', 'dermatite', 'esame_obiettivo', 41,
'Buone condizioni generali. Lesioni eczematose ___ di volto, guance e cuoio capelluto, con / senza essudazione e croste; lesioni da grattamento ___. Cute xerotica diffusa. Area del pannolino ___. Obiettività cardio-toracica nella norma. SCORAD: ___');
