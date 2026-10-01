import { LMS_OMS, type Indicatore } from './crescita-oms';
import type { Sesso } from './tipi';

export type { Indicatore } from './crescita-oms';

export interface Lms {
  L: number;
  M: number;
  S: number;
}

/** Percentili mostrati nelle curve, con il relativo z-score. */
export const PERCENTILI = [
  { p: 3, z: -1.880794 },
  { p: 15, z: -1.036433 },
  { p: 50, z: 0 },
  { p: 85, z: 1.036433 },
  { p: 97, z: 1.880794 },
] as const;

export const GIORNI_PER_MESE = 30.4375;

/** Età massima (in mesi) coperta dalle tabelle OMS per ciascun indicatore. */
export function etaMassimaMesi(indicatore: Indicatore, sesso: Sesso): number {
  const righe = LMS_OMS[indicatore][sesso];
  return righe[righe.length - 1]?.[0] ?? 0;
}

/** Parametri LMS all'età indicata (interpolazione lineare tra i mesi). Null fuori tabella. */
export function lmsAEta(indicatore: Indicatore, sesso: Sesso, mesi: number): Lms | null {
  const righe = LMS_OMS[indicatore][sesso];
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
 * Percentile (0–100) di una misura all'età in giorni. Null se l'età è fuori dalle tabelle.
 * Solo informativo: non è un giudizio clinico.
 */
export function percentileMisura(indicatore: Indicatore, sesso: Sesso, etaGiorni: number, valore: number): number | null {
  const lms = lmsAEta(indicatore, sesso, etaGiorni / GIORNI_PER_MESE);
  if (!lms || valore <= 0) return null;
  return normaleCdf(zDaValore(lms, valore)) * 100;
}

export interface PuntoCurva {
  mesi: number;
  p3: number;
  p15: number;
  p50: number;
  p85: number;
  p97: number;
}

/** Curve dei percentili 3–15–50–85–97 da 0 a mesiMax, un punto per mese. */
export function curvePercentili(indicatore: Indicatore, sesso: Sesso, mesiMax: number): PuntoCurva[] {
  const fine = Math.min(mesiMax, etaMassimaMesi(indicatore, sesso));
  const punti: PuntoCurva[] = [];
  for (let m = 0; m <= fine; m++) {
    const lms = lmsAEta(indicatore, sesso, m);
    if (!lms) continue;
    punti.push({
      mesi: m,
      p3: valoreDaZ(lms, PERCENTILI[0].z),
      p15: valoreDaZ(lms, PERCENTILI[1].z),
      p50: valoreDaZ(lms, PERCENTILI[2].z),
      p85: valoreDaZ(lms, PERCENTILI[3].z),
      p97: valoreDaZ(lms, PERCENTILI[4].z),
    });
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
