import { describe, expect, it } from 'vitest';
import {
  avvisoVitaAltezza, bmi, classificaPeso, staturaPerCurva, criterioSga, criteriNota39, criteriSospensioneGh, doseGhUgKgDie, etaDecimale, fmtSds,
  lmsBmi, lmsPesoLunghezza, misuraPerVelocita, pubarcaPrecoce, sdsMisura, targetGenetico, valutaPuberta,
  variazioneSdsAnno, velocitaCrescita, type DatiNota39,
} from './auxologia';
import { lmsAEta, valoreDaZ } from './crescita';

describe('età decimale', () => {
  it('un anno = 365,25 giorni', () => {
    expect(etaDecimale('2020-01-01', '2021-01-01')).toBeCloseTo(366 / 365.25, 6);
    expect(etaDecimale('2016-03-15', '2026-03-15')).toBeCloseTo(10.0, 2);
  });
  it('data precedente alla nascita: errore', () => {
    expect(() => etaDecimale('2020-01-02', '2020-01-01')).toThrow();
  });
});

describe('tabelle OMS BMI e peso per lunghezza (valori pubblicati)', () => {
  it('BMI OMS 2007 maschi 61 mesi: L −0,7387 M 15,2641 S 0,0839', () => {
    const l = lmsBmi('M', 61, 'oms')!;
    expect(l.L).toBeCloseTo(-0.7387, 4); expect(l.M).toBeCloseTo(15.2641, 4); expect(l.S).toBeCloseTo(0.0839, 4);
  });
  it('BMI OMS 2006 maschi alla nascita: L −0,3053 M 13,4069 S 0,0956', () => {
    const l = lmsBmi('M', 0, 'oms')!;
    expect(l.M).toBeCloseTo(13.4069, 4); expect(l.L).toBeCloseTo(-0.3053, 4);
  });
  it('BMI OMS a 24 mesi è quello «in piedi» (M 16,0189 nei maschi)', () => {
    expect(lmsBmi('M', 24, 'oms')!.M).toBeCloseTo(16.0189, 4);
  });
  it('peso per lunghezza OMS maschi 45 cm: M 2,441', () => {
    expect(lmsPesoLunghezza('M', 45)!.M).toBeCloseTo(2.441, 3);
    expect(lmsPesoLunghezza('M', 44.9)).toBeNull();
    expect(lmsPesoLunghezza('F', 110)!.M).toBeCloseTo(18.3324, 4);
  });
  it('BMI OMS oltre 228 mesi e Cacciari sotto 24 mesi: fuori tabella', () => {
    expect(lmsBmi('F', 229, 'oms')).toBeNull();
    expect(lmsBmi('F', 23, 'cacciari')).toBeNull();
    expect(lmsBmi('F', 240, 'cacciari') !== null).toBe(true);
  });
});

describe('DS delle misure', () => {
  it('la mediana ha DS 0 e percentile 50 (Cacciari dai 2 anni)', () => {
    const m = lmsAEta('altezza', 'M', 120, 'cacciari')!.M;
    const s = sdsMisura('altezza', 'M', 120, m)!;
    expect(s.z).toBeCloseTo(0, 6); expect(s.percentile).toBeCloseTo(50, 4); expect(s.riferimento).toBe('cacciari');
  });
  it('sotto i 2 anni usa le curve OMS', () => {
    expect(sdsMisura('peso', 'F', 12, 9)!.riferimento).toBe('oms');
    expect(sdsMisura('circonferenza_cranica', 'F', 30, 48)!.riferimento).toBe('oms');
  });
  it('valore a −2 DS ricostruito', () => {
    const lms = lmsAEta('altezza', 'F', 96, 'cacciari')!;
    expect(sdsMisura('altezza', 'F', 96, valoreDaZ(lms, -2))!.z).toBeCloseTo(-2, 6);
  });
  it('correzione OMS sdraiato/in piedi di 0,7 cm', () => {
    const lms = lmsAEta('altezza', 'M', 12, 'oms')!;
    const inPiedi = sdsMisura('altezza', 'M', 12, lms.M - 0.7, 'oms', { sdraiato: false })!;
    expect(inPiedi.z).toBeCloseTo(0, 6);
    const lms3 = lmsAEta('altezza', 'M', 36, 'oms')!;
    expect(sdsMisura('altezza', 'M', 36, lms3.M + 0.7, 'oms', { sdraiato: true })!.z).toBeCloseTo(0, 6);
    // Senza indicazione: nessuna correzione
    expect(sdsMisura('altezza', 'M', 36, lms3.M, 'oms')!.z).toBeCloseTo(0, 6);
  });
  it('OMS: statura in piedi da 24 mesi (M 87,13), lunghezza fino a 23,99 mesi', () => {
    expect(lmsAEta('altezza', 'M', 24, 'oms')!.M).toBeCloseTo(87.1303, 4);
    expect(lmsAEta('altezza', 'M', 23.99, 'oms')!.M).toBeCloseTo(87.8018, 4);
    expect(lmsAEta('altezza', 'M', 23.5, 'oms')!.M).toBeGreaterThan(86.9392);
    expect(lmsBmi('M', 23.99, 'oms')!.M).toBeCloseTo(15.7356, 4);
  });
  it('Cacciari a 30 mesi: misura da sdraiato corretta di −0,7 cm', () => {
    const lms = lmsAEta('altezza', 'F', 30, 'cacciari')!;
    expect(sdsMisura('altezza', 'F', 30, lms.M + 0.7, 'cacciari', { sdraiato: true })!.z).toBeCloseTo(0, 6);
    expect(staturaPerCurva(30, 90, undefined)).toBe(90);
  });
  it('valori non validi: null', () => {
    expect(sdsMisura('peso', 'M', 60, 0)).toBeNull();
    expect(sdsMisura('altezza', 'M', 300, 170)).toBeNull();
  });
  it('formato DS con segno tipografico', () => {
    expect(fmtSds(-1.8549)).toBe('−1,85 DS');
    expect(fmtSds(0.004)).toBe('0,00 DS');
    expect(fmtSds(2)).toBe('+2,00 DS');
    expect(fmtSds(null)).toBe('—');
  });
});

