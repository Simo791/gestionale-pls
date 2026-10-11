import { describe, expect, it } from 'vitest';
import { leggiCsv, proponiColonne, trovaIntestazione, unisciDoppioni } from './csv';

describe('leggiCsv', () => {
  it('legge il formato di Excel italiano con punto e virgola, virgolette e BOM', () => {
    const t = '﻿Cod Reg;Descrizione Regione;Nota\r\nA1;"Visita; prima";"di ""prova"""\r\nA2;"Riga\nsu due righe";\r\n';
    expect(leggiCsv(t)).toEqual([
      ['Cod Reg', 'Descrizione Regione', 'Nota'],
      ['A1', 'Visita; prima', 'di "prova"'],
      ['A2', 'Riga\nsu due righe', ''],
    ]);
  });
  it('riconosce la virgola come separatore e scarta le righe vuote', () => {
    expect(leggiCsv('a,b\n\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
  });
});

describe('proponiColonne', () => {
  it('riconosce le intestazioni del catalogo regionale', () => {
    const c = proponiColonne(['ID', 'Cod Reg', 'Descrizione Regione', 'Nota Erogabilità', 'Cod SSN NewLea', 'Codice SSN', 'Descrizione SSN', 'Tariffa', 'Branca1']);
    expect(c).toEqual({ codice_regionale: 1, codice_nazionale: 4, descrizione: 2, branca: 8, nota_erogabilita: 3 });
  });
  it('restituisce -1 per i campi assenti', () => {
    expect(proponiColonne(['Codice', 'Descrizione']).codice_nazionale).toBe(-1);
  });
});

describe('trovaIntestazione', () => {
  it('salta le righe di titolo prima dell\'intestazione', () => {
    const r = [['Allegato1', ''], ['CATALOGO REGIONALE DELLE PRESTAZIONI', ''], ['Cod Regione', 'Descrizione Regione', 'Branca'], ['03.8.M', 'INIEZIONE', '01']];
    expect(trovaIntestazione(r)).toBe(2);
  });
  it('senza intestazione riconoscibile usa la prima riga', () => {
    expect(trovaIntestazione([['x', 'y'], ['1', '2']])).toBe(0);
  });
});

describe('unisciDoppioni', () => {
  const r = (codice: string, descrizione: string, branca = '', nota = '') =>
    ({ codice_regionale: codice, descrizione, codice_nazionale: '', branca, nota_erogabilita: nota });
  it('unisce i codici ripetuti e scarta titoli e righe vuote', () => {
    const esito = unisciDoppioni([r('A1', 'Visita', '01'), r('A1', 'Visita (altra branca)', '02', 'N1'), r('', 'Titolo'), r('Cod Regione', 'Descrizione'), r('A2', 'Esame')]);
    expect(esito.doppioni).toBe(1);
    expect(esito.scartate).toBe(2);
    expect(esito.righe).toEqual([
      { codice_regionale: 'A1', descrizione: 'Visita', codice_nazionale: '', branca: '01, 02', nota_erogabilita: 'N1' },
      { codice_regionale: 'A2', descrizione: 'Esame', codice_nazionale: '', branca: '', nota_erogabilita: '' },
    ]);
  });
});
