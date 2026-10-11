/**
 * Auxologia pediatrica: calcoli di supporto alla valutazione della crescita.
 *
 * Tutto ciò che è qui è INFORMATIVO: mostra numeri e criteri documentati, non fa
 * diagnosi. Ogni soglia riporta la fonte. I valori sono arrotondati a 2 decimali
 * prima del confronto con le soglie (es. −2,004 DS conta come −2,00), come si fa
 * quando si legge un DS in cartella.
 *
 * Fonti:
 *  - Curve italiane: Cacciari E. et al., J Endocrinol Invest 2006;29:581-93 (2–20 anni).
 *  - Curve OMS: WHO Child Growth Standards 2006 (0–5 anni), WHO Growth Reference 2007 (5–19 anni).
 *  - Target genetico: formula di Tanner (media dei genitori ± 6,5 cm), intervallo ± 8,5 cm.
 *  - Pubertà precoce / ritardata: Klein DA et al., Disorders of Puberty, Am Fam Physician 2017;96(9):590-9.
 *  - Sovrappeso e obesità: Valerio G. et al., Consensus SIEDP-SIP, Ital J Pediatr 2018;44:88
 *    (OMS 2006 peso/lunghezza 0–2 anni e BMI 2–5 anni; OMS 2007 BMI 5–18 anni; 85°, 97°, 99° percentile).
 *  - Ormone della crescita: Nota AIFA 39 (testo vigente sul sito AIFA).
 */
import { GIORNI_PER_MESE, lmsAEta, normaleCdf, valoreDaZ, zDaValore, type Lms, type Riferimento } from './crescita';
import { LMS_CACCIARI } from './crescita-cacciari';
import type { RigaLms } from './crescita-oms';
import { LMS_OMS_BMI, LMS_OMS_PESO_LUNGHEZZA } from './crescita-oms-bmi';
import type { ISODate, Sesso } from './tipi';

const GIORNO_MS = 86_400_000;
const GIORNI_PER_ANNO = 365.25;

/** Arrotonda a 2 decimali (per confronti con soglie espresse in DS). */
export const arrotonda2 = (x: number) => Math.round(x * 100) / 100;

function utc(data: ISODate): number {
  const [a, m, g] = data.split('-').map(Number);
  if (!a || !m || !g) throw new Error(`Data non valida: ${data}`);
  return Date.UTC(a, m - 1, g);
}

/** Giorni tra due date (b − a). */
export const giorniTra = (a: ISODate, b: ISODate) => Math.round((utc(b) - utc(a)) / GIORNO_MS);

/** Età decimale in anni (convenzione auxologica: giorni / 365,25). */
export function etaDecimale(nascita: ISODate, data: ISODate): number {
  const g = giorniTra(nascita, data);
  if (g < 0) throw new Error('La data precede la nascita');
  return g / GIORNI_PER_ANNO;
}

/** Età decimale in forma leggibile «7,42 anni». */
export const fmtEtaDecimale = (anni: number) => `${anni.toFixed(2).replace('.', ',')} anni`;

// -----------------------------------------------------------------------------
// DS (z-score) e percentili delle misure
// -----------------------------------------------------------------------------

export type MisuraAuxologica = 'altezza' | 'peso' | 'bmi' | 'circonferenza_cranica';

export interface Sds {
  /** DS (z-score), non arrotondato. */
  z: number;
  /** Percentile 0–100. */
  percentile: number;
  riferimento: Riferimento;
  /** Nome breve della curva usata, da mostrare accanto al valore. */
  curva: string;
}

function lmsTabella(righe: readonly RigaLms[], x: number): Lms | null {
  const primo = righe[0];
  const ultimo = righe[righe.length - 1];
  if (!primo || !ultimo || x < primo[0] || x > ultimo[0]) return null;
  // Ricerca binaria: le tabelle sono ordinate.
  let lo = 0;
  let hi = righe.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (righe[mid]![0] <= x) lo = mid; else hi = mid;
  }
  const a = righe[lo]!;
  const b = righe[hi]!;
  const t = b[0] === a[0] ? 0 : Math.min(1, Math.max(0, (x - a[0]) / (b[0] - a[0])));
  return { L: a[1] + t * (b[1] - a[1]), M: a[2] + t * (b[2] - a[2]), S: a[3] + t * (b[3] - a[3]) };
}

/** LMS del BMI: OMS (0–228 mesi) o Cacciari (24–240 mesi). */
export function lmsBmi(sesso: Sesso, mesi: number, rif: Riferimento): Lms | null {
  return lmsTabella(rif === 'oms' ? LMS_OMS_BMI[sesso] : LMS_CACCIARI.bmi[sesso], mesi);
}

