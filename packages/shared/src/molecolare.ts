// -----------------------------------------------------------------------------
// Diagnostica molecolare (component-resolved diagnosis) e IgE specifiche.
//
// Cataloghi dei componenti delle due piattaforme multiplex più usate:
// - ImmunoCAP ISAC E112i (Thermo Fisher): 112 componenti da 48 fonti, risultati
//   semiquantitativi in ISU-E; < 0,3 ISU-E non rilevabile.
// - ALEX² Allergy Xplorer (MacroArray Diagnostics): 295 allergeni, di cui 178
//   componenti molecolari (qui solo i componenti; gli estratti si registrano come
//   IgE specifiche). Risultati in kUA/L; < 0,3 kUA/L negativo/incerto.
// Fonti: elenco componenti ISAC E112i (HVD/Thermo Fisher); "ALEX² allergen list"
// (MacroArray Diagnostics); classi da Diagnostics 2024;14(10):976.
// La famiglia proteica è un dato descrittivo della molecola (WHO/IUIS, Allergome):
// il programma non ne trae giudizi di rischio, l'interpretazione resta del medico.
// -----------------------------------------------------------------------------

export type CategoriaIgE = 'alimenti' | 'inalanti' | 'altro';
export type Piattaforma = 'ISAC' | 'ALEX' | 'ImmunoCAP';

export const CATEGORIE_ALLERGENE: Record<CategoriaIgE, string> = {
  alimenti: 'Alimenti',
  inalanti: 'Inalanti',
  altro: 'Altri (lattice, veleni, marcatori CCD)',
};

export const PIATTAFORME: Record<Piattaforma, { nome: string; unita: string; cutoff: number; nota: string }> = {
  ISAC: { nome: 'ImmunoCAP ISAC E112i', unita: 'ISU-E', cutoff: 0.3, nota: 'semiquantitativo; < 0,3 ISU-E non rilevabile' },
  ALEX: { nome: 'ALEX² Allergy Xplorer', unita: 'kUA/L', cutoff: 0.3, nota: '< 0,3 kUA/L negativo o incerto' },
  ImmunoCAP: { nome: 'ImmunoCAP (singoli componenti)', unita: 'kUA/L', cutoff: 0.35, nota: '≥ 0,35 kUA/L sensibilizzazione (0,10–0,34 bassa)' },
};

export interface Componente {
  /** Nome WHO/IUIS senza prefisso n/r, es. "Ara h 2". */
  codice: string;
  fonte: string;
  famiglia: string;
  categoria: CategoriaIgE;
  gruppo: string;
  isac: boolean;
  alex: boolean;
  /** Solo ricerca (RUO) sul pannello ALEX². */
  ruo: boolean;
}

// [codice, famiglia, piattaforme] — piattaforme: I = ISAC E112i, A = ALEX², R = ALEX² solo ricerca
type Voce = readonly [string, string, string];
interface Fonte { fonte: string; voci: readonly Voce[] }
interface Gruppo { gruppo: string; categoria: CategoriaIgE; fonti: readonly Fonte[] }

