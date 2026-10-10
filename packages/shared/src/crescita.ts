import { LMS_CACCIARI } from './crescita-cacciari';
import { LMS_OMS, type Indicatore, type RigaLms } from './crescita-oms';
import type { Sesso } from './tipi';

export type { Indicatore } from './crescita-oms';

export interface Lms {
  L: number;
  M: number;
  S: number;
}

/**
 * Curve di riferimento disponibili:
 *  - 'oms': WHO Child Growth Standards 2006 (0–5 anni) + WHO Growth Reference 2007
 *    (altezza fino a 19 anni, peso fino a 10 anni); unica con la circonferenza cranica (0–5 anni);
 *  - 'cacciari': curve italiane SIEDP (Cacciari et al. 2006), peso e altezza 2–20 anni.
 */
export type Riferimento = 'oms' | 'cacciari';

const Z = { 3: -1.880794, 10: -1.281552, 15: -1.036433, 25: -0.67449, 50: 0, 75: 0.67449, 85: 1.036433, 90: 1.281552, 97: 1.880794 } as const;
export type Percentile = keyof typeof Z;

export const RIFERIMENTI: Record<Riferimento, {
  nome: string;
  fonte: string;
  /** Percentili disegnati (convenzione della curva). */
  percentili: readonly Percentile[];
  /** Fascia interna evidenziata. */
  fasciaInterna: readonly [Percentile, Percentile];
}> = {
  oms: {
    nome: 'OMS',
    fonte: 'WHO Child Growth Standards 2006 (0–5 anni) e WHO Growth Reference 2007 (5–19 anni)',
    percentili: [3, 15, 50, 85, 97],
    fasciaInterna: [15, 85],
  },
  cacciari: {
    nome: 'Cacciari (SIEDP 2006)',
    fonte: 'Cacciari E. et al., Italian cross-sectional growth charts for height, weight and BMI (2 to 20 yr), J Endocrinol Invest 2006',
    percentili: [3, 10, 25, 50, 75, 90, 97],
    fasciaInterna: [25, 75],
  },
};

/** Percentili OMS (compatibilità con il codice precedente). */
export const PERCENTILI = RIFERIMENTI.oms.percentili.map((p) => ({ p, z: Z[p] }));

export const GIORNI_PER_MESE = 30.4375;

/** Età (5 anni) oltre la quale si usano di norma le curve italiane per peso e altezza. */
export const ETA_PASSAGGIO_CACCIARI_MESI = 60;

function tabella(indicatore: Indicatore, sesso: Sesso, rif: Riferimento): readonly RigaLms[] | null {
  if (rif === 'oms') return LMS_OMS[indicatore][sesso];
  return indicatore === 'circonferenza_cranica' ? null : LMS_CACCIARI[indicatore][sesso];
}

/** Riferimento consigliato: OMS fino a 5 anni (e sempre per la circonferenza cranica), poi Cacciari. */
export function riferimentoPredefinito(etaGiorni: number, indicatore: Indicatore = 'peso'): Riferimento {
  if (indicatore === 'circonferenza_cranica') return 'oms';
  return etaGiorni / GIORNI_PER_MESE < ETA_PASSAGGIO_CACCIARI_MESI ? 'oms' : 'cacciari';
}

/** Indicatori disponibili in un riferimento. */
export const disponibile = (indicatore: Indicatore, rif: Riferimento) => tabella(indicatore, 'M', rif) !== null;

/** Età minima e massima (in mesi) coperte dalle tabelle. */
export function etaMinimaMesi(indicatore: Indicatore, sesso: Sesso, rif: Riferimento = 'oms'): number {
  return tabella(indicatore, sesso, rif)?.[0]?.[0] ?? 0;
}
export function etaMassimaMesi(indicatore: Indicatore, sesso: Sesso, rif: Riferimento = 'oms'): number {
  const righe = tabella(indicatore, sesso, rif);
  return righe?.[righe.length - 1]?.[0] ?? 0;
}

/** Parametri LMS all'età indicata (interpolazione lineare). Null fuori tabella. */
export function lmsAEta(indicatore: Indicatore, sesso: Sesso, mesi: number, rif: Riferimento = 'oms'): Lms | null {
  const righe = tabella(indicatore, sesso, rif);
  if (!righe) return null;
  const primo = righe[0];
  const ultimo = righe[righe.length - 1];
  if (!primo || !ultimo || mesi < primo[0] || mesi > ultimo[0]) return null;
  for (let i = 0; i < righe.length - 1; i++) {
    const a = righe[i]!;
    const b = righe[i + 1]!;
    if (mesi >= a[0] && mesi <= b[0]) {
      const t = b[0] === a[0] ? 0 : (mesi - a[0]) / (b[0] - a[0]);
      return { L: a[1] + t * (b[1] - a[1]), M: a[2] + t * (b[2] - a[2]), S: a[3] + t * (b[3] - a[3]) };
    }
  }
  return { L: ultimo[1], M: ultimo[2], S: ultimo[3] };
}

/** Valore della misura corrispondente a uno z-score (formula LMS di Cole). */
export function valoreDaZ({ L, M, S }: Lms, z: number): number {
  return L === 0 ? M * Math.exp(S * z) : M * Math.pow(1 + L * S * z, 1 / L);
}

/** Z-score di una misura (formula LMS di Cole). */
export function zDaValore({ L, M, S }: Lms, x: number): number {
  return L === 0 ? Math.log(x / M) / S : (Math.pow(x / M, L) - 1) / (L * S);
}

/** Funzione di ripartizione della normale standard (approssimazione di Abramowitz-Stegun 7.1.26). */
export function normaleCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * (Math.abs(z) / Math.SQRT2));
  const erf =
    1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) *
      Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

/**
 * Percentile (0–100) di una misura all'età in giorni. Senza riferimento esplicito usa quello
 * consigliato per l'età. Null se l'età è fuori dalle tabelle. Solo informativo.
 */
export function percentileMisura(
  indicatore: Indicatore, sesso: Sesso, etaGiorni: number, valore: number, rif: Riferimento = riferimentoPredefinito(etaGiorni, indicatore),
): number | null {
  const lms = lmsAEta(indicatore, sesso, etaGiorni / GIORNI_PER_MESE, rif);
  if (!lms || valore <= 0) return null;
  return normaleCdf(zDaValore(lms, valore)) * 100;
}

export interface PuntoCurva {
  mesi: number;
  /** Valore della misura per ciascun percentile del riferimento. */
  valori: Partial<Record<Percentile, number>>;
}

/** Curve dei percentili del riferimento, un punto per mese, entro la copertura della tabella. */
export function curvePercentili(indicatore: Indicatore, sesso: Sesso, mesiMax: number, rif: Riferimento = 'oms'): PuntoCurva[] {
  const inizio = etaMinimaMesi(indicatore, sesso, rif);
  const fine = Math.min(mesiMax, etaMassimaMesi(indicatore, sesso, rif));
  const punti: PuntoCurva[] = [];
  for (let m = inizio; m <= fine; m++) {
    const lms = lmsAEta(indicatore, sesso, m, rif);
    if (!lms) continue;
    const valori: PuntoCurva['valori'] = {};
    for (const p of RIFERIMENTI[rif].percentili) valori[p] = valoreDaZ(lms, Z[p]);
    punti.push({ mesi: m, valori });
  }
  return punti;
}

/** Percentile in forma leggibile: "<3°", "45°", ">97°". */
export function fmtPercentile(p: number | null): string {
  if (p === null) return '—';
  if (p < 3) return '<3°';
  if (p > 97) return '>97°';
  return `${Math.round(p)}°`;
}