/**
 * Curva consigliata per la valutazione auxologica: OMS sotto i 2 anni (le curve italiane
 * partono dai 2 anni) e sempre per la circonferenza cranica; dai 2 anni le curve italiane
 * di Cacciari, che coprono statura, peso e BMI fino a 20 anni.
 * Per la classificazione del peso (sovrappeso/obesità) si usano invece SEMPRE le curve OMS,
 * come raccomanda la consensus SIEDP-SIP 2018 (vedi classificaPeso).
 */
export function riferimentoAuxologico(misura: MisuraAuxologica, mesi: number): Riferimento {
  if (misura === 'circonferenza_cranica') return 'oms';
  return mesi < 24 ? 'oms' : 'cacciari';
}

export const NOME_CURVA: Record<Riferimento, string> = { oms: 'OMS', cacciari: 'Cacciari 2006' };

/**
 * Statura confrontabile con la curva: sotto i 2 anni le curve OMS sono «da sdraiato»
 * (lunghezza), dai 2 anni tutte le curve (OMS e Cacciari) sono «in piedi». Se la misura
 * è stata presa nell'altro modo si corregge di 0,7 cm, come indica l'OMS.
 */
export function staturaPerCurva(mesi: number, valore: number, sdraiato: boolean | undefined): number {
  if (sdraiato === undefined) return valore;
  if (mesi < 24 && !sdraiato) return valore + 0.7;
  if (mesi >= 24 && sdraiato) return valore - 0.7;
  return valore;
}

/**
 * DS e percentile di una misura. Per la statura applica la correzione sdraiato/in piedi
 * (vedi staturaPerCurva). Null se età o valore sono fuori dalle tabelle.
 */
export function sdsMisura(
  misura: MisuraAuxologica, sesso: Sesso, mesi: number, valore: number,
  rif: Riferimento = riferimentoAuxologico(misura, mesi),
  opzioni: { sdraiato?: boolean } = {},
): Sds | null {
  if (!(valore > 0) || !(mesi >= 0)) return null;
  const x = misura === 'altezza' ? staturaPerCurva(mesi, valore, opzioni.sdraiato) : valore;
  const lms = misura === 'bmi' ? lmsBmi(sesso, mesi, rif) : lmsAEta(misura, sesso, mesi, rif);
  if (!lms) return null;
  const z = zDaValore(lms, x);
  if (!Number.isFinite(z)) return null;
  return { z, percentile: normaleCdf(z) * 100, riferimento: rif, curva: NOME_CURVA[rif] };
}

/** BMI = peso (kg) / statura (m)². */
export function bmi(pesoKg: number, altezzaCm: number): number | null {
  if (!(pesoKg > 0) || !(altezzaCm > 0)) return null;
  const m = altezzaCm / 100;
  return pesoKg / (m * m);
}

/** DS formattata: «−1,85 DS» (segno meno tipografico). */
export function fmtSds(z: number | null | undefined): string {
  if (z === null || z === undefined || !Number.isFinite(z)) return '—';
  const r = arrotonda2(z);
  const testo = Math.abs(r).toFixed(2).replace('.', ',');
  return `${r < 0 ? '−' : r > 0 ? '+' : ''}${testo} DS`;
}

/** Percentile leggibile: «<1°», «2,4°», «23°», «97,6°», «>99°». */
export function fmtPercentileFine(p: number | null | undefined): string {
  if (p === null || p === undefined || !Number.isFinite(p)) return '—';
  if (p < 1) return '<1°';
  if (p > 99) return '>99°';
  if (p < 3 || p > 97) return `${p.toFixed(1).replace('.', ',')}°`;
  return `${Math.round(p)}°`;
}

// -----------------------------------------------------------------------------
// Target genetico (Tanner)
// -----------------------------------------------------------------------------

export interface TargetGenetico {
  /** Statura bersaglio in cm. */
  cm: number;
  /** Intervallo di normalità (± 8,5 cm). */
  min: number;
  max: number;
  /** DS del bersaglio sulla curva italiana a 20 anni (per il confronto con la statura attuale). */
  sds: number | null;
}

export const INTERVALLO_TARGET_CM = 8.5;

/**
 * Target genetico (formula di Tanner): maschi (padre + madre + 13) / 2, femmine (padre + madre − 13) / 2,
 * con intervallo di ± 8,5 cm. Il DS è calcolato sulla statura a 20 anni delle curve di Cacciari.
 */