const GRUPPI: readonly Gruppo[] = [
  // ---------------------------------------------------------------- ALIMENTI
  { gruppo: 'Latte e uovo', categoria: 'alimenti', fonti: [
    { fonte: 'Latte vaccino', voci: [['Bos d 4', 'α-lattoalbumina', 'IA'], ['Bos d 5', 'β-lattoglobulina', 'IA'], ['Bos d 8', 'caseine', 'IA'], ['Bos d lattoferrina', 'lattoferrina', 'I']] },
    { fonte: 'Uovo (albume)', voci: [['Gal d 1', 'ovomucoide', 'IA'], ['Gal d 2', 'ovoalbumina', 'IA'], ['Gal d 3', 'ovotransferrina', 'IA'], ['Gal d 4', 'lisozima', 'A']] },
    { fonte: 'Uovo (tuorlo)', voci: [['Gal d 5', 'α-livetina (albumina sierica)', 'IA']] },
  ] },
  { gruppo: 'Carni', categoria: 'alimenti', fonti: [
    { fonte: 'Bovino (carne e latte)', voci: [['Bos d 6', 'albumina sierica', 'IA']] },
    { fonte: 'Maiale', voci: [['Sus d 1', 'albumina sierica', 'A']] },
    { fonte: 'Carni di mammifero', voci: [['Alpha-Gal', 'carboidrato galattosio-α-1,3-galattosio', 'I']] },
  ] },
  { gruppo: 'Pesci', categoria: 'alimenti', fonti: [
    { fonte: 'Merluzzo baltico (Gadus callarias)', voci: [['Gad c 1', 'parvalbumina', 'I']] },
    { fonte: 'Merluzzo (Gadus morhua)', voci: [['Gad m 1', 'parvalbumina', 'A'], ['Gad m 2+3', 'β-enolasi + aldolasi', 'A']] },
    { fonte: 'Aringa', voci: [['Clu h 1', 'parvalbumina', 'A']] },
    { fonte: 'Sgombro', voci: [['Sco s 1', 'parvalbumina', 'A']] },
    { fonte: 'Carpa', voci: [['Cyp c 1', 'parvalbumina', 'A']] },
    { fonte: 'Pesce spada', voci: [['Xip g 1', 'parvalbumina', 'A']] },
    { fonte: 'Razza chiodata', voci: [['Raj c', 'parvalbumina', 'A']] },
    { fonte: 'Tonno', voci: [['Thu a 1', 'parvalbumina', 'A']] },
  ] },
  { gruppo: 'Crostacei e parassiti del pesce', categoria: 'alimenti', fonti: [
    { fonte: 'Gambero tigre (Penaeus monodon)', voci: [['Pen m 1', 'tropomiosina', 'IA'], ['Pen m 2', 'arginina chinasi', 'IA'], ['Pen m 3', 'catena leggera della miosina', 'A'], ['Pen m 4', 'proteina sarcoplasmatica legante il calcio', 'IA']] },
    { fonte: 'Gamberetto grigio (Crangon crangon)', voci: [['Cra c 6', 'troponina C', 'A']] },
    { fonte: 'Anisakis simplex', voci: [['Ani s 1', 'inibitore delle serin-proteasi', 'IA'], ['Ani s 3', 'tropomiosina', 'IA']] },
  ] },
  { gruppo: 'Legumi', categoria: 'alimenti', fonti: [
    { fonte: 'Arachide', voci: [['Ara h 1', 'vicilina 7S', 'IA'], ['Ara h 2', 'albumina 2S', 'IA'], ['Ara h 3', 'legumina 11S', 'IA'], ['Ara h 6', 'albumina 2S', 'IA'],
      ['Ara h 8', 'PR-10', 'IA'], ['Ara h 9', 'LTP', 'IA'], ['Ara h 15', 'oleosina', 'A']] },
    { fonte: 'Soia', voci: [['Gly m 4', 'PR-10', 'IA'], ['Gly m 5', 'β-conglicinina (vicilina 7S)', 'IA'], ['Gly m 6', 'glicinina (legumina 11S)', 'IA'], ['Gly m 8', 'albumina 2S', 'A']] },
  ] },
  { gruppo: 'Frutta a guscio e semi', categoria: 'alimenti', fonti: [
    { fonte: 'Nocciola', voci: [['Cor a 1.0401', 'PR-10', 'IA'], ['Cor a 8', 'LTP', 'IA'], ['Cor a 9', 'legumina 11S', 'IA'], ['Cor a 11', 'vicilina 7S', 'A'],
      ['Cor a 12', 'oleosina', 'R'], ['Cor a 14', 'albumina 2S', 'IA']] },
    { fonte: 'Noce', voci: [['Jug r 1', 'albumina 2S', 'IA'], ['Jug r 2', 'vicilina 7S', 'A'], ['Jug r 3', 'LTP', 'IA'], ['Jug r 4', 'legumina 11S', 'A'], ['Jug r 6', 'vicilina 7S', 'A']] },
    { fonte: 'Anacardio', voci: [['Ana o 2', 'legumina 11S', 'IA'], ['Ana o 3', 'albumina 2S', 'IA']] },
    { fonte: 'Pistacchio', voci: [['Pis v 1', 'albumina 2S', 'A'], ['Pis v 2', 'legumina 11S', 'A'], ['Pis v 3', 'vicilina 7S', 'A'], ['Pis v 4', 'Mn-superossido dismutasi', 'R']] },
    { fonte: 'Noce del Brasile', voci: [['Ber e 1', 'albumina 2S', 'IA']] },
    { fonte: 'Noce macadamia', voci: [['Mac i 2S albumina', 'albumina 2S', 'A']] },
    { fonte: 'Sesamo', voci: [['Ses i 1', 'albumina 2S', 'IA']] },
    { fonte: 'Semi di papavero', voci: [['Pap s 2S albumina', 'albumina 2S', 'A']] },
    { fonte: 'Senape', voci: [['Sin a 1', 'albumina 2S', 'A']] },
  ] },
  { gruppo: 'Cereali', categoria: 'alimenti', fonti: [
    { fonte: 'Grano', voci: [['Tri a 14', 'LTP', 'IA'], ['Tri a 19', 'ω-5-gliadina', 'IA'], ['Tri a aA_TI', 'inibitore α-amilasi/tripsina', 'IA']] },
    { fonte: 'Grano saraceno', voci: [['Fag e 2', 'albumina 2S', 'IA']] },
    { fonte: 'Mais', voci: [['Zea m 14', 'LTP', 'A']] },
  ] },
  { gruppo: 'Frutta', categoria: 'alimenti', fonti: [
    { fonte: 'Pesca', voci: [['Pru p 1', 'PR-10', 'I'], ['Pru p 3', 'LTP', 'IA'], ['Pru p 7', 'proteina regolata dalla gibberellina (GRP)', 'R']] },
    { fonte: 'Mela', voci: [['Mal d 1', 'PR-10', 'IA'], ['Mal d 2', 'proteina taumatina-simile', 'A'], ['Mal d 3', 'LTP', 'A']] },
    { fonte: 'Kiwi', voci: [['Act d 1', 'actinidina (cisteina-proteasi)', 'IA'], ['Act d 2', 'proteina taumatina-simile', 'IA'], ['Act d 5', 'kiwellina', 'IA'],
      ['Act d 8', 'PR-10', 'I'], ['Act d 10', 'LTP', 'A']] },
    { fonte: 'Fragola', voci: [['Fra a 1+3', 'PR-10 + LTP', 'A']] },
    { fonte: 'Uva', voci: [['Vit v 1', 'LTP', 'A']] },
    { fonte: 'Melone', voci: [['Cuc m 2', 'profilina', 'A']] },
  ] },
  { gruppo: 'Verdure', categoria: 'alimenti', fonti: [
    { fonte: 'Sedano', voci: [['Api g 1', 'PR-10', 'IA'], ['Api g 2', 'LTP', 'A'], ['Api g 6', 'LTP', 'A']] },
    { fonte: 'Carota', voci: [['Dau c 1', 'PR-10', 'A']] },
    { fonte: 'Pomodoro', voci: [['Sola l 6', 'LTP', 'A']] },
  ] },

  // ---------------------------------------------------------------- INALANTI
  { gruppo: 'Acari', categoria: 'inalanti', fonti: [
    { fonte: 'Dermatophagoides pteronyssinus', voci: [['Der p 1', 'cisteina-proteasi', 'IA'], ['Der p 2', 'NPC2', 'IA'], ['Der p 5', 'gruppo 5', 'A'], ['Der p 7', 'gruppo 7', 'A'],
      ['Der p 10', 'tropomiosina', 'IA'], ['Der p 11', 'paramiosina', 'A'], ['Der p 20', 'arginina chinasi', 'A'], ['Der p 21', 'gruppo 21', 'A'], ['Der p 23', 'proteina peritrofina-simile', 'IA']] },
    { fonte: 'Dermatophagoides farinae', voci: [['Der f 1', 'cisteina-proteasi', 'IA'], ['Der f 2', 'NPC2', 'IA']] },
    { fonte: 'Blomia tropicalis', voci: [['Blo t 5', 'gruppo 5', 'IA'], ['Blo t 10', 'tropomiosina', 'A'], ['Blo t 21', 'gruppo 21', 'A']] },
    { fonte: 'Lepidoglyphus destructor', voci: [['Lep d 2', 'NPC2', 'IA']] },
    { fonte: 'Glycyphagus domesticus', voci: [['Gly d 2', 'NPC2', 'A']] },
    { fonte: 'Tyrophagus putrescentiae', voci: [['Tyr p 2', 'NPC2', 'A']] },
  ] },
  { gruppo: 'Blatte', categoria: 'inalanti', fonti: [
    { fonte: 'Blatta germanica', voci: [['Bla g 1', 'gruppo 1', 'IA'], ['Bla g 2', 'aspartico-proteasi (inattiva)', 'IA'], ['Bla g 4', 'lipocalina', 'A'],
      ['Bla g 5', 'glutatione S-transferasi', 'IA'], ['Bla g 7', 'tropomiosina', 'I'], ['Bla g 9', 'arginina chinasi', 'A']] },
    { fonte: 'Blatta americana', voci: [['Per a 7', 'tropomiosina', 'A']] },
  ] },
  { gruppo: 'Animali', categoria: 'inalanti', fonti: [
    { fonte: 'Gatto', voci: [['Fel d 1', 'uteroglobina (secretoglobina)', 'IA'], ['Fel d 2', 'albumina sierica', 'IA'], ['Fel d 4', 'lipocalina', 'IA'], ['Fel d 7', 'lipocalina', 'A']] },
    { fonte: 'Cane', voci: [['Can f 1', 'lipocalina', 'IA'], ['Can f 2', 'lipocalina', 'IA'], ['Can f 3', 'albumina sierica', 'IA'], ['Can f 4', 'lipocalina', 'IA'],
      ['Can f 5', 'callicreina prostatica', 'I'], ['Can f 6', 'lipocalina', 'IA'], ['Can f Fel d 1-like', 'uteroglobina', 'A']] },
    { fonte: 'Cavallo', voci: [['Equ c 1', 'lipocalina', 'IA'], ['Equ c 3', 'albumina sierica', 'IA'], ['Equ c 4', 'laterina', 'A']] },
    { fonte: 'Topo', voci: [['Mus m 1', 'lipocalina (MUP)', 'IA']] },
    { fonte: 'Bovino (forfora)', voci: [['Bos d 2', 'lipocalina', 'A']] },
    { fonte: 'Cavia', voci: [['Cav p 1', 'lipocalina', 'A']] },
    { fonte: 'Coniglio', voci: [['Ory c 1', 'lipocalina', 'A'], ['Ory c 2', 'lipocalina', 'A'], ['Ory c 3', 'secretoglobina', 'A']] },
    { fonte: 'Criceto siberiano', voci: [['Phod s 1', 'lipocalina', 'A']] },
    { fonte: 'Criceto dorato', voci: [['Mes a 1', 'lipocalina', 'R']] },
  ] },
  { gruppo: 'Pollini di graminacee', categoria: 'inalanti', fonti: [
    { fonte: 'Fleolo (Phleum pratense)', voci: [['Phl p 1', 'β-espansina (gruppo 1)', 'IA'], ['Phl p 2', 'gruppo 2', 'IA'], ['Phl p 4', 'enzima BBE', 'I'],
      ['Phl p 5', 'gruppo 5', 'IA'], ['Phl p 6', 'gruppo 6', 'IA'], ['Phl p 7', 'polcalcina', 'IA'], ['Phl p 11', 'proteina Ole e 1-simile', 'I'], ['Phl p 12', 'profilina', 'IA']] },
    { fonte: 'Loglio', voci: [['Lol p 1', 'β-espansina (gruppo 1)', 'A']] },
    { fonte: 'Gramigna (Cynodon dactylon)', voci: [['Cyn d 1', 'β-espansina (gruppo 1)', 'IA']] },
  ] },
  { gruppo: 'Pollini di alberi', categoria: 'inalanti', fonti: [
    { fonte: 'Olivo', voci: [['Ole e 1', 'proteina Ole e 1', 'IA'], ['Ole e 7', 'LTP', 'IR'], ['Ole e 9', 'β-1,3-glucanasi', 'IA']] },
    { fonte: 'Cipresso dell\'Arizona', voci: [['Cup a 1', 'pectato liasi', 'IA']] },
    { fonte: 'Cedro giapponese', voci: [['Cry j 1', 'pectato liasi', 'IA']] },
    { fonte: 'Betulla', voci: [['Bet v 1', 'PR-10', 'IA'], ['Bet v 2', 'profilina', 'IA'], ['Bet v 4', 'polcalcina', 'I'], ['Bet v 6', 'isoflavone reduttasi', 'A']] },
    { fonte: 'Ontano', voci: [['Aln g 1', 'PR-10', 'IA'], ['Aln g 4', 'polcalcina', 'A']] },
    { fonte: 'Nocciolo (polline)', voci: [['Cor a 1.0101', 'PR-10', 'I'], ['Cor a 1.0103', 'PR-10', 'A']] },
    { fonte: 'Faggio', voci: [['Fag s 1', 'PR-10', 'A']] },
    { fonte: 'Frassino', voci: [['Fra e 1', 'proteina Ole e 1-simile', 'A']] },
    { fonte: 'Platano', voci: [['Pla a 1', 'inibitore dell\'invertasi', 'IA'], ['Pla a 2', 'poligalatturonasi', 'A'], ['Pla a 3', 'LTP', 'IA']] },
    { fonte: 'Palma da datteri', voci: [['Pho d 2', 'profilina', 'A']] },
  ] },
  { gruppo: 'Pollini di erbe infestanti', categoria: 'inalanti', fonti: [
    { fonte: 'Parietaria', voci: [['Par j 2', 'LTP', 'IA']] },
    { fonte: 'Artemisia', voci: [['Art v 1', 'defensina', 'IA'], ['Art v 3', 'LTP', 'IA']] },
    { fonte: 'Ambrosia', voci: [['Amb a 1', 'pectato liasi', 'IA'], ['Amb a 4', 'defensina', 'A']] },
    { fonte: 'Piantaggine', voci: [['Pla l 1', 'proteina Ole e 1-simile', 'IA']] },
    { fonte: 'Farinello (Chenopodium)', voci: [['Che a 1', 'proteina Ole e 1-simile', 'IA']] },
    { fonte: 'Salsola', voci: [['Sal k 1', 'pectina metilesterasi', 'IA']] },
    { fonte: 'Mercorella', voci: [['Mer a 1', 'profilina', 'IA']] },
    { fonte: 'Canapa', voci: [['Can s 3', 'LTP', 'A']] },
  ] },
  { gruppo: 'Muffe e lieviti', categoria: 'inalanti', fonti: [
    { fonte: 'Alternaria alternata', voci: [['Alt a 1', 'proteina Alt a 1', 'IA'], ['Alt a 6', 'enolasi', 'IA']] },
    { fonte: 'Aspergillus fumigatus', voci: [['Asp f 1', 'ribotossina', 'IA'], ['Asp f 3', 'perossiredossina', 'IA'], ['Asp f 4', '—', 'A'], ['Asp f 6', 'Mn-superossido dismutasi', 'IA']] },
    { fonte: 'Cladosporium herbarum', voci: [['Cla h 8', 'mannitolo deidrogenasi', 'IA']] },
    { fonte: 'Malassezia sympodialis', voci: [['Mala s 5', '—', 'A'], ['Mala s 6', 'ciclofillina', 'A'], ['Mala s 11', 'Mn-superossido dismutasi', 'A']] },
  ] },

  // ---------------------------------------------------------------- ALTRO
  { gruppo: 'Lattice', categoria: 'altro', fonti: [
    { fonte: 'Lattice (Hevea brasiliensis)', voci: [['Hev b 1', 'fattore di allungamento della gomma', 'IA'], ['Hev b 3', 'proteina delle piccole particelle di gomma', 'IA'],
      ['Hev b 5', 'proteina acida', 'IA'], ['Hev b 6.02', 'eveina', 'IA'], ['Hev b 8', 'profilina', 'IA'], ['Hev b 11', 'chitinasi di classe I', 'A']] },
  ] },
  { gruppo: 'Veleni di imenotteri', categoria: 'altro', fonti: [
    { fonte: 'Ape', voci: [['Api m 1', 'fosfolipasi A2', 'A'], ['Api m 10', 'icarapina', 'A']] },
    { fonte: 'Vespula', voci: [['Ves v 1', 'fosfolipasi A1', 'A'], ['Ves v 5', 'antigene 5', 'A']] },
    { fonte: 'Polistes', voci: [['Pol d 5', 'antigene 5', 'A']] },
  ] },
  { gruppo: 'Marcatori e altri', categoria: 'altro', fonti: [
    { fonte: 'Marcatore CCD', voci: [['MUXF3', 'carboidrato (CCD)', 'I'], ['Hom s LF', 'lattoferrina umana glicosilata (marcatore CCD)', 'A']] },
    { fonte: 'Zecca del piccione', voci: [['Arg r 1', 'lipocalina', 'A']] },
  ] },
];

