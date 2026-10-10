import { AREE_ALLERGO } from '@pls/shared';
import type { Campo } from './Registro';

/** Colonne leggibili dell'anagrafica (il codice fiscale cifrato non è concesso: si legge via RPC). */
export const COLONNE_PAZIENTE = 'id, studio_id, nome, cognome, data_nascita, sesso, genitore_nome, genitore_telefono, genitore_email, ' +
  'pediatra_curante, inviato_da, note_organizzative, stato, creato_il, luogo_nascita, residenza';

const voci = <T extends string>(r: Record<T, string>) => Object.entries(r) as [T, string][];

export const TIPI_VISITA: Record<string, string> = {
  prima_visita: 'Prima visita', controllo: 'Controllo', urgenza: 'Urgenza', test: 'Seduta di test', altro: 'Altro',
};
export const STATI_DIAGNOSI: Record<string, string> = {
  sospetta: 'Sospetta', attiva: 'Attiva', in_remissione: 'In remissione', risolta: 'Risolta',
};
export const TIPI_TEST: Record<string, string> = {
  prick: 'Prick test', prick_by_prick: 'Prick by prick (alimento fresco)', ige_specifiche: 'IgE specifiche (estratto)',
  ige_componenti: 'IgE su componenti molecolari', ige_totali: 'IgE totali', patch: 'Patch test', intradermo: 'Intradermoreazione', altro: 'Altro',
};
export const ESITI_TPO: Record<string, string> = {
  negativo: 'Negativo (alimento tollerato)', positivo: 'Positivo', non_conclusivo: 'Non conclusivo', sospeso: 'Sospeso',
};
export const CAUSE_REAZIONE: Record<string, string> = {
  alimento: 'Alimento', farmaco: 'Farmaco', imenottero: 'Puntura di imenottero', esercizio: 'Esercizio fisico',
  lattice: 'Lattice', immunoterapia: 'Immunoterapia', idiopatica: 'Idiopatica (causa non trovata)', altro: 'Altro',
};
export const CLASSI_TERAPIA: Record<string, string> = {
  ics: 'Corticosteroide inalatorio (ICS)', ics_laba: 'ICS + broncodilatatore a lunga durata (LABA)', saba: 'Broncodilatatore al bisogno (SABA)',
  ltra: 'Antileucotrienico (montelukast)', antistaminico: 'Antistaminico', steroide_nasale: 'Corticosteroide nasale',
  steroide_topico: 'Corticosteroide topico', inibitore_calcineurina: 'Inibitore della calcineurina topico', emolliente: 'Emolliente',
  steroide_sistemico: 'Corticosteroide sistemico', biologico: 'Farmaco biologico', collirio: 'Collirio', altro: 'Altro',
};
export const VIE_AIT: Record<string, string> = {
  SCIT: 'Sottocutanea (SCIT)', SLIT: 'Sublinguale (SLIT)', OIT: 'Orale per alimenti (OIT)',
};
export const FASI_AIT: Record<string, string> = {
  induzione: 'Induzione / aumento dosi', mantenimento: 'Mantenimento', sospesa: 'Sospesa', conclusa: 'Conclusa',
};

export const CAMPI_VISITA: Campo[] = [
  { nome: 'data', etichetta: 'Data e ora', tipo: 'dataora', obbligatorio: true },
  { nome: 'tipo', etichetta: 'Tipo', tipo: 'select', opzioni: voci(TIPI_VISITA), obbligatorio: true },
  { nome: 'motivo', etichetta: 'Motivo', tipo: 'testo', obbligatorio: true, ampio: true },
  { nome: 'anamnesi', etichetta: 'Anamnesi recente e sintomi', tipo: 'area' },
  { nome: 'esame_obiettivo', etichetta: 'Esame obiettivo', tipo: 'area' },
  { nome: 'peso_kg', etichetta: 'Peso (kg)', tipo: 'numero', passo: '0.01' },
  { nome: 'altezza_cm', etichetta: 'Altezza (cm)', tipo: 'numero', passo: '0.1' },
  { nome: 'saturazione', etichetta: 'SpO₂ (%)', tipo: 'numero', passo: '1' },
  { nome: 'prossimo_controllo', etichetta: 'Prossimo controllo', tipo: 'data' },
  { nome: 'conclusioni', etichetta: 'Conclusioni', tipo: 'area' },
  { nome: 'piano', etichetta: 'Piano e indicazioni', tipo: 'area' },
];