export function targetGenetico(padreCm: number, madreCm: number, sesso: Sesso): TargetGenetico | null {
  if (!(padreCm >= 120 && padreCm <= 230 && madreCm >= 110 && madreCm <= 220)) return null;
  const cm = (padreCm + madreCm + (sesso === 'M' ? 13 : -13)) / 2;
  const lms = lmsAEta('altezza', sesso, 240, 'cacciari');
  return {
    cm,
    min: cm - INTERVALLO_TARGET_CM,
    max: cm + INTERVALLO_TARGET_CM,
    sds: lms ? zDaValore(lms, cm) : null,
  };
}

/** Statura adulta corrispondente a un DS (curva italiana a 20 anni). */
export function staturaAdultaDaSds(sds: number, sesso: Sesso): number | null {
  const lms = lmsAEta('altezza', sesso, 240, 'cacciari');
  return lms ? valoreDaZ(lms, sds) : null;
}

// -----------------------------------------------------------------------------
// Velocità di crescita
// -----------------------------------------------------------------------------

export interface MisuraDatata {
  data: ISODate;
  altezza_cm: number;
}

export interface Velocita {
  da: ISODate;
  a: ISODate;
  /** Intervallo in anni. */
  anni: number;
  cmAnno: number;
  /** Nota 39 chiede un intervallo di almeno 6 mesi; l'ideale è circa 1 anno. */
  affidabile: boolean;
  avviso: string | null;
}

/** Intervallo minimo (in giorni) per una velocità valutabile: 6 mesi. */
export const INTERVALLO_MINIMO_VELOCITA_GIORNI = 182;

/** Velocità di crescita staturale tra due misure (cm/anno). */
export function velocitaCrescita(precedente: MisuraDatata, attuale: MisuraDatata): Velocita | null {
  const giorni = giorniTra(precedente.data, attuale.data);
  if (giorni <= 0) return null;
  const anni = giorni / GIORNI_PER_ANNO;
  const cmAnno = (attuale.altezza_cm - precedente.altezza_cm) / anni;
  let avviso: string | null = null;
  if (giorni < INTERVALLO_MINIMO_VELOCITA_GIORNI) {
    avviso = 'Intervallo inferiore a 6 mesi: velocità poco affidabile (errore di misura e variazioni stagionali).';
  } else if (giorni < 300) {
    avviso = 'Intervallo inferiore a un anno: possibile effetto stagionale.';
  }
  if (cmAnno < 0) avviso = 'Statura inferiore alla misura precedente: verificare le misure.';
  return { da: precedente.data, a: attuale.data, anni, cmAnno, affidabile: giorni >= INTERVALLO_MINIMO_VELOCITA_GIORNI && cmAnno >= 0, avviso };
}

/**
 * Misura di riferimento per la velocità: tra quelle che distano almeno `minGiorni`
 * (predefinito 6 mesi) dalla misura attuale, quella con l'intervallo più vicino a un anno.
 */
export function misuraPerVelocita<T extends MisuraDatata>(misure: readonly T[], attuale: T, minGiorni = INTERVALLO_MINIMO_VELOCITA_GIORNI): T | null {
  const candidate = misure.filter((m) => m !== attuale && giorniTra(m.data, attuale.data) >= minGiorni);
  if (!candidate.length) return null;
  return candidate.reduce((meglio, m) =>
    Math.abs(giorniTra(m.data, attuale.data) - 365) < Math.abs(giorniTra(meglio.data, attuale.data) - 365) ? m : meglio);
}

/** Variazione del DS staturale per anno tra due misure (negativa = perdita di DS). */
export function variazioneSdsAnno(sdsPrecedente: number, dataPrecedente: ISODate, sdsAttuale: number, dataAttuale: ISODate): number | null {
  const giorni = giorniTra(dataPrecedente, dataAttuale);
  if (giorni <= 0) return null;
  return (sdsAttuale - sdsPrecedente) / (giorni / GIORNI_PER_ANNO);
}

// -----------------------------------------------------------------------------
// Età ossea
// -----------------------------------------------------------------------------

/** Differenza età ossea − età cronologica in anni (positiva = avanzata). */
export function differenzaEtaOssea(etaOsseaAnni: number, etaCronologicaAnni: number): number {
  return etaOsseaAnni - etaCronologicaAnni;
}

// -----------------------------------------------------------------------------
// Pubertà
// -----------------------------------------------------------------------------

export interface StadioPuberale {
  /** Età decimale alla visita. */
  eta: number;
  sesso: Sesso;
  /** Stadio mammario di Tanner (femmine), 1–5. */
  b?: number | null;
  /** Stadio genitale di Tanner (maschi), 1–5. */
  g?: number | null;
  /** Peli pubici, 1–5 (6 in alcune scale). */
  ph?: number | null;
  /** Volume testicolare (orchidometro di Prader), il maggiore dei due, ml. */
  testicoli_ml?: number | null;
  /** Menarca avvenuto (femmine). */
  menarca?: boolean | null;
}

