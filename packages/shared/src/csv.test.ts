import { describe, expect, it } from 'vitest';
import { leggiCsv, proponiColonne } from './csv';

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
