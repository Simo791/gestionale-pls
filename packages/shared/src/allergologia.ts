/**
 * Modulo Allergologia pediatrica: tipi e calcolatori dei punteggi validati.
 *
 * I calcolatori riproducono le regole di punteggio pubblicate (riferimenti accanto a
 * ciascuno). Sono strumenti di supporto alla registrazione e NON formulano diagnosi:
 * l'interpretazione resta del medico. Le domande dei questionari protetti da licenza
 * (c-ACT, ACT) non sono riprodotte: si registra il punteggio di ciascuna voce.
 */
import type { ISODate, ISODateTime, UUID } from './tipi';

// -----------------------------------------------------------------------------
// Tipi delle tabelle
// -----------------------------------------------------------------------------
export interface AllergoPaziente {
  id: UUID;
  studio_id: UUID;
  nome: string;
  cognome: string;
  data_nascita: ISODate;
  sesso: 'M' | 'F';
  genitore_nome: string | null;
  genitore_telefono: string | null;
  genitore_email: string | null;
  pediatra_curante: string | null;
  inviato_da: string | null;
  note_organizzative: string | null;
  luogo_nascita?: string | null;
  residenza?: string | null;
  stato: 'attivo' | 'archiviato';
  creato_il: ISODateTime;
}

export interface AllergoCartella {
  pseudo_id: UUID;
  sesso: 'M' | 'F';
  familiarita: string[];
  anamnesi_perinatale: string | null;
  alimentazione: string | null;
  fumo_passivo: boolean | null;
  animali: string | null;
  muffe_umidita: boolean | null;
  comunita: string | null;
  anamnesi_personale: string | null;
  note: string | null;
  anamnesi_familiare?: string | null;
  anamnesi_fisiologica?: string | null;
  anamnesi_remota?: string | null;
  abitazione?: string | null;
  fumo_dettaglio?: string | null;
  farmaci?: string | null;
  sport?: string | null;
}

export type AreaAllergo =
  | 'asma' | 'wheezing_prescolare' | 'rinite' | 'congiuntivite' | 'dermatite_atopica' | 'allergia_alimentare'
  | 'anafilassi' | 'orticaria' | 'angioedema' | 'farmaci' | 'imenotteri' | 'eso_eosinofila' | 'fpies'
  | 'proctocolite' | 'contatto' | 'altro';

export const AREE_ALLERGO: Record<AreaAllergo, string> = {
  asma: 'Asma',
  wheezing_prescolare: 'Wheezing prescolare',
  rinite: 'Rinite allergica',
  congiuntivite: 'Congiuntivite allergica',
  dermatite_atopica: 'Dermatite atopica',
  allergia_alimentare: 'Allergia alimentare IgE-mediata',
  anafilassi: 'Anafilassi',
  orticaria: 'Orticaria',
  angioedema: 'Angioedema',
  farmaci: 'Allergia a farmaci',
  imenotteri: 'Allergia a veleno di imenotteri',
  eso_eosinofila: 'Esofagite eosinofila',
  fpies: 'FPIES (enterocolite da proteine alimentari)',
  proctocolite: 'Proctocolite allergica',
  contatto: 'Dermatite allergica da contatto',
  altro: 'Altro',
};

/** Riga generica di una tabella clinica del modulo. */
export type RigaAllergo = { id: UUID; pseudo_id: UUID } & Record<string, unknown>;

// -----------------------------------------------------------------------------
// Utilità
// -----------------------------------------------------------------------------
const arrotonda1 = (n: number) => Math.round(n * 10) / 10;
const somma = (v: number[]) => v.reduce((a, b) => a + b, 0);
const intero = (v: number, min: number, max: number) => Number.isInteger(v) && v >= min && v <= max;

export interface Esito<T extends string = string> {
  totale: number;
  livello: T;
  etichetta: string;
  tono: 'ok' | 'attenzione' | 'errore' | 'neutro';
}