export type EsitoPuberale = 'nei_limiti' | 'precoce' | 'ritardo' | 'amenorrea_primaria' | 'dati_insufficienti';

export interface ValutazionePuberale {
  esito: EsitoPuberale;
  /** Pubertà iniziata (B2 / volume testicolare ≥ 4 ml). */
  iniziata: boolean | null;
  testo: string;
}

/** Volume testicolare che segna l'inizio della pubertà (orchidometro di Prader). */
export const VOLUME_TESTICOLARE_PUBERE_ML = 4;

/**
 * Tempi della pubertà (Klein et al., AAFP 2017):
 *  - precoce: inizio prima degli 8 anni nelle femmine (B2) e prima dei 9 anni nei maschi (testicoli ≥ 4 ml);
 *  - ritardata: nessun bottone mammario a 13 anni nelle femmine; testicoli < 4 ml a 14 anni nei maschi;
 *  - femmine senza menarca a 15 anni: valutare per amenorrea primaria.
 * Il solo pubarca (PH) non indica l'inizio della pubertà centrale: va segnalato a parte.
 */
export function valutaPuberta(s: StadioPuberale): ValutazionePuberale {
  if (s.sesso === 'F') {
    if (s.menarca === false && s.eta >= 15) {
      return { esito: 'amenorrea_primaria', iniziata: s.b == null ? null : s.b >= 2, testo: 'Nessun menarca a 15 anni: indicazione a valutare l\'amenorrea primaria.' };
    }
    if (s.b == null) return { esito: 'dati_insufficienti', iniziata: null, testo: 'Indicare lo stadio mammario (B).' };
    const iniziata = s.b >= 2;
    if (iniziata && s.eta < 8) return { esito: 'precoce', iniziata, testo: 'Telarca (B2 o oltre) prima degli 8 anni: oltre il limite di età per la pubertà precoce.' };
    if (!iniziata && s.eta >= 13) return { esito: 'ritardo', iniziata, testo: 'Nessun bottone mammario a 13 anni: oltre il limite di età per il ritardo puberale.' };
    return { esito: 'nei_limiti', iniziata, testo: iniziata ? 'Pubertà iniziata in età nei limiti.' : 'Prepubere, età nei limiti.' };
  }
  const vol = s.testicoli_ml;
  if (vol == null && s.g == null) return { esito: 'dati_insufficienti', iniziata: null, testo: 'Indicare il volume testicolare (o lo stadio genitale G).' };
  if (vol != null) {
    const iniziata = vol >= VOLUME_TESTICOLARE_PUBERE_ML;
    if (iniziata && s.eta < 9) return { esito: 'precoce', iniziata, testo: 'Testicoli ≥ 4 ml prima dei 9 anni: oltre il limite di età per la pubertà precoce.' };
    if (!iniziata && s.eta >= 14) return { esito: 'ritardo', iniziata, testo: 'Testicoli < 4 ml a 14 anni: oltre il limite di età per il ritardo puberale.' };
    return { esito: 'nei_limiti', iniziata, testo: iniziata ? 'Pubertà iniziata in età nei limiti.' : 'Prepubere, età nei limiti.' };
  }
  // Solo lo stadio genitale: il criterio si basa sul volume, da verificare con l'orchidometro.
  const iniziata = (s.g ?? 1) >= 2;
  if (iniziata && s.eta < 9) return { esito: 'precoce', iniziata, testo: `Stadio genitale G${s.g} prima dei 9 anni (volume testicolare non misurato): verificare con l'orchidometro.` };
  if (!iniziata && s.eta >= 14) return { esito: 'ritardo', iniziata, testo: 'Stadio genitale G1 a 14 anni (volume testicolare non misurato): verificare con l\'orchidometro.' };
  return { esito: 'nei_limiti', iniziata, testo: iniziata ? 'Pubertà iniziata in età nei limiti (volume testicolare non misurato).' : 'Prepubere, età nei limiti (volume testicolare non misurato).' };
}

/**
 * Pubarca prima degli 8 anni (F) / dei 9 anni (M) senza segni di attivazione gonadica,
 * oppure con stadio mammario / volume testicolare non indicato (da valutare).
 */
export function pubarcaPrecoce(s: StadioPuberale): boolean {
  if (s.ph == null || s.ph < 2) return false;
  const limite = s.sesso === 'F' ? 8 : 9;
  if (s.eta >= limite) return false;
  return valutaPuberta(s).iniziata !== true;
}

/** Valori dell'orchidometro di Prader (ml). */
export const ORCHIDOMETRO_PRADER_ML = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25] as const;