export const CAMPI_DIAGNOSI: Campo[] = [
  { nome: 'area', etichetta: 'Area', tipo: 'select', opzioni: voci(AREE_ALLERGO), obbligatorio: true },
  { nome: 'descrizione', etichetta: 'Diagnosi', tipo: 'testo', obbligatorio: true, segnaposto: 'Es. Allergia IgE-mediata alle proteine del latte vaccino' },
  { nome: 'data_diagnosi', etichetta: 'Data della diagnosi', tipo: 'data' },
  { nome: 'gravita', etichetta: 'Gravità / livello', tipo: 'testo', segnaposto: 'Es. lieve persistente, moderata' },
  { nome: 'stato', etichetta: 'Stato', tipo: 'select', opzioni: voci(STATI_DIAGNOSI), obbligatorio: true },
  { nome: 'note', etichetta: 'Note', tipo: 'area' },
];

export const CAMPI_TEST: Campo[] = [
  { nome: 'data', etichetta: 'Data', tipo: 'data', obbligatorio: true },
  { nome: 'tipo', etichetta: 'Tipo di test', tipo: 'select', opzioni: voci(TIPI_TEST), obbligatorio: true },
  { nome: 'allergene', etichetta: 'Allergene / componente', tipo: 'testo', obbligatorio: true, segnaposto: 'Es. Dermatophagoides pteronyssinus, Ara h 2' },
  { nome: 'valore', etichetta: 'Valore', tipo: 'numero', passo: '0.01', aiuto: 'Prick: diametro medio del pomfo in mm. IgE: kUA/L.' },
  { nome: 'unita', etichetta: 'Unità', tipo: 'select', opzioni: [['mm', 'mm'], ['kUA/L', 'kUA/L'], ['kU/L', 'kU/L'], ['ISU-E', 'ISU-E'], ['+/-', 'lettura +/−']] },
  { nome: 'esito', etichetta: 'Esito', tipo: 'select', opzioni: [['positivo', 'Positivo'], ['negativo', 'Negativo'], ['dubbio', 'Dubbio']],
    aiuto: 'Se lasci vuoto, per prick e IgE viene calcolato dal valore.' },
  { nome: 'note', etichetta: 'Note', tipo: 'area' },
];

export const CAMPI_TPO: Campo[] = [
  { nome: 'data', etichetta: 'Data', tipo: 'data', obbligatorio: true },
  { nome: 'alimento', etichetta: 'Alimento', tipo: 'testo', obbligatorio: true },
  { nome: 'forma', etichetta: 'Forma', tipo: 'testo', segnaposto: 'Es. uovo cotto al forno, latte crudo' },
  { nome: 'protocollo', etichetta: 'Protocollo (dosi e intervalli)', tipo: 'testo', ampio: true },
  { nome: 'dose_cumulativa', etichetta: 'Dose cumulativa assunta', tipo: 'testo' },
  { nome: 'esito', etichetta: 'Esito', tipo: 'select', opzioni: voci(ESITI_TPO), obbligatorio: true },
  { nome: 'dose_scatenante', etichetta: 'Dose scatenante (se positivo)', tipo: 'testo' },
  { nome: 'adrenalina', etichetta: 'Somministrata adrenalina', tipo: 'si_no' },
  { nome: 'sintomi', etichetta: 'Sintomi osservati', tipo: 'area' },
  { nome: 'trattamento', etichetta: 'Trattamento', tipo: 'area' },
  { nome: 'indicazioni', etichetta: 'Indicazioni alla famiglia', tipo: 'area', segnaposto: 'Es. reintrodurre l\'alimento a domicilio 2-3 volte a settimana' },
];

