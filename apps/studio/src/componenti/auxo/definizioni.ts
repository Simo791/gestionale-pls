import { ORCHIDOMETRO_PRADER_ML } from '@pls/shared';
import type { Campo } from '../allergo/Registro';

/** Colonne leggibili dell'anagrafica (il codice fiscale cifrato si legge solo via RPC, che lo registra). */
export const COLONNE_PAZIENTE_AUXO = 'id, studio_id, nome, cognome, data_nascita, sesso, genitore_nome, genitore_telefono, genitore_email, ' +
  'pediatra_curante, inviato_da, note_organizzative, stato, creato_il, luogo_nascita, residenza';

const voci = <T extends string>(r: Record<T, string>) => Object.entries(r) as [T, string][];

export const TIPI_VISITA_AUXO: Record<string, string> = {
  prima_visita: 'Prima visita', controllo: 'Controllo', terapia_gh: 'Controllo in terapia con GH', altro: 'Altro',
};
export const STATI_DIAGNOSI: Record<string, string> = {
  sospetta: 'Sospetta', attiva: 'Attiva', in_remissione: 'In remissione', risolta: 'Risolta',
};
export const AREE_AUXO: Record<string, string> = {
  bassa_statura_familiare: 'Bassa statura familiare', ritardo_costituzionale: 'Ritardo costituzionale di crescita e pubertà',
  bassa_statura_idiopatica: 'Bassa statura idiopatica', ghd: 'Deficit di GH', sga: 'Nato piccolo per l\'età gestazionale (SGA)',
  turner: 'Sindrome di Turner', noonan: 'Sindrome di Noonan', shox: 'Alterazione del gene SHOX', prader_willi: 'Sindrome di Prader-Willi',
  irc: 'Insufficienza renale cronica', sindromica: 'Bassa statura sindromica (altra)', displasia_scheletrica: 'Displasia scheletrica',
  alta_statura: 'Alta statura', puberta_precoce: 'Pubertà precoce', telarca_prematuro: 'Telarca prematuro isolato',
  pubarca_prematuro: 'Pubarca prematuro', ritardo_puberale: 'Ritardo puberale', ipogonadismo: 'Ipogonadismo',
  sovrappeso: 'Sovrappeso', obesita: 'Obesità', magrezza: 'Magrezza', scarso_accrescimento: 'Scarso accrescimento ponderale',
  ipotiroidismo: 'Ipotiroidismo', celiachia: 'Celiachia', altro: 'Altro',
};
export const METODI_ETA_OSSEA: Record<string, string> = {
  greulich_pyle: 'Greulich e Pyle', tw3_rus: 'Tanner-Whitehouse 3 (RUS)', tw2: 'Tanner-Whitehouse 2', fels: 'Fels', altro: 'Altro',
};
export const METODI_PREVISIONE: Record<string, string> = {
  bayley_pinneau: 'Bayley-Pinneau', tw3: 'Tanner-Whitehouse 3', roche_wainer_thissen: 'Roche-Wainer-Thissen', altro: 'Altro',
};
export const STIMOLI_GH: Record<string, string> = {
  arginina: 'Arginina', clonidina: 'Clonidina', glucagone: 'Glucagone', insulina: 'Ipoglicemia insulinica (ITT)',
  ghrh_arginina: 'GHRH + arginina', levodopa: 'L-dopa', altro: 'Altro',
};
export const ESAMI_AUXO: Record<string, string> = {
  igf1: 'IGF-1', igfbp3: 'IGFBP-3', tsh: 'TSH', ft4: 'FT4', emocromo: 'Emocromo', ves: 'VES', pcr: 'PCR',
  ttg_iga: 'Anticorpi anti-transglutaminasi IgA', iga_totali: 'IgA totali', creatinina: 'Creatinina', elettroliti: 'Elettroliti',
  glicemia: 'Glicemia a digiuno', insulina: 'Insulina', hba1c: 'Emoglobina glicata (HbA1c)', ogtt: 'Curva da carico di glucosio (OGTT)',
  colesterolo_totale: 'Colesterolo totale', hdl: 'Colesterolo HDL', ldl: 'Colesterolo LDL', trigliceridi: 'Trigliceridi',
  alt: 'ALT', ast: 'AST', lh: 'LH', fsh: 'FSH', estradiolo: 'Estradiolo', testosterone: 'Testosterone', dheas: 'DHEA-S',
  '17ohp': '17-idrossiprogesterone', cortisolo: 'Cortisolo', prolattina: 'Prolattina', vitamina_d: '25-OH vitamina D',
  cariotipo: 'Cariotipo', shox: 'Analisi del gene SHOX', genetica: 'Altro test genetico', urine: 'Esame urine', altro: 'Altro',
};
export const CLASSI_TERAPIA_AUXO: Record<string, string> = {
  somatropina: 'Ormone della crescita (somatropina, giornaliero)', gh_lunga_durata: 'Ormone della crescita a lunga durata (settimanale)',
  analogo_gnrh: 'Analogo del GnRH', levotiroxina: 'Levotiroxina', testosterone: 'Testosterone', estrogeni: 'Estrogeni', altro: 'Altro',
};
export const INDICAZIONI_NOTA39: Record<string, string> = {
  ghd: 'Deficit di GH', turner: 'Sindrome di Turner', irc: 'Insufficienza renale cronica', prader_willi: 'Sindrome di Prader-Willi',
  sga: 'SGA', shox: 'Alterazione del gene SHOX', noonan: 'Sindrome di Noonan', craniofaringioma: 'Craniofaringioma / tumori ipotalamo-ipofisari',
};