// -----------------------------------------------------------------------------
// Peso: sovrappeso e obesità (Consensus SIEDP-SIP 2018, curve OMS)
// -----------------------------------------------------------------------------

export type ClassePeso = 'sottopeso' | 'normale' | 'rischio_sovrappeso' | 'sovrappeso' | 'obesita' | 'obesita_grave';

export interface ClassificazionePeso {
  classe: ClassePeso;
  etichetta: string;
  /** Indicatore usato: peso per lunghezza (0–2 anni) o BMI per età. */
  indicatore: 'peso_lunghezza' | 'bmi';
  z: number;
  percentile: number;
  fonte: string;
}

/** Fine della fascia 5–18 anni della consensus (18 anni compiuti). */
export const ETA_MASSIMA_CONSENSUS_MESI = 216;

/** z corrispondenti ai percentili 85°, 97° e 99° della normale standard. */
const Z85 = 1.036433;
const Z97 = 1.880794;
const Z99 = 2.326348;
/** Magrezza secondo l'OMS: < −2 DS. */
const Z_MAGREZZA = -2;

/** LMS del peso per lunghezza (OMS 2006, 45–110 cm). */
export function lmsPesoLunghezza(sesso: Sesso, lunghezzaCm: number): Lms | null {
  return lmsTabella(LMS_OMS_PESO_LUNGHEZZA[sesso], lunghezzaCm);
}

/**
 * Classificazione del peso come nella Consensus SIEDP-SIP 2018 (Valerio et al.), curve OMS:
 *  - 0–2 anni: peso per lunghezza (OMS 2006);
 *  - 2–5 anni: BMI (OMS 2006): > 85° rischio di sovrappeso, > 97° sovrappeso, > 99° obesità;
 *  - 5–18 anni: BMI (OMS 2007): > 85° sovrappeso, > 97° obesità, > 99° obesità grave.
 * Sotto i 2 anni la consensus usa le stesse soglie della fascia 0–5 anni.
 * Magrezza: z < −2 (definizione OMS). Null se mancano dati, oltre i 18 anni o fuori dalle tabelle.
 * `sdraiato`: come è stata misurata la statura (si corregge di 0,7 cm se serve).
 */
export function classificaPeso(sesso: Sesso, mesi: number, pesoKg: number, altezzaCm: number, sdraiato?: boolean): ClassificazionePeso | null {
  if (!(pesoKg > 0) || !(altezzaCm > 0) || !(mesi >= 0)) return null;
  // La consensus copre fino a 18 anni: oltre si usano i criteri dell'adulto.
  if (mesi > ETA_MASSIMA_CONSENSUS_MESI) return null;
  // Lunghezza da sdraiato sotto i 2 anni, statura in piedi dopo (correzione OMS di 0,7 cm).
  const statura = staturaPerCurva(mesi, altezzaCm, sdraiato);
  let z: number;
  let indicatore: ClassificazionePeso['indicatore'];
  let fonte: string;
  if (mesi < 24) {
    const lms = lmsPesoLunghezza(sesso, statura);
    if (!lms) return null;
    z = zDaValore(lms, pesoKg);
    indicatore = 'peso_lunghezza';
    fonte = 'OMS 2006, peso per lunghezza';
  } else {
    const b = bmi(pesoKg, statura);
    const lms = b === null ? null : lmsBmi(sesso, mesi, 'oms');
    if (!lms || b === null) return null;
    z = zDaValore(lms, b);
    indicatore = 'bmi';
    fonte = mesi <= 60 ? 'OMS 2006, BMI per età' : 'OMS 2007, BMI per età';
  }
  if (!Number.isFinite(z)) return null;
  // Fasce della consensus: 0–5 anni (sotto i 60 mesi) e 5–18 anni.
  const piccolo = mesi < 60;
  let classe: ClassePeso;
  if (z > Z99) classe = piccolo ? 'obesita' : 'obesita_grave';
  else if (z > Z97) classe = piccolo ? 'sovrappeso' : 'obesita';
  else if (z > Z85) classe = piccolo ? 'rischio_sovrappeso' : 'sovrappeso';
  else if (z < Z_MAGREZZA) classe = 'sottopeso';
  else classe = 'normale';
  return { classe, etichetta: ETICHETTA_PESO[classe], indicatore, z, percentile: normaleCdf(z) * 100, fonte };
}

export const ETICHETTA_PESO: Record<ClassePeso, string> = {
  sottopeso: 'Magrezza (< −2 DS)',
  normale: 'Nei limiti',
  rischio_sovrappeso: 'A rischio di sovrappeso (> 85° pc)',
  sovrappeso: 'Sovrappeso',
  obesita: 'Obesità',
  obesita_grave: 'Obesità grave (> 99° pc)',
};