export const CAMPI_SPIRO: Campo[] = [
  { nome: 'data', etichetta: 'Data', tipo: 'data', obbligatorio: true },
  { nome: 'fev1_l', etichetta: 'FEV₁ (L)', tipo: 'numero', passo: '0.01' },
  { nome: 'fev1_pct', etichetta: 'FEV₁ (% del predetto)', tipo: 'numero', passo: '0.1' },
  { nome: 'fvc_l', etichetta: 'FVC (L)', tipo: 'numero', passo: '0.01' },
  { nome: 'fvc_pct', etichetta: 'FVC (% del predetto)', tipo: 'numero', passo: '0.1' },
  { nome: 'fev1_fvc', etichetta: 'FEV₁/FVC (%)', tipo: 'numero', passo: '0.1' },
  { nome: 'fef2575_pct', etichetta: 'FEF₂₅₋₇₅ (% del predetto)', tipo: 'numero', passo: '0.1' },
  { nome: 'fev1_post_l', etichetta: 'FEV₁ dopo broncodilatatore (L)', tipo: 'numero', passo: '0.01', aiuto: 'La reversibilità è calcolata automaticamente.' },
  { nome: 'feno_ppb', etichetta: 'FeNO (ppb)', tipo: 'numero', passo: '1' },
  { nome: 'note', etichetta: 'Note (equazioni di riferimento, qualità della prova)', tipo: 'area', segnaposto: 'Es. GLI-2012, prova accettabile e ripetibile' },
];

export const CAMPI_REAZIONE: Campo[] = [
  { nome: 'data', etichetta: 'Data', tipo: 'data', obbligatorio: true },
  { nome: 'causa_categoria', etichetta: 'Causa', tipo: 'select', opzioni: voci(CAUSE_REAZIONE), obbligatorio: true },
  { nome: 'causa', etichetta: 'Dettaglio della causa', tipo: 'testo', segnaposto: 'Es. anacardo in un biscotto' },
  { nome: 'cofattori', etichetta: 'Cofattori', tipo: 'testo', segnaposto: 'Esercizio, FANS, febbre, infezione…' },
  { nome: 'cute_mucose', etichetta: 'Cute/mucose (orticaria, angioedema, prurito)', tipo: 'si_no' },
  { nome: 'respiratorio', etichetta: 'Respiratorio (dispnea, sibili, stridore, tosse)', tipo: 'si_no' },
  { nome: 'cardiovascolare', etichetta: 'Cardiovascolare (ipotensione, ipotonia, collasso)', tipo: 'si_no' },
  { nome: 'gastrointestinale', etichetta: 'Gastrointestinale persistente (dolore, vomito ripetuto)', tipo: 'si_no' },
  { nome: 'anafilassi', etichetta: 'Giudizio del medico: anafilassi', tipo: 'si_no' },
  { nome: 'adrenalina', etichetta: 'Somministrata adrenalina', tipo: 'si_no' },
  { nome: 'dosi_adrenalina', etichetta: 'Numero di dosi di adrenalina', tipo: 'numero', passo: '1' },
  { nome: 'pronto_soccorso', etichetta: 'Accesso in pronto soccorso', tipo: 'si_no' },
  { nome: 'ricovero', etichetta: 'Ricovero', tipo: 'si_no' },
  { nome: 'descrizione', etichetta: 'Descrizione', tipo: 'area' },
];

export const CAMPI_AUTOINIETTORE: Campo[] = [
  { nome: 'dispositivo', etichetta: 'Dispositivo', tipo: 'testo', obbligatorio: true, segnaposto: 'Nome commerciale dell\'autoiniettore' },
  { nome: 'dose_mg', etichetta: 'Dose', tipo: 'select', opzioni: [['0.15', '0,15 mg'], ['0.3', '0,30 mg'], ['0.5', '0,50 mg']], obbligatorio: true },
  { nome: 'numero', etichetta: 'Numero di autoiniettori', tipo: 'numero', passo: '1', obbligatorio: true },
  { nome: 'peso_kg', etichetta: 'Peso alla prescrizione (kg)', tipo: 'numero', passo: '0.1' },
  { nome: 'data_prescrizione', etichetta: 'Data della prescrizione', tipo: 'data', obbligatorio: true },
  { nome: 'scadenza', etichetta: 'Scadenza (la più vicina)', tipo: 'data' },
  { nome: 'attivo', etichetta: 'Prescrizione in uso', tipo: 'si_no' },
  { nome: 'note', etichetta: 'Note (dove sono conservati: casa, scuola…)', tipo: 'area' },
];