// -----------------------------------------------------------------------------
// SCORAD — European Task Force on Atopic Dermatitis, Dermatology 1993;186:23-31.
// SCORAD = A/5 + 7B/2 + C (0–103). Gravità (Oranje AP et al., BJD 2007;157:645):
// < 25 lieve, 25–50 moderata, > 50 grave. SCORAD oggettivo = A/5 + 7B/2 (0–83):
// < 15 lieve, 15–40 moderata, > 40 grave (Kunz B et al., Dermatology 1997;195:10).
// -----------------------------------------------------------------------------
export const VOCI_INTENSITA_SCORAD = ['Eritema', 'Edema/papule', 'Essudazione/croste', 'Escoriazioni', 'Lichenificazione', 'Xerosi (cute non lesionata)'] as const;

export interface InputScorad {
  /** A: superficie interessata, % (0–100), regola del 9 adattata all'età. */
  estensione: number;
  /** B: sei segni, ciascuno 0–3, valutati su un'area rappresentativa. */
  intensita: number[];
  /** C: prurito e perdita di sonno negli ultimi 3 giorni/notti, 0–10 ciascuno. */
  prurito: number;
  sonno: number;
}

export function scorad(i: InputScorad): Esito<'lieve' | 'moderata' | 'grave'> & { oggettivo: number; livelloOggettivo: 'lieve' | 'moderata' | 'grave' } {
  if (!(i.estensione >= 0 && i.estensione <= 100)) throw new Error('Estensione tra 0 e 100%');
  if (i.intensita.length !== 6 || !i.intensita.every((v) => intero(v, 0, 3))) throw new Error('Sei voci di intensità, ciascuna 0–3');
  if (!(i.prurito >= 0 && i.prurito <= 10 && i.sonno >= 0 && i.sonno <= 10)) throw new Error('Prurito e sonno tra 0 e 10');
  const oggettivo = arrotonda1(i.estensione / 5 + (7 * somma(i.intensita)) / 2);
  const totale = arrotonda1(oggettivo + i.prurito + i.sonno);
  const livello = totale < 25 ? 'lieve' : totale <= 50 ? 'moderata' : 'grave';
  const livelloOggettivo = oggettivo < 15 ? 'lieve' : oggettivo <= 40 ? 'moderata' : 'grave';
  return {
    totale, oggettivo, livello, livelloOggettivo,
    etichetta: `Dermatite atopica ${livello} (SCORAD ${totale})`,
    tono: livello === 'lieve' ? 'ok' : livello === 'moderata' ? 'attenzione' : 'errore',
  };
}

// Mappa corporea per l'estensione (A): percentuale di superficie di ciascuna regione
// secondo la figura originale dello SCORAD (regola del 9; sotto i 2 anni la testa pesa
// di più e gli arti inferiori meno: la figura infantile somma 96%).
export interface RegioneScorad { codice: string; nome: string; lato: 'fronte' | 'retro'; peso: { da2anni: number; sotto2anni: number } }

export const REGIONI_SCORAD: RegioneScorad[] = [
  { codice: 'testa_ant', nome: 'Testa e collo', lato: 'fronte', peso: { da2anni: 4.5, sotto2anni: 8.5 } },
  { codice: 'tronco_ant', nome: 'Tronco anteriore', lato: 'fronte', peso: { da2anni: 18, sotto2anni: 18 } },
  { codice: 'arto_sup_dx_ant', nome: 'Braccio destro', lato: 'fronte', peso: { da2anni: 4.5, sotto2anni: 4.5 } },
  { codice: 'arto_sup_sx_ant', nome: 'Braccio sinistro', lato: 'fronte', peso: { da2anni: 4.5, sotto2anni: 4.5 } },
  { codice: 'genitali', nome: 'Genitali', lato: 'fronte', peso: { da2anni: 1, sotto2anni: 1 } },
  { codice: 'arto_inf_dx_ant', nome: 'Gamba destra', lato: 'fronte', peso: { da2anni: 9, sotto2anni: 6 } },
  { codice: 'arto_inf_sx_ant', nome: 'Gamba sinistra', lato: 'fronte', peso: { da2anni: 9, sotto2anni: 6 } },
  { codice: 'testa_post', nome: 'Testa e collo', lato: 'retro', peso: { da2anni: 4.5, sotto2anni: 8.5 } },
  { codice: 'tronco_post', nome: 'Dorso', lato: 'retro', peso: { da2anni: 18, sotto2anni: 18 } },
  { codice: 'arto_sup_sx_post', nome: 'Braccio sinistro', lato: 'retro', peso: { da2anni: 4.5, sotto2anni: 4.5 } },
  { codice: 'arto_sup_dx_post', nome: 'Braccio destro', lato: 'retro', peso: { da2anni: 4.5, sotto2anni: 4.5 } },
  { codice: 'arto_inf_sx_post', nome: 'Gamba sinistra', lato: 'retro', peso: { da2anni: 9, sotto2anni: 6 } },
  { codice: 'arto_inf_dx_post', nome: 'Gamba destra', lato: 'retro', peso: { da2anni: 9, sotto2anni: 6 } },
];