const TANNER = [['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5']] as const;
/** Peli pubici: alcune scale prevedono anche lo stadio 6. */
const TANNER_PH = [...TANNER, ['6', '6']] as const;
/** Sì / No / non noto (vuoto): il dato non noto resta null. */
const SI_NO_NOTO = [['true', 'Sì'], ['false', 'No']] as const;
const PRADER = ORCHIDOMETRO_PRADER_ML.map((x) => [String(x), `${x} ml`] as const);

export const CAMPI_MISURA: Campo[] = [
  { nome: 'data', etichetta: 'Data', tipo: 'data', obbligatorio: true },
  { min: '30', max: '230', nome: 'altezza_cm', etichetta: 'Statura (cm)', tipo: 'numero', passo: '0.1', aiuto: 'Stadiometro, al millimetro (30–230)' },
  { nome: 'posizione', etichetta: 'Misurata', tipo: 'select', opzioni: [['sdraiato', 'Da sdraiato (lunghezza)'], ['in_piedi', 'In piedi (statura)']],
    aiuto: 'Se vuota: da sdraiato sotto i 2 anni, in piedi dopo' },
  { min: '0.3', max: '250', nome: 'peso_kg', etichetta: 'Peso (kg)', tipo: 'numero', passo: '0.01' },
  { min: '25', max: '70', nome: 'cc_cm', etichetta: 'Circonferenza cranica (cm)', tipo: 'numero', passo: '0.1' },
  { min: '30', max: '200', nome: 'vita_cm', etichetta: 'Circonferenza vita (cm)', tipo: 'numero', passo: '0.1' },
  { min: '15', max: '130', nome: 'altezza_seduto_cm', etichetta: 'Altezza da seduto (cm)', tipo: 'numero', passo: '0.1' },
  { min: '30', max: '240', nome: 'apertura_braccia_cm', etichetta: 'Apertura delle braccia (cm)', tipo: 'numero', passo: '0.1' },
  { min: '50', max: '250', nome: 'pas_mmhg', etichetta: 'Pressione sistolica (mmHg)', tipo: 'numero', passo: '1' },
  { min: '20', max: '160', nome: 'pad_mmhg', etichetta: 'Pressione diastolica (mmHg)', tipo: 'numero', passo: '1' },
  { min: '-8', max: '8', nome: 'velocita_sds', etichetta: 'Velocità di crescita in DS (da tabelle)', tipo: 'numero', passo: '0.01',
    aiuto: 'Letta sulle tabelle di velocità per età e sesso, su almeno 6 mesi; richiede la statura' },
  { nome: 'velocita_riferimento', etichetta: 'Tabelle di velocità usate', tipo: 'testo', segnaposto: 'Es. Tanner-Whitehouse' },
  { nome: 'strumento', etichetta: 'Strumento / chi ha misurato', tipo: 'testo' },
  { nome: 'note', etichetta: 'Note', tipo: 'area' },
];