describe('BMI', () => {
  it('peso / statura²', () => {
    expect(bmi(30, 150)!).toBeCloseTo(13.33, 2);
    expect(bmi(0, 150)).toBeNull();
  });
});

describe('target genetico (Tanner)', () => {
  it('maschio: (180 + 165 + 13) / 2 = 179 ± 8,5', () => {
    const t = targetGenetico(180, 165, 'M')!;
    expect(t.cm).toBe(179); expect(t.min).toBe(170.5); expect(t.max).toBe(187.5);
  });
  it('femmina: (180 + 165 − 13) / 2 = 166', () => {
    expect(targetGenetico(180, 165, 'F')!.cm).toBe(166);
  });
  it('DS del target sulla statura a 20 anni (mediana → 0)', () => {
    const m = lmsAEta('altezza', 'F', 240, 'cacciari')!.M;
    // padre + madre − 13 = 2·m  ⇒ padre = madre = m + 6,5
    expect(targetGenetico(m + 6.5, m + 6.5, 'F')!.sds!).toBeCloseTo(0, 6);
  });
  it('stature dei genitori non plausibili: null', () => {
    expect(targetGenetico(80, 165, 'M')).toBeNull();
  });
});

describe('velocità di crescita', () => {
  it('cm/anno su un anno', () => {
    const v = velocitaCrescita({ data: '2025-01-01', altezza_cm: 120 }, { data: '2026-01-01', altezza_cm: 125.5 })!;
    expect(v.cmAnno).toBeCloseTo(5.5 / (365 / 365.25), 4); expect(v.affidabile).toBe(true); expect(v.avviso).toBeNull();
  });
  it('meno di 6 mesi: non affidabile', () => {
    const v = velocitaCrescita({ data: '2025-01-01', altezza_cm: 120 }, { data: '2025-04-01', altezza_cm: 121.5 })!;
    expect(v.affidabile).toBe(false);
  });
  it('statura in calo: avviso', () => {
    const v = velocitaCrescita({ data: '2025-01-01', altezza_cm: 120 }, { data: '2026-01-01', altezza_cm: 119 })!;
    expect(v.affidabile).toBe(false);
  });
  it('sceglie la misura più vicina a un anno, almeno 6 mesi prima', () => {
    const ms = [
      { data: '2024-01-10', altezza_cm: 110 }, { data: '2024-12-20', altezza_cm: 115 },
      { data: '2025-09-01', altezza_cm: 118 }, { data: '2026-01-05', altezza_cm: 120 },
    ];
    expect(misuraPerVelocita(ms, ms[3]!)!.data).toBe('2024-12-20');
    expect(misuraPerVelocita(ms.slice(2), ms[3]!)).toBeNull();
  });
  it('variazione DS per anno', () => {
    expect(variazioneSdsAnno(-1, '2025-01-01', -1.6, '2026-01-01')!).toBeCloseTo(-0.6 * 365.25 / 365, 6);
  });
});