export const CAMPI_TERAPIA: Campo[] = [
  { nome: 'farmaco', etichetta: 'Farmaco e formulazione', tipo: 'testo', obbligatorio: true, ampio: true },
  { nome: 'classe', etichetta: 'Classe', tipo: 'select', opzioni: voci(CLASSI_TERAPIA), obbligatorio: true },
  { nome: 'posologia', etichetta: 'Posologia', tipo: 'testo' },
  { nome: 'dal', etichetta: 'Dal', tipo: 'data', obbligatorio: true },
  { nome: 'al', etichetta: 'Al (vuoto = in corso)', tipo: 'data' },
  { nome: 'note', etichetta: 'Note', tipo: 'area' },
];

export const CAMPI_AIT: Campo[] = [
  { nome: 'allergene', etichetta: 'Allergene', tipo: 'testo', obbligatorio: true, segnaposto: 'Es. acari, graminacee, latte vaccino' },
  { nome: 'via', etichetta: 'Via', tipo: 'select', opzioni: voci(VIE_AIT), obbligatorio: true },
  { nome: 'prodotto', etichetta: 'Prodotto / estratto', tipo: 'testo' },
  { nome: 'inizio', etichetta: 'Inizio', tipo: 'data', obbligatorio: true },
  { nome: 'fase', etichetta: 'Fase', tipo: 'select', opzioni: voci(FASI_AIT), obbligatorio: true },
  { nome: 'fine_prevista', etichetta: 'Fine prevista', tipo: 'data', aiuto: 'Per l\'immunoterapia con inalanti in genere almeno 3 anni.' },
  { nome: 'note', etichetta: 'Note', tipo: 'area' },
];

export const CAMPI_CARTELLA: Campo[] = [
  { nome: 'anamnesi_familiare', etichetta: 'Anamnesi familiare', tipo: 'area', segnaposto: 'Es. madre: asma allergico; nonna materna: rinite allergica' },
  { nome: 'anamnesi_fisiologica', etichetta: 'Anamnesi fisiologica', tipo: 'area', segnaposto: 'Gravidanza, parto, PN, eventi perinatali, allattamento, divezzamento' },
  { nome: 'anamnesi_remota', etichetta: 'Anamnesi patologica remota', tipo: 'area', segnaposto: 'Bronchiolite, dermatite atopica, ricoveri, interventi…' },
  { nome: 'abitazione', etichetta: 'Abitazione', tipo: 'testo', segnaposto: 'Es. in campagna, asciutta' },
  { nome: 'animali', etichetta: 'Animali domestici', tipo: 'testo' },
  { nome: 'fumo_dettaglio', etichetta: 'Fumo passivo', tipo: 'testo', segnaposto: 'Es. SI (padre e madre)' },
  { nome: 'muffe_umidita', etichetta: 'Muffe o umidità in casa', tipo: 'si_no' },
  { nome: 'farmaci', etichetta: 'Farmaci (reazioni avverse)', tipo: 'testo', segnaposto: 'Es. ben tollerati i farmaci finora assunti' },
  { nome: 'alimentazione', etichetta: 'Alimentazione (reazioni ad alimenti)', tipo: 'area' },
  { nome: 'sport', etichetta: 'Sport', tipo: 'testo' },
  { nome: 'comunita', etichetta: 'Comunità', tipo: 'testo', segnaposto: 'Nido, scuola' },
  { nome: 'note', etichetta: 'Note', tipo: 'area' },
];

/** Allergeni frequenti per il pannello rapido di prick test (inalanti del Centro-Sud e alimenti). */
export const PANNELLO_PRICK = [
  'Dermatophagoides pteronyssinus', 'Dermatophagoides farinae', 'Graminacee', 'Parietaria', 'Olivo', 'Cipresso',
  'Betulla', 'Nocciolo', 'Artemisia', 'Ambrosia', 'Gatto (epitelio)', 'Cane (epitelio)', 'Alternaria', 'Blattella',
  'Latte vaccino', 'Alfa-lattoalbumina', 'Beta-lattoglobulina', 'Caseina', 'Albume', 'Tuorlo', 'Grano', 'Soia',
  'Arachide', 'Nocciola', 'Noce', 'Pesce (merluzzo)', 'Gambero', 'Pesca (LTP)',
] as const;