/** Rapporto circonferenza vita / statura. */
export function rapportoVitaAltezza(vitaCm: number, altezzaCm: number): number | null {
  return vitaCm > 0 && altezzaCm > 0 ? vitaCm / altezzaCm : null;
}
/**
 * Consensus SIEDP-SIP 2018: nel bambino in sovrappeso o obeso un rapporto vita/statura > 0,5
 * suggerisce lo screening della steatosi epatica. Nei più piccoli il rapporto è fisiologicamente
 * più alto: l'avviso vale dai 6 anni e solo con sovrappeso o obesità.
 */
export const SOGLIA_VITA_ALTEZZA = 0.5;
export function avvisoVitaAltezza(rapporto: number | null, mesi: number, classe: ClassePeso | null | undefined): boolean {
  return rapporto != null && rapporto > SOGLIA_VITA_ALTEZZA && mesi >= 72
    && (classe === 'sovrappeso' || classe === 'obesita' || classe === 'obesita_grave');
}

// -----------------------------------------------------------------------------
// Nota AIFA 39 (ormone della crescita): verifica dei criteri, SOLO informativa
// -----------------------------------------------------------------------------

export type StatoCriterio = 'soddisfatto' | 'non_soddisfatto' | 'dati_insufficienti';

export interface Criterio {
  codice: string;
  titolo: string;
  stato: StatoCriterio;
  dettaglio: string;
}

export type StimoloGh = 'arginina' | 'clonidina' | 'glucagone' | 'insulina' | 'ghrh_arginina' | 'levodopa' | 'altro';

export interface TestGh {
  data: ISODate;
  stimolo: StimoloGh;
  picco_ug_l: number;
}

/** Soglia del picco di GH (Nota 39): < 8 µg/L; < 20 µg/L se il test è GHRH + arginina. */
export const sogliaGh = (stimolo: StimoloGh) => (stimolo === 'ghrh_arginina' ? 20 : 8);
export const testGhDeficitario = (t: TestGh) => t.picco_ug_l < sogliaGh(t.stimolo);

export interface DatiNota39 {
  sesso: Sesso;
  eta: number;
  /** DS della statura attuale. */
  sdsStatura: number | null;
  /** DS del target genetico. */
  sdsTarget: number | null;
  /** DS della velocità di crescita (da tabelle di riferimento), misurata su almeno 6 mesi. */
  sdsVelocita: number | null;
  /** DS della velocità dell'anno precedente (per «2 anni consecutivi»). */
  sdsVelocitaAnnoPrecedente: number | null;
  /** Variazione del DS staturale per anno (negativa = perdita), su circa un anno (≥ 0,9 anni). */
  variazioneSdsAnno: number | null;
  /** Malformazioni o lesioni ipotalamo-ipofisarie documentate (neuroradiologia). */
  lesioniIpotalamoIpofisarie: boolean | null;
  testGh: readonly TestGh[];
}

const leq = (x: number, soglia: number) => arrotonda2(x) <= soglia;

/**
 * Criteri auxologici (a–e) e di laboratorio della Nota 39 per il deficit di GH in età evolutiva.
 * La velocità in DS va letta sulle tabelle di riferimento e inserita a mano: il gestionale non
 * contiene tabelle di velocità validate. È un promemoria per il medico, non una prescrizione.
 */