describe('pubertà (Klein, AAFP 2017)', () => {
  it('femmina B2 a 7,5 anni: precoce; a 8,5 anni: nei limiti', () => {
    expect(valutaPuberta({ sesso: 'F', eta: 7.5, b: 2 }).esito).toBe('precoce');
    expect(valutaPuberta({ sesso: 'F', eta: 8.5, b: 2 }).esito).toBe('nei_limiti');
  });
  it('femmina B1 a 13 anni: ritardo', () => {
    expect(valutaPuberta({ sesso: 'F', eta: 13.0, b: 1 }).esito).toBe('ritardo');
    expect(valutaPuberta({ sesso: 'F', eta: 12.9, b: 1 }).esito).toBe('nei_limiti');
  });
  it('femmina senza menarca a 15 anni: amenorrea primaria da valutare', () => {
    expect(valutaPuberta({ sesso: 'F', eta: 15.1, b: 4, menarca: false }).esito).toBe('amenorrea_primaria');
  });
  it('maschio testicoli 4 ml a 8,9 anni: precoce; 3 ml a 14 anni: ritardo', () => {
    expect(valutaPuberta({ sesso: 'M', eta: 8.9, testicoli_ml: 4 }).esito).toBe('precoce');
    expect(valutaPuberta({ sesso: 'M', eta: 14, testicoli_ml: 3 }).esito).toBe('ritardo');
    expect(valutaPuberta({ sesso: 'M', eta: 11, testicoli_ml: 3 }).esito).toBe('nei_limiti');
  });
  it('dati mancanti', () => {
    expect(valutaPuberta({ sesso: 'M', eta: 10 }).esito).toBe('dati_insufficienti');
    expect(valutaPuberta({ sesso: 'F', eta: 10 }).esito).toBe('dati_insufficienti');
  });
  it('pubarca isolato precoce (anche con stadio mammario non indicato)', () => {
    expect(pubarcaPrecoce({ sesso: 'F', eta: 7, b: 1, ph: 2 })).toBe(true);
    expect(pubarcaPrecoce({ sesso: 'F', eta: 7, ph: 2 })).toBe(true);
    expect(pubarcaPrecoce({ sesso: 'F', eta: 7, b: 2, ph: 2 })).toBe(false);
    expect(pubarcaPrecoce({ sesso: 'M', eta: 9.5, testicoli_ml: 2, ph: 2 })).toBe(false);
  });
  it('maschio con solo lo stadio G: testo che chiede l\'orchidometro', () => {
    const v = valutaPuberta({ sesso: 'M', eta: 14.2, g: 1 });
    expect(v.esito).toBe('ritardo');
    expect(v.testo.includes('non misurato')).toBe(true);
  });
  it('femmina senza menarca a 15 anni anche senza stadio B', () => {
    expect(valutaPuberta({ sesso: 'F', eta: 15.2, menarca: false }).esito).toBe('amenorrea_primaria');
  });
});

/** Peso che dà un certo z di BMI a una data età e statura. */
function pesoPerZ(sesso: 'M' | 'F', mesi: number, altezza: number, z: number) {
  const lms = lmsBmi(sesso, mesi, 'oms')!;
  return valoreDaZ(lms, z) * (altezza / 100) ** 2;
}