export const campiPuberta = (sesso: 'M' | 'F'): Campo[] => [
  { nome: 'data', etichetta: 'Data', tipo: 'data', obbligatorio: true },
  ...(sesso === 'F'
    ? [
        { nome: 'tanner_b', etichetta: 'Mammella (B)', tipo: 'select', opzioni: TANNER } as Campo,
        { nome: 'tanner_ph', etichetta: 'Peli pubici (PH)', tipo: 'select', opzioni: TANNER_PH } as Campo,
        { nome: 'menarca', etichetta: 'Menarca avvenuto', tipo: 'select', opzioni: [['false', 'No'], ['true', 'Sì']] } as Campo,
        { nome: 'data_menarca', etichetta: 'Data del menarca', tipo: 'data' } as Campo,
      ]
    : [
        { nome: 'tanner_g', etichetta: 'Genitali (G)', tipo: 'select', opzioni: TANNER } as Campo,
        { nome: 'tanner_ph', etichetta: 'Peli pubici (PH)', tipo: 'select', opzioni: TANNER_PH } as Campo,
        { nome: 'testicolo_dx_ml', etichetta: 'Testicolo destro (orchidometro)', tipo: 'select', opzioni: PRADER } as Campo,
        { nome: 'testicolo_sx_ml', etichetta: 'Testicolo sinistro (orchidometro)', tipo: 'select', opzioni: PRADER } as Campo,
      ]),
  { nome: 'note', etichetta: 'Note', tipo: 'area' },
];

export const CAMPI_ETA_OSSEA: Campo[] = [
  { nome: 'data', etichetta: 'Data della radiografia', tipo: 'data', obbligatorio: true },
  { nome: 'metodo', etichetta: 'Metodo', tipo: 'select', obbligatorio: true, opzioni: voci(METODI_ETA_OSSEA) },
  { min: '0', max: '19', nome: 'eta_ossea_anni', etichetta: 'Età ossea (anni, decimali)', tipo: 'numero', passo: '0.01', obbligatorio: true,
    aiuto: 'Es. 7 anni e 6 mesi = 7,5' },
  { nome: 'refertata_da', etichetta: 'Refertata da', tipo: 'testo' },
  { min: '100', max: '230', nome: 'previsione_statura_cm', etichetta: 'Statura adulta prevista (cm)', tipo: 'numero', passo: '0.1' },
  { nome: 'metodo_previsione', etichetta: 'Metodo della previsione', tipo: 'select', opzioni: voci(METODI_PREVISIONE) },
  { nome: 'note', etichetta: 'Note', tipo: 'area' },
];