export const COMPONENTI: readonly Componente[] = GRUPPI.flatMap((g) => g.fonti.flatMap((f) => f.voci.map(([codice, famiglia, p]) => ({
  codice, famiglia, fonte: f.fonte, gruppo: g.gruppo, categoria: g.categoria,
  isac: p.includes('I'), alex: p.includes('A') || p.includes('R'), ruo: p.includes('R'),
}))));

export const GRUPPI_COMPONENTI = GRUPPI.map((g) => ({ gruppo: g.gruppo, categoria: g.categoria }));

/** Componenti presenti su una piattaforma (ImmunoCAP singolo: tutti quelli in elenco). */
export function componentiDi(p: Piattaforma): Componente[] {
  return COMPONENTI.filter((c) => (p === 'ISAC' ? c.isac : p === 'ALEX' ? c.alex : true));
}

const chiave = (s: string) => s.toLowerCase().replace(/[\s.]+/g, ' ').trim();
const INDICE = new Map(COMPONENTI.map((c) => [chiave(c.codice), c]));
// Varianti di nome che compaiono nei referti di laboratorio.
const ALIAS: Record<string, string> = {
  'tri a 19.0101': 'Tri a 19', 'phl p 5b': 'Phl p 5', 'phl p 5 0101': 'Phl p 5', 'art v 1 0101': 'Art v 1', 'art v 3 0201': 'Art v 3',
  'bos d lactoferrin': 'Bos d lattoferrina', 'bos d lf': 'Bos d lattoferrina', 'gad m 2&3': 'Gad m 2+3', 'fra a 1 + fra a 3': 'Fra a 1+3',
  'alfa-gal': 'Alpha-Gal', 'alpha-gal': 'Alpha-Gal', 'gal-alfa-1,3-gal': 'Alpha-Gal', 'hom s lf ccd': 'Hom s LF', 'ccd': 'MUXF3',
};