/** A = somma, per regione, di (peso della regione × % della regione interessata). */
export function estensioneScorad(coinvolgimento: Record<string, number>, sotto2anni: boolean): number {
  let a = 0;
  for (const r of REGIONI_SCORAD) {
    const pct = coinvolgimento[r.codice] ?? 0;
    if (!(pct >= 0 && pct <= 100)) throw new Error(`Percentuale non valida per ${r.nome}`);
    a += (r.peso[sotto2anni ? 'sotto2anni' : 'da2anni'] * pct) / 100;
  }
  return arrotonda1(a);
}

/** Descrizione dei gradi 0–3 dei sei segni di intensità (B). */
export const GRADI_INTENSITA = ['Assente', 'Lieve', 'Moderato', 'Grave'] as const;

// -----------------------------------------------------------------------------
// POEM — Charman CR et al., Arch Dermatol 2004;140:1513. 7 domande 0–4 (0–28).
// Fasce (Charman CR et al., BJD 2013;169:1326): 0–2 assente/quasi assente,
// 3–7 lieve, 8–16 moderata, 17–24 grave, 25–28 molto grave.
// -----------------------------------------------------------------------------
export function poem(voci: number[]): Esito<'assente' | 'lieve' | 'moderata' | 'grave' | 'molto_grave'> {
  if (voci.length !== 7 || !voci.every((v) => intero(v, 0, 4))) throw new Error('Sette voci, ciascuna 0–4');
  const totale = somma(voci);
  const [livello, etichetta, tono] =
    totale <= 2 ? ['assente', 'Eczema assente o quasi assente', 'ok'] as const
    : totale <= 7 ? ['lieve', 'Eczema lieve', 'ok'] as const
    : totale <= 16 ? ['moderata', 'Eczema moderato', 'attenzione'] as const
    : totale <= 24 ? ['grave', 'Eczema grave', 'errore'] as const
    : ['molto_grave', 'Eczema molto grave', 'errore'] as const;
  return { totale, livello, etichetta: `${etichetta} (POEM ${totale})`, tono };
}

// -----------------------------------------------------------------------------
// c-ACT (4–11 anni) — Liu AH et al., JACI 2007;119:817. 7 voci: le prime 4 risposte
// dal bambino (0–3), le ultime 3 dal genitore (0–5). Totale 0–27; ≤ 19 = asma non
// ben controllato.
// ACT (≥ 12 anni) — Nathan RA et al., JACI 2004;113:59. 5 voci 1–5, totale 5–25:
// ≥ 20 ben controllato, 16–19 non ben controllato, ≤ 15 scarsamente controllato.
// -----------------------------------------------------------------------------
export function cAct(voci: number[]): Esito<'controllato' | 'non_controllato'> {
  if (voci.length !== 7 || !voci.slice(0, 4).every((v) => intero(v, 0, 3)) || !voci.slice(4).every((v) => intero(v, 0, 5))) {
    throw new Error('c-ACT: 4 voci del bambino (0–3) e 3 del genitore (0–5)');
  }
  const totale = somma(voci);
  return totale >= 20
    ? { totale, livello: 'controllato', etichetta: `Asma ben controllato (c-ACT ${totale})`, tono: 'ok' }
    : { totale, livello: 'non_controllato', etichetta: `Asma non ben controllato (c-ACT ${totale} ≤ 19)`, tono: 'errore' };
}

export function act(voci: number[]): Esito<'controllato' | 'non_ben_controllato' | 'scarsamente_controllato'> {
  if (voci.length !== 5 || !voci.every((v) => intero(v, 1, 5))) throw new Error('ACT: 5 voci, ciascuna 1–5');
  const totale = somma(voci);
  if (totale >= 20) return { totale, livello: 'controllato', etichetta: `Asma ben controllato (ACT ${totale})`, tono: 'ok' };
  if (totale >= 16) return { totale, livello: 'non_ben_controllato', etichetta: `Asma non ben controllato (ACT ${totale})`, tono: 'attenzione' };
  return { totale, livello: 'scarsamente_controllato', etichetta: `Asma scarsamente controllato (ACT ${totale})`, tono: 'errore' };
}