export function criteriNota39(d: DatiNota39): { auxologici: Criterio[]; laboratorio: Criterio; almenoUnAuxologico: boolean } {
  const c: Criterio[] = [];
  const s = d.sdsStatura;
  const v = d.sdsVelocita;
  const v2 = d.sdsVelocitaAnnoPrecedente;
  const velocitaBassa = (soglia: number, soglia2anni: number): StatoCriterio => {
    if (v === null) return 'dati_insufficienti';
    if (leq(v, soglia)) return 'soddisfatto';
    if (leq(v, soglia2anni)) {
      if (v2 === null) return 'dati_insufficienti';
      return leq(v2, soglia2anni) ? 'soddisfatto' : 'non_soddisfatto';
    }
    return 'non_soddisfatto';
  };

  // a) statura ≤ −3 DS
  c.push({
    codice: 'a', titolo: 'Statura ≤ −3 DS',
    stato: s === null ? 'dati_insufficienti' : leq(s, -3) ? 'soddisfatto' : 'non_soddisfatto',
    dettaglio: s === null ? 'Manca la statura.' : `Statura ${fmtSds(s)}.`,
  });

  // b) statura ≤ −2 DS e velocità ≤ −1 DS (su ≥ 6 mesi), oppure, sopra i 2 anni, perdita di 0,5 DS/anno
  let statoB: StatoCriterio;
  if (s === null) statoB = 'dati_insufficienti';
  else if (!leq(s, -2)) statoB = 'non_soddisfatto';
  else {
    const perVelocita: StatoCriterio = v === null ? 'dati_insufficienti' : leq(v, -1) ? 'soddisfatto' : 'non_soddisfatto';
    // La perdita di 0,5 DS/anno vale solo sopra i 2 anni.
    const perPerdita: StatoCriterio = d.eta <= 2 ? 'non_soddisfatto' : d.variazioneSdsAnno === null ? 'dati_insufficienti'
      : leq(d.variazioneSdsAnno, -0.5) ? 'soddisfatto' : 'non_soddisfatto';
    statoB = perVelocita === 'soddisfatto' || perPerdita === 'soddisfatto' ? 'soddisfatto'
      : perVelocita === 'dati_insufficienti' || perPerdita === 'dati_insufficienti' ? 'dati_insufficienti' : 'non_soddisfatto';
  }
  c.push({
    codice: 'b', titolo: 'Statura ≤ −2 DS e velocità ≤ −1 DS (su almeno 6 mesi), o perdita di 0,5 DS/anno sopra i 2 anni',
    stato: statoB,
    dettaglio: [s !== null && `statura ${fmtSds(s)}`, v !== null && `velocità ${fmtSds(v)}`,
      d.variazioneSdsAnno !== null && `variazione ${fmtSds(d.variazioneSdsAnno)}/anno`].filter(Boolean).join(', ') || 'Dati mancanti.',
  });

  // c) statura ≤ −1,5 DS rispetto al target e velocità ≤ −2 DS (o ≤ −1,5 DS per 2 anni consecutivi)
  let statoC: StatoCriterio;
  const diff = s !== null && d.sdsTarget !== null ? s - d.sdsTarget : null;
  if (diff === null) statoC = 'dati_insufficienti';
  else if (!leq(diff, -1.5)) statoC = 'non_soddisfatto';
  else statoC = velocitaBassa(-2, -1.5);
  c.push({
    codice: 'c', titolo: 'Statura ≤ −1,5 DS rispetto al target genetico e velocità ≤ −2 DS (o ≤ −1,5 DS per 2 anni consecutivi)',
    stato: statoC,
    dettaglio: diff === null ? 'Servono statura e target genetico.' : `Statura − target: ${fmtSds(diff)}${v !== null ? `, velocità ${fmtSds(v)}` : ''}.`,
  });

  // d) velocità ≤ −2 DS (o ≤ −1,5 DS per 2 anni consecutivi) anche senza bassa statura
  c.push({
    codice: 'd', titolo: 'Velocità ≤ −2 DS (o ≤ −1,5 DS per 2 anni consecutivi), anche senza bassa statura, escluse altre cause',
    stato: velocitaBassa(-2, -1.5),
    dettaglio: v === null ? 'Manca la velocità in DS.' : `Velocità ${fmtSds(v)}${v2 !== null ? `, anno precedente ${fmtSds(v2)}` : ''}.`,
  });

  // e) lesioni ipotalamo-ipofisarie
  c.push({
    codice: 'e', titolo: 'Malformazioni o lesioni ipotalamo-ipofisarie documentate',
    stato: d.lesioniIpotalamoIpofisarie === null ? 'dati_insufficienti' : d.lesioniIpotalamoIpofisarie ? 'soddisfatto' : 'non_soddisfatto',
    dettaglio: d.lesioniIpotalamoIpofisarie ? 'Indicate in cartella.' : d.lesioniIpotalamoIpofisarie === false ? 'Non presenti.' : 'Non indicato.',
  });

  // Laboratorio: picco < 8 µg/L (GHRH+arginina < 20) in DUE test con stimoli diversi, in giorni diversi.
  const deficitari = d.testGh.filter(testGhDeficitario);
  let coppia: [TestGh, TestGh] | null = null;
  for (let i = 0; i < deficitari.length && !coppia; i++) {
    for (let j = i + 1; j < deficitari.length; j++) {
      const a = deficitari[i]!;
      const b = deficitari[j]!;
      if (a.stimolo !== b.stimolo && a.data !== b.data) { coppia = [a, b]; break; }
    }
  }
  const eccezioni = d.lesioniIpotalamoIpofisarie === true || d.eta < 2
    ? ' La Nota prevede casi in cui i test di stimolo non sono richiesti (primo mese di vita, 2 mesi–2 anni con risonanza alterata, tumori ipotalamo-ipofisari con ≥ 2 deficit, ≥ 3 deficit ipofisari): vedere il testo.'
    : '';
  const laboratorio: Criterio = {
    codice: 'lab', titolo: 'Picco di GH < 8 µg/L (< 20 µg/L con GHRH + arginina) in due test con stimoli diversi, in giorni diversi',
    stato: coppia ? 'soddisfatto' : d.testGh.length < 2 ? 'dati_insufficienti' : 'non_soddisfatto',
    dettaglio: (d.testGh.length === 0 ? 'Nessun test registrato.'
      : `${deficitari.length} test su ${d.testGh.length} sotto soglia${coppia ? '' : d.testGh.length >= 2 ? ' (servono due stimoli diversi in giorni diversi)' : ''}.`) + eccezioni,
  };

  return { auxologici: c, laboratorio, almenoUnAuxologico: c.some((x) => x.stato === 'soddisfatto') };
}

