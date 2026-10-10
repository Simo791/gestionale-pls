import { describe, expect, it } from 'vitest';
import { curvePercentili, fmtPercentile, lmsAEta, normaleCdf, percentileMisura, riferimentoPredefinito, valoreDaZ } from './crescita';

const vicino = (a: number, b: number, tolleranza: number) => Math.abs(a - b) <= tolleranza;

describe('curve OMS', () => {
  it('peso alla nascita, maschi: mediana 3,3 kg e 97° percentile 4,4 kg (tabelle OMS)', () => {
    const lms = lmsAEta('peso', 'M', 0)!;
    expect(vicino(valoreDaZ(lms, 0), 3.3, 0.05)).toBe(true);
    expect(vicino(valoreDaZ(lms, 1.880794), 4.4, 0.06)).toBe(true);
  });

  it('altezza a 24 mesi, femmine: mediana circa 86 cm', () => {
    expect(vicino(valoreDaZ(lmsAEta('altezza', 'F', 24)!, 0), 86.4, 0.3)).toBe(true);
  });

  it('collega standard 0–5 anni e reference 2007 senza buchi', () => {
    const curva = curvePercentili('peso', 'M', 120);
    expect(curva.length).toBe(121);
    expect(curva.every((p, i) => i === 0 || p.valori[50]! > curva[i - 1]!.valori[50]! - 0.2)).toBe(true);
  });

  it('la circonferenza cranica si ferma a 5 anni', () => {
    expect(lmsAEta('circonferenza_cranica', 'M', 61)).toBeNull();
  });
});

describe('curve italiane (Cacciari 2006)', () => {
  it('altezza mediana: 139,0 cm a 10 anni (maschi); a 20 anni 176,5 cm (maschi) e 162,6 cm (femmine)', () => {
    expect(vicino(lmsAEta('altezza', 'M', 120, 'cacciari')!.M, 139.0, 0.01)).toBe(true);
    expect(vicino(lmsAEta('altezza', 'M', 240, 'cacciari')!.M, 176.5, 0.01)).toBe(true);
    expect(vicino(lmsAEta('altezza', 'F', 240, 'cacciari')!.M, 162.6, 0.01)).toBe(true);
  });
  it('coprono 2–20 anni e non hanno la circonferenza cranica', () => {
    expect(lmsAEta('peso', 'F', 23, 'cacciari')).toBeNull();
    expect(lmsAEta('circonferenza_cranica', 'F', 30, 'cacciari')).toBeNull();
    expect(curvePercentili('altezza', 'M', 300, 'cacciari')[0]!.valori[10] !== undefined).toBe(true);
  });
  it('riferimento consigliato: OMS sotto i 5 anni, Cacciari dopo; circonferenza sempre OMS', () => {
    expect(riferimentoPredefinito(4 * 365)).toBe('oms');
    expect(riferimentoPredefinito(6 * 365)).toBe('cacciari');
    expect(riferimentoPredefinito(6 * 365, 'circonferenza_cranica')).toBe('oms');
  });
});

describe('percentile di una misura', () => {
  it('la mediana è il 50° percentile', () => {
    const m = lmsAEta('peso', 'F', 12)!.M;
    expect(Math.round(percentileMisura('peso', 'F', Math.round(12 * 30.4375), m)!)).toBe(50);
  });

  it('normale standard: valori noti', () => {
    expect(vicino(normaleCdf(1.96), 0.975, 0.001)).toBe(true);
    expect(vicino(normaleCdf(-1.880794), 0.03, 0.001)).toBe(true);
  });

  it('formato leggibile', () => {
    expect(fmtPercentile(1.2)).toBe('<3°');
    expect(fmtPercentile(45.6)).toBe('46°');
    expect(fmtPercentile(99)).toBe('>97°');
    expect(fmtPercentile(null)).toBe('—');
  });
});