// -----------------------------------------------------------------------------
// UAS7 — linee guida EAACI/GA²LEN/EuroGuiDerm/APAAACI (Zuberbier T et al., Allergy
// 2022;77:734). Ogni giorno pomfi 0–3 + prurito 0–3, per 7 giorni (0–42).
// 0 libero da orticaria, 1–6 ben controllata, 7–15 lieve, 16–27 moderata, 28–42 grave.
// -----------------------------------------------------------------------------
export function uas7(giorni: { pomfi: number; prurito: number }[]): Esito<'assente' | 'controllata' | 'lieve' | 'moderata' | 'grave'> {
  if (giorni.length !== 7 || !giorni.every((g) => intero(g.pomfi, 0, 3) && intero(g.prurito, 0, 3))) {
    throw new Error('UAS7: 7 giorni, pomfi e prurito 0–3');
  }
  const totale = somma(giorni.map((g) => g.pomfi + g.prurito));
  if (totale === 0) return { totale, livello: 'assente', etichetta: 'Libero da orticaria (UAS7 0)', tono: 'ok' };
  if (totale <= 6) return { totale, livello: 'controllata', etichetta: `Orticaria ben controllata (UAS7 ${totale})`, tono: 'ok' };
  if (totale <= 15) return { totale, livello: 'lieve', etichetta: `Attività lieve (UAS7 ${totale})`, tono: 'attenzione' };
  if (totale <= 27) return { totale, livello: 'moderata', etichetta: `Attività moderata (UAS7 ${totale})`, tono: 'errore' };
  return { totale, livello: 'grave', etichetta: `Attività grave (UAS7 ${totale})`, tono: 'errore' };
}

// -----------------------------------------------------------------------------
// Test cutanei e IgE
// Prick: positivo se il pomfo supera di ≥ 3 mm il controllo negativo (EAACI,
// Heinzerling L et al., Clin Transl Allergy 2013;3:3). IgE specifiche: ≥ 0,35 kUA/L
// = sensibilizzazione; 0,10–0,34 = bassa/dubbia. Sensibilizzazione ≠ allergia
// clinica: l'esito va letto con la storia (e, se serve, con il TPO).
// -----------------------------------------------------------------------------
export function esitoPrick(pomfoMm: number, controlloNegativoMm = 0): 'positivo' | 'negativo' {
  return pomfoMm - controlloNegativoMm >= 3 ? 'positivo' : 'negativo';
}

export function esitoIgE(kUA: number): 'positivo' | 'dubbio' | 'negativo' {
  if (kUA >= 0.35) return 'positivo';
  if (kUA >= 0.1) return 'dubbio';
  return 'negativo';
}

// -----------------------------------------------------------------------------
// Spirometria e FeNO
// Reversibilità: aumento FEV1 ≥ 12% dopo broncodilatatore (GINA 2024, bambini 6–11
// anni). FeNO nei < 12 anni (ATS, Dweik RA et al., AJRCCM 2011;184:602):
// < 20 ppb basso, 20–35 intermedio, > 35 elevato.
// -----------------------------------------------------------------------------
export const reversibilitaSignificativa = (pct: number | null | undefined) => pct != null && pct >= 12;

export function livelloFeno(ppb: number, etaAnni: number): 'basso' | 'intermedio' | 'elevato' {
  const [soglia1, soglia2] = etaAnni < 12 ? [20, 35] : [25, 50];
  return ppb < soglia1 ? 'basso' : ppb <= soglia2 ? 'intermedio' : 'elevato';
}

