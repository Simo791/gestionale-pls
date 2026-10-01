import type { Consenso, FinalitaConsenso, ISODate, RelazioneTutela, UUID } from './tipi';

export type EsitoConsenso = 'completo' | 'parziale' | 'assente';

/** La relazione è valida oggi e dà responsabilità genitoriale? */
export function relazioneAttiva(r: RelazioneTutela, oggi: ISODate): boolean {
  return r.responsabilita_genitoriale && r.valida_dal <= oggi && (r.valida_al === null || r.valida_al >= oggi);
}

/** Ultima dichiarazione per ogni tutore su una finalità (i consensi sono uno storico). */
export function consensiCorrenti(consensi: Consenso[], finalita: FinalitaConsenso): Map<UUID, Consenso> {
  const ultimi = new Map<UUID, Consenso>();
  for (const c of consensi) {
    if (c.finalita !== finalita) continue;
    const prec = ultimi.get(c.tutore_id);
    if (!prec || c.registrato_il > prec.registrato_il) ultimi.set(c.tutore_id, c);
  }
  return ultimi;
}

/**
 * Stessa regola della funzione SQL sicurezza.stato_consenso, usata dall'interfaccia
 * per mostrare l'avviso "manca il consenso dell'altro genitore".
 */
export function statoConsenso(
  relazioni: RelazioneTutela[],
  consensi: Consenso[],
  finalita: FinalitaConsenso,
  oggi: ISODate,
): EsitoConsenso {
  const aventiDiritto = relazioni.filter((r) => relazioneAttiva(r, oggi)).map((r) => r.tutore_id);
  const correnti = consensiCorrenti(consensi, finalita);
  const concessi = aventiDiritto.filter((id) => correnti.get(id)?.stato === 'concesso').length;
  if (concessi === 0) return 'assente';
  return concessi === aventiDiritto.length ? 'completo' : 'parziale';
}
