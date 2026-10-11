import { describe, expect, it } from 'vitest';
import { categoriaAllergene, COMPONENTI, componentiDi, esitoComponente, PANNELLO_IGE, trovaComponente } from './molecolare';

describe('Catalogo dei componenti molecolari', () => {
  it('ISAC E112i: 112 componenti', () => {
    expect(componentiDi('ISAC')).toHaveLength(112);
  });
  it('ALEX²: 177 componenti diagnostici + 5 solo ricerca', () => {
    expect(COMPONENTI.filter((c) => c.alex && !c.ruo)).toHaveLength(177);
    expect(COMPONENTI.filter((c) => c.ruo)).toHaveLength(5);
  });
  it('nessun codice duplicato', () => {
    const codici = COMPONENTI.map((c) => c.codice);
    expect(new Set(codici).size).toBe(codici.length);
  });
});

describe('trovaComponente', () => {
  it('toglie il prefisso n/r solo quando serve', () => {
    expect(trovaComponente('rAra h 2')?.codice).toBe('Ara h 2');
    expect(trovaComponente('Raj c')?.codice).toBe('Raj c');
    expect(trovaComponente('nMUXF3')?.codice).toBe('MUXF3');
  });
  it('riconosce le varianti dei referti', () => {
    expect(trovaComponente('rTri a 19.0101')?.codice).toBe('Tri a 19');
    expect(trovaComponente('rPhl p 5b')?.codice).toBe('Phl p 5');
    expect(trovaComponente('nGad m 2&3')?.codice).toBe('Gad m 2+3');
    expect(trovaComponente('sconosciuto')).toBeNull();
  });
  it('Cor a 1 del nocciolo: alimento (seme) o inalante (polline)', () => {
    expect(trovaComponente('rCor a 1.0401')?.categoria).toBe('alimenti');
    expect(trovaComponente('rCor a 1.0101')?.categoria).toBe('inalanti');
  });
});

describe('cut-off', () => {
  it('ISAC e ALEX 0,3; ImmunoCAP 0,35', () => {
    expect(esitoComponente(0.3, 'ISAC')).toBe('positivo');
    expect(esitoComponente(0.29, 'ALEX')).toBe('negativo');
    expect(esitoComponente(0.34, 'ImmunoCAP')).toBe('negativo');
  });
  it('categorie di estratti e componenti', () => {
    expect(categoriaAllergene('Arachide', false)).toBe('alimenti');
    expect(categoriaAllergene('Fel d 1', true)).toBe('inalanti');
    expect(new Set(PANNELLO_IGE.map((e) => e.codice)).size).toBe(PANNELLO_IGE.length);
  });
});