const ALIAS_N = new Map(Object.entries(ALIAS).map(([k, v]) => [chiave(k), chiave(v)]));

/** Trova un componente dal nome scritto in un referto (tollera prefisso n/r e varianti). */
export function trovaComponente(nome: string): Componente | null {
  const k = chiave(nome);
  // Prefisso n (nativo) / r (ricombinante) dei referti: si toglie solo se il resto è un componente noto.
  for (const x of /^[nr]\S/.test(k) ? [k, k.slice(1)] : [k]) {
    const c = INDICE.get(x) ?? INDICE.get(ALIAS_N.get(x) ?? '');
    if (c) return c;
  }
  return null;
}

/** Esito rispetto al cut-off della piattaforma (solo supporto alla registrazione). */
export function esitoComponente(valore: number, p: Piattaforma): 'positivo' | 'negativo' {
  return valore >= PIATTAFORME[p].cutoff ? 'positivo' : 'negativo';
}

/** Piattaforma dal testo della metodica registrata. */
export function piattaformaDa(metodica: unknown): Piattaforma | null {
  const m = String(metodica ?? '').toLowerCase();
  if (m.includes('isac')) return 'ISAC';
  if (m.includes('alex')) return 'ALEX';
  if (m.includes('immunocap')) return 'ImmunoCAP';
  return null;
}

