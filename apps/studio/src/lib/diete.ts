/**
 * Indicazioni per le diete di esclusione, per allergene alimentare del catalogo.
 * Contenuto informativo per i genitori e la ristorazione scolastica: va sempre
 * personalizzato dal pediatra/allergologo. Termini di etichetta secondo il
 * Reg. UE 1169/2011 (Allegato II: allergeni da evidenziare in etichetta).
 */
export interface SchedaDieta {
  nome: string;
  evitare: string[];
  etichetta: string[];
  note: string[];
}

export const DIETE: Record<string, SchedaDieta> = {
  latte: {
    nome: 'Proteine del latte vaccino',
    evitare: [
      'Latte vaccino in ogni forma (fresco, UHT, condensato, in polvere) e latte di capra, pecora e bufala (reattività crociata molto frequente)',
      'Yogurt, formaggi freschi e stagionati, ricotta, mozzarella, burro, panna, mascarpone',
      'Gelati, budini, creme, besciamella, purè pronti, dolci e prodotti da forno preparati con latte o burro',
      'Salumi, insaccati e prodotti pronti che riportano latte o derivati tra gli ingredienti',
    ],
    etichetta: ['latte', 'latte in polvere', 'siero di latte', 'caseina', 'caseinati', 'lattoalbumina', 'lattoglobulina', 'burro', 'panna', 'crema di latte', 'formaggio'],
    note: [
      'Nel lattante e nel bambino piccolo il sostituto del latte (formula speciale) lo indica il pediatra.',
      'Le bevande vegetali non sono equivalenti al latte nei bambini piccoli: usarle solo su indicazione del pediatra o del dietista.',
      'Curare l\'apporto di calcio con gli alimenti consentiti.',
    ],
  },
  uovo: {
    nome: 'Uovo',
    evitare: [
      'Uova di gallina (tuorlo e albume) e di altri volatili (anatra, quaglia, oca)',
      'Pasta all\'uovo, ripiena e fresca all\'uovo, gnocchi industriali se contengono uovo',
      'Maionese, salse emulsionate, creme, meringhe, zabaione, budini, gelati',
      'Dolci, biscotti, pan di Spagna e prodotti da forno con uovo; impanature e fritture pastellate',
      'Polpette, frittate, sformati e preparazioni in cui l\'uovo è usato come legante',
    ],
    etichetta: ['uovo', 'uova', 'albume', 'tuorlo', 'ovoalbumina', 'ovomucoide', 'lisozima (E1105)', 'lecitina d\'uovo'],
    note: [
      'Alcuni bambini tollerano l\'uovo ben cotto nei prodotti da forno: reintrodurlo solo su indicazione dell\'allergologo.',
      'La lecitina (E322) può derivare dall\'uovo o dalla soia: verificare l\'origine in etichetta.',
    ],
  },
  glutine: {
    nome: 'Grano (frumento)',
    evitare: [
      'Frumento (grano tenero e duro), farro, kamut e loro farine',
      'Pane, pasta, pizza, focacce, crackers, grissini, fette biscottate, biscotti, torte',
      'Semolino, cous cous, bulgur, pangrattato e impanature, seitan',
      'Salse e minestre addensate con farina, prodotti pronti con farina di frumento',
    ],
    etichetta: ['frumento', 'grano', 'farina di grano', 'semola', 'amido di frumento', 'glutine', 'farro', 'kamut'],
    note: [
      'Orzo, segale e avena: consumarli solo se lo specialista li ha indicati come tollerati.',
      'L\'allergia al grano è diversa dalla celiachia: la dieta per la celiachia segue il Prontuario degli alimenti dell\'Associazione Italiana Celiachia.',
    ],
  },
  arachidi: {
    nome: 'Arachidi',
    evitare: [
      'Arachidi (noccioline americane) intere, tostate, in granella',
      'Burro e crema di arachidi, olio di arachidi, snack e barrette con arachidi',
      'Dolci, gelati, cioccolatini, torroni e cucina etnica (salse satay, piatti orientali) con arachidi',
    ],
    etichetta: ['arachidi', 'noccioline', 'burro di arachidi', 'olio di arachidi', 'olio di semi vari (verificare la composizione)'],
    note: [
      'Possibile reattività crociata con il lupino.',
      'Le reazioni possono essere gravi anche con piccole quantità: attenzione alle tracce («può contenere arachidi»).',
    ],
  },
  frutta_guscio: {
    nome: 'Frutta a guscio',
    evitare: [
      'Mandorle, nocciole, noci, anacardi, noci pecan, noci del Brasile, pistacchi, noci macadamia',
      'Creme spalmabili, torrone, marzapane, pasta di mandorle, praline, gelati alla frutta secca',
      'Pesti e salse che contengono frutta a guscio, granelle, cereali per la colazione e barrette',
      'Bevande e latte di mandorla, oli di frutta a guscio',
    ],
    etichetta: ['mandorle', 'nocciole', 'noci', 'anacardi', 'noci pecan', 'noci del Brasile', 'pistacchi', 'noci macadamia'],
    note: ['L\'esclusione può riguardare solo alcune specie: seguire l\'indicazione dell\'allergologo.'],
  },
  soia: {
    nome: 'Soia',
    evitare: [
      'Soia in semi ed edamame, farina di soia, proteine di soia',
      'Tofu, tempeh, miso, salsa di soia, bevande e dessert di soia',
      'Prodotti vegetariani pronti, carni ricostituite e prodotti da forno con soia',
    ],
    etichetta: ['soia', 'proteine di soia', 'farina di soia', 'lecitina di soia (E322)'],
    note: ['La lecitina e l\'olio di soia raffinato sono spesso tollerati: valutare con l\'allergologo.'],
  },
  pesce: {
    nome: 'Pesce',
    evitare: [
      'Tutte le specie di pesce, fresco, surgelato, in scatola (tonno, sgombro, acciughe, salmone…)',
      'Brodi e fumetti di pesce, bottarga, colatura e pasta d\'acciughe, salsa Worcester',
      'Surimi, bastoncini di pesce, sughi e ripieni con pesce',
    ],
    etichetta: ['pesce', 'acciughe', 'tonno', 'merluzzo', 'olio di pesce', 'gelatina di pesce'],
    note: ['Alcuni bambini tollerano singole specie: introdurle solo su indicazione dell\'allergologo.'],
  },
  crostacei: {
    nome: 'Crostacei',
    evitare: ['Gamberi, gamberetti, mazzancolle, scampi, aragoste, astici, granchi', 'Surimi, zuppe e sughi di pesce, cucina orientale con crostacei'],
    etichetta: ['crostacei', 'gamberi', 'granchio', 'scampi'],
    note: ['Possibile reattività crociata con acari della polvere e altri invertebrati.'],
  },
  molluschi: {
    nome: 'Molluschi',
    evitare: ['Cozze, vongole, ostriche, capesante', 'Calamari, seppie, polpi, totani', 'Lumache', 'Sughi, zuppe e insalate di mare'],
    etichetta: ['molluschi', 'cozze', 'vongole', 'calamari', 'seppie', 'polpo'],
    note: [],
  },
  sesamo: {
    nome: 'Sesamo',
    evitare: ['Semi e olio di sesamo, tahina, hummus, gomasio', 'Pane, grissini, crackers, panini e prodotti da forno con sesamo', 'Cucina mediorientale e orientale'],
    etichetta: ['sesamo', 'semi di sesamo', 'olio di sesamo', 'tahina', 'tahini'],
    note: [],
  },
  sedano: {
    nome: 'Sedano',
    evitare: ['Sedano e sedano rapa, crudi e cotti', 'Dadi, preparati per brodo, minestre e minestroni pronti', 'Sughi, ragù, soffritti pronti, sale aromatizzato'],
    etichetta: ['sedano', 'sedano rapa', 'aromi (verificare)'],
    note: [],
  },
  senape: {
    nome: 'Senape',
    evitare: ['Senape in salsa, in semi, in polvere', 'Maionese e salse industriali, condimenti per insalata, miscele di spezie e curry'],
    etichetta: ['senape', 'semi di senape'],
    note: [],
  },
  lupini: {
    nome: 'Lupino',
    evitare: ['Lupini', 'Farina di lupino in pane, pasta e prodotti da forno (anche senza glutine)', 'Prodotti vegetariani con proteine di lupino'],
    etichetta: ['lupino', 'farina di lupino'],
    note: ['Possibile reattività crociata con le arachidi.'],
  },
  solfiti: {
    nome: 'Anidride solforosa e solfiti',
    evitare: ['Frutta secca conservata (albicocche, uvetta), succhi e sciroppi conservati', 'Aceto, sottaceti e conserve, alcuni crostacei trattati', 'Patate e verdure preparate industrialmente'],
    etichetta: ['solfiti', 'anidride solforosa', 'E220', 'E221', 'E222', 'E223', 'E224', 'E226', 'E227', 'E228'],
    note: ['Nei bambini le reazioni ai solfiti sono di solito non allergiche (sensibilità): la quantità tollerata va definita con lo specialista.'],
  },
  frutta_verdura: {
    nome: 'Frutta e verdura fresche',
    evitare: ['Il frutto o l\'ortaggio indicato nel dettaglio, crudo', 'Succhi, frullati, gelati e macedonie che lo contengono'],
    etichetta: ['nome del frutto o dell\'ortaggio indicato'],
    note: ['Nella sindrome orale allergica il frutto spesso è tollerato cotto o sbucciato: seguire l\'indicazione dell\'allergologo.'],
  },
};

export const AVVERTENZA_DIETA =
  'Indicazioni generali da adattare al singolo bambino. Leggere sempre l\'etichetta: gli allergeni sono evidenziati ' +
  'nell\'elenco degli ingredienti (Reg. UE 1169/2011). In caso di dubbio non somministrare l\'alimento.';

/** Fine dell'anno scolastico in corso (30 giugno). */
export function fineAnnoScolastico(oggi: Date = new Date()): string {
  const anno = oggi.getMonth() >= 6 ? oggi.getFullYear() + 1 : oggi.getFullYear();
  return `${anno}-06-30`;
}