/** Criteri SGA della Nota 39: nascita ≤ −2 DS (peso o lunghezza), età ≥ 4 anni, statura ≤ −2,5 DS, velocità < 50° pc. */
export function criterioSga(d: { sdsPesoNascita: number | null; sdsLunghezzaNascita: number | null; eta: number;
  sdsStatura: number | null; sdsVelocita: number | null }): Criterio {
  const nascita = [d.sdsPesoNascita, d.sdsLunghezzaNascita].filter((x): x is number => x !== null);
  const parti: StatoCriterio[] = [
    nascita.length === 0 ? 'dati_insufficienti' : nascita.some((x) => leq(x, -2)) ? 'soddisfatto' : 'non_soddisfatto',
    d.eta >= 4 ? 'soddisfatto' : 'non_soddisfatto',
    d.sdsStatura === null ? 'dati_insufficienti' : leq(d.sdsStatura, -2.5) ? 'soddisfatto' : 'non_soddisfatto',
    d.sdsVelocita === null ? 'dati_insufficienti' : arrotonda2(d.sdsVelocita) < 0 ? 'soddisfatto' : 'non_soddisfatto',
  ];
  const stato: StatoCriterio = parti.includes('non_soddisfatto') ? 'non_soddisfatto'
    : parti.includes('dati_insufficienti') ? 'dati_insufficienti' : 'soddisfatto';
  return {
    codice: 'sga', titolo: 'Nato piccolo per l\'età gestazionale (SGA): nascita ≤ −2 DS (carte di Bertino), età ≥ 4 anni, statura ≤ −2,5 DS, velocità < 50° pc',
    stato,
    dettaglio: [
      nascita.length ? `nascita ${nascita.map(fmtSds).join(' / ')}` : 'DS alla nascita non indicati',
      `età ${d.eta.toFixed(1).replace('.', ',')} anni`,
      d.sdsStatura !== null ? `statura ${fmtSds(d.sdsStatura)}` : 'statura mancante',
      d.sdsVelocita !== null ? `velocità ${fmtSds(d.sdsVelocita)}` : 'velocità in DS mancante',
    ].join(', ') + '.',
  };
}

/**
 * Limiti per la sospensione (Nota 39) calcolabili dai dati: velocità < 2 cm/anno o età ossea > 14 anni (F) / > 16 anni (M).
 * La saldatura delle epifisi, anch'essa criterio di sospensione, va valutata sulla radiografia.
 */
export function criteriSospensioneGh(sesso: Sesso, velocitaCmAnno: number | null, etaOssea: number | null): string[] {
  const motivi: string[] = [];
  if (velocitaCmAnno !== null && velocitaCmAnno < 2) motivi.push('Velocità di crescita < 2 cm/anno (statura definitiva o quasi).');
  if (etaOssea !== null && etaOssea > (sesso === 'F' ? 14 : 16)) motivi.push(`Età ossea > ${sesso === 'F' ? 14 : 16} anni.`);
  return motivi;
}

/** Dose massima di somatropina indicata nella Nota 39 (raccomandazione EMA). */
export const DOSE_MASSIMA_GH_UG_KG_DIE = 50;

/** Dose giornaliera in µg/kg/die a partire da mg/settimana (o mg/die) e peso. */
export function doseGhUgKgDie(mg: number, pesoKg: number, periodo: 'giorno' | 'settimana' = 'giorno'): number | null {
  if (!(mg > 0) || !(pesoKg > 0)) return null;
  const mgGiorno = periodo === 'settimana' ? mg / 7 : mg;
  return (mgGiorno * 1000) / pesoKg;
}

/** Età in mesi da giorni (per le funzioni delle curve). */
export const mesiDaGiorni = (giorni: number) => giorni / GIORNI_PER_MESE;

/** Anagrafica del paziente di Auxologia: stessa forma di quella di Allergologia. */
export type { AllergoPaziente as AuxoPaziente } from './allergologia';
