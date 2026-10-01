import { describe, expect, it } from 'vitest';
import { etaInGiorni, etaLeggibile } from './eta';

describe('etaInGiorni', () => {
  it('conta i giorni tra nascita e misurazione', () => {
    expect(etaInGiorni('2023-03-10', '2023-03-10')).toBe(0);
    expect(etaInGiorni('2023-03-10', '2024-03-10')).toBe(366); // il 2024 è bisestile
  });

  it('non dipende dal cambio di ora legale', () => {
    expect(etaInGiorni('2026-03-28', '2026-03-30')).toBe(2);
  });

  it('rifiuta una misurazione prima della nascita', () => {
    expect(() => etaInGiorni('2023-03-10', '2023-03-09')).toThrow();
  });
});

describe('etaLeggibile', () => {
  it('usa i giorni nel primo mese', () => {
    expect(etaLeggibile('2026-09-20', '2026-10-01')).toBe('11 giorni');
  });
  it('usa i mesi fino a due anni', () => {
    expect(etaLeggibile('2026-06-01', '2026-10-01')).toBe('4 mesi');
    expect(etaLeggibile('2025-09-01', '2026-10-01')).toBe('13 mesi');
  });
  it('usa anni e mesi dopo i due anni', () => {
    expect(etaLeggibile('2020-07-22', '2026-10-01')).toBe('6 anni e 2 mesi');
    expect(etaLeggibile('2023-10-01', '2026-10-01')).toBe('3 anni');
  });
});
