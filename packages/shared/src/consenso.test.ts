import { describe, expect, it } from 'vitest';
import { statoConsenso } from './consenso';
import type { Consenso, RelazioneTutela } from './tipi';

const OGGI = '2026-10-01';
const rel = (tutore_id: string, extra: Partial<RelazioneTutela> = {}): RelazioneTutela => ({
  paziente_id: 'p1',
  tutore_id,
  tipo: 'madre',
  responsabilita_genitoriale: true,
  limitazioni: null,
  valida_dal: '2020-01-01',
  valida_al: null,
  ...extra,
});
const cons = (tutore_id: string, stato: Consenso['stato'], registrato_il: string): Consenso => ({
  id: `${tutore_id}-${registrato_il}`,
  paziente_id: 'p1',
  tutore_id,
  finalita: 'dati_sanitari',
  versione_informativa: '2026-10',
  stato,
  canale: 'portale',
  registrato_il,
});

describe('statoConsenso', () => {
  it('è assente se nessun genitore ha concesso', () => {
    expect(statoConsenso([rel('mamma'), rel('papa')], [], 'dati_sanitari', OGGI)).toBe('assente');
  });

  it('è parziale con un solo consenso su due genitori', () => {
    const consensi = [cons('mamma', 'concesso', '2026-09-01T10:00:00Z')];
    expect(statoConsenso([rel('mamma'), rel('papa')], consensi, 'dati_sanitari', OGGI)).toBe('parziale');
  });

  it('è completo quando entrambi hanno concesso', () => {
    const consensi = [
      cons('mamma', 'concesso', '2026-09-01T10:00:00Z'),
      cons('papa', 'concesso', '2026-09-02T10:00:00Z'),
    ];
    expect(statoConsenso([rel('mamma'), rel('papa')], consensi, 'dati_sanitari', OGGI)).toBe('completo');
  });

  it("conta solo l'ultima dichiarazione: una revoca annulla il consenso precedente", () => {
    const consensi = [
      cons('mamma', 'concesso', '2026-09-01T10:00:00Z'),
      cons('mamma', 'revocato', '2026-09-15T10:00:00Z'),
    ];
    expect(statoConsenso([rel('mamma')], consensi, 'dati_sanitari', OGGI)).toBe('assente');
  });

  it('ignora chi non ha (più) la responsabilità genitoriale', () => {
    const relazioni = [rel('mamma'), rel('papa', { valida_al: '2025-12-31' })];
    const consensi = [cons('mamma', 'concesso', '2026-09-01T10:00:00Z')];
    expect(statoConsenso(relazioni, consensi, 'dati_sanitari', OGGI)).toBe('completo');
  });
});