export const CAMPI_ESAME: Campo[] = [
  { nome: 'data', etichetta: 'Data del prelievo', tipo: 'data', obbligatorio: true },
  { nome: 'esame', etichetta: 'Esame', tipo: 'select', obbligatorio: true, opzioni: voci(ESAMI_AUXO) },
  { nome: 'descrizione', etichetta: 'Descrizione (obbligatoria per «Altro»)', tipo: 'testo' },
  { nome: 'valore', etichetta: 'Valore', tipo: 'numero', passo: 'any' },
  { nome: 'unita', etichetta: 'Unità di misura', tipo: 'testo', segnaposto: 'Es. ng/mL' },
  { nome: 'rif_min', etichetta: 'Riferimento: minimo', tipo: 'numero', passo: 'any' },
  { nome: 'rif_max', etichetta: 'Riferimento: massimo', tipo: 'numero', passo: 'any' },
  { nome: 'sds', etichetta: 'DS indicata dal laboratorio (es. IGF-1)', tipo: 'numero', passo: '0.01' },
  { nome: 'valore_testo', etichetta: 'Risultato descrittivo', tipo: 'testo', segnaposto: 'Es. 46,XX; negativi' },
  { nome: 'laboratorio', etichetta: 'Laboratorio', tipo: 'testo' },
  { nome: 'note', etichetta: 'Note', tipo: 'area' },
];

export const CAMPI_TEST_GH: Campo[] = [
  { nome: 'data', etichetta: 'Data', tipo: 'data', obbligatorio: true },
  { nome: 'stimolo', etichetta: 'Stimolo', tipo: 'select', obbligatorio: true, opzioni: voci(STIMOLI_GH) },
  { min: '0', max: '99.99', nome: 'picco_ug_l', etichetta: 'Picco di GH (µg/L = ng/mL)', tipo: 'numero', passo: '0.01', obbligatorio: true },
  { nome: 'priming', etichetta: 'Priming con steroidi sessuali', tipo: 'si_no' },
  { nome: 'note', etichetta: 'Note (prelievi, effetti collaterali)', tipo: 'area' },
];

export const CAMPI_DIAGNOSI_AUXO: Campo[] = [
  { nome: 'area', etichetta: 'Area', tipo: 'select', obbligatorio: true, opzioni: voci(AREE_AUXO) },
  { nome: 'descrizione', etichetta: 'Descrizione', tipo: 'testo', obbligatorio: true, ampio: true },
  { nome: 'data_diagnosi', etichetta: 'Data', tipo: 'data' },
  { nome: 'stato', etichetta: 'Stato', tipo: 'select', obbligatorio: true, opzioni: voci(STATI_DIAGNOSI) },
  { nome: 'note', etichetta: 'Note', tipo: 'area' },
];

export const CAMPI_TERAPIA_AUXO: Campo[] = [
  { nome: 'classe', etichetta: 'Classe', tipo: 'select', obbligatorio: true, opzioni: voci(CLASSI_TERAPIA_AUXO) },
  { nome: 'farmaco', etichetta: 'Farmaco (nome commerciale o principio attivo)', tipo: 'testo', obbligatorio: true },
  { nome: 'indicazione_nota39', etichetta: 'Indicazione (Nota AIFA 39)', tipo: 'select', opzioni: voci(INDICAZIONI_NOTA39),
    aiuto: 'Solo per l\'ormone della crescita' },
  { nome: 'posologia', etichetta: 'Posologia', tipo: 'testo', segnaposto: 'Es. 0,9 mg/die s.c. la sera, 7 giorni su 7', ampio: true },
  { min: '1', max: '250', nome: 'peso_riferimento_kg', etichetta: 'Peso di riferimento (kg)', tipo: 'numero', passo: '0.01' },
  { min: '0.1', max: '100', nome: 'dose_ug_kg_die', etichetta: 'Dose (µg/kg/die)', tipo: 'numero', passo: '0.1', aiuto: 'Solo somatropina giornaliera' },
  { nome: 'dal', etichetta: 'Dal', tipo: 'data', obbligatorio: true },
  { nome: 'al', etichetta: 'Al', tipo: 'data' },
  { nome: 'piano_terapeutico_scadenza', etichetta: 'Piano terapeutico: scadenza', tipo: 'data' },
  { nome: 'centro_prescrittore', etichetta: 'Centro prescrittore', tipo: 'testo' },
  { nome: 'motivo_sospensione', etichetta: 'Motivo della sospensione', tipo: 'testo', ampio: true },
  { nome: 'note', etichetta: 'Note', tipo: 'area' },
];