// -----------------------------------------------------------------------------
// IgE specifiche su estratto: pannello delle più richieste in età pediatrica
// (codici ImmunoCAP). Si compilano solo quelli eseguiti.
// -----------------------------------------------------------------------------
export interface EstrattoIgE { codice: string; nome: string; categoria: CategoriaIgE }

export const PANNELLO_IGE: readonly EstrattoIgE[] = ([
  ['d1', 'Dermatophagoides pteronyssinus', 'inalanti'], ['d2', 'Dermatophagoides farinae', 'inalanti'],
  ['g6', 'Fleolo (graminacee)', 'inalanti'], ['g2', 'Gramigna (Cynodon dactylon)', 'inalanti'],
  ['w21', 'Parietaria judaica', 'inalanti'], ['w6', 'Artemisia', 'inalanti'], ['w1', 'Ambrosia', 'inalanti'],
  ['t9', 'Olivo', 'inalanti'], ['t23', 'Cipresso', 'inalanti'], ['t3', 'Betulla', 'inalanti'], ['t4', 'Nocciolo (polline)', 'inalanti'], ['t11', 'Platano', 'inalanti'],
  ['e1', 'Gatto (forfora)', 'inalanti'], ['e5', 'Cane (forfora)', 'inalanti'], ['e3', 'Cavallo (forfora)', 'inalanti'],
  ['m6', 'Alternaria alternata', 'inalanti'], ['m2', 'Cladosporium herbarum', 'inalanti'], ['i6', 'Blatta germanica', 'inalanti'],
  ['f1', 'Albume', 'alimenti'], ['f75', 'Tuorlo', 'alimenti'], ['f2', 'Latte vaccino', 'alimenti'], ['f4', 'Grano', 'alimenti'], ['f14', 'Soia', 'alimenti'],
  ['f13', 'Arachide', 'alimenti'], ['f17', 'Nocciola', 'alimenti'], ['f256', 'Noce', 'alimenti'], ['f202', 'Anacardio', 'alimenti'], ['f203', 'Pistacchio', 'alimenti'],
  ['f10', 'Sesamo', 'alimenti'], ['f3', 'Merluzzo', 'alimenti'], ['f24', 'Gambero', 'alimenti'], ['f95', 'Pesca', 'alimenti'], ['f49', 'Mela', 'alimenti'],
  ['f84', 'Kiwi', 'alimenti'], ['f25', 'Pomodoro', 'alimenti'], ['f85', 'Sedano', 'alimenti'],
  ['k82', 'Lattice', 'altro'], ['i1', 'Veleno d\'ape', 'altro'], ['i3', 'Veleno di vespula', 'altro'],
] as const).map(([codice, nome, categoria]) => ({ codice, nome, categoria }));

const INDICE_ESTRATTI = new Map(PANNELLO_IGE.map((e) => [e.nome.toLowerCase(), e]));

/** Categoria (alimenti / inalanti / altro) di un allergene registrato, se riconosciuto. */
export function categoriaAllergene(nome: string, molecolare: boolean): CategoriaIgE | null {
  if (molecolare) return trovaComponente(nome)?.categoria ?? null;
  return INDICE_ESTRATTI.get(nome.toLowerCase())?.categoria ?? null;
}