describe('classificazione del peso (Consensus SIEDP-SIP 2018, OMS)', () => {
  it('5–18 anni: >85° sovrappeso, >97° obesità, >99° obesità grave', () => {
    expect(classificaPeso('M', 120, pesoPerZ('M', 120, 140, 0), 140)!.classe).toBe('normale');
    expect(classificaPeso('M', 120, pesoPerZ('M', 120, 140, 1.5), 140)!.classe).toBe('sovrappeso');
    expect(classificaPeso('M', 120, pesoPerZ('M', 120, 140, 2.0), 140)!.classe).toBe('obesita');
    expect(classificaPeso('M', 120, pesoPerZ('M', 120, 140, 2.5), 140)!.classe).toBe('obesita_grave');
    expect(classificaPeso('M', 120, pesoPerZ('M', 120, 140, -2.5), 140)!.classe).toBe('sottopeso');
  });
  it('2–5 anni: >85° rischio di sovrappeso, >97° sovrappeso, >99° obesità', () => {
    expect(classificaPeso('F', 36, pesoPerZ('F', 36, 95, 1.5), 95)!.classe).toBe('rischio_sovrappeso');
    expect(classificaPeso('F', 36, pesoPerZ('F', 36, 95, 2.0), 95)!.classe).toBe('sovrappeso');
    expect(classificaPeso('F', 36, pesoPerZ('F', 36, 95, 2.5), 95)!.classe).toBe('obesita');
  });
  it('sotto i 2 anni usa il peso per lunghezza', () => {
    const lms = lmsPesoLunghezza('M', 75)!;
    const c = classificaPeso('M', 12, valoreDaZ(lms, 0), 75)!;
    expect(c.indicatore).toBe('peso_lunghezza'); expect(c.classe).toBe('normale'); expect(c.percentile).toBeCloseTo(50, 3);
    expect(classificaPeso('M', 12, valoreDaZ(lms, 2.0), 75)!.classe).toBe('sovrappeso');
  });
  it('soglia esatta: il 97° percentile non è «sopra il 97°»', () => {
    expect(classificaPeso('M', 120, pesoPerZ('M', 120, 140, 1.88), 140)!.classe).toBe('sovrappeso');
  });
  it('oltre i 18 anni: null (criteri dell\'adulto)', () => {
    expect(classificaPeso('M', 217, 70, 175)).toBeNull();
    expect(classificaPeso('M', 216, 70, 175) !== null).toBe(true);
  });
  it('fasce 0–5 e 5–18 anni: il passaggio è a 60 mesi', () => {
    expect(classificaPeso('F', 59.9, pesoPerZ('F', 59.9, 110, 1.5), 110)!.classe).toBe('rischio_sovrappeso');
    expect(classificaPeso('F', 60, pesoPerZ('F', 60, 110, 1.5), 110)!.classe).toBe('sovrappeso');
  });
  it('sotto i 2 anni con statura misurata in piedi si aggiungono 0,7 cm', () => {
    const lms = lmsPesoLunghezza('M', 80)!;
    const c = classificaPeso('M', 20, valoreDaZ(lms, 0), 79.3, false)!;
    expect(c.z).toBeCloseTo(0, 6);
  });
  it('rapporto vita/statura: avviso solo dai 6 anni con sovrappeso', () => {
    expect(avvisoVitaAltezza(0.55, 96, 'obesita')).toBe(true);
    expect(avvisoVitaAltezza(0.55, 96, 'normale')).toBe(false);
    expect(avvisoVitaAltezza(0.55, 48, 'obesita')).toBe(false);
  });
});

const base: DatiNota39 = {
  sesso: 'M', eta: 8, sdsStatura: null, sdsTarget: null, sdsVelocita: null, sdsVelocitaAnnoPrecedente: null,
  variazioneSdsAnno: null, lesioniIpotalamoIpofisarie: null, testGh: [],
};
const stato = (d: Partial<DatiNota39>, codice: string) =>
  criteriNota39({ ...base, ...d }).auxologici.find((c) => c.codice === codice)!.stato;

describe('Nota AIFA 39: criteri auxologici', () => {
  it('a) statura ≤ −3 DS (−3,004 arrotondato conta come −3,00)', () => {
    expect(stato({ sdsStatura: -3.004 }, 'a')).toBe('soddisfatto');
    expect(stato({ sdsStatura: -2.99 }, 'a')).toBe('non_soddisfatto');
    expect(stato({}, 'a')).toBe('dati_insufficienti');
  });
  it('b) statura ≤ −2 e velocità ≤ −1', () => {
    expect(stato({ sdsStatura: -2.1, sdsVelocita: -1.0 }, 'b')).toBe('soddisfatto');
    expect(stato({ sdsStatura: -2.1, sdsVelocita: -0.9, variazioneSdsAnno: -0.2 }, 'b')).toBe('non_soddisfatto');
    expect(stato({ sdsStatura: -1.9, sdsVelocita: -3 }, 'b')).toBe('non_soddisfatto');
  });
  it('b) oppure perdita di 0,5 DS/anno solo sopra i 2 anni', () => {
    expect(stato({ sdsStatura: -2.1, variazioneSdsAnno: -0.5 }, 'b')).toBe('soddisfatto');
    expect(stato({ eta: 1.8, sdsStatura: -2.1, sdsVelocita: -0.5, variazioneSdsAnno: -0.8 }, 'b')).toBe('non_soddisfatto');
    expect(stato({ sdsStatura: -2.1, sdsVelocita: -0.5 }, 'b')).toBe('dati_insufficienti');
  });
  it('c) −1,5 DS sotto il target e velocità ≤ −2 (o ≤ −1,5 per 2 anni)', () => {
    expect(stato({ sdsStatura: -1.0, sdsTarget: 0.5, sdsVelocita: -2.0 }, 'c')).toBe('soddisfatto');
    expect(stato({ sdsStatura: -1.0, sdsTarget: 0.5, sdsVelocita: -1.6, sdsVelocitaAnnoPrecedente: -1.5 }, 'c')).toBe('soddisfatto');
    expect(stato({ sdsStatura: -1.0, sdsTarget: 0.5, sdsVelocita: -1.6, sdsVelocitaAnnoPrecedente: -1.2 }, 'c')).toBe('non_soddisfatto');
    expect(stato({ sdsStatura: -1.0, sdsTarget: 0.5, sdsVelocita: -1.6 }, 'c')).toBe('dati_insufficienti');
    expect(stato({ sdsStatura: -1.0, sdsTarget: 0.4, sdsVelocita: -3 }, 'c')).toBe('non_soddisfatto');
  });
  it('d) velocità ≤ −2 anche senza bassa statura', () => {
    expect(stato({ sdsStatura: 0.5, sdsVelocita: -2.0 }, 'd')).toBe('soddisfatto');
    expect(stato({ sdsVelocita: -1.4 }, 'd')).toBe('non_soddisfatto');
  });
  it('e) lesioni ipotalamo-ipofisarie', () => {
    expect(stato({ lesioniIpotalamoIpofisarie: true }, 'e')).toBe('soddisfatto');
  });
});