export const CAMPI_CARTELLA_AUXO: Campo[] = [
  { min: '120', max: '230', nome: 'altezza_padre_cm', etichetta: 'Statura del padre biologico (cm)', tipo: 'numero', passo: '0.1' },
  { min: '110', max: '220', nome: 'altezza_madre_cm', etichetta: 'Statura della madre biologica (cm)', tipo: 'numero', passo: '0.1' },
  { nome: 'altezze_genitori_misurate', etichetta: 'Stature dei genitori misurate in ambulatorio?', tipo: 'select', opzioni: [['true', 'Sì, misurate'], ['false', 'No, riferite']] },
  { min: '8', max: '20', nome: 'eta_menarca_madre', etichetta: 'Età del menarca della madre (anni)', tipo: 'numero', passo: '0.1' },
  { nome: 'puberta_padre', etichetta: 'Sviluppo puberale del padre', tipo: 'select',
    opzioni: [['anticipata', 'Anticipato'], ['nella_norma', 'Nella norma'], ['tardiva', 'Tardivo'], ['non_nota', 'Non noto']] },
  { min: '22', max: '44', nome: 'eta_gestazionale_sett', etichetta: 'Età gestazionale (settimane)', tipo: 'numero', passo: '1' },
  { min: '300', max: '6500', nome: 'peso_nascita_g', etichetta: 'Peso alla nascita (g)', tipo: 'numero', passo: '1' },
  { min: '25', max: '65', nome: 'lunghezza_nascita_cm', etichetta: 'Lunghezza alla nascita (cm)', tipo: 'numero', passo: '0.1' },
  { min: '18', max: '45', nome: 'cc_nascita_cm', etichetta: 'Circonferenza cranica alla nascita (cm)', tipo: 'numero', passo: '0.1' },
  { min: '-8', max: '8', nome: 'sds_peso_nascita', etichetta: 'Peso alla nascita: DS per età gestazionale', tipo: 'numero', passo: '0.01',
    aiuto: 'Dalle carte neonatali (Nota 39: carte di Bertino / INeS)' },
  { min: '-8', max: '8', nome: 'sds_lunghezza_nascita', etichetta: 'Lunghezza alla nascita: DS per età gestazionale', tipo: 'numero', passo: '0.01' },
  { nome: 'carte_neonatali', etichetta: 'Carte neonatali usate', tipo: 'testo', segnaposto: 'Es. INeS (Bertino 2010)' },
  { nome: 'lesioni_ipotalamo_ipofisarie', etichetta: 'Malformazioni o lesioni ipotalamo-ipofisarie documentate', tipo: 'select', opzioni: SI_NO_NOTO,
    aiuto: 'Vuoto = non indagato' },
  { nome: 'anamnesi_familiare', etichetta: 'Anamnesi familiare', tipo: 'area', segnaposto: 'Stature, pubertà, patologie endocrine o genetiche in famiglia' },
  { nome: 'anamnesi_fisiologica', etichetta: 'Anamnesi fisiologica', tipo: 'area', segnaposto: 'Gravidanza, parto, allattamento, sviluppo' },
  { nome: 'anamnesi_remota', etichetta: 'Anamnesi patologica remota', tipo: 'area' },
  { nome: 'anamnesi_personale', etichetta: 'Altre notizie (alimentazione, sport, sonno, scuola)', tipo: 'area' },
  { nome: 'farmaci', etichetta: 'Farmaci assunti cronicamente', tipo: 'area' },
  { nome: 'note', etichetta: 'Note', tipo: 'area' },
];

export const PROFILI_AUXO: Record<string, string> = {
  generale: 'Generale', bassa_statura: 'Bassa statura', gh: 'Ormone della crescita', puberta_precoce: 'Pubertà precoce',
  ritardo_puberale: 'Ritardo puberale', obesita: 'Sovrappeso e obesità',
};
