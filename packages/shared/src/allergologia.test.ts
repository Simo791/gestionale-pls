import { describe, expect, it } from 'vitest';
import { estensioneScorad, REGIONI_SCORAD, act, avvisiAutoiniettore, cAct, criteriAnafilassi, doseAutoiniettore, esitoIgE, esitoPrick, livelloFeno, poem, scorad, uas7 } from './allergologia';

describe('SCORAD', () => {
  it('A/5 + 7B/2 + C e fasce di gravità', () => {
    const r = scorad({ estensione: 30, intensita: [2, 1, 1, 1, 1, 2], prurito: 6, sonno: 3 });
    expect(r.oggettivo).toBe(34); // 6 + 28
    expect(r.totale).toBe(43);
    expect(r.livello).toBe('moderata');
    expect(r.livelloOggettivo).toBe('moderata');
  });
  it('massimo 103', () => {
    expect(scorad({ estensione: 100, intensita: [3, 3, 3, 3, 3, 3], prurito: 10, sonno: 10 }).totale).toBe(103);
  });
  it('limiti delle fasce', () => {
    expect(scorad({ estensione: 0, intensita: [1, 1, 1, 1, 1, 1], prurito: 3, sonno: 0 }).livello).toBe('lieve'); // 21 + 3 = 24
    expect(scorad({ estensione: 0, intensita: [1, 1, 1, 1, 1, 1], prurito: 4, sonno: 0 }).livello).toBe('moderata'); // 25
  });
  it('rifiuta valori fuori scala', () => {
    expect(() => scorad({ estensione: 120, intensita: [0, 0, 0, 0, 0, 0], prurito: 0, sonno: 0 })).toThrow();
  });
});

describe('estensione SCORAD (mappa corporea)', () => {
  it('pesi: 100% sopra i 2 anni, 96% sotto (figura originale)', () => {
    const tutto = Object.fromEntries(REGIONI_SCORAD.map((r) => [r.codice, 100]));
    expect(estensioneScorad(tutto, false)).toBe(100);
    expect(estensioneScorad(tutto, true)).toBe(96);
  });
  it('metà del viso nel lattante pesa di più', () => {
    expect(estensioneScorad({ testa_ant: 50 }, true)).toBe(4.3); // 8,5 × 50% = 4,25
    expect(estensioneScorad({ testa_ant: 50 }, false)).toBe(2.3); // 4,5 × 50% = 2,25
  });
});

describe('POEM', () => {
  it('fasce di Charman 2013', () => {
    expect(poem([0, 0, 0, 0, 0, 1, 1]).livello).toBe('assente');
    expect(poem([1, 1, 1, 1, 1, 1, 1]).livello).toBe('lieve');
    expect(poem([2, 2, 2, 2, 2, 2, 2]).livello).toBe('moderata');
    expect(poem([3, 3, 3, 3, 3, 3, 3]).livello).toBe('grave');
    expect(poem([4, 4, 4, 4, 4, 4, 1]).livello).toBe('molto_grave');
  });
});

describe('controllo dell’asma', () => {
  it('c-ACT: ≤ 19 non controllato', () => {
    expect(cAct([2, 2, 2, 2, 4, 4, 3]).livello).toBe('non_controllato'); // 8 + 11 = 19
    expect(cAct([2, 2, 2, 2, 4, 4, 4]).livello).toBe('controllato'); // 20
  });
  it('ACT: tre fasce', () => {
    expect(act([4, 4, 4, 4, 4]).livello).toBe('controllato');
    expect(act([4, 4, 3, 3, 3]).livello).toBe('non_ben_controllato');
    expect(act([3, 3, 3, 3, 3]).livello).toBe('scarsamente_controllato');
  });
});

describe('UAS7', () => {
  it('somma di 7 giorni e fasce', () => {
    const g = Array.from({ length: 7 }, () => ({ pomfi: 1, prurito: 1 }));
    expect(uas7(g).totale).toBe(14);
    expect(uas7(g).livello).toBe('lieve');
  });
});

describe('test e anafilassi', () => {
  it('prick ≥ 3 mm oltre il controllo negativo', () => {
    expect(esitoPrick(3, 0)).toBe('positivo');
    expect(esitoPrick(3, 1)).toBe('negativo');
  });
  it('IgE: soglia 0,35 kUA/L', () => {
    expect(esitoIgE(0.35)).toBe('positivo');
    expect(esitoIgE(0.2)).toBe('dubbio');
    expect(esitoIgE(0.05)).toBe('negativo');
  });
  it('FeNO: soglie per età', () => {
    expect(livelloFeno(38, 9)).toBe('elevato');
    expect(livelloFeno(38, 14)).toBe('intermedio');
  });
  it('criteri di anafilassi (WAO 2020)', () => {
    const nessuno = { cute_mucose: false, respiratorio: false, cardiovascolare: false, gastrointestinale: false };
    expect(criteriAnafilassi({ ...nessuno, cute_mucose: true }, true).compatibile).toBe(false);
    expect(criteriAnafilassi({ ...nessuno, cute_mucose: true, respiratorio: true }, false).compatibile).toBe(true);
    expect(criteriAnafilassi({ ...nessuno, cute_mucose: true, gastrointestinale: true }, false).compatibile).toBe(true);
    expect(criteriAnafilassi({ ...nessuno, respiratorio: true }, true).compatibile).toBe(true); // broncospasmo isolato
    expect(criteriAnafilassi({ ...nessuno, respiratorio: true }, false).compatibile).toBe(false);
    expect(criteriAnafilassi({ ...nessuno, cardiovascolare: true }, true).compatibile).toBe(true);
    expect(criteriAnafilassi({ ...nessuno, cardiovascolare: true }, false).compatibile).toBe(false);
    expect(criteriAnafilassi({ ...nessuno, gastrointestinale: true, respiratorio: true }, false).compatibile).toBe(false);
  });
  it('dose dell’autoiniettore per peso', () => {
    expect(doseAutoiniettore(6).dose).toBe(null);
    expect(doseAutoiniettore(14).dose).toBe(0.15);
    expect(doseAutoiniettore(32).dose).toBe(0.3);
  });
  it('avvisi: scadenza, numero, peso', () => {
    const a = avvisiAutoiniettore({ dose_mg: 0.15, numero: 1, scadenza: '2026-11-01', attivo: true }, 27, '2026-10-10');
    expect(a.length).toBe(3);
  });
});