describe('Nota AIFA 39: laboratorio', () => {
  const lab = (t: DatiNota39['testGh']) => criteriNota39({ ...base, testGh: t }).laboratorio.stato;
  it('due stimoli diversi, giorni diversi, picco < 8', () => {
    expect(lab([{ data: '2026-01-10', stimolo: 'arginina', picco_ug_l: 6.1 }, { data: '2026-01-20', stimolo: 'clonidina', picco_ug_l: 7.9 }])).toBe('soddisfatto');
  });
  it('picco di 8 non è deficitario; GHRH + arginina soglia 20', () => {
    expect(lab([{ data: '2026-01-10', stimolo: 'arginina', picco_ug_l: 8 }, { data: '2026-01-20', stimolo: 'clonidina', picco_ug_l: 5 }])).toBe('non_soddisfatto');
    expect(lab([{ data: '2026-01-10', stimolo: 'ghrh_arginina', picco_ug_l: 15 }, { data: '2026-01-20', stimolo: 'clonidina', picco_ug_l: 5 }])).toBe('soddisfatto');
  });
  it('stesso stimolo o stesso giorno: non basta', () => {
    expect(lab([{ data: '2026-01-10', stimolo: 'arginina', picco_ug_l: 3 }, { data: '2026-01-20', stimolo: 'arginina', picco_ug_l: 4 }])).toBe('non_soddisfatto');
    expect(lab([{ data: '2026-01-10', stimolo: 'arginina', picco_ug_l: 3 }, { data: '2026-01-10', stimolo: 'clonidina', picco_ug_l: 4 }])).toBe('non_soddisfatto');
    expect(lab([{ data: '2026-01-10', stimolo: 'arginina', picco_ug_l: 3 }])).toBe('dati_insufficienti');
  });
});

describe('Nota AIFA 39: SGA, sospensione, dose', () => {
  it('SGA: tutti i requisiti', () => {
    expect(criterioSga({ sdsPesoNascita: -2.1, sdsLunghezzaNascita: null, eta: 4.5, sdsStatura: -2.6, sdsVelocita: -0.3 }).stato).toBe('soddisfatto');
    expect(criterioSga({ sdsPesoNascita: -2.1, sdsLunghezzaNascita: null, eta: 3.9, sdsStatura: -2.6, sdsVelocita: -0.3 }).stato).toBe('non_soddisfatto');
    expect(criterioSga({ sdsPesoNascita: -2.1, sdsLunghezzaNascita: null, eta: 5, sdsStatura: -2.6, sdsVelocita: 0 }).stato).toBe('non_soddisfatto');
    expect(criterioSga({ sdsPesoNascita: null, sdsLunghezzaNascita: null, eta: 5, sdsStatura: -2.6, sdsVelocita: -1 }).stato).toBe('dati_insufficienti');
  });
  it('sospensione: velocità < 2 cm/anno o età ossea > 14 F / > 16 M', () => {
    expect(criteriSospensioneGh('F', 1.9, null)).toHaveLength(1);
    expect(criteriSospensioneGh('F', 2, 14)).toHaveLength(0);
    expect(criteriSospensioneGh('F', null, 14.1)).toHaveLength(1);
    expect(criteriSospensioneGh('M', null, 16)).toHaveLength(0);
  });
  it('dose µg/kg/die', () => {
    expect(doseGhUgKgDie(0.9, 30)!).toBeCloseTo(30, 6);
    expect(doseGhUgKgDie(7, 20, 'settimana')!).toBeCloseTo(50, 6);
    expect(doseGhUgKgDie(1, 0)).toBeNull();
  });
});