// -----------------------------------------------------------------------------
// Anafilassi — criteri clinici WAO 2020 (Cardona V et al., World Allergy Organ J
// 2020;13:100472), adottati nelle linee guida EAACI 2021 (Muraro A et al., Allergy 2022):
//  1) esordio acuto con cute/mucose + almeno uno tra compromissione respiratoria,
//     ipotensione/disfunzione d'organo, sintomi gastrointestinali gravi;
//  2) ipotensione, broncospasmo o coinvolgimento laringeo dopo esposizione ad allergene
//     noto o molto probabile, anche senza sintomi cutanei.
// Si mantiene anche il criterio NIAID/EAACI dei ≥ 2 apparati dopo probabile esposizione.
// Suggerimento per il medico, non una diagnosi.
// -----------------------------------------------------------------------------
export interface SintomiReazione {
  cute_mucose: boolean;
  respiratorio: boolean;
  cardiovascolare: boolean;
  gastrointestinale: boolean;
}

export function criteriAnafilassi(s: SintomiReazione, esposizioneAllergeneNoto: boolean): { compatibile: boolean; criterio: string | null } {
  if (s.cute_mucose && (s.respiratorio || s.cardiovascolare || s.gastrointestinale)) {
    return { compatibile: true, criterio: 'Cute/mucose + compromissione respiratoria, cardiovascolare o gastrointestinale grave (WAO, criterio 1)' };
  }
  if ((s.cardiovascolare || s.respiratorio) && esposizioneAllergeneNoto) {
    return { compatibile: true, criterio: 'Ipotensione, broncospasmo o coinvolgimento laringeo dopo esposizione ad allergene noto, anche senza sintomi cutanei (WAO, criterio 2)' };
  }
  const organi = [s.cute_mucose, s.respiratorio, s.cardiovascolare, s.gastrointestinale].filter(Boolean).length;
  if (organi >= 2 && esposizioneAllergeneNoto) {
    return { compatibile: true, criterio: 'Due o più apparati coinvolti dopo probabile esposizione (NIAID/EAACI)' };
  }
  return { compatibile: false, criterio: null };
}

// -----------------------------------------------------------------------------
// Autoiniettore di adrenalina — EAACI 2021: 0,15 mg da 7,5 a 25–30 kg; 0,30 mg
// oltre 25–30 kg; sotto 7,5 kg valutare siringa preriempita 0,01 mg/kg. L'EMA
// raccomanda di prescriverne due.
// -----------------------------------------------------------------------------
export function doseAutoiniettore(pesoKg: number): { dose: 0.15 | 0.3 | null; nota: string } {
  if (pesoKg < 7.5) return { dose: null, nota: 'Sotto 7,5 kg: valutare con lo specialista (adrenalina 0,01 mg/kg in siringa preriempita).' };
  if (pesoKg < 25) return { dose: 0.15, nota: 'Autoiniettore 0,15 mg (7,5–25 kg).' };
  if (pesoKg <= 30) return { dose: 0.3, nota: 'Zona di passaggio 25–30 kg: 0,30 mg in genere preferibile, valutazione clinica.' };
  return { dose: 0.3, nota: 'Autoiniettore 0,30 mg (oltre 30 kg).' };
}

export interface AvvisoAutoiniettore { tono: 'errore' | 'attenzione'; testo: string }

export function avvisiAutoiniettore(
  a: { dose_mg: number; numero: number; scadenza: ISODate | null; attivo: boolean },
  pesoAttualeKg: number | null,
  oggi: ISODate,
): AvvisoAutoiniettore[] {
  if (!a.attivo) return [];
  const avvisi: AvvisoAutoiniettore[] = [];
  if (a.scadenza) {
    const giorni = Math.round((Date.parse(a.scadenza) - Date.parse(oggi)) / 86_400_000);
    if (giorni < 0) avvisi.push({ tono: 'errore', testo: 'Autoiniettore scaduto: prescrivere il rinnovo.' });
    else if (giorni <= 60) avvisi.push({ tono: 'attenzione', testo: `Scade tra ${giorni} giorni: ricordare il rinnovo alla famiglia.` });
  }
  if (a.numero < 2) avvisi.push({ tono: 'attenzione', testo: 'Prescritto un solo autoiniettore: l\'EMA raccomanda di averne due.' });
  if (pesoAttualeKg != null && a.dose_mg < 0.3 && pesoAttualeKg >= 25) {
    avvisi.push({ tono: 'attenzione', testo: `Peso attuale ${pesoAttualeKg} kg: valutare il passaggio a 0,30 mg (EAACI: 0,15 mg fino a 25–30 kg).` });
  }
  return avvisi;
}
